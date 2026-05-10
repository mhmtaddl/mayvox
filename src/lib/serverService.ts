/**
 * MAYVOX Server Service
 * Sunucu CRUD + keşif + yönetim işlemleri — Hetzner backend API.
 */

import { getAuthToken } from './authClient';

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
  /** Son güncelleme zamanı (ISO). Backend `updated_at` kolonunun camelize hali.
   *  Eski response formatlarında gelmeyebilir → callsite optional fallback. */
  updatedAt?: string;
  inviteCode?: string;
  isPublic?: boolean;
  joinPolicy?: string;
  motto?: string;
  plan?: string;
  role?: string;
  /** Sistem yönetimi tarafından kısıtlanmış sunucu — görünüm açık, oda/sesli erişim kapalı. */
  isBanned?: boolean;
  bannedAt?: string | null;
  bannedReason?: string | null;
  bannedBy?: string | null;
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
  /** Kullanıcının bu sunucu için en son başvuru durumu. */
  myJoinRequestStatus?: 'pending' | 'accepted' | 'rejected' | null;
}

export interface ServerMember {
  userId: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  joinedAt: string;
  /** Sistem yönetimi voice mute — salt-okunur, moderator kaldıramaz. */
  isMuted: boolean;
  /** Sunucu-içi voice mute bitiş zamanı. null ise: aktif mute yok VEYA süresiz (voiceMutedBy ile birlikte değerlendir). */
  voiceMutedUntil: string | null;
  /** Aktif voice mute'u set eden moderator userId. null = aktif mute yok. */
  voiceMutedBy: string | null;
  /** Aktif timeout bitiş zamanı. null = timeout yok. */
  timeoutUntil: string | null;
  /** Aktif timeout'u veren moderator userId. */
  timeoutSetBy: string | null;
  /** Aktif chat ban bitiş zamanı. null = yok VEYA süresiz (chatBannedBy ile değerlendir). */
  chatBannedUntil: string | null;
  /** Chat ban'i uygulayan moderator userId. null = aktif chat ban yok. */
  chatBannedBy: string | null;
}

/**
 * Kullanıcının kendi moderation state'i — bu kişiye moderation uygulanmış mı?
 * GET /servers/:id/members/me/moderation-state
 */
export interface MyModerationState {
  timedOutUntil: string | null;
  voiceMutedUntil: string | null;
  isVoiceMuted: boolean;
  chatBannedUntil: string | null;
  isChatBanned: boolean;
}

/**
 * Timeout süre preset'leri (saniye). Backend ile birebir aynı liste.
 * UI'daki picker bu listeyi render eder; backend bunun dışındaki süreyi 400 ile reddeder.
 */
export const TIMEOUT_PRESETS_SECONDS = [60, 300, 600, 3600, 86400, 604800] as const;
export type TimeoutPresetSeconds = typeof TIMEOUT_PRESETS_SECONDS[number];

export const TIMEOUT_PRESET_LABELS: Record<TimeoutPresetSeconds, string> = {
  60:     '60 saniye',
  300:    '5 dakika',
  600:    '10 dakika',
  3600:   '1 saat',
  86400:  '1 gün',
  604800: '1 hafta',
};

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

const SEARCH_CACHE_TTL_MS = 30_000;
const serverSearchCache = new Map<string, { expiresAt: number; data: DiscoverServer[] }>();

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAuthToken();
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

/**
 * Frontend slug preview — backend generateBaseSlug ile paralel.
 * Max 6 karakter, lowercase ASCII, TR harfler normalize.
 * Çakışma durumunda backend numerik suffix ekler (preview görünmez).
 */
export function previewSlug(name: string): string {
  const cleaned = name.trim().toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
  const base = cleaned.slice(0, 6);
  return base ? base + '.mv' : '';
}

export async function createServer(name: string, description: string, isPublic: boolean, motto?: string, plan?: string): Promise<Server> {
  return apiFetch<Server>('/servers', { method: 'POST', body: JSON.stringify({ name, description, isPublic, motto, plan }) });
}

