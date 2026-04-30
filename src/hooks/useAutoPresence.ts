import { useRef, useEffect, useCallback } from 'react';
import type React from 'react';

// ── Auto-Presence: kullanıcı aktivitesine göre otomatik durum tespiti ──────
// Tek aktivite kaynağı: bu hook hem auto-presence hem auto-leave için
// lastActivityRef'i yönetir. İki ayrı timer/ref oluşturmaz.
//
// AFK/Çevrimdışı gibi sabit durumlar aktifken auto-presence devre dışı kalır.
// Bu hook yalnızca statusText === 'Aktif' iken otomatik durumu yönetir.

export type AutoStatus = 'active' | 'idle' | 'deafened';

const ACTIVITY_THROTTLE_MS = 10_000; // 10 saniye — DOM event throttle
const CHECK_INTERVAL_MS = 15_000;    // 15 saniye — idle kontrol aralığı
// Pasif eşiği: auto-leave ayarından BAĞIMSIZ sabit 10 dakika.
// Auto-leave kapatılsa bile "Pasif" görünür olmaya devam etmeli.
export const IDLE_THRESHOLD_MS = 10 * 60 * 1000;

interface UseAutoPresenceProps {
  /** Kullanıcı giriş yapmış mı */
  isLoggedIn: boolean;
  /** Kullanıcının kendi hoparlör kapatması */
  isDeafened: boolean;
  /** PTT basılı mı (konuşma aktivitesi) */
  isPttPressed: boolean;
  /** Mevcut statusText (Aktif/AFK/Çevrimdışı/Pasif/Duymuyor...) */
  statusText: string | undefined;
  /** Mic muted mı (mute açıkken voice activity yok sayılır) */
  isMuted: boolean;
  /** LiveKit local participant audio level ref (0..1) */
  localAudioLevelRef?: React.MutableRefObject<number>;
  /** Voice activity polling sadece aktif ses odası varken gerekli */
  voiceActivityEnabled?: boolean;
  /** Durum değiştiğinde çağrılır — sadece gerçek değişikliklerde */
  onStatusChange: (status: AutoStatus) => void;
}

/** Manuel / sabit statü değerleri — bunlar aktifken auto-presence override etmez.
 *  AFK burada DEĞİL: AFK iken de idle sayacı çalışmaya devam eder, ama UI
 *  statusText="AFK" olduğu sürece AFK gösterir. AFK clear sadece kanal join
 *  veya manuel statusText değişimi ile yapılır (App.tsx). DOM event AFK'yı
 *  temizlemez — kanaldan auto-removed olan kullanıcı mouse oynattı diye
 *  "Aktif" görünmemeli. */
const MANUAL_STATUSES = new Set([
  'Çevrimdışı',
  'Rahatsız Etmeyin',
  'AFK',
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
  isMuted,
  localAudioLevelRef,
  voiceActivityEnabled = true,
  onStatusChange,
}: UseAutoPresenceProps) {
  // ── Tek aktivite kaynağı — auto-leave de bu ref'i kullanmalı ──────────
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottledRef = useRef<number>(0);
  const currentAutoStatusRef = useRef<AutoStatus>('active');
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

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

  // ── DOM event listener'ları — "gerçek etkileşim" modeli ───────────────
  // mousemove KASITLI kaldırıldı: sadece pencerede mouse oynaması "aktif"
  // sayılmamalı. Kullanıcı gerçekten bir şey yapıyor mu kriteri:
  //   - click (butonlar, menüler, kanallar)
  //   - keydown (klavye ile yazma/gezinme)
  //   - touchstart (mobil dokunma)
  // Voice activity (mic) + PTT ayrıca ayrı path'lerden zaten recordActivity çağırır.
  useEffect(() => {
    if (!isLoggedIn) return;

    const handler = () => recordActivity();

    window.addEventListener('keydown', handler, { passive: true });
    window.addEventListener('click', handler, { passive: true });
    window.addEventListener('touchstart', handler, { passive: true });

    return () => {
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
      if (elapsed >= IDLE_THRESHOLD_MS) return 'idle';

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
  }, [isLoggedIn, isDeafened, statusText]);

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

  // ── Voice activity: local audio level > threshold + 600ms debounce ───
  // speakingLevels pipeline'ına dokunulmaz (ducking). Sadece local user'ın
  // seviyesi belirli süre eşiğin üzerindeyse activity kaydı tetiklenir.
  useEffect(() => {
    if (!isLoggedIn || !localAudioLevelRef || !voiceActivityEnabled || isMuted) return;
    const VOICE_THRESHOLD = 0.02;
    const VOICE_DEBOUNCE_MS = 600;
    const CHECK_MS = 200;
    let sustainedStart: number | null = null;
    const tick = () => {
      const level = localAudioLevelRef.current ?? 0;
      if (level > VOICE_THRESHOLD) {
        if (sustainedStart === null) sustainedStart = Date.now();
        else if (Date.now() - sustainedStart >= VOICE_DEBOUNCE_MS) {
          recordActivity();
          // recordActivity zaten throttled (10sn) — burada reset etmek gerekmez
        }
      } else {
        sustainedStart = null;
      }
    };
    const interval = setInterval(tick, CHECK_MS);
    return () => clearInterval(interval);
  }, [isLoggedIn, isMuted, localAudioLevelRef, recordActivity, voiceActivityEnabled]);

  // ── Manuel statüden "Aktif"e dönüşte activity sıfırla ────────────────
  useEffect(() => {
    if (statusText === 'Online' || statusText === 'Aktif' || !statusText) {
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
