import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, Crown, Lock, Palette, Recycle, RotateCcw, Volume2, Zap, Mic, AudioLines, SlidersHorizontal, Type, PanelBottom } from 'lucide-react';
import { CardSection, Toggle } from '../shared';
import { useSettings } from '../../../contexts/SettingsCtx';
import { useUser } from '../../../contexts/UserContext';
import { previewSound, type SoundVariant } from '../../../lib/sounds';
import {
  SoundManager, stopAllSamples,
  type CallVariant, type NotificationVariant,
} from '../../../lib/audio/SoundManager';
import {
  THEME_PACKS,
  DEFAULT_THEME_PACK_ID,
  canAccessThemePack,
  getThemeAccessTier,
  getThemePack,
} from '../../../lib/themePacks';
import { isMobile } from '../../../lib/platform';
import { rangeVisualStyle } from '../../../lib/rangeStyle';
import { isSoundsInChatRoomEnabled, setSoundsInChatRoomEnabled } from '../../../lib/soundRoomPreference';

function PremiumColorControl({
  label,
  value,
  fallback,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value?: string;
  fallback: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const color = value || fallback;
  const [draftColor, setDraftColor] = useState(color);

  useEffect(() => {
    setDraftColor(color);
  }, [color]);

  const commitDraft = () => {
    if (!disabled) onCommit(draftColor);
  };

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-[var(--theme-border)]/55 bg-[var(--surface-soft)] px-2.5 py-2 ${disabled ? 'opacity-45' : ''}`}>
      <span className="min-w-0 text-[10.5px] font-semibold text-[var(--theme-secondary-text)] truncate">{label}</span>
      <span className="relative h-6 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--theme-border)]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" style={{ background: draftColor }}>
        <input
          type="color"
          value={draftColor}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setDraftColor(next);
            onChange(next);
          }}
          onBlur={commitDraft}
          onMouseUp={commitDraft}
          onPointerUp={commitDraft}
          onTouchEnd={commitDraft}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={label}
        />
      </span>
    </div>
  );
}

function PremiumCustomizationCard({
  tier,
  title,
  badge,
  icon,
  locked,
  children,
  onReset,
  isOpen,
  onToggle,
}: {
  tier: 'pro' | 'elite';
  title: string;
  badge: string;
  icon: React.ReactNode;
  locked: boolean;
  children: React.ReactNode;
  onReset: () => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[var(--theme-border)]/65 bg-[var(--surface-base)] p-3 shadow-[var(--surface-card-shadow)] ${locked ? 'opacity-75' : ''}`}
      aria-disabled={locked}
    >
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 text-left ${isOpen ? 'mb-3' : ''} disabled:cursor-default`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--theme-border)]/60 bg-[var(--surface-soft)] text-[var(--theme-accent)]">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold text-[var(--theme-text)]">{title}</p>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent)]/80">{badge}</p>
          </div>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--theme-secondary-text)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          disabled={locked}
          onClick={onReset}
          className="settings-premium-reset inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--theme-border)]/60 bg-[var(--surface-soft)] px-2 text-[10px] font-semibold text-[var(--theme-secondary-text)] transition-colors hover:bg-[var(--surface-elevated)] disabled:cursor-default disabled:opacity-45"
        >
          <RotateCcw size={12} />
          Sıfırla
        </button>
        </div>
      )}

      {isOpen && (
        <div className={`grid gap-2 ${locked ? 'pointer-events-none blur-[1px]' : ''}`}>
          {children}
        </div>
      )}

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-base)]/55 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-full border border-[var(--theme-border)]/70 bg-[var(--surface-elevated)] px-3 py-1.5 text-[10px] font-bold text-[var(--theme-secondary-text)] shadow-[var(--shadow-soft)]">
            <Lock size={12} />
            {tier === 'pro' ? 'Pro ve üstü üyeler' : 'Elit üyeler'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Görünüm ──
export function AppearanceSection() {
  const {
    themePackId,
    setThemePackId,
    customThemeOverrides,
    setCustomThemeOverrides,
    commitCustomThemeOverrides,
    resetCustomThemeOverrides,
    uiDensity,
    setUiDensity,
    uiFontScale,
    setUiFontScale,
    uiDockScale,
    setUiDockScale,
  } = useSettings();
  const { currentUser } = useUser();
  const [isProCustomizationOpen, setIsProCustomizationOpen] = useState(false);
  const [isEliteCustomizationOpen, setIsEliteCustomizationOpen] = useState(false);
  const activePack = getThemePack(themePackId);
  const themeAccessTier = getThemeAccessTier(currentUser);
  const visibleThemePacks = THEME_PACKS.filter(pack => canAccessThemePack(pack, themeAccessTier));
  const isEliteMember = themeAccessTier === 'elite';
  const isProMember = themeAccessTier === 'pro' || themeAccessTier === 'elite';
  const fontScaleSteps = [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];
  const currentFontScaleIndex = Math.max(0, fontScaleSteps.findIndex(step => Math.abs(step - uiFontScale) < 0.001));
  const fontScalePercent = Math.round(uiFontScale * 100);
  const dockScaleSteps = [0.8, 0.9, 1, 1.1, 1.2];
  const currentDockScaleIndex = Math.max(0, dockScaleSteps.findIndex(step => Math.abs(step - uiDockScale) < 0.001));
  const dockScalePercent = Math.round(uiDockScale * 100);

  const buildProOverride = (key: 'accent' | 'chromeTint', value: string) => ({
    ...customThemeOverrides,
    pro: { ...customThemeOverrides.pro, [key]: value },
  });

  const buildEliteOverride = (key: 'accent' | 'chromeTint' | 'contentTint' | 'materialTint', value: string) => ({
    ...customThemeOverrides,
    elite: { ...customThemeOverrides.elite, [key]: value },
  });

  const updateProOverride = (key: 'accent' | 'chromeTint', value: string) => {
    setCustomThemeOverrides(buildProOverride(key, value));
  };

  const commitProOverride = (key: 'accent' | 'chromeTint', value: string) => {
    commitCustomThemeOverrides(buildProOverride(key, value));
  };

  const updateEliteOverride = (key: 'accent' | 'chromeTint' | 'contentTint' | 'materialTint', value: string) => {
    setCustomThemeOverrides(buildEliteOverride(key, value));
  };

  const commitEliteOverride = (key: 'accent' | 'chromeTint' | 'contentTint' | 'materialTint', value: string) => {
    commitCustomThemeOverrides(buildEliteOverride(key, value));
  };

  const selectThemePack = (id: typeof themePackId) => {
    if (!canAccessThemePack(id, themeAccessTier)) return;
    resetCustomThemeOverrides();
    setThemePackId(id);
    setIsProCustomizationOpen(false);
    setIsEliteCustomizationOpen(false);
  };

  useEffect(() => {
    if (canAccessThemePack(themePackId, themeAccessTier)) return;
    resetCustomThemeOverrides();
    setThemePackId(DEFAULT_THEME_PACK_ID);
    setIsProCustomizationOpen(false);
    setIsEliteCustomizationOpen(false);
  }, [themeAccessTier, themePackId]);

  return (
    <CardSection icon={<Recycle size={12} />} title="" className="xl:h-full xl:flex xl:flex-col">
      <div className="settings-appearance-controls mb-4 grid gap-3">
      <div className="settings-appearance-control-card rounded-xl border border-[var(--theme-border)]/55 bg-[var(--surface-soft)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="settings-appearance-control-copy min-w-0">
            <span className="settings-appearance-control-icon"><SlidersHorizontal size={12} strokeWidth={2.2} /></span>
            <p className="text-[11px] font-bold text-[var(--theme-text)]">Görünüm yoğunluğu</p>
            <p className="mt-1 text-[10.5px] leading-snug text-[var(--theme-secondary-text)]/72">
              Ekrana sığan içerik yoğunluğunu ayarlar.
            </p>
          </div>
          <div className="settings-appearance-segment inline-flex shrink-0 rounded-lg border border-[var(--theme-border)]/60 bg-[rgba(var(--glass-tint),0.035)] p-0.5">
            {[
              { id: 'comfortable' as const, label: 'Rahat' },
              { id: 'compact' as const, label: 'Kompakt' },
            ].map(option => {
              const active = uiDensity === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setUiDensity(option.id)}
                  className={`h-7 rounded-md px-3 text-[10.5px] font-semibold transition-colors ${
                    active
                      ? 'bg-[rgba(var(--theme-accent-rgb),0.16)] text-[var(--theme-accent)] shadow-[inset_0_0_0_1px_rgba(var(--theme-accent-rgb),0.22)]'
                      : 'text-[var(--theme-secondary-text)]/65 hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)]'
                  }`}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="settings-appearance-control-card rounded-xl border border-[var(--theme-border)]/55 bg-[var(--surface-soft)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="settings-appearance-control-copy min-w-0">
            <span className="settings-appearance-control-icon"><Type size={12} strokeWidth={2.2} /></span>
            <p className="mv-font-meta text-[11px] font-bold text-[var(--theme-text)]">Yazı boyutu</p>
            <p className="mv-font-caption mt-1 text-[10.5px] leading-snug text-[var(--theme-secondary-text)]/72">
              Metin ölçeğini küçük adımlarla değiştirir.
            </p>
          </div>
          <div className="settings-appearance-stepper inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--theme-border)]/60 bg-[rgba(var(--glass-tint),0.035)] p-0.5">
            <button
              type="button"
              onClick={() => setUiFontScale(fontScaleSteps[Math.max(0, currentFontScaleIndex - 1)])}
              disabled={currentFontScaleIndex <= 0}
              className="h-7 w-8 rounded-md text-[10.5px] font-bold text-[var(--theme-secondary-text)]/75 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--theme-secondary-text)]/75"
              aria-label="Yazı boyutunu küçült"
            >
              A−
            </button>
            <span className="min-w-[42px] rounded-md px-2 text-center text-[10.5px] font-bold tabular-nums text-[var(--theme-accent)]">
              %{fontScalePercent}
            </span>
            <button
              type="button"
              onClick={() => setUiFontScale(fontScaleSteps[Math.min(fontScaleSteps.length - 1, currentFontScaleIndex + 1)])}
              disabled={currentFontScaleIndex >= fontScaleSteps.length - 1}
              className="h-7 w-8 rounded-md text-[10.5px] font-bold text-[var(--theme-secondary-text)]/75 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--theme-secondary-text)]/75"
              aria-label="Yazı boyutunu büyüt"
            >
              A+
            </button>
          </div>
        </div>
      </div>
      <div className="settings-appearance-control-card rounded-xl border border-[var(--theme-border)]/55 bg-[var(--surface-soft)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="settings-appearance-control-copy min-w-0">
            <span className="settings-appearance-control-icon"><PanelBottom size={12} strokeWidth={2.2} /></span>
            <p className="mv-font-meta text-[11px] font-bold text-[var(--theme-text)]">Alt kontrol çubuğu boyutu</p>
            <p className="mv-font-caption mt-1 text-[10.5px] leading-snug text-[var(--theme-secondary-text)]/72">
              Dock avatar, ikon ve boşluk ölçeğini ayarlar.
            </p>
          </div>
          <div className="settings-appearance-stepper inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--theme-border)]/60 bg-[rgba(var(--glass-tint),0.035)] p-0.5">
            <button
              type="button"
              onClick={() => setUiDockScale(dockScaleSteps[Math.max(0, currentDockScaleIndex - 1)])}
              disabled={currentDockScaleIndex <= 0}
              className="h-7 w-8 rounded-md text-[12px] font-bold text-[var(--theme-secondary-text)]/75 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--theme-secondary-text)]/75"
              aria-label="Alt kontrol çubuğunu küçült"
            >
              −
            </button>
            <span className="min-w-[42px] rounded-md px-2 text-center text-[10.5px] font-bold tabular-nums text-[var(--theme-accent)]">
              %{dockScalePercent}
            </span>
            <button
              type="button"
              onClick={() => setUiDockScale(dockScaleSteps[Math.min(dockScaleSteps.length - 1, currentDockScaleIndex + 1)])}
              disabled={currentDockScaleIndex >= dockScaleSteps.length - 1}
              className="h-7 w-8 rounded-md text-[12px] font-bold text-[var(--theme-secondary-text)]/75 transition-colors hover:bg-[rgba(var(--glass-tint),0.055)] hover:text-[var(--theme-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--theme-secondary-text)]/75"
              aria-label="Alt kontrol çubuğunu büyüt"
            >
              +
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* ═══ THEME PACKS ═══ */}
      <div className="mb-1">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[11px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">Tema Paketleri</p>
          <span className="settings-active-theme-pack-name text-[10px] font-medium text-[var(--theme-accent)] opacity-70 shrink-0">{activePack.name}</span>
        </div>

        <div className="settings-theme-pack-grid grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {visibleThemePacks.map(pack => {
            const isSelected = themePackId === pack.id;
            return (
              <button
                key={pack.id}
                onClick={() => selectThemePack(pack.id)}
                className="settings-theme-pack-card group relative flex flex-col gap-2 p-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: isSelected
                      ? '2px solid var(--accent, #6366F1)'
                      : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isSelected
                      ? '0 0 0 1px var(--accent, #6366F1), 0 4px 16px rgba(0,0,0,0.25)'
                      : '0 1px 4px rgba(0,0,0,0.18)',
                }}
              >
                {/* Preview gradient */}
                <div
                  className="relative w-full h-9 rounded-lg overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${pack.previewFrom} 0%, ${pack.previewTo} 100%)` }}
                >
                  <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 30%, rgba(255,255,255,0.06), transparent 60%)` }} />
                  <div className="absolute bottom-1 right-1.5 flex gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: pack.accent, boxShadow: `0 0 6px ${pack.accent}66` }} />
                    <span className="w-2 h-2 rounded-full" style={{ background: pack.success, opacity: 0.7 }} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className={`text-[10.5px] font-semibold truncate ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary,rgba(255,255,255,0.78))]'}`}>{pack.name}</span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: pack.accentSoft }}>
                      <Check size={9} style={{ color: pack.accent }} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="settings-premium-theme-grid mt-3 grid gap-2.5">
          <PremiumCustomizationCard
            tier="pro"
            title="Pro Özelleştirme"
            badge="Pro"
            icon={<Palette size={14} />}
            locked={!isProMember}
            onReset={() => resetCustomThemeOverrides('pro')}
            isOpen={isProCustomizationOpen}
            onToggle={() => setIsProCustomizationOpen(value => !value)}
          >
            <PremiumColorControl
              label="Accent rengi"
              value={customThemeOverrides.pro.accent}
              fallback={activePack.accent}
              disabled={!isProMember}
              onChange={(value) => updateProOverride('accent', value)}
              onCommit={(value) => commitProOverride('accent', value)}
            />
            <PremiumColorControl
              label="Sol panel + üst bar"
              value={customThemeOverrides.pro.chromeTint}
              fallback={activePack.bgSoft}
              disabled={!isProMember}
              onChange={(value) => updateProOverride('chromeTint', value)}
              onCommit={(value) => commitProOverride('chromeTint', value)}
            />
          </PremiumCustomizationCard>

          <PremiumCustomizationCard
            tier="elite"
            title="Elit Özelleştirme"
            badge="Elit"
            icon={<Crown size={14} />}
            locked={!isEliteMember}
            onReset={() => resetCustomThemeOverrides('elite')}
            isOpen={isEliteCustomizationOpen}
            onToggle={() => setIsEliteCustomizationOpen(value => !value)}
          >
            <PremiumColorControl
              label="Accent rengi"
              value={customThemeOverrides.elite.accent}
              fallback={activePack.accent}
              disabled={!isEliteMember}
              onChange={(value) => updateEliteOverride('accent', value)}
              onCommit={(value) => commitEliteOverride('accent', value)}
            />
            <PremiumColorControl
              label="Sol panel + üst bar"
              value={customThemeOverrides.elite.chromeTint}
              fallback={activePack.bgSoft}
              disabled={!isEliteMember}
              onChange={(value) => updateEliteOverride('chromeTint', value)}
              onCommit={(value) => commitEliteOverride('chromeTint', value)}
            />
            <PremiumColorControl
              label="İçerik + sağ panel"
              value={customThemeOverrides.elite.contentTint}
              fallback={activePack.accent}
              disabled={!isEliteMember}
              onChange={(value) => updateEliteOverride('contentTint', value)}
              onCommit={(value) => commitEliteOverride('contentTint', value)}
            />
            <PremiumColorControl
              label="Dock / modal / card"
              value={customThemeOverrides.elite.materialTint}
              fallback={activePack.accent}
              disabled={!isEliteMember}
              onChange={(value) => updateEliteOverride('materialTint', value)}
              onCommit={(value) => commitEliteOverride('materialTint', value)}
            />
          </PremiumCustomizationCard>
        </div>
      </div>

    </CardSection>
  );
}

