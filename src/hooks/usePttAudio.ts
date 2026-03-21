import { useState, useEffect, useRef } from 'react';

interface UsePttAudioParams {
  pttKey: string;
  setPttKey: (key: string) => void;
  isListeningForKey: boolean;
  setIsListeningForKey: (v: boolean) => void;
  isMuted: boolean;
  isVoiceBanned: boolean;
  selectedInput: string;
  isNoiseSuppressionEnabled: boolean;
  noiseThreshold: number;
  isLowDataMode: boolean;
  pttReleaseDelay: number;
}

// Electron preload tarafından enjekte edilen global PTT API
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

export function usePttAudio(params: UsePttAudioParams) {
  const {
    pttKey,
    setPttKey,
    isListeningForKey,
    setIsListeningForKey,
    isMuted,
    isVoiceBanned,
    selectedInput,
    isNoiseSuppressionEnabled,
    noiseThreshold,
    isLowDataMode,
    pttReleaseDelay,
  } = params;

  const [isPttPressed, setIsPttPressed] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pttReleaseDelayRef = useRef(pttReleaseDelay);
  useEffect(() => { pttReleaseDelayRef.current = pttReleaseDelay; }, [pttReleaseDelay]);

  // Başlangıçta mevcut pttKey'i main process'e bildir.
  // Önce raw keycode dene (sağ/sol CTRL gibi çakışmaları önler), yoksa isim tabanlı fallback.
  useEffect(() => {
    const rawCode = localStorage.getItem('pttRawCode');
    if (rawCode && window.electronPtt?.initRaw) {
      window.electronPtt.initRaw(rawCode);
    } else {
      window.electronPtt?.init(pttKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PTT tuşu atama
  useEffect(() => {
    if (!isListeningForKey) {
      window.electronPtt?.stopListening();
      return;
    }

    const ep = window.electronPtt;

    if (ep) {
      // Electron ortamı: global hook üzerinden yakala (uygulama odaklanmamış olsa da çalışır)
      ep.startListening();
      ep.onKeyAssigned((data) => {
        setPttKey(data.displayName);
        if (data.rawCode) {
          localStorage.setItem('pttRawCode', data.rawCode);
        }
        setIsListeningForKey(false);
      });
      return () => {
        ep.offKeyAssigned();
        ep.stopListening();
      };
    }

    // Electron dışı (web dev) — pencere listener'ı fallback
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName === 'Control') keyName = 'CTRL';
      if (keyName === 'AltGraph') keyName = 'Alt Gr';
      setPttKey(keyName.toUpperCase());
      setIsListeningForKey(false);
    };
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setPttKey(`MOUSE ${e.button}`);
      setIsListeningForKey(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isListeningForKey, setPttKey, setIsListeningForKey]);

  // PTT basma/bırakma algılama
  useEffect(() => {
    if (isListeningForKey) return;

    const ep = window.electronPtt;

    if (ep) {
      // Electron ortamı: main process global hook'tan IPC ile gelir
      ep.onDown(() => {
        if (releaseTimerRef.current) {
          clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = null;
        }
        setIsPttPressed(true);
      });
      ep.onUp(() => {
        releaseTimerRef.current = setTimeout(() => {
          setIsPttPressed(false);
          releaseTimerRef.current = null;
        }, pttReleaseDelayRef.current);
      });
      return () => {
        ep.offDown();
        ep.offUp();
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
        setIsPttPressed(false);
      };
    }

    // Electron dışı fallback — pencere event listener
    const handleKeyDown = (e: KeyboardEvent) => {
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName === 'Control') keyName = 'CTRL';
      if (keyName === 'AltGraph') keyName = 'Alt Gr';
      if (keyName.toUpperCase() === pttKey) { cancelRelease(); setIsPttPressed(true); }
    };
    const scheduleRelease = () => {
      releaseTimerRef.current = setTimeout(() => {
        setIsPttPressed(false);
        releaseTimerRef.current = null;
      }, pttReleaseDelayRef.current);
    };
    const cancelRelease = () => {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName === 'Control') keyName = 'CTRL';
      if (keyName === 'AltGraph') keyName = 'Alt Gr';
      if (keyName.toUpperCase() === pttKey) scheduleRelease();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (`MOUSE ${e.button}` === pttKey) { cancelRelease(); setIsPttPressed(true); }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (`MOUSE ${e.button}` === pttKey) scheduleRelease();
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
  }, [isListeningForKey, pttKey]);

  // Ses analizi (requestAnimationFrame tabanlı)
  useEffect(() => {
    const startAudioAnalysis = async () => {
      if (isPttPressed && !isMuted && !isVoiceBanned) {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("Tarayıcı ses kaydını desteklemiyor.");
            return;
          }

          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }

          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }

          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: selectedInput ? { exact: selectedInput } : undefined,
                echoCancellation: isNoiseSuppressionEnabled,
                noiseSuppression: isNoiseSuppressionEnabled,
                autoGainControl: isNoiseSuppressionEnabled,
              },
            });
          } catch (innerErr) {
            if (selectedInput) {
              console.warn("Seçili cihazla ses analizi başlatılamadı, varsayılan cihaz deneniyor:", innerErr);
              stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: isNoiseSuppressionEnabled,
                  noiseSuppression: isNoiseSuppressionEnabled,
                  autoGainControl: isNoiseSuppressionEnabled,
                },
              });
            } else {
              throw innerErr;
            }
          }

          streamRef.current = stream;
          const source = audioContextRef.current.createMediaStreamSource(stream);
          const analyser = audioContextRef.current.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const average = sum / bufferLength;

            const threshold = isNoiseSuppressionEnabled ? noiseThreshold : 2;
            if (average < threshold) {
              setVolumeLevel(0);
            } else {
              const normalized = Math.min(100, (average - threshold) * 1.5);
              setVolumeLevel(normalized);
            }

            if (isLowDataMode) {
              setTimeout(() => {
                animationRef.current = requestAnimationFrame(updateVolume);
              }, 66);
            } else {
              animationRef.current = requestAnimationFrame(updateVolume);
            }
          };

          updateVolume();
        } catch (err) {
          console.error("Ses analizi başlatılamadı:", err);
        }
      } else {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        setVolumeLevel(0);
      }
    };

    startAudioAnalysis();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [isPttPressed, isMuted, isVoiceBanned, selectedInput, isNoiseSuppressionEnabled, noiseThreshold, isLowDataMode]);

  return { isPttPressed, volumeLevel };
}
