import { queryOne, queryMany, pool } from '../repositories/db';
import { getPlanLimits } from '../planConfig';
import type { Server, ServerResponse, ServerActivity } from '../types';
import { nanoid } from 'nanoid';
import { seedSystemRolesForServer, assignSystemRoleToMember } from './roleSeedService';
import { getServerPlan, getPlanLimits as getPlanLimitsV2, emitLimitHit } from './planService';

function generateInviteCode(): string {
  return nanoid(8).toUpperCase();
}

function toShortName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const SLUG_MAX = 6;

/**
 * Slug üretimi — sunucu adından otomatik, max 6 karakter.
 * İsimdeki tüm boşluklar/özel karakterler atılır, lowercase ASCII'ye çevrilir,
 * ilk 6 karakter alınır. Boş kalırsa "mv" fallback.
 */
export function generateBaseSlug(name: string): string {
  const cleaned = name.trim().toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
  const base = cleaned.slice(0, SLUG_MAX);
  return base || 'mv';
}

/**
 * Çakışma çözümü — deterministic numeric suffix.
 *   base, base1, base2, base3, ... , base999
 * Base max 6 karakter (generateBaseSlug tarafından). Suffix tam olarak base'in
 * sonuna eklenir; base kısaltılmaz. Kullanıcı kuralı:
 *   "sunucu adresinin sonuna 1 sayısı yazılsın, sonra 2, sonra 3..."
 * Örn: base = "oyuncu" (6ch) → "oyuncu", "oyuncu1", "oyuncu2", ...
 */
async function resolveUniqueSlug(name: string): Promise<string> {
  const base = generateBaseSlug(name);

  // İlk deneme: base slug
  const existing = await queryOne<{ id: string }>('SELECT id FROM servers WHERE slug = $1', [base + '.mv']);
  if (!existing) return base + '.mv';

  // Çakışma — base'e numerik suffix ekle (base kısaltılmaz).
  for (let i = 1; i <= 999; i++) {
    const candidate = base + String(i);
    const dup = await queryOne<{ id: string }>('SELECT id FROM servers WHERE slug = $1', [candidate + '.mv']);
    if (!dup) return candidate + '.mv';
  }

  throw new AppError(409, 'Uygun adres bulunamadı, farklı bir isim dene');
}

