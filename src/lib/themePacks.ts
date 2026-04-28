/**
 * MAYVOX — Theme Pack Engine
 *
 * Tek paket = bg + surface + border + text + accent + state'lerin TAM tanımı.
 * Normal kullanıcı sadece bunlardan birini seçer; bg/palette ayrı seçim YOK.
 * Admin/Mod ek olarak mevcut "Advanced Customization" (palette + background) görür.
 */

import bgEmerald from '../assets/bg-emerald.png';
import bgCrimson from '../assets/bg-crimson.png';

export type ThemePackId =
  | 'default-dark'
  | 'dual-tone'
  | 'ocean-blue'
  | 'emerald'
  | 'crimson'
  | 'amber-night'
  | 'frost-light'
  | 'graphite-pro'
  | 'aurora';

export interface ThemePack {
  id: ThemePackId;
  name: string;

  // Background — 2-tone gradient + subtle radial highlight + (opsiyonel) noise
  bg: string;        // CSS background (gradient + radial)
  bgSoft: string;    // İkincil yüzey (panel/sidebar) için flat tone

  // Surfaces
  surface: string;
  surfaceHover: string;
  surfaceActive: string;

  // Borders
  border: string;
  borderFocus: string;

  // Text — semantic ramp (primary → inverse, Apple System Gray pattern)
  textPrimary: string;
  textSecondary: string;
  textTertiary?: string;  // new: between secondary and muted
  textMuted: string;
  textOnAccent: string;
  textInverse?: string;   // new: opposite of primary (for text on primary-colored bg)

  // Accent system
  accent: string;
  accentRgb: string;       // "r, g, b" — rgba() için
  accentHover: string;
  accentActive: string;
  accentSoft: string;      // hafif tinted bg

  // States
  success: string;
  warning: string;
  danger: string;

  // Preview için kart üzerinde gösterilecek 2-stop renkleri
  previewFrom: string;
  previewTo: string;
}

// ── Texture system: per-theme noise grain ──
// Her tema farklı baseFrequency + opacity → kendi material identity
function noise(opts: { freq: number; oct?: number; alpha: number; tint?: string }) {
  const { freq, oct = 2, alpha, tint } = opts;
  // tint: "r g b" string — colorMatrix son satırına opacity, 4. matrix col tinted RGB için
  // Basit yol: feColorMatrix ile alpha; tint rengi feColorMatrix R/G/B add
  const r = tint ? parseFloat(tint.split(' ')[0]) : 0;
  const g = tint ? parseFloat(tint.split(' ')[1]) : 0;
  const b = tint ? parseFloat(tint.split(' ')[2]) : 0;
  const mtx = `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${alpha} 0`;
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/%3E%3CfeColorMatrix values='${mtx}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
}

const NOISE = {
  graphite: noise({ freq: 0.95, alpha: 0.028 }),                 // Default Dark — matte black grain (~2.5%, band break)
  mist:     noise({ freq: 0.7, alpha: 0.05, tint: '0.4 0.6 0.8' }), // Ocean — cool
  mineral:  noise({ freq: 0.85, alpha: 0.06, tint: '0.2 0.5 0.4' }), // Emerald
  velvet:   noise({ freq: 0.6, alpha: 0.07, tint: '0.6 0.2 0.25' }), // Crimson
  resin:    noise({ freq: 0.7, alpha: 0.06, tint: '0.6 0.45 0.2' }), // Amber
  frost:    noise({ freq: 1.05, alpha: 0.022, tint: '0.1 0.16 0.24' }), // Frost Light
  aurora:   noise({ freq: 0.72, alpha: 0.045, tint: '0.15 0.55 0.75' }), // Aurora
};

/**
 * Diffused ambient atmosphere — birden fazla soft blob, tek bir spot YOK.
 * Bloblar köşelere/asimetrik yerleştirilir, çok geniş (60-80%), düşük opasite.
 */
function ambientBlobs(blobs: Array<{ x: string; y: string; r: string; rgba: string }>): string {
  return blobs.map(b => `radial-gradient(${b.r} at ${b.x} ${b.y}, ${b.rgba}, transparent 70%)`).join(', ');
}


