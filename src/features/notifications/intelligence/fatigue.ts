/**
 * Fatigue / density counters — rolling window, bounded memory.
 *
 * Saf ring buffer; timestamp array. Yüksek frekansta bile O(n) prune
 * maksimum window içindeki entry sayısı kadar çalışır (pratikte <100).
 */

const NOTIF_WINDOW_MS = 60_000;     // son 60 sn
const SOUND_WINDOW_MS = 30_000;     // son 30 sn
const URGENT_WINDOW_MS = 600_000;   // son 10 dk

const notifTimestamps: number[] = [];
const soundTimestamps: number[] = [];
const urgentTimestamps: number[] = [];

function prune(arr: number[], now: number, windowMs: number) {
  while (arr.length > 0 && now - arr[0] > windowMs) arr.shift();
}

export function recordNotif(now = Date.now()) {
  prune(notifTimestamps, now, NOTIF_WINDOW_MS);
  notifTimestamps.push(now);
}
export function recordSound(now = Date.now()) {
  prune(soundTimestamps, now, SOUND_WINDOW_MS);
  soundTimestamps.push(now);
}
export function recordUrgent(now = Date.now()) {
  prune(urgentTimestamps, now, URGENT_WINDOW_MS);
  urgentTimestamps.push(now);
}

export function notifCount(now = Date.now()): number {
  prune(notifTimestamps, now, NOTIF_WINDOW_MS);
  return notifTimestamps.length;
}
export function soundCount(now = Date.now()): number {
  prune(soundTimestamps, now, SOUND_WINDOW_MS);
  return soundTimestamps.length;
}
export function urgentCount(now = Date.now()): number {
  prune(urgentTimestamps, now, URGENT_WINDOW_MS);
  return urgentTimestamps.length;
}

// Thresholds — fatigue derived levels
export const FATIGUE = {
  NOTIF_HIGH: 5,      // 60 sn içinde 5+ notif → yüksek
  SOUND_HIGH: 3,      // 30 sn içinde 3+ ses → sound fatigue
  URGENT_MAX: 2,      // 10 dk içinde 2 urgent → yeni urgent'ı downgrade
} as const;

export function isNotifFatigued(now = Date.now()): boolean {
  return notifCount(now) >= FATIGUE.NOTIF_HIGH;
}
export function isSoundFatigued(now = Date.now()): boolean {
  return soundCount(now) >= FATIGUE.SOUND_HIGH;
}
export function isUrgentSaturated(now = Date.now()): boolean {
  return urgentCount(now) >= FATIGUE.URGENT_MAX;
}

export const _testing = {
  reset: () => { notifTimestamps.length = 0; soundTimestamps.length = 0; urgentTimestamps.length = 0; },
  snapshot: () => ({
    notif: [...notifTimestamps],
    sound: [...soundTimestamps],
    urgent: [...urgentTimestamps],
  }),
};
