/**
 * Voice Activity Service
 *
 * Ses odası katılım süreleri + kullanıcılar-arası birlikte vakit (co-presence) tracking.
 *
 * Event kaynağı: LiveKit webhooks (participant_joined / participant_left).
 * Routes/webhooks.ts → bu servisi çağırır.
 *
 * Edge-case politikası:
 *   - Kısa session filtresi: co_presence'a overlap_sec >= CO_PRESENCE_MIN_SEC altı girmez
 *   - Pair kanonik sıralama: user_a < user_b (DB CHECK constraint)
 *   - Orphan session: 1 saatten eski left_at=NULL kayıtları reconcile et
 *   - LiveKit tekrar eden event: participant_joined aynı room+user için NEW session açmaz
 *     (mevcut açık session varsa close edilmez, üzerine yazılmaz — race-safe)
 */
import { pool, queryOne, queryMany } from '../repositories/db';
import { buildNarratives, type InsightNarrative } from './insightsNarrativeService';

const CO_PRESENCE_MIN_SEC = 30; // Altı gürültü — social pair olarak sayma
const INSIGHTS_TOP_USERS = 20;
const INSIGHTS_TOP_PAIRS = 15;

export interface InsightsUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalSec: number;
  sessionCount: number;
  avgSessionMin: number;
}
export interface InsightsPair {
  userA: { id: string; name: string | null; avatar: string | null };
  userB: { id: string; name: string | null; avatar: string | null };
  totalSec: number;
  lastOverlapAt: string | null;
}
export interface InsightsGroup {
  /** Grup üyeleri (sorted). 2 → pair, 3 → trio, 4+ → cluster. */
  members: Array<{ id: string; name: string | null; avatar: string | null }>;
  totalSec: number;
  /** Grubun son birlikte olduğu zaman (ISO). */
  lastTogetherAt: string | null;
}
export interface InsightsHourCell {
  dow: number;   // 0-6 (Pazar=0, Europe/Istanbul TZ)
  hour: number;  // 0-23
  totalSec: number;
  sessionCount: number;
  uniqueUsers: number;
}
export interface InsightsResponse {
  range: { days: number; start: string; end: string };
  topActiveUsers: InsightsUser[];
  topSocialPairs: InsightsPair[];
  topSocialGroups: InsightsGroup[];
  peakHours: InsightsHourCell[];
  userActivityMap: Record<string, { displayName: string | null; hourlyDistribution: number[] }>;
  heatmapRefreshedAt: string | null;
  narratives: InsightNarrative[];
}

// Module-scope: son heatmap refresh zamanı. Restart'ta null, 24h cron güncelledikçe artar.
let lastHeatmapRefresh: Date | null = null;

