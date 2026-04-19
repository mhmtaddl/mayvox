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
  /** Sabit sistem odası (tüm planlar = 4) */
  systemRooms: number;
  /** Kullanıcının açıp silebildiği kalıcı oda hakkı */
  extraPersistentRooms: number;
  /** Geçici ("özel") oda hakkı — boş kalınca auto-delete */
  maxNonPersistentRooms: number;
  /** Toplam oda cap (sys + persistent + nonPersistent) */
  maxTotalRooms: number;
  /** Sistem oda maksimum kişi */
  systemRoomCapacity: number;
  /** Kalıcı oda maksimum kişi */
  persistentRoomCapacity: number;
  /** Geçici (özel) oda maksimum kişi */
  nonPersistentRoomCapacity: number;
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free: {
    maxMembers: 100,
    systemRooms: 4,
    extraPersistentRooms: 0,
    maxNonPersistentRooms: 2,       // Free: 2 özel oda hakkı (auto-delete)
    maxTotalRooms: 6,               // 4 + 0 + 2
    systemRoomCapacity: 15,
    persistentRoomCapacity: 20,     // N/A (quota=0)
    nonPersistentRoomCapacity: 20,
  },
  pro: {
    maxMembers: 300,
    systemRooms: 4,
    extraPersistentRooms: 2,
    maxNonPersistentRooms: 3,
    maxTotalRooms: 9,
    systemRoomCapacity: 25,
    persistentRoomCapacity: 30,
    nonPersistentRoomCapacity: 35,
  },
  ultra: {
    maxMembers: 1000,
    systemRooms: 4,
    extraPersistentRooms: 6,
    maxNonPersistentRooms: 10,
    maxTotalRooms: 20,
    systemRoomCapacity: 35,
    persistentRoomCapacity: 45,
    nonPersistentRoomCapacity: 60,
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
 * Plan kartında gösterilen özellik listesi — hardcoded sayı yok.
 * Sayılar her zaman PLAN_LIMITS'den okunur.
 *
 * Oda taxonomy metin karşılıkları:
 *   - systemRooms       → "sistem odası"
 *   - extraPersistent   → "kalıcı oda"
 *   - nonPersistent     → "özel oda" (auto-delete)
 */
export function planFeatureList(plan: PlanKey): string[] {
  const l = PLAN_LIMITS[plan];
  const features: string[] = [
    `${l.maxMembers.toLocaleString('tr-TR')} üye`,
  ];

  // Oda yapısı — plana göre hangileri varsa onu göster
  const roomParts: string[] = [`${l.systemRooms} sistem`];
  if (l.extraPersistentRooms > 0) roomParts.push(`${l.extraPersistentRooms} kalıcı`);
  if (l.maxNonPersistentRooms > 0) roomParts.push(`${l.maxNonPersistentRooms} özel`);
  features.push(roomParts.join(' + ') + ' oda');

  // Kapasiteler — plana özel olarak, sadece ilgili oda türü varsa
  features.push(`Sistem odalarında ${l.systemRoomCapacity} kişi`);
  if (l.extraPersistentRooms > 0) {
    features.push(`Kalıcı odalarda ${l.persistentRoomCapacity} kişi`);
  }
  if (l.maxNonPersistentRooms > 0) {
    features.push(`Özel odalarda ${l.nonPersistentRoomCapacity} kişi`);
  }

  if (plan === 'pro') features.push('Daha iyi ses kalitesi');
  if (plan === 'ultra') features.push('En düşük gecikme', 'En iyi ses kalitesi');
  return features;
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
