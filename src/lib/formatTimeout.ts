/**
 * Moderation timeout süre yardımcıları.
 * UI'daki birden fazla yerde (toast, mic click, join guard) aynı format kullanılıyor.
 */

/** ISO tarihini ms cinsinden kalan süreye çevirir. Null / geçmiş → 0. */
export function getRemainingMs(timedOutUntil: string | null | undefined): number {
  if (!timedOutUntil) return 0;
  const t = new Date(timedOutUntil).getTime();
  if (!Number.isFinite(t)) return 0;
  const rem = t - Date.now();
  return rem > 0 ? rem : 0;
}

/**
 * Kullanıcı dostu "kalan süre" formatı — TR.
 * < 60s       → "45 sn"
 * < 60dk      → "3 dk 12 sn"  (seconds trailing only if < 10dk)
 * < 24sa      → "1 sa 05 dk"
 * ≥ 24sa      → "2 gün 3 sa"
 * 0 / negatif → null (süre dolmuş)
 */
export function formatRemaining(ms: number): string | null {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const totalHour = Math.floor(totalMin / 60);
  const hour = totalHour % 24;
  const day = Math.floor(totalHour / 24);

  if (day > 0) return `${day} gün ${hour} sa`;
  if (totalHour > 0) return `${totalHour} sa ${String(min).padStart(2, '0')} dk`;
  if (totalMin >= 10) return `${totalMin} dk`;
  if (totalMin > 0) return `${totalMin} dk ${sec} sn`;
  return `${totalSec} sn`;
}

/** Tek çağrıda format: ISO → "3 dk 12 sn" veya null. */
export function formatRemainingFromIso(timedOutUntil: string | null | undefined): string | null {
  return formatRemaining(getRemainingMs(timedOutUntil));
}
