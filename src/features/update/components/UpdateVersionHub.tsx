import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useUpdateController } from '../hooks/useUpdateController';
import { useUpdateVisibility } from '../hooks/useUpdateVisibility';
import UpdateStatusIcon from './UpdateStatusIcon';
import UpdateProgressRing from './UpdateProgressRing';
import UpdatePopover from './UpdatePopover';
import ForceUpdateOverlay from './ForceUpdateOverlay';
import { getReleaseNotes } from '../../../lib/releaseNotes';
import ReleaseNotesPopover from '../../../components/ReleaseNotesModal';

interface Props {
  currentVersion: string;
  isAdmin?: boolean;
  /** App seviyesinden gelen otomatik gösterim isteği (ilk açılış) */
  autoShowNotes?: boolean;
  onNotesShown?: () => void;
}

export default function UpdateVersionHub({ currentVersion, isAdmin, autoShowNotes, onNotesShown }: Props) {
  const { state, urgency, check, download, install, dismiss } = useUpdateController(currentVersion);
  const vis = useUpdateVisibility(state, urgency, currentVersion);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  // App'ten gelen otomatik gösterim
  useEffect(() => {
    if (autoShowNotes && getReleaseNotes(currentVersion)) {
      setShowReleaseNotes(true);
      onNotesShown?.();
    }
  }, [autoShowNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  const containerRef = useRef<HTMLDivElement>(null);

  // Dışına tıklayınca popover kapat
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popoverOpen]);

  const handleClick = () => {
    if (vis.canOpenDetails) {
      setPopoverOpen(prev => !prev);
      return;
    }
    // Normal: release notes
    if (getReleaseNotes(currentVersion)) {
      setShowReleaseNotes(prev => !prev);
    }
  };

  const hasUpdate = vis.showUpdateHub;

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          onClick={handleClick}
          className={`flex items-center gap-1.5 text-[9px] font-medium transition-all duration-150 rounded px-1.5 py-0.5 -mx-1.5 ${
            hasUpdate
              ? 'text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 cursor-pointer'
              : getReleaseNotes(currentVersion)
                ? 'text-[var(--theme-accent)]/70 hover:text-[var(--theme-accent)] cursor-pointer'
                : 'text-[var(--theme-secondary-text)]/50 cursor-default'
          }`}
        >
          {/* Progress ring veya status icon */}
          {vis.showProgress ? (
            <UpdateProgressRing progress={state.progress} size={14} stroke={2} />
          ) : state.phase !== 'idle' && state.phase !== 'up-to-date' ? (
            <UpdateStatusIcon phase={state.phase} size={10} />
          ) : null}

          {/* Badge dot */}
          {vis.showBadge && !vis.showProgress && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: state.phase === 'downloaded' ? '#22c55e' : 'var(--theme-accent)' }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: state.phase === 'downloaded' ? '#22c55e' : 'var(--theme-accent)' }} />
            </span>
          )}

          {/* Label — sadece yüzde veya versiyon, yazı yok */}
          {vis.showProgress ? (
            <span>{`%${state.progress}`}</span>
          ) : !vis.showUpdateHub ? (
            <span>{`v${currentVersion}`}</span>
          ) : null}
        </button>

        {/* Popover */}
        <AnimatePresence>
          {popoverOpen && (
            <UpdatePopover
              state={state}
              urgency={urgency}
              onDownload={() => { download(); setPopoverOpen(false); }}
              onInstall={install}
              onRetry={() => { check(); setPopoverOpen(false); }}
              onClose={() => setPopoverOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Release notes (normal durum) */}
        {showReleaseNotes && getReleaseNotes(currentVersion) && (
          <ReleaseNotesPopover
            version={currentVersion}
            notes={getReleaseNotes(currentVersion)!}
            onClose={() => setShowReleaseNotes(false)}
            isAdmin={isAdmin}
          />
        )}
      </div>

      {/* Force update overlay */}
      {vis.showForceOverlay && (
        <ForceUpdateOverlay
          state={state}
          onDownload={download}
          onInstall={install}
        />
      )}
    </>
  );
}
