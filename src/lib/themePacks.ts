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
  | 'default-light'
  | 'ocean-blue'
  | 'emerald'
  | 'crimson'
  | 'amber-night';

export interface ThemePack {
  id: ThemePackId;
  name: string;
  isLight: boolean;

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

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;

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
  graphite: noise({ freq: 0.9, alpha: 0.06 }),                   // Default Dark — neutral
  paper:    noise({ freq: 1.2, alpha: 0.04 }),                   // Default Light — fine
  mist:     noise({ freq: 0.7, alpha: 0.05, tint: '0.4 0.6 0.8' }), // Ocean — cool
  mineral:  noise({ freq: 0.85, alpha: 0.06, tint: '0.2 0.5 0.4' }), // Emerald
  velvet:   noise({ freq: 0.6, alpha: 0.07, tint: '0.6 0.2 0.25' }), // Crimson
  resin:    noise({ freq: 0.7, alpha: 0.06, tint: '0.6 0.45 0.2' }), // Amber
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
    name: 'Varsayılan Koyu',
    isLight: false,
    // Smoked graphite + soft mor-mavi grain — premium boş-değil derinlik
    bg: `${NOISE.graphite}, ${ambientBlobs([
      { x: '12%', y: '18%', r: '70% 55%', rgba: 'rgba(40, 56, 92, 0.08)' },
      { x: '88%', y: '85%', r: '75% 60%', rgba: 'rgba(28, 38, 64, 0.07)' },
    ])}, linear-gradient(165deg, #10182A 0%, #0A111E 100%)`,
    bgSoft: '#0F1626',
    surface: 'rgba(20, 28, 48, 0.85)',
    surfaceHover: 'rgba(28, 38, 60, 0.88)',
    surfaceActive: 'rgba(36, 48, 74, 0.90)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderFocus: 'rgba(124, 137, 235, 0.45)',
    // WCAG AAA: textPrimary #F1F5FB (kontrast 16:1 surface üstünde)
    textPrimary: '#F1F5FB',
    textSecondary: '#D6DEEC',
    textMuted: '#A4B0C5',
    textOnAccent: '#FFFFFF',
    // Saturasyon ~70%: indigo restrained
    accent: '#7C89EB',
    accentRgb: '124, 137, 235',
    accentHover: '#9099EF',
    accentActive: '#5E6BD9',
    accentSoft: 'rgba(124, 137, 235, 0.14)',
    success: '#3DA468',
    warning: '#D49A30',
    danger: '#D85858',
    previewFrom: '#0B1220',
    previewTo: '#161E32',
  },
  {
    id: 'default-light',
    name: 'Varsayılan Açık',
    isLight: true,
    // Bloblar nötr graphite tone — mavi/mor YOK
    bg: `${NOISE.paper}, ${ambientBlobs([
      { x: '15%', y: '20%', r: '65% 55%', rgba: 'rgba(0, 0, 0, 0.025)' },
      { x: '85%', y: '80%', r: '70% 60%', rgba: 'rgba(0, 0, 0, 0.030)' },
    ])}, linear-gradient(170deg, #F5F7FA 0%, #ECF0F5 100%)`,
    bgSoft: '#EDF1F8',
    surface: 'rgba(255, 255, 255, 0.95)',
    surfaceHover: 'rgba(255, 255, 255, 1)',
    surfaceActive: 'rgba(244, 246, 250, 1)',
    border: 'rgba(0, 0, 0, 0.10)',
    borderFocus: 'rgba(0, 0, 0, 0.45)',
    // Light: opaque dark hex — alpha YOK, kontrast garanti
    textPrimary: '#111111',
    textSecondary: '#222222',
    textMuted: '#5B6675',
    textOnAccent: '#FFFFFF',
    // ── Neutral charcoal accent system — mavi YOK ──
    accent: '#1A1A1A',
    accentRgb: '26, 26, 26',
    accentHover: '#2A2A2A',
    accentActive: '#000000',
    accentSoft: 'rgba(0, 0, 0, 0.06)',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    previewFrom: '#F5F7FA',
    previewTo: '#E2E7F2',
  },
  {
    id: 'ocean-blue',
    name: 'Okyanus Mavisi',
    isLight: false,
    bg: `${NOISE.mist}, ${ambientBlobs([
      { x: '85%', y: '20%', r: '70% 55%', rgba: 'rgba(56, 130, 180, 0.07)' },
      { x: '15%', y: '85%', r: '75% 60%', rgba: 'rgba(20, 60, 100, 0.08)' },
    ])}, linear-gradient(170deg, #0B2235 0%, #061927 100%)`,
    bgSoft: '#0A2640',
    surface: 'rgba(14, 38, 60, 0.85)',
    surfaceHover: 'rgba(20, 50, 78, 0.88)',
    surfaceActive: 'rgba(28, 64, 96, 0.90)',
    border: 'rgba(123, 175, 210, 0.18)',
    borderFocus: 'rgba(123, 175, 210, 0.50)',
    textPrimary: '#EAF2FA',
    textSecondary: '#C2D7E8',
    textMuted: '#94B5CC',
    textOnAccent: '#001523',
    // Saturasyon ~70%: göz yormayan ocean tone
    accent: '#5BB0D9',
    accentRgb: '91, 176, 217',
    accentHover: '#7AC2E5',
    accentActive: '#3F94BD',
    accentSoft: 'rgba(91, 176, 217, 0.16)',
    success: '#3DA468',
    warning: '#D49A30',
    danger: '#D87878',
    previewFrom: '#061B2E',
    previewTo: '#0E2F4A',
  },
  {
    id: 'emerald',
    name: 'Zümrüt',
    isLight: false,
    // Custom asset — kullanıcının zümrüt arka plan görseli, cover + center
    bg: `url("${bgEmerald}") center/cover no-repeat, linear-gradient(170deg, #0A2620 0%, #051914 100%)`,
    bgSoft: '#0A2A22',
    surface: 'rgba(12, 42, 33, 0.85)',
    surfaceHover: 'rgba(18, 56, 44, 0.88)',
    surfaceActive: 'rgba(24, 70, 56, 0.90)',
    border: 'rgba(80, 175, 145, 0.18)',
    borderFocus: 'rgba(80, 175, 145, 0.50)',
    textPrimary: '#EAF5EF',
    textSecondary: '#C2DDD0',
    textMuted: '#98C2B0',
    textOnAccent: '#04140C',
    // Saturasyon ~70%: zümrüt mineral haze
    accent: '#3FB088',
    accentRgb: '63, 176, 136',
    accentHover: '#5DC2A0',
    accentActive: '#2E9974',
    accentSoft: 'rgba(63, 176, 136, 0.16)',
    success: '#3FB088',
    warning: '#D49A30',
    danger: '#D87878',
    previewFrom: '#051914',
    previewTo: '#0B2E24',
  },
  {
    id: 'crimson',
    name: 'Kızıl',
    isLight: false,
    bg: `url("${bgCrimson}") center/cover no-repeat, linear-gradient(172deg, #1F0B0D 0%, #110608 100%)`,
    bgSoft: '#280A0D',
    surface: 'rgba(46, 14, 16, 0.85)',
    surfaceHover: 'rgba(60, 20, 22, 0.88)',
    surfaceActive: 'rgba(74, 28, 30, 0.90)',
    border: 'rgba(200, 130, 130, 0.18)',
    borderFocus: 'rgba(200, 130, 130, 0.50)',
    textPrimary: '#FFEAEA',
    textSecondary: '#E8CCD0',
    textMuted: '#BFA0A4',
    textOnAccent: '#1A0507',
    // Saturasyon ~70%: velvet wine, kontrol altında
    accent: '#D87878',
    accentRgb: '216, 120, 120',
    accentHover: '#E2918F',
    accentActive: '#BC5E5E',
    accentSoft: 'rgba(216, 120, 120, 0.14)',
    success: '#3DA468',
    warning: '#D49A30',
    danger: '#D87878',
    previewFrom: '#1B0708',
    previewTo: '#2E0F12',
  },
  {
    id: 'amber-night',
    name: 'Amber Gece',
    isLight: false,
    bg: `${NOISE.resin}, ${ambientBlobs([
      { x: '15%', y: '20%', r: '70% 55%', rgba: 'rgba(140, 95, 30, 0.07)' },
      { x: '85%', y: '85%', r: '75% 60%', rgba: 'rgba(80, 55, 18, 0.08)' },
    ])}, linear-gradient(172deg, #1B130A 0%, #0E0904 100%)`,
    bgSoft: '#241A09',
    surface: 'rgba(42, 30, 12, 0.85)',
    surfaceHover: 'rgba(56, 40, 18, 0.88)',
    surfaceActive: 'rgba(70, 50, 24, 0.90)',
    border: 'rgba(210, 165, 95, 0.18)',
    borderFocus: 'rgba(210, 165, 95, 0.50)',
    textPrimary: '#FFF3D9',
    textSecondary: '#E8D2A8',
    textMuted: '#B59B6F',
    textOnAccent: '#1A1305',
    // Saturasyon ~70%: bronze dusk
    accent: '#D2A55F',
    accentRgb: '210, 165, 95',
    accentHover: '#DFB677',
    accentActive: '#B58843',
    accentSoft: 'rgba(210, 165, 95, 0.14)',
    success: '#3DA468',
    warning: '#D2A55F',
    danger: '#D87878',
    previewFrom: '#150E04',
    previewTo: '#261C0A',
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

  set('--bg', pack.bg);
  set('--bg-soft', pack.bgSoft);
  set('--surface', pack.surface);
  set('--surface-hover', pack.surfaceHover);
  set('--surface-active', pack.surfaceActive);
  set('--border', pack.border);
  set('--border-focus', pack.borderFocus);
  set('--text-primary', pack.textPrimary);
  set('--text-secondary', pack.textSecondary);
  set('--text-muted', pack.textMuted);
  set('--text-on-accent', pack.textOnAccent);
  set('--accent', pack.accent);
  set('--accent-rgb', pack.accentRgb);
  set('--accent-hover', pack.accentHover);
  set('--accent-active', pack.accentActive);
  set('--accent-soft', pack.accentSoft);
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
  set('--glass-tint', pack.isLight ? '15, 23, 42' : '255, 255, 255');

  // Surface / panel / card — TÜMÜ neutral glass tone (background sızmaz)
  set('--theme-surface', pack.surface);
  set('--theme-surface-card', pack.surface);
  set('--theme-surface-card-border', pack.border);
  set('--theme-panel', pack.surface);
  set('--theme-panel-hover', pack.surfaceHover);
  set('--theme-panel-active', pack.surfaceActive);
  set('--theme-elevated-panel', pack.surface);
  set('--theme-elevated-panel-hover', pack.surfaceHover);
  set('--theme-bg-elevated', pack.surface);

  // Popover (modal, dropdown) — koyu opaque-ish, background renginden bağımsız
  const popoverBg = pack.isLight ? 'rgba(255,255,255,0.96)' : 'rgba(10,14,26,0.96)';
  const popoverShadow = pack.isLight ? '0 12px 40px rgba(0,0,0,0.18)' : '0 12px 40px rgba(0,0,0,0.55)';
  set('--popover-bg', popoverBg);
  set('--popover-border', pack.border);
  set('--popover-text', pack.textPrimary);
  set('--popover-text-secondary', pack.textSecondary);
  set('--popover-shadow', popoverShadow);
  set('--theme-popover-bg', popoverBg);
  set('--theme-popover-border', pack.border);

  // Input — surface ile uyumlu
  set('--theme-input-bg', pack.surface);
  set('--theme-input-border', pack.border);
  set('--theme-input-text', pack.textPrimary);
  set('--theme-input-placeholder', pack.textMuted);

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
  set('--theme-scrollbar-thumb', pack.isLight ? 'rgba(15,23,42,0.20)' : 'rgba(255,255,255,0.18)');
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

  // Document body background + color-scheme
  document.body.style.background = pack.bg;
  document.body.style.color = pack.textPrimary;
  root.style.colorScheme = pack.isLight ? 'light' : 'dark';

  // Active theme attr (Tailwind koşullu stillendirme için kullanılabilir)
  root.setAttribute('data-theme-pack', pack.id);
  root.setAttribute('data-theme-light', pack.isLight ? 'true' : 'false');
}
