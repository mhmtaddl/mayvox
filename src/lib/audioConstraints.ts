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
  /**
   * Kullanıcının NS toggle'ı. RNNoise aktifse burası TRUE olsa bile native
   * NS'yi KAPAT (double-processing engelleme); `rnnoiseActive=true` gönder.
   */
  noiseSuppression: boolean;
  /** AGC AYRI toggle — NS'den bağımsız. Default true. */
  autoGainControl?: boolean;
  /** RNNoise worklet aktifse: native Chromium NS kapatılır, double-processing engellenir. */
  rnnoiseActive?: boolean;
  deviceId?: string | null;
}

export function buildAudioCaptureOptions(settings: AudioSettings): AudioCaptureOptions {
  // Double-processing fix: RNNoise varsa native NS off; yoksa user toggle'ı uygulanır.
  const effectiveNS = settings.rnnoiseActive ? false : settings.noiseSuppression;
  return {
    echoCancellation: true,
    noiseSuppression: effectiveNS,
    autoGainControl: settings.autoGainControl ?? true,
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
  const effectiveNS = settings.rnnoiseActive ? false : settings.noiseSuppression;
  const opts: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: effectiveNS,
    autoGainControl: settings.autoGainControl ?? true,
    sampleRate: 48000,
    channelCount: 1,
  };
  if (settings.deviceId) opts.deviceId = { exact: settings.deviceId };
  return opts;
}
