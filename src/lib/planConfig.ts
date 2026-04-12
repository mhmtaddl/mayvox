/**
 * Frontend plan limits — tek kaynak.
 * Backend authoritative (planService.ts); bu değerler UI messaging için.
 */

export type PlanKey = 'free' | 'pro' | 'ultra';

/** Kullanıcı başına aynı anda açık oda sayısı (kendi oluşturduğu). */
export const USER_ROOM_LIMIT: Record<PlanKey, number> = {
  free: 2,
  pro: 4,
  ultra: 8,
};

export function getUserRoomLimit(plan: string | undefined | null): number {
  if (plan === 'pro') return USER_ROOM_LIMIT.pro;
  if (plan === 'ultra') return USER_ROOM_LIMIT.ultra;
  return USER_ROOM_LIMIT.free;
}

export function roomLimitMessage(plan: string | undefined | null): string {
  const limit = getUserRoomLimit(plan);
  return `Aynı anda en fazla ${limit} oda oluşturabilirsiniz.`;
}
