/**
 * Legacy plan shape (capacity / customRooms / systemRoomSize / customRoomSize).
 *
 * CANONICAL SOURCE: `./services/planService.ts` PLAN_CONFIG.
 * Bu dosya sadece legacy field isimlerini isteyen callsite'lara adapter sağlar
 * (accessContextService, legacy join paths). Değerler planService'den türetilir
 * — DESYNC olmaz.
 */
import { PLAN_CONFIG, normalizePlan, type PlanLimitSet } from './services/planService';

export interface PlanLimits {
  /** Legacy: maxMembers */
  capacity: number;
  /** Legacy: systemRoomCapacity */
  systemRoomSize: number;
  /** Legacy: extraPersistentRooms (kullanıcının açabildiği kalıcı oda hakkı). */
  customRooms: number;
  /** Legacy: persistentRoomCapacity */
  customRoomSize: number;
}

function toLegacy(l: PlanLimitSet): PlanLimits {
  return {
    capacity: l.maxMembers,
    systemRoomSize: l.systemRoomCapacity,
    customRooms: l.extraPersistentRooms,
    customRoomSize: l.persistentRoomCapacity,
  };
}

export const PLANS: Record<string, PlanLimits> = {
  free: toLegacy(PLAN_CONFIG.free),
  pro: toLegacy(PLAN_CONFIG.pro),
  ultra: toLegacy(PLAN_CONFIG.ultra),
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[normalizePlan(plan)];
}
