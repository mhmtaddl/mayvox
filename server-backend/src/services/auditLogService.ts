import { pool } from '../repositories/db';
import type { PoolClient } from 'pg';
import { queryMany } from '../repositories/db';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { fetchProfileNameMap } from './profileLookupService';

export interface AuditLogEntry {
  serverId: string | null;
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRow {
  id: string;
  server_id: string | null;
  actor_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogListItem {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogListOptions {
  limit?: number;
  action?: string;
}

const LIST_MAX = 50;

type Executor = { query: typeof pool.query } | PoolClient;

/**
 * Kritik authorization action'ı DB'ye yaz.
 *
 * Tutarlılık:
 * - `client` verildiyse (active transaction) → aynı txn içinde yazılır;
 *   caller COMMIT yapmadan önce audit başarısızsa ROLLBACK yapabilir.
 * - Verilmediyse pool üzerinden yazılır. Hata throw edilmez, warn'e düşer —
 *   mutation zaten commit edilmişse geri alınamaz; audit best-effort kalır
 *   ve operatör log'dan tespit eder.
 */
export async function logAction(entry: AuditLogEntry, client?: Executor): Promise<void> {
  const exec = client ?? pool;
  try {
    await exec.query(
      `INSERT INTO audit_log (server_id, actor_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.serverId,
        entry.actorId,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ],
    );
  } catch (err) {
    console.warn('[auditLog] write failed', { action: entry.action, err: err instanceof Error ? err.message : err });
    // Transaction modunda caller rollback kararı verebilsin diye error yukarı bırakılır.
    if (client) throw err;
  }
}

/**
 * Sunucu-scope audit log listing — admin surface.
 * Capability: SERVER_MANAGE (admin+).
 * Newest-first, limit ≤ 50, opsiyonel action prefix filter.
 */
export async function listAuditLog(
  serverId: string,
  callerId: string,
  opts: AuditLogListOptions = {},
): Promise<AuditLogListItem[]> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Denetim kaydını görmek için yetkin yok');

  const limit = Math.min(Math.max(1, opts.limit ?? LIST_MAX), LIST_MAX);

  const params: unknown[] = [serverId];
  let where = 'server_id = $1';
  if (opts.action && typeof opts.action === 'string') {
    params.push(opts.action + '%');
    where += ` AND action LIKE $${params.length}`;
  }
  params.push(limit);

  const rows = await queryMany<AuditLogRow>(
    `SELECT id, server_id, actor_id, action, resource_type, resource_id, metadata, created_at
     FROM audit_log
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  // Actor + target enrichment — profiles batch lookup.
  const profileIds = new Set<string>();
  for (const r of rows) {
    if (r.actor_id) profileIds.add(r.actor_id);
    if (r.resource_type === 'member' && r.resource_id) profileIds.add(r.resource_id);
    const metadata = r.metadata ?? {};
    for (const key of ['targetUserId', 'userId']) {
      const value = metadata[key];
      if (typeof value === 'string' && value) profileIds.add(value);
    }
  }
  const nameMap = await fetchProfileNameMap(Array.from(profileIds));

  const channelIds = Array.from(new Set(rows.flatMap((r) => {
    const ids: string[] = [];
    if (r.resource_type === 'channel' && r.resource_id) ids.push(r.resource_id);
    const channelId = r.metadata?.channelId;
    if (typeof channelId === 'string' && channelId) ids.push(channelId);
    return ids;
  })));
  const channelRows = channelIds.length
    ? await queryMany<{ id: string; name: string }>(
      'SELECT id::text, name FROM channels WHERE id::text = ANY($1::text[])',
      [channelIds],
    )
    : [];
  const channelNameMap = new Map(channelRows.map(row => [row.id, row.name]));

  const recommendationIds = Array.from(new Set(rows
    .filter(r => r.resource_type === 'recommendation' && r.resource_id)
    .map(r => r.resource_id as string)));
  const recommendationRows = recommendationIds.length
    ? await queryMany<{ id: string; title: string; category: string | null; creator_id: string | null; creator_name: string | null }>(
      `SELECT ri.id::text AS id,
              ri.title,
              ri.category,
              ri.created_by::text AS creator_id,
              COALESCE(NULLIF(p.display_name, ''), NULLIF(p.name, ''), p.email, ri.created_by::text) AS creator_name
         FROM recommendation_items ri
         LEFT JOIN profiles p ON p.id = ri.created_by
        WHERE ri.id::text = ANY($1::text[])`,
      [recommendationIds],
    )
    : [];
  const recommendationMap = new Map(recommendationRows.map(row => [row.id, row]));

  function enrichMetadata(row: AuditLogRow): Record<string, unknown> | null {
    const metadata: Record<string, unknown> = { ...(row.metadata ?? {}) };
    if (row.resource_type === 'recommendation' && row.resource_id) {
      const item = recommendationMap.get(row.resource_id);
      if (item) {
        if (!metadata.title) metadata.title = item.title;
        if (!metadata.targetName) metadata.targetName = item.title;
        if (!metadata.category && item.category) metadata.category = item.category;
        if (!metadata.creatorId && item.creator_id) metadata.creatorId = item.creator_id;
        if (!metadata.creatorName && item.creator_name) metadata.creatorName = item.creator_name;
      }
    }
    if (!metadata.targetUserId && row.resource_type === 'member' && row.resource_id) {
      metadata.targetUserId = row.resource_id;
    }
    const targetUserId = typeof metadata.targetUserId === 'string'
      ? metadata.targetUserId
      : typeof metadata.userId === 'string'
        ? metadata.userId
        : null;
    if (!metadata.targetName && targetUserId) {
      const targetName = nameMap.get(targetUserId);
      if (targetName) metadata.targetName = targetName;
    }
    const channelId = typeof metadata.channelId === 'string'
      ? metadata.channelId
      : row.resource_type === 'channel' && row.resource_id
        ? row.resource_id
        : null;
    if (!metadata.channelName && channelId) {
      const channelName = channelNameMap.get(channelId);
      if (channelName) metadata.channelName = channelName;
    }
    return Object.keys(metadata).length ? metadata : null;
  }

  return rows.map(r => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: nameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8),
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    metadata: enrichMetadata(r),
    createdAt: r.created_at,
  }));
}

// ── Retention cleanup helper (preparation only) ──
// Ileride cron/schedule job ile `deleteOldAuditLogs(30)` veya `(90)` çağrılabilir.
// Şu an otomatik tetiklenmiyor; sadece callable.
// Index: `idx_audit_server_time (server_id, created_at DESC)` (migration 011) listing'i
// ve `created_at` range filter'ı yeterince hızlı tarıyor; ayrı index gereksiz.

export async function deleteOldAuditLogs(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('deleteOldAuditLogs: days must be a positive number');
  }
  const result = await pool.query(
    `DELETE FROM audit_log WHERE created_at < now() - ($1 || ' days')::interval`,
    [String(days)]
  );
  return result.rowCount ?? 0;
}

export const AUDIT_LOG_RETENTION_DAYS = {
  free: 7,
  pro: 14,
  ultra: 30,
} as const;

export async function deleteExpiredAuditLogsByPlan(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM audit_log al
      USING servers s
      LEFT JOIN server_plans sp ON sp.server_id = s.id
     WHERE al.server_id = s.id
       AND al.created_at < now() - (
         CASE COALESCE(sp.plan, s.plan, 'free')
           WHEN 'ultra' THEN $1::int
           WHEN 'pro' THEN $2::int
           ELSE $3::int
         END || ' days'
       )::interval`,
    [
      AUDIT_LOG_RETENTION_DAYS.ultra,
      AUDIT_LOG_RETENTION_DAYS.pro,
      AUDIT_LOG_RETENTION_DAYS.free,
    ],
  );
  return result.rowCount ?? 0;
}
