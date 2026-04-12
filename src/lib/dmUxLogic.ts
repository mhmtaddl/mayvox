/**
 * DM UX yardımcıları — saf mantık, test edilebilir.
 * React'ten bağımsız; DOM ölçümleri bileşen tarafında alınır.
 */

/** Kullanıcı thread'in tabanına yakın mı? 100px eşik klasik chat davranışı. */
export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold = 100,
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Yeni mesaj geldiğinde "↓ Yeni mesaj" badge göster/gizle kararı.
 * - Kullanıcı tabandaysa badge yok (nasıl olsa auto-scroll olur).
 * - Kendi mesajımızsa badge yok.
 * - Yukarıdaysak ve karşıdan geldiyse badge göster.
 */
export function shouldShowJumpToBottom(
  nearBottom: boolean,
  incomingIsOwn: boolean,
): boolean {
  return !nearBottom && !incomingIsOwn;
}

/**
 * Typing debounce planı — son input'tan şu süre geçerse karşı taraf "yazıyor" kapanır.
 * Client bir kez emit eder, TTL timer ile kendi state'ini de temizler.
 */
export const TYPING_EMIT_THROTTLE_MS = 2500; // aynı client'tan peş peşe emit aralığı
export const TYPING_CLEAR_MS = 3500;         // görüntüleyen tarafta otomatik temizleme

/** Client: son emit üstünden throttle geçti mi? */
export function shouldEmitTyping(lastEmitAt: number, now: number): boolean {
  return now - lastEmitAt >= TYPING_EMIT_THROTTLE_MS;
}

/**
 * Scroll zamanlayıcı — render/layout ağır olduğunda rAF daha güvenli.
 * Prefer requestAnimationFrame; SSR/test ortamlarında queueMicrotask; o da yoksa setTimeout.
 */
export function scheduleScroll(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(cb);
    return;
  }
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(cb);
    return;
  }
  setTimeout(cb, 0);
}
