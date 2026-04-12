import { queryOne } from '../repositories/db';
import { AppError } from './serverService';
import { logAction } from './auditLogService';

/**
 * Plan enforcement — capability system'den ORTOGONAL.
 *   capability = "yapabilir mi?"   (role/permission)
 *   plan       = "ne kadar?"       (limit/constraint)
 * Bu servis sadece sayısal limit enforcement yapar; permission kararı alma.
 *
 * Parallel system — mevcut `planConfig.ts` ve `servers.plan` kolonu korunur.
 * Resolution order: server_plans.plan → servers.plan → 'free'
 */

export type PlanKey = 'free' | 'pro' | 'ultra';

export type LimitType =
  | 'channel.create'
  | 'privateChannel.create'
  | 'invite.createLink'
  | 'server.join';

export interface PlanLimitSet {
  maxChannels: number;
  maxMembers: number;
  maxPrivateChannels: number;
  maxInviteLinksPerDay: number;
}

/**
 * Plan config — explicit tier'lar. Ultra artık dedicated (silent pro downgrade yok).
 * Bilinmeyen plan değerleri normalize'da 'free'e düşer — log ile görünür.
 */
export const PLAN_CONFIG: Record<PlanKey, PlanLimitSet> = {
  free: {
    maxChannels: 10,
    maxMembers: 50,
    maxPrivateChannels: 3,
    maxInviteLinksPerDay: 20,
  },
  pro: {
    maxChannels: 100,
    maxMembers: 500,
    maxPrivateChannels: 50,
    maxInviteLinksPerDay: 500,
  },
  ultra: {
    maxChannels: 500,
    maxMembers: 2000,
    maxPrivateChannels: 200,
    maxInviteLinksPerDay: 2000,
  },
};

// Tekrarlayan unknown-plan warn'i limitle — her request spam olmasın.
const seenUnknownPlans = new Set<string>();

/**
 * String plan → geçerli PlanKey.
 * 'free' | 'pro' | 'ultra' dışındaki tüm değerler free'ye düşer + bir kez warn'e yazılır.
 */
export function normalizePlan(raw: string | null | undefined): PlanKey {
  if (raw === 'free' || raw === 'pro' || raw === 'ultra') return raw;
  if (typeof raw === 'string' && raw.length > 0 && !seenUnknownPlans.has(raw)) {
    console.warn(`[planService] unknown plan value="${raw}" → free fallback`);
    seenUnknownPlans.add(raw);
  }
  return 'free';
}

/** Resolution: server_plans.plan → servers.plan → 'free' */
export async function getServerPlan(serverId: string): Promise<PlanKey> {
  const row = await queryOne<{ plan: string | null; legacy_plan: string | null }>(
    `SELECT sp.plan AS plan, s.plan AS legacy_plan
     FROM servers s
     LEFT JOIN server_plans sp ON sp.server_id = s.id
     WHERE s.id = $1`,
    [serverId],
  );
  if (!row) return 'free';
  return normalizePlan(row.plan ?? row.legacy_plan);
}

export function getPlanLimits(plan: PlanKey): PlanLimitSet {
  return PLAN_CONFIG[plan] ?? PLAN_CONFIG.free;
}

export interface LimitCheck {
  allowed: boolean;
  type: LimitType;
  plan: PlanKey;
  limit: number;
  current: number;
  reason?: string;
}

/**
 * Deterministic limit check — current < limit yollu pre-mutation kontrol.
 * COUNT query ile canlı sayım; cache/incrementUsage yok — spec ile tutarlı.
 * Race koşulları için risk bkz. report (channel/invite create 1-2 overshoot teorik olası).
 */
export async function checkLimit(serverId: string, type: LimitType): Promise<LimitCheck> {
  const plan = await getServerPlan(serverId);
  const limits = getPlanLimits(plan);

  let current = 0;
  let limit = 0;

  switch (type) {
    case 'channel.create': {
      const r = await queryOne<{ c: string }>(
        'SELECT COUNT(*)::text AS c FROM channels WHERE server_id = $1',
        [serverId],
      );
      current = parseInt(r?.c ?? '0', 10);
      limit = limits.maxChannels;
      break;
    }
    case 'privateChannel.create': {
      const r = await queryOne<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM channels
         WHERE server_id = $1 AND (is_hidden = true OR is_invite_only = true)`,
        [serverId],
      );
      current = parseInt(r?.c ?? '0', 10);
      limit = limits.maxPrivateChannels;
      break;
    }
    case 'invite.createLink': {
      const r = await queryOne<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM server_invite_links
         WHERE server_id = $1 AND created_at > now() - interval '24 hours'`,
        [serverId],
      );
      current = parseInt(r?.c ?? '0', 10);
      limit = limits.maxInviteLinksPerDay;
      break;
    }
    case 'server.join': {
      // Mevcut capacity kolonu ile plan limiti arasında DAHA KISITLAYICI olanı uygula.
      const r = await queryOne<{ member_count: number | null; capacity: number | null }>(
        `SELECT COALESCE(sa.member_count, 0) AS member_count, s.capacity
         FROM servers s LEFT JOIN server_activity sa ON sa.server_id = s.id
         WHERE s.id = $1`,
        [serverId],
      );
      current = r?.member_count ?? 0;
      const serverCapacity = r?.capacity ?? Number.MAX_SAFE_INTEGER;
      limit = Math.min(serverCapacity, limits.maxMembers);
      break;
    }
  }

  return {
    allowed: current < limit,
    type,
    plan,
    limit,
    current,
    reason: current < limit ? undefined : `Plan limiti aşıldı: ${type} (${current}/${limit})`,
  };
}

/**
 * Throw-on-fail convenience helper. Mutation'dan ÖNCE çağrılmalı.
 * `actorId` verildiyse limit-hit audit emitlenir (plan.limit_hit).
 */
export async function assertLimit(serverId: string, type: LimitType, actorId?: string): Promise<void> {
  const r = await checkLimit(serverId, type);
  if (!r.allowed) {
    if (actorId) {
      await logAction({
        serverId,
        actorId,
        action: 'plan.limit_hit',
        resourceType: 'plan',
        resourceId: serverId,
        metadata: { type, plan: r.plan, current: r.current, limit: r.limit },
      });
    }
    throw new AppError(403, userFacingMessage(type));
  }
}

/**
 * Inline Math.min(capacity, maxMembers) join path'leri için audit helper.
 * Ayrı fonksiyon çünkü join path'leri assertLimit değil, lock'lu capacity query kullanıyor.
 */
export async function emitLimitHit(
  serverId: string,
  actorId: string,
  type: LimitType,
  plan: PlanKey,
  current: number,
  limit: number,
): Promise<void> {
  await logAction({
    serverId,
    actorId,
    action: 'plan.limit_hit',
    resourceType: 'plan',
    resourceId: serverId,
    metadata: { type, plan, current, limit },
  });
}

function userFacingMessage(type: LimitType): string {
  switch (type) {
    case 'channel.create':
      return 'Plan kanal limitine ulaşıldı';
    case 'privateChannel.create':
      return 'Plan özel kanal limitine ulaşıldı';
    case 'invite.createLink':
      return 'Günlük davet linki limitine ulaşıldı';
    case 'server.join':
      return 'Sunucu kapasitesi dolu';
    default:
      return 'Plan limiti aşıldı';
  }
}
