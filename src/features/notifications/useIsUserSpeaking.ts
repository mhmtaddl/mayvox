import { useEffect, useRef, useState } from 'react';

/**
 * Kullanıcının kendi konuşma durumunu `speakingLevels` map'inden
 * hysteresis ile türetir.
 *
 * - Eşik üstüne çıkınca: isSpeaking=true (anında).
 * - Eşik altına düşünce: holdMs kadar bekler (geçici duraklamaları yutar),
 *   sonra false olur.
 *
 * Parametreler:
 *   threshold: 0..1 arası level eşiği (default 0.08 — voice activity tipik orta seviye).
 *   holdMs:    eşik altına düştükten sonra kapatmadan önceki hold süresi (default 400 ms).
 *
 * Nedeni: konuşma doğası gereği seviye sürekli oscillate eder. Threshold'u anlık
 * tetiklemek flicker yapar; hold penceresi ile state kararlı kalır.
 */
export function useIsUserSpeaking(
  currentUserId: string | null | undefined,
  speakingLevels: Record<string, number> | undefined,
  opts?: { threshold?: number; holdMs?: number },
): boolean {
  const threshold = opts?.threshold ?? 0.08;
  const holdMs = opts?.holdMs ?? 400;

  const [speaking, setSpeaking] = useState(false);
  const pendingOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    const level = speakingLevels?.[currentUserId] ?? 0;

    if (level >= threshold) {
      // Eşik üstü: anında true; pending-off timer'ı iptal.
      if (pendingOffTimerRef.current) {
        clearTimeout(pendingOffTimerRef.current);
        pendingOffTimerRef.current = null;
      }
      if (!speaking) setSpeaking(true);
      return;
    }

    // Eşik altı: zaten false ise no-op; true ise hold timer kur (zaten varsa dokunma).
    if (!speaking) return;
    if (pendingOffTimerRef.current) return;
    pendingOffTimerRef.current = setTimeout(() => {
      pendingOffTimerRef.current = null;
      setSpeaking(false);
    }, holdMs);
  }, [currentUserId, speakingLevels, threshold, holdMs, speaking]);

  // Unmount cleanup
  useEffect(() => () => {
    if (pendingOffTimerRef.current) {
      clearTimeout(pendingOffTimerRef.current);
      pendingOffTimerRef.current = null;
    }
  }, []);

  return speaking;
}

// Test helper — pure hysteresis logic'i React'tan bağımsız test için.
export function simulateSpeakingTransition(
  prev: boolean,
  level: number,
  threshold: number,
): { immediateSpeaking: boolean; shouldArmHoldTimer: boolean } {
  if (level >= threshold) {
    return { immediateSpeaking: true, shouldArmHoldTimer: false };
  }
  // Eşik altı
  if (!prev) return { immediateSpeaking: false, shouldArmHoldTimer: false };
  return { immediateSpeaking: true, shouldArmHoldTimer: true };
}
