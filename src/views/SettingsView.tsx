import React, { useEffect, useState } from 'react';
import { Settings, ShieldCheck, Users, Server, User as UserIcon, Palette, Eye, Gamepad2, Layers, Mic, MousePointer2, Droplet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { isCapacitor, isMobile, isElectron } from '../lib/platform';
import { Toggle } from '../components/settings/shared';
import { isGameActivityAvailable } from '../features/game-activity/useGameActivity';

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
    <div className="surface-card inline-flex p-1 rounded-xl">
      {tabs.map(tab => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold tracking-[-0.005em] transition-colors duration-150 z-10 whitespace-nowrap"
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
            <span className={active ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/80'}>
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
      <span className="text-[var(--theme-accent)]/70">{icon}</span>
      <h3 className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-text)]/85">{title}</h3>
    </div>
  );
}

// Son görülme inline toggle kartı — Hesap sekmesi için
function LastSeenCard() {
  const { showLastSeen, setShowLastSeen } = useSettings();
  return (
    <div
      className="surface-card flex items-center gap-3 px-4 py-3 rounded-xl"
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

function OverlayPositionPicker({ value, onChange, disabled }: {
  value: OverlayAnchor;
  onChange: (v: OverlayAnchor) => void;
  disabled?: boolean;
}) {
  // Responsive: küçük pencerede 180px'e iner, büyük pencerede 360px'e kadar genişler.
  // Parent flex-wrap olduğu için küçük pencerede picker tek satır, sağ blok alt satıra
  // wrap olur → Stil 4-buton tam genişlikte rahat sığar.
  const MAX_W = 360, MIN_W = 180;
  const ASPECT = '232 / 164';
  const pad = 14;
  const HIT = 24;
  const activeLabel = ANCHOR_POINTS.find(p => p.v === value)?.label ?? '';

  // Picker zemini her temada koyu — gerçek bir oyun ekranı simulasyonu (oyunlar genelde
  // koyu) ve beyaz anchor dot'ları her temada görünür kalır. Açık tema seçildiğinde de
  // bg değişmez; dot'lar her zaman beyaz kontrast sağlar. Accent tint hafif ton verir.
  const bg = 'linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.14) 0%, rgba(var(--theme-accent-rgb), 0.04) 100%), linear-gradient(180deg, #0f1522 0%, #080b14 100%)';
  const gridColor = 'rgba(255,255,255,0.028)';
  const vignette = 'inset 0 0 60px rgba(0,0,0,0.55)';
  const ringColor = 'rgba(var(--glass-tint), 0.08)';
  // Tüm anchor noktaları + aktif pip dot'ları beyaz — koyu zemin üzerinde net kontrast.
  const pipSecondaryDot = 'rgba(255,255,255,0.85)';
  const pipPrimaryDot   = 'rgba(255,255,255,1)';
  const inactiveDotBg     = 'rgba(255,255,255,0.78)';
  const inactiveDotRing   = 'rgba(255,255,255,0.30)';

  return (
    <div
      className="flex flex-col gap-1.5 w-full min-w-0"
      style={{ maxWidth: MAX_W }}
    >
      {/* KONUM başlığı — picker'ın dışında üst-orta (Stil/Boyut/Şeffaflık ile aynı stil) */}
      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Konum</div>

      <div
        className="relative rounded-xl overflow-hidden w-full"
        style={{
          aspectRatio: ASPECT,
          background: bg,
          boxShadow: `inset 0 0 0 1px ${ringColor}, ${vignette}`,
          opacity: disabled ? 0.45 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          transition: 'opacity 180ms ease-out',
          // Container queries — içindeki center label container width'e göre küçülür.
          containerType: 'inline-size',
        } as React.CSSProperties}
        aria-label="Ekran konum seçici"
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
          .anchor-hit:hover .anchor-dot { transform: scale(1.6); background: rgba(var(--theme-accent-rgb), 0.55); }
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
              onClick={() => onChange(p.v)}
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
                // Mini overlay pip — 3 avatar dot, ilk dot konuşuyor (accent glow)
                <span
                  aria-hidden
                  className="anchor-dot is-active flex items-center gap-[3px] rounded-md"
                  style={{
                    padding: '3px 4px',
                    background: 'rgba(var(--theme-accent-rgb), 0.22)',
                    boxShadow:
                      '0 0 0 1px rgba(var(--theme-accent-rgb), 0.80),' +
                      ' 0 0 12px rgba(var(--theme-accent-rgb), 0.45)',
                    transition: 'all 140ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: i === 0 ? pipPrimaryDot : pipSecondaryDot,
                      }}
                    />
                  ))}
                </span>
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
            className="font-semibold text-white/95 truncate block"
            style={{
              // Container query — picker küçülünce yazı orantılı küçülür.
              fontSize: 'clamp(10px, 8cqw, 13px)',
              textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.55)',
            }}
          >
            {activeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// Stil segmented — 3 mini preview: Capsule (pill) / Card (kare+bar) / Badge (minimal dot).
// Her buton aktif varyantı küçük mockup ile gösterir → kullanıcı seçerken ne alacağını görür.
function OverlayVariantSegmented({ value, onChange, disabled }: {
  value: 'capsule' | 'card' | 'badge' | 'none';
  onChange: (v: 'capsule' | 'card' | 'badge' | 'none') => void;
  disabled?: boolean;
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
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-[10px] px-1"
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
function OverlaySizeSegmented({ value, onChange, disabled }: {
  value: 'small' | 'medium' | 'large';
  onChange: (v: 'small' | 'medium' | 'large') => void;
  disabled?: boolean;
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
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="min-w-0 flex flex-col items-center justify-center gap-1 rounded-[10px] px-1"
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
function OverlayToggleRow({ icon, label, hint, checked, onChange, disabled }: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-3"
      style={{
        minHeight: 42,
        paddingLeft: 2,
        paddingRight: 2,
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
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
  return (
    <div
      className="surface-card rounded-xl px-4 py-4 w-full"
      style={{
        maxWidth: 520,
        minWidth: 0,
        overflow: 'hidden',
        containerType: 'inline-size',
      } as React.CSSProperties}
    >
      {/* Container query based layout — kart genişliği küçüldükçe grid'ler kendi
          içinde adapt olur, hiçbir eleman üst üste binmez.
          - vox-body: dar alanda 1 kolon, geniş alanda 2 kolon (Konum + Stil/Boyut).
          - vox-variant-grid: dar alanda 2x2, geniş alanda 4 kolon.
          - vox-size-grid: her zaman 3 kolon (3 Boyut seçeneği). */}
      <style>{`
        .vox-body {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) minmax(160px, 1fr);
          gap: 16px;
          align-items: stretch;
        }
        @container (max-width: 440px) {
          .vox-body { grid-template-columns: 1fr; gap: 12px; }
        }
        .vox-variant-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          border-radius: 12px;
        }
        @container (min-width: 380px) {
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
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(var(--theme-accent-rgb), 0.12)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.22)',
          }}
        >
          <Layers size={15} className="text-[var(--theme-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[12.5px] font-semibold text-[var(--theme-text)] leading-tight">Oyun İçi Ses Göstergesi</p>
            <span
              className="text-[8.5px] font-bold uppercase tracking-[0.14em] px-1.5 py-[2px] rounded leading-none"
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
          />
          <div className="w-full min-w-0 flex flex-col gap-3">
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Stil</div>
              <OverlayVariantSegmented value={overlayVariant} onChange={setOverlayVariant} disabled={off} />
            </div>

            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/55 mb-1.5 px-0.5 text-center">Boyut</div>
              <OverlaySizeSegmented value={overlaySize} onChange={setOverlaySize} disabled={off} />
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
                className="w-full"
                style={{
                  accentColor: 'var(--theme-accent)',
                  opacity: off ? 0.5 : 1,
                  cursor: off ? 'not-allowed' : 'pointer',
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
          />
          <div style={{ height: 1, background: 'rgba(var(--glass-tint), 0.05)', marginLeft: 34 }} />
          <OverlayToggleRow
            icon={<UserIcon size={13} strokeWidth={2} />}
            label="Kendimi göster"
            hint="Kendi avatarın da overlay'e eklenir"
            checked={overlayShowSelf}
            onChange={() => !off && setOverlayShowSelf(!overlayShowSelf)}
            disabled={off}
          />
          <div style={{ height: 1, background: 'rgba(var(--glass-tint), 0.05)', marginLeft: 34 }} />
          <OverlayToggleRow
            icon={<MousePointer2 size={13} strokeWidth={2} />}
            label="Tıklamaları oyuna geçir"
            hint="Overlay fare tıklamalarını yakalamaz"
            checked={overlayClickThrough}
            onChange={() => !off && setOverlayClickThrough(!overlayClickThrough)}
            disabled={off}
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
    <div className="surface-card flex items-center gap-3 px-4 py-3 rounded-xl">
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
  const { settingsTarget, setSettingsTarget } = useUI();
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
    <div className="w-full max-w-[1100px] mx-auto pb-28 px-2 md:px-4 xl:px-6">

      {/* ── Header — başlık ve segmented nav dikey hizalı, central ── */}
      <div className="flex flex-col gap-4 pt-4 pb-5 md:pt-6 md:pb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-[var(--theme-accent)] opacity-75" />
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
              <section>
                <DomainTitle icon={<UserIcon size={11} strokeWidth={2.2} />} title="Profil & Hesap" />
                <AccountSection />
              </section>
              <section>
                <DomainTitle icon={<Eye size={11} strokeWidth={2.2} />} title="Gizlilik" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <LastSeenCard />
                  {isElectron() && isGameActivityAvailable() && <GameActivityCard />}
                </div>
              </section>
              {showPermissions && (
                <section>
                  <DomainTitle icon={<ShieldCheck size={11} strokeWidth={2.2} />} title="İzinler" />
                  <PermissionSection />
                </section>
              )}
            </div>
          )}

          {effectiveTab === 'app' && (
            <div className="flex flex-col gap-5 md:gap-6">
              {/* Row-by-row grid: Görünüm + Performans aynı satırda, grid stretch ile
                  yükseklikleri otomatik eşit. AppearanceSection (Tema Paketleri) içeriği
                  küçük olsa da kart Performans kartının yüksekliğine kadar uzar. */}
              <div className="hidden xl:grid xl:grid-cols-2 gap-4 xl:gap-5">
                <section className="flex flex-col h-full">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <div className="flex-1 flex flex-col">
                    <AppearanceSection />
                  </div>
                </section>
                <section className="flex flex-col h-full">
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                  <div className="flex-1 flex flex-col">
                    <PerformanceSection />
                  </div>
                </section>

                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </section>
                {showVoiceMode && (
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </section>
                )}
                {isElectron() && (
                  <section>
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <VoiceOverlayCard />
                  </section>
                )}
              </div>

              {/* base–lg: tek kolon */}
              <div className="flex flex-col gap-5 xl:hidden">
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Görünüm" />
                  <AppearanceSection />
                </section>
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Sesler" />
                  <SoundsSection />
                </section>
                <section>
                  <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Performans" />
                  <PerformanceSection />
                </section>
                {showVoiceMode && (
                  <section>
                    <DomainTitle icon={<Palette size={11} strokeWidth={2.2} />} title="Konuşma Modu" />
                    <VoiceModeSection />
                  </section>
                )}
                {isElectron() && (
                  <section>
                    <DomainTitle icon={<Layers size={11} strokeWidth={2.2} />} title="Oyun İçi Göstergeler" />
                    <VoiceOverlayCard />
                  </section>
                )}
              </div>
            </div>
          )}

          {effectiveTab === 'admin' && isAdmin && (
            <div className="space-y-5">
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
                  <div className={`surface-card grid gap-1 p-1 rounded-xl ${visible.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {visible.map(tab => {
                      const isActive = effectiveSub === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setAdminSub(tab.key)}
                          className={`flex items-center gap-1.5 justify-center min-w-0 py-1.5 rounded-lg text-[11px] md:text-[12px] font-semibold transition-all duration-150 truncate ${
                            isActive
                              ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)] border border-[rgba(var(--theme-accent-rgb),0.25)]'
                              : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(255,255,255,0.02)]'
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
            </div>
          )}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}
