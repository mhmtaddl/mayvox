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
import { supabase } from '../supabaseClient';

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
 * Son N moderation event'i döner — Hetzner DB'den raw events + Supabase'den
 * profile enrichment + Hetzner channels'tan channel adı.
 * Role gate üst katmanda (route) yapılır; bu fonksiyon sadece listeler.
 * Mesaj içeriği ASLA sorgulanmaz/dönülmez.
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
  // 1) Raw events + channel name (Hetzner: channels tablosu aynı DB'de)
  const rows = await queryMany<{
    id: string;
    kind: ModKind;
    user_id: string | null;
    channel_id: string | null;
    channel_name: string | null;
    created_at: string;
  }>(
    `SELECT ms.id::text, ms.kind,
            ms.user_id,
            ms.channel_id,
            c.name AS channel_name,
            ms.created_at::text
     FROM moderation_stats ms
     LEFT JOIN channels c ON c.id = ms.channel_id AND c.server_id = ms.server_id
     WHERE ${where}
     ORDER BY ms.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  // 2) Profile enrichment — Supabase'den batch fetch (profiles Hetzner'da değil)
  const userIds = [...new Set(rows.map(r => r.user_id).filter((x): x is string => !!x))];
  const profileMap = new Map<string, { name: string; avatar: string | null }>();
  if (userIds.length > 0) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, name, avatar')
        .in('id', userIds);
      if (data) {
        for (const p of data) {
          const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
          profileMap.set(p.id as string, {
            name: full || (p.name as string) || '',
            avatar: (p.avatar as string) ?? null,
          });
        }
      }
    } catch (err) {
      // Enrichment best-effort — fail olursa isim/avatar null döner
      console.warn('[moderation-events] profile enrich failed:', err instanceof Error ? err.message : err);
    }
  }

  return rows.map(r => {
    const prof = r.user_id ? profileMap.get(r.user_id) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      userId: r.user_id,
      userName: prof?.name ?? null,
      userAvatar: prof?.avatar ?? null,
      channelId: r.channel_id,
      channelName: r.channel_name,
      createdAt: r.created_at,
    };
  });
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
