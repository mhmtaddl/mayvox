import { pool } from '../repositories/db';
import type { PoolClient } from 'pg';

export interface AuditLogEntry {
  serverId: string | null;
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

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
