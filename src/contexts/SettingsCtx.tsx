import React, { createContext, useContext } from 'react';
import { Theme } from '../types';

export type AudioProfile = 'clean' | 'broadcast' | 'natural' | 'noisy' | 'custom';

export interface AudioPreset {
  noiseSuppression: boolean;
  noiseThreshold: number;
  pttReleaseDelay: number;
}

export const AUDIO_PRESETS: Record<Exclude<AudioProfile, 'custom'>, AudioPreset> = {
  clean:     { noiseSuppression: true,  noiseThreshold: 15, pttReleaseDelay: 150 },
  broadcast: { noiseSuppression: true,  noiseThreshold: 35, pttReleaseDelay: 300 },
  natural:   { noiseSuppression: false, noiseThreshold: 5,  pttReleaseDelay: 100 },
  noisy:     { noiseSuppression: true,  noiseThreshold: 42, pttReleaseDelay: 350 },
};

export interface AudioProfileMeta {
  id: Exclude<AudioProfile, 'custom'>;
  icon: string;
  label: string;
  desc: string;
  tags: string[];
}

export const AUDIO_PROFILE_META: AudioProfileMeta[] = [
  {
    id: 'clean',
    icon: '🎙️',
    label: 'Temiz Ses',
    desc: 'Dengeli filtre, günlük kullanım için ideal.',
    tags: ['Gürültü susturma', 'Orta eşik'],
  },
  {
    id: 'broadcast',
    icon: '🎧',
    label: 'Yayıncı Modu',
    desc: 'Maksimum filtre, en temiz ses kalitesi.',
    tags: ['Agresif filtre', 'Uzun gecikme'],
  },
  {
    id: 'natural',
    icon: '🗣️',
    label: 'Doğal Ses',
    desc: 'Minimum işlem, ham ve doğal ses.',
    tags: ['Filtre kapalı', 'Düşük gecikme'],
  },
  {
    id: 'noisy',
    icon: '🔇',
    label: 'Gürültülü Ortam',
    desc: 'Kafe ve dış ortam için yüksek baskılama.',
    tags: ['Yüksek eşik', 'Arka plan filtreli'],
  },
];

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
  adminBorderEffect: boolean;
  setAdminBorderEffect: (v: boolean) => void;
  audioProfile: AudioProfile;
  setAudioProfile: (v: AudioProfile) => void;
  autoLeaveEnabled: boolean;
  setAutoLeaveEnabled: (v: boolean) => void;
  autoLeaveMinutes: number;
  setAutoLeaveMinutes: (v: number) => void;
}

export const SettingsCtx = createContext<SettingsContextType | null>(null);

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsCtx.Provider');
  return ctx;
};
