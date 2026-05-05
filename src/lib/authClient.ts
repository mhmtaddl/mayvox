const AUTH_API_BASE = import.meta.env.VITE_SERVER_API_URL || '';
const AUTH_TOKEN_KEY = 'mayvox-auth-token';

console.log('[authClient] API BASE:', AUTH_API_BASE);

export interface AuthProfile {
  id: string;
  email: string;
  name: string;
  username?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  age?: number | null;
  avatar?: string | null;
  is_admin?: boolean;
  is_primary_admin?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean;
  mute_expires?: number | null;
  is_voice_banned?: boolean;
  ban_expires?: number | null;
  must_change_password?: boolean;
  app_version?: string | null;
  last_seen_at?: string | null;
  total_usage_minutes?: number;
  show_last_seen?: boolean;
  server_creation_plan?: 'none' | 'free' | 'pro' | 'ultra' | null;
  user_level?: string | null;
  avatar_border_color?: string | null;
  allow_non_friend_dms?: boolean;
  dm_privacy_mode?: 'everyone' | 'mutual_servers' | 'friends_only' | 'closed' | null;
  show_dm_read_receipts?: boolean;
}

export interface AuthUser {
  userId: string;
  appUserId: string;
  profileId: string;
  email: string;
  username: string;
  role: 'user' | 'server_admin' | 'system_admin';
  profile: AuthProfile;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getAuthPayload(): { userId?: string; appUserId?: string; profileId?: string; email?: string; username?: string; role?: string } | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!AUTH_API_BASE) throw new Error('VITE_SERVER_API_URL tanımlı değil');
  const res = await fetch(`${AUTH_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `İstek başarısız (${res.status})`);
  return body as T;
}

export async function login(identifier: string, password: string): Promise<AuthResponse> {
  const result = await authFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  setAuthToken(result.token);
  return result;
}

export async function register(input: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  avatar?: string;
}): Promise<AuthResponse> {
  const result = await authFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setAuthToken(result.token);
  return result;
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return authFetch<{ user: AuthUser }>('/auth/me');
}

export function logout(): void {
  clearAuthToken();
}

export async function changePassword(password: string): Promise<void> {
  await authFetch<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function changeEmail(email: string): Promise<void> {
  await authFetch<{ ok: boolean }>('/auth/change-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
