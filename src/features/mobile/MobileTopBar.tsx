import React, { useEffect, useState } from 'react';
import { Search, Settings } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';
import { resolveAvatarUrls } from '../../lib/statusAvatar';

interface MobileTopBarProps {
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeServerMotto?: string;
  activeChannelName?: string;
  currentView?: MobileShellView;
  onOpenChannels?: () => void;
  onOpenSettings?: () => void;
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
  currentView = 'home',
  onOpenChannels,
  onOpenSettings,
}: MobileTopBarProps) {
  const [serverAvatarFailed, setServerAvatarFailed] = useState(false);
  const [serverAvatarIndex, setServerAvatarIndex] = useState(0);
  const serverAvatarUrls = resolveAvatarUrls(activeServerAvatarUrl);
  const activeServerAvatarSrc = serverAvatarUrls[serverAvatarIndex] || '';
  const showServerAvatar = !!activeServerAvatarSrc && !serverAvatarFailed;
  const serverInitial = (activeServerShortName || activeServerName || 'M').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const placeholder = SEARCH_PLACEHOLDER[currentView];

  useEffect(() => {
    setServerAvatarFailed(false);
    setServerAvatarIndex(0);
  }, [activeServerAvatarUrl]);

  return (
    <header className="shrink-0 px-3 pt-[calc(env(safe-area-inset-top)+6px)] pb-1">
      <div className="mx-auto grid min-h-11 w-full max-w-[1180px] grid-cols-[clamp(168px,15vw,190px)_minmax(0,1fr)_clamp(168px,15vw,190px)] items-center gap-3 sm:px-2">
        <div className="flex h-11 min-w-0 items-center gap-1.5 rounded-[13px] px-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[11px] font-black text-[var(--theme-accent)]" style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
            {showServerAvatar ? (
              <img
                src={activeServerAvatarSrc}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => {
                  if (serverAvatarIndex + 1 < serverAvatarUrls.length) {
                    setServerAvatarIndex(index => index + 1);
                    return;
                  }
                  setServerAvatarFailed(true);
                }}
              />
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
            className="flex h-8 w-7 shrink-0 items-center justify-center text-[var(--theme-secondary-text)]/58 transition-colors hover:text-[var(--theme-accent)] active:scale-[0.98]"
            aria-label="Sunucu ayarlari"
          >
            <Settings size={14} />
          </button>
        </div>

        <div aria-hidden="true" />

        <button
          type="button"
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-[13px] px-3 text-left active:scale-[0.995]"
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

      </div>
    </header>
  );
}
