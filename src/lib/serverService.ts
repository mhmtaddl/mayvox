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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (res.status === 401) throw new ApiError(401, 'Oturum süresi dolmuş, tekrar giriş yap');
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `İstek başarısız (${res.status})`);
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
  serverId: string;
  name: string;
  description: string;
  type: 'voice' | 'text';
  position: number;
  isDefault: boolean;
  ownerId: string | null;
  maxUsers: number | null;
  isInviteOnly: boolean;
  isHidden: boolean;
  mode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelCreatePayload {
  name: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
}

export interface ChannelUpdatePayload {
  name?: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
}

export interface ChannelListPayload {
  channels: ServerChannel[];
  orderToken: string | null;
}

export async function getServerChannels(serverId: string): Promise<ChannelListPayload> {
  return apiFetch<ChannelListPayload>(`/servers/${serverId}/channels`);
}

export async function createServerChannel(serverId: string, payload: ChannelCreatePayload): Promise<ServerChannel> {
  return apiFetch<ServerChannel>(`/servers/${serverId}/channels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateServerChannel(serverId: string, channelId: string, payload: ChannelUpdatePayload): Promise<ServerChannel> {
  return apiFetch<ServerChannel>(`/servers/${serverId}/channels/${channelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteServerChannel(serverId: string, channelId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/channels/${channelId}`, { method: 'DELETE' });
}

export async function reorderServerChannels(
  serverId: string,
  updates: Array<{ id: string; position: number }>,
  orderToken: string | null,
): Promise<ChannelListPayload> {
  return apiFetch<ChannelListPayload>(`/servers/${serverId}/channels/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ updates, orderToken }),
  });
}

// ── Kanal erişim yönetimi ──

export interface ChannelAccessEntry {
  userId: string;
  userName: string;
  grantedBy: string;
  createdAt: string;
}

export interface ChannelAccessSummary {
  canSee: boolean;
  canJoin: boolean;
  reason: 'public' | 'server-admin' | 'channel-owner' | 'granted' | 'hidden' | 'invite-only' | 'not-member' | 'not-found';
}

export async function getChannelAccess(serverId: string, channelId: string): Promise<ChannelAccessEntry[]> {
  const res = await apiFetch<{ entries: ChannelAccessEntry[] }>(`/servers/${serverId}/channels/${channelId}/access`);
  return res.entries;
}

export async function grantChannelAccess(serverId: string, channelId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/channels/${channelId}/access`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function revokeChannelAccess(serverId: string, channelId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/channels/${channelId}/access/${userId}`, {
    method: 'DELETE',
  });
}

export async function checkChannelAccess(serverId: string, channelId: string): Promise<ChannelAccessSummary> {
  return apiFetch<ChannelAccessSummary>(`/servers/${serverId}/channels/${channelId}/access/check`);
}

// ── Capability foundation: server access context ──

import type { Capability } from './capabilities';

export interface ServerAccessContext {
  userId: string;
  serverId: string;
  membership: {
    exists: boolean;
    isOwner: boolean;
    baseRole: string | null;
  };
  roles: Array<{ id: string; name: string; priority: number }>;
  capabilities: Capability[];
  plan: { type: string };
  limits: { maxChannels?: number; maxMembers?: number; maxInvites?: number };
  flags: {
    canCreateChannel: boolean;
    canUpdateChannel: boolean;
    canDeleteChannel: boolean;
    canReorderChannels: boolean;
    canManageServer: boolean;
    canCreateInvite: boolean;
    canRevokeInvite: boolean;
    canJoinPrivateChannel: boolean;
    canViewPrivateChannel: boolean;
    canMoveMembers: boolean;
    canKickMembers: boolean;
    canManageRoles: boolean;
  };
}

export async function getServerAccessContext(serverId: string): Promise<ServerAccessContext> {
  return apiFetch<ServerAccessContext>(`/servers/${serverId}/access-context`);
}

export function hasCapability(ctx: ServerAccessContext | null, cap: Capability): boolean {
  return !!ctx && ctx.capabilities.includes(cap);
}

// ── Invite V2: link invite'lar ──

export type InviteScope = 'server' | 'channel';
export type InviteLinkState = 'active' | 'expired' | 'revoked' | 'exhausted';

export interface InviteLinkResponse {
  id: string;
  serverId: string;
  channelId: string | null;
  scope: InviteScope;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
  state: InviteLinkState;
}

export interface InviteLinkCreateResponse extends InviteLinkResponse {
  token: string;
}

export interface InviteLinkCreatePayload {
  scope: InviteScope;
  channelId?: string | null;
  expiresInHours?: number | null;
  maxUses?: number | null;
}

export interface InviteLinkPreview {
  valid: boolean;
  serverId?: string;
  serverName?: string;
  scope?: InviteScope;
  channelId?: string | null;
  channelName?: string | null;
}

export interface InviteAcceptResult {
  scope: InviteScope;
  serverId: string;
  channelId: string | null;
  alreadyApplied: boolean;
}

export async function createInviteLink(serverId: string, payload: InviteLinkCreatePayload): Promise<InviteLinkCreateResponse> {
  return apiFetch<InviteLinkCreateResponse>(`/servers/${serverId}/invite-links`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listInviteLinks(serverId: string, opts: { channelId?: string; includeInactive?: boolean } = {}): Promise<InviteLinkResponse[]> {
  const qs = new URLSearchParams();
  if (opts.channelId) qs.set('channelId', opts.channelId);
  if (opts.includeInactive) qs.set('includeInactive', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<InviteLinkResponse[]>(`/servers/${serverId}/invite-links${suffix}`);
}

export async function revokeInviteLink(serverId: string, inviteId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/invite-links/${inviteId}`, { method: 'DELETE' });
}

export async function previewInviteLink(token: string): Promise<InviteLinkPreview> {
  return apiFetch<InviteLinkPreview>(`/invite-links/preview?token=${encodeURIComponent(token)}`);
}

export async function acceptInviteLink(token: string): Promise<InviteAcceptResult> {
  return apiFetch<InviteAcceptResult>(`/invite-links/accept`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
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
