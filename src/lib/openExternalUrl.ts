/**
 * Harici URL açıcı — platform-adaptive + güvenlik guard.
 *
 * Guard: SADECE http/https URL açılır. javascript:, file:, data:, custom protocol
 * tamamen reddedilir (chat'ten gelen mesajlar untrusted kabul edilir).
 *
 * Routing:
 *   Electron   → IPC köprüsü → main process shell.openExternal (default tarayıcı)
 *   Capacitor  → window.open(url, '_system') (Android sistem intent)
 *   Web        → window.open(url, '_blank', 'noopener,noreferrer')
 */

import { isElectron, isCapacitor } from './platform';

type ElectronShellBridge = { openExternal: (url: string) => void };

declare global {
  interface Window { electronShell?: ElectronShellBridge }
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * URL'yi harici tarayıcıda açar. http/https dışı protokoller sessizce reddedilir.
 * @returns gerçekten açıldıysa true
 */
export function openExternalUrl(raw: string): boolean {
  if (!isSafeHttpUrl(raw)) return false;
  try {
    if (isElectron() && window.electronShell?.openExternal) {
      window.electronShell.openExternal(raw);
      return true;
    }
    if (isCapacitor()) {
      window.open(raw, '_system');
      return true;
    }
    const w = window.open(raw, '_blank', 'noopener,noreferrer');
    // Fallback: window.opener temizlenmesi bazı eski browserlarda manuel gerekir
    if (w) { try { (w as Window).opener = null; } catch { /* no-op */ } }
    return true;
  } catch {
    return false;
  }
}
