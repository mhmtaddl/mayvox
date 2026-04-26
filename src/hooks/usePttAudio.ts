import { useState, useEffect, useRef, useMemo } from 'react';
import type { VoiceMode } from '../contexts/SettingsCtx';

interface UsePttAudioParams {
  pttKey: string;
  setPttKey: (key: string) => void;
  isListeningForKey: boolean;
  setIsListeningForKey: (v: boolean) => void;
  isMuted: boolean;
  isVoiceBanned: boolean;
  /**
   * Server-side ses bloğu (moderatör mute / timeout / room-kick / ban).
   * true iken PTT keydown, VAD speaking trigger ve capture tamamen bloklanır.
   * voiceDisabledReason !== null ile beslenir.
   */
  isServerMuted: boolean;
  isVoiceConnected: boolean;
  selectedInput: string;
  isNoiseSuppressionEnabled: boolean;
  noiseThreshold: number;
  isLowDataMode: boolean;
  pttReleaseDelay: number;
  voiceMode: VoiceMode;
  visualMeterEnabled?: boolean;
  onMicError?: (msg: string) => void;
}

declare global {
  interface Window {
    electronPtt?: {
      init: (keyStr: string) => void;
      initRaw: (rawCode: string) => void;
      startListening: () => void;
      stopListening: () => void;
      onKeyAssigned: (cb: (data: { displayName: string; rawCode?: string }) => void) => void;
      offKeyAssigned: () => void;
      onDown: (cb: () => void) => void;
      offDown: () => void;
      onUp: (cb: () => void) => void;
      offUp: () => void;
    };
  }
}

const VAD_SILENCE_TIMEOUT = 500;