// ── 6 SABİT TEMA ─────────────────────────────────────────────────────────────

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'default-dark',
    name: 'Mayvox Midnight Glass',
    bg: `radial-gradient(circle at 18% 0%, rgba(111, 214, 255, 0.10), transparent 34%), radial-gradient(circle at 82% 12%, rgba(125, 92, 255, 0.08), transparent 30%), linear-gradient(180deg, #0b111c 0%, #070b12 100%)`,
    bgSoft: '#0B111C',
    surface: 'rgba(16, 22, 34, 0.72)',
    surfaceHover: 'rgba(20, 28, 42, 0.86)',
    surfaceActive: 'rgba(111, 214, 255, 0.12)',
    border: 'rgba(255, 255, 255, 0.075)',
    borderFocus: 'rgba(111, 214, 255, 0.28)',
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.62)',
    textMuted: 'rgba(255, 255, 255, 0.38)',
    textOnAccent: '#07111A',
    accent: '#6FD6FF',
    accentRgb: '111, 214, 255',
    accentHover: '#96E2FF',
    accentActive: '#48BDEB',
    accentSoft: 'rgba(111, 214, 255, 0.16)',
    // Palette-harmonik state renkleri
    success: '#3DD68C',
    warning: '#F5B83C',
    danger: '#FF6B6B',
    previewFrom: '#0E0F12',
    previewTo: '#1B1E29',
  },
  {
    id: 'dual-tone',
    name: 'Dual Tone',
    bg: `radial-gradient(900px 560px at 16% 4%, rgba(59,130,246,0.06), transparent 62%), radial-gradient(900px 560px at 86% 8%, rgba(168,85,247,0.06), transparent 62%), linear-gradient(90deg, rgba(10, 24, 38, 1) 0%, rgba(10, 17, 30, 1) 48%, rgba(22, 18, 42, 1) 100%)`,
    bgSoft: '#0B1220',
    surface: 'rgba(16, 22, 34, 0.72)',
    surfaceHover: 'rgba(20, 28, 42, 0.84)',
    surfaceActive: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(255, 255, 255, 0.05)',
    borderFocus: 'rgba(59, 130, 246, 0.26)',
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.64)',
    textMuted: 'rgba(255, 255, 255, 0.40)',
    textOnAccent: '#07111A',
    accent: '#3B82F6',
    accentRgb: '59, 130, 246',
    accentHover: '#60A5FA',
    accentActive: '#2563EB',
    accentSoft: 'rgba(59, 130, 246, 0.14)',
    success: '#3DD68C',
    warning: '#F5B83C',
    danger: '#FF6B6B',
    previewFrom: '#0B1220',
    previewTo: '#111827',
  },
  {
    id: 'ocean-blue',
    name: 'Okyanus Mavisi',
    bg: `radial-gradient(circle at 18% 0%, rgba(107, 214, 255, 0.13), transparent 34%), radial-gradient(circle at 78% 10%, rgba(68, 160, 255, 0.10), transparent 30%), radial-gradient(circle at 50% 100%, rgba(20, 80, 120, 0.16), transparent 40%), linear-gradient(180deg, #082033 0%, #061522 100%)`,
    bgSoft: '#082033',
    surface: 'rgba(10, 39, 61, 0.72)',
    surfaceHover: 'rgba(12, 46, 70, 0.82)',
    surfaceActive: 'rgba(107, 214, 255, 0.15)',
    border: 'rgba(173, 226, 255, 0.10)',
    borderFocus: 'rgba(107, 214, 255, 0.32)',
    textPrimary: 'rgba(244, 251, 255, 0.94)',
    textSecondary: 'rgba(219, 240, 250, 0.68)',
    textMuted: 'rgba(207, 232, 245, 0.42)',
    textOnAccent: '#001523',
    accent: '#6BD6FF',
    accentRgb: '107, 214, 255',
    accentHover: '#8FE1FF',
    accentActive: '#45C7F5',
    accentSoft: 'rgba(107, 214, 255, 0.15)',
    success: '#45E6B0',
    warning: '#FFD166',
    danger: '#FF6B7A',
    previewFrom: '#061522',
    previewTo: '#103954',
  },
  {
    id: 'emerald',
    name: 'Zümrüt',
    bg: `url("${bgEmerald}") center/cover no-repeat, radial-gradient(circle at 18% 0%, rgba(52, 211, 153, 0.13), transparent 34%), radial-gradient(circle at 82% 12%, rgba(16, 185, 129, 0.08), transparent 30%), linear-gradient(180deg, #062016 0%, #03140f 100%)`,
    bgSoft: '#062016',
    surface: 'rgba(6, 32, 22, 0.74)',
    surfaceHover: 'rgba(8, 42, 29, 0.86)',
    surfaceActive: 'rgba(55, 211, 155, 0.14)',
    border: 'rgba(94, 234, 212, 0.10)',
    borderFocus: 'rgba(94, 234, 212, 0.20)',
    textPrimary: '#EAF5EF',
    textSecondary: '#C2DDD0',
    textMuted: '#98C2B0',
    textOnAccent: '#04140C',
    // Saturasyon ~70%: zümrüt mineral haze
    accent: '#37D39B',
    accentRgb: '55, 211, 155',
    accentHover: '#5EEAD4',
    accentActive: '#20B783',
    accentSoft: 'rgba(55, 211, 155, 0.14)',
    success: '#37D39B',
    warning: '#D49A30',
    danger: '#D87878',
    previewFrom: '#051914',
    previewTo: '#0B2E24',
  },
  {
    id: 'crimson',
    name: 'Kızıl',
    bg: `url("${bgCrimson}") center/cover no-repeat, radial-gradient(circle at 18% 0%, rgba(248, 113, 113, 0.13), transparent 34%), radial-gradient(circle at 82% 12%, rgba(190, 18, 60, 0.09), transparent 30%), linear-gradient(180deg, #26070c 0%, #180407 100%)`,
    bgSoft: '#26070C',
    surface: 'rgba(45, 9, 14, 0.74)',
    surfaceHover: 'rgba(60, 12, 20, 0.86)',
    surfaceActive: 'rgba(248, 113, 113, 0.14)',
    border: 'rgba(252, 165, 165, 0.10)',
    borderFocus: 'rgba(252, 165, 165, 0.20)',
    textPrimary: '#FFEAEA',
    textSecondary: '#E8CCD0',
    textMuted: '#BFA0A4',
    textOnAccent: '#1A0507',
    // Saturasyon ~70%: velvet wine, kontrol altında
    accent: '#F87171',
    accentRgb: '248, 113, 113',
    accentHover: '#FB8B8B',
    accentActive: '#D95A5A',
    accentSoft: 'rgba(248, 113, 113, 0.14)',
    success: '#3DA468',
    warning: '#D49A30',
    danger: '#D87878',
    previewFrom: '#1B0708',
    previewTo: '#2E0F12',
  },
  {
    id: 'amber-night',
    name: 'Amber Gece',
    bg: `radial-gradient(circle at 16% 0%, rgba(216, 168, 93, 0.12), transparent 34%), radial-gradient(circle at 78% 8%, rgba(255, 209, 132, 0.07), transparent 30%), radial-gradient(circle at 50% 100%, rgba(72, 42, 16, 0.18), transparent 42%), linear-gradient(180deg, #120d08 0%, #0b0805 100%)`,
    bgSoft: '#120D08',
    surface: 'rgba(28, 20, 12, 0.72)',
    surfaceHover: 'rgba(36, 26, 16, 0.86)',
    surfaceActive: 'rgba(216, 168, 93, 0.15)',
    border: 'rgba(255, 213, 143, 0.105)',
    borderFocus: 'rgba(216, 168, 93, 0.34)',
    textPrimary: 'rgba(255, 247, 232, 0.94)',
    textSecondary: 'rgba(238, 218, 185, 0.68)',
    textMuted: 'rgba(224, 197, 153, 0.42)',
    textOnAccent: '#1A1305',
    accent: '#D8A85D',
    accentRgb: '216, 168, 93',
    accentHover: '#F0C77A',
    accentActive: '#B9873F',
    accentSoft: 'rgba(216, 168, 93, 0.15)',
    success: '#64D6A2',
    warning: '#F0C77A',
    danger: '#FF766F',
    previewFrom: '#0B0805',
    previewTo: '#2A1F13',
  },
  {
    id: 'frost-light',
    name: 'Frost Light',
    bg: `radial-gradient(circle at 16% 0%, rgba(59, 130, 246, 0.10), transparent 34%), radial-gradient(circle at 82% 8%, rgba(14, 165, 233, 0.08), transparent 30%), linear-gradient(180deg, #f6f7f9 0%, #eef2f7 100%), ${NOISE.frost}`,
    bgSoft: '#F6F7F9',
    surface: 'rgba(255, 255, 255, 0.92)',
    surfaceHover: 'rgba(241, 245, 249, 0.96)',
    surfaceActive: 'rgba(59, 130, 246, 0.10)',
    border: 'rgba(15, 23, 42, 0.10)',
    borderFocus: 'rgba(59, 130, 246, 0.34)',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textTertiary: '#475569',
    textMuted: '#64748B',
    textOnAccent: '#FFFFFF',
    textInverse: '#FFFFFF',
    accent: '#3B82F6',
    accentRgb: '59, 130, 246',
    accentHover: '#2563EB',
    accentActive: '#1D4ED8',
    accentSoft: 'rgba(59,130,246,0.10)',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    previewFrom: '#F6F7F9',
    previewTo: '#DCEAFE',
  },
  {
    id: 'graphite-pro',
    name: 'Graphite Pro',
    bg: `radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.045), transparent 34%), radial-gradient(circle at 80% 10%, rgba(156, 163, 175, 0.05), transparent 30%), linear-gradient(180deg, #0e0f11 0%, #090a0c 100%), ${NOISE.graphite}`,
    bgSoft: '#0E0F11',
    surface: 'rgba(22, 24, 28, 0.82)',
    surfaceHover: 'rgba(28, 31, 36, 0.92)',
    surfaceActive: 'rgba(156, 163, 175, 0.10)',
    border: 'rgba(255, 255, 255, 0.075)',
    borderFocus: 'rgba(156, 163, 175, 0.28)',
    textPrimary: '#E5E7EB',
    textSecondary: '#C5CAD3',
    textTertiary: '#B1B7C2',
    textMuted: '#9CA3AF',
    textOnAccent: '#0E0F11',
    accent: '#9CA3AF',
    accentRgb: '156, 163, 175',
    accentHover: '#D1D5DB',
    accentActive: '#6B7280',
    accentSoft: 'rgba(156,163,175,0.08)',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    previewFrom: '#0E0F11',
    previewTo: '#22262C',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    bg: `radial-gradient(circle at 18% 0%, rgba(34, 211, 238, 0.14), transparent 34%), radial-gradient(circle at 82% 8%, rgba(167, 139, 250, 0.12), transparent 32%), radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.08), transparent 42%), linear-gradient(180deg, #0b0f17 0%, #080b12 100%), ${NOISE.aurora}`,
    bgSoft: '#0B0F17',
    surface: 'rgba(18, 24, 38, 0.78)',
    surfaceHover: 'rgba(22, 29, 46, 0.90)',
    surfaceActive: 'rgba(34, 211, 238, 0.14)',
    border: 'rgba(148, 163, 184, 0.10)',
    borderFocus: 'rgba(34, 211, 238, 0.34)',
    textPrimary: '#E2E8F0',
    textSecondary: '#CBD5E1',
    textTertiary: '#AAB7CB',
    textMuted: '#94A3B8',
    textOnAccent: '#06131A',
    accent: '#22D3EE',
    accentRgb: '34, 211, 238',
    accentHover: '#67E8F9',
    accentActive: '#06B6D4',
    accentSoft: 'rgba(34,211,238,0.12)',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#FB7185',
    previewFrom: '#0B0F17',
    previewTo: '#312E81',
  },
];

export const DEFAULT_THEME_PACK_ID: ThemePackId = 'default-dark';