// ── Sesler ──
export function SoundsSection() {
  const {
    soundJoinLeave, setSoundJoinLeave,
    soundJoinLeaveVariant, setSoundJoinLeaveVariant,
    soundMuteDeafen, setSoundMuteDeafen,
    soundMuteDeafenVariant, setSoundMuteDeafenVariant,
    soundPtt, setSoundPtt,
    soundPttVariant, setSoundPttVariant,
    soundInvite, setSoundInvite,
  } = useSettings();

  // SoundManager-backed state (mp3 picker'lar için lokal kopya — render trigger)
  const [callV, setCallV] = useState<CallVariant>(SoundManager.getCallVariant());
  const [notifV, setNotifV] = useState<NotificationVariant>(SoundManager.getNotificationVariant());
  const [notifOn, setNotifOn] = useState<boolean>(SoundManager.isNotificationEnabled());
  const [vol, setVol] = useState<number>(SoundManager.getMasterVolume());
  const [muted, setMuted] = useState<boolean>(SoundManager.isMuted());
  const [soundsInRoomOn, setSoundsInRoomOn] = useState<boolean>(isSoundsInChatRoomEnabled());

  useEffect(() => { SoundManager.preloadAll(); }, []);

  // ── Oscillator-bazlı eski 3 satır (Giriş/Çıkış, Mikrofon/Hoparlör, Bas-Konuş) ──
  const oscillatorRows = [
    { label: 'Giriş / Çıkış', tooltip: 'Odaya giriş/çıkışta ses çalar', category: 'JoinLeave' as const, variant: soundJoinLeaveVariant, setVariant: setSoundJoinLeaveVariant, enabled: soundJoinLeave, setEnabled: setSoundJoinLeave, variants: ['Ses A', 'Ses B'] },
    { label: 'Mikrofon / Hoparlör', tooltip: 'Mikrofon veya hoparlör kapandığında', category: 'MuteDeafen' as const, variant: soundMuteDeafenVariant, setVariant: setSoundMuteDeafenVariant, enabled: soundMuteDeafen, setEnabled: setSoundMuteDeafen, variants: ['Ses A', 'Ses B'] },
    { label: 'Bas-Konuş', tooltip: 'Bas-konuş tuşuna basıldığında', category: 'Ptt' as const, variant: soundPttVariant, setVariant: setSoundPttVariant, enabled: soundPtt, setEnabled: setSoundPtt, variants: ['Ses A', 'Ses B'] },
  ];

  // ── Classic iOS-style radio dot — accent rengi bağımsız görünür ──
  // Seçili değil: nötr glass-tint outline (tema-adaptif).
  // Seçili: accent dolgu + İÇ BEYAZ NOKTA (her accent renginde kontrast) + dış glow.
  function RadioDot({ active, dim }: { active: boolean; dim?: boolean }) {
    return (
      <span
        className="relative block w-[15px] h-[15px] rounded-full transition-all duration-150"
        style={{
          background: active ? 'var(--theme-accent)' : 'transparent',
          opacity: dim ? 0.55 : 1,
          boxShadow: active
            ? 'inset 0 0 0 1.5px var(--theme-accent), 0 0 0 3px rgba(var(--theme-accent-rgb),0.22), 0 1px 2px rgba(0,0,0,0.12)'
            : 'inset 0 0 0 1.5px rgba(var(--glass-tint),0.55), inset 0 0 0 2.5px rgba(var(--glass-tint),0.04)',
        }}
      >
        {active && (
          <span
            className="absolute rounded-full"
            style={{
              top: 4, left: 4, right: 4, bottom: 4,
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 0 2px rgba(0,0,0,0.15)',
            }}
          />
        )}
      </span>
    );
  }

  function CirclePicker<V extends string>({ current, options, enabled, onPick, onPreview }: {
    current: V;
    options: ReadonlyArray<V>;
    enabled: boolean;
    onPick: (v: V) => void;
    onPreview: (v: V) => void;
  }) {
    return (
      <div className="flex flex-wrap items-center gap-0.5">
        {options.map(opt => {
          const active = current === opt;
          return (
            <button
              key={opt}
              onClick={() => { stopAllSamples(); onPick(opt); onPreview(opt); }}
              className="p-1 rounded-full transition-transform active:scale-90"
              aria-label={`Ses ${opt}`}
            >
              <RadioDot active={active && enabled} dim={!enabled} />
            </button>
          );
        })}
      </div>
    );
  }

  const mp3Variants: ReadonlyArray<'1' | '2' | '3'> = ['1', '2', '3'];

  return (
    <CardSection icon={<Volume2 size={12} />} title="">
      <p className="text-[10px] text-[var(--theme-secondary-text)]/72 mb-3">Bildirim ve UI sesleri</p>
      <div className="settings-app-sounds-grid grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(180px,0.82fr)]">

        {/* 1-3: Giriş/Çıkış · Mikrofon/Hoparlör · Bas-Konuş (oscillator — circle picker) */}
        <div className="settings-app-sounds-group rounded-xl border border-[var(--theme-border)]/45 bg-[var(--surface-soft)]/55 px-2.5">
          {oscillatorRows.map(({ label, tooltip, category, variant, setVariant, enabled, setEnabled, variants }) => (
            <div key={category} className="settings-app-sound-row flex items-center gap-2 border-b border-[var(--theme-border)]/40 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">{label}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {variants.map((_, i) => {
                    const v = (i + 1) as SoundVariant;
                    const active = variant === v;
                    return (
                      <button
                        key={v}
                        disabled={!enabled}
                        onClick={() => { stopAllSamples(); setVariant(v); previewSound(category, v); }}
                        className="p-1 rounded-full transition-transform active:scale-90 disabled:cursor-default"
                        aria-label={`Ses ${v}`}
                      >
                        <RadioDot active={active && enabled} dim={!enabled} />
                      </button>
                    );
                  })}
                </div>
                <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} tooltip={tooltip} />
              </div>
            </div>
          ))}
        </div>

        <div className="settings-app-sounds-group rounded-xl border border-[var(--theme-border)]/45 bg-[var(--surface-soft)]/55 px-2.5">
          {/* 4: Arama (mp3 — gelen arama zil sesi, soundInvite toggle ile gated) */}
          <div className="settings-app-sound-row flex items-center gap-2 border-b border-[var(--theme-border)]/40 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Arama</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CirclePicker<CallVariant>
                current={callV}
                options={mp3Variants as ReadonlyArray<CallVariant>}
                enabled={soundInvite}
                onPick={v => { setCallV(v); SoundManager.setCallVariant(v); }}
                onPreview={v => SoundManager.preview.call(v)}
              />
              <Toggle checked={soundInvite} onChange={() => setSoundInvite(!soundInvite)} tooltip="Gelen aramada çalacak zil sesi" />
            </div>
          </div>

          {/* 5: Bildirim (mp3 — davet/sistem bildirimi) */}
          <div className="settings-app-sound-row flex items-center gap-2 border-b border-[var(--theme-border)]/40 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Bildirim</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <CirclePicker<NotificationVariant>
                current={notifV}
                options={mp3Variants as ReadonlyArray<NotificationVariant>}
                enabled={notifOn}
                onPick={v => { setNotifV(v); SoundManager.setNotificationVariant(v); }}
                onPreview={v => SoundManager.preview.notification(v)}
              />
              <Toggle checked={notifOn} onChange={() => { const next = !notifOn; setNotifOn(next); SoundManager.setNotificationEnabled(next); }} tooltip="Davet ve sistem bildirim sesi" />
            </div>
          </div>

          {/* 6: Sohbet odasi sesleri */}
          <div className="settings-app-sound-row flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Sohbet odasında çal</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Toggle
                checked={soundsInRoomOn}
                onChange={() => {
                  const next = !soundsInRoomOn;
                  setSoundsInRoomOn(next);
                  setSoundsInChatRoomEnabled(next);
                }}
                tooltip="Sohbet odasındayken bu bölümdeki sesler çalsın"
              />
            </div>
          </div>
        </div>

        {/* 7: Genel Ses Seviyesi (master vol slider + mute toggle, en altta) */}
        <div className="settings-app-master-volume xl:col-span-2 flex flex-col gap-2 rounded-xl border border-[var(--theme-border)]/45 bg-[var(--surface-soft)]/55 px-2.5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Genel Ses Seviyesi</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tabular-nums text-[var(--theme-secondary-text)]/70 w-8 text-right">{Math.round(vol * 100)}%</span>
              <Toggle
                checked={!muted}
                onChange={() => { const next = !muted; setMuted(next); SoundManager.setMuted(next); }}
                tooltip="Tüm özel sesleri sustur"
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vol}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVol(v);
              SoundManager.setMasterVolume(v);
            }}
            className="premium-range w-full"
            style={rangeVisualStyle(vol, 0, 1)}
            disabled={muted}
          />
        </div>
      </div>
    </CardSection>
  );
}

