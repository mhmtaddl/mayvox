import React from 'react';
import DiscoverPanel from '../../components/server/DiscoverPanel';

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
      <DiscoverPanel
        activeServerId={activeServerId}
        canCreate={canCreate}
        onCreateServer={onCreateServer}
        onJoinModal={onJoinModal}
        onJoinSuccess={onJoinSuccess}
      />
    </div>
  );
}
