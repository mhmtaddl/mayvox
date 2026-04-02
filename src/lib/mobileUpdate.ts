/**
 * Android APK güncelleme.
 * GitHub release APK linkini sistem tarayıcısında açar →
 * Android kendi indirme yöneticisi ile indirir → kullanıcı kurar.
 */
import { isCapacitor } from './platform';

const GITHUB_OWNER = 'mhmtaddl';
const GITHUB_REPO = 'caylaklar-sesli-sohbet';

function getApkUrl(version: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${version}/CylkSohbet-${version}.apk`;
}

/** APK indirme sayfasını sistem tarayıcısında aç */
export function openApkDownload(version: string): void {
  if (!isCapacitor()) return;
  const url = getApkUrl(version);
  window.open(url, '_system');
}
