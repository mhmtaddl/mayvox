import { execute, queryMany, queryOne } from '../repositories/db';
import { getServerAccessContext } from './accessContextService';
import { AppError } from './serverService';

export type RoomActivityType =
  | 'join'
  | 'leave'
  | 'chat_lock'
  | 'chat_unlock'
  | 'chat_clear'
  | 'automod'
  | 'voice_mute'
  | 'voice_unmute'
  | 'timeout'
  | 'timeout_clear'
  | 'room_kick'
  | 'chat_ban'
  | 'chat_unban'
  | 'message_delete'
  | 'message_edit'
  | 'message_report'
  | 'settings';

export interface RoomActivityEventDto {
  id: string;
  serverId: string;
  channelId: string;
  type: string;
  actorId: string | null;
  targetUserId: string | null;
  label: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  expiresAt: string | null;
}

export interface RecordRoomActivityInput {
  serverId: string;
  channelId?: string | null;
  type: RoomActivityType;
  actorId?: string | null;
  targetUserId?: string | null;
  label?: string;
  metadata?: Record<string, unknown>;
}

function clampLimit(raw: unknown): number {
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed)) return 75;
  return Math.max(1, Math.min(75, parsed));
}

async function displayName(userId?: string | null): Promise<string> {
  if (!userId) return 'Bir yetkili';
  const row = await queryOne<{
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    email: string | null;
  }>(
    `SELECT display_name, first_name, last_name, name, email
       FROM profiles
      WHERE id::text = $1`,
    [userId],
  );

  if (!row) return 'Kullanıcı';
  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return row.display_name || fullName || row.name || row.email || 'Kullanıcı';
}

function labelFor(type: RoomActivityType, actor: string, target: string): string {
  if (type === 'voice_mute') return `${actor}, ${target} kullanıcısını susturdu`;
  if (type === 'voice_unmute') return `${actor}, ${target} susturmasını kaldırdı`;
  if (type === 'timeout') return `${actor}, ${target} kullanıcısını zaman aşımına aldı`;
  if (type === 'timeout_clear') return `${actor}, ${target} zaman aşımını kaldırdı`;
  if (type === 'room_kick') return `${actor}, ${target} kullanıcısını odadan çıkardı`;
  if (type === 'chat_ban') return `${actor}, ${target} kullanıcısını sohbetten yasakladı`;
  if (type === 'chat_unban') return `${actor}, ${target} sohbet yasağını kaldırdı`;
  if (type === 'chat_lock') return `${actor} sohbeti kilitledi`;
  if (type === 'chat_unlock') return `${actor} sohbet kilidini açtı`;
  if (type === 'chat_clear') return `${actor} sohbet mesajlarını temizledi`;
  return `${actor}, ${target} için işlem yaptı`;
}

async function activeRoomIdsForTarget(serverId: string, targetUserId?: string | null): Promise<string[]> {
  if (!targetUserId) return [];
  const rows = await queryMany<{ channel_id: string }>(
    `SELECT DISTINCT room_id::text AS channel_id
       FROM voice_sessions
      WHERE server_id = $1
        AND user_id::text = $2
        AND left_at IS NULL
      ORDER BY channel_id`,
    [serverId, targetUserId],
  );
  return rows.map(row => row.channel_id);
}

type RoomActivityTargetValidation =
  | { allowed: true; serverId: string; channelId: string | null }
  | { allowed: false; reason: string; hasChannel: boolean };

async function validateRoomActivityTarget(
  serverId: string | null | undefined,
  channelId?: string | null,
): Promise<RoomActivityTargetValidation> {
  const normalizedServerId = String(serverId || '').trim();
  const normalizedChannelId = String(channelId || '').trim();
  const hasChannel = normalizedChannelId.length > 0;

  if (!normalizedServerId) {
    return { allowed: false, reason: 'missing_server', hasChannel };
  }

  try {
    if (hasChannel) {
      const row = await queryOne<{ channel_id: string; server_id: string | null; server_exists: boolean }>(
        `SELECT c.id::text AS channel_id,
                c.server_id::text AS server_id,
                s.id IS NOT NULL AS server_exists
           FROM channels c
           LEFT JOIN servers s ON s.id = c.server_id
          WHERE c.id::text = $1
          LIMIT 1`,
        [normalizedChannelId],
      );

      if (!row) return { allowed: false, reason: 'missing_channel', hasChannel };
      if (!row.server_exists) return { allowed: false, reason: 'missing_server', hasChannel };
      if (String(row.server_id || '') !== normalizedServerId) {
        return { allowed: false, reason: 'channel_server_mismatch', hasChannel };
      }

      return { allowed: true, serverId: normalizedServerId, channelId: row.channel_id };
    }

    const server = await queryOne<{ id: string }>(
      `SELECT id::text AS id
         FROM servers
        WHERE id::text = $1
        LIMIT 1`,
      [normalizedServerId],
    );
    if (!server) return { allowed: false, reason: 'missing_server', hasChannel };
    return { allowed: true, serverId: normalizedServerId, channelId: null };
  } catch (err) {
    console.warn('[room-activity] target validation failed', err instanceof Error ? err.message : err);
    return { allowed: false, reason: 'lookup_failed', hasChannel };
  }
}