// ── Ses Profili (kaldırıldı — preset sistemi bitti) ──
// Backward-compat: SettingsView'deki <AudioProfileSection /> kullanımını
// kırmamak için null döndüren boş component export edildi.
export function AudioProfileSection() {
  return null;
}

// ── Performans & Ses Motoru (VoiceChannel merged here) ──
const IDLE_MINUTES_OPTIONS = [5, 10, 15, 30, 60] as const;

export function PerformanceSection() {
  const {
    isLowDataMode, setIsLowDataMode,
    isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled,
    noiseSuppressionStrength, setNoiseSuppressionStrength,
    pttReleaseDelay, setPttReleaseDelay,
    autoLeaveEnabled, setAutoLeaveEnabled,
    autoLeaveMinutes, setAutoLeaveMinutes,
  } = useSettings();

  const [, setMicAverage] = useState(0);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterAnimRef = useRef<number | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isNoiseSuppressionEnabled) {
      setMicAverage(0);
      return;
    }
    let stopped = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        meterStreamRef.current = stream;
        const ctx = new AudioContext();
        meterCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (stopped) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setMicAverage(avg);
          meterAnimRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* mikrofon izni yok */ }
    };
    start();
    return () => {
      stopped = true;
      if (meterAnimRef.current) cancelAnimationFrame(meterAnimRef.current);
      meterStreamRef.current?.getTracks().forEach(t => t.stop());
      meterCtxRef.current?.close();
      setMicAverage(0);
    };
  }, [isNoiseSuppressionEnabled]);

  return (
    <CardSection icon={<Zap size={12} />} title="">
      <div className="settings-app-performance-grid space-y-3 md:space-y-0 md:divide-y md:divide-[var(--theme-border)]/50">

        {/* Düşük Veri Modu */}
        <div className="settings-app-perf-item settings-app-perf-low-data flex items-center gap-3 md:pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Düşük Veri Modu</p>
          </div>
          <Toggle checked={isLowDataMode} onChange={() => setIsLowDataMode(!isLowDataMode)} tooltip="Görsel güncellemeleri kısıtlar, ses kalitesine dokunmaz" />
        </div>

        {/* Gürültü Susturma */}
        <div className="settings-app-perf-item settings-app-perf-noise flex items-center gap-3 md:py-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Gürültü Susturma</p>
          </div>
          <Toggle checked={isNoiseSuppressionEnabled} onChange={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)} tooltip="Arka plan gürültüsünü filtreler" />
        </div>

        {/* Boşta Ayrılma — zorunlu, sadece süre seçilir (5-60 dk) */}
        <div className="settings-app-perf-item settings-app-perf-idle md:py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Boşta Ayrılma</p>
              <p className="text-[9px] text-[var(--theme-secondary-text)]/72 mt-0.5 leading-snug">
                Sohbet odasında{' '}
                <span className="font-semibold text-violet-300">{autoLeaveMinutes} dakika</span>
                {' '}boyunca hareketsiz kalırsan otomatik olarak{' '}
                <span className="font-semibold text-violet-300">AFK</span>
                {' '}durumuna alınır ve odadan ayrılırsın.
              </p>
            </div>
          </div>
          <div className="settings-idle-minute-grid flex flex-wrap gap-1.5 mt-2.5">
            {IDLE_MINUTES_OPTIONS.map(m => (
              <button
                key={m}
                data-active={autoLeaveMinutes === m}
                onClick={() => { setAutoLeaveMinutes(m); if (!autoLeaveEnabled) setAutoLeaveEnabled(true); }}
                className={`settings-idle-minute-option flex-1 min-w-[40px] py-1.5 rounded-lg text-[10px] font-bold transition-all border active:scale-95 ${
                  autoLeaveMinutes === m
                    ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border-[var(--theme-accent)]/30'
                    : 'bg-transparent text-[var(--theme-secondary-text)]/50 border-[var(--theme-border)] hover:text-[var(--theme-secondary-text)]'
                }`}
              >
                {m} dk
              </button>
            ))}
          </div>
        </div>

        {/* Gürültü Temizleme Gücü — RNNoise strength 0-100 */}
        <div className={`settings-app-perf-item settings-app-perf-noise-strength md:py-3 transition-opacity ${isNoiseSuppressionEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between mb-2">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">Gürültü Temizleme Gücü</p>
            <span className="settings-range-value text-[11px] font-bold text-[var(--theme-accent)] tabular-nums">%{noiseSuppressionStrength}</span>
          </div>
          <input
            type="range" min={0} max={100} value={noiseSuppressionStrength}
            onChange={e => setNoiseSuppressionStrength(Number(e.target.value))}
            disabled={!isNoiseSuppressionEnabled}
            className="premium-range w-full"
            style={rangeVisualStyle(noiseSuppressionStrength, 0, 100)}
          />
          <div className="flex justify-between text-[9px] md:text-[10px] text-[var(--theme-secondary-text)] mt-0.5">
            <span>Hafif</span><span>Agresif</span>
          </div>
        </div>

        {/* PTT Bırakma Gecikmesi */}
        <div className="settings-app-perf-item settings-app-perf-ptt-delay md:pt-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between mb-2">
            <p className="text-[11px] md:text-[12px] font-semibold text-[var(--theme-text)]">PTT Bırakma Gecikmesi</p>
            <span className="settings-range-value text-[11px] font-bold text-[var(--theme-accent)] tabular-nums">
              {pttReleaseDelay === 0 ? 'Kapalı' : `${pttReleaseDelay} ms`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            step={50}
            value={pttReleaseDelay}
            onChange={e => setPttReleaseDelay(Number(e.target.value))}
            className="premium-range w-full"
            style={rangeVisualStyle(pttReleaseDelay, 0, 500)}
          />
          <div className="flex justify-between text-[9px] md:text-[10px] text-[var(--theme-secondary-text)] mt-0.5">
            <span>Kapalı</span><span>500 ms</span>
          </div>
        </div>

      </div>
    </CardSection>
  );
}

// ── Mikrofon Modu (sadece mobil) ──
export function VoiceModeSection() {
  if (!isMobile()) return null;
  const { voiceMode, setVoiceMode } = useSettings();

  const modes = [
    { id: 'ptt' as const, icon: <Mic size={13} />, label: 'Bas-Konuş', desc: 'Basılı tut' },
    { id: 'vad' as const, icon: <AudioLines size={13} />, label: 'Ses Algılama', desc: 'Otomatik' },
  ];

  return (
    <CardSection icon={<Mic size={12} />} title="Mikrofon Modu">
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[rgba(var(--glass-tint),0.075)] bg-[rgba(var(--glass-tint),0.022)] p-1">
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => setVoiceMode(m.id)}
            className={`flex min-h-[42px] items-center gap-2 rounded-lg border px-2 py-1.5 transition-all text-left active:scale-[0.985] ${
              voiceMode === m.id
                ? 'border-[rgba(var(--theme-accent-rgb),0.24)] bg-[rgba(var(--theme-accent-rgb),0.10)]'
                : 'border-transparent bg-transparent hover:bg-[rgba(var(--glass-tint),0.045)]'
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              voiceMode === m.id ? 'bg-[var(--theme-accent)]/14 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.045)] text-[var(--theme-secondary-text)]/70'
            }`}>
              {m.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[11px] font-bold ${voiceMode === m.id ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/88'}`}>
                {m.label}
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-medium text-[var(--theme-secondary-text)]/52">{m.desc}</span>
            </span>
            {voiceMode === m.id && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent)]">
                <Check size={9} className="text-[var(--theme-btn-primary-text)]" strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
    </CardSection>
  );
}

// ── VoiceChannelSection no longer needed (merged into PerformanceSection) ──
export function VoiceChannelSection() {
  return null;
}
