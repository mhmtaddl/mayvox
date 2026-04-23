import React, { createContext, useContext } from 'react';
import { AppTheme } from '../themes';
import type { ThemePackId } from '../lib/themePacks';

// Voice mode (PTT / VAD) — korundu, NS ile ilgisiz.
export type VoiceMode = 'ptt' | 'vad';

/**
 * Noise suppression modeli (v2 — preset sistemi kaldırıldı):
 *  - `isNoiseSuppressionEnabled`: üst bardan toggle; true ise RNNoise aktif
 *  - `noiseSuppressionStrength`: 0..100 slider; 0 bypass, 100 tam RNNoise
 *  - `noiseThreshold`: internal VAD eşiği; UI'da yok, default 15
 */

export type AppearanceMode = 'themePack' | 'custom';

export interface SettingsContextType {
  /** Mutual exclusion: aynı anda yalnız bir mod aktif. */
  appearanceMode: AppearanceMode;
  setAppearanceMode: (m: AppearanceMode) => void;
  /** Tek-paket tema seçimi (normal kullanıcı). 6 sabit pack'ten biri. */
  themePackId: ThemePackId;
  setThemePackId: (id: ThemePackId) => void;
  currentTheme: AppTheme;
  setCurrentTheme: (v: AppTheme) => void;
  isLowDataMode: boolean;
  setIsLowDataMode: (v: boolean) => void;
  isNoiseSuppressionEnabled: boolean;
  setIsNoiseSuppressionEnabled: (v: boolean) => void;
  /** 0..100 — RNNoise dry/wet mix. 0 bypass, 100 full denoise. */
  noiseSuppressionStrength: number;
  setNoiseSuppressionStrength: (v: number) => void;
  /** VAD sessizlik eşiği — UI yok, internal. */
  noiseThreshold: number;
  setNoiseThreshold: (v: number) => void;
  pttKey: string;
  setPttKey: (v: string) => void;
  isListeningForKey: boolean;
  setIsListeningForKey: (v: boolean) => void;
  soundJoinLeave: boolean;
  setSoundJoinLeave: (v: boolean) => void;
  soundJoinLeaveVariant: 1 | 2 | 3;
  setSoundJoinLeaveVariant: (v: 1 | 2 | 3) => void;
  soundMuteDeafen: boolean;
  setSoundMuteDeafen: (v: boolean) => void;
  soundMuteDeafenVariant: 1 | 2 | 3;
  setSoundMuteDeafenVariant: (v: 1 | 2 | 3) => void;
  soundPtt: boolean;
  setSoundPtt: (v: boolean) => void;
  soundPttVariant: 1 | 2 | 3;
  setSoundPttVariant: (v: 1 | 2 | 3) => void;
  avatarBorderColor: string;
  setAvatarBorderColor: (v: string) => void;
  pttReleaseDelay: number;
  setPttReleaseDelay: (v: number) => void;
  soundInvite: boolean;
  setSoundInvite: (v: boolean) => void;
  soundInviteVariant: 1 | 2;
  setSoundInviteVariant: (v: 1 | 2) => void;
  autoLeaveEnabled: boolean;
  setAutoLeaveEnabled: (v: boolean) => void;
  autoLeaveMinutes: number;
  setAutoLeaveMinutes: (v: number) => void;
  voiceMode: VoiceMode;
  setVoiceMode: (v: VoiceMode) => void;
  showLastSeen: boolean;
  setShowLastSeen: (v: boolean) => void;
  activeBackground: string;
  setActiveBackground: (v: string) => void;
  /** Otomatik oyun algılama — Electron desktop only, default kapalı. */
  gameActivityEnabled: boolean;
  setGameActivityEnabled: (v: boolean) => void;
}

export const SettingsCtx = createContext<SettingsContextType | null>(null);

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsCtx.Provider');
  return ctx;
};
