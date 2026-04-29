import React, { createContext, useContext } from 'react';
import type { VoiceMode } from './SettingsCtx';

export interface AudioContextType {
  volumeLevel: number;
  setVolumeLevel: (v: number) => void;
  isPttPressed: boolean;
  setIsPttPressed: (v: boolean) => void;
  connectionLevel: number;
  setConnectionLevel: (v: number) => void;
  connectionLatencyMs?: number;
  connectionJitterMs?: number;
  selectedInput: string;
  setSelectedInput: (v: string) => void;
  selectedOutput: string;
  setSelectedOutput: (v: string) => void;
  inputDevices: MediaDeviceInfo[];
  setInputDevices: (v: MediaDeviceInfo[]) => void;
  outputDevices: MediaDeviceInfo[];
  setOutputDevices: (v: MediaDeviceInfo[]) => void;
  showInputSettings: boolean;
  setShowInputSettings: (v: boolean) => void;
  showOutputSettings: boolean;
  setShowOutputSettings: (v: boolean) => void;
  speakingLevels: Record<string, number>;
  /** Android'de odadaki ses modunu kullanıcının tercihi ile override etmek için.
   *  null → oda default'u kullanılır. Kanal değişince App.tsx reset eder. */
  mobileVoiceModeOverride: VoiceMode | null;
  setMobileVoiceModeOverride: (v: VoiceMode | null) => void;
}

export const AudioCtx = createContext<AudioContextType | null>(null);

export const useAudio = (): AudioContextType => {
  const ctx = useContext(AudioCtx);
  if (!ctx) {
    throw new Error('useAudio must be used within AudioCtx.Provider');
  }
  return ctx;
};
