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
  } = params;

  const [isPttPressed, setIsPttPressed] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  // PTT key assignment listener
  useEffect(() => {
    if (!isListeningForKey) return;

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
      const mouseButton = `MOUSE ${e.button}`;
      setPttKey(mouseButton);
      setIsListeningForKey(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isListeningForKey, setPttKey, setIsListeningForKey]);

  // PTT key detection
  useEffect(() => {
    if (isListeningForKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName === 'Control') keyName = 'CTRL';
      if (keyName === 'AltGraph') keyName = 'Alt Gr';

      if (keyName.toUpperCase() === pttKey) {
        setIsPttPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      if (keyName === 'Control') keyName = 'CTRL';
      if (keyName === 'AltGraph') keyName = 'Alt Gr';

      if (keyName.toUpperCase() === pttKey) {
        setIsPttPressed(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (`MOUSE ${e.button}` === pttKey) {
        setIsPttPressed(true);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (`MOUSE ${e.button}` === pttKey) {
        setIsPttPressed(false);
      }
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
  }, [pttKey, isListeningForKey]);

  // Audio analysis (requestAnimationFrame based)
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
