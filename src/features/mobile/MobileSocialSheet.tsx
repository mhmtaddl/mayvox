import React from 'react';
import { Bell, MessageCircle, Pin, Power, Settings } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';

interface MobileSocialSheetProps {
  open?: boolean;
  variant?: 'overlay' | 'inline';
  phoneLayout?: boolean;
  onClose?: () => void;
  pinned?: boolean;
  onTogglePinned?: () => void;
  friendCount?: number;
  serverName?: string;
  serverMemberCount?: number;
  currentView?: MobileShellView;
  dmOpen?: boolean;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  notificationSlot?: React.ReactNode;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  children?: React.ReactNode;
}

const INLINE_PANEL_STYLE = {
  background: 'transparent',
  boxShadow: 'inset 1px 0 0 rgba(var(--glass-tint),0.045)',
};

const OVERLAY_PANEL_STYLE = {
  background: 'rgba(var(--theme-bg-rgb),0.06)',
  boxShadow: 'inset 1px 0 0 rgba(var(--glass-tint),0.045)',
};

const UTILITY_ACTIVE_STYLE = { background: 'rgba(var(--theme-accent-rgb),0.075)' };
const UTILITY_INACTIVE_STYLE = { background: 'transparent' };

export default function MobileSocialSheet({ open = false, variant = 'overlay', phoneLayout = false, onClose, pinned = false, onTogglePinned, currentView, dmOpen = false, onOpenSocial, onOpenNotifications, notificationSlot, onOpenSettings, onLogout, children }: MobileSocialSheetProps) {
  const header = onTogglePinned ? (
    <div className="mb-1.5 flex min-h-9 items-center justify-end border-b border-[rgba(var(--glass-tint),0.045)] pb-1.5">
      <button
        type="button"
        onClick={onTogglePinned}
        aria-label={pinned ? 'Panel sabitlemesini kaldir' : 'Paneli sabitle'}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${pinned ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/45'}`}
      >
        <Pin size={13} />
      </button>
    </div>
  ) : null;

  if (variant === 'inline') {
    if (!open) return null;
    return (
      <aside
        className="h-full min-h-0 w-[clamp(168px,15vw,190px)] shrink-0 overflow-hidden px-2 pb-2.5 pt-1"
        onClick={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()}
        style={INLINE_PANEL_STYLE}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {header}
          <div className="min-h-0 flex-1 overflow-hidden">
            {children}
          </div>
          <div className="mt-2 shrink-0 border-t border-[rgba(var(--glass-tint),0.055)] pt-2">
            <div className="flex items-center justify-between gap-1">
              <UtilityButton label="DM" active={dmOpen} onClick={onOpenSocial} icon={<MessageCircle size={15} />} />
              {notificationSlot ?? <UtilityButton label="Bildirim" active={currentView === 'notifications'} onClick={onOpenNotifications} icon={<Bell size={15} />} />}
              <UtilityButton label="Ayarlar" active={currentView === 'settings'} onClick={onOpenSettings} icon={<Settings size={15} />} />
              <UtilityButton label="Kapat" tone="danger" onClick={onLogout} icon={<Power size={15} />} />
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      className={`absolute inset-0 z-40 transition-[visibility] duration-200 ${open ? 'visible' : 'invisible'}`}
      onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()}
      onTouchEnd={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-[rgba(var(--theme-bg-rgb),0.10)] transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="Arkadas panelini kapat"
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute inset-y-0 right-0 h-full overflow-hidden px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)] transition-[transform,opacity] duration-150 ease-out ${phoneLayout ? 'w-[min(88vw,340px)]' : 'w-[clamp(168px,15vw,190px)]'} ${open ? 'translate-x-0 opacity-100' : 'translate-x-[104%] opacity-80'}`}
        style={OVERLAY_PANEL_STYLE}
        aria-hidden={!open}
      >
        <div className="h-[calc(100vh-92px-env(safe-area-inset-top))] min-h-0 overflow-hidden">
          {header}
          {children}
        </div>
      </aside>
    </div>
  );
}

const UtilityButton = React.memo(function UtilityButton({
  icon,
  label,
  active,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  tone?: 'danger';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors active:scale-[0.98] ${
        tone === 'danger'
          ? 'text-red-300/78'
          : active
            ? 'text-[var(--theme-accent)]'
            : 'text-[var(--theme-secondary-text)]/66'
      }`}
      style={active ? UTILITY_ACTIVE_STYLE : UTILITY_INACTIVE_STYLE}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
});