// ── Server-side serverId resolution (webhook'ta room_id gelir, server_id gerekir) ──
const roomToServerCache = new Map<string, { serverId: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 dk

async function resolveServerIdForRoom(roomId: string): Promise<string | null> {
  const now = Date.now();
  const cached = roomToServerCache.get(roomId);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.serverId;

  const row = await queryOne<{ server_id: string }>(
    `SELECT server_id FROM channels WHERE id = $1 AND type = 'voice'`,
    [roomId],
  );
  if (!row) return null;
  roomToServerCache.set(roomId, { serverId: row.server_id, ts: now });
  return row.server_id;
}

// ════════════════════════════════════════════════════════════════════════════
// Session açma — LiveKit participant_joined webhook'undan
// ════════════════════════════════════════════════════════════════════════════
export async function openSession(userId: string, roomId: string): Promise<{ opened: boolean; reason?: string }> {
  const serverId = await resolveServerIdForRoom(roomId);
  if (!serverId) return { opened: false, reason: 'room_not_voice_channel' };

  // Duplicate-join koruması: aynı user+room için aktif session varsa açma.
  // LiveKit bazı durumlarda (reconnect) tekrar participant_joined gönderebilir.
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM voice_sessions
     WHERE user_id = $1 AND room_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [userId, roomId],
  );
  if (existing) return { opened: false, reason: 'already_open' };

  await pool.query(
    `INSERT INTO voice_sessions (user_id, server_id, room_id, joined_at)
     VALUES ($1, $2, $3, now())`,
    [userId, serverId, roomId],
  );
  return { opened: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Session kapama + co-presence aggregation — LiveKit participant_left'ten
// ════════════════════════════════════════════════════════════════════════════
export async function closeSession(userId: string, roomId: string): Promise<{ closed: boolean; pairsUpdated: number }> {
  // Transaction: session'ı kapat + overlap'leri aynı anda oku
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Kendi session'ını kapat + joined_at, server_id geri al
    const closeRes = await client.query<{ user_id: string; server_id: string; joined_at: string; left_at: string }>(
      `UPDATE voice_sessions
       SET left_at = now()
       WHERE user_id = $1 AND room_id = $2 AND left_at IS NULL
       RETURNING user_id, server_id, joined_at, left_at`,
      [userId, roomId],
    );
    if (closeRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { closed: false, pairsUpdated: 0 };
    }
    const my = closeRes.rows[0];

    // 2) Aynı odada hâlâ aktif olan diğer kullanıcılar
    const others = await client.query<{ user_id: string; joined_at: string }>(
      `SELECT user_id, joined_at
       FROM voice_sessions
       WHERE room_id = $1 AND left_at IS NULL AND user_id <> $2`,
      [roomId, userId],
    );

    // 3) Her diğer user için overlap_sec hesabı + co_presence upsert
    let pairsUpdated = 0;
    for (const other of others.rows) {
      const overlapStart = new Date(Math.max(
        new Date(my.joined_at).getTime(),
        new Date(other.joined_at).getTime(),
      ));
      const overlapEnd = new Date(my.left_at);
      const overlapSec = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 1000);
      if (overlapSec < CO_PRESENCE_MIN_SEC) continue;

      // Kanonik sıra: user_a < user_b
      const [userA, userB] = userId < other.user_id ? [userId, other.user_id] : [other.user_id, userId];

      await client.query(
        `INSERT INTO co_presence (user_a, user_b, server_id, total_sec, last_overlap_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_a, user_b, server_id)
         DO UPDATE SET
           total_sec = co_presence.total_sec + EXCLUDED.total_sec,
           last_overlap_at = GREATEST(co_presence.last_overlap_at, EXCLUDED.last_overlap_at)`,
        [userA, userB, my.server_id, overlapSec, overlapEnd],
      );
      pairsUpdated++;
    }

    await client.query('COMMIT');
    return { closed: true, pairsUpdated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Startup reconciliation — crash sonrası orphan session'ları kapat
// (Aktif userlarla overlap hesabı YAPMAZ — eski veri güvensiz)
// ════════════════════════════════════════════════════════════════════════════
export async function reconcileOrphanSessions(): Promise<{ closedCount: number }> {
  const res = await pool.query(
    `UPDATE voice_sessions
     SET left_at = joined_at + INTERVAL '5 minutes'
     WHERE left_at IS NULL AND joined_at < now() - INTERVAL '1 hour'`,
  );
  return { closedCount: res.rowCount ?? 0 };
}

// ════════════════════════════════════════════════════════════════════════════
// Activity Heatmap MV refresh — günlük cron
// ════════════════════════════════════════════════════════════════════════════
export async function refreshActivityHeatmap(): Promise<void> {
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY activity_heatmap`);
  } catch (err) {
    // İlk REFRESH'i (populate edilmemiş MV) CONCURRENTLY ile yapılamaz — fallback.
    await pool.query(`REFRESH MATERIALIZED VIEW activity_heatmap`);
  }
  lastHeatmapRefresh = new Date();
}

// ════════════════════════════════════════════════════════════════════════════
// GET /servers/:id/insights — dashboard verisi
// ════════════════════════════════════════════════════════════════════════════
export async function getInsights(serverId: string, rangeDays: 7 | 30 | 90): Promise<InsightsResponse> {
  const startClause = `now() - INTERVAL '${rangeDays} days'`;

  // Profiles tablosu çoğu yerde Supabase'de — ama bu sunucuda yerel cache/mirror varsa query'den alınabilir.
  // Güvenlik: profiles tablosu Supabase, burada LEFT JOIN çalışmayabilir.
  // Pragmatik: display_name/avatar'ı NULL bırak; route layer'da isterse enrichment yap.
  // (moderationStatsService.listEvents paternini takip ediyoruz — profile enrichment route'ta)

  // 1) Top Active Users
  const topActiveRes = await queryMany<{
    user_id: string;
    total_sec: string;
    session_count: string;
  }>(
    `SELECT user_id,
            SUM(duration_sec)::BIGINT AS total_sec,
            COUNT(*)::BIGINT          AS session_count
     FROM voice_sessions
     WHERE server_id = $1
       AND left_at IS NOT NULL
       AND joined_at > ${startClause}
     GROUP BY user_id
     ORDER BY total_sec DESC
     LIMIT $2`,
    [serverId, INSIGHTS_TOP_USERS],
  );

  const topActiveUsers: InsightsUser[] = topActiveRes.map(r => {
    const totalSec = Number(r.total_sec) || 0;
    const sessionCount = Number(r.session_count) || 0;
    return {
      userId: r.user_id,
      displayName: null,                 // Supabase enrichment route layer'da
      avatarUrl: null,
      totalSec,
      sessionCount,
      avgSessionMin: sessionCount > 0 ? Math.round((totalSec / sessionCount) / 60) : 0,
    };
  });

  // 2) Top Social Pairs
  const topPairsRes = await queryMany<{
    user_a: string;
    user_b: string;
    total_sec: string;
    last_overlap_at: string | null;
  }>(
    `SELECT user_a, user_b, total_sec::BIGINT, last_overlap_at
     FROM co_presence
     WHERE server_id = $1
       AND last_overlap_at > ${startClause}
     ORDER BY total_sec DESC
     LIMIT $2`,
    [serverId, INSIGHTS_TOP_PAIRS],
  );

  const topSocialPairs: InsightsPair[] = topPairsRes.map(r => ({
    userA: { id: r.user_a, name: null, avatar: null },
    userB: { id: r.user_b, name: null, avatar: null },
    totalSec: Number(r.total_sec) || 0,
    lastOverlapAt: r.last_overlap_at,
  }));

  // 3) Peak Hours (heatmap)
  const peakRes = await queryMany<{
    dow: number;
    hour: number;
    total_sec: string;
    session_count: number;
    unique_users: number;
  }>(
    `SELECT dow, hour, total_sec::BIGINT, session_count, unique_users
     FROM activity_heatmap
     WHERE server_id = $1
     ORDER BY dow, hour`,
    [serverId],
  );

  const peakHours: InsightsHourCell[] = peakRes.map(r => ({
    dow: r.dow,
    hour: r.hour,
    totalSec: Number(r.total_sec) || 0,
    sessionCount: r.session_count,
    uniqueUsers: r.unique_users ?? 0,
  }));

  // 4) User Activity Map — top user'ların saatlik dağılımı
  const topUserIds = topActiveUsers.slice(0, 10).map(u => u.userId);
  let userActivityMap: InsightsResponse['userActivityMap'] = {};
  if (topUserIds.length > 0) {
    const hourlyRes = await queryMany<{ user_id: string; hour: number; total_sec: string }>(
      `SELECT user_id,
              EXTRACT(HOUR FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS hour,
              SUM(duration_sec)::BIGINT AS total_sec
       FROM voice_sessions
       WHERE server_id = $1
         AND user_id = ANY($2::uuid[])
         AND left_at IS NOT NULL
         AND joined_at > ${startClause}
       GROUP BY user_id, hour`,
      [serverId, topUserIds],
    );

    for (const uid of topUserIds) {
      userActivityMap[uid] = { displayName: null, hourlyDistribution: new Array(24).fill(0) };
    }
    for (const row of hourlyRes) {
      const entry = userActivityMap[row.user_id];
      if (entry && row.hour >= 0 && row.hour < 24) {
        entry.hourlyDistribution[row.hour] = Number(row.total_sec) || 0;
      }
    }
  }

  // 5) Social Groups — voice_sessions event stream walking (2/3/4/5+ kişilik gruplar)
  const topSocialGroups = await computeTopSocialGroups(serverId, rangeDays);

  // 6) AI-style narratives — deterministic rule-based (şimdilik LLM yok)
  const narratives = buildNarratives({ topActiveUsers, topSocialGroups, peakHours, rangeDays });

  const now = new Date();
  const start = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  return {
    range: { days: rangeDays, start: start.toISOString(), end: now.toISOString() },
    topActiveUsers,
    topSocialPairs,
    topSocialGroups,
    peakHours,
    userActivityMap,
    heatmapRefreshedAt: lastHeatmapRefresh ? lastHeatmapRefresh.toISOString() : null,
    narratives,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// computeTopSocialGroups — her voice room için event stream walk yaparak
// aynı anda odada bulunan user-set'lerinin (2+ kişi) kümülatif süresini hesaplar.
// Pair (co_presence) tablosu 2-kişilik; bu fonksiyon 3-4-5+ grupları da yakalar.
// Runtime hesap — günde 1 MV'ye göre ekstra CPU maliyeti var ama 90-gün range'de
// ~birkaç bin session için ms mertebesinde kalır.
// ════════════════════════════════════════════════════════════════════════════
const GROUP_MIN_SEC = 30;         // kısa session/geçiş gürültüsünü at
const GROUP_TOP_LIMIT = 15;
const GROUP_MIN_SIZE = 2;

async function computeTopSocialGroups(serverId: string, rangeDays: number): Promise<InsightsGroup[]> {
  const sessions = await queryMany<{
    room_id: string;
    user_id: string;
    joined_at: string;
    left_at: string;
  }>(
    `SELECT room_id, user_id, joined_at, left_at
     FROM voice_sessions
     WHERE server_id = $1
       AND left_at IS NOT NULL
       AND joined_at > now() - ($2 || ' days')::INTERVAL`,
    [serverId, String(rangeDays)],
  );

  if (sessions.length === 0) return [];

  // Room bazlı event stream: { time, userId, op: 'in' | 'out' }
  type Event = { time: number; userId: string; op: 'in' | 'out' };
  const byRoom = new Map<string, Event[]>();
  for (const s of sessions) {
    const evts = byRoom.get(s.room_id) ?? [];
    evts.push({ time: new Date(s.joined_at).getTime(), userId: s.user_id, op: 'in' });
    evts.push({ time: new Date(s.left_at).getTime(), userId: s.user_id, op: 'out' });
    byRoom.set(s.room_id, evts);
  }

  // key = sorted userIds joined by ','  →  { totalSec, lastTime }
  const groupStats = new Map<string, { totalSec: number; lastTime: number }>();

  for (const events of byRoom.values()) {
    events.sort((a, b) => a.time - b.time || (a.op === 'out' ? -1 : 1));
    // 'out' event 'in' event'ten önce işlenirse aynı timestamp'te geçişler doğru olur

    const current = new Set<string>();
    let lastTime = events[0]?.time ?? 0;

    for (const e of events) {
      const duration = Math.floor((e.time - lastTime) / 1000);
      if (duration >= GROUP_MIN_SEC && current.size >= GROUP_MIN_SIZE) {
        const key = [...current].sort().join(',');
        const entry = groupStats.get(key);
        if (entry) {
          entry.totalSec += duration;
          entry.lastTime = Math.max(entry.lastTime, e.time);
        } else {
          groupStats.set(key, { totalSec: duration, lastTime: e.time });
        }
      }
      if (e.op === 'in') current.add(e.userId);
      else current.delete(e.userId);
      lastTime = e.time;
    }
  }

  if (groupStats.size === 0) return [];

  const sorted = Array.from(groupStats.entries())
    .map(([key, v]) => ({ userIds: key.split(','), totalSec: v.totalSec, lastTime: v.lastTime }))
    .sort((a, b) => b.totalSec - a.totalSec)
    .slice(0, GROUP_TOP_LIMIT);

  // Profile enrichment frontend tarafında yapılır (moderationEvents pattern).
  return sorted.map(g => ({
    members: g.userIds.map(id => ({ id, name: null, avatar: null })),
    totalSec: g.totalSec,
    lastTogetherAt: new Date(g.lastTime).toISOString(),
  }));
}
