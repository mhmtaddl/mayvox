/**
 * Server join request service — invite-only sunucular için başvuru akışı.
 *
 * Davranış:
 *  - Kullanıcı `createJoinRequest` → pending başvuru (duplicate pending engelli via UNIQUE partial index)
 *  - Admin `listPendingRequests` / `listAllRequests` → Başvurular sekmesi
 *  - Admin `acceptRequest` → membership create + status='accepted'
 *  - Admin `rejectRequest` → status='rejected' (membership yok)
 *
 * Yetki: SERVER_MANAGE capability → admin/owner. Normal üye başvuru listesi göremez.
 */

import { queryOne, queryMany, pool } from '../repositories/db';
import { supabase } from '../supabaseClient';
import { AppError } from './serverService';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';
import { assignSystemRoleToMember } from './roleSeedService';
import { notifyClient } from './realtimeNotify';

export interface JoinRequestRow {
  id: string;
  server_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface JoinRequestListItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
}

// ── Create ──────────────────────────────────────────────────────────────
/**
 * Kullanıcı başvuru gönderir.
 * Ön koşullar: sunucu var, kullanıcı banlı değil, zaten üye değil, join_policy invite-only.
 * Duplicate pending → 409 (UNIQUE partial index sayesinde DB seviyesinde de korunur).
 */
export async function createJoinRequest(userId: string, serverId: string): Promise<void> {
  const server = await queryOne<{ id: string; is_public: boolean; join_policy: string }>(
    'SELECT id, is_public, join_policy FROM servers WHERE id = $1',
    [serverId]
  );
  if (!server) throw new AppError(404, 'Sunucu bulunamadı');

  // Public+open sunucu → başvuru gereksiz; direkt katıl.
  if (server.is_public === true && server.join_policy === 'open') {
    throw new AppError(400, 'Bu sunucuya başvuru gerekmez, direkt katılabilirsin');
  }

  // Banlı mı?
  const banned = await queryOne<{ id: string }>(
    'SELECT id FROM server_bans WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (banned) throw new AppError(403, 'Bu sunucuya erişimin kısıtlanmış');

  // Zaten üye mi?
  const member = await queryOne<{ id: string }>(
    'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (member) throw new AppError(409, 'Zaten bu sunucunun üyesisin');

  try {
    await pool.query(
      `INSERT INTO server_join_requests (server_id, user_id, status) VALUES ($1, $2, 'pending')`,
      [serverId, userId]
    );
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      throw new AppError(409, 'Bu sunucu için zaten bekleyen bir başvurun var');
    }
    throw err;
  }

  await logAction({
    serverId, actorId: userId, action: 'join_request.create',
    resourceType: 'join_request', resourceId: serverId,
    metadata: {},
  });

  // Admin/owner kullanıcılara fire-and-forget push — notification v3 merkezi
  // policy engine tüketir (type=server:join_request:new).
  try {
    const admins = await queryMany<{ user_id: string }>(
      `SELECT user_id FROM server_members WHERE server_id = $1 AND role IN ('owner','admin')`,
      [serverId]
    );
    for (const a of admins) {
      void notifyClient(a.user_id, { type: 'server:join_request:new', serverId, requesterId: userId });
    }
  } catch { /* no-op: notification fatal değil */ }
}

// ── List ────────────────────────────────────────────────────────────────

export async function listJoinRequests(
  serverId: string,
  callerId: string,
  opts?: { includeHistory?: boolean },
): Promise<JoinRequestListItem[]> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Başvuruları görmek için yetkin yok');

  const statusFilter = opts?.includeHistory
    ? `(status = 'pending' OR status = 'accepted' OR status = 'rejected')`
    : `status = 'pending'`;

  const rows = await queryMany<JoinRequestRow>(
    `SELECT * FROM server_join_requests
     WHERE server_id = $1 AND ${statusFilter}
     ORDER BY (status = 'pending') DESC, created_at DESC
     LIMIT 100`,
    [serverId]
  );

  // Supabase profiles enrichment (batch)
  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const nameMap = new Map<string, { name: string; avatar: string | null }>();
  if (userIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, name, display_name, first_name, last_name, avatar').in('id', userIds);
    if (data) {
      for (const p of data as Array<{ id: string; name: string | null; display_name: string | null; first_name: string | null; last_name: string | null; avatar: string | null }>) {
        const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        nameMap.set(p.id, { name: p.display_name || full || p.name || '', avatar: p.avatar ?? null });
      }
    }
  }

  return rows.map(r => {
    const p = nameMap.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      userName: p?.name ?? r.user_id.slice(0, 8),
      userAvatar: p?.avatar ?? null,
      status: r.status,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    };
  });
}

