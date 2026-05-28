import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Gamepad2, Layers, Mic, MousePointer2, Droplet, FileText, Database, Keyboard, Search, X, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { isCapacitor, isMobile, isElectron } from '../lib/platform';
import { getPublicDisplayName } from '../lib/formatName';
import { Toggle } from '../components/settings/shared';
import { addCustomGame, getCurrentGameActivity, getCustomGames, isGameActivityAvailable, listGameProcesses, removeCustomGame, type CustomGameEntry, type GameProcessInfo } from '../features/game-activity/useGameActivity';
import { rangeVisualStyle } from '../lib/rangeStyle';
import { isAppHelpEnabled, setAppHelpEnabled } from '../lib/appHelpPreferences';

// ── Components ──
import PermissionSection from '../components/settings/sections/PermissionSection';
import LegalModal, { type LegalModalKind } from '../components/legal/LegalModal';
import EmptyState from '../components/EmptyState';

const loadSettingsSections = () => import('../components/settings/sections/SettingsSections');
const AccountSection = React.lazy(() => import('../components/settings/sections/AccountSection'));
const AdminUserManagement = React.lazy(() => import('../components/settings/sections/AdminUserManagement'));
const AdminActionBar = React.lazy(() => import('../components/settings/sections/AdminActionBar'));
const SystemServersPanel = React.lazy(() => import('../components/settings/sections/SystemServersPanel'));
const ManagementUsersPanel = React.lazy(() => import('../components/settings/sections/ManagementUsersPanel'));
const ShortcutsCard = React.lazy(() => import('../components/settings/sections/ShortcutsCard'));
const AppearanceSection = React.lazy(() => loadSettingsSections().then(module => ({ default: module.AppearanceSection })));
const SoundsSection = React.lazy(() => loadSettingsSections().then(module => ({ default: module.SoundsSection })));
const PerformanceSection = React.lazy(() => loadSettingsSections().then(module => ({ default: module.PerformanceSection })));
const VoiceModeSection = React.lazy(() => loadSettingsSections().then(module => ({ default: module.VoiceModeSection })));

type MainTab = 'account' | 'app' | 'appearance' | 'shortcuts' | 'admin';
type AdminSubTab = 'users' | 'servers';
type SettingsSearchItem = {
  id: string;
  tab: MainTab;
  title: string;
  description: string;
  keywords: string[];
  targetSectionId?: string;
  adminOnly?: boolean;
};

const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  {
    id: 'profile',
    tab: 'account',
    title: 'Profil & Hesap',
    description: 'Profil fotoğrafı, hesap bilgileri, şifre ve güvenlik ayarları.',
    keywords: ['hesap', 'profil', 'şifre', 'sifre', 'email', 'güvenlik', 'guvenlik', 'kullanıcı', 'kullanici'],
    targetSectionId: 'profile-photo',
  },
  {
    id: 'legal',
    tab: 'account',
    title: 'Hukuki ve Yerel Depolama',
    description: 'KVKK, kullanım şartları, çerezler ve localStorage tercihleri.',
    keywords: ['kvkk', 'hukuki', 'legal', 'şartlar', 'sartlar', 'çerez', 'cerez', 'localstorage', 'depolama'],
    targetSectionId: 'legal',
  },
  {
    id: 'appearance',
    tab: 'appearance',
    title: 'Görünüm yoğunluğu',
    description: 'Rahat ve kompakt görünüm modu.',
    keywords: ['görünüm', 'gorunum', 'kompakt', 'rahat', 'density', 'ui', 'arayüz', 'arayuz'],
    targetSectionId: 'appearance',
  },
  {
    id: 'font-size',
    tab: 'appearance',
    title: 'Yazı boyutu',
    description: 'Uygulama içindeki metinlerin okunabilirliğini ayarlar.',
    keywords: ['yazı', 'yazi', 'font', 'metin', 'büyüt', 'buyut', 'küçült', 'kucult', 'text'],
    targetSectionId: 'appearance',
  },
  {
    id: 'dock-size',
    tab: 'appearance',
    title: 'Alt kontrol çubuğu boyutu',
    description: 'Alt dock avatar, buton ve boşluk boyutunu ayarlar.',
    keywords: ['dock', 'alt bar', 'alt kontrol', 'kontrol çubuğu', 'kontrol cubugu', 'buton', 'boyut'],
    targetSectionId: 'appearance',
  },
  {
    id: 'theme-packs',
    tab: 'appearance',
    title: 'Tema paketleri',
    description: 'Renk, açık/koyu görünüm ve tema paketleri.',
    keywords: ['tema', 'renk', 'appearance', 'dark', 'light', 'açık', 'acik', 'koyu'],
    targetSectionId: 'appearance',
  },
  {
    id: 'overlay',
    tab: 'appearance',
    title: 'Oyun içi göstergeler',
    description: 'Overlay konumu, stil, boyut ve oyun içi kart ayarları.',
    keywords: ['overlay', 'oyun', 'gösterge', 'gosterge', 'konum', 'stil', 'kart', 'oyun içi', 'oyun ici'],
    targetSectionId: 'voice-overlay',
  },
  {
    id: 'sounds',
    tab: 'app',
    title: 'Sesler',
    description: 'Bildirim, davet ve arayüz sesleri.',
    keywords: ['ses', 'bildirim', 'notification', 'uyarı', 'uyari', 'davet', 'audio'],
    targetSectionId: 'sounds',
  },
  {
    id: 'voice',
    tab: 'app',
    title: 'Mikrofon ve konuşma modu',
    description: 'Mikrofon, kulaklık, PTT, VAD ve gürültü temizleme ayarları.',
    keywords: ['mikrofon', 'kulaklık', 'kulaklik', 'ptt', 'vad', 'push to talk', 'konuşma', 'konusma', 'gürültü', 'gurultu'],
    targetSectionId: 'performance',
  },
  {
    id: 'performance',
    tab: 'app',
    title: 'Performans',
    description: 'Düşük veri modu, performans ve uygulama verimliliği.',
    keywords: ['performans', 'düşük veri', 'dusuk veri', 'low data', 'veri'],
    targetSectionId: 'performance',
  },
  {
    id: 'game-activity',
    tab: 'app',
    title: 'Oyun aktivitesi',
    description: 'Masaüstünde oynanan oyunu gösterme ayarları.',
    keywords: ['oyun', 'aktivite', 'game', 'activity', 'masaüstü', 'masaustu'],
    targetSectionId: 'game-activity',
  },
  {
    id: 'close-behavior',
    tab: 'app',
    title: 'Kapatma Davranışı',
    description: 'Çarpıya basınca gizli simgeye küçült veya uygulamayı kapat.',
    keywords: ['kapatma', 'davranış', 'davranisi', 'çarpı', 'carpi', 'x', 'pencere', 'kapat', 'gizli simge', 'tray', 'küçült', 'kucult', 'tamamen kapat', 'çıkış', 'cikis', 'close', 'quit', 'minimize', 'system tray'],
    targetSectionId: 'close-behavior',
  },
  {
    id: 'shortcuts',
    tab: 'shortcuts',
    title: 'Kısayollar',
    description: 'Ctrl, tuş kombinasyonları ve hızlı komut kısayolları.',
    keywords: ['kısayol', 'kisayol', 'shortcut', 'tuş', 'tus', 'ctrl', 'mouse', 'push to talk'],
    targetSectionId: 'shortcuts',
  },
  {
    id: 'admin',
    tab: 'admin',
    title: 'Yönetim',
    description: 'Admin, moderasyon, rol, yetki ve kullanıcı yönetimi.',
    keywords: ['yönetim', 'yonetim', 'admin', 'moderasyon', 'rol', 'yetki', 'kullanıcı', 'kullanici', 'sunucu'],
    adminOnly: true,
  },
  {
    id: 'dm',
    tab: 'app',
    title: 'DM ve bildirimler',
    description: 'Direkt mesaj, bildirim ve uyarı davranışları.',
    keywords: ['dm', 'direkt mesaj', 'mesaj', 'bildirim', 'notification', 'uyarı', 'uyari'],
    targetSectionId: 'sounds',
  },
];

function SettingsLazyFallback({ label = 'Bölüm yükleniyor' }: { label?: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl text-[11px] font-semibold text-[var(--theme-secondary-text)]/55">
      {label}...
    </div>
  );
}

