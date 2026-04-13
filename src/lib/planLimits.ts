/**
 * MAYVOX — FINAL plan limits (2026-04-13).
 * Bu dosya frontend için tek doğru kaynaktır; tüm plan kart/özet/yaratma ekranlarında kullanılır.
 * Backend `server-backend/src/services/planService.ts` PLAN_CONFIG ile birebir senkron olmalı.
 */

export type PlanKey = 'free' | 'pro' | 'ultra';

export interface PlanLimits {
  maxMembers: number;
  systemRooms: number;          // sabit 4
  privateRooms: number;         // ülke içinde "özel oda"
  systemRoomCapacity: number;   // sistem oda başına maksimum kişi
  privateRoomCapacity: number;  // özel oda başına maksimum kişi
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free: {
    maxMembers: 100,
    systemRooms: 4,
    privateRooms: 2,
    systemRoomCapacity: 15,
    privateRoomCapacity: 20,
  },
  pro: {
    maxMembers: 250,
    systemRooms: 4,
    privateRooms: 5,
    systemRoomCapacity: 25,
    privateRoomCapacity: 30,
  },
  ultra: {
    maxMembers: 1000,
    systemRooms: 4,
    privateRooms: 16,
    systemRoomCapacity: 35,
    privateRoomCapacity: 50,
  },
};

export const PLAN_NAME: Record<PlanKey, string> = {
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
};

/** Plan tagline (kart başlığı altı kısa tanıtım) */
export const PLAN_TAGLINE: Record<PlanKey, string> = {
  free: 'Küçük topluluklar için ideal başlangıç',
  pro: 'Daha güçlü topluluklar için',
  ultra: 'Maksimum topluluk gücü',
};

/** Karta sığacak madde listesi — limitler + plana özgü slogan satırları */
export function planFeatureList(plan: PlanKey): string[] {
  const l = PLAN_LIMITS[plan];
  const base = [
    `${l.maxMembers.toLocaleString('tr-TR')} üye`,
    `${l.systemRooms} sistem odası`,
    `${l.privateRooms} özel oda`,
    `Sistem odalarında ${l.systemRoomCapacity} kişi`,
    `Özel odalarda ${l.privateRoomCapacity} kişi`,
  ];
  if (plan === 'pro') {
    base.push('Daha iyi ses kalitesi', 'Büyüyen topluluklar için daha fazla alan');
  } else if (plan === 'ultra') {
    base.push('En düşük gecikme', 'En iyi ses kalitesi', 'Büyük topluluklar için maksimum esneklik');
  }
  return base;
}

/** Compact bir özet satır (badge/tooltip için): "100 üye · 4 sistem · 2 özel" */
export function planSummaryLine(plan: PlanKey): string {
  const l = PLAN_LIMITS[plan];
  return `${l.maxMembers.toLocaleString('tr-TR')} üye · ${l.systemRooms} sistem · ${l.privateRooms} özel`;
}

export const PLAN_RANK: Record<PlanKey, number> = { free: 0, pro: 1, ultra: 2 };
