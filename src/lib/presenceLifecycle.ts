import type { User } from '../types';

interface PresenceDeps {
  startPresence: (user: User, appVersion: string) => void;
  resyncPresence: () => void;
  resyncPresenceRef: { current: () => void };
}

/**
 * Presence başlatma dizisi — login, register ve session restore sonrası çağrılır.
 * 1. startPresence: Supabase presence channel'ına subscribe ol
 * 2. resyncPresence: Mevcut presence state'ini uygula
 * 3. 1.5s fallback: WebSocket bağlantısı geç olabilir, tekrar dene
 */
export function activatePresence(
  user: User,
  appVersion: string,
  deps: PresenceDeps,
) {
  deps.startPresence(user, appVersion);
  deps.resyncPresence();
  setTimeout(() => deps.resyncPresenceRef.current(), 1500);
}
