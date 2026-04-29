import { createContext, useContext } from 'react';
import type { ThemePackId, ThemeCustomizationOverrides } from '../lib/themePacks';

// Voice mode (PTT / VAD) — korundu, NS ile ilgisiz.
export type VoiceMode = 'ptt' | 'vad';

/**
 * Noise suppression modeli (v2 — preset sistemi kaldırıldı):
 *  - `isNoiseSuppressionEnabled`: üst bardan toggle; true ise RNNoise aktif
 *  - `noiseSuppressionStrength`: 0..100 slider; 0 bypass, 100 tam RNNoise
 *  - `noiseThreshold`: internal VAD eşiği; UI'da yok, default 15
 */

export interface SettingsContextType {
  /** Tek-paket tema seçimi (normal kullanıcı). 6 sabit pack'ten biri. */
  themePackId: ThemePackId;
  setThemePackId: (id: ThemePackId) => void;
  customThemeOverrides: ThemeCustomizationOverrides;
  setCustomThemeOverrides: (v: ThemeCustomizationOverrides) => void;
  commitCustomThemeOverrides: (v?: ThemeCustomizationOverrides) => void;
  resetCustomThemeOverrides: (tier?: 'pro' | 'elite') => void;
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
  /** Otomatik oyun algılama — Electron desktop only, default kapalı. */
  gameActivityEnabled: boolean;
  setGameActivityEnabled: (v: boolean) => void;
  /** Oyun içi ses overlay — Electron desktop only, default kapalı. */
  overlayEnabled: boolean;
  setOverlayEnabled: (v: boolean) => void;
  overlayPosition: 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right' | 'right-top-mid' | 'right-bot-mid' | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left' | 'left-bot-mid' | 'left-top-mid';
  setOverlayPosition: (v: 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right' | 'right-top-mid' | 'right-bot-mid' | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left' | 'left-bot-mid' | 'left-top-mid') => void;
  overlaySize: 'small' | 'medium' | 'large';
  setOverlaySize: (v: 'small' | 'medium' | 'large') => void;
  overlayShowOnlySpeaking: boolean;
  setOverlayShowOnlySpeaking: (v: boolean) => void;
  overlayShowSelf: boolean;
  setOverlayShowSelf: (v: boolean) => void;
  overlayClickThrough: boolean;
  setOverlayClickThrough: (v: boolean) => void;
  /** Overlay kart şeffaflığı — 0 (tamamen şeffaf / görünmez) ile 100 arası.
   *  Kart rengi sabit koyu tondur; yalnızca şeffaflık kullanıcı tarafından ayarlanır. */
  overlayCardOpacity: number;
  setOverlayCardOpacity: (v: number) => void;
  /** Overlay görünüm stili — 3 premium tasarım + "Yok" (sade avatar+isim). */
  overlayVariant: 'capsule' | 'card' | 'badge' | 'none';
  setOverlayVariant: (v: 'capsule' | 'card' | 'badge' | 'none') => void;
}

export const SettingsCtx = createContext<SettingsContextType | null>(null);

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsCtx.Provider');
  return ctx;
};