export async function joinServer(code: string): Promise<Server> {
  return apiFetch<Server>('/servers/join', { method: 'POST', body: JSON.stringify({ code }) });
}

// ── Join request (invite-only sunucu başvuru akışı) ──

export interface JoinRequestListItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
}

export async function createJoinRequest(serverId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/servers/${serverId}/join-requests`, { method: 'POST' });
}

export async function listJoinRequests(serverId: string, includeHistory = false): Promise<JoinRequestListItem[]> {
  const qs = includeHistory ? '?history=1' : '';
  return apiFetch<JoinRequestListItem[]>(`/servers/${serverId}/join-requests${qs}`);
}

export async function acceptJoinRequest(serverId: string, requestId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/join-requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectJoinRequest(serverId: string, requestId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/join-requests/${requestId}/reject`, { method: 'POST' });
}

export async function countPendingJoinRequests(serverId: string): Promise<number> {
  const r = await apiFetch<{ count: number }>(`/servers/${serverId}/join-requests/pending-count`);
  return r.count ?? 0;
}

export interface MyPendingJoinRequestsSummaryItem {
  serverId: string;
  serverName: string;
  serverAvatar: string | null;
  pendingCount: number;
}
export async function listMyPendingJoinRequestsSummary(): Promise<MyPendingJoinRequestsSummaryItem[]> {
  return apiFetch<MyPendingJoinRequestsSummaryItem[]>('/servers/my/pending-join-requests-summary');
}

export async function leaveServer(serverId: string): Promise<void> {
  return apiFetch<void>(`/servers/${serverId}/leave`, { method: 'POST' });
}

export async function deleteServer(serverId: string): Promise<void> {
  return apiFetch<void>(`/servers/${serverId}`, { method: 'DELETE' });
}

export async function searchServers(query: string): Promise<DiscoverServer[]> {
  const cacheKey = query.trim().toLocaleLowerCase('tr-TR');
  const now = Date.now();
  const cached = serverSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await apiFetch<DiscoverServer[]>(`/servers/search?q=${encodeURIComponent(query)}`);
  serverSearchCache.set(cacheKey, { expiresAt: now + SEARCH_CACHE_TTL_MS, data });
  return data;
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
  /** Kullanıcı kalıcı odası (is_default=false + is_persistent=true).
   *  Sistem odaları için de true. Kota hesabı: !isDefault && isPersistent. */
  isPersistent: boolean;
  ownerId: string | null;
  maxUsers: number | null;
  isInviteOnly: boolean;
  isHidden: boolean;
  mode: string | null;
  iconName: string | null;
  iconColor: string | null;
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
  iconName?: string | null;
  iconColor?: string | null;
  /** "Oda Kalıcılığı" toggle — undefined/true = persistent (default).
   *  false path şu an backend FEATURE_FLAGS.nonPersistentRoomsEnabled
   *  kapalı olduğu için yine persistent'e düşürülür. */
  isPersistent?: boolean;
}

export interface ChannelUpdatePayload {
  name?: string;
  mode?: string | null;
  maxUsers?: number | null;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  description?: string;
  iconName?: string | null;
  iconColor?: string | null;
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
    body: JSON.stringify({ updates, expectedOrderToken: orderToken, orderToken }),
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
    canViewInsights: boolean;
  };
  isBanned?: boolean;
}

// ── Insights (voice aktivite içgörüleri) ──
export type InsightsRangeDays = 7 | 30 | 90;

