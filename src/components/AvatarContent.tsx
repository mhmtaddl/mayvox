import React from 'react';
import { hasCustomAvatar, getStatusAvatar } from '../lib/statusAvatar';
import { safePublicName } from '../lib/formatName';

/**
 * Tek tip avatar render pipeline'ı:
 *   1) Custom profil resmi (HTTP/data URL)
 *   2) Statüs PNG (online.png / afk.png / cevrimdisi.png / pasif.png / dinliyor.png / duymuyor.png)
 *   3) Son çare: ad baş harfi
 *
 * Wrapper (boyut, border-radius, background) çağıran tarafta kalır — bu bileşen
 * sadece "içerik" döndürür. Böylece mevcut layout/spacing bozulmaz.
 */
interface Props {
  avatar?: string | null;
  statusText?: string | null;
  firstName?: string | null;
  name?: string | null;
  /** Başharf rendered edildiğinde uygulanan class (typography/color). */
  letterClassName?: string;
  /** img etiketine uygulanan class — default w-full h-full object-cover. */
  imgClassName?: string;
  /** Alt metni (erişilebilirlik). */
  alt?: string;
}

export default function AvatarContent({
  avatar,
  statusText,
  firstName,
  name,
  letterClassName,
  imgClassName = 'w-full h-full object-cover',
  alt = '',
}: Props) {
  if (hasCustomAvatar(avatar)) {
    return <img src={avatar!} alt={alt} className={imgClassName} referrerPolicy="no-referrer" />;
  }
  const statusSrc = getStatusAvatar(statusText);
  if (statusSrc) {
    return <img src={statusSrc} alt={alt} className={imgClassName} />;
  }
  const initialSource = safePublicName(firstName) || safePublicName(name);
  const initial = (initialSource[0] || '?').toUpperCase();
  return (
    <span className={letterClassName ?? 'font-bold text-[var(--theme-accent)]'}>{initial}</span>
  );
}
