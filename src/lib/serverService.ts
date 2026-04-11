/**
 * MAYVOX Server Service
 * Sunucu CRUD + keşif + yönetim işlemleri — Hetzner backend API.
 */

import { supabase } from './supabase';

export interface Server {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  avatarUrl?: string;
  description: string;
  memberCount: number;
  activeCount: number;
  capacity: number;
  level: number;
  createdAt: string;
  inviteCode?: string;
  isPublic?: boolean;
  joinPolicy?: string;
  motto?: string;
  plan?: string;
  role?: string;
}

export interface DiscoverServer {
  id: string;
  name: string;
  shortName: string;
  slug?: string;
  avatarUrl?: string;
  description: string;
  motto?: string;
  memberCount: number;
  activeCount?: number;
  capacity?: number;
  isPublic?: boolean;
  joinPolicy?: string;
  plan?: string;
  createdAt?: string;
  role?: string;
}

export interface ServerMember {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  joinedAt: string;
  isMuted: boolean;
}

export interface UserInvite {
  id: string;
  serverId: string;
  serverName: string;
  serverAvatar: string | null;
  invitedBy: string;
  invitedByName: string;
  status: string;
  createdAt: string;
}

export interface SentInvite {
  id: string;
  invitedUserId: string;
  invitedUserName: string;
  status: string;
  createdAt: string;
}

export interface ServerInvite {
  id: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ServerBan {
  userId: string;
  reason: string;
  bannedBy: string;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_SERVER_API_URL || '';
if (!API_BASE) console.error('[serverService] VITE_SERVER_API_URL tanımlı değil — API çağrıları başarısız olacak');

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (res.status === 401) throw new Error('Oturum süresi dolmuş, tekrar giriş yap');
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `İstek başarısız (${res.status})`);
  }
  return res.json();
}

// ── Temel CRUD ──

export async function listMyServers(): Promise<Server[]> {
  return apiFetch<Server[]>('/servers/my');
}

export function previewSlug(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 3).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (words.length === 0 || !words[0]) return '';
  let base = '';
  if (words.length === 1) base = words[0].slice(0, 3);
  else if (words.length === 2) base = words[0][0] + words[1].slice(0, 2);
  else base = words.map(w => w[0] || '').join('');
  return base ? base + '.mv' : '';
}

export async function createServer(name: string, description: string, isPublic: boolean, motto?: string, plan?: string): Promise<Server> {
  return apiFetch<Server>('/servers', { method: 'POST', body: JSON.stringify({ name, description, isPublic, motto, plan }) });
}

export async function joinServer(code: string): Promise<Server> {
  return apiFetch<Server>('/servers/join', { method: 'POST', body: JSON.stringify({ code }) });
}

export async function leaveServer(serverId: string): Promise<void> {
  return apiFetch<void>(`/servers/${serverId}/leave`, { method: 'POST' });
}

export async function deleteServer(serverId: string): Promise<void> {
  return apiFetch<void>(`/servers/${serverId}`, { method: 'DELETE' });
}

export async function searchServers(query: string): Promise<DiscoverServer[]> {
  return apiFetch<DiscoverServer[]>(`/servers/search?q=${encodeURIComponent(query)}`);
}

// ── Sunucu kanalları ──

export interface ServerChannel {
  id: string;
  server_id: string;
  name: string;
  description: string;
  type: 'voice' | 'text';
  position: number;
  is_default: boolean;
  created_at: string;
}

export async function getServerChannels(serverId: string): Promise<ServerChannel[]> {
  return apiFetch<ServerChannel[]>(`/servers/${serverId}/channels`);
}

// ── Sunucu yönetimi ──

export async function getServerDetails(serverId: string): Promise<Server> {
  return apiFetch<Server>(`/servers/${serverId}`);
}

export async function updateServer(serverId: string, updates: Partial<{ name: string; description: string; slug: string; isPublic: boolean; joinPolicy: string; capacity: number }>): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

// ── Üye yönetimi ──

export async function getMembers(serverId: string): Promise<ServerMember[]> {
  return apiFetch<ServerMember[]>(`/servers/${serverId}/members`);
}

export async function sendServerInvite(serverId: string, userId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/members/invite`, { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function getSentInvites(serverId: string): Promise<SentInvite[]> {
  return apiFetch<SentInvite[]>(`/servers/${serverId}/members/invites`);
}

export async function cancelSentInvite(serverId: string, inviteId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/members/invites/${inviteId}`, { method: 'DELETE' });
}

export async function getMyInvites(): Promise<UserInvite[]> {
  return apiFetch<UserInvite[]>('/servers/invites/incoming');
}

export async function acceptServerInvite(inviteId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/invites/${inviteId}/accept`, { method: 'POST' });
}

export async function declineServerInvite(inviteId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/invites/${inviteId}/decline`, { method: 'POST' });
}

export async function kickMember(serverId: string, userId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/members/${userId}/kick`, { method: 'POST' });
}

export async function changeRole(serverId: string, userId: string, role: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/members/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export async function banMember(serverId: string, userId: string, reason: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/members/${userId}/ban`, { method: 'POST', body: JSON.stringify({ reason }) });
}

// ── Ban yönetimi ──

export async function getBans(serverId: string): Promise<ServerBan[]> {
  return apiFetch<ServerBan[]>(`/servers/${serverId}/bans`);
}

export async function unbanMember(serverId: string, userId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/bans/${userId}`, { method: 'DELETE' });
}

// ── Davet yönetimi ──

export async function getInvites(serverId: string): Promise<ServerInvite[]> {
  return apiFetch<ServerInvite[]>(`/servers/${serverId}/invites`);
}

export async function createInvite(serverId: string, maxUses: number | null, expiresInHours: number | null): Promise<ServerInvite> {
  return apiFetch<ServerInvite>(`/servers/${serverId}/invites`, { method: 'POST', body: JSON.stringify({ maxUses, expiresInHours }) });
}

export async function deleteInvite(serverId: string, inviteId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/invites/${inviteId}`, { method: 'DELETE' });
}
