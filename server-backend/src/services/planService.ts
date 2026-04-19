import { queryOne } from '../repositories/db';
import { AppError } from './serverService';
import { logAction } from './auditLogService';

/**
 * Plan enforcement — capability system'den ORTOGONAL.
 *   capability = "yapabilir mi?"   (role/permission)
 *   plan       = "ne kadar?"       (limit/constraint)
 *
 * Canonical room taxonomy (2026-04-19):
 *   - SYSTEM room:     is_default=true   → 4/server, silinemez, kotaya girmez
 *   - PERSISTENT room: is_default=false AND is_persistent=true
 *                      → plan extraPersistentRooms kotasında sayılır, silinebilir
 *   - NON-PERSISTENT:  is_default=false AND is_persistent=false
 *                      → yeni modelde KAPALI (maxNonPersistent=0 all plans)
 *
 * Resolution order: server_plans.plan → servers.plan → 'free'
 *
 * Bu dosya BACKEND authoritative'dir. Frontend `src/lib/planLimits.ts`
 * bu değerleri mirror eder — desync OLMAYACAK.
 */

export type PlanKey = 'free' | 'pro' | 'ultra';

/**
 * Plan-level feature flags — runtime config. Hard-disable DEĞİL; tekrar açmak
 * için sadece bu flag'i true yap + ilgili PLAN_CONFIG field'ını (>0) set et.
 */
export const FEATURE_FLAGS = {
  /** Non-persistent (ephemeral) user-created odalar — auto-delete timer'lı geçici oda.
   *  Default davranış; kalıcı oda opt-in (CreateRoomModal'da "Oda Kalıcılığı" toggle).
   *  Kapatmak için: bu flag=false → tüm user-created odalar persistent'e zorlanır. */
  nonPersistentRoomsEnabled: true,
} as const;

export type LimitType =
  | 'persistentRoom.create'   // kullanıcı kalıcı oda oluştur (is_persistent=true)
  | 'room.create'             // toplam oda (sistem + persistent + nonPersistent) — defense
  | 'invite.createLink'
  | 'server.join';

export interface PlanLimitSet {
  maxMembers: number;
  /** Sabit sistem odası sayısı (tüm planlarda 4) — server creation'da seed edilir */
  systemRooms: number;
  /** Plan ek kalıcı oda hakkı (kullanıcı oluşturur, silene kadar kalır) */
  extraPersistentRooms: number;
  /** Geçici ("özel") oda hakkı — boş kalınca auto-delete countdown ile silinir */
  maxNonPersistentRooms: number;
  /** Toplam oda kapasitesi (derived: systemRooms + extraPersistentRooms + maxNonPersistentRooms) */
  maxTotalRooms: number;
  /** Sistem odasındaki maksimum kişi sayısı */
  systemRoomCapacity: number;
  /** Kullanıcı kalıcı odalarında maksimum kişi sayısı */
  persistentRoomCapacity: number;
  /** Geçici (özel) odalarda maksimum kişi sayısı */
  nonPersistentRoomCapacity: number;
  /** Günlük davet linki limiti */
  maxInviteLinksPerDay: number;
}

/**
 * FINAL plan config — 2026-04-19 yeniden dengelendi.
 *
 * Monetization ratio:
 *   Free → Pro : üye 3x, sys cap +67%, ekstra kalıcı 0→2
 *   Pro  → Ultra: üye 5x, sys cap 2x, özel cap +128%, ekstra kalıcı 2→6
 */
