import { queryMany, queryOne, pool } from '../repositories/db';
import type { Channel, ChannelResponse } from '../types';
import { AppError } from './serverService';
import { filterVisibleChannels } from './channelAccessService';

// ── Sabitler ──
const NAME_MIN = 1;
const NAME_MAX = 30;
const MAX_USERS_MIN = 2;
const MAX_USERS_MAX = 50;
const ALLOWED_MODES = new Set(['social', 'gaming', 'broadcast', 'quiet']);
const MANAGE_ROLES = new Set(['owner', 'admin']);

export interface ChannelCreateInput {
  name: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
}

export interface ChannelUpdateInput {
  name?: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
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
    ownerId: ch.owner_id,
    maxUsers: ch.max_users,
    isInviteOnly: ch.is_invite_only,
    isHidden: ch.is_hidden,
    mode: ch.mode,
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

async function requireManageRole(serverId: string, userId: string): Promise<string> {
  const member = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (!member) throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  if (!MANAGE_ROLES.has(member.role)) {
    throw new AppError(403, 'Kanal yönetmek için yetkin yok');
  }
  return member.role;
}

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
  await requireManageRole(serverId, userId);

  const name = normalizeName(input.name);
  const mode = normalizeMode(input.mode);
  const maxUsers = normalizeMaxUsers(input.maxUsers);
  const isInviteOnly = !!input.isInviteOnly;
  const isHidden = !!input.isHidden;
  const description = typeof input.description === 'string' ? input.description.slice(0, 200) : '';

  // Plan limitine göre kanal sayısını kontrol et — mevcut getPlanLimits/serverService konvansiyonuna bak.
  const existingCount = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM channels WHERE server_id = $1',
    [serverId]
  );
  const currentTotal = existingCount ? parseInt(existingCount.count, 10) : 0;

  // Pozisyon: mevcut max + 1
  const posRow = await queryOne<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM channels WHERE server_id = $1',
    [serverId]
  );
  const nextPosition = (posRow?.max_pos ?? -1) + 1;

  const row = await queryOne<Channel>(
    `INSERT INTO channels (server_id, name, description, type, position, is_default, owner_id, max_users, is_invite_only, is_hidden, mode)
     VALUES ($1, $2, $3, 'voice', $4, false, $5, $6, $7, $8, $9)
     RETURNING *`,
    [serverId, name, description, nextPosition, userId, maxUsers, isInviteOnly, isHidden, mode]
  );
  if (!row) throw new AppError(500, 'Kanal oluşturulamadı');

  // currentTotal değişkenini ileride plan limit kontrolü için kullanmak üzere burada tutuyoruz.
  void currentTotal;
  return toResponse(row);
}

/** Kanal güncelle */
export async function updateChannel(
  serverId: string,
  userId: string,
  channelId: string,
  input: ChannelUpdateInput,
): Promise<ChannelResponse> {
  await requireManageRole(serverId, userId);

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

  if (sets.length === 0) return toResponse(existing);

  sets.push(`updated_at = now()`);
  values.push(channelId, serverId);

  const sql = `UPDATE channels SET ${sets.join(', ')} WHERE id = $${i++} AND server_id = $${i++} RETURNING *`;
  const row = await queryOne<Channel>(sql, values);
  if (!row) throw new AppError(500, 'Kanal güncellenemedi');
  return toResponse(row);
}

/** Kanal sıralamasını toplu güncelle — tek SQL (unnest), transactional, optimistic concurrency. */
export async function reorderChannels(
  serverId: string,
  userId: string,
  updates: Array<{ id: string; position: number }>,
  expectedOrderToken: string | null,
): Promise<ChannelListResult> {
  await requireManageRole(serverId, userId);

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

    // Optimistic concurrency: başka yönetici reorder yapmışsa token uyuşmaz.
    const freshRow = await client.query<{ max_ts: string | null }>(
      'SELECT MAX(updated_at)::text AS max_ts FROM channels WHERE server_id = $1 FOR UPDATE',
      [serverId]
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

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    throw err instanceof AppError ? err : new AppError(500, 'Sıralama kaydedilemedi');
  } finally {
    client.release();
  }

  const rows = await queryMany<Channel>(
    'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC, created_at ASC',
    [serverId]
  );
  const orderToken = await fetchOrderToken(serverId);
  return { channels: rows.map(toResponse), orderToken };
}

/** Kanal sil — varsayılan (sistem) kanallar silinemez */
export async function deleteChannel(
  serverId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  await requireManageRole(serverId, userId);

  const existing = await queryOne<{ is_default: boolean }>(
    'SELECT is_default FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
  if (!existing) throw new AppError(404, 'Kanal bulunamadı');
  if (existing.is_default) throw new AppError(403, 'Sistem kanalları silinemez');

  const result = await pool.query(
    'DELETE FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId]
  );
  if (result.rowCount === 0) throw new AppError(404, 'Kanal bulunamadı');
}
