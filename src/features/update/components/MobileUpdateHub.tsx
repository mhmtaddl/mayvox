import React, { useState } from 'react';
import { useUpdateController } from '../hooks/useUpdateController';
import { useUpdateVisibility } from '../hooks/useUpdateVisibility';
import UpdateStatusIcon from './UpdateStatusIcon';
import UpdateProgressRing from './UpdateProgressRing';
import MobileUpdateSheet from './MobileUpdateSheet';
import ForceUpdateOverlay from './ForceUpdateOverlay';

interface Props {
  currentVersion: string;
}

export default function MobileUpdateHub({ currentVersion }: Props) {
  const { state, urgency, check, download, install } = useUpdateController(currentVersion);
  const vis = useUpdateVisibility(state, urgency, currentVersion);
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasUpdate = vis.showUpdateHub;

  return (
    <>
      <button
        onClick={() => hasUpdate && vis.canOpenDetails && setSheetOpen(true)}
        className={`flex items-center gap-1 text-[8px] font-medium transition-colors ${
          hasUpdate
            ? 'text-[var(--theme-accent)]'
            : 'text-[var(--theme-secondary-text)]/30'
        }`}
      >
        {vis.showProgress && (
          <UpdateProgressRing progress={state.progress} size={12} stroke={1.5} />
        )}
        {vis.showBadge && !vis.showProgress && (
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: state.phase === 'downloaded' ? '#22c55e' : 'var(--theme-accent)' }} />
        )}
        {state.phase !== 'idle' && state.phase !== 'up-to-date' && !vis.showProgress && !vis.showBadge && (
          <UpdateStatusIcon phase={state.phase} size={8} />
        )}
        <span>{vis.label}</span>
      </button>

      {sheetOpen && (
        <MobileUpdateSheet
          state={state}
          urgency={urgency}
          onDownload={() => { download(); setSheetOpen(false); }}
          onInstall={install}
          onRetry={check}
          onClose={() => setSheetOpen(false)}
        />
      )}

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