export interface InsightsUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalSec: number;
  sessionCount: number;
  avgSessionMin: number;
}
export interface InsightsPair {
  userA: { id: string; name: string | null; avatar: string | null };
  userB: { id: string; name: string | null; avatar: string | null };
  totalSec: number;
  lastOverlapAt: string | null;
}
export interface InsightsGroup {
  members: Array<{ id: string; name: string | null; avatar: string | null }>;
  totalSec: number;
  lastTogetherAt: string | null;
}
export interface InsightNarrative {
  id: string;
  type: 'highlight' | 'insight' | 'warning';
  title: string;
  text: string;
}
export interface InsightsHourCell {
  dow: number;
  hour: number;
  totalSec: number;
  sessionCount: number;
  uniqueUsers: number;
}
export interface InsightsResponse {
  range: { days: number; start: string; end: string };
  topActiveUsers: InsightsUser[];
  topSocialPairs: InsightsPair[];
  topSocialGroups: InsightsGroup[];
  peakHours: InsightsHourCell[];
  userActivityMap: Record<string, { displayName: string | null; hourlyDistribution: number[] }>;
  /** Materialized view son refresh zamanı (ISO). null = henüz refresh olmamış / bilinmiyor. */
  heatmapRefreshedAt?: string | null;
  /** Rule-based kısa insight cümleleri (3-4 adet). Backend eski sürümde yoksa undefined. */
  narratives?: InsightNarrative[];
}

export async function getServerInsights(serverId: string, range: InsightsRangeDays): Promise<InsightsResponse> {
  const rangeStr = `${range}d` as '7d' | '30d' | '90d';
  return apiFetch<InsightsResponse>(`/servers/${serverId}/insights?range=${rangeStr}`);
}

/** Aktivite haritası MV'sini manuel refresh et. Backend { refreshedAt } döner;
 *  UI bunu anında "Son güncelleme" etiketine yansıtır, ardından insights'ı tekrar çeker. */
export async function refreshServerInsights(serverId: string): Promise<{ refreshedAt: string }> {
  return apiFetch<{ refreshedAt: string }>(`/servers/${serverId}/insights/refresh`, { method: 'POST' });
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

// ── Admin Panel: audit / roles / overview ──

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ServerRoleSummary {
  id: string;
  name: string;
  priority: number;
  isSystem: boolean;
  capabilities: string[];
  memberCount: number;
}

export interface ServerOverview {
  serverId: string;
  plan: string;
  limits: {
    /** Toplam oda cap (systemRooms + extraPersistentRooms + maxNonPersistentRooms) */
    maxTotalRooms: number;
    maxMembers: number;
    /** Kullanıcı kalıcı oda kotası — 0 / 2 / 6 (free / pro / ultra) */
    extraPersistentRooms: number;
    /** Sabit 4, referans için */
    systemRooms: number;
    maxInviteLinksPerDay: number;
  };
  counts: {
    members: number;
    channels: number;
    /** Kullanıcı kalıcı oda sayısı (is_default=false AND is_persistent=true) */
    persistentRooms: number;
    activeInviteLinks: number;
    inviteLinksLast24h: number;
  };
}

export async function getAuditLog(serverId: string, opts: { limit?: number; action?: string } = {}): Promise<AuditLogItem[]> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.action) qs.set('action', opts.action);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AuditLogItem[]>(`/servers/${serverId}/audit-log${suffix}`);
}

export async function getServerRoles(serverId: string): Promise<ServerRoleSummary[]> {
  return apiFetch<ServerRoleSummary[]>(`/servers/${serverId}/roles`);
}

