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

  // Actor enrichment — profiles batch lookup
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id)));
  const nameMap = await fetchProfileNameMap(actorIds);

  return rows.map(r => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: nameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8),
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    metadata: r.metadata,
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
