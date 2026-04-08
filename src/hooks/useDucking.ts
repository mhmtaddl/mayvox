import React, { useRef, useEffect } from 'react';
import type { Room, RemoteParticipant } from 'livekit-client';
import { RemoteAudioTrack } from 'livekit-client';
import type { DuckingConfig } from '../lib/roomModeConfig';

// ── Smart Voice Ducking — dominant speaker based ──────────────────────────
// Biri konuşurken diğerlerinin sesi otomatik kısılır.
// Room mode config'den ducking parametreleri okunur.
// Kullanıcının manuel volume ayarına çarpan olarak uygulanır (override etmez).

const TICK_MS = 120; // Ducking hesaplama aralığı
const DOMINANT_THRESHOLD = 0.02; // Bu seviyenin altı = konuşmuyor

interface UseDuckingProps {
  /** LiveKit room ref */
  livekitRoomRef: React.MutableRefObject<Room | null>;
  /** Mevcut speaking levels — { identity: audioLevel } */
  speakingLevels: Record<string, number>;
  /** Kullanıcının manuel volume ayarları — { userId: 1-99 } */
  userVolumes: Record<string, number>;
  /** Ducking config (room mode'dan) */
  duckingConfig: DuckingConfig;
  /** Aktif kanaldaysa true */
  isConnected: boolean;
  /** Mevcut kullanıcının adı (kendi sesine ducking uygulanmaz) */
  localIdentity: string;
}

export function useDucking({
  livekitRoomRef,
  speakingLevels,
  userVolumes,
  duckingConfig,
  isConnected,
  localIdentity,
}: UseDuckingProps) {
  // Her remote participant için mevcut ducking çarpanı (0–1 arasında, 1 = tam ses)
  const currentGainsRef = useRef<Map<string, number>>(new Map());
  // Her participant için hedef gain
  const targetGainsRef = useRef<Map<string, number>>(new Map());

  const configRef = useRef(duckingConfig);
  configRef.current = duckingConfig;
  const userVolumesRef = useRef(userVolumes);
  userVolumesRef.current = userVolumes;
  const speakingRef = useRef(speakingLevels);
  speakingRef.current = speakingLevels;

  useEffect(() => {
    if (!isConnected || !duckingConfig.enabled) {
      // Ducking devre dışı — tüm gain'leri 1.0'a restore et
      restoreAll();
      return;
    }

    const interval = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(interval);
      restoreAll();
    };
  }, [isConnected, duckingConfig.enabled, duckingConfig.amount]);

  function restoreAll() {
    const room = livekitRoomRef.current;
    if (!room) return;
    currentGainsRef.current.clear();
    targetGainsRef.current.clear();
    // Tüm remote participant'ların sesini kullanıcı ayarına geri yükle
    for (const [, p] of room.remoteParticipants) {
      applyVolume(p.identity, 1.0);
    }
  }

  function tick() {
    const room = livekitRoomRef.current;
    if (!room) return;
    const cfg = configRef.current;
    if (!cfg.enabled) return;

    const levels = speakingRef.current;

    // Dominant speaker: en yüksek ses seviyesine sahip, eşiğin üstündeki katılımcı
    let dominantId: string | null = null;
    let maxLevel = 0;
    const identities = Object.keys(levels);
    for (const identity of identities) {
      const level = levels[identity];
      if (identity === localIdentity) continue;
      if (level > DOMINANT_THRESHOLD && level > maxLevel) {
        maxLevel = level;
        dominantId = identity;
      }
    }

    // Her remote participant için hedef gain hesapla
    for (const [, p] of room.remoteParticipants) {
      const id = p.identity;
      if (dominantId && id !== dominantId) {
        // Dominant değil → ses kıs
        targetGainsRef.current.set(id, 1.0 - cfg.amount);
      } else {
        // Dominant veya kimse konuşmuyor → tam ses
        targetGainsRef.current.set(id, 1.0);
      }
    }

    // Smooth interpolation — her tick'te hedefe doğru ilerle
    for (const [, p] of room.remoteParticipants) {
      const id = p.identity;
      const current = currentGainsRef.current.get(id) ?? 1.0;
      const target = targetGainsRef.current.get(id) ?? 1.0;

      if (Math.abs(current - target) < 0.01) {
        // Yeterince yakın — tam değere snap
        if (current !== target) {
          currentGainsRef.current.set(id, target);
          applyVolume(id, target);
        }
        continue;
      }

      // Linear interpolation: her tick'te ne kadar ilerlenir
      const isAttack = target < current; // Ses kısılıyor
      const durationMs = isAttack ? cfg.attackMs : cfg.releaseMs;
      const stepSize = durationMs > 0 ? (TICK_MS / durationMs) : 1;
      const step = (target - current) * Math.min(1, stepSize);

      const next = current + step;
      currentGainsRef.current.set(id, next);
      applyVolume(id, next);
    }

    // Ayrılmış participant'ları temizle
    const activeIds = new Set(Array.from(room.remoteParticipants.values()).map((p: RemoteParticipant) => p.identity));
    for (const id of currentGainsRef.current.keys()) {
      if (!activeIds.has(id)) {
        currentGainsRef.current.delete(id);
        targetGainsRef.current.delete(id);
      }
    }
  }

  function applyVolume(identity: string, duckingGain: number) {
    const room = livekitRoomRef.current;
    if (!room) return;

    // Kullanıcının manuel volume ayarı (1-99, default 50)
    // Ducking gain bunu çarpan olarak uygular, override etmez
    const userVol = (userVolumesRef.current[identity] ?? 50) / 100;
    const finalVol = Math.max(0, Math.min(1, userVol * duckingGain));

    // LiveKit track API
    for (const [, p] of room.remoteParticipants) {
      if (p.identity !== identity) continue;
      for (const pub of p.audioTrackPublications.values()) {
        const track = pub.track ?? (pub as any).audioTrack;
        if (track && track instanceof RemoteAudioTrack) {
          track.setVolume(finalVol);
        }
      }
      // DOM fallback
      document.querySelectorAll<HTMLAudioElement>(`audio[data-participant="${identity}"]`).forEach(el => {
        el.volume = finalVol;
      });
      break;
    }
  }
}
