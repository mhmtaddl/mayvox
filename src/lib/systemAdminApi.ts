import { getAuthToken } from './authClient';

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
  owner_display_name: string | null;
  owner_full_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
}

export interface ListResult {
  items: AdminServerRow[];
  total: number;
  limit: number;
  offset: number;
}

const API_BASE = import.meta.env.VITE_SERVER_API_URL || '';

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, body.error || `İstek başarısız (${res.status})`);
  }
  return res.json();
}

export async function listAdminServers(params: { search?: string; limit?: number; offset?: number }): Promise<ListResult> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  q.set('limit', String(params.limit ?? 20));
  q.set('offset', String(params.offset ?? 0));
  return adminFetch<ListResult>(`/admin/servers?${q.toString()}`);
}

export async function deleteAdminServer(id: string, reason?: string): Promise<void> {
  await adminFetch<void>(`/admin/servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

export async function setAdminServerBanned(id: string, banned: boolean, reason?: string): Promise<void> {
  await adminFetch<void>(`/admin/servers/${encodeURIComponent(id)}/ban`, {
    method: 'PATCH',
    body: JSON.stringify({ banned, reason }),
  });
}

export async function setAdminServerPlan(id: string, plan: PlanKey): Promise<void> {
  await adminFetch<void>(`/admin/servers/${encodeURIComponent(id)}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  });
}

export async function forceOwnerLeave(id: string): Promise<{ newOwnerId: string | null; prevOwnerId: string }> {
  return adminFetch(`/admin/servers/${encodeURIComponent(id)}/force-owner-leave`, {
    method: 'PATCH',
  });
}

// ── Users admin ──

export type UserRole = 'user' | 'server_admin' | 'system_admin';
export type PlanSource = 'manual' | 'paid';
export type PlanStatus = 'active' | 'expired' | 'unlimited' | 'none';
export type DurationType = '1week' | '1month' | '1year' | 'custom' | 'unlimited';

export type UserLevel = string;
export type UserLevelStatus = 'active' | 'expired' | 'unlimited' | 'none';

export interface AdminUserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  full_name: string | null;
  username: string | null;
  email: string | null;
  avatar: string | null;
  role: UserRole;
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
  /** Manuel atanmış seviye anahtarı (örn. "1"|"2"|"3"); null = seviyesiz. */
  user_level?: string | null;
  user_level_source?: PlanSource | null;
  user_level_start_at?: string | null;
  user_level_end_at?: string | null;
  owned_server_count: number;
  created_at: string | null;
}

export interface ListUsersResult {
  items: AdminUserRow[];
  total: number;
  limit: number;
  offset: number;
}

export type UserSort = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';

export interface ListUsersParams {
  role?: 'admin' | 'mod' | 'user';
  plan?: PlanKey;
  planStatus?: PlanStatus;
  ownership?: 'has-server' | 'no-server' | 'only-owners';
  search?: string;
  sort?: UserSort;
  limit?: number;
  offset?: number;
}

export async function listAdminUsers(params: ListUsersParams): Promise<ListUsersResult> {
  const q = new URLSearchParams();
  if (params.role) q.set('role', params.role);
  if (params.plan) q.set('plan', params.plan);
  if (params.planStatus) q.set('planStatus', params.planStatus);
  if (params.ownership) q.set('ownership', params.ownership);
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  q.set('limit', String(params.limit ?? 25));
  q.set('offset', String(params.offset ?? 0));
  return adminFetch<ListUsersResult>(`/admin/users?${q.toString()}`);
}

export interface OwnedServerRow {
  id: string;
  name: string;
  plan: PlanKey;
  is_banned: boolean;
  member_count: number;
  created_at: string;
}

export async function listUserOwnedServers(userId: string): Promise<{ items: OwnedServerRow[] }> {
  return adminFetch<{ items: OwnedServerRow[] }>(`/admin/users/${encodeURIComponent(userId)}/servers`);
}

// ── User sessions (presence-backed) ────────────────────────────────────
export interface AdminUserSession {
  session_key: string;
  device_id: string;
  platform: 'desktop' | 'mobile' | 'web';
  app_version: string | null;
  connected_at: string;
  last_heartbeat_at: string;
  disconnected_at: string | null;
  disconnect_reason: string | null;
  is_active: boolean;
}

export async function getAdminUserSessions(
  userId: string,
): Promise<{ sessions: AdminUserSession[] }> {
  return adminFetch<{ sessions: AdminUserSession[] }>(
    `/admin/users/${encodeURIComponent(userId)}/sessions`,
  );
}

export async function setUserPlan(userId: string, payload: { plan: PlanKey; durationType: DurationType; customEndAt?: string }): Promise<void> {
  await adminFetch<void>(`/admin/users/${encodeURIComponent(userId)}/plan`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function revokeUserPlan(userId: string): Promise<void> {
  await adminFetch<void>(`/admin/users/${encodeURIComponent(userId)}/plan`, {
    method: 'DELETE',
  });
}

// ── Kullanıcı seviyesi (tema/özellik kademesi) — Plan ile aynı pattern ──
export async function setUserLevel(
  userId: string,
  payload: { level: string; durationType: DurationType; customEndAt?: string },
): Promise<void> {
  await adminFetch<void>(`/admin/users/${encodeURIComponent(userId)}/level`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function revokeUserLevel(userId: string): Promise<void> {
  await adminFetch<void>(`/admin/users/${encodeURIComponent(userId)}/level`, {
    method: 'DELETE',
  });
}
