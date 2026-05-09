import React, { useEffect, useMemo, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Gamepad2, Layers, Mic, MousePointer2, Droplet, FileText, Database, Keyboard, RotateCcw, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { isCapacitor, isMobile, isElectron } from '../lib/platform';
import { getPublicDisplayName } from '../lib/formatName';
import { Toggle } from '../components/settings/shared';
import { isGameActivityAvailable } from '../features/game-activity/useGameActivity';
import { rangeVisualStyle } from '../lib/rangeStyle';
import {
  formatCommandShortcut,
  isReservedShortcut,
  readAppShortcuts,
  resetAppShortcut,
  saveAppShortcut,
  shortcutFromEvent,
  type AppShortcuts,
  type CommandShortcut,
  type OptionalCommandShortcut,
  type ShortcutActionId,
} from '../lib/commandShortcut';

// ── Components ──
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, PerformanceSection, VoiceModeSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import AdminActionBar from '../components/settings/sections/AdminActionBar';
import PermissionSection from '../components/settings/sections/PermissionSection';
import SystemServersPanel from '../components/settings/sections/SystemServersPanel';
import ManagementUsersPanel from '../components/settings/sections/ManagementUsersPanel';
import LegalModal, { type LegalModalKind } from '../components/legal/LegalModal';

type MainTab = 'account' | 'app' | 'shortcuts' | 'admin';
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
    tab: 'app',
    title: 'Görünüm yoğunluğu',
    description: 'Rahat ve kompakt görünüm modu.',
    keywords: ['görünüm', 'gorunum', 'kompakt', 'rahat', 'density', 'ui', 'arayüz', 'arayuz'],
    targetSectionId: 'appearance',
  },
  {
    id: 'font-size',
    tab: 'app',
    title: 'Yazı boyutu',
    description: 'Uygulama içindeki metinlerin okunabilirliğini ayarlar.',
    keywords: ['yazı', 'yazi', 'font', 'metin', 'büyüt', 'buyut', 'küçült', 'kucult', 'text'],
    targetSectionId: 'appearance',
  },
  {
    id: 'dock-size',
    tab: 'app',
    title: 'Alt kontrol çubuğu boyutu',
    description: 'Alt dock avatar, buton ve boşluk boyutunu ayarlar.',
    keywords: ['dock', 'alt bar', 'alt kontrol', 'kontrol çubuğu', 'kontrol cubugu', 'buton', 'boyut'],
    targetSectionId: 'appearance',
  },
  {
    id: 'theme-packs',
    tab: 'app',
    title: 'Tema paketleri',
    description: 'Renk, açık/koyu görünüm ve tema paketleri.',
    keywords: ['tema', 'renk', 'appearance', 'dark', 'light', 'açık', 'acik', 'koyu'],
    targetSectionId: 'appearance',
  },
  {
    id: 'overlay',
    tab: 'app',
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
function SegmentedTabs({ tabs, value, onChange, rightSlot }: {
  tabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }>;
  value: MainTab;
  onChange: (v: MainTab) => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="settings-tabs surface-card flex w-full flex-col gap-2 p-1 rounded-xl md:flex-row md:items-center md:justify-between">
      <div className="inline-flex min-w-0 flex-wrap">
        {tabs.map(tab => {
          const active = value === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`settings-tab ${active ? 'active' : ''} relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-[-0.005em] transition-colors duration-150 z-10 whitespace-nowrap`}
            >
              {active && (
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
              <span className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/80'}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      {rightSlot}
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
      className={`settings-section-card min-w-0 rounded-2xl p-3 md:p-4 ${className}`}
    >
      {children}
    </section>
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
      className="settings-account-card surface-card flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]/85">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-tight text-[var(--theme-text)]">{title}</p>
        <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--theme-secondary-text)]/60">{description}</p>
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
  const ASPECT = '232 / 164';
  const pad = 14;
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
      className="flex flex-col gap-1.5 w-full min-w-0"
    >
      {/* KONUM başlığı — picker'ın dışında üst-orta (Stil/Boyut/Şeffaflık ile aynı stil) */}
      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Konum</div>

      <div
        className="relative rounded-xl overflow-hidden w-full"
        style={{
          aspectRatio: ASPECT,
          minHeight: 150,
          maxHeight: 240,
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
            backgroundSize: '16px 16px',
            maskImage: 'radial-gradient(ellipse at center, black 55%, transparent 95%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 55%, transparent 95%)',
          }}
        />
        {/* Accent aura */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 15% 25%, rgba(var(--theme-accent-rgb), 0.10), transparent 55%)',
          }}
        />

        <style>{`
          .anchor-hit:hover .anchor-dot { transform: scale(1.6); background: var(--overlay-picker-dot-hover, rgba(var(--theme-accent-rgb), 0.55)); }
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
                    width: 5, height: 5, borderRadius: '50%',
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
              fontSize: 'clamp(10px, 8cqw, 13px)',
              color: 'var(--overlay-picker-label, rgba(255,255,255,0.95))',
              textShadow: 'var(--overlay-picker-label-shadow, 0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.55))',
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
    small: { avatar: 16, name: 8, gap: 4 },
    medium: { avatar: 20, name: 9, gap: 5 },
    large: { avatar: 24, name: 10, gap: 6 },
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
        maxWidth: size === 'large' ? 78 : 66,
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
    maxWidth: 128,
  };

  if (variant === 'card') {
    return (
      <span style={{ ...common, background: cardBg, border: cardBorder, borderRadius: Math.round(cfg.avatar * 0.42), padding: '4px 7px', boxShadow: cardShadow }}>
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
            padding: '3px 8px 3px 3px',
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
    <span style={{ ...common, background: cardBg, border: cardBorder, borderRadius: Math.round(cfg.avatar * 0.42), padding: '3px 8px 3px 3px', boxShadow: cardShadow }}>
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
          gap: 12px;
          align-items: stretch;
        }
        @container (min-width: 500px) {
          .vox-body {
            grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
            gap: 16px;
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
            <span
              className="settings-overlay-platform-badge text-[8.5px] font-bold uppercase tracking-[0.14em] px-1.5 py-[2px] rounded leading-none"
              style={{
                color: 'var(--theme-secondary-text)',
                background: 'rgba(var(--glass-tint), 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint), 0.08)',
              }}
            >
              Masaüstü
            </span>
          </div>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-1 leading-snug">
            Ses odasındaki üyeleri oyun üstünde küçük bir panelde göster.
          </p>
        </div>
        <div className="pt-0.5">
          <Toggle checked={overlayEnabled} onChange={() => setOverlayEnabled(!overlayEnabled)} />
        </div>
      </div>

      {/* Body — iki satır:
          1) Üst satır (wrap): konum picker (sol, sabit 232px) + boyut (sağ, flex-1, dikey ortalı)
          2) Alt satır: toggles full-width (konum altından sağa uzar)
          Küçük pencerede üst satır flex-wrap ile stack'e düşer; birbirine girmez. */}
      <div
        className="mt-4 flex flex-col gap-3"
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
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Stil</div>
              <OverlayVariantSegmented value={overlayVariant} onChange={setOverlayVariant} disabled={off} disabledReason={overlayDisabledReason} onDisabledClick={showOverlayDisabledFeedback} />
            </div>

            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Boyut</div>
              <OverlaySizeSegmented value={overlaySize} onChange={setOverlaySize} disabled={off} disabledReason={overlayDisabledReason} onDisabledClick={showOverlayDisabledFeedback} />
            </div>

            {/* Kart şeffaflık — tek slider, sabit koyu renk. Overlay'de isim
                arkasındaki kartın + avatar/isim görünürlüğünün ortak ayarı. */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-0.5">
                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55">
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
          className="rounded-xl px-3 py-0.5 w-full"
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
          <div style={{ height: 1, background: 'rgba(var(--glass-tint), 0.05)', marginLeft: 34 }} />
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
          <div style={{ height: 1, background: 'rgba(var(--glass-tint), 0.05)', marginLeft: 34 }} />
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
          <div style={{ height: 1, background: 'rgba(var(--glass-tint), 0.05)', marginLeft: 34 }} />
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
    <div data-command-target="game-activity" className="settings-account-card surface-card flex items-center gap-3 px-4 py-3 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
        <Gamepad2 size={14} className="text-[var(--theme-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Otomatik Oyun Algılama</p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
          Açık oyunları algılayıp durum olarak gösterebilir. Sadece desteklenen oyunlar için; veriler cihazında kalır.
        </p>
      </div>
      <Toggle checked={gameActivityEnabled} onChange={() => setGameActivityEnabled(!gameActivityEnabled)} />
    </div>
  );
}

const SHORTCUT_ROWS: Array<{ id: ShortcutActionId; title: string; description: string; group: 'Genel' | 'Sesli Sohbet' | 'Navigasyon' | 'Mesajlaşma' }> = [
  { id: 'command-palette', title: 'Komut Paleti', description: 'Kullanıcı, oda, mesaj, sunucu ve ayarları hızlıca bul.', group: 'Genel' },
  { id: 'toggle-mute', title: 'Mikrofon Aç-Kapat', description: 'Mikrofonu hızlıca kapat veya geri aç.', group: 'Sesli Sohbet' },
  { id: 'toggle-deafen', title: 'Hoparlör / Kulaklık Aç-Kapat', description: 'Uygulama sesini hızlıca kapat veya geri aç.', group: 'Sesli Sohbet' },
  { id: 'user-search', title: 'Kullanıcı Ara', description: 'Sağ üstteki kullanıcı aramasına odaklan.', group: 'Genel' },
  { id: 'open-settings', title: 'Ayarları Aç', description: 'Uygulama ayarlarını aç.', group: 'Genel' },
  { id: 'open-shortcuts', title: 'Kısayolları Aç', description: 'Kısayollar sekmesine hızlıca git.', group: 'Genel' },
  { id: 'open-server-settings', title: 'Sunucu Ayarları', description: 'Yetkin varsa aktif sunucunun ayarlarını aç.', group: 'Navigasyon' },
  { id: 'toggle-room', title: 'Son Odaya Katıl / Odadan Ayrıl', description: 'Odadaysan ayrıl, değilsen son odaya geri dön.', group: 'Sesli Sohbet' },
  { id: 'toggle-room-chat-muted', title: 'Aktif Odayı Sessize Al', description: 'Aktif odanın yazılı sohbet sesini kapat veya aç.', group: 'Sesli Sohbet' },
  { id: 'toggle-room-members', title: 'Odadaki Kullanıcıları Göster/Gizle', description: 'Oda içi kullanıcı görünümünü aç veya kapat.', group: 'Sesli Sohbet' },
  { id: 'open-discover', title: 'Topluluk Keşfet Aç', description: 'Topluluk keşfet sayfasına git.', group: 'Navigasyon' },
  { id: 'open-server-home', title: 'Aktif Sunucu Ana Sayfasına Git', description: 'Aktif sunucunun ana sayfasını aç.', group: 'Navigasyon' },
  { id: 'open-admin', title: 'Yönetim Panelini Aç', description: 'Sadece adminlerde yönetim paneline gider.', group: 'Navigasyon' },
  { id: 'previous-server', title: 'Önceki Sunucuya Geç', description: 'Sunucu listesindeki önceki sunucuya geç.', group: 'Navigasyon' },
  { id: 'next-server', title: 'Sonraki Sunucuya Geç', description: 'Sunucu listesindeki sonraki sunucuya geç.', group: 'Navigasyon' },
  { id: 'previous-room', title: 'Önceki Odaya Geç', description: 'Aktif sunucudaki önceki ses odasına geç.', group: 'Navigasyon' },
  { id: 'next-room', title: 'Sonraki Odaya Geç', description: 'Aktif sunucudaki sonraki ses odasına geç.', group: 'Navigasyon' },
  { id: 'open-unread-dm', title: 'Okunmamış İlk DM’ye Git', description: 'Mesaj panelini okunmamış konuşmaya odaklanacak şekilde aç.', group: 'Mesajlaşma' },
  { id: 'close-dm', title: 'Aktif DM’yi Kapat', description: 'Açık mesaj panelini kapat.', group: 'Mesajlaşma' },
];

function shortcutEquals(a: OptionalCommandShortcut, b: CommandShortcut) {
  if (!a) return false;
  return a.ctrl === b.ctrl
    && a.alt === b.alt
    && a.shift === b.shift
    && a.meta === b.meta
    && a.key.toLocaleLowerCase('tr') === b.key.toLocaleLowerCase('tr');
}

function ShortcutsCard() {
  const { currentUser } = useUser();
  const [shortcuts, setShortcuts] = useState<AppShortcuts>(() => readAppShortcuts());
  const [recording, setRecording] = useState<ShortcutActionId | null>(null);
  const [error, setError] = useState('');
  const [errorTarget, setErrorTarget] = useState<ShortcutActionId | null>(null);
  const canUseAdminShortcuts = !!currentUser.isAdmin || !!currentUser.isPrimaryAdmin;
  const visibleRows = SHORTCUT_ROWS.filter(row => row.id !== 'open-admin' || canUseAdminShortcuts);
  const shortcutGroups: Array<typeof SHORTCUT_ROWS[number]['group']> = ['Genel', 'Sesli Sohbet', 'Navigasyon', 'Mesajlaşma'];
  const groupStyles: Record<typeof SHORTCUT_ROWS[number]['group'], { border: string; background: string; text: string }> = {
    Genel: { border: 'rgba(96, 165, 250, 0.22)', background: 'rgba(96, 165, 250, 0.045)', text: 'rgb(147, 197, 253)' },
    'Sesli Sohbet': { border: 'rgba(52, 211, 153, 0.22)', background: 'rgba(52, 211, 153, 0.045)', text: 'rgb(110, 231, 183)' },
    Navigasyon: { border: 'rgba(251, 191, 36, 0.22)', background: 'rgba(251, 191, 36, 0.045)', text: 'rgb(252, 211, 77)' },
    'Mesajlaşma': { border: 'rgba(244, 114, 182, 0.22)', background: 'rgba(244, 114, 182, 0.045)', text: 'rgb(249, 168, 212)' },
  };

  const shortcutWarning = (shortcut: AppShortcuts[ShortcutActionId]) => {
    if (!shortcut) return '';
    const key = shortcut.key.toLocaleLowerCase('tr');
    const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
    if (ctrlOrMeta && ['a', 'c', 'f', 'n', 'p', 's', 'v', 'x', 'y', 'z'].includes(key)) {
      return 'Windows/tarayıcı kısayoluyla çakışabilir.';
    }
    if (shortcut.alt && key === 'f4') return 'Windows kapatma kısayoluyla çakışabilir.';
    return '';
  };

  useEffect(() => {
    const onChanged = () => setShortcuts(readAppShortcuts());
    window.addEventListener('mayvox:app-shortcuts-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('mayvox:app-shortcuts-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        setError('');
        setErrorTarget(null);
        return;
      }
      const next = shortcutFromEvent(event);
      if (!next) {
        setError('Ctrl, Alt, Cmd veya Shift ile birlikte bir tuşa bas.');
        setErrorTarget(recording);
        return;
      }
      if (isReservedShortcut(next)) {
        setError('Bu kısayol sistem/tarayıcı işlemiyle çakışıyor.');
        setErrorTarget(recording);
        return;
      }
      const duplicate = SHORTCUT_ROWS.find(row => row.id !== recording && shortcutEquals(shortcuts[row.id], next));
      if (duplicate) {
        setError(`Bu kombinasyon "${duplicate.title}" için kullanılıyor.`);
        setErrorTarget(recording);
        return;
      }
      saveAppShortcut(recording, next);
      setShortcuts(prev => ({ ...prev, [recording]: next }));
      setRecording(null);
      setError('');
      setErrorTarget(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, shortcuts]);

  return (
    <div data-command-target="shortcuts" className="settings-shortcuts-card settings-account-card surface-card rounded-xl px-4 py-3">
      <div className="space-y-4">
        {shortcutGroups.map(group => {
          const rows = visibleRows.filter(row => row.group === group);
          if (!rows.length) return null;
          const style = groupStyles[group];
          return (
            <div
              key={group}
              className="rounded-xl border px-3 py-2.5"
              style={{ borderColor: style.border, background: style.background }}
            >
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: style.text }}>{group}</p>
              <div className="divide-y divide-[var(--theme-border)]/35">
                {rows.map(row => {
                  const isRecording = recording === row.id;
                  const hasShortcut = !!shortcuts[row.id];
                  const warning = shortcutWarning(shortcuts[row.id]);
                  return (
                    <div key={row.id} className="relative flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-[var(--theme-text)] leading-tight">{row.title}</p>
                        <p className="text-[10px] text-[var(--theme-secondary-text)]/58 mt-0.5 leading-snug">{row.description}</p>
                        {warning && <p className="mt-1 text-[9.5px] font-semibold text-amber-300/70">{warning}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = resetAppShortcut(row.id);
                          setShortcuts(prev => ({ ...prev, [row.id]: next }));
                          setRecording(null);
                          setError('');
                          setErrorTarget(null);
                        }}
                        className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/55 bg-transparent"
                        title="Varsayılana dön"
                        aria-label={`${row.title} varsayılana dön`}
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRecording(row.id); setError(''); setErrorTarget(null); }}
                        className={`min-w-[92px] h-8 shrink-0 rounded-lg border px-2.5 text-[10.5px] font-bold transition-colors ${
                          isRecording
                            ? 'border-[rgba(var(--theme-accent-rgb),0.42)] bg-[rgba(var(--theme-accent-rgb),0.12)] text-[var(--theme-accent)]'
                            : hasShortcut
                              ? 'border-[rgba(var(--theme-accent-rgb),0.32)] bg-[rgba(var(--theme-accent-rgb),0.075)] text-[var(--theme-text)]/90'
                              : 'border-dashed border-[var(--theme-border)]/55 bg-transparent text-[var(--theme-secondary-text)]/42'
                        }`}
                        title="Kısayolu değiştirmek için tıkla"
                      >
                        {isRecording ? 'Tuşa bas...' : formatCommandShortcut(shortcuts[row.id])}
                      </button>
                      {error && errorTarget === row.id && (
                        <div className="absolute right-0 top-[-18px] z-20 rounded-lg border border-red-400/25 bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-200 shadow-[0_10px_22px_rgba(0,0,0,0.20)] backdrop-blur-md">
                          {error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsView() {
  const { currentUser } = useUser();
  const { settingsTarget, setSettingsTarget } = useUI();
  const isAdmin = !!currentUser.isAdmin || !!currentUser.isPrimaryAdmin;
  const [activeTab, setActiveTab] = useState<MainTab>('account');
  const [adminSub, setAdminSub] = useState<AdminSubTab>('users');
  const [legalModal, setLegalModal] = useState<LegalModalKind | null>(null);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const showServersSub = !!currentUser.isPrimaryAdmin;

  // Deep-link intent — bildirim tıklamasından / dock ikonundan gelen hedef
  // tab'ına otomatik geçer. 'invite_requests' AdminActionBar'da ek iş yapıyor;
  // 'app' / 'account' sadece tab seçer, sonra temizlenir.
  useEffect(() => {
    if (!settingsTarget) return;
    if (settingsTarget === 'invite_requests' && isAdmin) {
      setActiveTab('admin');
      setAdminSub('users');
      // temizlik AdminActionBar'da
    } else if (settingsTarget === 'app' || settingsTarget === 'shortcuts') {
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

  const mainTabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }> = [
    { key: 'account', icon: <UserIcon size={13} strokeWidth={2} />, label: 'Hesap' },
    { key: 'app', icon: <Palette size={13} strokeWidth={2} />, label: 'Uygulama' },
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
    <div className="settings-flat-light w-full min-w-0 max-w-[1100px] mx-auto overflow-x-hidden pb-[var(--mv-dock-edge-gap)] px-2 md:px-4 xl:px-6">

      {/* ── Header — başlık ve segmented nav dikey hizalı, central ── */}
      <div className="flex flex-col gap-4 pt-4 pb-5 md:pt-6 md:pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-[var(--theme-accent)]" />
          </div>
          <h2 className="text-base md:text-lg font-bold text-[var(--theme-text)] tracking-[-0.01em] leading-none">Ayarlar</h2>
        </div>
        <SegmentedTabs
          tabs={mainTabs}
          value={effectiveTab}
          onChange={setActiveTab}
          rightSlot={(
          <div className="relative w-full md:w-[220px]">
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
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]"
                aria-label="Aramayı temizle"
              >
                <X size={13} />
              </button>
            )}
          </div>
          )}
        />
      </div>

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
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <p className="text-[12px] font-bold text-[var(--theme-text)]/80">Sonuç bulunamadı</p>
              <p className="mt-1 text-[10.5px] text-[var(--theme-secondary-text)]/55">Farklı bir kelime deneyin.</p>
            </div>
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
            <div className="flex flex-col gap-5 md:gap-6">
              <SettingsSectionCard commandTarget="profile-photo">
                <DomainTitle icon={<UserIcon size={11} strokeWidth={2.2} />} title="Profil & Hesap" />
                <AccountSection />
              </SettingsSectionCard>
              <SettingsSectionCard commandTarget="legal">
                <DomainTitle icon={<ShieldCheck size={11} strokeWidth={2.2} />} title="Hukuki" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div className="flex flex-col gap-5 md:gap-6">
              {/* Row-by-row grid: Görünüm + Oyun İçi Göstergeler aynı satırda, grid stretch ile
                  yükseklikleri otomatik eşit. AppearanceSection (Tema Paketleri) içeriği
                  küçük olsa da kart yan kartın yüksekliğine kadar uzar. */}
              <div className="hidden xl:grid xl:grid-cols-2 gap-4 xl:gap-5">
                <SettingsSectionCard className="flex flex-col h-full" commandTarget="appearance">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <div className="flex-1 flex flex-col">
                    <AppearanceSection />
                  </div>
                </SettingsSectionCard>
                {isElectron() ? (
                  <SettingsSectionCard className="flex flex-col h-full" commandTarget="voice-overlay">
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <div className="flex-1 flex flex-col">
                      <VoiceOverlayCard />
                    </div>
                  </SettingsSectionCard>
                ) : (
                  <SettingsSectionCard className="flex flex-col h-full">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <div className="flex-1 flex flex-col">
                      <PerformanceSection />
                    </div>
                  </SettingsSectionCard>
                )}

                {isElectron() && (
                  <SettingsSectionCard commandTarget="performance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <PerformanceSection />
                  </SettingsSectionCard>
                )}

                <SettingsSectionCard className="self-start" commandTarget="sounds">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </SettingsSectionCard>
                {showVoiceMode && (
                  <SettingsSectionCard commandTarget="performance">
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </SettingsSectionCard>
                )}
                {isElectron() && isGameActivityAvailable() && (
                  <SettingsSectionCard commandTarget="game-activity">
                    <DomainTitle icon={<Gamepad2 size={11} strokeWidth={2.2} />} title="Oyun" />
                    <GameActivityCard />
                  </SettingsSectionCard>
                )}
              </div>

              {/* base–lg: tek kolon */}
              <div className="flex flex-col gap-5 xl:hidden">
                <SettingsSectionCard commandTarget="appearance">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <AppearanceSection />
                </SettingsSectionCard>
                <SettingsSectionCard commandTarget="sounds">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </SettingsSectionCard>
                {isElectron() && (
                  <SettingsSectionCard commandTarget="voice-overlay">
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <VoiceOverlayCard />
                  </SettingsSectionCard>
                )}
                <SettingsSectionCard commandTarget="performance">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                  <PerformanceSection />
                </SettingsSectionCard>
                {isElectron() && isGameActivityAvailable() && (
                  <SettingsSectionCard commandTarget="game-activity">
                    <DomainTitle icon={<Gamepad2 size={11} strokeWidth={2.2} />} title="Oyun" />
                    <GameActivityCard />
                  </SettingsSectionCard>
                )}
                {showVoiceMode && (
                  <SettingsSectionCard>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </SettingsSectionCard>
                )}
              </div>
            </div>
          )}

          {effectiveTab === 'shortcuts' && (
            <div data-command-target="shortcuts">
              <ShortcutsCard />
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
                <div className="space-y-5">
                  <AdminActionBar />
                  {currentUser.isPrimaryAdmin ? <ManagementUsersPanel /> : <AdminUserManagement />}
                </div>
              )}

              {effectiveSub === 'servers' && showServersSub && <SystemServersPanel />}
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
  );
}
