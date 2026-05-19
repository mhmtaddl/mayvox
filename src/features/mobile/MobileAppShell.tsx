import React, { useEffect, useMemo, useState } from 'react';
import MobileBottomBar from './MobileBottomBar';
import MobileContextTabs, { type MobileContextTab } from './MobileContextTabs';
import MobileTopBar from './MobileTopBar';

export type MobileShellView = 'home' | 'room' | 'discover' | 'social' | 'notifications' | 'settings' | 'profile';

interface MobileAppShellProps {
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeServerMotto?: string;
  activeChannelName?: string;
  userAvatarUrl?: string;
  userLabel?: string;
  userStatusText?: string;
  currentView?: MobileShellView;
  tabs?: MobileContextTab[];
  activeTabKey?: string;
  onOpenChannels?: () => void;
  onOpenRoom?: () => void;
  onOpenDiscover?: () => void;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  onOpenFriends?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenAccountSettings?: () => void;
  onChangeStatus?: (status: string) => void;
  onOpenQuickActions?: () => void;
  onGoHome?: () => void;
  onLeaveRoom?: () => void;
  onTabChange?: (key: string) => void;
  onLogout?: () => void;
  disableContentSwipe?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  isPttPressed?: boolean;
  isNoiseSuppressionEnabled?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onPttChange?: (pressed: boolean) => void;
  onToggleNoiseSuppression?: () => void;
  children?: React.ReactNode;
}

const DISCOVER_TABS: MobileContextTab[] = [
  { key: 'featured', label: 'One cikan' },
  { key: 'popular', label: 'Populer' },
  { key: 'games', label: 'Oyun' },
  { key: 'community', label: 'Topluluk' },
  { key: 'new', label: 'Yeni' },
];

export default function MobileAppShell({
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeServerMotto,
  activeChannelName,
  userAvatarUrl,
  userLabel,
  userStatusText,
  currentView = 'home',
  tabs,
  activeTabKey,
  onOpenChannels,
  onOpenRoom,
  onOpenDiscover,
  onOpenSocial,
  onOpenNotifications,
  onOpenFriends,
  onOpenSettings,
  onOpenProfile,
  onOpenAccountSettings,
  onChangeStatus,
  onOpenQuickActions,
  onGoHome,
  onLeaveRoom,
  onTabChange,
  onLogout,
  disableContentSwipe = false,
  isMuted,
  isDeafened,
  isPttPressed,
  isNoiseSuppressionEnabled,
  onToggleMute,
  onToggleDeafen,
  onPttChange,
  onToggleNoiseSuppression,
  children,
}: MobileAppShellProps) {
  const shellTabs = useMemo(() => {
    if (tabs && tabs.length > 0) return tabs;
    if (currentView === 'discover') return DISCOVER_TABS;
    return undefined;
  }, [currentView, tabs]);
  const [localActiveTabKey, setLocalActiveTabKey] = useState(shellTabs?.[0]?.key ?? '');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const selectedTabKey = activeTabKey ?? localActiveTabKey;

  useEffect(() => {
    setLocalActiveTabKey(shellTabs?.[0]?.key ?? '');
  }, [currentView, shellTabs]);

  const showTabs = !!shellTabs?.length;
  const handleTabChange = (key: string) => {
    setLocalActiveTabKey(key);
    onTabChange?.(key);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disableContentSwipe || currentView !== 'home' || !showTabs || touchStartX === null) {
      setTouchStartX(null);
      return;
    }
    const deltaX = event.changedTouches[0]?.clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 56) return;

    const currentIndex = shellTabs.findIndex(tab => tab.key === selectedTabKey);
    if (currentIndex < 0) return;
    const nextIndex = deltaX < 0
      ? Math.min(shellTabs.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex !== currentIndex) handleTabChange(shellTabs[nextIndex].key);
  };

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none bg-[var(--theme-bg)] text-[var(--theme-text)]"
      style={{ borderRadius: 0, margin: 0, boxShadow: 'none' }}
    >
      <MobileTopBar
        activeServerName={activeServerName}
        activeServerAvatarUrl={activeServerAvatarUrl}
        activeServerShortName={activeServerShortName}
        activeServerMotto={activeServerMotto}
        activeChannelName={activeChannelName}
        currentView={currentView}
        onOpenChannels={onOpenChannels}
        onOpenSettings={onOpenSettings}
      />

      {showTabs && <MobileContextTabs tabs={shellTabs} activeKey={selectedTabKey} onChange={handleTabChange} />}

      <main className="min-h-0 flex-1 overflow-hidden">
        <div
          className="relative mx-auto h-full min-h-0 w-full max-w-[1180px] overflow-hidden px-3 sm:px-5"
          onTouchStart={event => setTouchStartX(disableContentSwipe ? null : (event.touches[0]?.clientX ?? null))}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => setTouchStartX(null)}
        >
          {children}
        </div>
      </main>

      <MobileBottomBar
        activeServerName={activeServerName}
        activeServerAvatarUrl={activeServerAvatarUrl}
        activeServerShortName={activeServerShortName}
        activeChannelName={activeChannelName}
        userAvatarUrl={userAvatarUrl}
        userLabel={userLabel}
        userStatusText={userStatusText}
        currentView={currentView}
        onGoHome={onGoHome}
        onOpenChannels={onOpenChannels}
        onOpenRoom={onOpenRoom}
        onOpenProfile={onOpenProfile}
        onOpenAccountSettings={onOpenAccountSettings}
        onChangeStatus={onChangeStatus}
        onLeaveRoom={onLeaveRoom}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isPttPressed={isPttPressed}
        isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onPttChange={onPttChange}
        onToggleNoiseSuppression={onToggleNoiseSuppression}
      />
    </div>
  );
}
