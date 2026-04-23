import { queryMany, queryOne } from '../repositories/db';
import { getPlanLimits, type PlanLimits } from '../planConfig';
import { CAPABILITIES, type Capability } from '../capabilities';
import { AppError } from './serverService';

export interface RoleSummary {
  id: string;
  name: string;
  priority: number;
}

export interface AccessLimits {
  /** Kullanıcının açabileceği kalıcı oda kotası (sistem odalarından ayrı).
   *  Free=0, Pro=2, Ultra=6. 0 ise create button UI'da gizlenir.
   *  Authoritative enforcement: planService.assertLimit('persistentRoom.create'). */
  maxChannels?: number;
  maxMembers?: number;
  maxInvites?: number;
}

export interface AccessFlags {
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
}

/**
 * Moderation state — sunucu-içi ceza bilgisi (migration 023).
 * Lazy expiration: dolmuş değerler null döner.
 * Cache TTL 5sn; timeout'un minimum süresi 60s olduğundan gözlemlenebilir gecikme yok.
 */
export interface AccessModerationState {
  /** Aktif timeout bitiş zamanı (ISO). null = timeout yok. */
  timedOutUntil: string | null;
  /** Aktif voice mute bitiş zamanı (ISO). null = süresiz ise "permanent", yoksa null. */
  voiceMutedUntil: string | null;
  /** true = sunucu-içi voice mute aktif (süreli veya süresiz). is_muted sistem yönetimi alanından AYRI. */
  isVoiceMuted: boolean;
  /** Aktif chat ban bitiş zamanı (ISO). null = chat ban yok veya süresiz-boş. */
  chatBannedUntil: string | null;
  /** true = sunucu text odalarında mesaj yasağı aktif (süreli veya süresiz). */
  isChatBanned: boolean;
}

export interface ServerAccessContext {
  userId: string;
  serverId: string;
  membership: {
    exists: boolean;
    isOwner: boolean;
    baseRole: string | null;
  };
  roles: RoleSummary[];
  capabilities: Capability[];
  plan: { type: string };
  limits: AccessLimits;
  flags: AccessFlags;
  /** Server system admin tarafından kısıtlanmış (restricted mode) — görünüm açık, oda join kapalı. */
  isBanned: boolean;
  /** Sunucu-içi moderation cezaları (mod/admin tarafından verilen). */
  moderation: AccessModerationState;
}

interface MembershipRow {
  role: string;
  plan: string | null;
  channel_count: number;
  member_count: number;
  owner_user_id: string;
  is_banned: boolean;
  timeout_until: string | null;
  voice_muted_by: string | null;
  voice_mute_expires_at: string | null;
  chat_banned_by: string | null;
  chat_ban_expires_at: string | null;
}

/**
 * Centralized flag derivation — `capabilities` raw auth truth; flags business convenience.
 * Tek yerde hesaplanır; endpoint'lerde veya frontend'te duplike türetilmemesi kritik.
 */
export function computeFlags(
  capabilities: ReadonlySet<string>,
  limits: AccessLimits,
  channelCount: number,
): AccessFlags {
  const has = (c: Capability) => capabilities.has(c);
  const maxCh = limits.maxChannels;
  // Yeni model (2026-04-19): maxCh = extraPersistentRooms kotası (0/2/6).
  // Free (maxCh=0) → create button UI'da gizli. Pro/Ultra → görünür; kota dolmuşsa
  // backend assertLimit 403 döner. Buradaki flag coarse hint; authority planService.
  const channelCapacityOk = maxCh === undefined ? true : maxCh > 0;
  void channelCount; // eski buffer heuristic kaldırıldı — backend authoritative.

  return {
    canCreateChannel: has(CAPABILITIES.CHANNEL_CREATE) && channelCapacityOk,
    canUpdateChannel: has(CAPABILITIES.CHANNEL_UPDATE),
    canDeleteChannel: has(CAPABILITIES.CHANNEL_DELETE),
    canReorderChannels: has(CAPABILITIES.CHANNEL_REORDER),
    canManageServer: has(CAPABILITIES.SERVER_MANAGE),
    canCreateInvite: has(CAPABILITIES.INVITE_CREATE),
    canRevokeInvite: has(CAPABILITIES.INVITE_REVOKE),
    canJoinPrivateChannel: has(CAPABILITIES.CHANNEL_JOIN_PRIVATE),
    canViewPrivateChannel: has(CAPABILITIES.CHANNEL_VIEW_PRIVATE),
    canMoveMembers: has(CAPABILITIES.MEMBER_MOVE),
    canKickMembers: has(CAPABILITIES.MEMBER_KICK),
    canManageRoles: has(CAPABILITIES.ROLE_MANAGE),
    canViewInsights: has(CAPABILITIES.INSIGHTS_VIEW),
  };
}

