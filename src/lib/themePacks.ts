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
  graphite: noise({ freq: 0.95, alpha: 0.028 }),                 // Default Dark — matte black grain (~2.5%, band break)
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
    // Dümdüz matte black — hiç parıltı, radial, falloff yok. Sadece ultra
    // ince grain (banding kırıcı) + flat renk.
    bg: `${NOISE.graphite}, #0E0F12`,
    bgSoft: '#151720',
    // Surface = level-2 matte. bg'ye yakın, derinlik merdiven hissi
    surface: 'rgba(27, 30, 41, 0.86)',
    surfaceHover: 'rgba(34, 38, 51, 0.90)',
    surfaceActive: 'rgba(42, 47, 62, 0.93)',
    // Ultra ince hairline — harsh outline YOK
    border: 'rgba(255, 255, 255, 0.05)',
    // Focus — classic silver accent
    borderFocus: 'rgba(192, 192, 192, 0.45)',
    // WCAG AAA text skalası
    textPrimary: '#F4F6FA',
    textSecondary: '#C5CAD4',
    textMuted: '#8A909C',
    // Silver light olduğu için üstünde dark text (matte black canvas ile aynı)
    textOnAccent: '#0E0F12',
    // Classic Silver #C0C0C0 — monokrom, nötr, renksiz premium
    accent: '#C0C0C0',
    accentRgb: '192, 192, 192',
    accentHover: '#D4D4D4',
    accentActive: '#A8A8A8',
    accentSoft: 'rgba(192, 192, 192, 0.10)',
    // Palette-harmonik state renkleri
    success: '#3DD68C',
    warning: '#F5B83C',
    danger: '#FF6B6B',
    previewFrom: '#0E0F12',
    previewTo: '#1B1E29',
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
  const popoverBg = pack.isLight
    ? 'rgba(255,255,255,0.96)'
    : `rgba(${hexToRgbTuple(pack.bgSoft)}, 0.97)`;
  const popoverShadow = pack.isLight ? '0 12px 40px rgba(0,0,0,0.18)' : '0 12px 40px rgba(0,0,0,0.55)';
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
  set('--theme-input-shadow', pack.isLight
    ? 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.06)'
    : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 12px rgba(0,0,0,0.25)');

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

  // ── Unified Dark Token System — tek tip, tutarlı isimlendirme ────────────
  // Spec: bg-primary / bg-secondary / bg-tertiary + surface-1/2/3 + border-subtle
  // Bu tokenlar yeni component'lerin TEK referans kaynağıdır. Legacy --theme-*
  // alias'ları backward compat için korunur, yeni kod bu token'ları kullanmalı.
  if (pack.isLight) {
    set('--bg-primary',   '#F5F7FA');
    set('--bg-secondary', '#ECF0F5');
    set('--bg-tertiary',  '#E2E7F0');
    set('--surface-1',    'rgba(255,255,255,0.95)');
    set('--surface-2',    'rgba(255,255,255,0.98)');
    set('--surface-3',    '#FFFFFF');
    set('--text-primary',   '#0B0C0E');
    set('--text-secondary', '#3A4150');
    set('--text-tertiary',  '#6B7382');
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
    // Matte black unified material — messages panel referanslı
    set('--surface-base',            'linear-gradient(180deg, rgba(20,22,30,0.9), rgba(10,12,18,0.9))');
    set('--surface-elevated',        'linear-gradient(180deg, rgba(28,31,43,0.95), rgba(15,18,25,0.95))');
    set('--surface-hover',           'rgba(255,255,255,0.04)');
    set('--surface-active',          'rgba(255,255,255,0.06)');
    set('--surface-card-border',     '1px solid rgba(255,255,255,0.06)');
    set('--surface-card-shadow',     '0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)');
    set('--surface-floating-shadow', '0 20px 60px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04)');
    set('--border-subtle',           'rgba(255,255,255,0.06)');
    set('--shadow-soft',             '0 8px 24px rgba(0,0,0,0.35)');
  } else if (pack.isLight) {
    // Light family — beyaz kart üzerine soft shadow
    set('--surface-base',            'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,253,0.88))');
    set('--surface-elevated',        'linear-gradient(180deg, #FFFFFF, #F5F7FA)');
    set('--surface-hover',           'rgba(0,0,0,0.04)');
    set('--surface-active',          'rgba(0,0,0,0.06)');
    set('--surface-card-border',     '1px solid rgba(0,0,0,0.06)');
    set('--surface-card-shadow',     '0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)');
    set('--surface-floating-shadow', '0 20px 60px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.8)');
    set('--border-subtle',           'rgba(0,0,0,0.06)');
    set('--shadow-soft',             '0 8px 24px rgba(0,0,0,0.08)');
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
  if (pack.isLight) {
    set('--depth-1', 'rgba(255,255,255,0.95)');
    set('--depth-2', 'rgba(255,255,255,0.98)');
    set('--depth-3', 'rgba(255,255,255,1)');
    set('--shadow-1', '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)');
    set('--shadow-2', '0 6px 18px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.10)');
    set('--shadow-3', '0 18px 48px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.08)');
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
  const otherAlpha = pack.isLight ? 0.08 : 0.15;
  set('--msg-other-bg', `rgba(${pack.accentRgb}, ${otherAlpha})`);
  set('--msg-other-text', pack.isLight ? '#111111' : 'rgba(255,255,255,0.9)');
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
      case 'default-light':  return ['0, 0, 0', '0, 0, 0', '0, 0, 0'];
      case 'ocean-blue':     return ['56, 130, 180', '40, 110, 160', '30, 80, 130'];
      case 'emerald':        return ['80, 175, 145', '60, 150, 120', '40, 120, 95'];
      case 'crimson':        return ['200, 130, 130', '180, 100, 100', '140, 70, 70'];
      case 'amber-night':    return ['210, 165, 95', '180, 140, 75', '140, 105, 50'];
      default:               return ['70, 100, 160', '40, 70, 120', '30, 50, 90'];
    }
  })();
  set('--ambient-bg-rgb-1', ambient[0]);
  set('--ambient-bg-rgb-2', ambient[1]);
  set('--ambient-bg-rgb-3', ambient[2]);
  // default-dark → hiç parıltı yok (dümdüz matte black). Diğer temalar default fallback'i alır
  if (pack.id === 'default-dark') {
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
  // Border scale — beyaz-alpha (dark) / siyah-alpha (light), tema-agnostic
  if (pack.isLight) {
    set('--border-hairline', 'rgba(0, 0, 0, 0.05)');
    set('--border-subtle', 'rgba(0, 0, 0, 0.08)');
    set('--border-default', 'rgba(0, 0, 0, 0.12)');
    set('--divider', 'rgba(0, 0, 0, 0.06)');
  } else {
    set('--border-hairline', 'rgba(255, 255, 255, 0.05)');
    set('--border-subtle', 'rgba(255, 255, 255, 0.08)');
    set('--border-default', 'rgba(255, 255, 255, 0.12)');
    set('--divider', 'rgba(255, 255, 255, 0.06)');
  }

  // Text extras — disabled + link
  set('--text-disabled', pack.isLight ? '#9AA0AB' : '#5E636F');
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

  // Document body background + color-scheme
  document.body.style.background = pack.bg;
  document.body.style.color = pack.textPrimary;
  root.style.colorScheme = pack.isLight ? 'light' : 'dark';

  // Active theme attr (Tailwind koşullu stillendirme için kullanılabilir)
  root.setAttribute('data-theme-pack', pack.id);
  root.setAttribute('data-theme-light', pack.isLight ? 'true' : 'false');
}