// ── Pending count (rozet için) ─────────────────────────────────────────

export async function countPendingRequests(serverId: string, callerId: string): Promise<number> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Başvuru sayısını görmek için yetkin yok');
  const row = await queryOne<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM server_join_requests WHERE server_id = $1 AND status = 'pending'`,
    [serverId]
  );
  return parseInt(row?.c ?? '0', 10);
}

/**
 * Çağıran kullanıcının owner/admin olduğu TÜM sunucularda bekleyen başvuruları özetler.
 * Çan (notification center) için tek-atımlık toplam + sunucu dağılımı dönmek amacıyla.
 */
export interface MyPendingSummaryItem { serverId: string; serverName: string; serverAvatar: string | null; pendingCount: number; }
export async function listMyPendingRequestsSummary(callerId: string): Promise<MyPendingSummaryItem[]> {
  const rows = await queryMany<{ server_id: string; server_name: string; server_avatar: string | null; pending_count: string }>(
    `SELECT s.id AS server_id, s.name AS server_name, s.avatar_url AS server_avatar,
            COUNT(jr.id) FILTER (WHERE jr.status = 'pending')::text AS pending_count
     FROM server_members sm
     JOIN servers s ON s.id = sm.server_id
     LEFT JOIN server_join_requests jr ON jr.server_id = s.id
     WHERE sm.user_id = $1 AND sm.role IN ('owner','admin')
     GROUP BY s.id, s.name, s.avatar_url
     HAVING COUNT(jr.id) FILTER (WHERE jr.status = 'pending') > 0
     ORDER BY pending_count DESC
     LIMIT 50`,
    [callerId]
  );
  return rows.map(r => ({
    serverId: r.server_id,
    serverName: r.server_name,
    serverAvatar: r.server_avatar,
    pendingCount: parseInt(r.pending_count ?? '0', 10),
  }));
}

// ── Accept ─────────────────────────────────────────────────────────────

export async function acceptJoinRequest(
  serverId: string,
  callerId: string,
  requestId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Başvuru kabul etmek için yetkin yok');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<JoinRequestRow>(
      `SELECT * FROM server_join_requests WHERE id = $1 AND server_id = $2 FOR UPDATE`,
      [requestId, serverId]
    );
    const req = rows[0];
    if (!req) { await client.query('ROLLBACK'); throw new AppError(404, 'Başvuru bulunamadı'); }
    if (req.status !== 'pending') {
      await client.query('ROLLBACK');
      throw new AppError(409, 'Başvuru zaten işlenmiş');
    }

    // Zaten üyeyse idempotent
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
      [serverId, req.user_id]
    );
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'member')`,
        [serverId, req.user_id]
      );
      await client.query(
        `UPDATE server_activity SET member_count = member_count + 1, updated_at = now() WHERE server_id = $1`,
        [serverId]
      );
      await assignSystemRoleToMember(client, serverId, req.user_id, 'member');
    }

    await client.query(
      `UPDATE server_join_requests SET status = 'accepted', reviewed_at = now(), reviewed_by = $1 WHERE id = $2`,
      [callerId, requestId]
    );

    await logAction({
      serverId, actorId: callerId, action: 'join_request.accept',
      resourceType: 'join_request', resourceId: requestId,
      metadata: { targetUserId: req.user_id },
    }, client);

    await client.query('COMMIT');

    // Commit sonrası fire-and-forget: başvuran kullanıcıya "kabul edildin" push'u.
    void notifyClient(req.user_id, { type: 'server:join_request:accepted', serverId });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    throw err instanceof AppError ? err : new AppError(500, 'Başvuru kabul edilemedi');
  } finally {
    client.release();
  }
}

// ── Reject ─────────────────────────────────────────────────────────────

export async function rejectJoinRequest(
  serverId: string,
  callerId: string,
  requestId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Başvuru reddetmek için yetkin yok');

  const result = await pool.query<{ user_id: string }>(
    `UPDATE server_join_requests
       SET status = 'rejected', reviewed_at = now(), reviewed_by = $1
     WHERE id = $2 AND server_id = $3 AND status = 'pending'
     RETURNING user_id`,
    [callerId, requestId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Başvuru bulunamadı veya zaten işlenmiş');

  await logAction({
    serverId, actorId: callerId, action: 'join_request.reject',
    resourceType: 'join_request', resourceId: requestId,
    metadata: {},
  });

  const targetUserId = result.rows[0]?.user_id;
  if (targetUserId) {
    void notifyClient(targetUserId, { type: 'server:join_request:rejected', serverId });
  }
}
