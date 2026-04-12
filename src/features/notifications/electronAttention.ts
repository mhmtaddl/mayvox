/**
 * Window attention — 600ms delayed flash; focus hızlı dönerse tetiklenmez.
 * Electron varsa `flashFrame`, yoksa document.title blink fallback.
 */

const FLASH_DELAY_MS = 600;

interface ElectronNotifyBridge {
  flashFrame: (on: boolean) => void;
}

function getBridge(): ElectronNotifyBridge | null {
  try {
    const w = window as unknown as { electronNotify?: ElectronNotifyBridge };
    if (w.electronNotify && typeof w.electronNotify.flashFrame === 'function') {
      return w.electronNotify;
    }
  } catch { /* no-op */ }
  return null;
}

// ── Title-flash fallback ──────────────────────────────────────────────────
let titleTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';
let focusBound = false;
let activeFlashOn = false;
let pendingFlashTimer: ReturnType<typeof setTimeout> | null = null;

function bindFocusListenerOnce() {
  if (focusBound || typeof window === 'undefined') return;
  focusBound = true;
  window.addEventListener('focus', () => {
    cancelPendingFlash();
    stopFlashNow();
  });
}

function cancelPendingFlash() {
  if (pendingFlashTimer) {
    clearTimeout(pendingFlashTimer);
    pendingFlashTimer = null;
  }
}

function stopTitleFlash() {
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null; }
  if (originalTitle) { document.title = originalTitle; originalTitle = ''; }
}

function startTitleFlash() {
  if (titleTimer || typeof document === 'undefined') return;
  originalTitle = document.title;
  let flip = false;
  titleTimer = setInterval(() => {
    flip = !flip;
    document.title = flip ? '● ' + originalTitle : originalTitle;
  }, 900);
}

function applyFlashOn() {
  activeFlashOn = true;
  const bridge = getBridge();
  if (bridge) {
    try { bridge.flashFrame(true); } catch { /* no-op */ }
    return;
  }
  startTitleFlash();
}

function stopFlashNow() {
  activeFlashOn = false;
  const bridge = getBridge();
  if (bridge) {
    try { bridge.flashFrame(false); } catch { /* no-op */ }
  }
  stopTitleFlash();
}

/**
 * Flash iste/iptal et — anti-stack invariant'lar:
 *   (1) en fazla BİR pending timer
 *   (2) en fazla BİR aktif flash state
 *   (3) pending veya aktif iken yeni `on=true` isteği no-op (stacking yok)
 *   (4) focus olayı pending + aktif her ikisini de temizler
 *   (5) `on=false` pending'i iptal + aktif flash'i durdurur
 *
 * Peş peşe 50 notification gelse bile yalnızca 1 kez flash tetiklenir.
 */
export function requestElectronFlash(on: boolean) {
  bindFocusListenerOnce();

  if (!on) {
    cancelPendingFlash();
    if (activeFlashOn) stopFlashNow();
    return;
  }

  // Invariant (3): zaten aktif veya pending ise no-op.
  if (activeFlashOn) return;
  if (pendingFlashTimer !== null) return;

  pendingFlashTimer = setTimeout(() => {
    pendingFlashTimer = null;
    // Belt-and-suspenders: focus listener zaten cancel eder, yine de double-check.
    if (typeof document !== 'undefined' && document.hasFocus()) return;
    applyFlashOn();
  }, FLASH_DELAY_MS);
}

// Test helper
export const _testing = {
  hasPending: () => pendingFlashTimer !== null,
  isActive: () => activeFlashOn,
  reset: () => {
    cancelPendingFlash();
    stopFlashNow();
  },
};
