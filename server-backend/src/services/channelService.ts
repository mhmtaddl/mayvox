import { queryMany, queryOne, pool } from '../repositories/db';
import type { Channel, ChannelResponse } from '../types';
import { AppError } from './serverService';
import { filterVisibleChannels } from './channelAccessService';
import { getServerAccessContext, assertCapability, invalidateAccessContextForServer } from './accessContextService';
import { invalidateServerOverview } from './serverOverviewService';
import { CAPABILITIES } from '../capabilities';
import { logAction } from './auditLogService';
import { assertLimit, FEATURE_FLAGS } from './planService';
import { broadcastChannelUpdate } from './channelBroadcast';

// ── Sabitler ──
const NAME_MIN = 1;
const NAME_MAX = 30;
const MAX_USERS_MIN = 2;
// Canonical plan max (Ultra nonPersistentRoomCapacity) = 60. Plan-bazlı per-room
// type enforcement future-use. Bugünlük tek sabit cap yeterli.
const MAX_USERS_MAX = 60;
const ALLOWED_MODES = new Set(['social', 'gaming', 'broadcast', 'quiet']);
const ALLOWED_ICON_NAMES = new Set([
  'coffee', 'gamepad', 'radio', 'quiet', 'users', 'party',
  'message', 'crosshair', 'target', 'swords', 'shield', 'bomb', 'trophy',
  'userPlus', 'music', 'headphones', 'monitor', 'zap', 'crown', 'flame',
  'rocket', 'tank', 'radar', 'gem', 'bot', 'cpu',
]);

export interface ChannelCreateInput {
  name: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
  iconName?: string | null;
  iconColor?: string | null;
  /** Yeni modelde kullanıcı kalıcı oda oluşturuyorsa true.
   *  Şu an planlarda maxNonPersistent=0 olduğundan DEFAULT true (backward compat).
   *  Future: CreateRoomModal'dan açık boolean gelir. */
  isPersistent?: boolean;
}

export interface ChannelUpdateInput {
  name?: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
  iconName?: string | null;
  iconColor?: string | null;
}

function toResponse(ch: Channel): ChannelResponse {
  return {
    id: ch.id,
    serverId: ch.server_id,
    name: ch.name,
    description: ch.description,
    type: ch.type,
    position: ch.position,
    isDefault: ch.is_default,
    isPersistent: ch.is_persistent,
    ownerId: ch.owner_id,
    maxUsers: ch.max_users,
    isInviteOnly: ch.is_invite_only,
    isHidden: ch.is_hidden,
    mode: ch.mode,
    iconName: ch.icon_name,
    iconColor: ch.icon_color,
    createdAt: ch.created_at,
    updatedAt: ch.updated_at,
  };
}

function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') throw new AppError(400, 'Kanal adı gerekli');
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < NAME_MIN) throw new AppError(400, 'Kanal adı boş olamaz');
  if (trimmed.length > NAME_MAX) throw new AppError(400, `Kanal adı en fazla ${NAME_MAX} karakter olabilir`);
  return trimmed;
}

function normalizeMode(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError(400, 'Geçersiz kanal modu');
  if (!ALLOWED_MODES.has(raw)) throw new AppError(400, 'Geçersiz kanal modu');
  return raw;
}

function normalizeMaxUsers(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === 0) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new AppError(400, 'Kullanıcı limiti geçersiz');
  if (n < MAX_USERS_MIN || n > MAX_USERS_MAX) {
    throw new AppError(400, `Kullanıcı limiti ${MAX_USERS_MIN}-${MAX_USERS_MAX} arası olmalı`);
  }
  return n;
}

function normalizeIconName(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError(400, 'Geçersiz kanal ikonu');
  if (!ALLOWED_ICON_NAMES.has(raw)) throw new AppError(400, 'Geçersiz kanal ikonu');
  return raw;
}

function normalizeIconColor(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw)) {
    throw new AppError(400, 'Geçersiz kanal rengi');
  }
  return raw;
}

// requireManageRole legacy helper kaldırıldı — capability resolver + assertCapability kullanılıyor.

export interface ChannelListResult {
  channels: ChannelResponse[];
  orderToken: string | null;
}

/** Sunucunun güncel sıralama token'ı — reorder concurrency guard için. */
async function fetchOrderToken(serverId: string): Promise<string | null> {
  const row = await queryOne<{ max_ts: string | null }>(
    'SELECT MAX(updated_at)::text AS max_ts FROM channels WHERE server_id = $1',
    [serverId]
  );
  return row?.max_ts ?? null;
}

