import { queryMany, queryOne } from '../repositories/db';
import { getServerAccessContext, type ServerAccessContext } from './accessContextService';
import { getServerPlan } from './planService';

export type RoomMusicStatus = 'playing' | 'paused' | 'stopped';
export type MusicSourceType = 'mayvox_mood' | 'mayvox_radio' | 'royalty_free_url' | 'licensed_provider';

export type RoomMusicErrorCode =
  | 'MUSIC_ULTRA_REQUIRED'
  | 'MUSIC_CONTROL_FORBIDDEN'
  | 'MUSIC_SOURCE_NOT_FOUND'
  | 'MUSIC_SESSION_NOT_FOUND'
  | 'MUSIC_CHANNEL_NOT_FOUND'
  | 'MUSIC_CHANNEL_NOT_VOICE'
  | 'MUSIC_INVALID_VOLUME';

export class RoomMusicError extends Error {
  constructor(public status: number, public code: RoomMusicErrorCode, message: string) {
    super(message);
  }
}

interface MusicSourceRow {
  id: string;
  title: string;
  mood: string | null;
  category: string | null;
  source_type: MusicSourceType;
  artwork_url: string | null;
  duration_ms: number | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface MusicSessionRow {
  id: string;
  server_id: string;
  channel_id: string;
  status: RoomMusicStatus;
  current_source_id: string | null;
  started_by: string | null;
  started_at: string | null;
  paused_at: string | null;
  position_ms: number;
  volume: number;
  created_at: string;
  updated_at: string;
  source_id: string | null;
  source_title: string | null;
  source_mood: string | null;
  source_category: string | null;
  source_type: MusicSourceType | null;
  source_artwork_url: string | null;
  source_duration_ms: number | null;
  source_is_enabled: boolean | null;
  source_created_at: string | null;
  source_updated_at: string | null;
}

interface ChannelRow {
  id: string;
  type: string | null;
}

export interface MusicSourceDto {
  id: string;
  title: string;
  mood: string | null;
  category: string | null;
  sourceType: MusicSourceType;
  artworkUrl: string | null;
  durationMs: number | null;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoomMusicSessionDto {
  id: string;
  serverId: string;
  channelId: string;
  status: RoomMusicStatus;
  currentSourceId: string | null;
  source: MusicSourceDto | null;
  startedBy: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  positionMs: number;
  volume: number;
  createdAt?: string;
  updatedAt?: string;
}

const STAFF_ROLES = new Set(['owner', 'super_admin', 'admin', 'super_mod', 'mod', 'moderator']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRole(raw: unknown): string {
  const value = String(raw ?? '').toLowerCase();
  return value === 'moderator' ? 'mod' : value;
}

function isStaff(ctx: ServerAccessContext): boolean {
  if (STAFF_ROLES.has(normalizeRole(ctx.membership.baseRole))) return true;
  return ctx.roles.some(role => STAFF_ROLES.has(normalizeRole(role.name)));
}

function parseUserLevel(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

async function getUserLevel(userId: string): Promise<number> {
  const row = await queryOne<{ user_level: string | null }>(
    'SELECT user_level FROM profiles WHERE id = $1',
    [userId],
  );
  return parseUserLevel(row?.user_level);
}

function assertMember(ctx: ServerAccessContext): void {
  if (!ctx.membership.exists) {
    throw new RoomMusicError(403, 'MUSIC_CONTROL_FORBIDDEN', 'Bu sunucunun üyesi değilsin');
  }
}

async function assertUltra(serverId: string): Promise<void> {
  const plan = await getServerPlan(serverId);
  if (plan !== 'ultra') {
    throw new RoomMusicError(403, 'MUSIC_ULTRA_REQUIRED', 'MAYVox Music sadece Ultra sunucularda kullanılabilir');
  }
}

async function assertVoiceChannel(serverId: string, channelId: string): Promise<void> {
  const channel = await queryOne<ChannelRow>(
    'SELECT id, type FROM channels WHERE id = $1 AND server_id = $2',
    [channelId, serverId],
  );
  if (!channel) {
    throw new RoomMusicError(404, 'MUSIC_CHANNEL_NOT_FOUND', 'Oda bulunamadı');
  }
  if ((channel.type || 'voice') !== 'voice') {
    throw new RoomMusicError(400, 'MUSIC_CHANNEL_NOT_VOICE', 'MAYVox Music sadece ses odalarında kullanılabilir');
  }
}

async function assertReadAccess(userId: string, serverId: string, channelId?: string): Promise<ServerAccessContext> {
  const ctx = await getServerAccessContext(userId, serverId);
  assertMember(ctx);
  await assertUltra(serverId);
  if (channelId) await assertVoiceChannel(serverId, channelId);
  return ctx;
}

async function assertControlAccess(userId: string, serverId: string, channelId: string): Promise<ServerAccessContext> {
  const ctx = await assertReadAccess(userId, serverId, channelId);
  if (isStaff(ctx)) return ctx;
  if (await getUserLevel(userId) >= 2) return ctx;
  throw new RoomMusicError(403, 'MUSIC_CONTROL_FORBIDDEN', 'MAYVox Music kontrol yetkin yok');
}

function toSourceDto(row: MusicSourceRow): MusicSourceDto {
  return {
    id: row.id,
    title: row.title,
    mood: row.mood,
    category: row.category,
    sourceType: row.source_type,
    artworkUrl: row.artwork_url,
    durationMs: row.duration_ms,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sourceFromSession(row: MusicSessionRow): MusicSourceDto | null {
  if (!row.source_id || !row.source_title || !row.source_type) return null;
  return {
    id: row.source_id,
    title: row.source_title,
    mood: row.source_mood,
    category: row.source_category,
    sourceType: row.source_type,
    artworkUrl: row.source_artwork_url,
    durationMs: row.source_duration_ms,
    isEnabled: !!row.source_is_enabled,
    createdAt: row.source_created_at ?? undefined,
    updatedAt: row.source_updated_at ?? undefined,
  };
}

function toSessionDto(row: MusicSessionRow): RoomMusicSessionDto {
  return {
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    status: row.status,
    currentSourceId: row.current_source_id,
    source: sourceFromSession(row),
    startedBy: row.started_by,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    positionMs: row.position_ms,
    volume: row.volume,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sessionSelectSql(): string {
  return `SELECT
      s.id, s.server_id, s.channel_id, s.status, s.current_source_id,
      s.started_by, s.started_at::text, s.paused_at::text,
      s.position_ms, s.volume, s.created_at::text, s.updated_at::text,
      ms.id AS source_id, ms.title AS source_title, ms.mood AS source_mood,
      ms.category AS source_category, ms.source_type AS source_type,
      ms.artwork_url AS source_artwork_url, ms.duration_ms AS source_duration_ms,
      ms.is_enabled AS source_is_enabled, ms.created_at::text AS source_created_at,
      ms.updated_at::text AS source_updated_at
    FROM room_music_sessions s
    LEFT JOIN music_sources ms ON ms.id = s.current_source_id`;
}

async function getSourceOrThrow(sourceId: string): Promise<MusicSourceRow> {
  if (!isUuidLike(sourceId)) {
    throw new RoomMusicError(404, 'MUSIC_SOURCE_NOT_FOUND', 'Müzik kaynağı bulunamadı');
  }
  const source = await queryOne<MusicSourceRow>(
    `SELECT id, title, mood, category, source_type, artwork_url, duration_ms,
            is_enabled, created_at::text, updated_at::text
     FROM music_sources
     WHERE id = $1 AND is_enabled = true`,
    [sourceId],
  );
  if (!source) {
    throw new RoomMusicError(404, 'MUSIC_SOURCE_NOT_FOUND', 'Müzik kaynağı bulunamadı');
  }
  return source;
}

async function getExistingSession(serverId: string, channelId: string): Promise<MusicSessionRow | null> {
  return queryOne<MusicSessionRow>(
    `${sessionSelectSql()} WHERE s.server_id = $1 AND s.channel_id = $2`,
    [serverId, channelId],
  );
}

export async function listSources(userId: string, serverId: string): Promise<MusicSourceDto[]> {
  await assertReadAccess(userId, serverId);
  const rows = await queryMany<MusicSourceRow>(
    `SELECT id, title, mood, category, source_type, artwork_url, duration_ms,
            is_enabled, created_at::text, updated_at::text
     FROM music_sources
     WHERE is_enabled = true
     ORDER BY category NULLS LAST, mood NULLS LAST, title ASC`,
  );
  return rows.map(toSourceDto);
}

export async function getSession(userId: string, serverId: string, channelId: string): Promise<RoomMusicSessionDto | null> {
  await assertReadAccess(userId, serverId, channelId);
  const row = await getExistingSession(serverId, channelId);
  return row ? toSessionDto(row) : null;
}

export async function startSession(userId: string, serverId: string, channelId: string, sourceId: string): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  await getSourceOrThrow(sourceId);
  const row = await queryOne<MusicSessionRow>(
    `WITH upsert AS (
       INSERT INTO room_music_sessions (
         server_id, channel_id, status, current_source_id, started_by,
         started_at, paused_at, position_ms, updated_at
       )
       VALUES ($1, $2, 'playing', $3, $4, now(), NULL, 0, now())
       ON CONFLICT (server_id, channel_id) DO UPDATE SET
         status = 'playing',
         current_source_id = EXCLUDED.current_source_id,
         started_by = EXCLUDED.started_by,
         started_at = now(),
         paused_at = NULL,
         position_ms = 0,
         updated_at = now()
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN upsert u ON u.id = s.id`,
    [serverId, channelId, sourceId, userId],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}

export async function pauseSession(userId: string, serverId: string, channelId: string): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  const existing = await getExistingSession(serverId, channelId);
  if (!existing) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  const row = await queryOne<MusicSessionRow>(
    `WITH updated AS (
       UPDATE room_music_sessions
       SET status = 'paused', paused_at = now(), updated_at = now()
       WHERE server_id = $1 AND channel_id = $2
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN updated u ON u.id = s.id`,
    [serverId, channelId],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}

export async function resumeSession(userId: string, serverId: string, channelId: string): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  const existing = await getExistingSession(serverId, channelId);
  if (!existing) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  const row = await queryOne<MusicSessionRow>(
    `WITH updated AS (
       UPDATE room_music_sessions
       SET status = 'playing', paused_at = NULL, updated_at = now()
       WHERE server_id = $1 AND channel_id = $2
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN updated u ON u.id = s.id`,
    [serverId, channelId],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}

export async function stopSession(userId: string, serverId: string, channelId: string): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  const existing = await getExistingSession(serverId, channelId);
  if (!existing) {
    return {
      id: `stopped:${serverId}:${channelId}`,
      serverId,
      channelId,
      status: 'stopped',
      currentSourceId: null,
      source: null,
      startedBy: null,
      startedAt: null,
      pausedAt: null,
      positionMs: 0,
      volume: 70,
    };
  }
  const row = await queryOne<MusicSessionRow>(
    `WITH updated AS (
       UPDATE room_music_sessions
       SET status = 'stopped', paused_at = NULL, position_ms = 0, updated_at = now()
       WHERE server_id = $1 AND channel_id = $2
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN updated u ON u.id = s.id`,
    [serverId, channelId],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}

export async function changeSource(userId: string, serverId: string, channelId: string, sourceId: string): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  await getSourceOrThrow(sourceId);
  const existing = await getExistingSession(serverId, channelId);
  if (!existing) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  const row = await queryOne<MusicSessionRow>(
    `WITH updated AS (
       UPDATE room_music_sessions
       SET current_source_id = $3, position_ms = 0, updated_at = now()
       WHERE server_id = $1 AND channel_id = $2
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN updated u ON u.id = s.id`,
    [serverId, channelId, sourceId],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}

export async function updateVolume(userId: string, serverId: string, channelId: string, volume: number): Promise<RoomMusicSessionDto> {
  await assertControlAccess(userId, serverId, channelId);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
    throw new RoomMusicError(400, 'MUSIC_INVALID_VOLUME', 'Ses seviyesi 0-100 arasında olmalı');
  }
  const existing = await getExistingSession(serverId, channelId);
  if (!existing) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  const row = await queryOne<MusicSessionRow>(
    `WITH updated AS (
       UPDATE room_music_sessions
       SET volume = $3, updated_at = now()
       WHERE server_id = $1 AND channel_id = $2
       RETURNING id
     )
     ${sessionSelectSql()}
     JOIN updated u ON u.id = s.id`,
    [serverId, channelId, volume],
  );
  if (!row) throw new RoomMusicError(404, 'MUSIC_SESSION_NOT_FOUND', 'Müzik oturumu bulunamadı');
  return toSessionDto(row);
}
