import { queryOne, queryMany, pool } from '../repositories/db';
import type { Server, ServerMember, ServerInvite, ServerBan, MemberResponse, InviteResponse, BanResponse, SentInviteResponse, UserInviteResponse } from '../types';
import { nanoid } from 'nanoid';
import { AppError } from './serverService';
import { supabase } from '../supabaseClient';
import { notifyClient } from './realtimeNotify';
import { assignSystemRoleToMember } from './roleSeedService';
import { getServerAccessContext, assertCapability, invalidateAccessContext, invalidateAccessContextForServer } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';
import { getServerPlan, getPlanLimits, emitLimitHit } from './planService';

// ── Yetki kontrol ──

async function requireRole(serverId: string, userId: string, minRole: 'owner' | 'admin' | 'mod'): Promise<string> {
  const member = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (!member) throw new AppError(403, 'Bu sunucunun üyesi değilsin');

  const hierarchy: Record<string, number> = { owner: 4, admin: 3, mod: 2, member: 1 };
  if ((hierarchy[member.role] ?? 0) < (hierarchy[minRole] ?? 0)) {
    throw new AppError(403, 'Bu işlem için yetkin yok');
  }
  return member.role;
}

// ── Sunucu güncelle ──

export async function updateServer(
  serverId: string,
  userId: string,
  updates: { name?: string; description?: string; slug?: string; isPublic?: boolean; joinPolicy?: string; capacity?: number; motto?: string; avatarUrl?: string }
): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Sunucu ayarlarını değiştirmek için yetkin yok');
  // Plan vb. değişiklik tüm members'ın flag'lerini etkiler — tüm cache invalidate.
  invalidateAccessContextForServer(serverId);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    const n = String(updates.name).trim();
    if (n.length < 3 || n.length > 15) throw new AppError(400, 'Sunucu adı 3-15 karakter olmalı');
    sets.push(`name = $${idx++}`); vals.push(n);
  }
  if (updates.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(updates.description); }
  if (updates.slug !== undefined) {
    const existing = await queryOne<{ id: string }>('SELECT id FROM servers WHERE slug = $1 AND id != $2', [updates.slug, serverId]);
    if (existing) throw new AppError(409, 'Bu adres zaten kullanılıyor');
    sets.push(`slug = $${idx++}`); vals.push(updates.slug);
  }
  if (updates.isPublic !== undefined) { sets.push(`is_public = $${idx++}`); vals.push(updates.isPublic); }
  if (updates.joinPolicy !== undefined) { sets.push(`join_policy = $${idx++}`); vals.push(updates.joinPolicy); }
  if (updates.capacity !== undefined) { sets.push(`capacity = $${idx++}`); vals.push(updates.capacity); }
  if (updates.motto !== undefined) { sets.push(`motto = $${idx++}`); vals.push(String(updates.motto).slice(0, 15)); }
  if (updates.avatarUrl !== undefined) { sets.push(`avatar_url = $${idx++}`); vals.push(updates.avatarUrl); }

  if (sets.length === 0) return;

  sets.push(`updated_at = now()`);
  vals.push(serverId);

  await pool.query(`UPDATE servers SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

  // short_name güncelle
  if (updates.name) {
    const words = updates.name.trim().split(/\s+/);
    const shortName = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : updates.name.slice(0, 2).toUpperCase();
    await pool.query('UPDATE servers SET short_name = $1 WHERE id = $2', [shortName, serverId]);
  }
}

// ── Üyeler ──

export async function listMembers(serverId: string, userId: string): Promise<MemberResponse[]> {
  await requireRole(serverId, userId, 'mod');
  const rows = await queryMany<ServerMember>(
    'SELECT * FROM server_members WHERE server_id = $1 ORDER BY joined_at ASC',
    [serverId]
  );

  // Supabase profiles'dan kullanıcı bilgilerini çek
  const userIds = rows.map(r => r.user_id);
  const profileMap = new Map<string, { name: string; first_name: string; last_name: string; avatar: string | null }>();
  if (userIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, name, first_name, last_name, avatar').in('id', userIds);
    if (data) data.forEach((p: { id: string; name: string; first_name: string; last_name: string; avatar: string | null }) => profileMap.set(p.id, p));
  }

  return rows.map(r => {
    const p = profileMap.get(r.user_id);
    return {
      userId: r.user_id,
      username: p?.name ?? '',
      firstName: p?.first_name ?? '',
      lastName: p?.last_name ?? '',
      avatar: p?.avatar ?? null,
      role: r.role,
      joinedAt: r.joined_at,
      isMuted: r.is_muted,
    };
  });
}

export async function kickMember(serverId: string, userId: string, targetUserId: string): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.MEMBER_KICK, 'Üye atmak için yetkin yok');
  if (userId === targetUserId) throw new AppError(400, 'Kendini atamazsın');

  const target = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, targetUserId]
  );
  if (!target) throw new AppError(404, 'Kullanıcı bu sunucuda değil');

  // Hierarchy: legacy baseRole üzerinden karşılaştır — mevcut semantiği koru.
  const hierarchy: Record<string, number> = { owner: 4, admin: 3, mod: 2, member: 1 };
  const callerRank = hierarchy[ctx.membership.baseRole ?? 'member'] ?? 0;
  if ((hierarchy[target.role] ?? 0) >= callerRank) {
    throw new AppError(403, 'Kendi seviyendeki veya üstündeki kullanıcıyı atamazsın');
  }

  await pool.query('DELETE FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, targetUserId]);
  await pool.query('UPDATE server_activity SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE server_id = $1', [serverId]);
  invalidateAccessContext(targetUserId, serverId);
  await logAction({
    serverId, actorId: userId, action: 'member.kick',
    resourceType: 'member', resourceId: targetUserId,
    metadata: { targetRole: target.role },
  });
}

export async function changeRole(serverId: string, userId: string, targetUserId: string, newRole: string): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.ROLE_MANAGE, 'Rol değiştirmek için yetkin yok');
  if (userId === targetUserId) throw new AppError(400, 'Kendi rolünü değiştiremezsin');
  if (newRole === 'owner') throw new AppError(400, 'Owner rolü atanamaz');
  if (!['admin', 'mod', 'member'].includes(newRole)) throw new AppError(400, 'Geçersiz rol');

  const target = await queryOne<{ id: string; role: string }>(
    'SELECT id, role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, targetUserId]
  );
  if (!target) throw new AppError(404, 'Kullanıcı bu sunucuda değil');

  await pool.query('UPDATE server_members SET role = $1 WHERE server_id = $2 AND user_id = $3', [newRole, serverId, targetUserId]);

  // member_roles'ı da senkronla: eski sistem rolünü kaldır, yeniyi ekle
  const legacyToSystem: Record<string, 'admin' | 'moderator' | 'member'> = { admin: 'admin', mod: 'moderator', member: 'member' };
  const targetSysRole = legacyToSystem[newRole];
  if (targetSysRole) {
    await pool.query(
      `DELETE FROM member_roles WHERE server_id = $1 AND user_id = $2
       AND role_id IN (SELECT id FROM roles WHERE server_id = $1 AND is_system = true)`,
      [serverId, targetUserId]
    );
    await assignSystemRoleToMember(pool, serverId, targetUserId, targetSysRole);
  }

  invalidateAccessContext(targetUserId, serverId);
  await logAction({
    serverId, actorId: userId, action: 'role.change',
    resourceType: 'member', resourceId: targetUserId,
    metadata: { from: target.role, to: newRole },
  });
}

// ── Banlar ──

export async function banMember(serverId: string, userId: string, targetUserId: string, reason: string): Promise<void> {
  const role = await requireRole(serverId, userId, 'mod');
  if (userId === targetUserId) throw new AppError(400, 'Kendini banlayamazsın');

  const target = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, targetUserId]
  );
  if (target) {
    const hierarchy: Record<string, number> = { owner: 4, admin: 3, mod: 2, member: 1 };
    if ((hierarchy[target.role] ?? 0) >= (hierarchy[role] ?? 0)) {
      throw new AppError(403, 'Kendi seviyendeki veya üstündeki kullanıcıyı banlayamazsın');
    }
  }

  // Önce kickle
  await pool.query('DELETE FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, targetUserId]);
  await pool.query('UPDATE server_activity SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE server_id = $1', [serverId]);

  // Ban kaydı
  await pool.query(
    `INSERT INTO server_bans (server_id, user_id, reason, banned_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, user_id) DO UPDATE SET reason = $3, banned_by = $4, created_at = now()`,
    [serverId, targetUserId, reason, userId]
  );
}

export async function listBans(serverId: string, userId: string): Promise<BanResponse[]> {
  await requireRole(serverId, userId, 'mod');
  const rows = await queryMany<ServerBan>(
    'SELECT * FROM server_bans WHERE server_id = $1 ORDER BY created_at DESC',
    [serverId]
  );
  return rows.map(r => ({
    userId: r.user_id,
    reason: r.reason,
    bannedBy: r.banned_by,
    createdAt: r.created_at,
  }));
}

export async function unbanMember(serverId: string, userId: string, targetUserId: string): Promise<void> {
  await requireRole(serverId, userId, 'mod');
  const result = await pool.query('DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2', [serverId, targetUserId]);
  if (result.rowCount === 0) throw new AppError(404, 'Ban kaydı bulunamadı');
}

/** Kullanıcıya sunucu daveti gönder */
export async function sendUserInvite(serverId: string, userId: string, targetUserId: string): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_CREATE, 'Davet göndermek için yetkin yok');

  // Zaten üye mi?
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, targetUserId]
  );
  if (existing) throw new AppError(409, 'Bu kullanıcı zaten sunucuda');

  // Banlı mı?
  const banned = await queryOne<{ id: string }>(
    'SELECT id FROM server_bans WHERE server_id = $1 AND user_id = $2',
    [serverId, targetUserId]
  );
  if (banned) throw new AppError(403, 'Bu kullanıcı sunucudan yasaklı');

  // Bekleyen davet var mı?
  const pending = await queryOne<{ id: string }>(
    "SELECT id FROM server_user_invites WHERE server_id = $1 AND invited_user_id = $2 AND status = 'pending'",
    [serverId, targetUserId]
  );
  if (pending) throw new AppError(409, 'Bu kullanıcıya zaten davet gönderilmiş');

  await pool.query(
    'INSERT INTO server_user_invites (server_id, invited_user_id, invited_by) VALUES ($1, $2, $3)',
    [serverId, targetUserId, userId]
  );

  // Realtime push — alıcının tüm aktif cihazlarına.
  void notifyClient(targetUserId, { type: 'invite:new', serverId });
  await logAction({
    serverId, actorId: userId, action: 'invite.create',
    resourceType: 'user-invite', resourceId: targetUserId,
  });
}

/** Sunucudan gönderilmiş bekleyen davetleri listele */
export async function listSentInvites(serverId: string, userId: string): Promise<SentInviteResponse[]> {
  await requireRole(serverId, userId, 'admin');
  const rows = await queryMany<{ id: string; invited_user_id: string; status: string; created_at: string }>(
    "SELECT id, invited_user_id, status, created_at FROM server_user_invites WHERE server_id = $1 AND status = 'pending' ORDER BY created_at DESC",
    [serverId]
  );

  // Profil bilgilerini çek
  const userIds = rows.map(r => r.invited_user_id);
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', userIds);
    if (data) data.forEach((p: { id: string; name: string }) => nameMap.set(p.id, p.name));
  }

  return rows.map(r => ({
    id: r.id,
    invitedUserId: r.invited_user_id,
    invitedUserName: nameMap.get(r.invited_user_id) ?? r.invited_user_id.slice(0, 8),
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Bekleyen daveti iptal et */
export async function cancelUserInvite(serverId: string, userId: string, inviteId: string): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_REVOKE, 'Daveti iptal etmek için yetkin yok');
  const target = await queryOne<{ invited_user_id: string }>(
    'SELECT invited_user_id FROM server_user_invites WHERE id = $1 AND server_id = $2',
    [inviteId, serverId]
  );
  const result = await pool.query(
    "UPDATE server_user_invites SET status = 'cancelled', responded_at = now() WHERE id = $1 AND server_id = $2 AND status = 'pending'",
    [inviteId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Davet bulunamadı');

  // Alıcının cihazlarında satır kaybolsun.
  if (target?.invited_user_id) {
    void notifyClient(target.invited_user_id, { type: 'invite:removed', inviteId, reason: 'cancelled' });
  }
}

/** Kullanıcının gelen davetlerini listele */
export async function listMyInvites(userId: string): Promise<UserInviteResponse[]> {
  const rows = await queryMany<{ id: string; server_id: string; invited_by: string; status: string; created_at: string }>(
    "SELECT id, server_id, invited_by, status, created_at FROM server_user_invites WHERE invited_user_id = $1 AND status = 'pending' ORDER BY created_at DESC",
    [userId]
  );

  if (rows.length === 0) return [];

  // Sunucu bilgileri
  const serverIds = rows.map(r => r.server_id);
  const serverMap = new Map<string, { name: string; avatar_url: string | null }>();
  const serverRows = await queryMany<{ id: string; name: string; avatar_url: string | null }>(
    'SELECT id, name, avatar_url FROM servers WHERE id = ANY($1::uuid[])',
    [serverIds]
  );
  serverRows.forEach(s => serverMap.set(s.id, s));

  // Davet eden profilleri
  const inviterIds = rows.map(r => r.invited_by);
  const inviterMap = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', inviterIds);
    if (data) data.forEach((p: { id: string; name: string }) => inviterMap.set(p.id, p.name));
  }

  return rows.map(r => {
    const srv = serverMap.get(r.server_id);
    return {
      id: r.id,
      serverId: r.server_id,
      serverName: srv?.name ?? 'Bilinmeyen',
      serverAvatar: srv?.avatar_url ?? null,
      invitedBy: r.invited_by,
      invitedByName: inviterMap.get(r.invited_by) ?? '',
      status: r.status,
      createdAt: r.created_at,
    };
  });
}

/** Daveti kabul et */
export async function acceptInvite(userId: string, inviteId: string): Promise<void> {
  const invite = await queryOne<{ server_id: string; invited_user_id: string; status: string }>(
    'SELECT server_id, invited_user_id, status FROM server_user_invites WHERE id = $1',
    [inviteId]
  );
  if (!invite) throw new AppError(404, 'Davet bulunamadı');
  if (invite.invited_user_id !== userId) throw new AppError(403, 'Bu davet sana ait değil');
  if (invite.status !== 'pending') throw new AppError(400, 'Bu davet artık geçerli değil');

  // Üye ekle
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
    [invite.server_id, userId]
  );
  if (!existing) {
    // Race overshoot guard: transactional + servers row FOR UPDATE.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const capRow = await client.query<{ member_count: number; capacity: number }>(
        `SELECT COALESCE(sa.member_count, 0) AS member_count, s.capacity
         FROM servers s LEFT JOIN server_activity sa ON sa.server_id = s.id
         WHERE s.id = $1 FOR UPDATE OF s`,
        [invite.server_id]
      );
      const c = capRow.rows[0];
      if (c) {
        const plan = await getServerPlan(invite.server_id);
        const maxMembers = getPlanLimits(plan).maxMembers;
        const effectiveLimit = Math.min(c.capacity, maxMembers);
        if (c.member_count >= effectiveLimit) {
          await client.query('ROLLBACK');
          await emitLimitHit(invite.server_id, userId, 'server.join', plan, c.member_count, effectiveLimit);
          throw new AppError(403, 'Sunucu kapasitesi dolu');
        }
      }
      await client.query(
        'INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)',
        [invite.server_id, userId, 'member']
      );
      await client.query(
        'UPDATE server_activity SET member_count = member_count + 1, updated_at = now() WHERE server_id = $1',
        [invite.server_id]
      );
      await assignSystemRoleToMember(client, invite.server_id, userId, 'member');
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* no-op */ }
      throw err instanceof AppError ? err : new AppError(500, 'Davet kabul edilemedi');
    } finally {
      client.release();
    }
    invalidateAccessContext(userId, invite.server_id);
  }

  await pool.query("UPDATE server_user_invites SET status = 'accepted', responded_at = now() WHERE id = $1", [inviteId]);

  // Multi-device sync — bu kullanıcının diğer cihazlarında invite satırı kaybolsun.
  void notifyClient(userId, { type: 'invite:removed', inviteId, reason: 'accepted' });
}

/** Daveti reddet */
export async function declineInvite(userId: string, inviteId: string): Promise<void> {
  const invite = await queryOne<{ invited_user_id: string; status: string }>(
    'SELECT invited_user_id, status FROM server_user_invites WHERE id = $1',
    [inviteId]
  );
  if (!invite) throw new AppError(404, 'Davet bulunamadı');
  if (invite.invited_user_id !== userId) throw new AppError(403, 'Bu davet sana ait değil');
  if (invite.status !== 'pending') throw new AppError(400, 'Bu davet artık geçerli değil');

  await pool.query("UPDATE server_user_invites SET status = 'declined', responded_at = now() WHERE id = $1", [inviteId]);

  // Multi-device sync — diğer cihazlarda da satır kaybolsun.
  void notifyClient(userId, { type: 'invite:removed', inviteId, reason: 'declined' });
}

// ── Davetler ──

export async function listInvites(serverId: string, userId: string): Promise<InviteResponse[]> {
  await requireRole(serverId, userId, 'mod');
  const rows = await queryMany<ServerInvite>(
    'SELECT * FROM server_invites WHERE server_id = $1 ORDER BY created_at DESC',
    [serverId]
  );
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    createdBy: r.created_by_user_id,
    maxUses: r.max_uses,
    usedCount: r.used_count,
    expiresAt: r.expires_at,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}

export async function createInvite(
  serverId: string,
  userId: string,
  maxUses: number | null,
  expiresInHours: number | null
): Promise<InviteResponse> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_CREATE, 'Davet kodu oluşturmak için yetkin yok');

  const code = nanoid(8).toUpperCase();
  const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600000).toISOString() : null;

  const { rows: [invite] } = await pool.query<ServerInvite>(
    `INSERT INTO server_invites (server_id, code, created_by_user_id, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [serverId, code, userId, maxUses, expiresAt]
  );

  return {
    id: invite.id,
    code: invite.code,
    createdBy: invite.created_by_user_id,
    maxUses: invite.max_uses,
    usedCount: invite.used_count,
    expiresAt: invite.expires_at,
    isActive: invite.is_active,
    createdAt: invite.created_at,
  };
}

export async function deleteInvite(serverId: string, userId: string, inviteId: string): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.INVITE_REVOKE, 'Davet silmek için yetkin yok');
  const result = await pool.query(
    'DELETE FROM server_invites WHERE id = $1 AND server_id = $2',
    [inviteId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Davet bulunamadı');
  await logAction({
    serverId, actorId: userId, action: 'invite.revoke',
    resourceType: 'invite', resourceId: inviteId,
  });
}
