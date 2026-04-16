import online from '../assets/profil/online.png';
import pasif from '../assets/profil/pasif.png';
import dinliyor from '../assets/profil/dinliyor.png';
import duymuyor from '../assets/profil/duymuyor.png';
import afk from '../assets/profil/afk.png';
import cevrimdisi from '../assets/profil/cevrimdisi.png';

/** Kullanıcının avatar'ı özel bir URL mi (yüklenmiş bir resim mi)? */
export function hasCustomAvatar(avatar: string | null | undefined): boolean {
  return !!avatar && (avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/'));
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
