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
 */
export async function recordEvent(serverId: string, kind: ModKind, at?: Date): Promise<void> {
  await queryOne(
    `INSERT INTO moderation_stats (server_id, kind, created_at)
     VALUES ($1, $2, COALESCE($3, now()))
     RETURNING id`,
    [serverId, kind, at ?? null],
  );
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