async function insertRoomActivityEvent(input: Required<Pick<RecordRoomActivityInput, 'serverId' | 'type'>> & RecordRoomActivityInput & { channelId: string; label: string }): Promise<void> {
  const target = await validateRoomActivityTarget(input.serverId, input.channelId);
  if (!target.allowed || !target.channelId) {
    console.warn('[room-activity] skipped invalid target', {
      reason: target.allowed ? 'missing_channel' : target.reason,
      hasChannel: target.allowed ? false : target.hasChannel,
    });
    return;
  }

  await execute(
    `DELETE FROM room_activity_events
      WHERE expires_at IS NOT NULL
        AND expires_at <= now()`,
  );

  await execute(
    `INSERT INTO room_activity_events
       (server_id, channel_id, type, actor_id, target_user_id, label, metadata)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      target.serverId,
      target.channelId,
      input.type,
      input.actorId ?? null,
      input.targetUserId ?? null,
      input.label,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  await execute(
    `DELETE FROM room_activity_events
      WHERE server_id = $1
        AND channel_id = $2
        AND id NOT IN (
          SELECT id
            FROM room_activity_events
           WHERE server_id = $1
             AND channel_id = $2
           ORDER BY created_at DESC
           LIMIT 75
        )`,
    [target.serverId, target.channelId],
  );
}

export async function recordRoomActivityEventDirect(input: RecordRoomActivityInput): Promise<void> {
  if (!input.serverId || !input.channelId || !input.type || !input.label) return;

  await insertRoomActivityEvent({
    serverId: input.serverId,
    channelId: input.channelId,
    type: input.type,
    actorId: input.actorId ?? null,
    targetUserId: input.targetUserId ?? null,
    label: input.label,
    metadata: input.metadata ?? {},
  });
}

export async function recordRoomActivityForTargetRooms(input: RecordRoomActivityInput): Promise<void> {
  const roomIds = input.channelId
    ? [input.channelId]
    : await activeRoomIdsForTarget(input.serverId, input.targetUserId);

  if (roomIds.length === 0) return;

  const actor = await displayName(input.actorId);
  const target = await displayName(input.targetUserId);
  const label = input.label || labelFor(input.type, actor, target);

  for (const channelId of roomIds) {
    await insertRoomActivityEvent({
      ...input,
      channelId,
      label,
    });
  }
}

export async function clearRoomActivityEvents(
  serverId: string,
  channelId: string,
  userId: string,
): Promise<{ deleted: number }> {
  const ctx = await getServerAccessContext(userId, serverId);

  if (!ctx.membership.exists) {
    throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  }

  const baseRole = String(ctx.membership.baseRole || '').toLocaleLowerCase('tr-TR');
  if (!ctx.membership.isOwner && baseRole !== 'super_admin') {
    throw new AppError(403, 'Oda günlüğünü temizleme yetkin yok');
  }

  const channel = await queryOne<{ id: string }>(
    `SELECT id::text AS id
       FROM channels
      WHERE id::text = $1
        AND server_id = $2`,
    [channelId, serverId],
  );

  if (!channel) {
    throw new AppError(404, 'Kanal bulunamadı');
  }

  const deleted = await execute(
    `DELETE FROM room_activity_events
      WHERE server_id = $1
        AND channel_id = $2`,
    [serverId, channelId],
  );

  return { deleted };
}

export async function listRoomActivityEvents(
  serverId: string,
  channelId: string,
  userId: string,
  rawLimit?: unknown,
): Promise<RoomActivityEventDto[]> {
  const ctx = await getServerAccessContext(userId, serverId);

  if (!ctx.membership.exists) {
    throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  }

  if (!ctx.flags.canKickMembers && !ctx.flags.canManageServer) {
    throw new AppError(403, 'Oda günlüğünü görme yetkin yok');
  }

  const channel = await queryOne<{ id: string }>(
    `SELECT id::text AS id
       FROM channels
      WHERE id::text = $1
        AND server_id = $2`,
    [channelId, serverId],
  );

  if (!channel) {
    throw new AppError(404, 'Kanal bulunamadı');
  }

  const limit = clampLimit(rawLimit);

  const rows = await queryMany<{
    id: string;
    server_id: string;
    channel_id: string;
    type: string;
    actor_id: string | null;
    target_user_id: string | null;
    label: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    expires_at: string | null;
  }>(
    `SELECT
        id::text,
        server_id::text,
        channel_id,
        type,
        actor_id,
        target_user_id,
        label,
        metadata,
        created_at::text,
        expires_at::text
       FROM room_activity_events
      WHERE server_id = $1
        AND channel_id = $2
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT $3`,
    [serverId, channelId, limit],
  );

  return rows.reverse().map(row => ({
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    type: row.type,
    actorId: row.actor_id,
    targetUserId: row.target_user_id,
    label: row.label,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}