export function usePttAudio(params: UsePttAudioParams) {
  const {
    pttKey, setPttKey, isListeningForKey, setIsListeningForKey,
    isMuted, isVoiceBanned, isServerMuted, isVoiceConnected, selectedInput,
    isNoiseSuppressionEnabled, noiseThreshold, isLowDataMode,
    pttReleaseDelay, voiceMode, visualMeterEnabled = true, onMicError,
  } = params;

  const [isPttPressed, setIsPttPressed] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pttReleaseDelayRef = useRef(pttReleaseDelay);
  const isVoiceConnectedRef = useRef(isVoiceConnected);
  const isPttPressedRef = useRef(isPttPressed);
  const isMutedRef = useRef(isMuted);
  const isServerMutedRef = useRef(isServerMuted);
  const noiseThresholdRef = useRef(noiseThreshold);
  const isNoiseSupRef = useRef(isNoiseSuppressionEnabled);
  const isLowDataRef = useRef(isLowDataMode);

  useEffect(() => { pttReleaseDelayRef.current = pttReleaseDelay; }, [pttReleaseDelay]);
  useEffect(() => { isPttPressedRef.current = isPttPressed; }, [isPttPressed]);
  useEffect(() => { isMutedRef.current = isMuted; if (isMuted && isPttPressed) setIsPttPressed(false); }, [isMuted, isPttPressed]);
  useEffect(() => {
    isServerMutedRef.current = isServerMuted;
    // Server tarafı susturma/kick/timeout geldi — hemen PTT state'ini düşür.
    // Stuck "basılı" state'i kalırsa kullanıcı tekrar izin alınca otomatik konuşmaya
    // başlar, bunu önlüyoruz: tekrar konuşmak için tekrar basmak zorunda.
    if (isServerMuted && isPttPressed) setIsPttPressed(false);
  }, [isServerMuted, isPttPressed]);
  useEffect(() => { noiseThresholdRef.current = noiseThreshold; }, [noiseThreshold]);
  useEffect(() => { isNoiseSupRef.current = isNoiseSuppressionEnabled; }, [isNoiseSuppressionEnabled]);
  useEffect(() => { isLowDataRef.current = isLowDataMode; }, [isLowDataMode]);
  useEffect(() => {
    isVoiceConnectedRef.current = isVoiceConnected;
    if (!isVoiceConnected && isPttPressed) setIsPttPressed(false);
  }, [isVoiceConnected, isPttPressed]);

  const stopCaptureGraph = () => {
    if (animationRef.current) {
      window.clearTimeout(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* no-op */ }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* no-op */ }
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // Electron PTT init
  useEffect(() => {
    const rawCode = localStorage.getItem('pttRawCode');
    if (pttKey && rawCode && window.electronPtt?.initRaw) window.electronPtt.initRaw(rawCode);
    else if (pttKey) window.electronPtt?.init(pttKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PTT tuşu atama
  useEffect(() => {
    if (!isListeningForKey) return;
    if (window.electronPtt) {
      // Kısa gecikme — butona tıklama event'inin uiohook tarafından yakalanmasını atla
      const startTimer = setTimeout(() => {
        window.electronPtt!.startListening();
      }, 150);
      window.electronPtt.onKeyAssigned(({ displayName, rawCode }) => {
        setPttKey(displayName);
        if (rawCode) localStorage.setItem('pttRawCode', rawCode);
        setIsListeningForKey(false);
        window.electronPtt!.stopListening();
      });
      return () => { clearTimeout(startTimer); window.electronPtt!.offKeyAssigned(); window.electronPtt!.stopListening(); };
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const k = e.code === 'Space' ? 'SPACE' : e.code.startsWith('Control') ? 'CTRL' : e.key.toUpperCase();
      setPttKey(k); setIsListeningForKey(false);
    };
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      setPttKey(e.button === 0 ? 'MOUSE 0' : e.button === 1 ? 'MOUSE 1' : `MOUSE ${e.button}`);
      setIsListeningForKey(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => { window.removeEventListener('keydown', handleKeyDown, true); window.removeEventListener('mousedown', handleMouseDown, true); };
  }, [isListeningForKey, setPttKey, setIsListeningForKey]);

  // PTT tuş dinleyicileri (sadece PTT modunda)
  useEffect(() => {
    if (isListeningForKey || voiceMode === 'vad' || !pttKey) return;
    if (window.electronPtt) {
      window.electronPtt.onDown(() => {
        // Voice pipeline guard — server susturma/kick/timeout/ban varken PTT başlatma.
        if (!isVoiceConnectedRef.current || isMutedRef.current || isServerMutedRef.current) return;
        if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null; }
        setIsPttPressed(true);
      });
      window.electronPtt.onUp(() => {
        releaseTimerRef.current = setTimeout(() => { setIsPttPressed(false); releaseTimerRef.current = null; }, pttReleaseDelayRef.current);
      });
      return () => { window.electronPtt!.offDown(); window.electronPtt!.offUp(); };
    }
    const cancelRelease = () => { if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null; } };
    const scheduleRelease = () => { cancelRelease(); releaseTimerRef.current = setTimeout(() => { setIsPttPressed(false); releaseTimerRef.current = null; }, pttReleaseDelayRef.current); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.code === 'Space' ? 'SPACE' : e.code.startsWith('Control') ? 'CTRL' : e.key.toUpperCase();
      // Voice pipeline guard — server bloğu varken keydown hiçbir şey yapmasın.
      if (k === pttKey && isVoiceConnectedRef.current && !isMutedRef.current && !isServerMutedRef.current) { cancelRelease(); setIsPttPressed(true); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.code === 'Space' ? 'SPACE' : e.code.startsWith('Control') ? 'CTRL' : e.key.toUpperCase();
      if (k === pttKey) scheduleRelease();
    };
    const handleMouseDown = (e: MouseEvent) => {
      const btn = e.button === 0 ? 'MOUSE 0' : e.button === 1 ? 'MOUSE 1' : `MOUSE ${e.button}`;
      // Voice pipeline guard — server bloğu varken mouse PTT başlatma.
      if (btn === pttKey && isVoiceConnectedRef.current && !isMutedRef.current && !isServerMutedRef.current) { cancelRelease(); setIsPttPressed(true); }
    };
    const handleMouseUp = (e: MouseEvent) => {
      const btn = e.button === 0 ? 'MOUSE 0' : e.button === 1 ? 'MOUSE 1' : `MOUSE ${e.button}`;
      if (btn === pttKey) scheduleRelease();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isListeningForKey, pttKey, voiceMode]);

  // ── Capture kararı: PTT ve VAD farklı koşullara bağlı ──
  // Önemli: VAD modunda isPttPressed DEĞİŞİNCE capture restart OLMAMALI.
  // VAD kendi isPttPressed'ini yönetir — capture isVoiceConnected'a bağlı.
  // VAD: capture isVoiceConnected'a bağlı (isPttPressed capture'ı tetiklememeli)
  // PTT: capture isPttPressed'a bağlı
  const shouldCapture = useMemo(() => {
    // Voice pipeline guard — server bloğu varken getUserMedia'ya hiç gitme.
    // Mic stream açılmaz, analyser çalışmaz, VAD tetiklenmez.
    if (isMuted || isVoiceBanned || isServerMuted) return false;
    return voiceMode === 'vad' ? isVoiceConnected : (isPttPressed && visualMeterEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, isMuted, isVoiceBanned, isServerMuted, isVoiceConnected, isPttPressed, visualMeterEnabled]);

  // ── Ses analizi effect — shouldCapture değişince start/stop ──
  useEffect(() => {
    if (!shouldCapture) {
      // Durdur
      stopCaptureGraph();
      if (vadSilenceTimerRef.current) { clearTimeout(vadSilenceTimerRef.current); vadSilenceTimerRef.current = null; }
      setVolumeLevel(0);
      if (voiceMode === 'vad') setIsPttPressed(false);
      console.log('[usePttAudio] capture stopped, voiceMode:', voiceMode);
      return;
    }

    let cancelled = false;
    console.log('[usePttAudio] capture starting, voiceMode:', voiceMode);

    const startCapture = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedInput ? { exact: selectedInput } : undefined,
              echoCancellation: true,
              noiseSuppression: isNoiseSupRef.current,
              autoGainControl: isNoiseSupRef.current,
            },
          });
        } catch {
          if (selectedInput) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: isNoiseSupRef.current, autoGainControl: isNoiseSupRef.current },
            });
          } else { throw new Error('mic_unavailable'); }
        }

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        const source = audioContextRef.current!.createMediaStreamSource(stream);
        const analyser = audioContextRef.current!.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        sourceRef.current = source;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastVolumeValue = 0;
        let lastVolumeEmitAt = 0;
        const MIN_VOLUME_DELTA = 3;
        const MIN_VOLUME_EMIT_MS = 100;

        const updateVolume = () => {
          if (cancelled || !analyserRef.current) return;
          const now = performance.now();
          const interval = document.hidden ? 500 : isLowDataRef.current ? 66 : 50;

          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          const average = sum / bufferLength;

          const threshold = isNoiseSupRef.current ? noiseThresholdRef.current : 2;
          const nextVolume = average < threshold ? 0 : Math.min(100, (average - threshold) * 1.5);
          const volumeDelta = Math.abs(nextVolume - lastVolumeValue);
          const shouldEmitVolume =
            (volumeDelta >= MIN_VOLUME_DELTA || (nextVolume === 0 && lastVolumeValue !== 0))
            && now - lastVolumeEmitAt >= MIN_VOLUME_EMIT_MS;

          if (shouldEmitVolume) {
            lastVolumeValue = nextVolume;
            lastVolumeEmitAt = now;
            setVolumeLevel(nextVolume);
          }

          if (average < threshold) {
              // VAD: sessizlik algılandı → timer başlat
              if (voiceMode === 'vad' && isPttPressedRef.current && !vadSilenceTimerRef.current) {
                vadSilenceTimerRef.current = setTimeout(() => {
                  console.log('[usePttAudio] VAD silence timeout → isPttPressed = false');
                  setIsPttPressed(false);
                  vadSilenceTimerRef.current = null;
                }, VAD_SILENCE_TIMEOUT);
              }
          } else {
              // VAD: ses algılandı → konuşma başlat
              if (voiceMode === 'vad') {
                if (vadSilenceTimerRef.current) {
                  clearTimeout(vadSilenceTimerRef.current);
                  vadSilenceTimerRef.current = null;
                }
                // Voice pipeline guard — server bloğu aktifse speaking trigger atma.
                // shouldCapture zaten false olacak ama mid-flight race'i kapatmak için
                // ikinci katman guard: isPttPressed(true) publish effect'i tetikler.
                if (!isPttPressedRef.current && !isServerMutedRef.current) {
                  console.log('[usePttAudio] VAD voice detected → isPttPressed = true, avg:', average.toFixed(1));
                  setIsPttPressed(true);
                }
              }
          }
          animationRef.current = window.setTimeout(updateVolume, interval);
        };
        updateVolume();
      } catch (err) {
        const name = (err as Error)?.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          onMicError?.('Mikrofon iznine erişilemiyor. Sistem veya tarayıcı ayarlarından izin verin.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          onMicError?.('Mikrofon bulunamadı.');
        } else {
          onMicError?.('Mikrofon başlatılamadı.');
        }
        console.error('[usePttAudio] capture error:', err);
      }
    };

    startCapture();

    return () => {
      cancelled = true;
      stopCaptureGraph();
      // VAD silence timer'ı KORUYORUZ — cleanup'ta temizlemiyoruz
      // Böylece sessizlik algılama effect restart'tan etkilenmez
    };
  }, [shouldCapture, selectedInput, voiceMode]);

  useEffect(() => () => {
    stopCaptureGraph();
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    if (vadSilenceTimerRef.current) clearTimeout(vadSilenceTimerRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  return { isPttPressed, setIsPttPressed, volumeLevel };
}
