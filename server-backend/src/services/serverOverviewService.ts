import { queryOne } from '../repositories/db';
import { getServerAccessContext, assertCapability } from './accessContextService';
import { CAPABILITIES } from '../capabilities';
import { getServerPlan, getPlanLimits } from './planService';

export interface ServerOverview {
  serverId: string;
  plan: string;
  limits: {
    /** Toplam oda cap (systemRooms + extraPersistentRooms + maxNonPersistent) */
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

// ── In-memory cache: per-server, 10 sn TTL, sadece başarılı response ──
const OVERVIEW_TTL_MS = 10_000;
const overviewCache = new Map<string, { data: ServerOverview; expiresAt: number }>();

/** Mutation sonrası çağrılır — channel/invite/member değişikliklerinde stale veri kalmasın. */
export function invalidateServerOverview(serverId: string): void {
  overviewCache.delete(serverId);
}

/**
 * Admin overview — plan + counts vs limits. Tek query batch'de 4 COUNT birleştirilir.
 * Capability: SERVER_MANAGE (admin+).
 */
export async function getServerOverview(serverId: string, callerId: string): Promise<ServerOverview> {
  const ctx = await getServerAccessContext(callerId, serverId);
  assertCapability(ctx, CAPABILITIES.SERVER_MANAGE, 'Sunucu özetini görmek için yetkin yok');

  const cached = overviewCache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const plan = await getServerPlan(serverId);
  const limits = getPlanLimits(plan);

  // Tek query ile 4 count — server-side aggregate
  const row = await queryOne<{
    members: string;
    channels: string;
    persistent_rooms: string;
    active_invites: string;
    invites_24h: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM server_members WHERE server_id = $1) AS members,
       (SELECT COUNT(*)::text FROM channels WHERE server_id = $1) AS channels,
       (SELECT COUNT(*)::text FROM channels WHERE server_id = $1
          AND COALESCE(is_default, false) = false
          AND COALESCE(is_persistent, false) = true) AS persistent_rooms,
       (SELECT COUNT(*)::text FROM server_invite_links
          WHERE server_id = $1
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
            AND (max_uses IS NULL OR used_count < max_uses)) AS active_invites,
       (SELECT COUNT(*)::text FROM server_invite_links
          WHERE server_id = $1 AND created_at > now() - interval '24 hours') AS invites_24h`,
    [serverId]
  );

  const result: ServerOverview = {
    serverId,
    plan,
    limits: {
      maxTotalRooms: limits.maxTotalRooms,
      maxMembers: limits.maxMembers,
      extraPersistentRooms: limits.extraPersistentRooms,
      systemRooms: limits.systemRooms,
      maxInviteLinksPerDay: limits.maxInviteLinksPerDay,
    },
    counts: {
      members: parseInt(row?.members ?? '0', 10),
      channels: parseInt(row?.channels ?? '0', 10),
      persistentRooms: parseInt(row?.persistent_rooms ?? '0', 10),
      activeInviteLinks: parseInt(row?.active_invites ?? '0', 10),
      inviteLinksLast24h: parseInt(row?.invites_24h ?? '0', 10),
    },
  };

  overviewCache.set(serverId, { data: result, expiresAt: Date.now() + OVERVIEW_TTL_MS });
  return result;
}
