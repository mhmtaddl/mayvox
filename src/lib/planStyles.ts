/**
 * Plan renk sistemi — tek merkez, theme'den bağımsız sabit tier renkleri.
 * Free = nötr gri, Pro = amber, Ultra = mor
 * Bu renkler tema değişiminden ETKİLENMEZ — tier kimliği sabittir.
 */

export interface PlanVisual {
  border: string;
  bg: string;
  badgeBg: string;
  badgeText: string;
  badgeShadow?: string;
  accent: string;
  selectBg: string;
  selectBorder: string;
  selectText: string;
}

// Sabit tier renkleri — her temada aynı
const AMBER = '234,179,8';
const PURPLE = '168,85,247';

export const PLAN_VISUALS: Record<string, PlanVisual> = {
  free: {
    border: 'rgba(var(--glass-tint), 0.08)',
    bg: 'rgba(var(--glass-tint), 0.035)',
    badgeBg: 'rgba(var(--glass-tint), 0.10)',
    badgeText: 'var(--theme-secondary-text)',
    accent: 'var(--theme-secondary-text)',
    selectBg: 'rgba(var(--glass-tint), 0.08)',
    selectBorder: 'rgba(var(--glass-tint), 0.15)',
    selectText: 'var(--theme-text)',
  },
  pro: {
    border: `rgba(${AMBER}, 0.35)`,
    bg: `rgba(${AMBER}, 0.08)`,
    badgeBg: `rgba(${AMBER}, 0.18)`,
    badgeText: `rgb(${AMBER})`,
    accent: `rgb(${AMBER})`,
    selectBg: `rgba(${AMBER}, 0.10)`,
    selectBorder: `rgba(${AMBER}, 0.30)`,
    selectText: `rgb(${AMBER})`,
  },
  ultra: {
    border: `rgba(${PURPLE}, 0.55)`,
    bg: `rgba(${PURPLE}, 0.10)`,
    badgeBg: `rgba(${PURPLE}, 0.25)`,
    badgeText: `rgb(${PURPLE})`,
    badgeShadow: `0 0 8px rgba(${PURPLE}, 0.30)`,
    accent: `rgb(${PURPLE})`,
    selectBg: `rgba(${PURPLE}, 0.12)`,
    selectBorder: `rgba(${PURPLE}, 0.35)`,
    selectText: `rgb(${PURPLE})`,
  },
};

export function getPlanVisual(plan?: string): PlanVisual {
  return PLAN_VISUALS[plan ?? 'free'] ?? PLAN_VISUALS.free;
}