/** Sunucunun kanallarını listele — görünürlük filtresi (hidden + grants) + token. */
export async function listChannels(serverId: string, userId: string): Promise<ChannelListResult> {
  const member = await queryOne<{ id: string }>(
    'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (!member) return { channels: [], orderToken: null };

  const rows = await queryMany<Channel>(
    'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC, created_at ASC',
    [serverId]
  );

  // Server-side visibility filter — hidden kanallar unauthorized için filtrelenir.
  const allIds = rows.map(r => r.id);
  const visible = await filterVisibleChannels(serverId, userId, allIds);
  const filtered = rows.filter(r => visible.has(r.id));

  const orderToken = await fetchOrderToken(serverId);
  return { channels: filtered.map(toResponse), orderToken };
}

/** Kanal oluştur */
export async function createChannel(
  serverId: string,
  userId: string,
  input: ChannelCreateInput,
): Promise<ChannelResponse> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_CREATE, 'Kanal oluşturmak için yetkin yok');

  // "Oda Kalıcılığı" toggle opt-in: frontend açık true, kapalı false.
  // Undefined gelirse temp varsayılır (backward-compat eski caller'lar için).
  // Feature flag kapalıysa false'u true'ya yükseltiriz (non-persistent disabled).
  const requestedPersistent = input.isPersistent === true;
  const isPersistent = requestedPersistent || !FEATURE_FLAGS.nonPersistentRoomsEnabled;

  // Plan enforcement — tek source of truth: assertLimit (canlı COUNT).
  if (isPersistent) {
    await assertLimit(serverId, 'persistentRoom.create', userId);
  }
  // Toplam oda defense-in-depth (systemRooms + extraPersistent + nonPersistent)
  await assertLimit(serverId, 'room.create', userId);

  const name = normalizeName(input.name);
  const mode = normalizeMode(input.mode);
  const maxUsers = normalizeMaxUsers(input.maxUsers);
  const isInviteOnly = !!input.isInviteOnly;
  const isHidden = !!input.isHidden;
  const description = typeof input.description === 'string' ? input.description.slice(0, 200) : '';
  const iconName = normalizeIconName(input.iconName);
  const iconColor = normalizeIconColor(input.iconColor);

  // Pozisyon: mevcut max + 1
  const posRow = await queryOne<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM channels WHERE server_id = $1',
    [serverId]
  );
  const nextPosition = (posRow?.max_pos ?? -1) + 1;

  const row = await queryOne<Channel>(
    `INSERT INTO channels (server_id, name, description, type, position, is_default, is_persistent, owner_id, max_users, is_invite_only, is_hidden, mode, icon_name, icon_color)
     VALUES ($1, $2, $3, 'voice', $4, false, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [serverId, name, description, nextPosition, isPersistent, userId, maxUsers, isInviteOnly, isHidden, mode, iconName, iconColor]
  );
  if (!row) throw new AppError(500, 'Kanal oluşturulamadı');

  // channel_count değişti → flag hesabı etkilenir, cache'i server-wide invalidate et.
  invalidateAccessContextForServer(serverId);
  invalidateServerOverview(serverId);
  await logAction({
    serverId, actorId: userId, action: 'channel.create',
    resourceType: 'channel', resourceId: row.id,
    metadata: { name: row.name, isInviteOnly, isHidden, isPersistent },
  });
  const response = toResponse(row);
  void broadcastChannelUpdate({ action: 'create', serverId, channel: response });
  return response;
}

/** Kanal güncelle */
export async function updateChannel(
  serverId: string,
  userId: string,
  channelId: string,
  input: ChannelUpdateInput,
): Promise<ChannelResponse> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_UPDATE, 'Kanal güncellemek için yetkin yok');

  const existing = await queryOne<Channel>(
    'SELECT * FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
  if (!existing) throw new AppError(404, 'Kanal bulunamadı');

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${i++}`); values.push(normalizeName(input.name));
  }
  if (input.mode !== undefined) {
    sets.push(`mode = $${i++}`); values.push(normalizeMode(input.mode));
  }
  if (input.maxUsers !== undefined) {
    sets.push(`max_users = $${i++}`); values.push(normalizeMaxUsers(input.maxUsers));
  }
  if (input.isInviteOnly !== undefined) {
    sets.push(`is_invite_only = $${i++}`); values.push(!!input.isInviteOnly);
  }
  if (input.isHidden !== undefined) {
    sets.push(`is_hidden = $${i++}`); values.push(!!input.isHidden);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${i++}`);
    values.push(typeof input.description === 'string' ? input.description.slice(0, 200) : '');
  }
  if (input.iconName !== undefined) {
    sets.push(`icon_name = $${i++}`); values.push(normalizeIconName(input.iconName));
  }
  if (input.iconColor !== undefined) {
    sets.push(`icon_color = $${i++}`); values.push(normalizeIconColor(input.iconColor));
  }

  if (sets.length === 0) return toResponse(existing);

  sets.push(`updated_at = now()`);
  values.push(channelId, serverId);

  const sql = `UPDATE channels SET ${sets.join(', ')} WHERE id = $${i++} AND server_id = $${i++} RETURNING *`;
  const row = await queryOne<Channel>(sql, values);
  if (!row) throw new AppError(500, 'Kanal güncellenemedi');
  await logAction({
    serverId, actorId: userId, action: 'channel.update',
    resourceType: 'channel', resourceId: row.id,
    metadata: { changed: Object.keys(input) },
  });
  // Visibility değişebilir → overview private/public sayımları stale olmasın.
  invalidateServerOverview(serverId);
  const response = toResponse(row);
  void broadcastChannelUpdate({
    action: 'update',
    serverId,
    channelId: row.id,
    updates: response,
  });
  return response;
}

/** Kanal sıralamasını toplu güncelle — tek SQL (unnest), transactional, optimistic concurrency. */
export async function reorderChannels(
  serverId: string,
  userId: string,
  updates: Array<{ id: string; position: number }>,
  expectedOrderToken: string | null,
): Promise<ChannelListResult> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_REORDER, 'Kanal sıralamak için yetkin yok');

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new AppError(400, 'Sıralama boş olamaz');
  }
  const seenIds = new Set<string>();
  const seenPos = new Set<number>();
  for (const u of updates) {
    if (!u || typeof u.id !== 'string' || typeof u.position !== 'number') {
      throw new AppError(400, 'Geçersiz sıralama verisi');
    }
    if (!Number.isInteger(u.position) || u.position < 0) {
      throw new AppError(400, 'Geçersiz pozisyon');
    }
    if (seenIds.has(u.id)) throw new AppError(400, 'Yinelenen kanal');
    if (seenPos.has(u.position)) throw new AppError(400, 'Yinelenen pozisyon');
    seenIds.add(u.id); seenPos.add(u.position);
  }

  const ids = updates.map(u => u.id);
  const positions = updates.map(u => u.position);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Optimistic concurrency: önce server kanallarını kilitle, sonra aggregate token hesapla.
    // Postgres aggregate SELECT ile FOR UPDATE birlikte kullanılamaz.
    await client.query(
      'SELECT id FROM channels WHERE server_id = $1 FOR UPDATE',
      [serverId],
    );
    const freshRow = await client.query<{ max_ts: string | null }>(
      'SELECT MAX(updated_at)::text AS max_ts FROM channels WHERE server_id = $1',
      [serverId],
    );
    const currentToken = freshRow.rows[0]?.max_ts ?? null;
    if (expectedOrderToken !== null && currentToken !== expectedOrderToken) {
      await client.query('ROLLBACK');
      throw new AppError(409, 'Kanal sırası başka bir yönetici tarafından değiştirildi. Liste yenilendi.');
    }

    // Tüm id'ler bu sunucuya mı ait? Tek query ile doğrula.
    const ownerCheck = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM channels WHERE server_id = $1 AND id = ANY($2::uuid[])',
      [serverId, ids]
    );
    if (parseInt(ownerCheck.rows[0]?.count ?? '0', 10) !== ids.length) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Bu sunucuya ait olmayan kanal var');
    }

    // Tek bulk UPDATE: unnest ile array'leri satırlara aç, JOIN yerine FROM klozu kullan.
    await client.query(
      `UPDATE channels AS c
       SET position = v.position, updated_at = now()
       FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS position) AS v
       WHERE c.id = v.id AND c.server_id = $3`,
      [ids, positions, serverId]
    );

    // Audit log aynı transaction içinde — fail olursa ROLLBACK ile reorder da iptal.
    await logAction({
      serverId, actorId: userId, action: 'channel.reorder',
      resourceType: 'server', resourceId: serverId,
      metadata: { count: updates.length },
    }, client);

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    if (!(err instanceof AppError)) {
      console.error('[channel.reorder] transaction failed', {
        serverId,
        userId,
        updatesCount: updates.length,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
    throw err instanceof AppError ? err : new AppError(500, 'Sıralama kaydedilemedi');
  } finally {
    client.release();
  }

  const rows = await queryMany<Channel>(
    'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC, created_at ASC',
    [serverId]
  );
  const orderToken = await fetchOrderToken(serverId);
  const result = { channels: rows.map(toResponse), orderToken };
  void broadcastChannelUpdate({ action: 'reorder', serverId, updates, orderToken, timestamp: Date.now() });
  return result;
}

/** Kanal sil — varsayılan (sistem) kanallar silinemez */
export async function deleteChannel(
  serverId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertCapability(ctx, CAPABILITIES.CHANNEL_DELETE, 'Kanal silmek için yetkin yok');

  const existing = await queryOne<{ is_default: boolean; name: string }>(
    'SELECT is_default, name FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
  if (!existing) throw new AppError(404, 'Kanal bulunamadı');
  if (existing.is_default) throw new AppError(403, 'Sistem kanalları silinemez');
  // Task #18 defense-in-depth: is_default drift olursa bile isim bazlı koruma.
  const SYSTEM_ROOM_NAMES = new Set(['Sohbet Muhabbet', 'Oyun Takımı', 'Yayın Sahnesi', 'Sessiz Alan']);
  if (SYSTEM_ROOM_NAMES.has(existing.name)) {
    throw new AppError(403, 'Sistem kanalları silinemez');
  }

  const result = await pool.query(
    'DELETE FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Kanal bulunamadı');
  invalidateAccessContextForServer(serverId);
  invalidateServerOverview(serverId);
  await logAction({
    serverId, actorId: userId, action: 'channel.delete',
    resourceType: 'channel', resourceId: channelId,
    metadata: { name: existing.name },
  });
  void broadcastChannelUpdate({ action: 'delete', serverId, channelId });
}
