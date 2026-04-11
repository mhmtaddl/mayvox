export interface PlanLimits {
  capacity: number;
  systemRoomSize: number;
  customRooms: number;
  customRoomSize: number;
}

export const PLANS: Record<string, PlanLimits> = {
  free: { capacity: 100, systemRoomSize: 20, customRooms: 2, customRoomSize: 10 },
  pro:  { capacity: 240, systemRoomSize: 40, customRooms: 4, customRoomSize: 20 },
  ultra:{ capacity: 480, systemRoomSize: 80, customRooms: 8, customRoomSize: 40 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan] ?? PLANS.free;
}
