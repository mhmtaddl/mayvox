import React from 'react';
import { Menu, Users, Lock } from 'lucide-react';
import BrandArea from './BrandArea';

interface Props {
  forceMobile: boolean;
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  activeServerName?: string;
  activeServerAvatarUrl?: string;
  activeServerShortName?: string;
  activeServerIsPublic?: boolean;
}

function MobileHeader({
  forceMobile,
  onOpenLeftDrawer,
  onOpenRightDrawer,
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeServerIsPublic,
}: Props) {
  const lg = forceMobile ? '' : 'lg:hidden';
  const hasActiveServer = !!activeServerName;

  return (
    <header className={`${lg} flex flex-col bg-[rgba(var(--theme-bg-rgb),0.7)] backdrop-blur-xl border-b border-[rgba(var(--glass-tint),0.04)] z-10 shrink-0`}>
      <div className={`flex items-center justify-between pl-3 sm:pl-6 pr-2 sm:pr-4 ${forceMobile ? '' : 'lg:pr-0'} h-14 sm:h-16`}>
        <button
          onClick={onOpenLeftDrawer}
          className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors shrink-0`}
        >
          <Menu size={20} />
        </button>

        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
          {hasActiveServer ? (
            <div className="flex items-center gap-2 min-w-0">
              {activeServerAvatarUrl ? (
                <img
                  src={activeServerAvatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                  style={{ border: '1px solid rgba(var(--theme-accent-rgb), 0.18)' }}
                  draggable={false}
                />
              ) : activeServerShortName ? (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(var(--theme-accent-rgb), 0.1)', border: '1px solid rgba(var(--theme-accent-rgb), 0.2)' }}
                >
                  <span className="text-[10px] font-bold text-[var(--theme-accent)]">{activeServerShortName}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-1 min-w-0">
                <h1 className="text-[14px] font-bold text-[var(--theme-text)] truncate tracking-[-0.01em]">
                  {(() => {
                    const raw = activeServerName!;
                    const spaceIdx = raw.indexOf(' ');
                    if (spaceIdx > 0) {
                      const first = raw.slice(0, spaceIdx);
                      const rest = raw.slice(spaceIdx + 1);
                      return <>{first} <span style={{ color: 'var(--theme-accent)' }}>{rest}</span></>;
                    }
                    if (raw.toUpperCase() === 'MAYVOX') return <>MAY<span style={{ color: 'var(--theme-accent)' }}>VOX</span></>;
                    return raw;
                  })()}
                </h1>
                {activeServerIsPublic === false && <Lock size={10} className="text-[var(--theme-secondary-text)]/40 shrink-0" />}
              </div>
            </div>
          ) : (
            <BrandArea />
          )}
        </div>

        <button
          onClick={onOpenRightDrawer}
          className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors shrink-0`}
        >
          <Users size={18} />
        </button>
      </div>
    </header>
  );
}

export default React.memo(MobileHeader);