function toResponse(server: Server, activity?: ServerActivity | null, role?: string): ServerResponse {
  return {
    id: server.id,
    name: server.name,
    shortName: server.short_name,
    slug: server.slug,
    avatarUrl: server.avatar_url,
    description: server.description,
    memberCount: activity?.member_count ?? 0,
    activeCount: activity?.active_count ?? 0,
    capacity: server.capacity,
    level: server.level,
    inviteCode: server.invite_code,
    isPublic: server.is_public,
    joinPolicy: server.join_policy ?? 'invite_only',
    motto: server.motto ?? '',
    plan: server.plan ?? 'free',
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
export async function createServer(userId: string, name: string, description: string, isPublic: boolean, motto?: string, plan?: string): Promise<ServerResponse> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new AppError(400, 'Sunucu adı boş olamaz');

  // Duplicate name guard — GLOBAL unique, case-insensitive.
  // Pre-check + UNIQUE INDEX on LOWER(name) ile çift katman.
  const dup = await queryOne<{ id: string }>(
    `SELECT id FROM servers WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [trimmedName]
  );
  if (dup) throw new AppError(409, 'Bu isimde bir sunucu zaten mevcut');

  const slug = await resolveUniqueSlug(trimmedName);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteCode = generateInviteCode();
    const shortName = toShortName(name);

    // Sunucu oluştur
    const mottoVal = (motto || '').slice(0, 15);
    const selectedPlan = (plan === 'pro') ? 'pro' : 'free'; // ultra henüz desteklenmiyor
    const limits = getPlanLimits(selectedPlan);
    const { rows: [server] } = await client.query<Server>(
      `INSERT INTO servers (owner_user_id, name, short_name, slug, description, invite_code, is_public, motto, plan, capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, name, shortName, slug, description, inviteCode, isPublic, mottoVal, selectedPlan, limits.capacity]
    );

    // Owner'ı member olarak ekle
    await client.query(
      `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [server.id, userId]
    );

    // Varsayılan 4 sistem kanalı — HEPSİ is_default=true; auto-delete'ten korunur.
    // Task #18 bug fix: daha önce sadece ilk kanal default'tu, diğer 3'ü boş kalınca
    // frontend auto-delete timer'ı ile siliniyordu.
    await client.query(
      `INSERT INTO channels (server_id, name, type, position, is_default, mode) VALUES
       ($1, 'Sohbet Muhabbet', 'voice', 0, true, 'social'),
       ($1, 'Oyun Takımı',    'voice', 1, true, 'gaming'),
       ($1, 'Yayın Sahnesi',  'voice', 2, true, 'broadcast'),
       ($1, 'Sessiz Alan',    'voice', 3, true, 'quiet')`,
      [server.id]
    );

    // Aktivite kaydı
    await client.query(
      `INSERT INTO server_activity (server_id, member_count) VALUES ($1, 1)`,
      [server.id]
    );

    // Sistem rollerini + capability'leri seed et (capability foundation)
    await seedSystemRolesForServer(client, server.id);
    // Owner'ı owner rolüne bağla
    await assignSystemRoleToMember(client, server.id, userId, 'owner');

    await client.query('COMMIT');

    return toResponse(server, { server_id: server.id, member_count: 1, active_count: 0, updated_at: '' }, 'owner');
  } catch (err) {
    await client.query('ROLLBACK');
    // Race condition: UNIQUE INDEX `servers_name_unique_idx` pg error 23505 atar.
    // Pre-check'te yakalanmayan eş zamanlı create denemelerinde AppError 409 dönüş.
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr?.constraint === 'servers_name_unique_idx') {
      throw new AppError(409, 'Bu isimde bir sunucu zaten mevcut');
    }
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

/** Public sunucu arama — isim veya slug ile, üyelik durumunu role alanıyla döndür */
export async function searchServers(query: string, userId: string): Promise<ServerResponse[]> {
  const q = `%${query}%`;
  const rows = await queryMany<Server & { member_count: number; active_count: number; role: string | null }>(
    `SELECT s.*, COALESCE(sa.member_count, 0) as member_count, COALESCE(sa.active_count, 0) as active_count,
            sm.role
     FROM servers s
     LEFT JOIN server_activity sa ON sa.server_id = s.id
     LEFT JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $2
     WHERE s.is_public = true
       AND (s.name ILIKE $1 OR s.slug ILIKE $1)
     ORDER BY sa.member_count DESC NULLS LAST
     LIMIT 20`,
    [q, userId]
  );

  return rows.map(r => toResponse(r, { server_id: r.id, member_count: r.member_count, active_count: r.active_count, updated_at: '' }, r.role ?? undefined));
}

/** Akıllı katılma — davet kodu, slug, ad veya sunucu ID ile */
export async function joinByInvite(userId: string, input: string): Promise<ServerResponse> {
  const q = input.trim();

  // 1. Davet kodu ile ara
  let server = await queryOne<Server>('SELECT * FROM servers WHERE invite_code = $1', [q.toUpperCase()]);
  let viaInviteCode = !!server;

  // 2. Slug ile ara
  if (!server) server = await queryOne<Server>('SELECT * FROM servers WHERE slug = $1', [q.toLowerCase()]);

  // 3. Slug.mv ile ara
  if (!server && !q.includes('.')) server = await queryOne<Server>('SELECT * FROM servers WHERE slug = $1', [q.toLowerCase() + '.mv']);

  // 4. Sunucu adı ile ara (tam eşleşme, case-insensitive)
  if (!server) server = await queryOne<Server>('SELECT * FROM servers WHERE LOWER(name) = $1', [q.toLowerCase()]);

  // 5. Sunucu ID ile ara
  if (!server) server = await queryOne<Server>('SELECT * FROM servers WHERE id::text = $1', [q]);

  if (!server) throw new AppError(404, 'Böyle bir davet kodu bulunamadı. Davet kodunu kontrol et veya yeni bir davet kodu edin.');

  // Zaten üye mi?
  const existing = await queryOne<{ id: string }>('SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2', [server.id, userId]);
  if (existing) throw new AppError(409, 'Bu sunucunun zaten üyesisin');

  // Banlı mı?
  const banned = await queryOne<{ id: string }>('SELECT id FROM server_bans WHERE server_id = $1 AND user_id = $2', [server.id, userId]);
  if (banned) throw new AppError(403, 'Bu sunucuya erişimin kısıtlanmış');

  // Gizli sunucu + davet kodu olmadan katılma girişimi
  if (!server.is_public && !viaInviteCode) {
    throw new AppError(403, 'Bu sunucu yalnızca davet ile katılıma açık');
  }

  // Davetli-only sunucu + davet kodu olmadan
  if (server.join_policy === 'invite_only' && !viaInviteCode) {
    throw new AppError(403, 'Bu sunucuya katılmak için davet kodu gerekiyor');
  }

  // Kapasite kontrolü + insert — transactional + FOR UPDATE ile race overshoot guard.
  const client = await pool.connect();
  let newMemberCount = 0;
  try {
    await client.query('BEGIN');
    const capRow = await client.query<{ member_count: number }>(
      `SELECT COALESCE(member_count, 0) AS member_count FROM server_activity
       WHERE server_id = $1`,
      [server.id]
    );
    // servers satırı lock'la — eş zamanlı join'ler serileşir.
    await client.query('SELECT 1 FROM servers WHERE id = $1 FOR UPDATE', [server.id]);
    const currentCount = capRow.rows[0]?.member_count ?? 0;
    const plan = await getServerPlan(server.id);
    const maxMembers = getPlanLimitsV2(plan).maxMembers;
    const effectiveLimit = Math.min(server.capacity, maxMembers);
    if (currentCount >= effectiveLimit) {
      await client.query('ROLLBACK');
      await emitLimitHit(server.id, userId, 'server.join', plan, currentCount, effectiveLimit);
      throw new AppError(403, 'Sunucu kapasitesi dolu, şu an katılınamıyor');
    }
    await client.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)',
      [server.id, userId, 'member']
    );
    await client.query(
      'UPDATE server_activity SET member_count = member_count + 1, updated_at = now() WHERE server_id = $1',
      [server.id]
    );
    await assignSystemRoleToMember(client, server.id, userId, 'member');
    await client.query('COMMIT');
    newMemberCount = currentCount + 1;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* no-op */ }
    throw err instanceof AppError ? err : new AppError(500, 'Sunucuya katılınamadı');
  } finally {
    client.release();
  }

  return toResponse(server, { server_id: server.id, member_count: newMemberCount, active_count: 0, updated_at: '' }, 'member');
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

/** Sunucuyu tamamen sil — sadece owner */
export async function deleteServer(userId: string, serverId: string): Promise<void> {
  const member = await queryOne<{ role: string }>(
    'SELECT role FROM server_members WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );
  if (!member || member.role !== 'owner') throw new AppError(403, 'Sadece sunucu sahibi silebilir');
  await pool.query('DELETE FROM servers WHERE id = $1', [serverId]);
}

/** Uygulama seviyesinde hata */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
