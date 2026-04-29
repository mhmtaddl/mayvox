import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Eye, Gamepad2, Layers, Mic, MousePointer2, Droplet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { isCapacitor, isMobile, isElectron } from '../lib/platform';
import { getPublicDisplayName } from '../lib/formatName';
import { Toggle } from '../components/settings/shared';
import { isGameActivityAvailable } from '../features/game-activity/useGameActivity';
import { rangeVisualStyle } from '../lib/rangeStyle';

// ── Components ──
import AccountSection from '../components/settings/sections/AccountSection';
import { AppearanceSection, SoundsSection, PerformanceSection, VoiceModeSection } from '../components/settings/sections/SettingsSections';
import AdminUserManagement from '../components/settings/sections/AdminUserManagement';
import AdminActionBar from '../components/settings/sections/AdminActionBar';
import PermissionSection from '../components/settings/sections/PermissionSection';
import SystemServersPanel from '../components/settings/sections/SystemServersPanel';
import ManagementUsersPanel from '../components/settings/sections/ManagementUsersPanel';

type MainTab = 'account' | 'app' | 'admin';
type AdminSubTab = 'users' | 'servers';

// Premium segmented control — motion layoutId ile active pill smooth kayar
function SegmentedTabs({ tabs, value, onChange }: {
  tabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }>;
  value: MainTab;
  onChange: (v: MainTab) => void;
}) {
  return (
    <div className="settings-tabs surface-card inline-flex p-1 rounded-xl">
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

function SettingsSectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`settings-section-card min-w-0 rounded-2xl p-3 md:p-4 ${className}`}>
      {children}
    </section>
  );
}

// Son görülme inline toggle kartı — Hesap sekmesi için
function LastSeenCard() {
  const { showLastSeen, setShowLastSeen } = useSettings();
  return (
    <div
      className="settings-account-card surface-card flex items-center gap-3 px-4 py-3 rounded-xl"
    >
      <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
        <Eye size={14} className="text-[var(--theme-accent)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--theme-text)] leading-tight">Son Görülme</p>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 leading-snug">
          Kapalıyken arkadaşların seni en son ne zaman gördüğünü göremez.
        </p>
      </div>
      <Toggle checked={showLastSeen} onChange={() => setShowLastSeen(!showLastSeen)} />
    </div>
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
    <div className="settings-account-card surface-card flex items-center gap-3 px-4 py-3 rounded-xl">
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

export default function SettingsView() {
  const { currentUser } = useUser();
  const { settingsTarget, setSettingsTarget, setToastMsg } = useUI();
  const isAdmin = !!currentUser.isAdmin;
  const [activeTab, setActiveTab] = useState<MainTab>('account');
  const [adminSub, setAdminSub] = useState<AdminSubTab>('users');

  // Deep-link intent — bildirim tıklamasından / dock ikonundan gelen hedef
  // tab'ına otomatik geçer. 'invite_requests' AdminActionBar'da ek iş yapıyor;
  // 'app' / 'account' sadece tab seçer, sonra temizlenir.
  useEffect(() => {
    if (!settingsTarget) return;
    if (settingsTarget === 'invite_requests' && isAdmin) {
      setActiveTab('admin');
      setAdminSub('users');
      // temizlik AdminActionBar'da
    } else if (settingsTarget === 'app') {
      setActiveTab('app');
      setSettingsTarget(null);
    } else if (settingsTarget === 'account') {
      setActiveTab('account');
      setSettingsTarget(null);
    }
  }, [settingsTarget, isAdmin, setSettingsTarget]);

  const showServersSub = !!currentUser.isPrimaryAdmin;
  const effectiveSub: AdminSubTab = adminSub === 'servers' && !showServersSub ? 'users' : adminSub;
  const effectiveTab: MainTab = activeTab === 'admin' && !isAdmin ? 'account' : activeTab;

  // Platform-conditional sections — empty render engelleme
  const showPermissions = isCapacitor();
  const showVoiceMode = isMobile();

  const mainTabs: Array<{ key: MainTab; icon: React.ReactNode; label: string }> = [
    { key: 'account', icon: <UserIcon size={13} strokeWidth={2} />, label: 'Hesap' },
    { key: 'app', icon: <Palette size={13} strokeWidth={2} />, label: 'Uygulama' },
    ...(isAdmin ? [{ key: 'admin' as MainTab, icon: <ShieldCheck size={13} strokeWidth={2} />, label: 'Yönetim' }] : []),
  ];

  return (
    <div className="settings-flat-light w-full min-w-0 max-w-[1100px] mx-auto overflow-x-hidden pb-28 px-2 md:px-4 xl:px-6">

      {/* ── Header — başlık ve segmented nav dikey hizalı, central ── */}
      <div className="flex flex-col gap-4 pt-4 pb-5 md:pt-6 md:pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-[var(--theme-accent)]" />
          </div>
          <h2 className="text-base md:text-lg font-bold text-[var(--theme-text)] tracking-[-0.01em] leading-none">Ayarlar</h2>
        </div>
        <SegmentedTabs tabs={mainTabs} value={effectiveTab} onChange={setActiveTab} />
      </div>

      {/* ── Content ── */}
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
              <SettingsSectionCard>
                <DomainTitle icon={<UserIcon size={11} strokeWidth={2.2} />} title="Profil & Hesap" />
                <AccountSection />
              </SettingsSectionCard>
              <SettingsSectionCard>
                <DomainTitle icon={<Eye size={11} strokeWidth={2.2} />} title="Gizlilik" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <LastSeenCard />
                  {isElectron() && isGameActivityAvailable() && <GameActivityCard />}
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
                <SettingsSectionCard className="flex flex-col h-full">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <div className="flex-1 flex flex-col">
                    <AppearanceSection />
                  </div>
                </SettingsSectionCard>
                {isElectron() ? (
                  <SettingsSectionCard className="flex flex-col h-full">
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

                <SettingsSectionCard className="self-start">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </SettingsSectionCard>
                {showVoiceMode && (
                  <SettingsSectionCard>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </SettingsSectionCard>
                )}
                {isElectron() && (
                  <SettingsSectionCard>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                    <PerformanceSection />
                  </SettingsSectionCard>
                )}
              </div>

              {/* base–lg: tek kolon */}
              <div className="flex flex-col gap-5 xl:hidden">
                <SettingsSectionCard>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <AppearanceSection />
                </SettingsSectionCard>
                <SettingsSectionCard>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </SettingsSectionCard>
                {isElectron() && (
                  <SettingsSectionCard>
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <VoiceOverlayCard />
                  </SettingsSectionCard>
                )}
                {showVoiceMode && (
                  <SettingsSectionCard>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </SettingsSectionCard>
                )}
                <SettingsSectionCard>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                  <PerformanceSection />
                </SettingsSectionCard>
              </div>
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

    </div>
  );
}
