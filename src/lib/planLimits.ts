/**
 * Plan limits — frontend mirror of backend canonical (2026-04-19).
 *
 * CANONICAL AUTHORITATIVE: `server-backend/src/services/planService.ts:PLAN_CONFIG`
 *
 * Bu dosya UI gösterimi için tek kaynak. Sayılar backend ile BİREBİR senkron —
 * backend authoritative, frontend sadece mirror. Desync olmaz: backend değişirse
 * burayı da güncelle (compile-time coupling yoktur, manuel sync).
 *
 * Yeni model (2026-04-19):
 *   - free : 100 üye · 4 sys + 0 extraPersistent = 4 toplam
 *   - pro  : 300 üye · 4 sys + 2 extraPersistent = 6 toplam
 *   - ultra: 1500 üye · 4 sys + 6 extraPersistent = 10 toplam
 *
 * Room taxonomy:
 *   - Sistem oda : is_default=true, silinemez, kotaya girmez (4/server)
 *   - Persistent : is_default=false + is_persistent=true, silinebilir, extraPersistent kotasında
 *   - Non-persist: is_default=false + is_persistent=false — FEATURE_FLAG KAPALI
 */

export type PlanKey = 'free' | 'pro' | 'ultra';

export interface PlanLimits {
  maxMembers: number;
  /** Sabit sistem odası (tüm planlar) */
  systemRooms: number;
  /** Kullanıcının açıp silebildiği kalıcı oda hakkı */
  extraPersistentRooms: number;
  /** Toplam oda cap (systemRooms + extraPersistentRooms + maxNonPersistentRooms) */
  maxTotalRooms: number;
  /** Non-persistent oda hakkı — yeni modelde 0 (feature flag kapalı) */
  maxNonPersistentRooms: number;
  /** Sistem oda maksimum kişi */
  systemRoomCapacity: number;
  /** Persistent oda maksimum kişi */
  persistentRoomCapacity: number;
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free: {
    maxMembers: 100,
    systemRooms: 4,
    extraPersistentRooms: 0,
    maxTotalRooms: 4,
    maxNonPersistentRooms: 0,
    systemRoomCapacity: 15,
    persistentRoomCapacity: 20,
  },
  pro: {
    maxMembers: 300,
    systemRooms: 4,
    extraPersistentRooms: 2,
    maxTotalRooms: 6,
    maxNonPersistentRooms: 0,
    systemRoomCapacity: 25,
    persistentRoomCapacity: 35,
  },
  ultra: {
    maxMembers: 1500,
    systemRooms: 4,
    extraPersistentRooms: 6,
    maxTotalRooms: 10,
    maxNonPersistentRooms: 0,
    systemRoomCapacity: 50,
    persistentRoomCapacity: 80,
  },
};

export const PLAN_NAME: Record<PlanKey, string> = {
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
};

export const PLAN_TAGLINE: Record<PlanKey, string> = {
  free: 'Küçük topluluklar için ideal başlangıç',
  pro: 'Büyüyen topluluklar için daha fazla alan',
  ultra: 'Maksimum topluluk gücü',
};

export const PLAN_RANK: Record<PlanKey, number> = { free: 0, pro: 1, ultra: 2 };

export function normalizePlan(raw: string | null | undefined): PlanKey {
  if (raw === 'free' || raw === 'pro' || raw === 'ultra') return raw;
  return 'free';
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/**
 * Plan kartında gösterilen özellik listesi — yeni model, hardcoded sayı yok.
 * Sayılar her zaman PLAN_LIMITS üzerinden okunur.
 */
export function planFeatureList(plan: PlanKey): string[] {
  const l = PLAN_LIMITS[plan];
  const base = [
    `${l.maxMembers.toLocaleString('tr-TR')} üye`,
    l.extraPersistentRooms > 0
      ? `${l.systemRooms} sistem + ${l.extraPersistentRooms} kalıcı oda hakkı`
      : `${l.systemRooms} sistem odası`,
    `Sistem odalarında ${l.systemRoomCapacity} kişi`,
    `Özel odalarda ${l.persistentRoomCapacity} kişi`,
  ];
  if (plan === 'pro') base.push('Daha iyi ses kalitesi');
  if (plan === 'ultra') base.push('En düşük gecikme', 'En iyi ses kalitesi');
  return base;
}

/** Compact özet — badge/tooltip için: "100 üye · 4 oda" */
export function planSummaryLine(plan: PlanKey): string {
  const l = PLAN_LIMITS[plan];
  return `${l.maxMembers.toLocaleString('tr-TR')} üye · ${l.maxTotalRooms} oda`;
}

/**
 * Kalıcı oda kalan hak — anlık çağrı. Backend authoritative COUNT; bu helper
 * sadece UI için frontend channel list üstünden yerel hesap yapar.
 * Sonuç 0 → "hak doldu" mesajı, >0 → "X kaldı" göster.
 */
export function calcPersistentRoomsRemaining(
  plan: string | null | undefined,
  channels: ReadonlyArray<{ isSystemChannel?: boolean; isPersistent?: boolean }>,
): { used: number; quota: number; remaining: number } {
  const quota = getPlanLimits(plan).extraPersistentRooms;
  // Persistent user room: sistem oda değil + persistent true
  const used = channels.filter(c => !c.isSystemChannel && c.isPersistent).length;
  return { used, quota, remaining: Math.max(0, quota - used) };
}
