import { pool, queryMany, queryOne, execute } from '../repositories/db';
import { supabase } from '../supabaseClient';
import { writeSystemAudit } from './systemAuditService';
import { invalidateAccessContextForServer } from './accessContextService';

export type PlanKey = 'free' | 'pro' | 'ultra';

export interface AdminServerRow {
  id: string;
  name: string;
  avatar_url: string | null;
  short_name: string | null;
  owner_user_id: string;
  created_at: string;
  member_count: number;
  plan: PlanKey;
  is_banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  banned_by: string | null;
  owner_full_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
}

export interface ListServersOptions {
  search?: string;
  limit: number;
  offset: number;
}

export interface ListServersResult {
  items: AdminServerRow[];
  total: number;
  limit: number;
  offset: number;
}

function sanitizePlan(v: unknown): PlanKey {
  return v === 'pro' || v === 'ultra' ? v : 'free';
}

/** Paginated + searchable server listesi (global view). */
export async function listAllServers(opts: ListServersOptions): Promise<ListServersResult> {
  const limit = Math.min(Math.max(opts.limit | 0, 1), 100);
  const offset = Math.max(opts.offset | 0, 0);
  const search = (opts.search ?? '').trim();

  const where: string[] = [];
  const args: unknown[] = [];
  if (search) {
    // name ILIKE veya owner_user_id tam eşleşme
    args.push(`%${search}%`);
    args.push(search);
    where.push(`(s.name ILIKE $${args.length - 1} OR s.owner_user_id = $${args.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Total
  const totalRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM servers s ${whereSql}`,
    args,
  );
  const total = totalRow ? parseInt(totalRow.n, 10) || 0 : 0;

  // Items
  args.push(limit);
  args.push(offset);
  const rows = await queryMany<Omit<AdminServerRow, 'owner_full_name' | 'owner_username' | 'owner_email'>>(
    `SELECT
       s.id,
       s.name,
       s.avatar_url,
       s.short_name,
       s.owner_user_id,
       s.created_at,
       s.is_banned,
       s.banned_at,
       s.banned_reason,
       s.banned_by,
       COALESCE(sp.plan, s.plan, 'free') AS plan,
       COALESCE((SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id), 0)::int AS member_count
     FROM servers s
     LEFT JOIN server_plans sp ON sp.server_id = s.id
     ${whereSql}
     ORDER BY s.created_at DESC
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );

  // Owner profile batch fetch (Supabase — farklı DB). N+1 yok: tek .in() sorgusu.
  const ownerIds = Array.from(new Set(rows.map(r => r.owner_user_id).filter(Boolean)));
  const ownerMap = new Map<string, { fullName: string | null; username: string | null; email: string | null }>();
  if (ownerIds.length > 0) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, first_name, last_name, email')
      .in('id', ownerIds);
    if (error) {
      console.warn('[systemAdminService] owner profile fetch failed', error.message);
    } else if (profiles) {
      for (const p of profiles as Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>) {
        const first = (p.first_name ?? '').trim();
        const last = (p.last_name ?? '').trim();
        const combined = `${first} ${last}`.trim();
        ownerMap.set(p.id, {
          fullName: combined || null,
          username: p.name || null,
          email: p.email || null,
        });
      }
    }
  }

  const items: AdminServerRow[] = rows.map(r => {
    const o = ownerMap.get(r.owner_user_id);
    return {
      ...r,
      plan: sanitizePlan(r.plan),
      owner_full_name: o?.fullName ?? null,
      owner_username: o?.username ?? null,
      owner_email: o?.email ?? null,
    };
  });

  return { items, total, limit, offset };
}

/** Tek sunucu detay — audit metadata snapshot için. */
async function fetchServerSnapshot(serverId: string): Promise<Record<string, unknown> | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.id, s.name, s.owner_user_id, s.plan AS legacy_plan, s.is_banned, s.banned_reason,
            COALESCE(sp.plan, s.plan, 'free') AS effective_plan
     FROM servers s
     LEFT JOIN server_plans sp ON sp.server_id = s.id
     WHERE s.id = $1`,
    [serverId],
  );
  return row;
}

/** HARD DELETE — CASCADE ile child tablolar temizlenir. */
export async function adminDeleteServer(adminUserId: string, serverId: string, reason?: string): Promise<void> {
  const snap = await fetchServerSnapshot(serverId);
  if (!snap) throw new NotFoundError('Sunucu bulunamadı');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('DELETE FROM servers WHERE id = $1', [serverId]);
    if (!rowCount) throw new NotFoundError('Sunucu bulunamadı');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  invalidateAccessContextForServer(serverId);

  await writeSystemAudit({
    adminUserId,
    action: 'system_admin_action.server.delete',
    targetType: 'server',
    targetId: serverId,
    metadata: { before: snap, reason: reason ?? null },
  });
}

/** Ban / unban — erişim kontrolü `is_banned` bayrağı üstünden çalışır. */
export async function adminSetServerBanned(adminUserId: string, serverId: string, banned: boolean, reason?: string): Promise<void> {
  const snap = await fetchServerSnapshot(serverId);
  if (!snap) throw new NotFoundError('Sunucu bulunamadı');

  if (banned) {
    if (!reason || !reason.trim()) {
      throw new ValidationError('Kısıtlama açıklaması gerekli (owner görür)');
    }
    await execute(
      `UPDATE servers
          SET is_banned = true,
              banned_at = now(),
              banned_reason = $2,
              banned_by = $3
        WHERE id = $1`,
      [serverId, reason.trim(), adminUserId],
    );
  } else {
    await execute(
      `UPDATE servers
          SET is_banned = false,
              banned_at = NULL,
              banned_reason = NULL,
              banned_by = NULL
        WHERE id = $1`,
      [serverId],
    );
  }

  invalidateAccessContextForServer(serverId);

  await writeSystemAudit({
    adminUserId,
    action: banned ? 'system_admin_action.server.ban' : 'system_admin_action.server.unban',
    targetType: 'server',
    targetId: serverId,
    metadata: { before: snap, reason: reason ?? null },
  });
}

/** Plan değiştir (server_plans authoritative; yoksa upsert). */
export async function adminSetServerPlan(adminUserId: string, serverId: string, plan: PlanKey): Promise<void> {
  if (plan !== 'free' && plan !== 'pro' && plan !== 'ultra') {
    throw new ValidationError('Geçersiz plan');
  }

  const snap = await fetchServerSnapshot(serverId);
  if (!snap) throw new NotFoundError('Sunucu bulunamadı');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO server_plans (server_id, plan, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (server_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
      [serverId, plan],
    );
    // Legacy kolon da uyumlu kalsın
    await client.query('UPDATE servers SET plan = $2, updated_at = now() WHERE id = $1', [serverId, plan]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  invalidateAccessContextForServer(serverId);

  await writeSystemAudit({
    adminUserId,
    action: 'system_admin_action.server.plan_change',
    targetType: 'server',
    targetId: serverId,
    metadata: { before: snap, after: { plan } },
  });
}

/**
 * Force owner leave:
 * - Owner'ın server_members satırı silinir.
 * - Bir sonraki en yüksek yetkili (admin → mod → member) owner olarak atanır, varsa.
 * - Hiç üye kalmazsa: owner_user_id korunur (server "sahipsiz" durumda kalır, sil/ban tercihi admin'e bırakılır).
 */
export async function adminForceOwnerLeave(adminUserId: string, serverId: string): Promise<{ newOwnerId: string | null; prevOwnerId: string }> {
  const snap = await fetchServerSnapshot(serverId);
  if (!snap) throw new NotFoundError('Sunucu bulunamadı');

  const prevOwnerId = String((snap as { owner_user_id?: string }).owner_user_id ?? '');
  if (!prevOwnerId) throw new NotFoundError('Owner bilgisi bulunamadı');

  const client = await pool.connect();
  let newOwnerId: string | null = null;
  try {
    await client.query('BEGIN');
    // Mevcut owner'ı member listesinden sil
    await client.query(
      'DELETE FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, prevOwnerId],
    );

    // Fallback: en yüksek rütbeli kalan üye
    const { rows: cand } = await client.query<{ user_id: string; role: string }>(
      `SELECT user_id, role
         FROM server_members
        WHERE server_id = $1
        ORDER BY CASE role
                   WHEN 'admin' THEN 1
                   WHEN 'mod'   THEN 2
                   WHEN 'member' THEN 3
                   ELSE 4
                 END ASC,
                 created_at ASC
        LIMIT 1`,
      [serverId],
    );
    if (cand.length > 0) {
      newOwnerId = cand[0].user_id;
      await client.query(
        'UPDATE server_members SET role = $3 WHERE server_id = $1 AND user_id = $2',
        [serverId, newOwnerId, 'owner'],
      );
      await client.query(
        'UPDATE servers SET owner_user_id = $2, updated_at = now() WHERE id = $1',
        [serverId, newOwnerId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  invalidateAccessContextForServer(serverId);

  await writeSystemAudit({
    adminUserId,
    action: 'system_admin_action.server.force_owner_leave',
    targetType: 'server',
    targetId: serverId,
    metadata: { prev_owner_id: prevOwnerId, new_owner_id: newOwnerId, before: snap },
  });

  return { newOwnerId, prevOwnerId };
}

// ── Hatalar ──
export class NotFoundError extends Error { code = 404 as const; }
export class ValidationError extends Error { code = 400 as const; }
