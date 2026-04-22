/**
 * Moderation stats aggregator.
 *
 * - recordEvent: chat-server'dan internal endpoint üzerinden gelen block event'leri yazar.
 * - getStats: seçilen range için per-kind COUNT döner.
 *
 * Tablo: moderation_stats (migration 026).
 */
import { queryOne, queryMany } from '../repositories/db';
import { AppError } from './serverService';

export type ModKind = 'flood' | 'profanity' | 'spam';

export interface ModStats {
  floodBlocked: number;
  profanityBlocked: number;
  spamBlocked: number;
}

export type StatRange = '5m' | '1h' | '24h';

// Range → SQL interval (parametrize edilemez, whitelist kontrolü ile literal enjekte)
const RANGE_INTERVAL: Record<StatRange, string> = {
  '5m':  '5 minutes',
  '1h':  '1 hour',
  '24h': '24 hours',
};

export function isValidRange(r: unknown): r is StatRange {
  return r === '5m' || r === '1h' || r === '24h';
}

export function isValidKind(k: unknown): k is ModKind {
  return k === 'flood' || k === 'profanity' || k === 'spam';
}

/**
 * Event yaz — chat-server'dan gelir.
 * serverId ve kind zaten endpoint'te valide edilir; bu fonksiyon sadece INSERT.
 * userId/channelId opsiyonel (eski chat-server sürümleri için geriye uyum).
 * Mesaj içeriği ASLA yazılmaz — privacy-safe.
 */
export async function recordEvent(
  serverId: string,
  kind: ModKind,
  opts: { userId?: string | null; channelId?: string | null; at?: Date } = {},
): Promise<void> {
  await queryOne(
    `INSERT INTO moderation_stats (server_id, kind, user_id, channel_id, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()))
     RETURNING id`,
    [serverId, kind, opts.userId ?? null, opts.channelId ?? null, opts.at ?? null],
  );
}

export interface ModEvent {
  id: string;
  kind: ModKind;
  userId: string | null;
  userName: string | null;
  userAvatar: string | null;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
}

/**
 * Son N moderation event'i döner — profiles + channels join ile enrichment.
 * Role gate üst katmanda (route) yapılır; bu fonksiyon sadece listeler.
 */
export async function listEvents(
  serverId: string,
  opts: { limit?: number; kind?: ModKind } = {},
): Promise<ModEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [serverId];
  let where = `ms.server_id = $1`;
  if (opts.kind) {
    params.push(opts.kind);
    where += ` AND ms.kind = $${params.length}`;
  }
  params.push(limit);
  const rows = await queryMany<{
    id: string;
    kind: ModKind;
    user_id: string | null;
    user_name: string | null;
    user_avatar: string | null;
    channel_id: string | null;
    channel_name: string | null;
    created_at: string;
  }>(
    `SELECT ms.id::text, ms.kind,
            ms.user_id,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
              p.name
            ) AS user_name,
            p.avatar AS user_avatar,
            ms.channel_id,
            c.name AS channel_name,
            ms.created_at::text
     FROM moderation_stats ms
     LEFT JOIN profiles p ON p.id = ms.user_id
     LEFT JOIN channels c ON c.id = ms.channel_id AND c.server_id = ms.server_id
     WHERE ${where}
     ORDER BY ms.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    userId: r.user_id,
    userName: r.user_name,
    userAvatar: r.user_avatar,
    channelId: r.channel_id,
    channelName: r.channel_name,
    createdAt: r.created_at,
  }));
}

/**
 * Seçilen range için per-kind COUNT döner.
 * Single query — her kind için FILTER (WHERE ...) ile COUNT.
 */
export async function getStats(serverId: string, range: StatRange): Promise<ModStats> {
  if (!isValidRange(range)) throw new AppError(400, 'Geçersiz zaman aralığı');
  const interval = RANGE_INTERVAL[range];
  const rows = await queryMany<{ kind: ModKind; cnt: string }>(
    `SELECT kind, COUNT(*)::text AS cnt
     FROM moderation_stats
     WHERE server_id = $1
       AND created_at >= now() - ($2::text)::interval
     GROUP BY kind`,
    [serverId, interval],
  );
  const out: ModStats = { floodBlocked: 0, profanityBlocked: 0, spamBlocked: 0 };
  for (const r of rows) {
    const n = parseInt(r.cnt, 10);
    if (r.kind === 'flood') out.floodBlocked = n;
    else if (r.kind === 'profanity') out.profanityBlocked = n;
    else if (r.kind === 'spam') out.spamBlocked = n;
  }
  return out;
}
