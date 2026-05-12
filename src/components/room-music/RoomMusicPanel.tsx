import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Music2, Pause, Play, Radio, Square, Volume2 } from 'lucide-react';
import type { MusicSource, RoomMusicPermissions, RoomMusicSession } from '../../types';
import { getRoomMusicPermissions } from '../../lib/musicPermissions';

export interface RoomMusicPanelProps {
  serverPlan?: string | null;
  userLevel?: string | number | null;
  serverRole?: string | null;
  session?: RoomMusicSession | null;
  source?: MusicSource | null;
  permissions?: RoomMusicPermissions;
  loading?: boolean;
  actionLoading?: boolean;
  error?: string | null;
  actionError?: string | null;
  errorCode?: string | null;
  controlsDisabled?: boolean;
  className?: string;
  compact?: boolean;
  onPlayPause?: () => void;
  onStop?: () => void;
  onVolumeChange?: (volume: number) => void;
  variant?: 'bar' | 'card';
}

export default function RoomMusicPanel({
  serverPlan,
  userLevel,
  serverRole,
  session,
  source,
  permissions: permissionsOverride,
  loading = false,
  actionLoading = false,
  error,
  actionError,
  errorCode,
  controlsDisabled = false,
  className = '',
  compact = true,
  onPlayPause,
  onStop,
  onVolumeChange,
  variant = 'bar',
}: RoomMusicPanelProps) {
  const [localVolume, setLocalVolume] = useState(session?.volume ?? 70);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [showVolumeValue, setShowVolumeValue] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeValueTimerRef = useRef<number | null>(null);
  const computedPermissions = useMemo(
    () => getRoomMusicPermissions({ serverPlan, userLevel, serverRole }),
    [serverPlan, userLevel, serverRole],
  );
  const permissions = permissionsOverride ?? computedPermissions;
  const status = session?.status ?? 'stopped';
  const canStopCurrentSession = !!session && status !== 'stopped';
  const title = source?.title?.replace(/\s*Preview$/i, '') || 'MAYVox Mood';
  const mood = loading
    ? 'Yukleniyor'
    : actionLoading
      ? 'Durum guncelleniyor'
      : errorCode === 'MUSIC_ULTRA_REQUIRED'
        ? 'Ultra gerekli'
        : actionError || error || source?.category || source?.mood || 'Mood kanali';
  const panelPadding = compact ? 'px-2.5 py-2' : 'p-3';
  const iconSize = compact ? 'h-7 w-7' : 'h-9 w-9';
  const controlSize = compact ? 'h-7 w-7' : 'h-8 w-8';
  const volumeWidth = compact ? 'w-20 sm:w-24' : 'w-32';
  const playDisabled = controlsDisabled || actionLoading || !permissions.canControl || !onPlayPause;
  const stopDisabled = controlsDisabled || actionLoading || !canStopCurrentSession || !permissions.canStop || !onStop;
  const volumeDisabled = controlsDisabled || actionLoading || !permissions.canControl || !onVolumeChange;

  const clearVolumeValueTimer = () => {
    if (volumeValueTimerRef.current === null) return;
    window.clearTimeout(volumeValueTimerRef.current);
    volumeValueTimerRef.current = null;
  };

  const closeVolumeControl = () => {
    setVolumeOpen(false);
    setShowVolumeValue(true);
    clearVolumeValueTimer();
    volumeValueTimerRef.current = window.setTimeout(() => setShowVolumeValue(false), 1800);
  };

  useEffect(() => {
    if (!volumeOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (volumeRef.current?.contains(event.target as Node)) return;
      closeVolumeControl();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeVolumeControl();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [volumeOpen]);

  useEffect(() => () => clearVolumeValueTimer(), []);

  useEffect(() => {
    if (typeof session?.volume !== 'number') return;
    setLocalVolume(session.volume);
  }, [session?.volume]);

  const handleVolumeChange = (volume: number) => {
    const nextVolume = Math.max(0, Math.min(100, Math.round(volume)));
    setLocalVolume(nextVolume);
    onVolumeChange?.(nextVolume);
  };

  if (permissions.locked) {
    if (variant === 'card') {
      return (
        <section className={`relative flex h-[86px] w-[156px] items-center gap-2 rounded-[18px] border border-[var(--theme-border)] bg-[var(--theme-panel)]/88 px-2.5 py-2 shadow-sm ${className}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[24%] border border-[var(--theme-border)] bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]">
            <Lock size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-semibold leading-tight text-[var(--theme-text)]">MAYVox Music</p>
            <p className="mt-0.5 truncate text-[9px] leading-tight text-[var(--theme-secondary-text)]/65">Ultra gerekli</p>
          </div>
        </section>
      );
    }

    return (
      <section className={`shrink-0 max-w-xl rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel)]/88 ${panelPadding} ${className}`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex ${iconSize} items-center justify-center rounded-md bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]`}>
            <Lock size={compact ? 14 : 16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-[var(--theme-text)]">MAYVox Music</span>
              <span className="shrink-0 text-[11px] text-[var(--theme-secondary-text)]/75">Ultra'ya ozel</span>
            </div>
          </div>
          <span className="rounded-md border border-[var(--theme-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-secondary-text)]">
            Ultra
          </span>
        </div>
      </section>
    );
  }

  if (variant === 'card') {
    return (
      <section className={`relative flex h-[86px] ${volumeOpen ? 'w-[238px]' : 'w-[156px]'} items-center gap-2 rounded-[18px] border border-[var(--theme-border)] bg-[var(--theme-panel)]/88 px-2.5 py-2 shadow-sm transition-[width] duration-200 ${className}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[24%] border border-[var(--theme-border)] bg-[var(--theme-accent)]/12 text-[var(--theme-accent)]">
          <Music2 size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[10.5px] font-semibold leading-tight text-[var(--theme-text)]">MAYVox Music</p>
          <p className="mt-0.5 truncate text-[9px] leading-tight text-[var(--theme-secondary-text)]/70">{title}</p>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              disabled={playDisabled}
              onClick={onPlayPause}
              className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--theme-secondary-text)] transition-colors hover:text-[var(--theme-accent)] focus:outline-none focus-visible:outline-none active:text-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-[var(--theme-secondary-text)]"
              aria-label={status === 'playing' ? 'Pause' : 'Play'}
            >
              {status === 'playing' ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button
              type="button"
              disabled={stopDisabled}
              onClick={onStop}
              className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--theme-secondary-text)] transition-colors hover:text-[var(--theme-accent)] focus:outline-none focus-visible:outline-none active:text-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-[var(--theme-secondary-text)]"
              aria-label="Stop"
            >
              <Square size={10} />
            </button>
            <div ref={volumeRef} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (volumeOpen) {
                    closeVolumeControl();
                    return;
                  }
                  clearVolumeValueTimer();
                  setShowVolumeValue(true);
                  setVolumeOpen(true);
                }}
                className="flex h-5 min-w-5 items-center justify-center rounded-md text-[var(--theme-secondary-text)] transition-colors hover:text-[var(--theme-accent)] focus:outline-none focus-visible:outline-none active:text-[var(--theme-accent)]"
                aria-label="Music volume"
              >
                {volumeOpen || showVolumeValue ? (
                  <span className="text-[9px] font-semibold tabular-nums">{localVolume}</span>
                ) : (
                  <Volume2 size={11} />
                )}
              </button>
              {volumeOpen && (
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={localVolume}
                  onChange={event => {
                    clearVolumeValueTimer();
                    setShowVolumeValue(true);
                    handleVolumeChange(Number(event.target.value));
                  }}
                  disabled={volumeDisabled}
                  className="h-1 w-20 accent-[var(--theme-accent)]"
                  aria-label="Music volume"
                />
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`shrink-0 max-w-2xl rounded-lg border border-[var(--theme-border)] bg-[var(--theme-panel)]/88 ${panelPadding} ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={`flex ${iconSize} shrink-0 items-center justify-center rounded-md bg-[var(--theme-accent)]/12 text-[var(--theme-accent)]`}>
          <Music2 size={compact ? 15 : 17} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[13px] font-semibold text-[var(--theme-text)]">MAYVox Music</span>
            <span className="min-w-0 truncate text-[11px] text-[var(--theme-secondary-text)]">{title}</span>
            {permissions.readOnly && (
              <span className="shrink-0 rounded-md bg-[var(--theme-border)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-secondary-text)]">
                Dinleme modu
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--theme-secondary-text)]/70">
            <Radio size={12} className="shrink-0" />
            <span className="truncate">{mood}</span>
          </div>
        </div>

        <div className={`relative hidden items-center gap-2 md:flex ${volumeWidth}`}>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--theme-border)]/35">
            <div className="h-full rounded-full bg-[var(--theme-accent)]/65" style={{ width: `${localVolume}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={localVolume}
            onChange={event => handleVolumeChange(Number(event.target.value))}
            disabled={volumeDisabled}
            className="relative z-[1] h-4 w-full cursor-pointer opacity-0"
            aria-label="Music volume"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={playDisabled}
            onClick={onPlayPause}
            className={`flex ${controlSize} items-center justify-center rounded-md border border-[var(--theme-border)] text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={status === 'playing' ? 'Pause' : 'Play'}
          >
            {status === 'playing' ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            disabled={stopDisabled}
            onClick={onStop}
            className={`flex ${controlSize} items-center justify-center rounded-md border border-[var(--theme-border)] text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label="Stop"
          >
            <Square size={13} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[var(--theme-secondary-text)]">
          <Volume2 size={12} />
          <input
            type="range"
            min={0}
            max={100}
            value={localVolume}
            onChange={event => handleVolumeChange(Number(event.target.value))}
            disabled={volumeDisabled}
            className="h-1 w-14 accent-[var(--theme-accent)] md:hidden"
            aria-label="Music volume"
          />
          <span className="w-6 text-right tabular-nums">{localVolume}</span>
        </div>
      </div>
    </section>
  );
}
