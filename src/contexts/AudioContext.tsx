import React, { createContext, useContext } from 'react';

export interface AudioContextType {
  volumeLevel: number;
  setVolumeLevel: (v: number) => void;
  isPttPressed: boolean;
  setIsPttPressed: (v: boolean) => void;
  connectionLevel: number;
  setConnectionLevel: (v: number) => void;
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
}

export const AudioCtx = createContext<AudioContextType | null>(null);

export const useAudio = (): AudioContextType => {
  const ctx = useContext(AudioCtx);
  if (!ctx) {
    throw new Error('useAudio must be used within AudioCtx.Provider');
  }
  return ctx;
};
