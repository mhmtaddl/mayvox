/**
 * Card visual style system — 4 distinct styles.
 * Each style returns CSS properties for card, avatar, and text.
 */

export type CardStyle = 'current' | 'revolt' | 'linear' | 'apple';

export const CARD_STYLES: { key: CardStyle; label: string }[] = [
  { key: 'current', label: 'Varsayılan' },
  { key: 'revolt', label: 'Kompakt' },
  { key: 'linear', label: 'Minimal' },
];

export interface CardStyleTokens {
  cardBg: string;
  cardBgSpeaking: string;
  cardBorder: string;
  cardBorderSpeaking: string;
  cardShadow: string;
  cardShadowSpeaking: string;
  cardRadius: number;
  cardBackdrop: string;
  avatarBorder: string;
  avatarShadow: string;
  textOpacity: number;
  iconOpacity: number;
}

export function getCardStyleTokens(style: CardStyle): CardStyleTokens {
  switch (style) {
    case 'revolt':
      // Flat, minimal, tema rengine uyumlu koyu yüzey
      return {
        cardBg: 'rgba(var(--theme-bg-rgb), 0.85)',
        cardBgSpeaking: 'rgba(var(--theme-bg-rgb), 0.92)',
        cardBorder: '1px solid rgba(var(--theme-accent-rgb), 0.06)',
        cardBorderSpeaking: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
        cardShadow: '0 1px 2px rgba(0,0,0,0.1)',
        cardShadowSpeaking: '0 1px 2px rgba(0,0,0,0.1), 0 0 0 1px rgba(var(--theme-accent-rgb), 0.1)',
        cardRadius: 12,
        cardBackdrop: 'none',
        avatarBorder: '1.5px solid rgba(var(--theme-accent-rgb), 0.08)',
        avatarShadow: '0 2px 6px rgba(0,0,0,0.12)',
        textOpacity: 0.9,
        iconOpacity: 0.4,
      };

    case 'linear':
      // Premium, derinlikli, accent glow ile tema uyumlu
      return {
        cardBg: 'rgba(var(--theme-bg-rgb), 0.75)',
        cardBgSpeaking: 'rgba(var(--theme-accent-rgb), 0.08)',
        cardBorder: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
        cardBorderSpeaking: '1px solid rgba(var(--theme-accent-rgb), 0.25)',
        cardShadow: '0 4px 20px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)',
        cardShadowSpeaking: '0 0 0 1px rgba(var(--theme-accent-rgb), 0.15), 0 0 16px rgba(var(--theme-accent-rgb), 0.08), 0 4px 20px rgba(0,0,0,0.2)',
        cardRadius: 18,
        cardBackdrop: 'blur(8px)',
        avatarBorder: '1.5px solid rgba(var(--theme-accent-rgb), 0.1)',
        avatarShadow: '0 3px 10px rgba(0,0,0,0.15)',
        textOpacity: 0.92,
        iconOpacity: 0.45,
      };

    case 'apple':
      return {
        cardBg: 'rgba(255,255,255,0.05)',
        cardBgSpeaking: 'rgba(255,255,255,0.07)',
        cardBorder: '1px solid rgba(255,255,255,0.1)',
        cardBorderSpeaking: '1px solid rgba(var(--theme-accent-rgb), 0.15)',
        cardShadow: '0 2px 10px rgba(0,0,0,0.08)',
        cardShadowSpeaking: '0 2px 16px rgba(var(--theme-accent-rgb), 0.06), 0 2px 10px rgba(0,0,0,0.08)',
        cardRadius: 20,
        cardBackdrop: 'blur(16px)',
        avatarBorder: '1.5px solid rgba(255,255,255,0.08)',
        avatarShadow: '0 2px 6px rgba(0,0,0,0.08)',
        textOpacity: 0.8,
        iconOpacity: 0.35,
      };

    default: // 'current'
      return {
        cardBg: 'rgba(var(--glass-tint), 0.025)',
        cardBgSpeaking: 'rgba(var(--theme-accent-rgb), 0.06)',
        cardBorder: '1px solid rgba(var(--glass-tint), 0.05)',
        cardBorderSpeaking: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
        cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
        cardShadowSpeaking: '0 2px 12px rgba(var(--theme-accent-rgb), 0.06)',
        cardRadius: 16,
        cardBackdrop: 'none',
        avatarBorder: '1px solid rgba(var(--glass-tint), 0.06)',
        avatarShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textOpacity: 0.8,
        iconOpacity: 0.4,
      };
  }
}

export function loadCardStyle(): CardStyle {
  const saved = localStorage.getItem('cylk_card_style');
  if (saved === 'revolt' || saved === 'linear') return saved;
  return 'current';
}

export function saveCardStyle(style: CardStyle) {
  localStorage.setItem('cylk_card_style', style);
}
