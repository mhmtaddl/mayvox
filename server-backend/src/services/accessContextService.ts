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
}

interface MembershipRow {
  role: string;
  plan: string | null;
  channel_count: number;
  member_count: number;
  owner_user_id: string;
  is_banned: boolean;
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

  // 1) Membership + plan + counts — tek query
  const membership = await queryOne<MembershipRow>(
    `SELECT
        sm.role AS role,
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
  };
}

/** Backfill edilmemiş kullanıcılar için fallback — server_members.role'dan capability üret */
export function legacyCapabilitiesFor(legacyRole: string): Capability[] {
  switch (legacyRole) {
    case 'owner':
      return Object.values(CAPABILITIES);
    case 'admin':
      return Object.values(CAPABILITIES).filter(c => c !== CAPABILITIES.ROLE_MANAGE);
    case 'mod':
      return [
        CAPABILITIES.SERVER_VIEW,
        CAPABILITIES.SERVER_JOIN,
        CAPABILITIES.INVITE_REVOKE,
        CAPABILITIES.MEMBER_MOVE,
        CAPABILITIES.MEMBER_KICK,
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

export type PlanAction = 'channel.create';

export function assertPlanAllows(ctx: ServerAccessContext, action: PlanAction): void {
  if (action === 'channel.create') {
    if (ctx.limits.maxChannels === undefined) return;
    if (!ctx.flags.canCreateChannel) {
      throw new AppError(403, 'Plan limitine ulaşıldı');
    }
  }
}
