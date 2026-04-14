import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Download } from 'lucide-react';
import { useUpdateController } from '../hooks/useUpdateController';
import { useUpdateVisibility } from '../hooks/useUpdateVisibility';
import UpdateStatusIcon from './UpdateStatusIcon';
import UpdateProgressRing from './UpdateProgressRing';
import UpdatePopover from './UpdatePopover';
import ForceUpdateOverlay from './ForceUpdateOverlay';
import { getReleaseNotes } from '../../../lib/releaseNotes';
import ReleaseNotesPopover from '../../../components/ReleaseNotesModal';
import { useUI } from '../../../contexts/UIContext';

interface Props {
  currentVersion: string;
  isAdmin?: boolean;
  autoShowNotes?: boolean;
  onNotesShown?: () => void;
}

export default function UpdateVersionHub({ currentVersion, isAdmin, autoShowNotes, onNotesShown }: Props) {
  const { state, urgency, check, download, install, dismiss } = useUpdateController(currentVersion);
  const vis = useUpdateVisibility(state, urgency, currentVersion);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const { setToastMsg } = useUI();

  // ── Phase değişiminde dock notification gönder ──
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const next = state.phase;
    prevPhaseRef.current = next;

    if (prev === next) return;

    // Phase geçişlerine göre dock mesajı
    if (next === 'available' && prev !== 'available') {
      setToastMsg(`Yeni sürüm mevcut: v${state.version}`);
    } else if (next === 'downloading' && prev !== 'downloading') {
      setToastMsg('Güncelleme indiriliyor...');
    } else if (next === 'downloaded' && prev !== 'downloaded') {
      setToastMsg('Güncelleme hazır — yüklemek için tıkla');
    } else if (next === 'error' && state.error) {
      setToastMsg(state.error);
    }
  }, [state.phase, state.version, state.error, setToastMsg]);

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
    if (getReleaseNotes(currentVersion)) {
      setShowReleaseNotes(prev => !prev);
    }
  };

  const hasUpdate = vis.showUpdateHub;

  // Update aktif mi — download icon + shimmer gösterilecek mi
  const isUpdateActive = hasUpdate && (state.phase === 'available' || state.phase === 'downloading' || state.phase === 'downloaded');

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          onClick={handleClick}
          className={`mv-sidebar-version flex items-center gap-1.5 text-[9px] font-medium transition-all duration-150 rounded px-1.5 py-0.5 -mx-1.5 ${
            hasUpdate
              ? 'text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 cursor-pointer'
              : getReleaseNotes(currentVersion)
                ? 'text-[var(--theme-accent)]/70 hover:text-[var(--theme-accent)] cursor-pointer'
                : 'text-[var(--theme-secondary-text)]/50 cursor-default'
          }`}
        >
          {/* Progress ring — indirme sırasında */}
          {vis.showProgress ? (
            <UpdateProgressRing progress={state.progress} size={14} stroke={2} />
          ) : isUpdateActive ? (
            /* Download icon — update aktifken (scan yerine) */
            <span className="relative flex items-center justify-center">
              <Download size={10} className="text-[var(--theme-accent)]" />
              {state.phase === 'downloaded' && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </span>
          ) : state.phase !== 'idle' && state.phase !== 'up-to-date' ? (
            <UpdateStatusIcon phase={state.phase} size={10} />
          ) : null}

          {/* Badge dot — available/downloaded'da pulse */}
          {vis.showBadge && !vis.showProgress && !isUpdateActive && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: state.phase === 'downloaded' ? '#22c55e' : 'var(--theme-accent)' }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: state.phase === 'downloaded' ? '#22c55e' : 'var(--theme-accent)' }} />
            </span>
          )}

          {/* Label — shimmer efekti update aktifken */}
          {vis.showProgress ? (
            <span>{`%${state.progress}`}</span>
          ) : isUpdateActive ? (
            <span className="update-shimmer">{vis.sublabel || `v${state.version}`}</span>
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

        {/* Release notes */}
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
