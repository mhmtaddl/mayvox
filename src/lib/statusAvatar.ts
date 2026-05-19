import online from '../assets/profil/online.png';
import pasif from '../assets/profil/pasif.png';
import dinliyor from '../assets/profil/dinliyor.png';
import duymuyor from '../assets/profil/duymuyor.png';
import afk from '../assets/profil/afk.png';
import cevrimdisi from '../assets/profil/cevrimdisi.png';

/** Kullanıcının avatar'ı özel bir URL mi (yüklenmiş bir resim mi)? */
export function hasCustomAvatar(avatar: string | null | undefined): boolean {
  const value = String(avatar || '').trim();
  return !!value && (
    value.startsWith('http')
    || value.startsWith('data:')
    || value.startsWith('/')
    || value.replace(/\\/g, '/').startsWith('uploads/')
  );
}

const PUBLIC_API_BASE = String(
  import.meta.env.VITE_TOKEN_SERVER_URL || import.meta.env.VITE_SERVER_API_URL || 'https://api.mayvox.com'
).replace(/\/$/, '');

const SERVER_API_BASE = String(
  import.meta.env.VITE_SERVER_API_URL || import.meta.env.VITE_TOKEN_SERVER_URL || 'https://api.mayvox.com'
).replace(/\/$/, '');

function pushUniqueUrl(urls: string[], value: string) {
  if (value && !urls.includes(value)) urls.push(value);
}

export function resolveAvatarUrls(avatar: string | null | undefined): string[] {
  const value = String(avatar || '').trim();
  if (!value) return [];
  if (value.startsWith('data:')) return [value];

  const normalizedPath = value.replace(/\\/g, '/');
  const urls: string[] = [];

  if (normalizedPath.startsWith('/uploads/')) {
    pushUniqueUrl(urls, `${PUBLIC_API_BASE}${normalizedPath}`);
    pushUniqueUrl(urls, `${SERVER_API_BASE}${normalizedPath}`);
    return urls;
  }

  if (normalizedPath.startsWith('uploads/')) {
    pushUniqueUrl(urls, `${PUBLIC_API_BASE}/${normalizedPath}`);
    pushUniqueUrl(urls, `${SERVER_API_BASE}/${normalizedPath}`);
    return urls;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      const legacyAvatarMatch = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/([^/]+)\/avatar$/);
      if (legacyAvatarMatch?.[1]) {
        const legacyPath = `/uploads/legacy-avatars/${legacyAvatarMatch[1]}/avatar.jpg`;
        pushUniqueUrl(urls, `${PUBLIC_API_BASE}${legacyPath}`);
        pushUniqueUrl(urls, `${SERVER_API_BASE}${legacyPath}`);
      }
      if (url.pathname.startsWith('/uploads/')) {
        pushUniqueUrl(urls, `${PUBLIC_API_BASE}${url.pathname}${url.search}`);
        pushUniqueUrl(urls, `${SERVER_API_BASE}${url.pathname}${url.search}`);
      }
    } catch {
      return [value];
    }
    pushUniqueUrl(urls, value);
    return urls;
  }

  return [value];
}

/**
 * Status'a göre varsayılan avatar resmi. Özel avatar yoksa kullanılır.
 * Bilinmeyen/desteklenmeyen statü için null döner (çağıran taraf baş harfi göstersin).
 */
export function getStatusAvatar(statusText: string | null | undefined): string | null {
  switch (statusText) {
    case 'Online':
    case 'Aktif': // legacy
      return online;
    case 'Pasif':
      return pasif;
    case 'Dinliyor':
      return dinliyor;
    case 'Duymuyor':
    case 'Sessiz': // deafened varyasyonu — aynı görsel
    case 'Rahatsız Etmeyin': // DND — aynı görsel (do-not-disturb)
      return duymuyor;
    case 'AFK':
      return afk;
    case 'Çevrimdışı':
      return cevrimdisi;
    default:
      return null;
  }
}