export async function getServerOverview(serverId: string): Promise<ServerOverview> {
  return apiFetch<ServerOverview>(`/servers/${serverId}/overview`);
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

// ── Moderation voice actions (migration 023) ──
// Backend ayrıntı: kendine aksiyon ve owner'a aksiyon backend tarafında 403 döner.
// LiveKit env yoksa aktif odadan düşürme no-op olur; DB + audit çalışır.

/**
 * Sunucu-içi voice mute.
 * @param expiresInSeconds  null = süresiz. Pozitif sayı = süreli.
 */
export async function muteMember(
  serverId: string,
  userId: string,
  expiresInSeconds: number | null,
): Promise<{ expiresAt: string | null }> {
  const body = JSON.stringify({ expiresInSeconds });
  return apiFetch<{ expiresAt: string | null }>(
    `/servers/${serverId}/members/${userId}/mute`,
    { method: 'POST', body },
  );
}

export async function unmuteMember(serverId: string, userId: string): Promise<{ wasActive: boolean }> {
  return apiFetch<{ wasActive: boolean }>(
    `/servers/${serverId}/members/${userId}/mute`,
    { method: 'DELETE' },
  );
}

/**
 * Chat ban — sunucu text odalarında mesaj yasağı. Voice/moderator yetkilerinden bağımsız.
 * @param expiresInSeconds null = süresiz; number = süreli (saniye).
 */
export async function chatBanMember(
  serverId: string,
  userId: string,
  expiresInSeconds: number | null = null,
): Promise<{ expiresAt: string | null }> {
  const body = JSON.stringify({ expiresInSeconds });
  return apiFetch<{ expiresAt: string | null }>(
    `/servers/${serverId}/members/${userId}/chat-ban`,
    { method: 'POST', body },
  );
}

export async function chatUnbanMember(serverId: string, userId: string): Promise<{ wasActive: boolean }> {
  return apiFetch<{ wasActive: boolean }>(
    `/servers/${serverId}/members/${userId}/chat-ban`,
    { method: 'DELETE' },
  );
}

/**
 * Zaman aşımı — Discord-vari. Mesaj yazamaz + voice join edemez + aktif voice'tan düşer.
 * @param durationSeconds TIMEOUT_PRESETS_SECONDS'dan biri olmak zorunda.
 */
export async function timeoutMember(
  serverId: string,
  userId: string,
  durationSeconds: TimeoutPresetSeconds,
): Promise<{ until: string; channelsAffected: number; livekitConfigured: boolean }> {
  const body = JSON.stringify({ durationSeconds });
  return apiFetch<{ until: string; channelsAffected: number; livekitConfigured: boolean }>(
    `/servers/${serverId}/members/${userId}/timeout`,
    { method: 'POST', body },
  );
}

export async function clearTimeoutMember(serverId: string, userId: string): Promise<{ wasActive: boolean }> {
  return apiFetch<{ wasActive: boolean }>(
    `/servers/${serverId}/members/${userId}/timeout`,
    { method: 'DELETE' },
  );
}

/** Ceza geçmişini sıfırla (audit log satırlarını siler, aktif cezalara dokunmaz). */
export async function resetMemberModerationHistory(serverId: string, userId: string): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>(
    `/servers/${serverId}/members/${userId}/moderation-history`,
    { method: 'DELETE' },
  );
}

/**
 * Voice room kick — aktif odadan tek seferlik çıkar. Kalıcı yasak değil; kullanıcı tekrar join edebilir.
 * @param channelId  verilirse sadece o odadan; null ise tüm voice odalardan.
 */
export async function kickFromRoom(
  serverId: string,
  userId: string,
  channelId: string | null = null,
): Promise<{ channelsAffected: number; livekitConfigured: boolean }> {
  const body = JSON.stringify({ channelId });
  return apiFetch<{ channelsAffected: number; livekitConfigured: boolean }>(
    `/servers/${serverId}/members/${userId}/room-kick`,
    { method: 'POST', body },
  );
}

