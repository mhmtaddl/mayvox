import React, { useState } from 'react';
import { ListTree, Search, Settings, UserRound, UsersRound } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';

interface MobileTopBarProps {
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeServerMotto?: string;
  activeChannelName?: string;
  userAvatarUrl?: string;
  userLabel?: string;
  currentView?: MobileShellView;
  onOpenChannels?: () => void;
  onOpenSocial?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenQuickActions?: () => void;
}

const SEARCH_PLACEHOLDER: Record<MobileShellView, string> = {
  home: 'Arkadas ara',
  room: 'Sohbette ara',
  discover: 'Topluluk ara',
  social: 'DM veya arkadas ara',
  notifications: 'Bildirimlerde ara',
  settings: 'Ayarlarda ara',
  profile: 'Profilde ara',
};

export default function MobileTopBar({
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeServerMotto,
  activeChannelName,
  userAvatarUrl,
  userLabel,
  currentView = 'home',
  onOpenChannels,
  onOpenSocial,
  onOpenSettings,
  onOpenProfile,
  onOpenQuickActions,
}: MobileTopBarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!userAvatarUrl && !avatarFailed;
  const [serverAvatarFailed, setServerAvatarFailed] = useState(false);
  const showServerAvatar = !!activeServerAvatarUrl && !serverAvatarFailed;
  const avatarInitial = (userLabel || activeServerName || 'MAYVox').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const serverInitial = (activeServerShortName || activeServerName || 'M').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const placeholder = SEARCH_PLACEHOLDER[currentView];

  return (
    <header className="shrink-0 px-3 pt-[calc(env(safe-area-inset-top)+6px)] pb-1">
      <div className="mx-auto grid min-h-11 w-full max-w-[1180px] grid-cols-[44px_minmax(128px,178px)_minmax(120px,1fr)_44px_44px] items-center gap-2 sm:px-2">
        <button
          type="button"
          onClick={onOpenChannels}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[var(--theme-text)]/88 active:scale-[0.98]"
          style={{ background: 'rgba(var(--glass-tint),0.024)' }}
          aria-label="Kanallar"
        >
          <ListTree size={19} />
        </button>

        <div className="flex h-11 min-w-0 items-center gap-1.5 rounded-[13px] px-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[11px] font-black text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
            {showServerAvatar ? (
              <img src={activeServerAvatarUrl || ''} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setServerAvatarFailed(true)} />
            ) : (
              serverInitial
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-black text-[var(--theme-text)]/90">{activeServerName || 'MAYVox'}</span>
            <span className="block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/42">{activeServerMotto || activeChannelName || 'voice & chat'}</span>
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-8 w-6 shrink-0 items-center justify-center text-[var(--theme-secondary-text)]/58 transition-colors active:scale-[0.98]"
            aria-label="Sunucu ayarlari"
          >
            <Settings size={14} />
          </button>
        </div>

        <button
          type="button"
          className="flex h-10 min-w-0 items-center gap-2 rounded-[13px] px-3 text-left active:scale-[0.995]"
          style={{
            background: 'rgba(var(--glass-tint),0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.045)',
          }}
          aria-label="Ara"
        >
          <Search size={16} className="shrink-0 text-[var(--theme-secondary-text)]/70" />
          <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--theme-secondary-text)]/78">
            {placeholder}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSocial}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-[var(--theme-text)]/84 active:scale-[0.98]"
          style={{ background: 'rgba(var(--glass-tint),0.024)' }}
          aria-label="Arkadaslar"
        >
          <UsersRound size={18} />
        </button>

        <button
          type="button"
          onClick={onOpenProfile ?? onOpenQuickActions}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[13px] active:scale-[0.98]"
          style={{ background: 'rgba(var(--glass-tint),0.024)' }}
          aria-label="Profil"
        >
          {showAvatar ? (
            <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setAvatarFailed(true)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[13px] font-black text-[var(--theme-text)]/86">
              {userLabel || activeServerName ? avatarInitial : <UserRound size={18} className="text-[var(--theme-text)]/82" />}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
