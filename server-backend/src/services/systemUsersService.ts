import { execute, queryMany, queryOne } from '../repositories/db';
import { writeSystemAudit } from './systemAuditService';

/**
 * systemUsersService
 * ─────────────────
 * Global kullanıcı yönetimi — profiles + server bilgileri Hetzner Postgres'ten okunur.
 */

type PlanKey = 'free' | 'pro' | 'ultra';
type PlanSource = 'manual' | 'paid';
type PlanStatus = 'active' | 'expired' | 'unlimited' | 'none';

export interface AdminUserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  email: string | null;
  avatar: string | null;
  role: 'user' | 'server_admin' | 'system_admin';
  is_admin: boolean;
  is_moderator: boolean;
  is_primary_admin: boolean;
  is_muted: boolean;
  mute_expires: number | null;
  is_voice_banned: boolean;
  ban_expires: number | null;

  plan: PlanKey | 'none';
  plan_source: PlanSource | null;
  plan_start_at: string | null;
  plan_end_at: string | null;
  plan_status: PlanStatus;

  user_level: string | null;
  user_level_source: PlanSource | null;
  user_level_start_at: string | null;
  user_level_end_at: string | null;

  owned_server_count: number;
  created_at: string | null;
}

export type UserSort = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';

export interface ListUsersOptions {
  role?: 'admin' | 'mod' | 'user';
  plan?: PlanKey;
  planStatus?: PlanStatus;
  ownership?: 'has-server' | 'no-server' | 'only-owners';
  search?: string;
  sort?: UserSort;
  limit: number;
  offset: number;
}

export interface ListUsersResult {
  items: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
}

function computePlanStatus(plan: string | null, planEnd: string | null): PlanStatus {
  if (!plan || plan === 'none') return 'none';
  if (!planEnd) return 'unlimited';
  const end = Date.parse(planEnd);
  if (Number.isNaN(end)) return 'unlimited';
  return Date.now() < end ? 'active' : 'expired';
}

export async function listAllUsers(
  _adminToken: string,
  opts: ListUsersOptions,
): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(opts.limit | 0, 1), 100);
  const offset = Math.max(opts.offset | 0, 0);
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.role === 'admin') where.push('p.is_admin = true');
  else if (opts.role === 'mod') where.push('p.is_moderator = true AND p.is_admin = false');
  else if (opts.role === 'user') where.push('p.is_admin = false AND p.is_moderator = false');

  if (opts.plan) {
    params.push(opts.plan);
    where.push(`p.server_creation_plan = $${params.length}`);
  }

  if (opts.planStatus === 'unlimited') {
    where.push(`p.server_creation_plan IS NOT NULL AND p.server_creation_plan <> 'none' AND p.server_creation_plan_end IS NULL`);
  } else if (opts.planStatus === 'active') {
    where.push(`p.server_creation_plan IS NOT NULL AND p.server_creation_plan <> 'none' AND p.server_creation_plan_end > now()`);
  } else if (opts.planStatus === 'expired') {
    where.push(`p.server_creation_plan_end IS NOT NULL AND p.server_creation_plan_end < now()`);
  } else if (opts.planStatus === 'none') {
    where.push(`(p.server_creation_plan IS NULL OR p.server_creation_plan = 'none')`);
  }

  const s = (opts.search ?? '').trim();
  if (s) {
    params.push(`%${s}%`);
    where.push(`(p.display_name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.email ILIKE $${params.length} OR p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length})`);
  }

  if (opts.ownership === 'has-server' || opts.ownership === 'only-owners') {
    where.push(`EXISTS (SELECT 1 FROM servers s WHERE s.owner_user_id = p.id)`);
  } else if (opts.ownership === 'no-server') {
    where.push(`NOT EXISTS (SELECT 1 FROM servers s WHERE s.owner_user_id = p.id)`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = (() => {
    switch (opts.sort) {
      case 'name-asc': return 'ORDER BY p.name ASC NULLS LAST';
      case 'name-desc': return 'ORDER BY p.name DESC NULLS LAST';
      case 'created-asc': return 'ORDER BY p.created_at ASC';
      case 'created-desc':
      default: return 'ORDER BY p.created_at DESC';
    }
  })();

  const totalRow = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM profiles p ${whereSql}`,
    params,
  );
  const total = parseInt(totalRow?.n ?? '0', 10) || 0;

  params.push(limit, offset);
  const profileRows = await queryMany<{
    id: string;
    name: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    avatar: string | null;
    role: string | null;
    is_admin: boolean | null;
    is_moderator: boolean | null;
    is_primary_admin: boolean | null;
    is_muted: boolean | null;
    mute_expires: number | null;
    is_voice_banned: boolean | null;
    ban_expires: number | null;
    server_creation_plan: string | null;
    server_creation_plan_source: string | null;
    server_creation_plan_start: string | null;
    server_creation_plan_end: string | null;
    user_level: string | null;
    user_level_source: string | null;
    user_level_start_at: string | null;
    user_level_end_at: string | null;
    created_at: string | null;
    owned_server_count: number;
  }>(
    `SELECT p.id::text, p.name, p.email, p.display_name, p.first_name, p.last_name,
            p.avatar, p.role, p.is_admin, p.is_moderator, p.is_primary_admin,
            p.is_muted, p.mute_expires, p.is_voice_banned, p.ban_expires,
            p.server_creation_plan, p.server_creation_plan_source,
            p.server_creation_plan_start::text, p.server_creation_plan_end::text,
            p.user_level, p.user_level_source,
            p.user_level_start_at::text, p.user_level_end_at::text,
            p.created_at::text,
            COALESCE((SELECT COUNT(*) FROM servers s WHERE s.owner_user_id = p.id), 0)::int AS owned_server_count
       FROM profiles p
       ${whereSql}
       ${orderSql}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  if (profileRows.length === 0) {
    return { items: [], total, limit, offset };
  }
  const items: AdminUserRow[] = profileRows.map((p) => {
    const plan = (p.server_creation_plan as PlanKey | 'none' | null) ?? 'none';
    const planStatus = computePlanStatus(plan, p.server_creation_plan_end);
    const first = (p.first_name ?? '').trim();
    const last = (p.last_name ?? '').trim();
    const fullName = `${first} ${last}`.trim() || null;
    const roleRaw = (p.role ?? 'user') as AdminUserRow['role'];
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: fullName,
      display_name: p.display_name,
      username: p.name,
      email: p.email,
      avatar: p.avatar,
      role: roleRaw,
      is_admin: !!p.is_admin,
      is_moderator: !!p.is_moderator,
      is_primary_admin: !!p.is_primary_admin,
      is_muted: !!p.is_muted,
      mute_expires: p.mute_expires,
      is_voice_banned: !!p.is_voice_banned,
      ban_expires: p.ban_expires,
      plan: plan === null || plan === 'none' ? 'none' : plan,
      plan_source: (p.server_creation_plan_source as PlanSource | null) ?? null,
      plan_start_at: p.server_creation_plan_start,
      plan_end_at: p.server_creation_plan_end,
      plan_status: planStatus,
      user_level: p.user_level ?? null,
      user_level_source: (p.user_level_source as PlanSource | null) ?? null,
      user_level_start_at: p.user_level_start_at,
      user_level_end_at: p.user_level_end_at,
      owned_server_count: p.owned_server_count ?? 0,
      created_at: p.created_at,
    };
  });
  return { items, total, limit, offset };
}