export function getThemePack(id: string | null | undefined): ThemePack {
  return THEME_PACKS.find(p => p.id === id) ?? THEME_PACKS[0];
}

function hexToRgbTuple(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '0, 0, 0';
  return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
}

// ── Apply: tüm token'ları :root CSS değişkeni olarak yaz ──
export function applyThemePack(pack: ThemePack): void {
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const isFrostLight = pack.id === 'frost-light';

  set('--bg', pack.bg);
  set('--bg-soft', pack.bgSoft);
  set('--surface', pack.surface);
  set('--surface-hover', pack.surfaceHover);
  set('--surface-active', pack.surfaceActive);
  set('--border', pack.border);
  set('--border-focus', pack.borderFocus);
  set('--text-primary', pack.textPrimary);
  set('--text-secondary', pack.textSecondary);
  set('--text-tertiary', pack.textTertiary ?? pack.textMuted);
  set('--text-muted', pack.textMuted);
  set('--text-on-accent', pack.textOnAccent);
  set('--text-inverse', pack.textInverse ?? '#0B0B0C');
  set('--accent', pack.accent);
  set('--accent-rgb', pack.accentRgb);
  set('--accent-hover', pack.accentHover);
  set('--accent-active', pack.accentActive);
  set('--accent-soft', pack.accentSoft);
  set('--surface-soft', `rgba(${hexToRgbTuple(pack.bgSoft)}, 0.62)`);
  set('--success', pack.success);
  set('--warning', pack.warning);
  set('--danger', pack.danger);

  // ── Legacy alias'lar (kademeli geçiş için) — surface/popover/input ayrı katman ──
  // KRITIK: --theme-bg = TAM gradient (ChatView/sidebar gibi bileşenler bg-[var(--theme-bg)]
  // ile bunu okuyor; flat ton verirsek tema gradient'i görünmez kalır).
  set('--theme-bg', pack.bg);
  set('--theme-text', pack.textPrimary);
  set('--theme-secondary-text', pack.textSecondary);
  set('--theme-text-muted', pack.textMuted);
  set('--theme-accent', pack.accent);
  set('--theme-accent-rgb', pack.accentRgb);
  set('--theme-text-on-accent', pack.textOnAccent);
  set('--theme-border', pack.border);
  set('--theme-divider', pack.border);
  set('--glass-tint', isFrostLight ? '15, 23, 42' : '255, 255, 255');

  // Surface / panel / card — Legacy alias'ları unified surface sistemine bağla
  // (--surface-base / --surface-elevated yukarıda set ediliyor; burada geriye dönük
  // uyumluluk için eski token isimlerini aynı değerlere yönlendiriyoruz.)
  set('--theme-surface', 'var(--surface-base)');
  set('--theme-surface-card', 'var(--surface-base)');
  set('--theme-surface-card-border', pack.id === 'default-dark' ? 'rgba(255,255,255,0.06)' : pack.border);
  set('--theme-panel', 'var(--surface-base)');
  set('--theme-panel-hover', 'var(--surface-hover)');
  set('--theme-panel-active', 'var(--surface-active)');
  set('--theme-elevated-panel', 'var(--surface-elevated)');
  set('--theme-elevated-panel-hover', 'var(--surface-elevated)');
  set('--theme-bg-elevated', 'var(--surface-elevated)');

  // Popover (modal, dropdown, user cards, settings sections) — her tema kendi
  // bgSoft'una bağlı, böylece default-dark matte black ailesinde kalır, emerald
  // yeşil ailesinde kalır vs. Hardcoded navy yok.
  const popoverBg = isFrostLight ? 'rgba(255,255,255,0.98)' : `rgba(${hexToRgbTuple(pack.bgSoft)}, 0.97)`;
  const popoverShadow = isFrostLight ? '0 12px 40px rgba(15,23,42,0.14)' : '0 12px 40px rgba(0,0,0,0.55)';
  set('--popover-bg', popoverBg);
  set('--popover-border', pack.border);
  set('--popover-text', pack.textPrimary);
  set('--popover-text-secondary', pack.textSecondary);
  set('--popover-shadow', popoverShadow);
  set('--theme-popover-bg', popoverBg);
  set('--theme-popover-border', pack.border);

  // Input surface — temanın accent rengiyle tint'lenmiş (mic/hoparlör butonlarıyla aynı aile)
  // VoiceControlButton active: bg accent/15, border accent/25 — input biraz daha soft.
  set('--theme-input-bg', `rgba(${pack.accentRgb}, 0.10)`);
  set('--theme-input-border', `rgba(${pack.accentRgb}, 0.18)`);
  set('--theme-input-bg-hover', `rgba(${pack.accentRgb}, 0.13)`);
  set('--theme-input-focus-border', `rgba(${pack.accentRgb}, 0.38)`);
  set('--theme-input-focus-ring', `rgba(${pack.accentRgb}, 0.15)`);
  set('--theme-input-text', pack.textPrimary);
  set('--theme-input-placeholder', pack.textMuted);
  set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 12px rgba(0,0,0,0.25)');

  // State renkleri
  set('--theme-success', pack.success);
  set('--theme-warning', pack.warning);
  set('--theme-danger', pack.danger);
  set('--theme-glow', pack.accent);
  set('--theme-glow-rgb', pack.accentRgb);
  set('--theme-glow-secondary-rgb', pack.accentRgb);
  set('--theme-accent-secondary', pack.accentHover);

  // Buttons
  set('--theme-btn-primary-bg', pack.accent);
  set('--theme-btn-primary-hover', pack.accentHover);
  set('--theme-btn-primary-text', pack.textOnAccent);
  set('--theme-btn-ghost-bg', pack.surface);
  set('--theme-btn-ghost-hover', pack.surfaceHover);
  set('--theme-btn-ghost-text', pack.textPrimary);

  // Icons
  set('--theme-icon-primary', pack.accent);
  set('--theme-icon-secondary', pack.textSecondary);

  // Scrollbar / selection / badge
  set('--theme-scrollbar-thumb', isFrostLight ? 'rgba(15,23,42,0.20)' : 'rgba(255,255,255,0.18)');
  set('--scrollbar-track', isFrostLight ? 'rgba(15,23,42,0.025)' : 'rgba(255,255,255,0.018)');
  set('--scrollbar-thumb', isFrostLight ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.20)');
  set('--scrollbar-thumb-hover', isFrostLight ? 'rgba(15,23,42,0.30)' : 'rgba(255,255,255,0.32)');
  set('--theme-selection', pack.accentSoft);
  set('--theme-badge-bg', pack.accent);
  set('--theme-badge-text', pack.textOnAccent);

  // RGB / shadow / bg auxiliary
  // bgSoft → "r, g, b" — tinted overlay'ler gradient ile uyumlu
  const bgRgb = hexToRgbTuple(pack.bgSoft);
  set('--theme-bg-rgb', bgRgb);
  set('--theme-sidebar-rgb', bgRgb);
  set('--theme-sidebar', pack.bgSoft);
  set('--shadow-base', '0, 0, 0');

  // ── Unified Dark Token System — tek tip, tutarlı isimlendirme ────────────
  // Spec: bg-primary / bg-secondary / bg-tertiary + surface-1/2/3 + border-subtle
  // Bu tokenlar yeni component'lerin TEK referans kaynağıdır. Legacy --theme-*
  // alias'ları backward compat için korunur, yeni kod bu token'ları kullanmalı.
  if (isFrostLight) {
    set('--bg-primary',   '#F6F7F9');
    set('--bg-secondary', '#F1F3F5');
    set('--bg-tertiary',  '#E9ECEF');
    set('--surface-1',    '#FFFFFF');
    set('--surface-2',    '#FFFFFF');
    set('--surface-3',    '#FFFFFF');
    set('--text-primary',   '#0F172A');
    set('--text-secondary', '#334155');
    set('--text-tertiary',  '#64748B');
  } else if (isFrostLight) {
    set('--surface-base',            '#FFFFFF');
    set('--surface-elevated',        '#F8FAFC');
    set('--surface-hover',           '#F1F5F9');
    set('--surface-active',          'rgba(59,130,246,0.10)');
    set('--surface-card-border',     '1px solid rgba(15,23,42,0.10)');
    set('--surface-card-shadow',     '0 8px 24px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.80)');
    set('--surface-floating-shadow', '0 20px 60px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.08)');
    set('--border-subtle',           'rgba(15,23,42,0.08)');
    set('--shadow-soft',             '0 8px 24px rgba(15,23,42,0.08)');
  } else {
    // Matte black family — tüm koyu alanlar bu 3 bg + 3 surface içinde
    set('--bg-primary',   '#0E0F12');
    set('--bg-secondary', '#151720');
    set('--bg-tertiary',  '#1B1E29');
    set('--surface-1',    'rgba(21, 23, 32, 0.88)');   // sidebar / inline panel
    set('--surface-2',    'rgba(27, 30, 41, 0.94)');   // card / modal body
    set('--surface-3',    'rgba(34, 38, 51, 0.98)');   // floating UI (dropdown/tooltip/popover)
    set('--text-primary',   '#F4F6FA');
    set('--text-secondary', '#C5CAD4');
    set('--text-tertiary',  '#8A909C');
  }

  // ── Surface Material System — tema-scoped ────────────────────────────────
  // Unified matte-black gradient SADECE default-dark için. Colored dark temalar
  // (ocean/emerald/crimson/amber) kendi pack.surface tint'lerini korur.
  if (pack.id === 'default-dark') {
    set('--surface-base',            'rgba(16, 22, 34, 0.72)');
    set('--surface-elevated',        'rgba(20, 28, 42, 0.86)');
    set('--surface-hover',           'rgba(255,255,255,0.085)');
    set('--surface-active',          'rgba(111,214,255,0.12)');
    set('--surface-card-border',     '1px solid rgba(255,255,255,0.075)');
    set('--surface-card-shadow',     '0 14px 36px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.05)');
    set('--surface-floating-shadow', '0 18px 50px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)');
    set('--border-subtle',           'rgba(255,255,255,0.075)');
    set('--shadow-soft',             '0 18px 50px rgba(0,0,0,0.22)');
  } else {
    // Colored dark themes — kendi kimliklerini korusun (ocean blue, emerald,
    // crimson, amber). pack.surface/surfaceHover/surfaceActive zaten tint'lenmiş.
    set('--surface-base',            pack.surface);
    set('--surface-elevated',        pack.surfaceHover);
    set('--surface-hover',           pack.surfaceHover);
    set('--surface-active',          pack.surfaceActive);
    set('--surface-card-border',     `1px solid ${pack.border}`);
    set('--surface-card-shadow',     '0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)');
    set('--surface-floating-shadow', '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)');
    set('--border-subtle',           pack.border);
    set('--shadow-soft',             '0 8px 24px rgba(0,0,0,0.35)');
  }

  // Legacy alias'lar — geriye uyum, her tema kendi --surface-base'ine bağlı
  set('--surface-card-bg', 'var(--surface-base)');
  set('--surface-card-hover-bg', 'var(--surface-elevated)');
  set('--surface-floating-bg', 'var(--surface-elevated)');

  // ── Depth Layering System — premium elevation scale ──────────────────────
  // level-0 = base atmosphere (bg zaten)
  // level-1 = panel / sidebar / inline card
  // level-2 = modal / popover / elevated card
  // level-3 = floating UI (dropdowns, tooltips, toasts, context menus)
  // Her level sonrakinden biraz daha aydınlık + daha soft shadow.
  if (isFrostLight) {
    set('--depth-1', '#FFFFFF');
    set('--depth-2', '#FFFFFF');
    set('--depth-3', '#FFFFFF');
    set('--shadow-1', '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.9)');
    set('--shadow-2', '0 6px 18px rgba(15,23,42,0.08), 0 16px 40px rgba(15,23,42,0.10)');
    set('--shadow-3', '0 18px 48px rgba(15,23,42,0.14), 0 4px 12px rgba(15,23,42,0.08)');
  } else {
    // Matte black elevation — pencere dışına taşan soft wide shadow + inset hairline
    set('--depth-1', 'rgba(21, 23, 32, 0.88)');   // #151720 — sidebar/panel
    set('--depth-2', 'rgba(27, 30, 41, 0.94)');   // #1B1E29 — card/modal
    set('--depth-3', 'rgba(34, 38, 51, 0.98)');   // #222633 — floating UI
    set('--shadow-1', '0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)');
    set('--shadow-2', '0 10px 30px rgba(0,0,0,0.40), 0 2px 6px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.035)');
    set('--shadow-3', '0 24px 56px -12px rgba(0,0,0,0.55), 0 6px 18px -4px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045)');
  }

  // ── Message Bubble System — tema-bağımsız tutarlılık ──────────────────
  // Kendi mesajların: HER ZAMAN açık nötr yüzey + koyu text (tema değişmez)
  // Karşıdaki mesajlar: temanın accent rengine dayalı tint + tema-uyumlu text
  set('--msg-self-bg', 'linear-gradient(180deg, #f1f3f5, #e6e8eb)');
  set('--msg-self-text', '#111111');
  set('--msg-self-border', '1px solid rgba(0,0,0,0.06)');
  set('--msg-self-backdrop', 'none');

  // Received — accent-tinted translucent bg per-theme
  set('--msg-other-bg', `rgba(${pack.accentRgb}, 0.15)`);
  set('--msg-other-text', isFrostLight ? '#0F172A' : 'rgba(255,255,255,0.9)');
  set('--msg-other-border', `1px solid rgba(${pack.accentRgb}, 0.12)`);
  set('--msg-other-backdrop', 'none');

  // Ortak shadow — hafif depth
  set('--msg-shadow', '0 4px 14px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.04)');

  // ── Ambient bg wash — #root::before viewport-wide atmosphere ─────────────
  // default-dark: neutral slate (yeşil/teal tinting YOK, matte black saf kalsın).
  // Diğer temalar: kendi kimliklerine uygun ambient tonlar.
  const ambient = (() => {
    switch (pack.id) {
      case 'default-dark':   return ['70, 100, 160', '40, 70, 120', '30, 50, 90'];
      case 'ocean-blue':     return ['56, 130, 180', '40, 110, 160', '30, 80, 130'];
      case 'emerald':        return ['80, 175, 145', '60, 150, 120', '40, 120, 95'];
      case 'crimson':        return ['200, 130, 130', '180, 100, 100', '140, 70, 70'];
      case 'amber-night':    return ['210, 165, 95', '180, 140, 75', '140, 105, 50'];
      case 'frost-light':    return ['59, 130, 246', '14, 165, 233', '148, 163, 184'];
      case 'graphite-pro':   return ['156, 163, 175', '107, 114, 128', '75, 85, 99'];
      case 'aurora':         return ['34, 211, 238', '167, 139, 250', '16, 185, 129'];
      default:               return ['70, 100, 160', '40, 70, 120', '30, 50, 90'];
    }
  })();
  set('--ambient-bg-rgb-1', ambient[0]);
  set('--ambient-bg-rgb-2', ambient[1]);
  set('--ambient-bg-rgb-3', ambient[2]);
  // default-dark → hiç parıltı yok (dümdüz matte black). Diğer temalar default fallback'i alır
  if (pack.id === 'default-dark' || isFrostLight) {
    set('--ambient-op-1', '0');
    set('--ambient-op-2', '0');
    set('--ambient-op-3', '0');
    set('--ambient-op-4', '0');
  } else {
    set('--ambient-op-1', '0.05');
    set('--ambient-op-2', '0.04');
    set('--ambient-op-3', '0.04');
    set('--ambient-op-4', '0.035');
  }

  // ── Design System tokens (spec alignment) ────────────────────────────────
  if (isFrostLight) {
    set('--border-hairline', 'rgba(15, 23, 42, 0.05)');
    set('--border-subtle', 'rgba(15, 23, 42, 0.08)');
    set('--border-default', 'rgba(15, 23, 42, 0.12)');
    set('--divider', 'rgba(15, 23, 42, 0.06)');
  } else {
    // Border scale — dark theme hairlines
    set('--border-hairline', 'rgba(255, 255, 255, 0.05)');
    set('--border-subtle', 'rgba(255, 255, 255, 0.08)');
    set('--border-default', 'rgba(255, 255, 255, 0.12)');
    set('--divider', 'rgba(255, 255, 255, 0.06)');
  }

  // Text extras — disabled + link
  set('--text-disabled', isFrostLight ? '#9AA0AB' : '#5E636F');
  set('--text-link', pack.accentHover);
  set('--theme-text-link', pack.accentHover);

  // Accent ring (focus outline)
  set('--accent-ring', `rgba(${pack.accentRgb}, 0.40)`);

  // State soft backgrounds — hex'ten türetilmiş düşük-alpha bg
  set('--success-soft', `rgba(${hexToRgbTuple(pack.success)}, 0.12)`);
  set('--warning-soft', `rgba(${hexToRgbTuple(pack.warning)}, 0.12)`);
  set('--danger-soft', `rgba(${hexToRgbTuple(pack.danger)}, 0.14)`);

  // Info (state set'inde ThemePack'te yok — tüm temalar için sabit cool blue)
  set('--info', '#5BB6FF');
  set('--info-rgb', '91, 182, 255');
  set('--info-soft', 'rgba(91, 182, 255, 0.12)');

  // Focus / selection glow — sadece interaction'da görünür, neon değil
  set('--focus-glow', `0 0 0 2px rgba(${pack.accentRgb}, 0.14), 0 0 14px rgba(${pack.accentRgb}, 0.08)`);
  // Aktif element — barely-there aura (default state'te obvious olmasın)
  set('--glow-active', `0 0 16px rgba(${pack.accentRgb}, 0.10)`);
  // Pressed state — inset push
  set('--shadow-pressed', 'inset 0 2px 4px rgba(0,0,0,0.25)');

  if (pack.id === 'default-dark' || pack.id === 'dual-tone') {
    set('--bg-app', pack.id === 'dual-tone' ? '#0a111e' : '#070b12');
    set('--bg-shell', pack.id === 'dual-tone' ? '#0a1826' : '#0b111c');
    set('--bg-panel', pack.id === 'dual-tone' ? '#12151a' : 'rgba(16, 22, 34, 0.72)');
    set('--bg-panel-strong', 'rgba(20, 28, 42, 0.86)');
    set('--bg-card', 'rgba(18, 25, 38, 0.74)');
    set('--surface-soft', 'rgba(18, 25, 38, 0.62)');
    set('--border-soft', pack.id === 'dual-tone' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.075)');
    set('--border-strong', 'rgba(255, 255, 255, 0.12)');
    set('--border-subtle', pack.id === 'dual-tone' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.075)');
    set('--border-default', 'rgba(255, 255, 255, 0.12)');
    set('--text-primary', 'rgba(255, 255, 255, 0.92)');
    set('--text-secondary', 'rgba(255, 255, 255, 0.62)');
    set('--text-tertiary', 'rgba(255, 255, 255, 0.38)');
    set('--accent-soft', pack.accentSoft);
    set('--accent-border', `rgba(${pack.accentRgb}, 0.26)`);
    set('--danger', '#ff6b6b');
    set('--theme-bg-rgb', '7, 11, 18');
    set('--theme-sidebar-rgb', '16, 22, 34');
    set('--theme-sidebar', pack.id === 'dual-tone' ? '#0b1220' : '#0b111c');
    set('--depth-1', 'rgba(16, 22, 34, 0.72)');
    set('--depth-2', 'rgba(20, 28, 42, 0.86)');
    set('--depth-3', 'rgba(25, 35, 52, 0.94)');
    set('--shadow-1', 'inset 0 1px 0 rgba(255,255,255,0.05)');
    set('--shadow-2', '0 14px 36px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.05)');
    set('--shadow-3', '0 18px 50px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--app-divider', pack.id === 'dual-tone' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.042)');
    set('--theme-input-bg', 'rgba(255,255,255,0.045)');
    set('--theme-input-bg-hover', 'rgba(255,255,255,0.065)');
    set('--theme-input-border', 'rgba(255,255,255,0.08)');
    set('--theme-input-focus-border', `rgba(${pack.accentRgb},0.28)`);
    set('--theme-input-focus-ring', `rgba(${pack.accentRgb},0.14)`);
    set('--theme-input-placeholder', 'rgba(255,255,255,0.38)');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.04)');
  } else if (pack.id === 'frost-light') {
    set('--bg-app', '#F6F7F9');
    set('--bg-shell', '#FFFFFF');
    set('--bg-panel', '#FFFFFF');
    set('--bg-panel-strong', '#F8FAFC');
    set('--bg-card', '#FFFFFF');
    set('--surface-soft', '#F1F3F5');
    set('--bg-card-hover', '#F8FAFC');
    set('--border-soft', 'rgba(15, 23, 42, 0.08)');
    set('--border-strong', 'rgba(15, 23, 42, 0.12)');
    set('--text-primary', '#0F172A');
    set('--text-secondary', '#334155');
    set('--text-tertiary', '#64748B');
    set('--accent-strong', '#2563EB');
    set('--accent-soft', 'rgba(59,130,246,0.10)');
    set('--accent-border', 'rgba(59,130,246,0.28)');
    set('--danger', '#DC2626');
    set('--theme-bg-rgb', '246, 247, 249');
    set('--theme-sidebar-rgb', '241, 243, 245');
    set('--theme-sidebar', '#F1F3F5');
    set('--surface-base', '#FFFFFF');
    set('--surface-elevated', '#F8FAFC');
    set('--surface-hover', '#F1F5F9');
    set('--surface-active', 'rgba(59,130,246,0.10)');
    set('--surface-card-border', '1px solid rgba(15,23,42,0.10)');
    set('--surface-card-shadow', '0 8px 24px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.80)');
    set('--surface-floating-shadow', '0 20px 60px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.08)');
    set('--depth-1', '#FFFFFF');
    set('--depth-2', '#FFFFFF');
    set('--depth-3', '#FFFFFF');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--app-divider', 'rgba(15,23,42,0.06)');
    set('--theme-input-bg', 'rgba(255,255,255,0.92)');
    set('--theme-input-bg-hover', '#FFFFFF');
    set('--theme-input-border', 'rgba(15,23,42,0.10)');
    set('--theme-input-focus-border', 'rgba(59,130,246,0.34)');
    set('--theme-input-focus-ring', 'rgba(59,130,246,0.14)');
    set('--theme-input-placeholder', '#64748B');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.70), 0 2px 8px rgba(15,23,42,0.06)');
  } else if (pack.id === 'graphite-pro') {
    set('--bg-app', '#0E0F11');
    set('--bg-shell', '#16181C');
    set('--bg-panel', 'rgba(22, 24, 28, 0.82)');
    set('--bg-panel-strong', 'rgba(28, 31, 36, 0.92)');
    set('--bg-card', 'rgba(28, 31, 36, 0.82)');
    set('--surface-soft', 'rgba(28, 31, 36, 0.66)');
    set('--bg-card-hover', 'rgba(34, 38, 44, 0.86)');
    set('--border-soft', 'rgba(255, 255, 255, 0.075)');
    set('--border-strong', 'rgba(255, 255, 255, 0.12)');
    set('--text-primary', '#E5E7EB');
    set('--text-secondary', '#C5CAD3');
    set('--text-tertiary', '#9CA3AF');
    set('--accent-strong', '#D1D5DB');
    set('--accent-soft', 'rgba(156,163,175,0.08)');
    set('--accent-border', 'rgba(156,163,175,0.26)');
    set('--danger', '#F87171');
    set('--theme-bg-rgb', '14, 15, 17');
    set('--theme-sidebar-rgb', '22, 24, 28');
    set('--theme-sidebar', '#16181C');
    set('--surface-base', 'rgba(22, 24, 28, 0.82)');
    set('--surface-elevated', 'rgba(28, 31, 36, 0.92)');
    set('--surface-hover', 'rgba(34, 38, 44, 0.86)');
    set('--surface-active', 'rgba(156, 163, 175, 0.10)');
    set('--surface-card-border', '1px solid rgba(255,255,255,0.075)');
    set('--surface-card-shadow', 'inset 0 1px 0 rgba(255,255,255,0.04)');
    set('--surface-floating-shadow', '0 18px 50px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)');
    set('--depth-1', 'rgba(22, 24, 28, 0.82)');
    set('--depth-2', 'rgba(28, 31, 36, 0.92)');
    set('--depth-3', 'rgba(34, 38, 44, 0.96)');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--theme-input-bg', 'rgba(255,255,255,0.045)');
    set('--theme-input-bg-hover', 'rgba(255,255,255,0.065)');
    set('--theme-input-border', 'rgba(255,255,255,0.08)');
    set('--theme-input-focus-border', 'rgba(156,163,175,0.30)');
    set('--theme-input-focus-ring', 'rgba(156,163,175,0.12)');
    set('--theme-input-placeholder', 'rgba(229,231,235,0.42)');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.04)');
  } else if (pack.id === 'aurora') {
    set('--bg-app', '#0B0F17');
    set('--bg-shell', '#121826');
    set('--bg-panel', 'rgba(18, 24, 38, 0.78)');
    set('--bg-panel-strong', 'rgba(22, 29, 46, 0.90)');
    set('--bg-card', 'rgba(22, 29, 46, 0.78)');
    set('--surface-soft', 'rgba(22, 29, 46, 0.66)');
    set('--bg-card-hover', 'rgba(27, 34, 54, 0.86)');
    set('--border-soft', 'rgba(148, 163, 184, 0.10)');
    set('--border-strong', 'rgba(34, 211, 238, 0.20)');
    set('--text-primary', '#E2E8F0');
    set('--text-secondary', '#CBD5E1');
    set('--text-tertiary', '#94A3B8');
    set('--accent-strong', '#67E8F9');
    set('--accent-soft', 'rgba(34,211,238,0.12)');
    set('--accent-border', 'rgba(34,211,238,0.30)');
    set('--theme-accent-secondary', '#A78BFA');
    set('--theme-glow-secondary-rgb', '167, 139, 250');
    set('--danger', '#FB7185');
    set('--theme-bg-rgb', '11, 15, 23');
    set('--theme-sidebar-rgb', '18, 24, 38');
    set('--theme-sidebar', '#121826');
    set('--surface-base', 'rgba(18, 24, 38, 0.78)');
    set('--surface-elevated', 'rgba(22, 29, 46, 0.90)');
    set('--surface-hover', 'rgba(27, 34, 54, 0.86)');
    set('--surface-active', 'rgba(34, 211, 238, 0.14)');
    set('--surface-card-border', '1px solid rgba(148,163,184,0.10)');
    set('--surface-card-shadow', 'inset 0 1px 0 rgba(255,255,255,0.045)');
    set('--surface-floating-shadow', '0 20px 60px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)');
    set('--depth-1', 'rgba(18, 24, 38, 0.78)');
    set('--depth-2', 'rgba(22, 29, 46, 0.90)');
    set('--depth-3', 'rgba(27, 34, 54, 0.96)');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--theme-input-bg', 'rgba(34,211,238,0.075)');
    set('--theme-input-bg-hover', 'rgba(34,211,238,0.095)');
    set('--theme-input-border', 'rgba(34,211,238,0.12)');
    set('--theme-input-focus-border', 'rgba(34,211,238,0.34)');
    set('--theme-input-focus-ring', 'rgba(34,211,238,0.15)');
    set('--theme-input-placeholder', 'rgba(203,213,225,0.46)');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.05)');
  } else if (pack.id === 'ocean-blue') {
    set('--bg-app', '#061522');
    set('--bg-shell', '#082033');
    set('--bg-panel', 'rgba(10, 39, 61, 0.72)');
    set('--bg-panel-strong', 'rgba(13, 50, 76, 0.86)');
    set('--bg-card', 'rgba(9, 36, 56, 0.74)');
    set('--surface-soft', 'rgba(10, 30, 50, 0.60)');
    set('--bg-card-hover', 'rgba(9, 36, 56, 0.74)');
    set('--border-soft', 'rgba(173, 226, 255, 0.10)');
    set('--border-strong', 'rgba(173, 226, 255, 0.18)');
    set('--text-primary', 'rgba(244, 251, 255, 0.94)');
    set('--text-secondary', 'rgba(219, 240, 250, 0.68)');
    set('--text-tertiary', 'rgba(207, 232, 245, 0.42)');
    set('--accent-strong', '#45c7f5');
    set('--accent-soft', 'rgba(107, 214, 255, 0.15)');
    set('--accent-border', 'rgba(107, 214, 255, 0.32)');
    set('--danger', '#ff6b7a');
    set('--theme-bg-rgb', '6, 21, 34');
    set('--theme-sidebar-rgb', '10, 39, 61');
    set('--theme-sidebar', '#082033');
    set('--surface-base', 'rgba(10, 39, 61, 0.72)');
    set('--surface-elevated', 'rgba(12, 46, 70, 0.82)');
    set('--surface-hover', 'rgba(9, 36, 56, 0.74)');
    set('--surface-active', 'rgba(107, 214, 255, 0.15)');
    set('--surface-card-border', '1px solid rgba(173,226,255,0.10)');
    set('--surface-card-shadow', 'inset 0 1px 0 rgba(255,255,255,0.07)');
    set('--surface-floating-shadow', '0 18px 50px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.08)');
    set('--depth-1', 'rgba(10, 39, 61, 0.72)');
    set('--depth-2', 'rgba(13, 50, 76, 0.86)');
    set('--depth-3', 'rgba(16, 57, 84, 0.92)');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--theme-input-bg', 'rgba(173,226,255,0.075)');
    set('--theme-input-bg-hover', 'rgba(173,226,255,0.095)');
    set('--theme-input-border', 'rgba(173,226,255,0.12)');
    set('--theme-input-focus-border', 'rgba(107,214,255,0.32)');
    set('--theme-input-focus-ring', 'rgba(107,214,255,0.15)');
    set('--theme-input-placeholder', 'rgba(219,240,250,0.44)');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.055)');
  } else if (pack.id === 'amber-night') {
    set('--bg-app', '#0b0805');
    set('--bg-shell', '#120d08');
    set('--bg-panel', 'rgba(28, 20, 12, 0.72)');
    set('--bg-panel-strong', 'rgba(36, 26, 16, 0.86)');
    set('--bg-card', 'rgba(42, 31, 19, 0.66)');
    set('--surface-soft', 'rgba(40, 25, 10, 0.60)');
    set('--bg-card-hover', 'rgba(54, 39, 23, 0.72)');
    set('--border-soft', 'rgba(255, 213, 143, 0.105)');
    set('--border-strong', 'rgba(255, 213, 143, 0.20)');
    set('--text-primary', 'rgba(255, 247, 232, 0.94)');
    set('--text-secondary', 'rgba(238, 218, 185, 0.68)');
    set('--text-tertiary', 'rgba(224, 197, 153, 0.42)');
    set('--accent-strong', '#f0c77a');
    set('--accent-soft', 'rgba(216, 168, 93, 0.15)');
    set('--accent-border', 'rgba(216, 168, 93, 0.34)');
    set('--danger', '#ff766f');
    set('--theme-bg-rgb', '11, 8, 5');
    set('--theme-sidebar-rgb', '28, 20, 12');
    set('--theme-sidebar', '#120d08');
    set('--surface-base', 'rgba(28, 20, 12, 0.72)');
    set('--surface-elevated', 'rgba(36, 26, 16, 0.86)');
    set('--surface-hover', 'rgba(54, 39, 23, 0.72)');
    set('--surface-active', 'rgba(216, 168, 93, 0.15)');
    set('--surface-card-border', '1px solid rgba(255,213,143,0.105)');
    set('--surface-card-shadow', 'inset 0 1px 0 rgba(255,255,255,0.06)');
    set('--surface-floating-shadow', '0 18px 50px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.065)');
    set('--depth-1', 'rgba(28, 20, 12, 0.72)');
    set('--depth-2', 'rgba(36, 26, 16, 0.86)');
    set('--depth-3', 'rgba(42, 31, 19, 0.92)');
    set('--titlebar-bg-focused', 'transparent');
    set('--titlebar-bg-blurred', 'transparent');
    set('--titlebar-border', 'transparent');
    set('--titlebar-shadow', 'none');
    set('--theme-input-bg', 'rgba(255,255,255,0.052)');
    set('--theme-input-bg-hover', 'rgba(216,168,93,0.08)');
    set('--theme-input-border', 'rgba(255,213,143,0.13)');
    set('--theme-input-focus-border', 'rgba(216,168,93,0.34)');
    set('--theme-input-focus-ring', 'rgba(216,168,93,0.14)');
    set('--theme-input-placeholder', 'rgba(238,218,185,0.44)');
    set('--theme-input-shadow', 'inset 0 1px 0 rgba(255,255,255,0.05)');
  } else if (pack.id === 'emerald') {
    set('--bg-app', '#03140f');
    set('--bg-shell', '#062016');
    set('--accent-glow-1', 'rgba(52, 211, 153, 0.13)');
    set('--accent-glow-2', 'rgba(16, 185, 129, 0.08)');
    set('--bg-panel', 'rgba(6, 32, 22, 0.74)');
    set('--bg-panel-strong', 'rgba(8, 42, 29, 0.86)');
    set('--bg-card', 'rgba(5, 26, 18, 0.74)');
    set('--bg-card-hover', 'rgba(5, 26, 18, 0.74)');
    set('--border-soft', 'rgba(94, 234, 212, 0.10)');
    set('--border-strong', 'rgba(94, 234, 212, 0.20)');
    set('--accent-strong', '#5eead4');
    set('--accent-soft', 'rgba(55, 211, 155, 0.14)');
    set('--accent-border', 'rgba(94, 234, 212, 0.26)');
    set('--theme-depth-bg', 'radial-gradient(circle at 18% 0%, var(--accent-glow-1), transparent 34%), radial-gradient(circle at 82% 12%, var(--accent-glow-2), transparent 30%), radial-gradient(circle at 50% 100%, rgba(0,0,0,0.22), transparent 42%), linear-gradient(180deg, var(--bg-shell) 0%, var(--bg-app) 100%)');
    set('--surface-base', 'rgba(6, 32, 22, 0.74)');
    set('--surface-elevated', 'rgba(8, 42, 29, 0.86)');
    set('--surface-soft', 'rgba(6, 32, 22, 0.62)');
    set('--surface-card-border', '1px solid rgba(94,234,212,0.10)');
  } else if (pack.id === 'crimson') {
    set('--bg-app', '#180407');
    set('--bg-shell', '#26070c');
    set('--accent-glow-1', 'rgba(248, 113, 113, 0.13)');
    set('--accent-glow-2', 'rgba(190, 18, 60, 0.09)');
    set('--bg-panel', 'rgba(45, 9, 14, 0.74)');
    set('--bg-panel-strong', 'rgba(60, 12, 20, 0.86)');
    set('--bg-card', 'rgba(38, 8, 13, 0.74)');
    set('--bg-card-hover', 'rgba(38, 8, 13, 0.74)');
    set('--border-soft', 'rgba(252, 165, 165, 0.10)');
    set('--border-strong', 'rgba(252, 165, 165, 0.20)');
    set('--accent-strong', '#fb8b8b');
    set('--accent-soft', 'rgba(248, 113, 113, 0.14)');
    set('--accent-border', 'rgba(252, 165, 165, 0.26)');
    set('--theme-depth-bg', 'radial-gradient(circle at 18% 0%, var(--accent-glow-1), transparent 34%), radial-gradient(circle at 82% 12%, var(--accent-glow-2), transparent 30%), radial-gradient(circle at 50% 100%, rgba(0,0,0,0.22), transparent 42%), linear-gradient(180deg, var(--bg-shell) 0%, var(--bg-app) 100%)');
    set('--surface-base', 'rgba(45, 9, 14, 0.74)');
    set('--surface-elevated', 'rgba(60, 12, 20, 0.86)');
    set('--surface-soft', 'rgba(45, 9, 14, 0.62)');
    set('--surface-card-border', '1px solid rgba(252,165,165,0.10)');
  }

  // ── Soft hairlines only: keep theme colors/backgrounds untouched. ────────
  const borderMaterial = (() => {
    if (pack.id === 'frost-light') {
      return {
        border: 'rgba(15,23,42,0.060)',
        borderStrong: 'rgba(15,23,42,0.110)',
        inputBorder: 'rgba(15,23,42,0.090)',
      };
    }
    if (pack.id === 'graphite-pro') {
      return {
        border: 'rgba(255,255,255,0.050)',
        borderStrong: 'rgba(255,255,255,0.095)',
        inputBorder: 'rgba(255,255,255,0.060)',
      };
    }
    if (pack.id === 'aurora') {
      return {
        border: 'rgba(148,163,184,0.055)',
        borderStrong: 'rgba(34,211,238,0.105)',
        inputBorder: 'rgba(34,211,238,0.065)',
      };
    }
    if (pack.id === 'ocean-blue') {
      return {
        border: 'rgba(173,226,255,0.045)',
        borderStrong: 'rgba(173,226,255,0.095)',
        inputBorder: 'rgba(173,226,255,0.058)',
      };
    }
    if (pack.id === 'amber-night') {
      return {
        border: 'rgba(255,213,143,0.045)',
        borderStrong: 'rgba(255,213,143,0.095)',
        inputBorder: 'rgba(255,213,143,0.058)',
      };
    }
    if (pack.id === 'emerald') {
      return {
        border: 'rgba(94,234,212,0.042)',
        borderStrong: 'rgba(94,234,212,0.090)',
        inputBorder: 'rgba(94,234,212,0.055)',
      };
    }
    if (pack.id === 'crimson') {
      return {
        border: 'rgba(252,165,165,0.042)',
        borderStrong: 'rgba(252,165,165,0.090)',
        inputBorder: 'rgba(252,165,165,0.055)',
      };
    }
    return {
      border: 'rgba(255,255,255,0.042)',
      borderStrong: 'rgba(255,255,255,0.085)',
      inputBorder: 'rgba(255,255,255,0.052)',
    };
  })();

  set('--border-soft', borderMaterial.border);
  set('--border-subtle', borderMaterial.border);
  set('--border-strong', borderMaterial.borderStrong);
  set('--theme-surface-card-border', borderMaterial.border);
  set('--surface-card-border', `1px solid ${borderMaterial.border}`);
  set('--theme-input-border', borderMaterial.inputBorder);

  const contentSurfaceMaterial = (() => {
    switch (pack.id) {
      case 'default-dark':
        return {
          base: 'rgba(18, 24, 34, 0.92)',
          elevated: 'rgba(22, 30, 44, 0.96)',
          soft: 'rgba(15, 21, 30, 0.78)',
          hover: 'rgba(25, 34, 50, 0.98)',
        };
      case 'dual-tone':
        return {
          base: 'rgba(19, 20, 34, 0.92)',
          elevated: 'rgba(24, 25, 43, 0.96)',
          soft: 'rgba(16, 17, 30, 0.78)',
          hover: 'rgba(29, 30, 51, 0.98)',
        };
      case 'ocean-blue':
        return {
          base: 'rgba(12, 26, 34, 0.92)',
          elevated: 'rgba(14, 34, 46, 0.96)',
          soft: 'rgba(10, 30, 50, 0.76)',
          hover: 'rgba(17, 42, 57, 0.98)',
        };
      case 'emerald':
        return {
          base: 'rgba(10, 28, 20, 0.90)',
          elevated: 'rgba(13, 38, 27, 0.94)',
          soft: 'rgba(8, 24, 17, 0.76)',
          hover: 'rgba(16, 45, 32, 0.96)',
        };
      case 'crimson':
        return {
          base: 'rgba(32, 14, 16, 0.90)',
          elevated: 'rgba(43, 17, 21, 0.94)',
          soft: 'rgba(35, 10, 14, 0.76)',
          hover: 'rgba(52, 20, 25, 0.96)',
        };
      case 'amber-night':
        return {
          base: 'rgba(30, 22, 13, 0.90)',
          elevated: 'rgba(40, 29, 17, 0.94)',
          soft: 'rgba(34, 23, 12, 0.76)',
          hover: 'rgba(48, 35, 21, 0.96)',
        };
      default:
        return null;
    }
  })();

  if (contentSurfaceMaterial) {
    set('--surface-base', contentSurfaceMaterial.base);
    set('--surface-elevated', contentSurfaceMaterial.elevated);
    set('--surface-soft', contentSurfaceMaterial.soft);
    set('--surface-hover', contentSurfaceMaterial.hover);
    set('--bg-card', contentSurfaceMaterial.soft);
    set('--bg-card-hover', contentSurfaceMaterial.elevated);
    set('--theme-panel', 'var(--surface-base)');
    set('--theme-surface-card', 'var(--surface-base)');
    set('--theme-elevated-panel', 'var(--surface-elevated)');
    set('--theme-bg-elevated', 'var(--surface-elevated)');
  }

  const zoneMaterial = (() => {
    switch (pack.id) {
      case 'frost-light':
        return {
          neutralBg: '#f6f7f9',
          neutralSurface: '#ffffff',
          sidebarTint: '#edf4ff',
          topbarMidStrong: '#f1f5fb',
          topbarMidSoft: '#f6f7f9',
          divider: 'rgba(15, 23, 42, 0.060)',
        };
      case 'graphite-pro':
        return {
          neutralBg: '#0e0f11',
          neutralSurface: '#16181c',
          sidebarTint: '#14161a',
          topbarMidStrong: '#15171b',
          topbarMidSoft: '#111316',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      case 'aurora':
        return {
          neutralBg: '#0b0f17',
          neutralSurface: '#121826',
          sidebarTint: '#10202b',
          topbarMidStrong: '#151b2d',
          topbarMidSoft: '#111521',
          divider: 'rgba(148, 163, 184, 0.060)',
        };
      case 'emerald':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#0b2419',
          topbarMidStrong: '#111a16',
          topbarMidSoft: '#141615',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      case 'crimson':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#2b1116',
          topbarMidStrong: '#211416',
          topbarMidSoft: '#181515',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      case 'amber-night':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#271c10',
          topbarMidStrong: '#201a13',
          topbarMidSoft: '#181612',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      case 'ocean-blue':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#0f2430',
          topbarMidStrong: '#13252c',
          topbarMidSoft: '#151b1d',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      case 'dual-tone':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#18172f',
          topbarMidStrong: '#191827',
          topbarMidSoft: '#17161d',
          divider: 'rgba(255, 255, 255, 0.050)',
        };
      case 'default-dark':
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#101a2a',
          topbarMidStrong: '#151b25',
          topbarMidSoft: '#151719',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
      default:
        return {
          neutralBg: '#151515',
          neutralSurface: '#151515',
          sidebarTint: '#101a2a',
          topbarMidStrong: '#151b25',
          topbarMidSoft: '#151719',
          divider: 'rgba(255, 255, 255, 0.045)',
        };
    }
  })();

  set('--app-neutral-bg', zoneMaterial.neutralBg);
  const contentSurface = contentSurfaceMaterial?.base ?? zoneMaterial.neutralSurface;
  const raisedContentSurface = contentSurfaceMaterial?.elevated ?? zoneMaterial.neutralSurface;
  set('--app-neutral-surface', contentSurface);
  set('--app-content-surface', contentSurface);
  set('--app-surface', contentSurface);
  set('--app-surface-raised', raisedContentSurface);
  set('--sidebar-tint-bg', zoneMaterial.sidebarTint);
  set('--surface-muted', 'var(--surface-soft)');
  set('--sidebar', zoneMaterial.sidebarTint);
  set('--rightbar', contentSurface);
  set('--card', 'var(--surface-base)');
  set('--card-elevated', 'var(--surface-elevated)');
  set('--accent-border', `rgba(${pack.accentRgb}, 0.26)`);

  if (isFrostLight) {
    set('--dock-surface-bg', 'linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, white 8%), color-mix(in srgb, var(--surface-base) 96%, black 2%))');
    set('--dock-item-bg', 'color-mix(in srgb, var(--surface-elevated) 92%, black 3%)');
    set('--dock-item-hover', 'color-mix(in srgb, var(--surface-elevated) 88%, black 5%)');
    set('--dock-item-active', 'color-mix(in srgb, var(--theme-accent) 10%, var(--surface-elevated) 90%)');
    set('--dock-item-off', 'color-mix(in srgb, rgb(248 113 113) 8%, var(--surface-elevated) 92%)');
    set('--dock-surface-border', 'rgba(15, 23, 42, 0.10)');
    set('--dock-item-border', 'rgba(15, 23, 42, 0.11)');
    set('--dock-item-active-border', `rgba(${pack.accentRgb}, 0.26)`);
    set('--dock-surface-shadow', '0 10px 28px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.78)');
  } else {
    set('--dock-surface-bg', 'linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, white 4%), color-mix(in srgb, var(--surface-base) 96%, black 4%))');
    set('--dock-item-bg', 'color-mix(in srgb, var(--surface-elevated) 88%, white 5%)');
    set('--dock-item-hover', 'color-mix(in srgb, var(--surface-elevated) 82%, white 9%)');
    set('--dock-item-active', 'color-mix(in srgb, var(--theme-accent) 12%, var(--surface-elevated) 88%)');
    set('--dock-item-off', 'color-mix(in srgb, rgb(248 113 113) 9%, var(--surface-elevated) 91%)');
    set('--dock-surface-border', 'var(--border-subtle)');
    set('--dock-item-border', 'var(--border-subtle)');
    set('--dock-item-active-border', `rgba(${pack.accentRgb}, 0.24)`);
    set('--dock-surface-shadow', 'inset 0 1px 0 rgba(255,255,255,0.040), 0 18px 50px rgba(0,0,0,0.15)');
  }
  set('--dock-bg', 'var(--dock-surface-bg)');
  set('--dock-border', 'var(--dock-surface-border)');
  set('--dock-shadow', 'var(--dock-surface-shadow)');
  set('--dock-user-hover', 'var(--dock-item-hover)');
  set('--dock-divider', 'var(--dock-item-border)');
  set('--dock-surface-blur', 'blur(18px) saturate(1.14)');
  set('--dock-blur', 'var(--dock-surface-blur)');

  set('--topbar-gradient-start', zoneMaterial.sidebarTint);
  set('--topbar-gradient-end', zoneMaterial.neutralBg);
  set('--topbar-gradient-mid-strong', zoneMaterial.topbarMidStrong);
  set('--topbar-gradient-mid-soft', zoneMaterial.topbarMidSoft);
  set('--app-divider', zoneMaterial.divider);
  const rootBg = `linear-gradient(90deg, ${zoneMaterial.sidebarTint} 0%, color-mix(in srgb, ${zoneMaterial.sidebarTint} 72%, ${zoneMaterial.neutralBg} 28%) 22%, ${zoneMaterial.neutralBg} 48%, ${zoneMaterial.neutralBg} 100%)`;
  set('--app-root-bg', rootBg);
  set('--app-shell-bg', rootBg);
  set('--titlebar-blend-width', '180px');
  set(
    '--topbar-bg',
    `linear-gradient(90deg, ${zoneMaterial.sidebarTint} 0, ${zoneMaterial.sidebarTint} 46vw, ${zoneMaterial.topbarMidStrong} 56vw, ${zoneMaterial.topbarMidSoft} 66vw, ${zoneMaterial.neutralBg} 76vw, ${zoneMaterial.neutralBg} 100%)`,
  );

  // Document body background + color-scheme
  document.body.style.background = rootBg;
  document.body.style.color = pack.textPrimary;
  root.style.colorScheme = isFrostLight ? 'light' : 'dark';

  // Active theme attr (Tailwind koşullu stillendirme için kullanılabilir)
  root.setAttribute('data-theme', pack.id);
  root.setAttribute('data-theme-pack', pack.id);
}
