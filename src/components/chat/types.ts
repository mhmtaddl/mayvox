import type React from 'react';
import type { User } from '../../types';

/** cardScale: 1=compact, 2=balanced, 3=spacious */
export type CardScale = 1 | 2 | 3;

export interface CardScaleConfig {
  avatar: string;
  padding: string;
  gap: string;
  name: string;
  status: string;
  icon: number;
  dense: boolean;
  gridGap: string;
}

export const CARD_SCALE_MAP: Record<CardScale, CardScaleConfig> = {
  1: {
    avatar: 'w-8 h-8 text-[10px]',
    padding: 'px-2.5 py-2',
    gap: 'gap-2',
    name: 'text-[12px]',
    status: 'text-[8px]',
    icon: 11,
    dense: true,
    gridGap: 'gap-1.5',
  },
  2: {
    avatar: 'w-10 h-10 text-xs',
    padding: 'px-3.5 py-3',
    gap: 'gap-2.5',
    name: 'text-[13px]',
    status: 'text-[9px]',
    icon: 13,
    dense: false,
    gridGap: 'gap-2',
  },
  3: {
    avatar: 'w-12 h-12 text-sm',
    padding: 'px-4 py-3.5',
    gap: 'gap-3',
    name: 'text-[14px]',
    status: 'text-[10px]',
    icon: 14,
    dense: false,
    gridGap: 'gap-2.5',
  },
};

export interface SpeakingVisuals {
  glowSpread: number;
  glowAlpha: number;
  borderAlpha: number;
  surfaceAlpha: number;
  ringSpread: number;
  ringGlow: number;
}

export function computeSpeakingVisuals(
  isSpeakingActive: boolean,
  intensity: number,
  isMe: boolean,
  isDominant: boolean,
): SpeakingVisuals {
  // Dominant speaker gets a subtle boost; non-dominant speakers soften slightly
  const dominantBoost = isDominant ? 1.15 : (isSpeakingActive ? 0.85 : 1);

  return {
    glowSpread: isSpeakingActive ? (12 + intensity * 16) * dominantBoost : 0,
    glowAlpha: isSpeakingActive ? (0.1 + intensity * 0.15) * dominantBoost : 0,
    borderAlpha: isSpeakingActive ? (0.25 + intensity * 0.2) * dominantBoost : 0.08,
    surfaceAlpha: isSpeakingActive ? (0.08 + intensity * 0.1) * dominantBoost : isMe ? 0.07 : 0.055,
    ringSpread: isSpeakingActive ? (2 + intensity * 1.5) * dominantBoost : 0,
    ringGlow: isSpeakingActive ? (8 + intensity * 14) * dominantBoost : 0,
  };
}

export interface UserCardProps {
  user: User;
  isMe: boolean;
  isOwner: boolean;
  isSpeakingActive: boolean;
  isDominant: boolean;
  intensity: number;
  scale: CardScaleConfig;
  adminBorderEffect: boolean;
  /** PTT tuşuna basılı mı (sadece isMe=true için anlamlı) */
  isPttPressed: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVoiceBanned: boolean;
  volumeLevel: number;
  speakingLevel: number;
  effectiveStatus: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}
