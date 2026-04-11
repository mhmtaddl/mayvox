import { queryOne, queryMany, pool } from '../repositories/db';
import type { Server, ServerResponse, ServerActivity } from '../types';
import { nanoid } from 'nanoid';

function generateInviteCode(): string {
  return nanoid(8).toUpperCase();
}

function toShortName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function toResponse(server: Server, activity?: ServerActivity | null, role?: string): ServerResponse {
  return {
    id: server.id,
    name: server.name,
    shortName: server.short_name,
    avatarUrl: server.avatar_url,
    description: server.description,
    memberCount: activity?.member_count ?? 0,
    activeCount: activity?.active_count ?? 0,
    capacity: server.capacity,
    level: server.level,
    inviteCode: server.invite_code,
    isPublic: server.is_public,
    createdAt: server.created_at,
    role,
  };
}

/** Kullanıcının dahil olduğu sunucuları listele */
export async function listMyServers(userId: string): Promise<ServerResponse[]> {
  const rows = await queryMany<Server & { role: string; member_count: number; active_count: number }>(
    `SELECT s.*, sm.role, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count
     FROM servers s
     JOIN server_members sm ON sm.server_id = s.id
     LEFT JOIN server_activity sa ON sa.server_id = s.id
     WHERE sm.user_id = $1
     ORDER BY sm.joined_at ASC`,
    [userId]
  );

  return rows.map(r => toResponse(r, { server_id: r.id, member_count: r.member_count, active_count: r.active_count, updated_at: '' }, r.role));
}

/** Yeni sunucu oluştur + owner'ı member olarak ekle + varsayılan kanallar */
export async function createServer(userId: string, name: string, description: string): Promise<ServerResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteCode = generateInviteCode();
    const shortName = toShortName(name);

    // Sunucu oluştur
    const { rows: [server] } = await client.query<Server>(
      `INSERT INTO servers (owner_user_id, name, short_name, description, invite_code)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, name, shortName, description, inviteCode]
    );

    // Owner'ı member olarak ekle
    await client.query(
      `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [server.id, userId]
    );

    // Varsayılan kanallar
    await client.query(
      `INSERT INTO channels (server_id, name, type, position, is_default) VALUES
       ($1, 'Genel', 'voice', 0, true),
       ($1, 'Sohbet', 'voice', 1, false)`,
      [server.id]
    );

    // Aktivite kaydı
    await client.query(
      `INSERT INTO server_activity (server_id, member_count) VALUES ($1, 1)`,
      [server.id]
    );

    await client.query('COMMIT');

    return toResponse(server, { server_id: server.id, member_count: 1, active_count: 0, updated_at: '' }, 'owner');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Sunucu detay */
export async function getServer(serverId: string, userId: string): Promise<ServerResponse | null> {
  const row = await queryOne<Server & { role: string | null; member_count: number; active_count: number }>(
    `SELECT s.*, sm.role, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count
     FROM servers s
     LEFT JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $2
     LEFT JOIN server_activity sa ON sa.server_id = s.id
     WHERE s.id = $1`,
    [serverId, userId]
  );

  if (!row) return null;
  return toResponse(row, { server_id: row.id, member_count: row.member_count, active_count: row.active_count, updated_at: '' }, row.role ?? undefined);
}

/** Public sunucu arama */
export async function searchServers(query: string): Promise<ServerResponse[]> {
  const rows = await queryMany<Server & { member_count: number; active_count: number }>(
    `SELECT s.*, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count
     FROM servers s
     LEFT JOIN server_activity sa ON sa.server_id = s.id
     WHERE s.is_public = true AND s.name ILIKE $1
     ORDER BY sa.member_count DESC NULLS LAST
     LIMIT 20`,
    [`%${query}%`]
  );

  return rows.map(r => toResponse(r, { server_id: r.id, member_count: r.member_count, active_count: r.active_count, updated_at: '' }));
}

/** Davet kodu ile sunucuya katıl */
export async function joinByInvite(userId: string, code: string): Promise<ServerResponse> {
  // Sunucuyu invite_code ile bul
  const server = await queryOne<Server>(
    `SELECT * FROM servers WHERE invite_code = $1`,
    [code]
  );
  if (!server) throw new AppError(404, 'Geçersiz davet kodu');

  // Zaten üye mi?
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2`,
    [server.id, userId]
  );
  if (existing) throw new AppError(409, 'Bu sunucuya zaten üyesin');

  // Kapasite kontrolü
  const activity = await queryOne<{ member_count: number }>(
    `SELECT member_count FROM server_activity WHERE server_id = $1`,
    [server.id]
  );
  if (activity && activity.member_count >= server.capacity) {
    throw new AppError(403, 'Sunucu kapasitesi dolu');
  }

  // Üye ekle
  await pool.query(
    `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'member')`,
    [server.id, userId]
  );

  // Aktivite güncelle
  await pool.query(
    `UPDATE server_activity SET member_count = member_count + 1, updated_at = now() WHERE server_id = $1`,
    [server.id]
  );

  const memberCount = (activity?.member_count ?? 0) + 1;
  return toResponse(server, { server_id: server.id, member_count: memberCount, active_count: 0, updated_at: '' }, 'member');
}

/** Sunucudan ayrıl */
export async function leaveServer(userId: string, serverId: string): Promise<void> {
  const member = await queryOne<{ role: string }>(
    `SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId]
  );
  if (!member) throw new AppError(404, 'Bu sunucunun üyesi değilsin');
  if (member.role === 'owner') throw new AppError(403, 'Sunucu sahibi sunucudan ayrılamaz');

  await pool.query(
    `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId]
  );

  await pool.query(
    `UPDATE server_activity SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE server_id = $1`,
    [serverId]
  );
}

/** Uygulama seviyesinde hata */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
