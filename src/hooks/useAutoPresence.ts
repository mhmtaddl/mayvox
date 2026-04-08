import { useRef, useEffect, useCallback } from 'react';

// ── Auto-Presence: kullanıcı aktivitesine göre otomatik durum tespiti ──────
// Tek aktivite kaynağı: bu hook hem auto-presence hem auto-leave için
// lastActivityRef'i yönetir. İki ayrı timer/ref oluşturmaz.
//
// AFK/Çevrimdışı gibi sabit durumlar aktifken auto-presence devre dışı kalır.
// Bu hook yalnızca statusText === 'Aktif' iken otomatik durumu yönetir.

export type AutoStatus = 'active' | 'idle' | 'deafened';

const ACTIVITY_THROTTLE_MS = 10_000; // 10 saniye — DOM event throttle
const CHECK_INTERVAL_MS = 15_000;    // 15 saniye — idle kontrol aralığı
const DEFAULT_IDLE_MS = 5 * 60 * 1000; // Fallback: 5dk (autoLeaveMinutes yoksa)

interface UseAutoPresenceProps {
  /** Kullanıcı giriş yapmış mı */
  isLoggedIn: boolean;
  /** Kullanıcının kendi hoparlör kapatması */
  isDeafened: boolean;
  /** PTT basılı mı (konuşma aktivitesi) */
  isPttPressed: boolean;
  /** Mevcut statusText (Aktif/AFK/Çevrimdışı/Pasif/Duymuyor...) */
  statusText: string | undefined;
  /** Idle eşiği (ms). Ayarlardaki autoLeaveMinutes * 60 * 1000 verilmeli.
   *  0 veya undefined → DEFAULT_IDLE_MS kullanılır. */
  idleThresholdMs?: number;
  /** Durum değiştiğinde çağrılır — sadece gerçek değişikliklerde */
  onStatusChange: (status: AutoStatus) => void;
}

/** Manuel / sabit statü değerleri — bunlar aktifken auto-presence override etmez */
const MANUAL_STATUSES = new Set([
  'AFK',
  'Çevrimdışı',
]);

function isManualStatus(text: string | undefined): boolean {
  if (!text) return false;
  return MANUAL_STATUSES.has(text);
}

export function useAutoPresence({
  isLoggedIn,
  isDeafened,
  isPttPressed,
  statusText,
  idleThresholdMs,
  onStatusChange,
}: UseAutoPresenceProps) {
  // ── Tek aktivite kaynağı — auto-leave de bu ref'i kullanmalı ──────────
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottledRef = useRef<number>(0);
  const currentAutoStatusRef = useRef<AutoStatus>('active');
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const effectiveThreshold = idleThresholdMs && idleThresholdMs > 0
    ? idleThresholdMs
    : DEFAULT_IDLE_MS;

  // ── Activity kaydı (throttled) ────────────────────────────────────────
  // idle → active geçişi hızlı olsun: eğer şu an idle'daysa throttle bypass
  const recordActivity = useCallback(() => {
    const now = Date.now();
    const wasIdle = currentAutoStatusRef.current === 'idle';
    if (!wasIdle && now - lastThrottledRef.current < ACTIVITY_THROTTLE_MS) return;
    lastThrottledRef.current = now;
    lastActivityRef.current = now;
    // idle → active anında geçiş (15sn interval beklemesin)
    if (wasIdle) {
      currentAutoStatusRef.current = 'active';
      onStatusChangeRef.current('active');
    }
  }, []);

  // ── Anında activity kaydı (throttle yok — PTT, kanal değişimi vb.) ───
  const recordActivityImmediate = useCallback(() => {
    const now = Date.now();
    lastThrottledRef.current = now;
    lastActivityRef.current = now;
  }, []);

  // ── PTT konuşma aktivitesi — anında kaydet + idle'dan çıkış ─────────
  useEffect(() => {
    if (isPttPressed) {
      recordActivityImmediate();
      // idle/deafened → active anında geçiş
      if (currentAutoStatusRef.current !== 'active' && !isManualStatus(statusText) && !isDeafened) {
        currentAutoStatusRef.current = 'active';
        onStatusChangeRef.current('active');
      }
    }
  }, [isPttPressed, recordActivityImmediate, statusText, isDeafened]);

  // ── DOM event listener'ları (mouse, keyboard, click, touch) ───────────
  useEffect(() => {
    if (!isLoggedIn) return;

    const handler = () => recordActivity();

    window.addEventListener('mousemove', handler, { passive: true });
    window.addEventListener('keydown', handler, { passive: true });
    window.addEventListener('click', handler, { passive: true });
    window.addEventListener('touchstart', handler, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [isLoggedIn, recordActivity]);

  // ── Durum hesaplama interval'ı ────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;

    const computeStatus = (): AutoStatus => {
      // Manuel statü aktifken auto-presence devre dışı
      if (isManualStatus(statusText)) return currentAutoStatusRef.current;

      // Öncelik 1: Deafen
      if (isDeafened) return 'deafened';

      // Öncelik 2: Son aktiviteden bu yana geçen süre
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= effectiveThreshold) return 'idle';

      // Varsayılan: aktif
      return 'active';
    };

    const check = () => {
      const newStatus = computeStatus();
      if (newStatus !== currentAutoStatusRef.current) {
        currentAutoStatusRef.current = newStatus;
        onStatusChangeRef.current(newStatus);
      }
    };

    // İlk hesaplama
    check();

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLoggedIn, isDeafened, statusText, effectiveThreshold]);

  // ── Deafen değişiminde anında tepki (interval beklemesin) ─────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    if (isManualStatus(statusText)) return;

    if (isDeafened) {
      // Deafen açıldı → anında 'deafened'
      if (currentAutoStatusRef.current !== 'deafened') {
        currentAutoStatusRef.current = 'deafened';
        onStatusChangeRef.current('deafened');
      }
    } else {
      // Deafen kapatıldı → activity sıfırla + anında 'active'
      // (yoksa eski lastActivity yüzünden hemen 'idle' hesaplanabilir)
      recordActivityImmediate();
      if (currentAutoStatusRef.current !== 'active') {
        currentAutoStatusRef.current = 'active';
        onStatusChangeRef.current('active');
      }
    }
  }, [isDeafened, isLoggedIn, statusText, recordActivityImmediate]);

  // ── Manuel statüden "Aktif"e dönüşte activity sıfırla ────────────────
  useEffect(() => {
    if (statusText === 'Aktif' || !statusText) {
      recordActivityImmediate();
      // Manuel statüden döndüyse durumu yeniden hesapla
      const newStatus: AutoStatus = isDeafened ? 'deafened' : 'active';
      if (newStatus !== currentAutoStatusRef.current) {
        currentAutoStatusRef.current = newStatus;
        onStatusChangeRef.current(newStatus);
      }
    }
  }, [statusText, isDeafened, recordActivityImmediate]);

  return {
    /** Son aktivite zamanı ref'i — auto-leave timer da bu ref'i kullanmalı */
    lastActivityRef,
    /** Throttled activity kaydı (DOM eventleri için) */
    recordActivity,
    /** Anında activity kaydı (PTT, kanal değişimi için) */
    recordActivityImmediate,
    /** Mevcut otomatik durum ref'i */
    currentAutoStatus: currentAutoStatusRef,
  };
}