export interface OwnedServerRow {
  id: string;
  name: string;
  plan: PlanKey;
  is_banned: boolean;
  member_count: number;
  created_at: string;
}

export async function listUserOwnedServers(userId: string): Promise<OwnedServerRow[]> {
  const rows = await queryMany<OwnedServerRow>(
    `SELECT s.id, s.name,
            COALESCE(sp.plan, s.plan, 'free') AS plan,
            COALESCE(s.is_banned, false) AS is_banned,
            COALESCE((SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id), 0)::int AS member_count,
            s.created_at
       FROM servers s
  LEFT JOIN server_plans sp ON sp.server_id = s.id
      WHERE s.owner_user_id = $1
      ORDER BY s.created_at DESC`,
    [userId],
  );
  return rows;
}

export type DurationType = '1week' | '1month' | '1year' | 'custom' | 'unlimited';

export interface SetUserPlanInput {
  adminUserId: string;
  adminToken: string;
  targetUserId: string;
  plan: PlanKey;
  durationType: DurationType;
  customEndAt?: string | null;
}

function computeEndAt(durationType: DurationType, customEndAt?: string | null): string | null {
  if (durationType === 'unlimited') return null;
  if (durationType === 'custom') {
    if (!customEndAt) throw new Error('custom süre için customEndAt gerekli');
    const t = Date.parse(customEndAt);
    if (Number.isNaN(t)) throw new Error('customEndAt geçerli ISO tarih değil');
    if (t <= Date.now()) throw new Error('customEndAt geçmiş tarih olamaz');
    return new Date(t).toISOString();
  }
  const now = new Date();
  if (durationType === '1week') now.setUTCDate(now.getUTCDate() + 7);
  else if (durationType === '1month') now.setUTCMonth(now.getUTCMonth() + 1);
  else if (durationType === '1year') now.setUTCFullYear(now.getUTCFullYear() + 1);
  return now.toISOString();
}

