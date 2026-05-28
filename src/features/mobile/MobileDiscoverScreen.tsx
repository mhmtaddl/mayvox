import React from 'react';

const DiscoverPanel = React.lazy(() => import('../../components/server/DiscoverPanel'));

interface MobileDiscoverScreenProps {
  activeServerId?: string;
  canCreate?: boolean;
  onCreateServer: () => void;
  onJoinModal: () => void;
  onJoinSuccess: (serverId: string) => void;
}

export default function MobileDiscoverScreen({
  activeServerId,
  canCreate = true,
  onCreateServer,
  onJoinModal,
  onJoinSuccess,
}: MobileDiscoverScreenProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <React.Suspense
        fallback={
          <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl text-[11px] font-semibold text-[var(--theme-secondary-text)]/55">
            Keşfet yükleniyor...
          </div>
        }
      >
        <DiscoverPanel
          activeServerId={activeServerId}
          canCreate={canCreate}
          onCreateServer={onCreateServer}
          onJoinModal={onJoinModal}
          onJoinSuccess={onJoinSuccess}
        />
      </React.Suspense>
    </div>
  );
}
