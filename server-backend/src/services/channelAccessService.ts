import { queryMany, queryOne, pool } from '../repositories/db';
import { AppError } from './serverService';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';
import { fetchProfileNameMap } from './profileLookupService';

const MANAGE_ROLES = new Set(['owner', 'admin']);

export interface ChannelAccessRow {
  channel_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
}

export interface ChannelAccessEntry {
  userId: string;
  userName: string;
  grantedBy: string;
  createdAt: string;
}

export interface ChannelAccessSummary {
  canSee: boolean;
  canJoin: boolean;
  reason: 'public' | 'server-admin' | 'channel-owner' | 'granted' | 'hidden' | 'invite-only' | 'not-member' | 'not-found' | 'server-banned' | 'timed-out';
}

async function isServerBanned(serverId: string): Promise<boolean> {
  const row = await queryOne<{ is_banned: boolean }>(
    'SELECT is_banned FROM servers WHERE id = $1',
    [serverId],
  );
  return !!row?.is_banned;
}

async function fetchChannel(serverId: string, channelId: string): Promise<{ id: string; server_id: string; owner_id: string | null; is_hidden: boolean; is_invite_only: boolean } | null> {
  return queryOne<{ id: string; server_id: string; owner_id: string | null; is_hidden: boolean; is_invite_only: boolean }>(
    'SELECT id, server_id, owner_id, is_hidden, is_invite_only FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
}

async function fetchMemberRole(serverId: string, userId: string): Promise<string | null> {
  const m = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  return m?.role ?? null;
}

/** Role + aktif timeout — evaluateChannelAccess için tek query. */
async function fetchMemberState(serverId: string, userId: string): Promise<{ role: string; isTimedOut: boolean } | null> {
  const m = await queryOne<{ role: string; timeout_until: string | null }>(
    'SELECT role, timeout_until FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (!m) return null;
  const isTimedOut = !!m.timeout_until && new Date(m.timeout_until).getTime() > Date.now();
  return { role: m.role, isTimedOut };
}

async function hasGrant(channelId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ channel_id: string }>(
    'SELECT channel_id FROM channel_access WHERE channel_id = $1 AND user_id = $2',
    [channelId, userId]
  );
  return !!row;
}

/** Canonical access check — tek yerden kullanılır (list filtresi + join). */
export async function evaluateChannelAccess(
  serverId: string,
  channelId: string,
  userId: string,
): Promise<ChannelAccessSummary> {
  const channel = await fetchChannel(serverId, channelId);
  if (!channel) return { canSee: false, canJoin: false, reason: 'not-found' };

  const state = await fetchMemberState(serverId, userId);
  if (!state) return { canSee: false, canJoin: false, reason: 'not-member' };
  const role = state.role;

  // Restricted mode: sunucu banlıysa kanalı görebilir ama join edemez.
  // Sistem yönetici override'ı YOK; sistem admini de aynı kuralı uygular
  // (zaten /admin route'larını kullanır).
  if (await isServerBanned(serverId)) {
    return { canSee: true, canJoin: false, reason: 'server-banned' };
  }

  // Timeout: kullanıcı kanalı görebilir ama join edemez (mesaj + voice gate).
  // Moderatör/admin/owner rolü olsa bile timeout aktifse join kapalı — hierarchy guard:
  // owner zaten timeout edilemez (managementService kontrol ediyor).
  if (state.isTimedOut) {
    return { canSee: true, canJoin: false, reason: 'timed-out' };
  }

  if (MANAGE_ROLES.has(role)) {
    return { canSee: true, canJoin: true, reason: 'server-admin' };
  }
  if (channel.owner_id && channel.owner_id === userId) {
    return { canSee: true, canJoin: true, reason: 'channel-owner' };
  }

  const granted = await hasGrant(channel.id, userId);
  if (granted) return { canSee: true, canJoin: true, reason: 'granted' };

  if (channel.is_hidden) return { canSee: false, canJoin: false, reason: 'hidden' };
  if (channel.is_invite_only) return { canSee: true, canJoin: false, reason: 'invite-only' };

  return { canSee: true, canJoin: true, reason: 'public' };
}

/** Liste filtresi için toplu lookup: kullanıcı için her bir channelId hangi rule'a düşer. */
export async function filterVisibleChannels(
  serverId: string,
  userId: string,
  channelIds: string[],
): Promise<Set<string>> {
  if (channelIds.length === 0) return new Set();
  const role = await fetchMemberRole(serverId, userId);
  if (!role) return new Set();
  if (MANAGE_ROLES.has(role)) return new Set(channelIds);

  // channelOwner + granted bilgilerini tek sorguda topla
  const rows = await queryMany<{ id: string; owner_id: string | null; is_hidden: boolean; granted: boolean }>(
    `SELECT c.id, c.owner_id, c.is_hidden,
            EXISTS (SELECT 1 FROM channel_access ca WHERE ca.channel_id = c.id AND ca.user_id = $2) AS granted
     FROM channels c
     WHERE c.server_id = $1 AND c.id = ANY($3::text[])`,
    [serverId, userId, channelIds]
  );

  const visible = new Set<string>();
  for (const r of rows) {
    const isOwner = r.owner_id === userId;
    if (r.is_hidden) {
      if (isOwner || r.granted) visible.add(r.id);
    } else {
      visible.add(r.id);
    }
  }
  return visible;
}

export interface AccessListResult {
  entries: ChannelAccessEntry[];
}

export async function listChannelAccess(
  serverId: string,
  channelId: string,
  callerId: string,
): Promise<AccessListResult> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_UPDATE, 'Kanal erişim listesini görmek için yetkin yok');
  const channel = await fetchChannel(serverId, channelId);
  if (!channel) throw new AppError(404, 'Kanal bulunamadı');

  const rows = await queryMany<ChannelAccessRow>(
    'SELECT channel_id, user_id, granted_by, created_at::text FROM channel_access WHERE channel_id = $1 ORDER BY created_at ASC',
    [channelId]
  );
  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const nameMap = await fetchProfileNameMap(userIds);
  const entries = rows.map(r => ({
    userId: r.user_id,
    userName: nameMap.get(r.user_id) ?? r.user_id.slice(0, 8),
    grantedBy: r.granted_by,
    createdAt: r.created_at,
  }));
  return { entries };
}