/** Paid plan'ı admin override ETMEZ. Manual plan tam kontrol. */
export async function setUserPlanManual(input: SetUserPlanInput): Promise<void> {
  // Guard: existing source check
  const existing = await queryOne<{ server_creation_plan: string | null; server_creation_plan_source: string | null }>(
    'SELECT server_creation_plan, server_creation_plan_source FROM profiles WHERE id = $1',
    [input.targetUserId],
  );
  if (existing && (existing as { server_creation_plan_source?: string }).server_creation_plan_source === 'paid') {
    const err = new Error('Ücretli (paid) planı admin override edemez');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const startAt = new Date().toISOString();
  const endAt = computeEndAt(input.durationType, input.customEndAt);

  const updated = await execute(
    `UPDATE profiles
        SET server_creation_plan = $1,
            server_creation_plan_source = 'manual',
            server_creation_plan_start = $2,
            server_creation_plan_end = $3
      WHERE id = $4`,
    [input.plan, startAt, endAt, input.targetUserId],
  );
  if (updated === 0) throw new Error('profile update failed: profile not found');

  await writeSystemAudit({
    adminUserId: input.adminUserId,
    action: 'system_admin_action.server.plan_change',
    targetType: 'profile',
    targetId: input.targetUserId,
    metadata: {
      plan: input.plan,
      source: 'manual',
      durationType: input.durationType,
      plan_start_at: startAt,
      plan_end_at: endAt,
      before: existing ?? null,
    },
  });
}

export async function revokeUserPlanManual(
  adminUserId: string,
  _adminToken: string,
  targetUserId: string,
): Promise<void> {
  const existing = await queryOne<{
    server_creation_plan: string | null;
    server_creation_plan_source: string | null;
    server_creation_plan_start: string | null;
    server_creation_plan_end: string | null;
  }>(
    'SELECT server_creation_plan, server_creation_plan_source, server_creation_plan_start::text, server_creation_plan_end::text FROM profiles WHERE id = $1',
    [targetUserId],
  );
  if (existing && (existing as { server_creation_plan_source?: string }).server_creation_plan_source === 'paid') {
    const err = new Error('Ücretli (paid) plan admin tarafından kaldırılamaz');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const updated = await execute(
    `UPDATE profiles
        SET server_creation_plan = 'none',
            server_creation_plan_source = NULL,
            server_creation_plan_start = NULL,
            server_creation_plan_end = NULL
      WHERE id = $1`,
    [targetUserId],
  );
  if (updated === 0) throw new Error('profile update failed: profile not found');

  await writeSystemAudit({
    adminUserId,
    action: 'system_admin_action.server.plan_change',
    targetType: 'profile',
    targetId: targetUserId,
    metadata: { action: 'revoke', before: existing ?? null },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Kullanıcı Seviyesi — Manuel atama / kaldırma (Plan ile simetrik)
// ═══════════════════════════════════════════════════════════════════

export interface SetUserLevelInput {
  adminUserId: string;
  adminToken: string;
  targetUserId: string;
  level: string;
  durationType: DurationType;
  customEndAt?: string | null;
}

/** Manuel seviye atama. paid kaynaklıysa admin override etmez. */
export async function setUserLevelManual(input: SetUserLevelInput): Promise<void> {
  const existing = await queryOne<{ user_level: string | null; user_level_source: string | null }>(
    'SELECT user_level, user_level_source FROM profiles WHERE id = $1',
    [input.targetUserId],
  );

  if (existing && (existing as { user_level_source?: string }).user_level_source === 'paid') {
    const err = new Error('Ücretli (paid) seviyeyi admin override edemez');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const startAt = new Date().toISOString();
  const endAt = computeEndAt(input.durationType, input.customEndAt);

  const updated = await execute(
    `UPDATE profiles
        SET user_level = $1,
            user_level_source = 'manual',
            user_level_start_at = $2,
            user_level_end_at = $3
      WHERE id = $4`,
    [input.level, startAt, endAt, input.targetUserId],
  );
  if (updated === 0) throw new Error('profile update failed: profile not found');

  await writeSystemAudit({
    adminUserId: input.adminUserId,
    action: 'system_admin_action.user.level_change',
    targetType: 'profile',
    targetId: input.targetUserId,
    metadata: {
      level: input.level,
      source: 'manual',
      durationType: input.durationType,
      user_level_start_at: startAt,
      user_level_end_at: endAt,
      before: existing ?? null,
    },
  });
}

/** Manuel seviyeyi kaldırır. paid kaynaklıysa yine yasak. */
export async function revokeUserLevelManual(
  adminUserId: string,
  _adminToken: string,
  targetUserId: string,
): Promise<void> {
  const existing = await queryOne<{
    user_level: string | null;
    user_level_source: string | null;
    user_level_start_at: string | null;
    user_level_end_at: string | null;
  }>(
    'SELECT user_level, user_level_source, user_level_start_at::text, user_level_end_at::text FROM profiles WHERE id = $1',
    [targetUserId],
  );

  if (existing && (existing as { user_level_source?: string }).user_level_source === 'paid') {
    const err = new Error('Ücretli (paid) seviye admin tarafından kaldırılamaz');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const endAt = new Date().toISOString();

  const updated = await execute(
    `UPDATE profiles
        SET user_level = NULL,
            user_level_source = NULL,
            user_level_end_at = $1
      WHERE id = $2`,
    [endAt, targetUserId],
  );
  if (updated === 0) throw new Error('profile update failed: profile not found');

  await writeSystemAudit({
    adminUserId,
    action: 'system_admin_action.user.level_change',
    targetType: 'profile',
    targetId: targetUserId,
    metadata: {
      action: 'revoke',
      user_level_end_at: endAt,
      before: existing ?? null,
    },
  });
}
