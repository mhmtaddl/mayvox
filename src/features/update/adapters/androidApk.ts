// ── Android APK Update Adapter ──────────────────────────────────────────────
import { isCapacitor } from '../../../lib/platform';
import { GITHUB_OWNER, GITHUB_REPO } from '../constants';

/**
 * APK indirme URL'sini sistem tarayıcısında açar.
 * Capacitor ortamında window.open(_system) kullanarak
 * Android'in kendi indirme yöneticisine yönlendirir.
 */
export function openApkDownload(apkUrl?: string, version?: string): boolean {
  if (!isCapacitor()) return false;

  const url = apkUrl || buildApkUrl(version || '');
  if (!url) return false;

  try {
    window.open(url, '_system');
    return true;
  } catch {
    return false;
  }
}

function buildApkUrl(version: string): string {
  if (!version) return '';
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/CylkSohbet-${version}.apk`;
}