/** Kullanıcının o sunucudaki aktif cezalarını oku — banner/enforcement için. */
export async function getMyModerationState(serverId: string): Promise<MyModerationState> {
  return apiFetch<MyModerationState>(`/servers/${serverId}/members/me/moderation-state`);
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

// ── Auto-moderation config (Faz 2) ──
export interface FloodConfig {
  enabled: boolean;
  cooldownMs: number;
  limit: number;
  windowMs: number;
}

export type AutoPunishmentAction = 'chat_timeout';
export interface AutoPunishmentFloodConfig {
  enabled: boolean;
  threshold: number;
  windowMinutes: number;
  action: AutoPunishmentAction;
  durationMinutes: number;
}

export interface ModerationConfigResponse {
  flood: FloodConfig;
  profanity: { enabled: boolean; words: string[] };
  spam: { enabled: boolean };
  autoPunishment: { flood: AutoPunishmentFloodConfig };
}

export async function getModerationConfig(serverId: string): Promise<ModerationConfigResponse> {
  return apiFetch<ModerationConfigResponse>(`/servers/${serverId}/moderation-config`);
}

export async function updateModerationConfig(
  serverId: string,
  patch: {
    flood?: FloodConfig;
    profanity?: { enabled: boolean; words: string[] };
    spam?: { enabled: boolean };
    autoPunishment?: { flood?: AutoPunishmentFloodConfig };
  },
): Promise<void> {
  await apiFetch<unknown>(`/servers/${serverId}/moderation-config`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ── Moderation stats (Faz 4 telemetry) ──
export type ModStatRange = '5m' | '1h' | '24h';
export interface ModerationStats {
  floodBlocked: number;
  profanityBlocked: number;
  spamBlocked: number;
}

export async function getModerationStats(serverId: string, range: ModStatRange): Promise<ModerationStats> {
  return apiFetch<ModerationStats>(`/servers/${serverId}/moderation-stats?range=${encodeURIComponent(range)}`);
}

export type ModEventKind = 'flood' | 'profanity' | 'spam' | 'auto_punish';
export type ModTriggerKind = 'flood' | 'profanity' | 'spam';
export interface ModerationEvent {
  id: string;
  kind: ModEventKind;
  triggerKind: ModTriggerKind | null;
  userId: string | null;
  userName: string | null;
  userAvatar: string | null;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
}

export interface ActiveAutoPunishment {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  bannedAt: string;
  expiresAt: string;
}

/** Şu an aktif auto-mod kaynaklı chat-ban'lar. 403 → mod değil. */
export async function getActiveAutoPunishments(serverId: string): Promise<ActiveAutoPunishment[]> {
  return apiFetch<ActiveAutoPunishment[]>(`/servers/${serverId}/active-auto-punishments`);
}

export async function getModerationEvents(
  serverId: string,
  opts: { limit?: number; kind?: ModEventKind } = {},
): Promise<ModerationEvent[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.kind)  params.set('kind', opts.kind);
  const qs = params.toString();
  return apiFetch<ModerationEvent[]>(`/servers/${serverId}/moderation-events${qs ? `?${qs}` : ''}`);
}

export type RecommendationCategory = 'film' | 'series' | 'game' | 'music' | 'book' | 'hardware';
export type RecommendationStatus = 'active' | 'hidden' | 'deleted';

export interface RecommendationLink {
  label?: string;
  url: string;
}

export interface RecommendationItem {
  id: string;
  serverId: string;
  createdBy: string;
  createdByName: string | null;
  createdByAvatar: string | null;
  title: string;
  category: RecommendationCategory;
  description: string | null;
  coverUrl: string | null;
  tags: string[];
  links: RecommendationLink[];
  metadata: Record<string, unknown>;
  status: RecommendationStatus;
  averageRating: number;
  ratingCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationRating {
  id: string;
  itemId: string;
  serverId: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  score: number;
  updatedAt: string;
}

export interface RecommendationComment {
  id: string;
  itemId: string;
  serverId: string;
  createdBy: string;
  createdByName: string | null;
  createdByAvatar: string | null;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationPayload {
  title: string;
  category: RecommendationCategory;
  description?: string;
  coverUrl?: string;
  tags?: string[];
  links?: RecommendationLink[];
  metadata?: Record<string, unknown>;
}

export interface RecommendationFilters {
  category?: RecommendationCategory | 'all';
  q?: string;
  limit?: number;
}

export async function getServerRecommendations(
  serverId: string,
  filters: RecommendationFilters = {},
): Promise<RecommendationItem[]> {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return apiFetch<RecommendationItem[]>(`/servers/${serverId}/recommendations${qs ? `?${qs}` : ''}`);
}

export async function getServerRecommendation(serverId: string, itemId: string): Promise<RecommendationItem> {
  return apiFetch<RecommendationItem>(`/servers/${serverId}/recommendations/${itemId}`);
}

export async function createServerRecommendation(
  serverId: string,
  payload: RecommendationPayload,
): Promise<RecommendationItem> {
  return apiFetch<RecommendationItem>(`/servers/${serverId}/recommendations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadRecommendationCover(serverId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Kapak için sadece görsel dosyası seçebilirsin.');
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Kapak görseli 5MB altında olmalı.');
  const result = await apiFetch<{ url?: string; coverUrl?: string }>(`/servers/${serverId}/recommendations/cover`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      contentType: file.type || 'image/jpeg',
      dataBase64: await fileToBase64(file),
    }),
  });
  const url = String(result.coverUrl || result.url || '');
  if (!url) throw new Error('Kapak URL alınamadı');
  return url;
}

export async function updateServerRecommendation(
  serverId: string,
  itemId: string,
  payload: RecommendationPayload,
): Promise<RecommendationItem> {
  return apiFetch<RecommendationItem>(`/servers/${serverId}/recommendations/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function hideServerRecommendation(serverId: string, itemId: string): Promise<RecommendationItem> {
  return apiFetch<RecommendationItem>(`/servers/${serverId}/recommendations/${itemId}/hide`, { method: 'POST' });
}

export async function deleteServerRecommendation(serverId: string, itemId: string): Promise<void> {
  await apiFetch<void>(`/servers/${serverId}/recommendations/${itemId}`, { method: 'DELETE' });
}

export async function getRecommendationRatings(serverId: string, itemId: string): Promise<RecommendationRating[]> {
  return apiFetch<RecommendationRating[]>(`/servers/${serverId}/recommendations/${itemId}/ratings`);
}

export async function setRecommendationRating(
  serverId: string,
  itemId: string,
  score: number,
): Promise<{ item: RecommendationItem; myRating: RecommendationRating }> {
  return apiFetch<{ item: RecommendationItem; myRating: RecommendationRating }>(`/servers/${serverId}/recommendations/${itemId}/rating`, {
    method: 'PUT',
    body: JSON.stringify({ score }),
  });
}

export async function deleteRecommendationRating(serverId: string, itemId: string): Promise<{ item: RecommendationItem }> {
  return apiFetch<{ item: RecommendationItem }>(`/servers/${serverId}/recommendations/${itemId}/rating`, { method: 'DELETE' });
}

export async function getRecommendationComments(serverId: string, itemId: string): Promise<RecommendationComment[]> {
  return apiFetch<RecommendationComment[]>(`/servers/${serverId}/recommendations/${itemId}/comments`);
}

export async function upsertRecommendationComment(
  serverId: string,
  itemId: string,
  payload: { body: string; isSpoiler?: boolean },
): Promise<{ item: RecommendationItem; comment: RecommendationComment }> {
  return apiFetch<{ item: RecommendationItem; comment: RecommendationComment }>(`/servers/${serverId}/recommendations/${itemId}/comment`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteRecommendationComment(serverId: string, itemId: string, commentId: string): Promise<{ item: RecommendationItem }> {
  return apiFetch<{ item: RecommendationItem }>(`/servers/${serverId}/recommendations/${itemId}/comments/${commentId}`, { method: 'DELETE' });
}

export interface RoomActivityEvent {
  id: string;
  serverId: string;
  channelId: string;
  type: string;
  actorId: string | null;
  targetUserId: string | null;
  label: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string | null;
}

export async function listRoomActivityEvents(
  serverId: string,
  channelId: string,
  limit = 75,
): Promise<RoomActivityEvent[]> {
  return apiFetch<RoomActivityEvent[]>(
    `/servers/${serverId}/channels/${encodeURIComponent(channelId)}/activity-events?limit=${Math.max(1, Math.min(75, limit))}`,
  );
}

export async function clearRoomActivityEvents(serverId: string, channelId: string): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>(
    `/servers/${serverId}/channels/${encodeURIComponent(channelId)}/activity-events`,
    { method: 'DELETE' },
  );
}

/** Moderation events export — XLSX (ExcelJS server-side). Browser download tetikler. */
export async function exportModerationEventsXlsx(
  serverId: string,
  opts: { kind?: ModEventKind } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (opts.kind) params.set('kind', opts.kind);
  const qs = params.toString();
  const path = `/servers/${serverId}/moderation-events/export${qs ? `?${qs}` : ''}`;
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `Dışa aktarım başarısız (${res.status})`);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] || `moderasyon-kayitlari-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
