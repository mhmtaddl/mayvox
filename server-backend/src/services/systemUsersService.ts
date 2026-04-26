import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { queryMany } from '../repositories/db';
import { writeSystemAudit } from './systemAuditService';

/**
 * systemUsersService
 * ─────────────────
 * Global kullanıcı yönetimi — profiller Supabase'de, sunucu sayıları backend
 * pg pool'da. 2-step merge ile tek yanıt üretir.
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

function serviceClient() {
  // Servis tarafı: RLS'i bypass etmek için anon yerine backend auth kullanıyoruz
  // ama profiles için anon yeterli olmalı (sistem admin kendi middleware'inde onaylandı).
  // Sadece admin rotalarından çağrılır; caller her zaman sistem admin.
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function scopedClient(token: string) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function listAllUsers(
  adminToken: string,
  opts: ListUsersOptions,
): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(opts.limit | 0, 1), 100);
  const offset = Math.max(opts.offset | 0, 0);
  const supa = scopedClient(adminToken);

  // 1) Supabase'ten paginated profile listesi — filtreler DB'de.
  let q = supa
    .from('profiles')
    .select(
      'id, name, email, display_name, first_name, last_name, avatar, role, is_admin, is_moderator, is_primary_admin, is_muted, mute_expires, is_voice_banned, ban_expires, server_creation_plan, server_creation_plan_source, server_creation_plan_start, server_creation_plan_end, user_level, user_level_source, user_level_start_at, user_level_end_at, created_at',
      { count: 'exact' },
    );

  // Role filter
  if (opts.role === 'admin') q = q.eq('is_admin', true);
  else if (opts.role === 'mod') q = q.eq('is_moderator', true).eq('is_admin', false);
  else if (opts.role === 'user') q = q.eq('is_admin', false).eq('is_moderator', false);

  // Plan filter
  if (opts.plan) q = q.eq('server_creation_plan', opts.plan);

  // Plan status filter (SQL-side)
  if (opts.planStatus === 'unlimited') {
    q = q.not('server_creation_plan', 'is', null).neq('server_creation_plan', 'none').is('server_creation_plan_end', null);
  } else if (opts.planStatus === 'active') {
    q = q.not('server_creation_plan', 'is', null).neq('server_creation_plan', 'none').gt('server_creation_plan_end', new Date().toISOString());
  } else if (opts.planStatus === 'expired') {
    q = q.not('server_creation_plan_end', 'is', null).lt('server_creation_plan_end', new Date().toISOString());
  } else if (opts.planStatus === 'none') {
    q = q.or('server_creation_plan.is.null,server_creation_plan.eq.none');
  }

  // Search (name, email)
  const s = (opts.search ?? '').trim();
  if (s) {
    const esc = s.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.or(`display_name.ilike.%${esc}%,name.ilike.%${esc}%,email.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%`);
  }

  // Sıralama
  switch (opts.sort) {
    case 'name-asc':
      q = q.order('name', { ascending: true, nullsFirst: false });
      break;
    case 'name-desc':
      q = q.order('name', { ascending: false, nullsFirst: false });
      break;
    case 'created-asc':
      q = q.order('created_at', { ascending: true });
      break;
    case 'created-desc':
    default:
      q = q.order('created_at', { ascending: false });
      break;
  }
  q = q.range(offset, offset + limit - 1);

  const { data: profiles, error, count } = await q;
  if (error) {
    throw new Error(`profile query failed: ${error.message}`);
  }

  const profileRows = (profiles ?? []) as Array<{
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
  }>;

  if (profileRows.length === 0) {
    return { items: [], total: count ?? 0, limit, offset };
  }

  // 2) Backend pg pool'dan owned_server_count (tek batch query).
  const ids = profileRows.map((p) => p.id);
  const counts = await queryMany<{ owner_user_id: string; n: string }>(
    'SELECT owner_user_id, COUNT(*)::text AS n FROM servers WHERE owner_user_id = ANY($1::text[]) GROUP BY owner_user_id',
    [ids],
  );
  const countMap = new Map<string, number>(counts.map((c) => [c.owner_user_id, parseInt(c.n, 10) || 0]));

  // Ownership filter — son aşamada uygulanır (Supabase bilmediği için).
  // NOT: own-server filter'ı uygulanırken paginationın doğruluğu bozulur;
  // bu durumda SQL-side'e çekmek gerek. Şimdilik ownership filtresi için
  // ek path kullanıyoruz (ownership=only-owners ⇢ ayrı endpoint daha iyi).
  let items: AdminUserRow[] = profileRows.map((p) => {
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
      owned_server_count: countMap.get(p.id) ?? 0,
      created_at: p.created_at,
    };
  });

  // Ownership post-filter
  if (opts.ownership === 'has-server' || opts.ownership === 'only-owners') {
    items = items.filter((u) => u.owned_server_count > 0);
  } else if (opts.ownership === 'no-server') {
    items = items.filter((u) => u.owned_server_count === 0);
  }

  return { items, total: count ?? items.length, limit, offset };
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
  const supa = scopedClient(input.adminToken);
  // Guard: existing source check
  const { data: existing, error: readErr } = await supa
    .from('profiles')
    .select('server_creation_plan, server_creation_plan_source')
    .eq('id', input.targetUserId)
    .maybeSingle();
  if (readErr) throw new Error(`profile read failed: ${readErr.message}`);
  if (existing && (existing as { server_creation_plan_source?: string }).server_creation_plan_source === 'paid') {
    const err = new Error('Ücretli (paid) planı admin override edemez');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const startAt = new Date().toISOString();
  const endAt = computeEndAt(input.durationType, input.customEndAt);

  const { error: updErr } = await supa
    .from('profiles')
    .update({
      server_creation_plan: input.plan,
      server_creation_plan_source: 'manual',
      server_creation_plan_start: startAt,
      server_creation_plan_end: endAt,
    })
    .eq('id', input.targetUserId);
  if (updErr) throw new Error(`profile update failed: ${updErr.message}`);

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
  adminToken: string,
  targetUserId: string,
): Promise<void> {
  const supa = scopedClient(adminToken);
  const { data: existing, error: readErr } = await supa
    .from('profiles')
    .select('server_creation_plan, server_creation_plan_source, server_creation_plan_start, server_creation_plan_end')
    .eq('id', targetUserId)
    .maybeSingle();
  if (readErr) throw new Error(`profile read failed: ${readErr.message}`);
  if (existing && (existing as { server_creation_plan_source?: string }).server_creation_plan_source === 'paid') {
    const err = new Error('Ücretli (paid) plan admin tarafından kaldırılamaz');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const { error: updErr } = await supa
    .from('profiles')
    .update({
      server_creation_plan: 'none',
      server_creation_plan_source: null,
      server_creation_plan_start: null,
      server_creation_plan_end: null,
    })
    .eq('id', targetUserId);
  if (updErr) throw new Error(`profile update failed: ${updErr.message}`);

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
  const supa = scopedClient(input.adminToken);

  const { data: existing, error: readErr } = await supa
    .from('profiles')
    .select('user_level, user_level_source')
    .eq('id', input.targetUserId)
    .maybeSingle();
  if (readErr) throw new Error(`profile read failed: ${readErr.message}`);

  if (existing && (existing as { user_level_source?: string }).user_level_source === 'paid') {
    const err = new Error('Ücretli (paid) seviyeyi admin override edemez');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const startAt = new Date().toISOString();
  const endAt = computeEndAt(input.durationType, input.customEndAt);

  const { error: updErr } = await supa
    .from('profiles')
    .update({
      user_level: input.level,
      user_level_source: 'manual',
      user_level_start_at: startAt,
      user_level_end_at: endAt,
    })
    .eq('id', input.targetUserId);
  if (updErr) throw new Error(`profile update failed: ${updErr.message}`);

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
  adminToken: string,
  targetUserId: string,
): Promise<void> {
  const supa = scopedClient(adminToken);

  const { data: existing, error: readErr } = await supa
    .from('profiles')
    .select('user_level, user_level_source, user_level_start_at, user_level_end_at')
    .eq('id', targetUserId)
    .maybeSingle();
  if (readErr) throw new Error(`profile read failed: ${readErr.message}`);

  if (existing && (existing as { user_level_source?: string }).user_level_source === 'paid') {
    const err = new Error('Ücretli (paid) seviye admin tarafından kaldırılamaz');
    (err as Error & { code?: number }).code = 403;
    throw err;
  }

  const endAt = new Date().toISOString();

  const { error: updErr } = await supa
    .from('profiles')
    .update({
      user_level: null,
      user_level_source: null,
      user_level_end_at: endAt,
    })
    .eq('id', targetUserId);
  if (updErr) throw new Error(`profile update failed: ${updErr.message}`);

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

// unused helper suppressed
void serviceClient;