export const PLAN_CONFIG: Record<PlanKey, PlanLimitSet> = {
  free: {
    maxMembers: 100,
    systemRooms: 4,
    extraPersistentRooms: 0,
    maxNonPersistentRooms: 2,             // Free: 2 özel oda hakkı (auto-delete)
    maxTotalRooms: 6,                     // 4 + 0 + 2
    systemRoomCapacity: 15,
    persistentRoomCapacity: 20,           // N/A (quota=0), monotonic ladder için yazılı
    nonPersistentRoomCapacity: 20,
    maxInviteLinksPerDay: 20,
  },
  pro: {
    maxMembers: 300,
    systemRooms: 4,
    extraPersistentRooms: 2,
    maxNonPersistentRooms: 3,
    maxTotalRooms: 9,                     // 4 + 2 + 3
    systemRoomCapacity: 25,
    persistentRoomCapacity: 30,
    nonPersistentRoomCapacity: 35,
    maxInviteLinksPerDay: 100,
  },
  ultra: {
    maxMembers: 1000,
    systemRooms: 4,
    extraPersistentRooms: 6,
    maxNonPersistentRooms: 10,
    maxTotalRooms: 20,                    // 4 + 6 + 10
    systemRoomCapacity: 35,
    persistentRoomCapacity: 45,
    nonPersistentRoomCapacity: 60,
    maxInviteLinksPerDay: 500,
  },
};

// Tekrarlayan unknown-plan warn'i limitle
const seenUnknownPlans = new Set<string>();

export function normalizePlan(raw: string | null | undefined): PlanKey {
  if (raw === 'free' || raw === 'pro' || raw === 'ultra') return raw;
  if (typeof raw === 'string' && raw.length > 0 && !seenUnknownPlans.has(raw)) {
    console.warn(`[planService] unknown plan value="${raw}" → free fallback`);
    seenUnknownPlans.add(raw);
  }
  return 'free';
}

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
 * Pre-mutation limit check. Canlı COUNT query ile sayım yapar.
 * Race koşullarında 1-2 overshoot teorik olarak mümkün (spec ile kabul).
 */
export async function checkLimit(serverId: string, type: LimitType): Promise<LimitCheck> {
  const plan = await getServerPlan(serverId);
  const limits = getPlanLimits(plan);

  let current = 0;
  let limit = 0;

  switch (type) {
    case 'persistentRoom.create': {
      // Kullanıcı kalıcı oda = is_default=false AND is_persistent=true
      // Sistem odaları (is_default=true) SAYIMA GİRMEZ — her planda 4 ücretsiz.
      const r = await queryOne<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM channels
         WHERE server_id = $1
           AND COALESCE(is_default, false) = false
           AND COALESCE(is_persistent, false) = true`,
        [serverId],
      );
      current = parseInt(r?.c ?? '0', 10);
      limit = limits.extraPersistentRooms;
      break;
    }
    case 'room.create': {
      // Defense-in-depth — toplam oda cap. Normalde persistentRoom.create
      // yeterli ama race/drift koruması için mutation öncesi her iki check de çağrılabilir.
      const r = await queryOne<{ c: string }>(
        'SELECT COUNT(*)::text AS c FROM channels WHERE server_id = $1',
        [serverId],
      );
      current = parseInt(r?.c ?? '0', 10);
      limit = limits.maxTotalRooms;
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
    case 'persistentRoom.create':
      return 'Plan kalıcı oda hakkınız doldu';
    case 'room.create':
      return 'Plan toplam oda limitine ulaşıldı';
    case 'invite.createLink':
      return 'Günlük davet linki limitine ulaşıldı';
    case 'server.join':
      return 'Sunucu kapasitesi dolu';
    default:
      return 'Plan limiti aşıldı';
  }
}

/**
 * Downgrade enforcement helper — sadece yeni create engellenir.
 * Mevcut odalar VERİ KAYBI OLMADAN kalır; kota üstündeyse sadece extraPersistentRooms
 * değerine düşene kadar yeni persistent oda açılamaz.
 *
 * UI tarafından "plan alt limiti geçildi" uyarısı için kullanılabilir.
 */
export async function getPersistentRoomStatus(serverId: string): Promise<{
  plan: PlanKey;
  current: number;
  quota: number;
  remaining: number;
  overQuota: boolean;
}> {
  const check = await checkLimit(serverId, 'persistentRoom.create');
  return {
    plan: check.plan,
    current: check.current,
    quota: check.limit,
    remaining: Math.max(0, check.limit - check.current),
    overQuota: check.current > check.limit,
  };
}