export async function grantChannelAccess(
  serverId: string,
  channelId: string,
  callerId: string,
  targetUserId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_UPDATE, 'Kanal erişimi yönetmek için yetkin yok');
  const channel = await fetchChannel(serverId, channelId);
  if (!channel) throw new AppError(404, 'Kanal bulunamadı');
  if (!channel.is_hidden && !channel.is_invite_only) {
    throw new AppError(400, 'Bu kanal özel değil, erişim atanamaz');
  }

  const targetMember = await fetchMemberRole(serverId, targetUserId);
  if (!targetMember) throw new AppError(400, 'Kullanıcı bu sunucunun üyesi değil');

  await pool.query(
    `INSERT INTO channel_access (channel_id, user_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_id, user_id) DO NOTHING`,
    [channelId, targetUserId, callerId]
  );
  await logAction({
    serverId, actorId: callerId, action: 'channel.access.grant',
    resourceType: 'channel', resourceId: channelId,
    metadata: { targetUserId },
  });
}

export async function revokeChannelAccess(
  serverId: string,
  channelId: string,
  callerId: string,
  targetUserId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_UPDATE, 'Kanal erişimi yönetmek için yetkin yok');
  const channel = await fetchChannel(serverId, channelId);
  if (!channel) throw new AppError(404, 'Kanal bulunamadı');

  await pool.query(
    'DELETE FROM channel_access WHERE channel_id = $1 AND user_id = $2',
    [channelId, targetUserId]
  );
  await logAction({
    serverId, actorId: callerId, action: 'channel.access.revoke',
    resourceType: 'channel', resourceId: channelId,
    metadata: { targetUserId },
  });
}
