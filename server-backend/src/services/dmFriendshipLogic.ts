/**
 * DM friendship doğrulama — saf mantık katmanı.
 *
 * chat-server.cjs içindeki `checkFriendship` aynı invariant'a uyar:
 *   1. Kullanıcı ID'leri canonical sıraya sokulur (low, high).
 *   2. Sorgu `friendships` tablosunda tek satırla eşleşir.
 *   3. Sonuç `null`/`undefined` ise arkadaş DEĞİL.
 *
 * Burada SQL yok — sadece edge-case mantığı; DB mock'suz test edilir.
 */

export interface FriendshipRowLike {
  user_low_id?: unknown;
  user_high_id?: unknown;
}

export interface CanonicalPair {
  low: string;
  high: string;
}

/**
 * (a,b) çiftini canonical sıraya sokar. Aynı ID veya geçersiz girdi → null (DM'e izin yok).
 * Fail-closed: şüphede ret.
 */
export function canonicalPair(a: unknown, b: unknown): CanonicalPair | null {
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return null;
  if (x === y) return null; // kendine DM yok
  return x < y ? { low: x, high: y } : { low: y, high: x };
}

/**
 * `friendships` satırından arkadaşlık durumunu türetir.
 * null/undefined/boş array → false. Schema bozulsa bile fail-closed.
 */
export function interpretFriendshipResult(
  data: FriendshipRowLike | FriendshipRowLike[] | null | undefined,
  expected: CanonicalPair,
): boolean {
  if (data == null) return false;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return false;
  // Schema doğrulama — zehirlenmiş satır DM kapısını açamasın.
  if (row.user_low_id !== expected.low) return false;
  if (row.user_high_id !== undefined && row.user_high_id !== expected.high) return false;
  return true;
}
