import React, { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import { useUpdateController } from '../hooks/useUpdateController';
import { useUpdateVisibility } from '../hooks/useUpdateVisibility';
import UpdateStatusIcon from './UpdateStatusIcon';
import UpdateProgressRing from './UpdateProgressRing';
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
  const { state, urgency, check, download, install } = useUpdateController(currentVersion);
  const vis = useUpdateVisibility(state, urgency, currentVersion);
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

  const hasUpdate = vis.showUpdateHub;

  // Update aktif mi — download icon + shimmer gösterilecek mi
  const isUpdateActive = hasUpdate && (state.phase === 'available' || state.phase === 'downloading' || state.phase === 'downloaded');

  // Faza göre buton aksiyonu — popover yerine doğrudan tetiklenir.
  // İdle / up-to-date durumda version tıklaması release notes AÇMAZ (kullanıcı talebi).
  const handleClick = () => {
    if (state.phase === 'available') { download(); return; }
    if (state.phase === 'downloaded') { install(); return; }
    if (state.phase === 'error') { check(); return; }
  };

  // Faz etiketi — buton içinde gösterilen kısa metin
  const phaseLabel = (() => {
    if (state.phase === 'downloading') return `%${state.progress}`;
    if (state.phase === 'available') return 'İndir';
    if (state.phase === 'downloaded') return 'Kur';
    if (state.phase === 'error') return 'Yeniden Dene';
    return `v${currentVersion}`;
  })();

  return (
    <>
      <div className="relative">
        <button
          onClick={handleClick}
          className={`mv-sidebar-version flex items-center gap-1.5 text-[9px] font-medium transition-all duration-150 rounded px-1.5 py-0.5 -mx-1.5 ${
            hasUpdate
              ? 'text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 cursor-pointer'
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

          {/* Label — faz bazlı aksiyon etiketi (İndir/Kur/%N/Yeniden Dene) veya versiyon */}
          {isUpdateActive || state.phase === 'error' ? (
            <span className="update-shimmer">{phaseLabel}</span>
          ) : (
            <span>{phaseLabel}</span>
          )}
        </button>

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