// ── Minimal in-process cache ─────────────────────────────────────────────
// Key: `userId:serverId`. TTL kısa (5 sn) — role change / kick gibi auth-sensitive
// mutation'lar invalidate edilir. Redis yok; tek-instance varsayımı.
const ACCESS_CACHE_TTL_MS = 5_000;
const accessCache = new Map<string, { ctx: ServerAccessContext; expiresAt: number }>();
const cacheKey = (u: string, s: string) => `${u}:${s}`;

export function invalidateAccessContext(userId: string, serverId: string): void {
  accessCache.delete(cacheKey(userId, serverId));
}

/** Bir sunucudaki tüm cache entry'lerini temizle — ör. kanal CRUD sonrası canCreateChannel drift önlemi. */
export function invalidateAccessContextForServer(serverId: string): void {
  const suffix = `:${serverId}`;
  for (const k of accessCache.keys()) {
    if (k.endsWith(suffix)) accessCache.delete(k);
  }
}

// GC — expired entry'leri 60 sn'de bir temizle. unref() process exit'i bloklamaz.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of accessCache) {
    if (now > v.expiresAt) accessCache.delete(k);
  }
}, 60_000).unref?.();

/**
 * getServerAccessContext — canonical authorization entry point.
 * 2 DB call: (1) membership+plan+counts, (2) roles + capabilities JOIN (N+1 yok).
 * 5 sn TTL cache; mutation path'leri invalidateAccessContext ile temizler.
 */
export async function getServerAccessContext(
  userId: string,
  serverId: string,
  options: { skipCache?: boolean } = {},
): Promise<ServerAccessContext> {
  const key = cacheKey(userId, serverId);
  if (!options.skipCache) {
    const hit = accessCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.ctx;
  }

  // 1) Membership + plan + counts + moderation state — tek query
  const membership = await queryOne<MembershipRow>(
    `SELECT
        sm.role AS role,
        sm.timeout_until AS timeout_until,
        sm.voice_muted_by AS voice_muted_by,
        sm.voice_mute_expires_at AS voice_mute_expires_at,
        sm.chat_banned_by AS chat_banned_by,
        sm.chat_ban_expires_at AS chat_ban_expires_at,
        s.plan AS plan,
        s.owner_user_id AS owner_user_id,
        COALESCE(s.is_banned, false) AS is_banned,
        COALESCE((SELECT COUNT(*) FROM channels WHERE server_id = s.id), 0)::int AS channel_count,
        COALESCE((SELECT COUNT(*) FROM server_members WHERE server_id = s.id), 0)::int AS member_count
     FROM server_members sm
     JOIN servers s ON s.id = sm.server_id
     WHERE sm.server_id = $1 AND sm.user_id = $2`,
    [serverId, userId],
  );

  if (!membership) {
    const ctx = emptyContext(userId, serverId);
    accessCache.set(key, { ctx, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS });
    return ctx;
  }

  // NOT: is_banned hard throw DEĞİL. Restricted mode: sunucu görünür, sadece
  // oda join / voice connect gibi aktif eylemler engellenir. Specific route'lar
  // assertServerNotBanned() ile kendini korur.

  // 2) Roles + capabilities — tek JOIN ile (N+1 yok)
  const roleCapRows = await queryMany<{
    role_id: string;
    role_name: string;
    role_priority: number;
    capability: string | null;
  }>(
    `SELECT r.id AS role_id, r.name AS role_name, r.priority AS role_priority, rc.capability
     FROM member_roles mr
     JOIN roles r ON r.id = mr.role_id
     LEFT JOIN role_capabilities rc ON rc.role_id = r.id
     WHERE mr.server_id = $1 AND mr.user_id = $2`,
    [serverId, userId],
  );

  // Satırları role + cap map'lerine böl
  const roleMap = new Map<string, RoleSummary>();
  const capSet = new Set<Capability>();
  for (const r of roleCapRows) {
    if (!roleMap.has(r.role_id)) {
      roleMap.set(r.role_id, { id: r.role_id, name: r.role_name, priority: r.role_priority });
    }
    if (r.capability) capSet.add(r.capability as Capability);
  }

  const roles = Array.from(roleMap.values()).sort((a, b) => b.priority - a.priority);

  // Legacy fallback: member_roles henüz backfill edilmemiş kullanıcı için
  if (capSet.size === 0 && membership.role) {
    for (const c of legacyCapabilitiesFor(membership.role)) capSet.add(c);
  }

  const isOwner = membership.owner_user_id === userId;
  if (isOwner) {
    for (const c of Object.values(CAPABILITIES)) capSet.add(c);
  }

  const planType = membership.plan || 'free';
  const planLimits: PlanLimits = getPlanLimits(planType);
  const limits: AccessLimits = {
    maxChannels: planLimits.customRooms,
    maxMembers: planLimits.capacity,
  };

  // Lazy expiration — geçmiş değerleri null'a indir (DB cleanup ayrı).
  const now = Date.now();
  const timeoutActive = !!membership.timeout_until && new Date(membership.timeout_until).getTime() > now;
  const voiceMuteActive = !!membership.voice_muted_by && (
    !membership.voice_mute_expires_at || new Date(membership.voice_mute_expires_at).getTime() > now
  );
  const chatBanActive = !!membership.chat_banned_by && (
    !membership.chat_ban_expires_at || new Date(membership.chat_ban_expires_at).getTime() > now
  );

  const ctx: ServerAccessContext = {
    userId,
    serverId,
    membership: {
      exists: true,
      isOwner,
      baseRole: membership.role || null,
    },
    roles,
    capabilities: Array.from(capSet),
    plan: { type: planType },
    limits,
    flags: computeFlags(capSet, limits, membership.channel_count),
    isBanned: !!membership.is_banned,
    moderation: {
      timedOutUntil: timeoutActive ? membership.timeout_until : null,
      voiceMutedUntil: voiceMuteActive ? membership.voice_mute_expires_at : null,
      isVoiceMuted: voiceMuteActive,
      chatBannedUntil: chatBanActive ? membership.chat_ban_expires_at : null,
      isChatBanned: chatBanActive,
    },
  };

  accessCache.set(key, { ctx, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS });
  return ctx;
}

