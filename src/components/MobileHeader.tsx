import React from 'react';
import { Menu, Users } from 'lucide-react';
import BrandArea from './BrandArea';
import AvatarContent from './AvatarContent';
import { getFrameTier, getFrameStyle, getFrameClassName, type FrameTier } from '../lib/avatarFrame';

interface Props {
  forceMobile: boolean;
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  userName: string;
  userAge: number;
  statusText: string;
  statusColor: string;
  avatar?: string;
  avatarBorderColor: string;
  userLevel?: string | null;
  isPrimaryAdmin?: boolean;
  isAdmin?: boolean;
}

function MobileHeader({
  forceMobile,
  onOpenLeftDrawer,
  onOpenRightDrawer,
  userName,
  userAge,
  statusText,
  statusColor,
  avatar,
  avatarBorderColor,
  userLevel,
  isPrimaryAdmin,
  isAdmin,
}: Props) {
  const frameTier = getFrameTier(userLevel, { isPrimaryAdmin, isAdmin });
  const lg = forceMobile ? '' : 'lg:hidden';

  return (
    <header className={`${lg} flex flex-col bg-[rgba(var(--theme-bg-rgb),0.7)] backdrop-blur-xl border-b border-[rgba(var(--glass-tint),0.04)] z-10 shrink-0`}>
      <div className={`flex items-center justify-between pl-3 sm:pl-6 pr-2 sm:pr-4 ${forceMobile ? '' : 'lg:pr-0'} h-14 sm:h-16`}>
        {/* Mobil: sol drawer butonu */}
        <button
          onClick={onOpenLeftDrawer}
          className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors mr-1`}
        >
          <Menu size={20} />
        </button>

        <BrandArea />

        <div className="flex items-center h-full gap-1 sm:gap-2">
          {/* Mobil: sag drawer (kullanicilar) butonu */}
          <button
            onClick={onOpenRightDrawer}
            className={`${lg} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors`}
          >
            <Users size={18} />
          </button>

          <div className={`h-full flex items-center ${forceMobile ? '' : 'lg:w-64 lg:px-4'} gap-2 sm:gap-3 group relative`}>
            <div className="text-right hidden sm:flex flex-col items-end flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate w-full">{userName} ({userAge})</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${statusColor}`}>{statusText}</p>
            </div>
            <div className={`shrink-0 ${getFrameClassName(frameTier)}`} style={{ ...getFrameStyle(avatarBorderColor, frameTier), borderRadius: '22%' }}>
            <div className="h-10 w-10 overflow-hidden avatar-squircle relative flex items-center justify-center text-white font-bold text-xs">
              <AvatarContent avatar={avatar} statusText={statusText} name={userName} letterClassName="text-white font-bold text-xs" />
            </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default React.memo(MobileHeader);
