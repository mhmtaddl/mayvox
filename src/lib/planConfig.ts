/**
 * Legacy wrapper — tek canonical: `./planLimits.ts`.
 * Geriye uyum için `USER_ROOM_LIMIT`, `getUserRoomLimit`, `roomLimitMessage` burada
 * kalmaya devam ediyor ama değerler planLimits'den türetiliyor (desync yok).
 */
import { PLAN_LIMITS, normalizePlan, type PlanKey } from './planLimits';

/** @deprecated use `PLAN_LIMITS[plan].extraPersistentRooms` */
export const USER_ROOM_LIMIT: Record<PlanKey, number> = {
  free: PLAN_LIMITS.free.extraPersistentRooms,
  pro: PLAN_LIMITS.pro.extraPersistentRooms,
  ultra: PLAN_LIMITS.ultra.extraPersistentRooms,
};

export type { PlanKey };

export function getUserRoomLimit(plan: string | undefined | null): number {
  return PLAN_LIMITS[normalizePlan(plan)].extraPersistentRooms;
}

export function roomLimitMessage(plan: string | undefined | null): string {
  const limit = getUserRoomLimit(plan);
  if (limit === 0) {
    return 'Bu planda ek kalıcı oda hakkınız yok. Daha fazla oda için planınızı yükseltin.';
  }
  return `En fazla ${limit} kalıcı oda oluşturabilirsiniz.`;
}
