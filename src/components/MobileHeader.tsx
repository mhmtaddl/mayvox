import React from 'react';
import { Menu, Users } from 'lucide-react';

interface Props {
  forceMobile: boolean;
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
}

function MobileHeader({
  forceMobile,
  onOpenLeftDrawer,
  onOpenRightDrawer,
}: Props) {
  const lg = forceMobile ? '' : 'lg:hidden';

  return (
    <header className={`${lg} flex flex-col bg-[rgba(var(--theme-bg-rgb),0.7)] backdrop-blur-xl border-b border-[rgba(var(--glass-tint),0.04)] z-10 shrink-0`}>
      <div className={`flex items-center justify-between pl-3 sm:pl-6 pr-2 sm:pr-4 ${forceMobile ? '' : 'lg:pr-0'} h-14 sm:h-16`}>
        <button
          onClick={onOpenLeftDrawer}
          className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors`}
        >
          <Menu size={20} />
        </button>

        <button
          onClick={onOpenRightDrawer}
          className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors`}
        >
          <Users size={18} />
        </button>
      </div>
    </header>
  );
}

export default React.memo(MobileHeader);