function normalizeSettingsSearch(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

// Premium segmented control — motion layoutId ile active pill smooth kayar
function SegmentedTabs({ tabs, value, onChange, rightSlot, tabletLayout = false }: {
  tabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }>;
  value: MainTab;
  onChange: (v: MainTab) => void;
  rightSlot?: React.ReactNode;
  tabletLayout?: boolean;
}) {
  return (
    <div className={tabletLayout
      ? 'flex w-full min-w-0 flex-col gap-1'
      : 'settings-tabs surface-card flex w-full flex-col gap-2 p-1 rounded-xl md:flex-row md:items-center md:justify-between'
    }>
      <div className={tabletLayout ? 'flex min-w-0 gap-1.5 overflow-x-auto pb-1 custom-scrollbar' : 'settings-tabs-list flex min-w-0 flex-1 flex-nowrap'}>
        {tabs.map(tab => {
          const active = value === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              title={tab.label}
              aria-label={tab.label}
              className={tabletLayout
                ? `relative flex h-8 min-w-[92px] flex-1 items-center justify-center gap-1 rounded-[11px] border px-1.5 text-[10px] font-semibold tracking-[-0.005em] transition-colors duration-150 ${
                    active
                      ? 'border-[rgba(var(--theme-accent-rgb),0.30)] bg-[rgba(var(--theme-accent-rgb),0.072)] text-[var(--theme-accent)]'
                      : 'border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] text-[var(--theme-secondary-text)]/70'
                  }`
                : `settings-tab ${active ? 'active' : ''} relative inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-[-0.005em] transition-colors duration-150 z-10 whitespace-nowrap`
              }
            >
              {active && !tabletLayout && (
                <motion.span
                  layoutId="settings-tab-active"
                  className="absolute inset-0 rounded-lg -z-10"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  style={{
                    background: 'var(--surface-elevated)',
                    border: 'var(--surface-card-border)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                />
              )}
              <span className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/70'}>
                {tab.icon}
              </span>
              <span className={`settings-tab-label truncate ${active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/80'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      {!tabletLayout && rightSlot}
    </div>
  );
}

// Domain başlığı — tutarlı tipografi, section öncesi küçük hiyerarşi işaretçisi
function DomainTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="settings-domain-title-icon text-[var(--theme-accent)]/70">{icon}</span>
      <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-text)]/85">{title}</h3>
    </div>
  );
}

function SettingsSectionCard({ children, className = '', commandTarget }: { children: React.ReactNode; className?: string; commandTarget?: string }) {
  return (
    <section
      data-command-target={commandTarget}
      className={`settings-section-card scroll-mt-5 min-w-0 rounded-2xl p-3 md:p-4 ${className}`}
    >
      {children}
    </section>
  );
}

function AppHelpCard() {
  const [enabled, setEnabled] = useState(() => isAppHelpEnabled());

  useEffect(() => {
    const sync = () => setEnabled(isAppHelpEnabled());
    window.addEventListener('mayvox:app-help-changed', sync);
    return () => window.removeEventListener('mayvox:app-help-changed', sync);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setAppHelpEnabled(next);
  };

  return (
    <SettingsSectionCard>
      <DomainTitle icon={<Settings size={11} strokeWidth={2.2} />} title="Yardım" />
      <div className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)]/55 bg-[var(--surface-soft)] px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold text-[var(--theme-text)]">Uygulama ipuçları</p>
          <p className="mt-0.5 text-[9.5px] font-medium leading-4 text-[var(--theme-secondary-text)]/68">
            Yeni kontroller için kısa yardım bildirimleri gösterir.
          </p>
        </div>
        <Toggle checked={enabled} onChange={toggle} tooltip={enabled ? 'İpuçlarını kapat' : 'İpuçlarını aç'} />
      </div>
    </SettingsSectionCard>
  );
}

function LegalCard({ icon, title, description, onClick }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="settings-account-card settings-legal-tile surface-card flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]/85">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-tight text-[var(--theme-text)]">{title}</p>
        <p className="mt-0.5 text-[10px] font-medium leading-snug text-[var(--theme-secondary-text)]/70">{description}</p>
      </div>
    </button>
  );
}

// ── Görsel konum seçici — ekran mockup'ı + 12 anchor noktası ──
// 4 köşe + her kenarda 2 ara nokta = 12 unique anchor. Fraction-based konum.
type OverlayAnchor =
  | 'top-left' | 'top-mid-left' | 'top-mid-right' | 'top-right'
  | 'right-top-mid' | 'right-bot-mid'
  | 'bottom-right' | 'bottom-mid-right' | 'bottom-mid-left' | 'bottom-left'
  | 'left-bot-mid' | 'left-top-mid';

const ANCHOR_POINTS: Array<{ v: OverlayAnchor; fx: number; fy: number; label: string }> = [
  { v: 'top-left',         fx: 0,    fy: 0,    label: 'Sol üst' },
  { v: 'top-mid-left',     fx: 0.33, fy: 0,    label: 'Üst (sol orta)' },
  { v: 'top-mid-right',    fx: 0.67, fy: 0,    label: 'Üst (sağ orta)' },
  { v: 'top-right',        fx: 1,    fy: 0,    label: 'Sağ üst' },
  { v: 'right-top-mid',    fx: 1,    fy: 0.33, label: 'Sağ (üst orta)' },
  { v: 'right-bot-mid',    fx: 1,    fy: 0.67, label: 'Sağ (alt orta)' },
  { v: 'bottom-right',     fx: 1,    fy: 1,    label: 'Sağ alt' },
  { v: 'bottom-mid-right', fx: 0.67, fy: 1,    label: 'Alt (sağ orta)' },
  { v: 'bottom-mid-left',  fx: 0.33, fy: 1,    label: 'Alt (sol orta)' },
  { v: 'bottom-left',      fx: 0,    fy: 1,    label: 'Sol alt' },
  { v: 'left-bot-mid',     fx: 0,    fy: 0.67, label: 'Sol (alt orta)' },
  { v: 'left-top-mid',     fx: 0,    fy: 0.33, label: 'Sol (üst orta)' },
];

function OverlayPositionPicker({ value, onChange, disabled, disabledReason, onDisabledClick, variant, size, cardOpacity, displayName, avatarUrl }: {
  value: OverlayAnchor;
  onChange: (v: OverlayAnchor) => void;
  disabled?: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void;
  variant: 'capsule' | 'card' | 'badge' | 'none';
  size: 'small' | 'medium' | 'large';
  cardOpacity: number;
  displayName: string;
  avatarUrl?: string | null;
}) {
  // Responsive: picker genişliği grid kolonu tarafından yönetilir (min-width 0 ile
  // taşmaz). Aspect-ratio ile yükseklik orantılı; min/max height ara genişliklerde
  // picker'ın saçma büyümesini/küçülmesini engeller.
  const ASPECT = '232 / 150';
  const pad = 10;
  const HIT = 24;
  const activeLabel = ANCHOR_POINTS.find(p => p.v === value)?.label ?? '';

  const bg = 'var(--overlay-picker-bg, linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.14) 0%, rgba(var(--theme-accent-rgb), 0.04) 100%), linear-gradient(180deg, #0f1522 0%, #080b14 100%))';
  const gridColor = 'var(--overlay-picker-grid, rgba(255,255,255,0.028))';
  const vignette = 'var(--overlay-picker-vignette, inset 0 0 60px rgba(0,0,0,0.55))';
  const ringColor = 'var(--overlay-picker-ring, rgba(var(--glass-tint), 0.08))';
  const inactiveDotBg = 'var(--overlay-picker-dot, rgba(255,255,255,0.78))';
  const inactiveDotRing = 'var(--overlay-picker-dot-ring, rgba(255,255,255,0.30))';

  return (
    <div
      className="flex flex-col gap-1 w-full min-w-0"
    >
      {/* KONUM başlığı — picker'ın dışında üst-orta (Stil/Boyut/Şeffaflık ile aynı stil) */}
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/72 mb-1 px-0.5 text-center">Konum</div>

      <div
        className="relative rounded-xl overflow-hidden w-full"
        style={{
          aspectRatio: ASPECT,
          height: 'clamp(148px, 26vw, 172px)',
          maxHeight: 172,
          background: bg,
          boxShadow: `inset 0 0 0 1px ${ringColor}, ${vignette}`,
          opacity: disabled ? 0.7 : 1,
          cursor: disabled ? 'pointer' : 'default',
          transition: 'opacity 180ms ease-out',
          // Container queries — içindeki center label container width'e göre küçülür.
          containerType: 'inline-size',
        } as React.CSSProperties}
        aria-label="Ekran konum seçici"
        title={disabled ? disabledReason : undefined}
      >
        {/* İnce grid — ekran hissi (tema duyarlı) */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              `linear-gradient(${gridColor} 1px, transparent 1px),` +
              ` linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
            backgroundSize: '18px 18px',
            opacity: 0.62,
            maskImage: 'radial-gradient(ellipse at center, black 45%, transparent 92%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 45%, transparent 92%)',
          }}
        />
        {/* Accent aura */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 15% 25%, rgba(var(--theme-accent-rgb), 0.075), transparent 56%)',
          }}
        />

        <style>{`
          .anchor-hit:hover .anchor-dot { transform: scale(1.45); background: var(--overlay-picker-dot-hover, rgba(var(--theme-accent-rgb), 0.55)); }
          .anchor-hit:hover .anchor-dot.is-active { transform: none; }
        `}</style>

        {/* Anchor noktaları %-bazlı pozisyonlanır → container küçüldüğünde
            anchor'lar oranlı kalır, hit area sabit (24px). Inset = picker padding. */}
        <div style={{ position: 'absolute', inset: pad }}>
        {ANCHOR_POINTS.map(p => {
          const active = value === p.v;
          const tx = `${-p.fx * 100}%`;
          const ty = `${-p.fy * 100}%`;
          return (
            <button
              key={p.v}
              onClick={() => {
                if (disabled) {
                  onDisabledClick?.();
                  return;
                }
                onChange(p.v);
              }}
              title={p.label}
              className="anchor-hit"
              style={{
                position: 'absolute',
                left: `${p.fx * 100}%`,
                top: `${p.fy * 100}%`,
                width: HIT, height: HIT,
                transform: `translate(${tx}, ${ty})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
                zIndex: active ? 3 : 2,
              }}
              aria-label={p.label}
              aria-pressed={active}
            >
              {active ? (
                <OverlayBoardPreview
                  variant={variant}
                  size={size}
                  cardOpacity={cardOpacity}
                  displayName={displayName}
                  avatarUrl={avatarUrl}
                  openLeft={p.fx > 0.5}
                />
              ) : (
                <span
                  aria-hidden
                  className="anchor-dot"
                  style={{
                    display: 'block',
                    width: 4, height: 4, borderRadius: '50%',
                    background: inactiveDotBg,
                    boxShadow: `inset 0 0 0 1px ${inactiveDotRing}`,
                    transition: 'all 140ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                />
              )}
            </button>
          );
        })}
        </div>

        {/* Seçili konum (Sol alt orta) — picker'ın TAM ortasında, arka plansız.
            Picker bg'sinin tema tint'i kapanmasın diye sadece text + text-shadow. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 24px)',
          }}
        >
          <span
            className="font-semibold truncate block"
            style={{
              // Container query — picker küçülünce yazı orantılı küçülür.
              fontSize: 'clamp(9px, 5.8cqw, 11px)',
              color: 'var(--overlay-picker-label, rgba(255,255,255,0.82))',
              textShadow: 'var(--overlay-picker-label-shadow, 0 1px 2px rgba(0,0,0,0.72), 0 0 4px rgba(0,0,0,0.45))',
            }}
          >
            {activeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function OverlayBoardPreview({
  variant,
  size,
  cardOpacity,
  displayName,
  avatarUrl,
  openLeft,
}: {
  variant: 'capsule' | 'card' | 'badge' | 'none';
  size: 'small' | 'medium' | 'large';
  cardOpacity: number;
  displayName: string;
  avatarUrl?: string | null;
  openLeft: boolean;
}) {
  const cfg = {
    small: { avatar: 14, name: 7, gap: 3 },
    medium: { avatar: 17, name: 8, gap: 4 },
    large: { avatar: 20, name: 9, gap: 5 },
  }[size];
  const name = displayName || 'Mayvox';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'M';
  const cardAlpha = Math.max(0, Math.min(100, cardOpacity)) / 100;
  const hasCard = variant !== 'none' && cardAlpha > 0;
  const tintA = 0.10 + cardAlpha * 0.08;
  const fillA = 0.10 + cardAlpha * 0.14;
  const baseA = 0.58 + cardAlpha * 0.26;
  const lineA = 0.10 + cardAlpha * 0.10;
  const cardBg = hasCard
    ? `radial-gradient(circle at 24% 18%, rgba(var(--theme-accent-rgb), ${tintA}), transparent 62%), linear-gradient(135deg, rgba(var(--theme-accent-rgb), ${fillA}) 0%, transparent 72%), linear-gradient(180deg, rgba(var(--theme-bg-rgb), ${baseA}) 0%, rgba(var(--shadow-base), ${0.42 + cardAlpha * 0.22}) 100%), linear-gradient(90deg, rgba(var(--theme-accent-rgb), ${lineA}), transparent 52%)`
    : 'transparent';
  const cardBorder = hasCard ? '1px solid rgba(var(--theme-accent-rgb),0.28)' : 'none';
  const cardShadow = hasCard
    ? '0 5px 14px rgba(var(--shadow-base),0.22), inset 0 1px 0 rgba(var(--theme-accent-rgb),0.08)'
    : 'none';
  const avatar = (
    <span
      className="settings-overlay-preview-avatar"
      style={{
        width: cfg.avatar,
        height: cfg.avatar,
        borderRadius: '26%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(var(--theme-accent-rgb), 0.18)',
        color: 'var(--theme-text)',
        fontSize: Math.max(7, cfg.name - 1),
        fontWeight: 800,
        boxShadow: '0 0 0 1px rgba(var(--theme-accent-rgb),0.24)',
      }}
    >
      {avatarUrl?.startsWith('http') ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
  const nameNode = (
    <span
      style={{
        fontSize: cfg.name,
        fontWeight: 700,
        color: 'var(--theme-text)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: size === 'large' ? 68 : 58,
        lineHeight: 1.12,
      }}
    >
      {name}
    </span>
  );
  const statusNode = (
    <span style={{ fontSize: Math.max(7, cfg.name - 2), fontWeight: 650, color: 'rgba(var(--theme-accent-rgb),0.82)', lineHeight: 1 }}>
      Bağlı
    </span>
  );
  const common: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: openLeft ? 'auto' : '50%',
    right: openLeft ? '50%' : 'auto',
    transform: openLeft ? 'translate(8px, -50%)' : 'translate(-8px, -50%)',
    display: 'inline-flex',
    alignItems: 'center',
    flexDirection: openLeft ? 'row-reverse' : 'row',
    gap: cfg.gap,
    pointerEvents: 'none',
    zIndex: 4,
    maxWidth: 110,
  };

  if (variant === 'card') {
    return (
      <span style={{ ...common, background: cardBg, border: cardBorder, borderRadius: Math.round(cfg.avatar * 0.42), padding: '3px 6px', boxShadow: cardShadow }}>
        {avatar}
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: openLeft ? 'right' : 'left' }}>
          {nameNode}
          {statusNode}
        </span>
      </span>
    );
  }
  if (variant === 'badge') {
    return (
      <span
        className="settings-overlay-badge-board-preview"
        data-open-left={openLeft}
        style={{ ...common }}
      >
        <span className="settings-overlay-badge-closed">
          {avatar}
        </span>
        <span
          className="settings-overlay-badge-open"
          style={{
            background: cardBg,
            border: cardBorder,
            borderRadius: Math.round(cfg.avatar * 0.42),
             padding: '2px 7px 2px 2px',
            boxShadow: cardShadow,
            display: 'inline-flex',
            alignItems: 'center',
            flexDirection: openLeft ? 'row-reverse' : 'row',
            gap: cfg.gap,
          }}
        >
          {avatar}
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: openLeft ? 'right' : 'left' }}>
            {nameNode}
          </span>
        </span>
      </span>
    );
  }
  if (variant === 'none') {
    return (
      <span className="settings-overlay-none-board-preview" style={common}>
        {avatar}
        {nameNode}
      </span>
    );
  }
  return (
    <span style={{ ...common, background: cardBg, border: cardBorder, borderRadius: Math.round(cfg.avatar * 0.42), padding: '2px 7px 2px 2px', boxShadow: cardShadow }}>
      {avatar}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: openLeft ? 'right' : 'left' }}>
        {nameNode}
      </span>
    </span>
  );
}

// Stil segmented — 3 mini preview: Capsule (pill) / Card (kare+bar) / Badge (minimal dot).
// Her buton aktif varyantı küçük mockup ile gösterir → kullanıcı seçerken ne alacağını görür.
function OverlayVariantSegmented({ value, onChange, disabled, disabledReason, onDisabledClick }: {
  value: 'capsule' | 'card' | 'badge' | 'none';
  onChange: (v: 'capsule' | 'card' | 'badge' | 'none') => void;
  disabled?: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void;
}) {
  const opts: Array<{ v: 'capsule' | 'card' | 'badge' | 'none'; label: string }> = [
    { v: 'capsule', label: 'Kapsül' },
    { v: 'card',    label: 'Kart' },
    { v: 'badge',   label: 'Rozet' },
    { v: 'none',    label: 'Yok' },
  ];
  return (
    <div
      className="vox-variant-grid w-full"
      style={{
        background: 'rgba(var(--glass-tint), 0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.06)',
        opacity: disabled ? 0.7 : 1,
      }}
      title={disabled ? disabledReason : undefined}
    >
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            data-overlay-option={o.v}
            onClick={() => {
              if (disabled) {
                onDisabledClick?.();
                return;
              }
              onChange(o.v);
            }}
            className="settings-overlay-segment-option min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-[10px] px-1"
            style={{
              height: 44,
              background: active ? 'rgba(var(--theme-accent-rgb), 0.14)' : 'transparent',
              boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.28)' : 'none',
              transition: 'all 160ms ease-out',
            }}
            aria-pressed={active}
            title={o.label}
          >
            <VariantPreview variant={o.v} active={active} />
            <span
              className="text-[9.5px] font-semibold tracking-wide truncate w-full text-center"
              style={{
                color: active ? 'var(--theme-accent)' : 'var(--theme-secondary-text)',
                opacity: active ? 1 : 0.8,
              }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Mini preview mockup — her varyantın karakteristik formu
function VariantPreview({ variant, active }: { variant: 'capsule' | 'card' | 'badge' | 'none'; active: boolean }) {
  const accent = active ? 'var(--theme-accent)' : 'rgba(var(--glass-tint), 0.42)';
  const fill = active ? 'rgba(var(--theme-accent-rgb), 0.22)' : 'rgba(var(--glass-tint), 0.10)';
  const dot = active ? 'var(--theme-accent)' : 'rgba(var(--glass-tint), 0.55)';
  if (variant === 'capsule') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: fill, borderRadius: 999, padding: '2px 6px 2px 2px',
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '26%', background: dot }} />
        <span style={{ width: 14, height: 2, borderRadius: 2, background: dot, opacity: 0.75 }} />
        <span style={{ display: 'flex', gap: 1 }}>
          <span style={{ width: 1.5, height: 5, background: dot, borderRadius: 1 }} />
          <span style={{ width: 1.5, height: 7, background: dot, borderRadius: 1 }} />
          <span style={{ width: 1.5, height: 4, background: dot, borderRadius: 1 }} />
        </span>
      </span>
    );
  }
  if (variant === 'card') {
    return (
      <span style={{
        display: 'inline-flex', flexDirection: 'column', gap: 2,
        background: fill, borderRadius: 4, padding: '3px 4px',
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: '26%', background: dot }} />
          <span style={{ width: 14, height: 1.5, borderRadius: 1, background: dot, opacity: 0.8 }} />
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 10 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: dot, opacity: 0.75 }} />
          <span style={{ width: 8, height: 1.5, borderRadius: 1, background: dot, opacity: 0.55 }} />
        </span>
      </span>
    );
  }
  if (variant === 'badge') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: fill, borderRadius: 999, padding: '2px 2px',
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '26%', background: dot }} />
        <span style={{ display: 'flex', gap: 1, marginRight: 2 }}>
          <span style={{ width: 1.5, height: 4, background: dot, borderRadius: 1, opacity: 0.8 }} />
          <span style={{ width: 1.5, height: 6, background: dot, borderRadius: 1, opacity: 0.9 }} />
        </span>
      </span>
    );
  }
  // none — sadece avatar + isim çizgisi (kart yok, waveform yok)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 9, height: 9, borderRadius: '26%', background: dot,
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }} />
      <span style={{ width: 16, height: 2, borderRadius: 2, background: dot, opacity: 0.85 }} />
    </span>
  );
}

// Boyut segmented — 3 buton, her biri avatar-dot ölçeğiyle görsel hiyerarşi.
// Konum kartının yanında dikey ortalanır; yükseklik picker'la eşleşir.
function OverlaySizeSegmented({ value, onChange, disabled, disabledReason, onDisabledClick }: {
  value: 'small' | 'medium' | 'large';
  onChange: (v: 'small' | 'medium' | 'large') => void;
  disabled?: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void;
}) {
  const opts: Array<{ v: 'small' | 'medium' | 'large'; label: string; dot: number; gap: number }> = [
    { v: 'small',  label: 'Küçük', dot: 4, gap: 2 },
    { v: 'medium', label: 'Orta',  dot: 6, gap: 3 },
    { v: 'large',  label: 'Büyük', dot: 8, gap: 4 },
  ];
  return (
    <div
      className="vox-size-grid w-full"
      style={{
        background: 'rgba(var(--glass-tint), 0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.06)',
        opacity: disabled ? 0.7 : 1,
      }}
      title={disabled ? disabledReason : undefined}
    >
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => {
              if (disabled) {
                onDisabledClick?.();
                return;
              }
              onChange(o.v);
            }}
            className="settings-overlay-segment-option min-w-0 flex flex-col items-center justify-center gap-1 rounded-[10px] px-1"
            style={{
              height: 44,
              background: active ? 'rgba(var(--theme-accent-rgb), 0.14)' : 'transparent',
              boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.28)' : 'none',
              transition: 'all 160ms ease-out',
            }}
            aria-pressed={active}
          >
            <span className="flex items-center" style={{ gap: o.gap }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: o.dot, height: o.dot, borderRadius: '50%',
                  background: active
                    ? (i === 0 ? 'var(--theme-accent)' : 'rgba(var(--theme-accent-rgb), 0.55)')
                    : 'rgba(var(--glass-tint), 0.36)',
                  boxShadow: active && i === 0 ? '0 0 5px rgba(var(--theme-accent-rgb), 0.85)' : 'none',
                  transition: 'all 160ms ease-out',
                }} />
              ))}
            </span>
            <span
              className="text-[10px] font-semibold tracking-wide truncate w-full text-center"
              style={{
                color: active ? 'var(--theme-accent)' : 'var(--theme-secondary-text)',
                opacity: active ? 1 : 0.8,
              }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// İkonlu + açıklamalı toggle satırı
function OverlayToggleRow({ icon, label, hint, checked, onChange, disabled, disabledReason, onDisabledClick }: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  disabledReason?: string;
  onDisabledClick?: () => void;
}) {
  return (
    <label
      className="flex items-center gap-3"
      title={disabled ? disabledReason : undefined}
      onClick={(e) => {
        if (!disabled) return;
        e.preventDefault();
        onDisabledClick?.();
      }}
      style={{
        minHeight: 42,
        paddingLeft: 2,
        paddingRight: 2,
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? 'pointer' : 'default',
      }}
    >
      <span
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
        style={{
          background: 'rgba(var(--glass-tint), 0.06)',
          color: 'var(--theme-secondary-text)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.05)',
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-[11.5px] font-medium text-[var(--theme-text)]/90 leading-tight truncate" style={{ whiteSpace: 'nowrap' }}>{label}</p>
        <p className="text-[9.5px] text-[var(--theme-secondary-text)]/55 leading-tight mt-0.5 truncate" style={{ whiteSpace: 'nowrap' }}>{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

// Oyun içi ses overlay — Electron desktop only — preview + kontroller
function VoiceOverlayCard() {
  const { currentUser } = useUser();
  const { setToastMsg } = useUI();
  const {
    overlayEnabled, setOverlayEnabled,
    overlayPosition, setOverlayPosition,
    overlaySize, setOverlaySize,
    overlayShowOnlySpeaking, setOverlayShowOnlySpeaking,
    overlayShowSelf, setOverlayShowSelf,
    overlayClickThrough, setOverlayClickThrough,
    overlayCardOpacity, setOverlayCardOpacity,
    overlayVariant, setOverlayVariant,
    overlayDisplayMode, setOverlayDisplayMode,
  } = useSettings();
  const off = !overlayEnabled;
  const previewName = getPublicDisplayName(currentUser) || 'Mayvox';
  const overlayDisabledReason = 'Önce oyun overlay özelliğini açın';
  const showOverlayDisabledFeedback = () => setToastMsg('Bu ayar şu anda değiştirilemez');
  const [detectedOverlayGame, setDetectedOverlayGame] = useState<string | null>(null);
  const overlayWaitsForGame = overlayEnabled && overlayDisplayMode === 'game-only';

  useEffect(() => {
    if (!overlayWaitsForGame || !isGameActivityAvailable()) {
      setDetectedOverlayGame(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      getCurrentGameActivity()
        .then(name => { if (!cancelled) setDetectedOverlayGame(name); })
        .catch(() => { if (!cancelled) setDetectedOverlayGame(null); });
    };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [overlayWaitsForGame]);

  return (
    <div
      className="surface-card settings-content-card rounded-xl px-4 py-4 w-full"
      style={{
        maxWidth: 600,
        minWidth: 0,
        marginInline: 'auto',
        overflow: 'hidden',
        containerType: 'inline-size',
      } as React.CSSProperties}
    >
      {/* Container-query tabanlı layout — kart genişliği küçüldükçe grid'ler kendi
          içinde adapt olur, hiçbir eleman üst üste binmez.
          Tier'lar:
          - card ≥ 500: vox-body 2 kolon (picker sol, kontroller sağ)
          - card < 500: vox-body 1 kolon stack (picker üstte, kontroller altta)
          Variant grid kendi kolonunun genişliğini ölçer (.vox-right container):
          - col ≥ 260: 4 kolon
          - col < 260: 2x2 */}
      <style>{`
        .vox-body {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          align-items: stretch;
        }
        @container (min-width: 500px) {
          .vox-body {
            grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
            gap: 12px;
          }
        }
        .vox-right {
          container-type: inline-size;
          min-width: 0;
        }
        .vox-variant-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          border-radius: 12px;
        }
        @container (min-width: 260px) {
          .vox-variant-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        .vox-size-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          border-radius: 12px;
        }
      `}</style>
      {/* Header — ikon + başlık + Masaüstü rozeti + ana toggle */}
      <div className="flex items-start gap-3">
        <div
          className="settings-overlay-icon-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(var(--theme-accent-rgb), 0.12)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.22)',
          }}
        >
          <Layers size={15} className="settings-overlay-icon text-[var(--theme-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[12.5px] font-semibold text-[var(--theme-text)] leading-tight">Oyun İçi Ses Göstergesi</p>
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/72 mt-1 leading-snug">
            Ses odasındaki üyeleri oyun üstünde küçük bir panelde göster.
          </p>
        </div>
        <div className="pt-0.5">
          <Toggle checked={overlayEnabled} onChange={() => setOverlayEnabled(!overlayEnabled)} />
        </div>
      </div>

      <div
        className="mt-3 rounded-xl px-3 py-2 text-[10.5px] leading-snug"
        style={{
          color: 'color-mix(in srgb, var(--theme-text) 72%, var(--theme-secondary-text))',
          background: 'color-mix(in srgb, var(--theme-bg) 78%, var(--theme-surface) 22%)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--theme-text) 12%, transparent)',
        }}
      >
        <span className="font-black text-[var(--theme-text)]">Not: </span>
        Gerçek tam ekran özel mod bazı oyunlarda Windows overlay pencerelerini engelleyebilir. En stabil kullanım için oyunu
        {' '}<span className="font-black text-[var(--theme-accent)]">Kenarsız Pencere</span> veya
        {' '}<span className="font-black text-[var(--theme-accent)]">Pencereli</span> modda aç.
        {overlayWaitsForGame && (
          <span className="mt-1 block text-[var(--theme-secondary-text)]/82">
            {detectedOverlayGame
              ? `${detectedOverlayGame} algılandı; overlay görünmüyorsa oyun görüntü modunu kenarsız pencereye al.`
              : 'Oyun modu açık; desteklenen oyun algılanınca overlay otomatik görünür.'}
          </span>
        )}
      </div>

      {/* Body — iki satır:
          1) Üst satır (wrap): konum picker (sol, sabit 232px) + boyut (sağ, flex-1, dikey ortalı)
          2) Alt satır: toggles full-width (konum altından sağa uzar)
          Küçük pencerede üst satır flex-wrap ile stack'e düşer; birbirine girmez. */}
      <div
        className="mt-3 flex flex-col gap-2.5"
        style={{
          opacity: off ? 0.55 : 1,
          transition: 'opacity 180ms ease-out',
        }}
      >
        <div className="vox-body">
          <OverlayPositionPicker
            value={overlayPosition}
            onChange={setOverlayPosition}
            disabled={off}
            disabledReason={overlayDisabledReason}
            onDisabledClick={showOverlayDisabledFeedback}
            variant={overlayVariant}
            size={overlaySize}
            cardOpacity={overlayCardOpacity}
            displayName={previewName}
            avatarUrl={currentUser.avatar || null}
          />
          <div className="vox-right w-full min-w-0 flex flex-col gap-3">
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/72 mb-1.5 px-0.5 text-center">Stil</div>
              <OverlayVariantSegmented value={overlayVariant} onChange={setOverlayVariant} disabled={off} disabledReason={overlayDisabledReason} onDisabledClick={showOverlayDisabledFeedback} />
            </div>

            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/72 mb-1.5 px-0.5 text-center">Boyut</div>
              <OverlaySizeSegmented value={overlaySize} onChange={setOverlaySize} disabled={off} disabledReason={overlayDisabledReason} onDisabledClick={showOverlayDisabledFeedback} />
            </div>

            {/* Kart şeffaflık — tek slider, sabit koyu renk. Overlay'de isim
                arkasındaki kartın + avatar/isim görünürlüğünün ortak ayarı. */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-0.5">
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/74">
                  <Droplet size={10} /> Kart Şeffaflığı
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-[var(--theme-text)]/75">%{overlayCardOpacity}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={overlayCardOpacity}
                disabled={off}
                onChange={(e) => setOverlayCardOpacity(parseInt(e.target.value) || 0)}
                className="premium-range w-full"
                style={{
                  ...rangeVisualStyle(overlayCardOpacity, 0, 100),
                  opacity: off ? 0.5 : 1,
                  cursor: off ? 'default' : 'pointer',
                }}
                aria-label="Kart şeffaflık ayarı"
              />
            </div>
          </div>
        </div>

        <div
          className="settings-overlay-toggle-grid rounded-xl p-2 w-full"
          style={{
            background: 'rgba(var(--glass-tint), 0.03)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.05)',
          }}
        >
          <OverlayToggleRow
            icon={<Gamepad2 size={13} strokeWidth={2} />}
            label="Masaüstünde de göster"
            hint="Kapalıysa yalnızca desteklenen oyun açıkken görünür"
            checked={overlayDisplayMode === 'always'}
            onChange={() => !off && setOverlayDisplayMode(overlayDisplayMode === 'always' ? 'game-only' : 'always')}
            disabled={off}
            disabledReason={overlayDisabledReason}
            onDisabledClick={showOverlayDisabledFeedback}
          />
          <OverlayToggleRow
            icon={<Mic size={13} strokeWidth={2} />}
            label="Sadece konuşanları göster"
            hint="Sessiz üyeler overlay'de görünmez"
            checked={overlayShowOnlySpeaking}
            onChange={() => !off && setOverlayShowOnlySpeaking(!overlayShowOnlySpeaking)}
            disabled={off}
            disabledReason={overlayDisabledReason}
            onDisabledClick={showOverlayDisabledFeedback}
          />
          <OverlayToggleRow
            icon={<UserIcon size={13} strokeWidth={2} />}
            label="Kendimi göster"
            hint="Kendi avatarın da overlay'e eklenir"
            checked={overlayShowSelf}
            onChange={() => !off && setOverlayShowSelf(!overlayShowSelf)}
            disabled={off}
            disabledReason={overlayDisabledReason}
            onDisabledClick={showOverlayDisabledFeedback}
          />
          <OverlayToggleRow
            icon={<MousePointer2 size={13} strokeWidth={2} />}
            label="Tıklamaları oyuna geçir"
            hint="Overlay fare tıklamalarını yakalamaz"
            checked={overlayClickThrough}
            onChange={() => !off && setOverlayClickThrough(!overlayClickThrough)}
            disabled={off}
            disabledReason={overlayDisabledReason}
            onDisabledClick={showOverlayDisabledFeedback}
          />
        </div>
      </div>
    </div>
  );
}

// Otomatik oyun algılama — sadece Electron desktop'ta görünür (opt-in)
function GameActivityCard() {
  const { gameActivityEnabled, setGameActivityEnabled } = useSettings();
  return (
    <div data-command-target="game-activity" className="settings-static-row-card settings-account-card surface-card scroll-mt-5 flex h-full min-h-[92px] items-center gap-3 px-4 py-3 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
        <Gamepad2 size={14} className="text-[var(--theme-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Otomatik Oyun Algılama</p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/72 mt-0.5 leading-snug">
          Açık oyunları algılayıp durum olarak gösterebilir. Sadece desteklenen oyunlar için; veriler cihazında kalır.
        </p>
      </div>
      <Toggle checked={gameActivityEnabled} onChange={() => setGameActivityEnabled(!gameActivityEnabled)} />
    </div>
  );
}

function GameActivityManager() {
  const { gameActivityEnabled, setGameActivityEnabled } = useSettings();
  const [modalOpen, setModalOpen] = useState(false);
  const [processes, setProcesses] = useState<GameProcessInfo[]>([]);
  const [customGames, setCustomGames] = useState<CustomGameEntry[]>([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openModal = async () => {
    setModalOpen(true);
    setError('');
    setLoading(true);
    try {
      const [nextProcesses, nextGames] = await Promise.all([listGameProcesses(), getCustomGames()]);
      setProcesses(nextProcesses);
      setCustomGames(nextGames);
    } catch (err) {
      setError('Oyun listesi okunamadı. Uygulamayı yeniden başlatıp tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProcesses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return processes
      .filter(proc => !q || proc.name.toLowerCase().includes(q) || (proc.displayName || '').toLowerCase().includes(q))
      .slice(0, 120);
  }, [processes, query]);

  const handleSelectProcess = (proc: GameProcessInfo) => {
    setSelectedProcess(proc.name);
    setDisplayName(proc.displayName || proc.name.replace(/\.exe$/i, '').replace(/[-_]+/g, ' ').trim());
  };

  const handleAdd = async () => {
    if (!selectedProcess || !displayName.trim()) {
      setError('Exe seçip görünen oyun adını yaz.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const next = await addCustomGame({ displayName: displayName.trim(), processes: [selectedProcess] });
      setCustomGames(next);
      setSelectedProcess('');
      setDisplayName('');
      setProcesses(await listGameProcesses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oyun eklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div data-command-target="game-activity" className="settings-static-row-card settings-account-card surface-card scroll-mt-5 flex h-full min-h-[92px] items-center gap-3 px-4 py-3 rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
          <Gamepad2 size={14} className="text-[var(--theme-accent)]/80" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Otomatik Oyun Algılama</p>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/72 mt-0.5 leading-snug">
            Açık oyunları durum olarak gösterir. Liste dışı oyunları bu cihazda manuel ekleyebilirsin.
          </p>
        </div>
        <button type="button" onClick={openModal} className="h-8 shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-[var(--theme-accent)]/78 transition hover:bg-[rgba(var(--theme-accent-rgb),0.08)] hover:text-[var(--theme-accent)] active:scale-[0.98]">
          <Plus size={13} className="opacity-80" />
          Ekle
        </button>
        <Toggle checked={gameActivityEnabled} onChange={() => setGameActivityEnabled(!gameActivityEnabled)} />
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setModalOpen(false)}>
            <motion.div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-[rgba(var(--theme-bg-rgb),0.94)] shadow-2xl shadow-black/40 ring-1 ring-[rgba(var(--glass-tint),0.12)]" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} onMouseDown={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[rgba(var(--glass-tint),0.08)] px-4 py-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-[var(--theme-text)]">Oyun ekle</h3>
                  <p className="mt-0.5 text-[10.5px] text-[var(--theme-secondary-text)]/62">Açık oyun listesinden seç, görünen adını yaz ve kaydet.</p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--theme-secondary-text)]/70 hover:bg-[rgba(var(--glass-tint),0.06)]">
                  <X size={15} />
                </button>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-[1fr_240px]">
                <div className="min-w-0">
                  <div className="mb-3 flex h-9 items-center gap-2 rounded-xl bg-[rgba(var(--glass-tint),0.035)] px-3 ring-1 ring-[rgba(var(--glass-tint),0.07)]">
                    <Search size={14} className="text-[var(--theme-secondary-text)]/55" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Oyun ara..." className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/45" />
                  </div>
                  <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                    {loading && <p className="px-2 py-8 text-center text-[11px] text-[var(--theme-secondary-text)]/60">Taranıyor...</p>}
                    {!loading && filteredProcesses.map(proc => (
                      <button key={proc.name} type="button" onClick={() => handleSelectProcess(proc)} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${selectedProcess === proc.name ? 'bg-[rgba(var(--theme-accent-rgb),0.10)] text-[var(--theme-text)] ring-1 ring-[rgba(var(--theme-accent-rgb),0.22)]' : 'text-[var(--theme-secondary-text)]/82 hover:bg-[rgba(var(--glass-tint),0.045)]'}`}>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold">{proc.name}</span>
                          {proc.displayName && <span className="block truncate text-[10px] text-[var(--theme-accent)]/70">{proc.displayName}</span>}
                        </span>
                        {proc.known && <span className="shrink-0 text-[10px] font-semibold text-[var(--theme-accent)]/70">Kayıtlı</span>}
                      </button>
                    ))}
                    {!loading && filteredProcesses.length === 0 && <p className="px-2 py-8 text-center text-[11px] text-[var(--theme-secondary-text)]/60">Oyun bulunamadı.</p>}
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/55">Görünen ad</span>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Örn. World of Tanks" className="h-9 w-full rounded-xl bg-[rgba(var(--glass-tint),0.035)] px-3 text-[12px] text-[var(--theme-text)] outline-none ring-1 ring-[rgba(var(--glass-tint),0.075)] placeholder:text-[var(--theme-secondary-text)]/42" />
                  </label>
                  <button type="button" onClick={handleAdd} disabled={loading || !selectedProcess || !displayName.trim()} className="h-9 w-full rounded-xl bg-[rgba(var(--theme-accent-rgb),0.12)] text-[12px] font-semibold text-[var(--theme-accent)] ring-1 ring-[rgba(var(--theme-accent-rgb),0.18)] transition enabled:hover:bg-[rgba(var(--theme-accent-rgb),0.16)] disabled:opacity-45">
                    Ekle
                  </button>
                  {error && <p className="text-[10.5px] text-rose-300/85">{error}</p>}
                  <div className="pt-2">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/55">Eklenenler</p>
                    <div className="max-h-[150px] space-y-1 overflow-y-auto custom-scrollbar">
                      {customGames.length === 0 && <p className="text-[10.5px] text-[var(--theme-secondary-text)]/55">Henüz manuel oyun yok.</p>}
                      {customGames.map(game => (
                        <div key={`${game.displayName}:${game.processes[0]}`} className="flex items-center justify-between gap-2 rounded-lg bg-[rgba(var(--glass-tint),0.035)] px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-[var(--theme-text)]">{game.displayName}</p>
                            <p className="truncate text-[9.5px] text-[var(--theme-secondary-text)]/55">{game.processes.join(', ')}</p>
                          </div>
                          <button type="button" onClick={async () => game.processes[0] && setCustomGames(await removeCustomGame(game.processes[0]))} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-rose-300/70 hover:bg-rose-500/10 hover:text-rose-200" title="Kaldır">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CloseBehaviorCard() {
  const { closeBehavior, setCloseBehavior } = useSettings();
  const quitsOnClose = closeBehavior === 'quit';

  return (
    <div data-command-target="close-behavior" className="settings-static-row-card settings-account-card surface-card scroll-mt-5 flex h-full min-h-[92px] items-center gap-3 px-4 py-3 rounded-xl">
      <div className="flex-1 min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)] leading-tight">
          <span className="inline-flex h-[16px] w-[32px] shrink-0 items-center justify-center gap-1 rounded-[6px] bg-[rgba(var(--glass-tint),0.035)] px-1 shadow-[inset_0_0_0_1px_rgba(var(--glass-tint),0.055)]" aria-hidden="true">
            <span className="h-[7px] w-[7px] rounded-[2px] bg-[rgba(var(--glass-tint),0.18)] shadow-[inset_0_0_0_1px_rgba(var(--glass-tint),0.11)]" />
            <span className="h-[7px] w-[7px] rounded-[2px] bg-[rgba(var(--glass-tint),0.18)] shadow-[inset_0_0_0_1px_rgba(var(--glass-tint),0.11)]" />
            <span className="inline-flex h-[8px] w-[8px] items-center justify-center rounded-[2px] bg-rose-500/22 text-rose-200/90 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.20)]">
              <X size={6} strokeWidth={3} />
            </span>
          </span>
          <span className="truncate">Kapatma Davranışı</span>
        </p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/72 mt-1 leading-snug">
          Açıkken çarpıya basınca uygulama tamamen kapanır.
        </p>
        <p className="text-[9.8px] font-semibold text-[var(--theme-secondary-text)]/68 mt-1 leading-snug">
          {quitsOnClose ? 'Açık: tamamen kapatır.' : 'Kapalı: simgeye küçültür.'}
        </p>
      </div>
      <div className="shrink-0">
        <Toggle
          checked={quitsOnClose}
          onChange={() => setCloseBehavior(quitsOnClose ? 'tray' : 'quit')}
        />
      </div>
    </div>
  );
}

export default function SettingsView() {
  const { currentUser } = useUser();
  const { settingsTarget, setSettingsTarget } = useUI();
  const isAdmin = !!currentUser.isAdmin || !!currentUser.isPrimaryAdmin;
  const settingsScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('account');
  const [adminSub, setAdminSub] = useState<AdminSubTab>('users');
  const [legalModal, setLegalModal] = useState<LegalModalKind | null>(null);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const showServersSub = !!currentUser.isPrimaryAdmin;

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const editable = target.closest('input, textarea, select, [contenteditable="true"]');
      return !!editable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const scroller = settingsScrollRef.current;
      if (!scroller) return;

      const smallStep = 64;
      const pageStep = Math.max(160, scroller.clientHeight * 0.82);
      let top: number | null = null;

      if (event.key === 'ArrowDown') top = smallStep;
      else if (event.key === 'ArrowUp') top = -smallStep;
      else if (event.key === 'PageDown') top = pageStep;
      else if (event.key === 'PageUp') top = -pageStep;
      else if (event.key === 'Home') top = -scroller.scrollTop;
      else if (event.key === 'End') top = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;

      if (top === null) return;
      event.preventDefault();
      scroller.scrollBy({ top, behavior: 'auto' });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Deep-link intent — bildirim tıklamasından / dock ikonundan gelen hedef
  // tab'ına otomatik geçer. 'invite_requests' AdminActionBar'da ek iş yapıyor;
  // 'app' / 'appearance' / 'account' sadece tab seçer, sonra temizlenir.
  useEffect(() => {
    if (!settingsTarget) return;
    if (settingsTarget === 'invite_requests' && isAdmin) {
      setActiveTab('admin');
      setAdminSub('users');
      // temizlik AdminActionBar'da
    } else if (settingsTarget === 'app' || settingsTarget === 'appearance' || settingsTarget === 'shortcuts') {
      setActiveTab(settingsTarget);
      setSettingsTarget(null);
    } else if (settingsTarget === 'account') {
      setActiveTab('account');
      setSettingsTarget(null);
    }
  }, [settingsTarget, isAdmin, setSettingsTarget]);

  useEffect(() => {
    const highlight = (id: string) => {
      window.setTimeout(() => {
        const el = document.querySelector(`[data-command-target="${id}"]`);
        if (!(el instanceof HTMLElement)) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('command-target-pulse');
        void el.offsetWidth;
        el.classList.add('command-target-pulse');
        window.setTimeout(() => el.classList.remove('command-target-pulse'), 1800);
      }, 80);
    };

    const onHighlight = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) highlight(id);
    };
    window.addEventListener('mayvox:highlight-setting', onHighlight);
    return () => window.removeEventListener('mayvox:highlight-setting', onHighlight);
  }, []);

  useEffect(() => {
    const onOpenLegal = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: LegalModalKind }>).detail?.kind;
      if (!kind) return;
      setActiveTab('account');
      setLegalModal(kind);
    };
    window.addEventListener('mayvox:open-legal', onOpenLegal);
    return () => window.removeEventListener('mayvox:open-legal', onOpenLegal);
  }, []);

  useEffect(() => {
    const onOpenAdmin = (event: Event) => {
      if (!isAdmin) return;
      const target = (event as CustomEvent<{ target?: 'users' | 'servers' | 'invite-codes' | 'invite-requests' | 'user-filters' | 'user-search' }>).detail?.target ?? 'users';
      setActiveTab('admin');
      setAdminSub(target === 'servers' && showServersSub ? 'servers' : 'users');
      window.setTimeout(() => {
        if (target === 'invite-codes' || target === 'invite-requests') {
          window.dispatchEvent(new CustomEvent('mayvox:open-admin-action', { detail: { action: target } }));
        }
        if (target === 'user-filters' || target === 'user-search') {
          window.dispatchEvent(new CustomEvent('mayvox:admin-users-action', { detail: { action: target } }));
        }
      }, 140);
    };
    window.addEventListener('mayvox:open-admin', onOpenAdmin);
    return () => window.removeEventListener('mayvox:open-admin', onOpenAdmin);
  }, [isAdmin, showServersSub]);

  const effectiveSub: AdminSubTab = adminSub === 'servers' && !showServersSub ? 'users' : adminSub;
  const effectiveTab: MainTab = activeTab === 'admin' && !isAdmin ? 'account' : activeTab;

  // Platform-conditional sections — empty render engelleme
  const showPermissions = isCapacitor();
  const showVoiceMode = isMobile();
  const tabletSettingsLayout = isCapacitor();

  const mainTabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }> = [
    { key: 'account', icon: <UserIcon size={13} strokeWidth={2} />, label: 'Hesap' },
    { key: 'app', icon: <Palette size={13} strokeWidth={2} />, label: 'Uygulama' },
    { key: 'appearance', icon: <Layers size={13} strokeWidth={2} />, label: 'Görünüm' },
    { key: 'shortcuts', icon: <Keyboard size={13} strokeWidth={2} />, label: 'Kısayollar' },
    ...(isAdmin ? [{ key: 'admin' as MainTab, icon: <ShieldCheck size={13} strokeWidth={2} />, label: 'Yönetim' }] : []),
  ];
  const tabLabelByKey = useMemo(() => new Map(mainTabs.map(tab => [tab.key, tab.label])), [mainTabs]);
  const normalizedSettingsSearchQuery = normalizeSettingsSearch(settingsSearchQuery);
  const settingsSearchResults = useMemo(() => {
    if (!normalizedSettingsSearchQuery) return [];
    return SETTINGS_SEARCH_ITEMS
      .filter(item => !item.adminOnly || isAdmin)
      .filter(item => {
        const haystack = normalizeSettingsSearch([
          item.title,
          item.description,
          tabLabelByKey.get(item.tab) ?? '',
          ...item.keywords,
        ].join(' '));
        return haystack.includes(normalizedSettingsSearchQuery);
      });
  }, [isAdmin, normalizedSettingsSearchQuery, tabLabelByKey]);

  const openSearchResult = (item: SettingsSearchItem) => {
    setActiveTab(item.tab);
    if (item.tab === 'admin') setAdminSub('users');
    setSettingsSearchQuery('');
    if (!item.targetSectionId) return;
    window.setTimeout(() => {
      const el = document.querySelector(`[data-command-target="${item.targetSectionId}"]`);
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('command-target-pulse');
      void el.offsetWidth;
      el.classList.add('command-target-pulse');
      window.setTimeout(() => el.classList.remove('command-target-pulse'), 1800);
    }, 140);
  };

  return (
    <div className="settings-shell settings-flat-light flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">

      {/* ── Header — başlık ve segmented nav dikey hizalı, central ── */}
      <div
        className={tabletSettingsLayout ? 'z-10 shrink-0 px-3 pt-0.5' : 'shrink-0'}
        style={{
          background: tabletSettingsLayout ? 'transparent' : 'var(--settings-page-bg, var(--theme-bg))',
        }}
      >
      <div className={tabletSettingsLayout
        ? 'mx-auto flex w-full max-w-[1100px] min-w-0 flex-col gap-1 px-0 py-0.5'
        : 'mx-auto flex w-full max-w-[1100px] min-w-0 flex-col gap-4 px-2 pt-4 pb-4 md:px-4 md:pt-5 md:pb-5 xl:px-6'
      }>
        <div className={tabletSettingsLayout ? 'hidden' : 'flex items-center gap-3'}>
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-[var(--theme-accent)]" />
          </div>
          <h2 className="text-base md:text-lg font-bold text-[var(--theme-text)] tracking-[-0.01em] leading-none">Ayarlar</h2>
        </div>
        <SegmentedTabs
          tabs={mainTabs}
          value={effectiveTab}
          onChange={setActiveTab}
          tabletLayout={tabletSettingsLayout}
          rightSlot={(
          <div className="settings-tabs-search relative w-full md:w-[220px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/45" />
            <input
              value={settingsSearchQuery}
              onChange={(event) => setSettingsSearchQuery(event.target.value)}
              placeholder="Ayarlarda ara…"
              className="h-7 w-full rounded-lg border border-[var(--theme-border)]/35 bg-[rgba(var(--glass-tint),0.025)] pl-9 pr-8 text-[11.5px] font-medium text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/38 focus:border-[var(--theme-accent)]/35 focus:bg-[rgba(var(--glass-tint),0.045)] focus:shadow-[0_0_0_2px_rgba(var(--theme-accent-rgb),0.07)]"
            />
            {settingsSearchQuery && (
              <button
                type="button"
                onClick={() => setSettingsSearchQuery('')}
                className="mv-icon-button mv-interactive mv-focus-ring absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-text)]"
                style={{ '--mv-icon-button-size': '24px', '--mv-icon-size': '13px' } as React.CSSProperties}
                aria-label="Aramayı temizle"
              >
                <X size={13} />
              </button>
            )}
          </div>
          )}
        />
      </div>
      </div>

      <div
        ref={settingsScrollRef}
        className="settings-content-scrollbar min-h-0 flex-1 w-full min-w-0 overflow-y-auto overscroll-contain outline-none"
      >
      <div className={tabletSettingsLayout
        ? 'w-full min-w-0 max-w-[1100px] mx-auto overflow-x-hidden pb-[var(--mv-dock-edge-gap)] pt-3 px-3'
        : 'w-full min-w-0 max-w-[1100px] mx-auto overflow-x-hidden pb-[calc(var(--mv-content-bottom-reserve)+1rem)] pt-5 px-2 md:px-4 xl:px-6'
      }>

      {/* ── Content ── */}
      {normalizedSettingsSearchQuery ? (
        <div className="mb-5 rounded-2xl border border-[var(--theme-border)]/45 bg-[rgba(var(--glass-tint),0.025)] p-2.5">
          {settingsSearchResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {settingsSearchResults.map(result => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => openSearchResult(result)}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-[var(--theme-accent)]/20 hover:bg-[rgba(var(--theme-accent-rgb),0.055)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-[var(--theme-text)]">{result.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--theme-secondary-text)]/62">{result.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--theme-border)]/50 bg-[rgba(var(--glass-tint),0.035)] px-2 py-1 text-[9.5px] font-bold text-[var(--theme-secondary-text)]/65 group-hover:border-[var(--theme-accent)]/25 group-hover:text-[var(--theme-accent)]">
                    {tabLabelByKey.get(result.tab) ?? 'Ayarlar'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="sm"
              icon={<Search size={18} />}
              title="Sonuç bulunamadı"
              description="Farklı bir kelimeyle tekrar deneyin."
              action={
                <button
                  type="button"
                  onClick={() => setSettingsSearchQuery('')}
                  className="rounded-lg border border-[var(--theme-border)]/55 bg-[rgba(var(--glass-tint),0.035)] px-3 py-1.5 text-[10.5px] font-bold text-[var(--theme-secondary-text)]/70 transition-colors hover:border-[var(--theme-accent)]/25 hover:text-[var(--theme-accent)]"
                >
                  Aramayı temizle
                </button>
              }
            />
          )}
        </div>
      ) : null}

      {!normalizedSettingsSearchQuery && (
      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.08 } }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          {effectiveTab === 'account' && (
            <div className="settings-account-page flex flex-col gap-4">
              <SettingsSectionCard commandTarget="profile-photo" className="p-3">
                <DomainTitle icon={<UserIcon size={11} strokeWidth={2.2} />} title="Profil & Hesap" />
                <React.Suspense fallback={<SettingsLazyFallback label="Hesap ayarları yükleniyor" />}>
                  <AccountSection />
                </React.Suspense>
              </SettingsSectionCard>
              <SettingsSectionCard commandTarget="legal" className="p-3">
                <DomainTitle icon={<ShieldCheck size={11} strokeWidth={2.2} />} title="Hukuki" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <LegalCard
                    icon={<ShieldCheck size={14} strokeWidth={2} />}
                    title="KVKK Aydınlatma Metni"
                    description="Kişisel verilerin işlenmesi ve başvuru hakları"
                    onClick={() => setLegalModal('kvkk')}
                  />
                  <LegalCard
                    icon={<Database size={14} strokeWidth={2} />}
                    title="Yerel Depolama"
                    description="Çerezler, localStorage ve uygulama tercihleri"
                    onClick={() => setLegalModal('storage')}
                  />
                  <LegalCard
                    icon={<FileText size={14} strokeWidth={2} />}
                    title="Kullanım Şartları"
                    description="Hizmet kuralları ve kullanıcı sorumlulukları"
                    onClick={() => setLegalModal('terms')}
                  />
                </div>
              </SettingsSectionCard>
              {showPermissions && (
                <SettingsSectionCard>
                  <DomainTitle icon={<ShieldCheck size={11} strokeWidth={2.2} />} title="İzinler" />
                  <PermissionSection />
                </SettingsSectionCard>
              )}
            </div>
          )}

          {effectiveTab === 'app' && (
            <React.Suspense fallback={<SettingsLazyFallback label="Uygulama ayarları yükleniyor" />}>
              <div className="flex flex-col gap-5 md:gap-6">
                <div className="settings-app-desktop-main hidden xl:flex xl:flex-col gap-4 xl:gap-5">
                  {showVoiceMode && (
                    <SettingsSectionCard commandTarget="performance">
                      <DomainTitle icon={<Mic size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                      <VoiceModeSection />
                    </SettingsSectionCard>
                  )}
                  <SettingsSectionCard commandTarget="performance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <PerformanceSection />
                  </SettingsSectionCard>
                  <SettingsSectionCard commandTarget="sounds">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                    <SoundsSection />
                  </SettingsSectionCard>
                </div>

                <div className="settings-app-utility-grid hidden xl:flex xl:flex-col gap-4 xl:gap-5">
                  <AppHelpCard />
                  {isElectron() && (
                    <>
                    {isGameActivityAvailable() && <GameActivityManager />}
                    <CloseBehaviorCard />
                    </>
                  )}
                </div>

                {/* base–lg: tek kolon */}
                <div className="settings-app-mobile-stack flex flex-col gap-5 xl:hidden">
                  {showVoiceMode && (
                    <SettingsSectionCard>
                      <DomainTitle icon={<Mic size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                      <VoiceModeSection />
                    </SettingsSectionCard>
                  )}
                  <SettingsSectionCard commandTarget="performance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <PerformanceSection />
                  </SettingsSectionCard>
                  <SettingsSectionCard commandTarget="sounds">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                    <SoundsSection />
                  </SettingsSectionCard>
                  <AppHelpCard />
                  {isElectron() && isGameActivityAvailable() && (
                    <GameActivityManager />
                  )}
                  {isElectron() && <CloseBehaviorCard />}
                </div>
              </div>
            </React.Suspense>
          )}

          {effectiveTab === 'appearance' && (
            <React.Suspense fallback={<SettingsLazyFallback label="Görünüm ayarları yükleniyor" />}>
              <div className="flex flex-col gap-5 md:gap-6">
                <div className="hidden xl:grid xl:grid-cols-2 gap-4 xl:gap-5">
                  <SettingsSectionCard className="flex flex-col h-full" commandTarget="appearance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                    <div className="flex-1 flex flex-col">
                      <AppearanceSection />
                    </div>
                  </SettingsSectionCard>
                  {isElectron() && (
                    <SettingsSectionCard className="flex flex-col h-full" commandTarget="voice-overlay">
                      <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                      <div className="flex-1 flex flex-col">
                        <VoiceOverlayCard />
                      </div>
                    </SettingsSectionCard>
                  )}
                </div>

                <div className="flex flex-col gap-5 xl:hidden">
                  <SettingsSectionCard commandTarget="appearance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                    <AppearanceSection />
                  </SettingsSectionCard>
                  {isElectron() && (
                    <SettingsSectionCard commandTarget="voice-overlay">
                      <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                      <VoiceOverlayCard />
                    </SettingsSectionCard>
                  )}
                </div>
              </div>
            </React.Suspense>
          )}

          {effectiveTab === 'shortcuts' && (
            <div data-command-target="shortcuts" className="scroll-mt-5">
              <React.Suspense fallback={<SettingsLazyFallback label="Kısayollar yükleniyor" />}>
                <ShortcutsCard />
              </React.Suspense>
            </div>
          )}

          {effectiveTab === 'admin' && isAdmin && (
            <SettingsSectionCard className="space-y-5">
              <DomainTitle
                icon={<ShieldCheck size={11} strokeWidth={2.2} />}
                title={`Yönetim · ${effectiveSub === 'users' ? 'Kullanıcılar' : 'Sunucular'}`}
              />

              {(() => {
                const subTabs: { key: AdminSubTab; icon: React.ReactNode; label: string; visible: boolean }[] = [
                  { key: 'users', icon: <Users size={12} />, label: 'Kullanıcılar', visible: true },
                  { key: 'servers', icon: <Server size={12} />, label: 'Sunucular', visible: showServersSub },
                ];
                const visible = subTabs.filter(t => t.visible);
                return (
                  <div className={`admin-subtabs grid gap-1 p-1 rounded-xl ${visible.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {visible.map(tab => {
                      const isActive = effectiveSub === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setAdminSub(tab.key)}
                          className={`admin-subtab flex items-center gap-1.5 justify-center min-w-0 py-1.5 rounded-lg text-[11px] md:text-[12px] font-semibold truncate ${
                            isActive
                              ? 'admin-subtab-active'
                              : 'admin-subtab-idle'
                          }`}
                        >
                          {tab.icon}
                          <span className="truncate">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {effectiveSub === 'users' && (
                <React.Suspense fallback={<SettingsLazyFallback label="Yönetim yükleniyor" />}>
                  <div className="space-y-5">
                    <AdminActionBar />
                    {currentUser.isPrimaryAdmin ? <ManagementUsersPanel /> : <AdminUserManagement />}
                  </div>
                </React.Suspense>
              )}

              {effectiveSub === 'servers' && showServersSub && (
                <React.Suspense fallback={<SettingsLazyFallback label="Sunucular yükleniyor" />}>
                  <SystemServersPanel />
                </React.Suspense>
              )}
            </SettingsSectionCard>
          )}
        </motion.div>
      </AnimatePresence>
      )}

      <LegalModal
        kind={legalModal ?? 'kvkk'}
        open={legalModal !== null}
        onClose={() => setLegalModal(null)}
      />

    </div>
    </div>
    </div>
  );
}
