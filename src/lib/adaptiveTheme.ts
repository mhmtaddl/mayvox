/**
 * Adaptive Theme Token System
 *
 * Generates derived CSS tokens based on:
 * 1. Selected accent theme (primary/secondary colors)
 * 2. Selected background preset (light or dark)
 *
 * No hardcoded colors — everything adapts.
 */

import type { AppTheme } from '../themes';
import type { BackgroundPreset } from '../themes';

// ── Color utilities ─────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.35;
}

function mix(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex(...mix(rgb, [255, 255, 255], amount));
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex(...mix(rgb, [0, 0, 0], amount));
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function rgbStr(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

// ── Contrast Guard Utilities ───────────────────────────────────

/**
 * WCAG 2.1 contrast ratio between two hex colors.
 * Returns ratio from 1 (identical) to 21 (black/white).
 */
export function getContrastRatio(fg: string, bg: string): number {
  const fgLum = getLuminance(fg) + 0.05;
  const bgLum = getLuminance(bg) + 0.05;
  return fgLum > bgLum ? fgLum / bgLum : bgLum / fgLum;
}

/**
 * Given a background hex, return a safe foreground hex.
 * Tries the preferred color first; if contrast is too low, shifts it.
 * Falls back to pure black/white as last resort.
 */
function ensureContrast(fgHex: string, bgHex: string, minRatio = 4.5): string {
  if (getContrastRatio(fgHex, bgHex) >= minRatio) return fgHex;

  const bgLight = isLightColor(bgHex);

  // Try incremental shift toward high-contrast pole
  for (let step = 0.1; step <= 0.8; step += 0.1) {
    const adjusted = bgLight ? darken(fgHex, step) : lighten(fgHex, step);
    if (getContrastRatio(adjusted, bgHex) >= minRatio) return adjusted;
  }

  // Fallback — guaranteed readable
  return bgLight ? '#111111' : '#FFFFFF';
}

/**
 * Ensure rgba text has sufficient contrast.
 * Converts rgba to effective hex on bg, checks, adjusts if needed.
 */
function ensureContrastRgba(rgbaColor: string, bgHex: string, minRatio = 4.5): string {
  // Parse rgba(r,g,b,a) → effective opaque hex on bg
  const m = rgbaColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgbaColor;

  const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  const a = m[4] ? parseFloat(m[4]) : 1;
  const bgRgb = hexToRgb(bgHex);

  // Blend fg onto bg
  const blended: [number, number, number] = [
    r * a + bgRgb[0] * (1 - a),
    g * a + bgRgb[1] * (1 - a),
    b * a + bgRgb[2] * (1 - a),
  ];
  const effectiveHex = rgbToHex(blended[0], blended[1], blended[2]);

  if (getContrastRatio(effectiveHex, bgHex) >= minRatio) return rgbaColor;

  // Increase alpha to improve contrast
  const targetFg = rgbToHex(r, g, b);
  for (let newA = a + 0.1; newA <= 1.0; newA += 0.1) {
    const newBlended: [number, number, number] = [
      r * newA + bgRgb[0] * (1 - newA),
      g * newA + bgRgb[1] * (1 - newA),
      b * newA + bgRgb[2] * (1 - newA),
    ];
    const newEffective = rgbToHex(newBlended[0], newBlended[1], newBlended[2]);
    if (getContrastRatio(newEffective, bgHex) >= minRatio) {
      return `rgba(${r},${g},${b},${Math.round(newA * 100) / 100})`;
    }
  }

  // Fallback to solid
  return ensureContrast(targetFg, bgHex, minRatio);
}

// ── Derived token type ──────────────────────────────────────────

export interface DerivedTokens {
  // Background layers
  appBg: string;
  panelBg: string;
  panelBgElevated: string;
  cardBg: string;
  cardBgHover: string;
  cardBgSelected: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Icons
  iconPrimary: string;
  iconMuted: string;

  // Borders
  borderSubtle: string;
  borderStrong: string;
  divider: string;

  // Accent derivatives
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
  accentGlow: string;

  // Sidebar items
  sidebarItemBg: string;
  sidebarItemHover: string;
  sidebarItemSelected: string;

  // Input
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;

  // Buttons
  btnPrimaryBg: string;
  btnPrimaryHover: string;
  btnPrimaryText: string;
  btnGhostBg: string;
  btnGhostHover: string;
  btnGhostText: string;

  // Switch
  switchBg: string;
  switchBgActive: string;

  // Scrollbar
  scrollbarThumb: string;

  // Glass system
  glassTint: string;  // "r, g, b" format
  shadowBase: string; // "r, g, b" format
  colorScheme: 'light' | 'dark';

  // RGB helpers
  accentRgb: string;
  bgRgb: string;
  glowRgb: string;
  glowSecondaryRgb: string;
  sidebarRgb: string;

  // Surface card (settings, modals, dropdowns)
  surfaceCard: string;
  surfaceCardBorder: string;

  // Badge — guaranteed contrast
  badgeBg: string;
  badgeText: string;
}

// ── Main derivation function ────────────────────────────────────

export function getDerivedTokens(theme: AppTheme, bg: BackgroundPreset): DerivedTokens {
  const bgHex = bg.dominantHex;       // For luminance calculations
  const bgSurface = bg.surface;       // Actual CSS value (hex or gradient)
  const isLight = bg.isLight;
  const accentHex = theme.primary;
  const secondaryHex = theme.secondary;

  // Contrast base: the "ink" color for this background
  const ink = isLight ? '#0A0A0A' : '#FFFFFF';
  const inkRgb = hexToRgb(ink);
  const bgRgb = hexToRgb(bgHex);

  // How much to shift panels from background
  const panelShift = isLight ? 0.035 : 0.04;
  const elevatedShift = isLight ? 0.06 : 0.07;

  // Panel backgrounds — real color shifts, not just opacity
  const panelBgColor = isLight ? darken(bgHex, panelShift) : lighten(bgHex, panelShift);
  const panelElevatedColor = isLight ? darken(bgHex, elevatedShift) : lighten(bgHex, elevatedShift);

  // Card — slightly different from panel
  const cardShift = isLight ? 0.02 : 0.03;
  const cardBgColor = isLight ? lighten(bgHex, cardShift) : lighten(bgHex, cardShift);

  // Accent adjustments for readability on this background
  const accentLum = getLuminance(accentHex);
  let accentOnBg = accentHex;
  if (isLight && accentLum > 0.4) {
    // Accent too bright on light bg — darken it
    accentOnBg = darken(accentHex, 0.3);
  } else if (!isLight && accentLum < 0.1) {
    // Accent too dark on dark bg — lighten it
    accentOnBg = lighten(accentHex, 0.3);
  }

  // Text contrast — solid opaque colors for light to guarantee readability
  const textPrimary = isLight
    ? '#111111'
    : withAlpha('#FFFFFF', 0.93);

  const textSecondary = isLight
    ? '#3A3A3A'
    : withAlpha('#FFFFFF', 0.70);

  const textMuted = isLight
    ? '#6A6A6A'
    : withAlpha('#FFFFFF', 0.44);

  // Border & divider — stronger on light for panel separation
  const borderSubtle = isLight
    ? withAlpha('#000000', 0.13)
    : withAlpha('#FFFFFF', 0.07);

  const borderStrong = isLight
    ? withAlpha('#000000', 0.22)
    : withAlpha('#FFFFFF', 0.12);

  const divider = isLight
    ? withAlpha('#000000', 0.10)
    : withAlpha('#FFFFFF', 0.05);

  // Accent derivatives
  const accentSoft = isLight
    ? withAlpha(accentOnBg, 0.10)
    : withAlpha(accentOnBg, 0.12);

  const accentBorder = isLight
    ? withAlpha(accentOnBg, 0.30)
    : withAlpha(accentOnBg, 0.25);

  const accentGlow = isLight
    ? withAlpha(accentOnBg, 0.08)
    : withAlpha(accentOnBg, 0.18);

  // Accent text — must be readable on background
  const accentText = isLight
    ? (accentLum > 0.4 ? darken(accentHex, 0.35) : accentHex)
    : accentHex;

  // Sidebar items
  const sidebarItemBg = 'transparent';
  const sidebarItemHover = isLight
    ? withAlpha('#000000', 0.04)
    : withAlpha('#FFFFFF', 0.04);
  const sidebarItemSelected = isLight
    ? withAlpha(accentOnBg, 0.08)
    : withAlpha(accentOnBg, 0.10);

  // Input
  const inputBg = isLight
    ? withAlpha('#FFFFFF', 0.65)
    : withAlpha('#FFFFFF', 0.035);
  const inputBorder = isLight
    ? withAlpha('#000000', 0.12)
    : withAlpha('#FFFFFF', 0.08);

  // Buttons
  const btnPrimaryBg = isLight ? accentOnBg : theme.buttonPrimaryBg;
  const btnPrimaryHover = isLight ? lighten(accentOnBg, 0.15) : theme.buttonPrimaryHover;
  const btnPrimaryText = isLight
    ? (getLuminance(accentOnBg) > 0.4 ? '#0A0A0A' : '#FFFFFF')
    : theme.buttonPrimaryText;

  const btnGhostBg = isLight
    ? withAlpha('#000000', 0.04)
    : withAlpha('#FFFFFF', 0.04);
  const btnGhostHover = isLight
    ? withAlpha('#000000', 0.08)
    : withAlpha('#FFFFFF', 0.07);
  const btnGhostText = isLight
    ? withAlpha('#0A0A0A', 0.85)
    : withAlpha('#FFFFFF', 0.90);

  // Switch
  const switchBg = isLight
    ? withAlpha('#000000', 0.10)
    : withAlpha('#FFFFFF', 0.10);

  // Scrollbar
  const scrollbarThumb = isLight
    ? withAlpha('#000000', 0.18)
    : withAlpha('#FFFFFF', 0.20);

  // Card selected
  const cardBgHover = isLight
    ? withAlpha('#000000', 0.03)
    : withAlpha('#FFFFFF', 0.06);
  const cardBgSelected = isLight
    ? withAlpha(accentOnBg, 0.06)
    : withAlpha(accentOnBg, 0.08);

  // Sidebar color — MUST differ from background for glass panels to be visible
  const sidebarColor = isLight ? darken(bgHex, 0.10) : lighten(bgHex, 0.15);

  // Surface card — solid-ish background for settings cards, modals, dropdowns
  const surfaceCard = isLight
    ? withAlpha('#FFFFFF', 0.60)
    : withAlpha(lighten(bgHex, 0.08), 0.85);
  const surfaceCardBorder = isLight
    ? withAlpha('#000000', 0.10)
    : withAlpha('#FFFFFF', 0.08);

  // ── Contrast Guard Pass ──────────────────────────────────────────
  // Validate critical text/accent tokens against background.
  // Small text (badges, timestamps) needs higher ratio (≥4.5).
  // Large text (headings) can use ≥3.0.

  const guardedTextPrimary = typeof textPrimary === 'string' && textPrimary.startsWith('rgba')
    ? ensureContrastRgba(textPrimary, bgHex, 4.5)
    : (textPrimary.startsWith('#') ? ensureContrast(textPrimary, bgHex, 4.5) : textPrimary);

  const guardedTextSecondary = typeof textSecondary === 'string' && textSecondary.startsWith('rgba')
    ? ensureContrastRgba(textSecondary, bgHex, 3.5)
    : textSecondary;

  const guardedTextMuted = typeof textMuted === 'string' && textMuted.startsWith('rgba')
    ? ensureContrastRgba(textMuted, bgHex, 3.0)
    : textMuted;

  const guardedAccentText = accentText.startsWith('#')
    ? ensureContrast(accentText, bgHex, 3.5)
    : accentText;

  const guardedInputText = typeof inputBg === 'string' && inputBg.startsWith('rgba')
    ? (isLight ? ensureContrast('#111111', bgHex, 4.5) : ensureContrastRgba(withAlpha('#FFFFFF', 0.92), bgHex, 4.5))
    : (isLight ? '#111111' : withAlpha('#FFFFFF', 0.92));

  const guardedInputPlaceholder = isLight
    ? ensureContrast('#888888', bgHex, 2.5)
    : ensureContrastRgba(withAlpha('#FFFFFF', 0.38), bgHex, 2.5);

  // Badge text on accent — guaranteed readable
  const guardedBtnPrimaryText = btnPrimaryText.startsWith('#')
    ? ensureContrast(btnPrimaryText, btnPrimaryBg.startsWith('#') ? btnPrimaryBg : accentOnBg, 4.5)
    : btnPrimaryText;

  return {
    appBg: bgSurface,
    panelBg: withAlpha(isLight ? '#000000' : '#FFFFFF', isLight ? 0.045 : 0.04),
    panelBgElevated: withAlpha(isLight ? '#000000' : '#FFFFFF', isLight ? 0.07 : 0.06),
    cardBg: withAlpha(isLight ? '#FFFFFF' : '#FFFFFF', isLight ? 0.55 : 0.03),
    cardBgHover,
    cardBgSelected,

    textPrimary: guardedTextPrimary,
    textSecondary: guardedTextSecondary,
    textMuted: guardedTextMuted,

    iconPrimary: guardedAccentText,
    iconMuted: guardedTextMuted,

    borderSubtle,
    borderStrong,
    divider,

    accent: accentOnBg,
    accentSoft,
    accentBorder,
    accentText: guardedAccentText,
    accentGlow,

    sidebarItemBg,
    sidebarItemHover,
    sidebarItemSelected,

    inputBg,
    inputBorder,
    inputText: guardedInputText,
    inputPlaceholder: guardedInputPlaceholder,

    btnPrimaryBg,
    btnPrimaryHover,
    btnPrimaryText: guardedBtnPrimaryText,
    btnGhostBg,
    btnGhostHover,
    btnGhostText,

    switchBg,
    switchBgActive: accentOnBg,

    scrollbarThumb,

    glassTint: isLight ? '0, 0, 0' : '255, 255, 255',
    shadowBase: isLight ? '80, 60, 40' : '0, 0, 0',
    colorScheme: isLight ? 'light' : 'dark',

    accentRgb: rgbStr(accentOnBg),
    bgRgb: rgbStr(bgHex),
    glowRgb: rgbStr(accentOnBg),
    glowSecondaryRgb: rgbStr(secondaryHex),
    sidebarRgb: rgbStr(sidebarColor),

    surfaceCard,
    surfaceCardBorder,

    badgeBg: accentOnBg,
    badgeText: ensureContrast('#FFFFFF', accentOnBg, 4.5),
  };
}

// ── Apply derived tokens to DOM ─────────────────────────────────

export function applyDerivedTokens(tokens: DerivedTokens) {
  const root = document.documentElement;

  // Background layers
  // --theme-bg stays as the surface (could be gradient for body)
  root.style.setProperty('--theme-bg', tokens.appBg);
  root.style.setProperty('--theme-surface', tokens.panelBg);
  root.style.setProperty('--theme-panel', tokens.panelBg);
  root.style.setProperty('--theme-panel-hover', tokens.panelBgElevated);
  root.style.setProperty('--theme-panel-active', tokens.cardBgSelected);
  root.style.setProperty('--theme-bg-elevated', tokens.panelBgElevated);

  // Text
  root.style.setProperty('--theme-text', tokens.textPrimary);
  root.style.setProperty('--theme-secondary-text', tokens.textSecondary);
  root.style.setProperty('--theme-text-muted', tokens.textMuted);

  // Border & divider
  root.style.setProperty('--theme-border', tokens.borderSubtle);
  root.style.setProperty('--theme-divider', tokens.divider);

  // Accent
  root.style.setProperty('--theme-accent', tokens.accent);
  root.style.setProperty('--theme-glow', tokens.accentGlow);

  // Buttons
  root.style.setProperty('--theme-btn-primary-bg', tokens.btnPrimaryBg);
  root.style.setProperty('--theme-btn-primary-hover', tokens.btnPrimaryHover);
  root.style.setProperty('--theme-btn-primary-text', tokens.btnPrimaryText);
  root.style.setProperty('--theme-btn-ghost-bg', tokens.btnGhostBg);
  root.style.setProperty('--theme-btn-ghost-hover', tokens.btnGhostHover);
  root.style.setProperty('--theme-btn-ghost-text', tokens.btnGhostText);

  // Input
  root.style.setProperty('--theme-input-bg', tokens.inputBg);
  root.style.setProperty('--theme-input-border', tokens.inputBorder);
  root.style.setProperty('--theme-input-text', tokens.inputText);
  root.style.setProperty('--theme-input-placeholder', tokens.inputPlaceholder);

  // Icons
  root.style.setProperty('--theme-icon-primary', tokens.iconPrimary);
  root.style.setProperty('--theme-icon-secondary', tokens.iconMuted);

  // Scrollbar & selection
  root.style.setProperty('--theme-scrollbar-thumb', tokens.scrollbarThumb);
  root.style.setProperty('--scrollbar-track', tokens.colorScheme === 'light' ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.018)');
  root.style.setProperty('--scrollbar-thumb', tokens.colorScheme === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.20)');
  root.style.setProperty('--scrollbar-thumb-hover', tokens.colorScheme === 'light' ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.32)');
  root.style.setProperty('--theme-selection', tokens.accentSoft);

  // Glass system
  root.style.setProperty('--glass-tint', tokens.glassTint);
  root.style.setProperty('--shadow-base', tokens.shadowBase);
  root.style.colorScheme = tokens.colorScheme;

  // RGB variants for rgba() usage in Tailwind
  root.style.setProperty('--theme-accent-rgb', tokens.accentRgb);
  root.style.setProperty('--theme-bg-rgb', tokens.bgRgb);
  root.style.setProperty('--theme-sidebar-rgb', tokens.sidebarRgb);
  root.style.setProperty('--theme-sidebar', tokens.appBg);
  root.style.setProperty('--theme-glow-rgb', tokens.glowRgb);
  root.style.setProperty('--theme-glow-secondary-rgb', tokens.glowSecondaryRgb);

  // Surface card
  root.style.setProperty('--theme-surface-card', tokens.surfaceCard);
  root.style.setProperty('--theme-surface-card-border', tokens.surfaceCardBorder);

  // Badge — contrast-safe
  root.style.setProperty('--theme-badge-bg', tokens.badgeBg);
  root.style.setProperty('--theme-badge-text', tokens.badgeText);

  // Body background
  document.body.style.background = tokens.appBg;
}
