/**
 * DM rate-limit + duplicate-send + convKey membership — saf mantık.
 * chat-server.cjs aynı invariant'ı uygular; burada unit test edilir.
 *
 * SQL yok, Supabase yok, ağ yok — pure function'lar.
 */

// ── Rate limit (bucket reset) ─────────────────────────────────────────────
// chat-server.cjs'deki checkRateLimit ile aynı semantik.
// Bucket expire ederse count sıfırlanır; window içindeyse count artar.
// `true` döndürürse → ÜST SINIR AŞILDI (reject).

export interface RateBucket { count: number; resetAt: number }

export function checkRateLimit(
  bucket: RateBucket | undefined,
  now: number,
  maxCount: number,
  windowMs: number,
): { exceeded: boolean; next: RateBucket } {
  if (!bucket || now > bucket.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    return { exceeded: 1 > maxCount, next };
  }
  const next = { count: bucket.count + 1, resetAt: bucket.resetAt };
  return { exceeded: next.count > maxCount, next };
}

// ── Duplicate-send guard ──────────────────────────────────────────────────
// ~500ms içinde aynı metnin tekrar gönderilmesini engeller (çift click/ENTER).

export interface LastSend { text: string; at: number }

export function isDuplicateSend(
  last: LastSend | undefined,
  text: string,
  now: number,
  windowMs = 500,
): boolean {
  if (!last) return false;
  if (last.text !== text) return false;
  return now - last.at < windowMs;
}

// ── convKey parsing + membership ──────────────────────────────────────────
// convKey format: "dm:<lowUserId>:<highUserId>" — lowercase ordered pair.
// Spoofed veya başka formattaki key → null (fail-closed).

const CONV_KEY_RE = /^dm:([^:]+):([^:]+)$/;

export function parseConvKey(convKey: unknown): { low: string; high: string } | null {
  if (typeof convKey !== 'string') return null;
  const m = CONV_KEY_RE.exec(convKey);
  if (!m) return null;
  const low = m[1].trim();
  const high = m[2].trim();
  if (!low || !high || low === high) return null;
  // canonical invariant: low < high (string compare)
  if (low >= high) return null;
  return { low, high };
}

/**
 * userId'in convKey'deki iki participant'tan biri olup olmadığını doğrular.
 * Yoksa null döner (membership reddi). Varsa karşı taraf ID'si.
 */
export function otherParticipantOrNull(convKey: unknown, userId: unknown): string | null {
  if (typeof userId !== 'string' || !userId) return null;
  const pair = parseConvKey(convKey);
  if (!pair) return null;
  if (pair.low === userId) return pair.high;
  if (pair.high === userId) return pair.low;
  return null; // userId convKey'de yok → spoof
}
