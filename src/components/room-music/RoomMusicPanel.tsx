import React, { useMemo, useState } from 'react';
import { Lock, Music2, Pause, Play, Radio, Square, Volume2 } from 'lucide-react';
import type { MusicSource, RoomMusicSession } from '../../types';
import { getRoomMusicPermissions } from '../../lib/musicPermissions';

export interface RoomMusicPanelProps {
  serverPlan?: string | null;
  userLevel?: string | number | null;
  serverRole?: string | null;
  session?: RoomMusicSession | null;
  source?: MusicSource | null;
  className?: string;
  compact?: boolean;
  onPlayPause?: () => void;
  onStop?: () => void;
}

export default function RoomMusicPanel({
  serverPlan,
  userLevel,
  serverRole,
  session,
  source,
  className = '',
  compact = true,
  onPlayPause,
  onStop,
}: RoomMusicPanelProps) {
  const [localVolume, setLocalVolume] = useState(70);
  const permissions = useMemo(
    () => getRoomMusicPermissions({ serverPlan, userLevel, serverRole }),
    [serverPlan, userLevel, serverRole],
  );
  const status = session?.status ?? 'stopped';
  const title = source?.title?.replace(/\s*Preview$/i, '') || 'MAYVox Mood';
  const mood = source?.category || source?.mood || 'Mood kanali';
  const panelPadding = compact ? 'px-2.5 py-2' : 'p-3';
  const iconSize = compact ? 'h-7 w-7' : 'h-9 w-9';
  const controlSize = compact ? 'h-7 w-7' : 'h-8 w-8';
  const volumeWidth = compact ? 'w-20 sm:w-24' : 'w-32';

  if (permissions.locked) {
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

        <div className={`hidden items-center gap-2 md:flex ${volumeWidth}`}>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--theme-border)]/35">
            <div
              className="h-full rounded-full bg-[var(--theme-accent)]/65"
              style={{ width: `${localVolume}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!permissions.canControl}
            onClick={onPlayPause}
            className={`flex ${controlSize} items-center justify-center rounded-md border border-[var(--theme-border)] text-[var(--theme-text)] disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={status === 'playing' ? 'Pause' : 'Play'}
          >
            {status === 'playing' ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            disabled={!permissions.canStop}
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
            onChange={event => setLocalVolume(Number(event.target.value))}
            className="h-1 w-14 accent-[var(--theme-accent)] md:hidden"
            aria-label="Music volume"
          />
          <span className="w-6 text-right tabular-nums">{localVolume}</span>
        </div>
      </div>
    </section>
  );
}
