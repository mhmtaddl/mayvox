import React, { createContext, useContext } from 'react';
import { Theme } from '../types';

export interface SettingsContextType {
  currentTheme: Theme;
  setCurrentTheme: (v: Theme) => void;
  isLowDataMode: boolean;
  setIsLowDataMode: (v: boolean) => void;
  isNoiseSuppressionEnabled: boolean;
  setIsNoiseSuppressionEnabled: (v: boolean) => void;
  noiseThreshold: number;
  setNoiseThreshold: (v: number) => void;
  pttKey: string;
  setPttKey: (v: string) => void;
  isListeningForKey: boolean;
  setIsListeningForKey: (v: boolean) => void;
}

export const SettingsCtx = createContext<SettingsContextType | null>(null);

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsCtx.Provider');
  return ctx;
};