function emptyContext(userId: string, serverId: string): ServerAccessContext {
  const limits: AccessLimits = {};
  return {
    userId,
    serverId,
    membership: { exists: false, isOwner: false, baseRole: null },
    roles: [],
    capabilities: [],
    plan: { type: 'free' },
    limits,
    flags: computeFlags(new Set(), limits, 0),
    isBanned: false,
    moderation: { timedOutUntil: null, voiceMutedUntil: null, isVoiceMuted: false, chatBannedUntil: null, isChatBanned: false },
  };
}

/**
 * Backfill edilmemiş kullanıcılar için fallback — server_members.role'dan
 * capability üret. 7 rol için kapsayıcı; SYSTEM_ROLE_CAPS ile aynı mental
 * model (wire 'mod' → sistem 'moderator' eşlemesi).
 *
 * Bilinmeyen rol → boş set (güvenli default). server_members.role kolonu
 * eskiden constraint'siz olduğu için bozuk veri olabilir.
 */
export function legacyCapabilitiesFor(legacyRole: string): Capability[] {
  switch (legacyRole) {
    case 'owner':
      return Object.values(CAPABILITIES);
    case 'super_admin':
      return Object.values(CAPABILITIES).filter(c => c !== CAPABILITIES.ROLE_MANAGE);
    case 'admin':
      return [
        CAPABILITIES.SERVER_VIEW,
        CAPABILITIES.SERVER_JOIN,
        CAPABILITIES.SERVER_MANAGE,
        CAPABILITIES.SERVER_MODERATION_UPDATE,
        CAPABILITIES.CHANNEL_CREATE,
        CAPABILITIES.CHANNEL_UPDATE,
        CAPABILITIES.CHANNEL_DELETE,
        CAPABILITIES.CHANNEL_REORDER,
        CAPABILITIES.CHANNEL_VIEW_PRIVATE,
        CAPABILITIES.CHANNEL_JOIN_PRIVATE,
        CAPABILITIES.INVITE_CREATE,
        CAPABILITIES.INVITE_REVOKE,
        CAPABILITIES.MEMBER_MOVE,
        CAPABILITIES.MEMBER_KICK,
        CAPABILITIES.MEMBER_MUTE,
        CAPABILITIES.MEMBER_TIMEOUT,
        CAPABILITIES.MEMBER_ROOM_KICK,
        CAPABILITIES.MEMBER_CHAT_BAN,
        CAPABILITIES.ROLE_MANAGE_LOWER,
        CAPABILITIES.ROLE_ASSIGN_LOWER,
        CAPABILITIES.ROLE_PERMISSIONS_EDIT_LOWER,
      ];
    case 'super_mod':
      return [
        CAPABILITIES.SERVER_VIEW,
        CAPABILITIES.SERVER_JOIN,
        CAPABILITIES.SERVER_MODERATION_UPDATE,
        CAPABILITIES.INVITE_CREATE,
        CAPABILITIES.INVITE_REVOKE,
        CAPABILITIES.MEMBER_MOVE,
        CAPABILITIES.MEMBER_KICK,
        CAPABILITIES.MEMBER_MUTE,
        CAPABILITIES.MEMBER_TIMEOUT,
        CAPABILITIES.MEMBER_ROOM_KICK,
        CAPABILITIES.MEMBER_CHAT_BAN,
        CAPABILITIES.ROLE_ASSIGN_LOWER,
      ];
    case 'mod':
    case 'moderator': // legacy alias — migration 030 öncesi roles.name satırları
      return [
        CAPABILITIES.SERVER_VIEW,
        CAPABILITIES.SERVER_JOIN,
        CAPABILITIES.SERVER_MODERATION_UPDATE,
        CAPABILITIES.INVITE_REVOKE,
        CAPABILITIES.MEMBER_MOVE,
        CAPABILITIES.MEMBER_KICK,
        CAPABILITIES.MEMBER_MUTE,
        CAPABILITIES.MEMBER_TIMEOUT,
        CAPABILITIES.MEMBER_ROOM_KICK,
        CAPABILITIES.MEMBER_CHAT_BAN,
      ];
    case 'super_member':
      return [
        CAPABILITIES.SERVER_VIEW,
        CAPABILITIES.SERVER_JOIN,
        CAPABILITIES.INVITE_CREATE,
      ];
    case 'member':
      return [CAPABILITIES.SERVER_VIEW, CAPABILITIES.SERVER_JOIN];
    default:
      return [];
  }
}

