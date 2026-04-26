/**
 * Audio capture options — tek kaynak.
 *
 * Daha önce `App.tsx` ve `useLiveKitConnection.ts` aynı constraint set'ini
 * duplicate ediyordu + `noiseSuppression` ile `autoGainControl` aynı
 * toggle'a bağlıydı. Bu drift'i kapatır ve AGC'yi bağımsız yapar.
 *
 * Sabit hint'ler (48 kHz / mono / 10 ms latency) RNNoise entegrasyonuna
 * hazırlık — RNNoise 48 kHz mono 480-sample frame bekler. Şimdilik yalnız
 * constraint düzeyinde hint; processor bağı yok.
 */

import type { AudioCaptureOptions } from 'livekit-client';

export interface AudioSettings {
  /** Kullanıcının native browser noise suppression toggle'ı. */
  noiseSuppression: boolean;
  /** AGC stabilite için açık tutulur. */
  autoGainControl?: boolean;
  deviceId?: string | null;
}

export function buildAudioCaptureOptions(settings: AudioSettings): AudioCaptureOptions {
  return {
    echoCancellation: true,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
    deviceId: settings.deviceId || undefined,
  } satisfies AudioCaptureOptions;
}

/**
 * Raw MediaTrackConstraints — bağımsız `getUserMedia` akışları için
 * (ör. `usePttAudio.ts` VAD analyser). LiveKit dışı akışlarda kullanılır.
 * AudioCaptureOptions yerine doğrudan `MediaTrackConstraints` döner.
 */
export function buildMediaTrackConstraints(settings: AudioSettings): MediaTrackConstraints {
  const opts: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
  };
  if (settings.deviceId) opts.deviceId = { exact: settings.deviceId };
  return opts;
}
