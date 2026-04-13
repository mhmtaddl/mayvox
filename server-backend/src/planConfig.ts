export interface PlanLimits {
  capacity: number;
  systemRoomSize: number;
  customRooms: number;
  customRoomSize: number;
}

// FINAL plan limits (2026-04-13) — bkz. services/planService.ts PLAN_CONFIG (canonical kaynak).
export const PLANS: Record<string, PlanLimits> = {
  free:  { capacity: 100,  systemRoomSize: 15, customRooms: 2,  customRoomSize: 20 },
  pro:   { capacity: 250,  systemRoomSize: 25, customRooms: 5,  customRoomSize: 30 },
  ultra: { capacity: 1000, systemRoomSize: 35, customRooms: 16, customRoomSize: 50 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan] ?? PLANS.free;
}