// ── Authorization helpers ──

export function hasCapability(ctx: ServerAccessContext, cap: Capability): boolean {
  return ctx.capabilities.includes(cap);
}

export function assertServerMember(ctx: ServerAccessContext): void {
  if (!ctx.membership.exists) {
    throw new AppError(403, 'Bu sunucunun üyesi değilsin');
  }
}

export function assertCapability(ctx: ServerAccessContext, cap: Capability, msg?: string): void {
  assertServerMember(ctx);
  if (!hasCapability(ctx, cap)) {
    throw new AppError(403, msg || 'Bu işlem için yetkin yok');
  }
}

/**
 * Restricted-mode guard — oda join / voice connect / mesajlaşma gibi AKTİF eylemler
 * banlı sunucuda blokluysa çağır. Tarama / sunucu görünümü gibi pasif path'lerde ÇAĞIRMA.
 */
export function assertServerNotBanned(ctx: ServerAccessContext, msg?: string): void {
  if (ctx.isBanned) {
    const err = new AppError(
      423,
      msg || 'Bu sunucu sistem yönetimi tarafından geçici olarak kısıtlandı. Odalara giriş kapalı.',
    );
    (err as any).reason = 'server-banned';
    throw err;
  }
}

/**
 * Timeout guard — mesaj yazma / voice join / kanal etkileşimi gibi AKTİF eylemlerde çağır.
 * Pasif görüntüleme yollarında çağırma; kullanıcı sunucuyu görebilmeli.
 */
export function assertNotTimedOut(ctx: ServerAccessContext, msg?: string): void {
  if (ctx.moderation.timedOutUntil) {
    const err = new AppError(
      403,
      msg || `Bu sunucuda zaman aşımındasın. Bitiş: ${ctx.moderation.timedOutUntil}`,
    );
    (err as any).reason = 'timed-out';
    (err as any).timedOutUntil = ctx.moderation.timedOutUntil;
    throw err;
  }
}

/**
 * Voice mute guard — voice publish/unmute eylemlerinde çağır (ilerideki voice token üretiminde).
 * Mevcut etki: sadece voice yayın izni; mesaj ve diğer eylemler etkilenmez.
 */
export function assertNotVoiceMuted(ctx: ServerAccessContext, msg?: string): void {
  if (ctx.moderation.isVoiceMuted) {
    const err = new AppError(
      403,
      msg || 'Bu sunucuda sesin kapalı. Moderatör ile iletişime geç.',
    );
    (err as any).reason = 'voice-muted';
    (err as any).voiceMutedUntil = ctx.moderation.voiceMutedUntil;
    throw err;
  }
}

export type PlanAction = 'channel.create';

export function assertPlanAllows(ctx: ServerAccessContext, action: PlanAction): void {
  if (action === 'channel.create') {
    if (ctx.limits.maxChannels === undefined) return;
    if (!ctx.flags.canCreateChannel) {
      throw new AppError(403, 'Plan limitine ulaşıldı');
    }
  }
}
