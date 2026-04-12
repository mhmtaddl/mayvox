/**
 * Cross-window notification dedupe — BroadcastChannel + LRU + GC.
 *
 * - Fingerprint bazlı: `dm:<messageId>` / `invite:<inviteId>`
 * - TTL: 5 dk (eski event'ler GC)
 * - Cap: 200 entry (bellek kaçağı engellensin)
 * - Periyodik GC: 60 sn'de bir expired entries temizlenir (burst sonrası drift yok)
 * - BroadcastChannel yoksa: yalnızca local dedupe; fallback sessiz.
 */

const CHANNEL_NAME = 'mayvox:notify';
const SEEN_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;
const GC_INTERVAL_MS = 60_000;

type Seen = { addedAt: number };
const seen = new Map<string, Seen>();

let bc: BroadcastChannel | null = null;
let bcAttached = false;
let gcTimer: ReturnType<typeof setInterval> | null = null;

function pruneExpired(now: number) {
  if (seen.size === 0) return;
  for (const [k, v] of seen) {
    if (now - v.addedAt > SEEN_TTL_MS) seen.delete(k);
  }
}

function enforceCap() {
  // Map iteration order = insertion order → en eskiyi at.
  while (seen.size > MAX_ENTRIES) {
    const firstKey = seen.keys().next().value;
    if (firstKey === undefined) break;
    seen.delete(firstKey);
  }
}

// Dev/hot-reload safe singleton: Vite HMR veya modül yeniden-evaluate'te
// window üstünde global flag kontrolü yapılır, çift timer yaratılamaz.
const GC_WINDOW_FLAG = '__MAYVOX_DEDUPE_GC_ACTIVE';

function isGcGloballyActive(): boolean {
  if (typeof window === 'undefined') return false;
  try { return (window as unknown as Record<string, unknown>)[GC_WINDOW_FLAG] === true; }
  catch { return false; }
}
function setGcGlobalFlag(active: boolean) {
  if (typeof window === 'undefined') return;
  try { (window as unknown as Record<string, unknown>)[GC_WINDOW_FLAG] = active; }
  catch { /* no-op */ }
}

function ensureGcTimer() {
  if (gcTimer !== null) return;
  if (isGcGloballyActive()) return; // başka modül instance'ı zaten kuruyor (HMR)
  if (typeof setInterval === 'undefined') return;
  gcTimer = setInterval(() => {
    pruneExpired(Date.now());
    // Cap zaten write-path'te uygulanıyor; burada safety net.
    enforceCap();
  }, GC_INTERVAL_MS);
  setGcGlobalFlag(true);
  // Node/test ortamında process takılmasın — unref varsa çağır.
  const t = gcTimer as unknown as { unref?: () => void };
  if (typeof t.unref === 'function') t.unref();
}

function ensureChannel(): BroadcastChannel | null {
  if (bc || bcAttached) return bc;
  bcAttached = true;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (ev) => {
      const data = ev?.data as { fingerprint?: string } | null;
      if (!data || typeof data.fingerprint !== 'string') return;
      // Karşı pencereden dedupe sinyali — sadece cache'e ekle, re-dispatch yok.
      seen.set(data.fingerprint, { addedAt: Date.now() });
      enforceCap();
    };
  } catch {
    bc = null;
  }
  return bc;
}

export function hasSeen(fingerprint: string): boolean {
  const now = Date.now();
  pruneExpired(now);
  const hit = seen.get(fingerprint);
  if (!hit) return false;
  if (now - hit.addedAt > SEEN_TTL_MS) {
    seen.delete(fingerprint);
    return false;
  }
  return true;
}

/** Bu fingerprint'i 'seen' olarak işaretle + diğer context'lere yay. */
export function markSeen(fingerprint: string) {
  ensureGcTimer();
  const now = Date.now();
  pruneExpired(now);
  seen.set(fingerprint, { addedAt: now });
  enforceCap();
  const ch = ensureChannel();
  if (ch) {
    try { ch.postMessage({ fingerprint }); } catch { /* no-op */ }
  }
}

export function closeDedupeChannel() {
  if (gcTimer !== null) {
    try { clearInterval(gcTimer); } catch { /* no-op */ }
    gcTimer = null;
  }
  setGcGlobalFlag(false);
  if (bc) {
    try { bc.close(); } catch { /* no-op */ }
    bc = null;
  }
  bcAttached = false;
  seen.clear();
}

// Test helper
export const _internal = {
  snapshot: () => ({ size: seen.size, hasGc: gcTimer !== null }),
  runGcOnce: (now: number = Date.now()) => { pruneExpired(now); enforceCap(); },
  reset: () => {
    if (gcTimer !== null) { try { clearInterval(gcTimer); } catch { /* no-op */ } gcTimer = null; }
    setGcGlobalFlag(false);
    seen.clear();
    if (bc) { try { bc.close(); } catch { /* no-op */ } bc = null; }
    bcAttached = false;
  },
};
