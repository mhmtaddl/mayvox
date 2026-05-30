import React, { useCallback, useEffect, useState } from 'react';
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
  dmCount?: number;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  notificationSlot?: React.ReactNode;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  topSlot?: React.ReactNode;
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
const PHONE_SOCIAL_WIDTH_KEY = 'mayvox.mobilePhone.socialPanelWidth';

function getDefaultPhonePanelWidth() {
  if (typeof window === 'undefined') return 190;
  return Math.round(Math.min(window.innerWidth * 0.51, 190));
}

function clampPhonePanelWidth(width: number) {
  if (typeof window === 'undefined') return width;
  const min = getDefaultPhonePanelWidth();
  const max = Math.round(Math.min(window.innerWidth * 0.78, 320));
  return Math.min(max, Math.max(min, width));
}

export default function MobileSocialSheet({ open = false, variant = 'overlay', phoneLayout = false, onClose, pinned = false, onTogglePinned, currentView, dmOpen = false, dmCount = 0, onOpenSocial, onOpenNotifications, notificationSlot, onOpenSettings, onLogout, topSlot, children }: MobileSocialSheetProps) {
  const [phonePanelWidth, setPhonePanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 190;
    const saved = Number(window.localStorage.getItem(PHONE_SOCIAL_WIDTH_KEY));
    return clampPhonePanelWidth(Number.isFinite(saved) && saved > 0 ? saved : getDefaultPhonePanelWidth());
  });

  useEffect(() => {
    if (!phoneLayout || typeof window === 'undefined') return;
    setPhonePanelWidth(prev => clampPhonePanelWidth(prev));
  }, [phoneLayout]);

  const handlePhoneResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!phoneLayout || typeof window === 'undefined') return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = phonePanelWidth;
    let finalWidth = startWidth;
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const next = clampPhonePanelWidth(startWidth + (startX - moveEvent.clientX));
      finalWidth = next;
      setPhonePanelWidth(next);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      window.localStorage.setItem(PHONE_SOCIAL_WIDTH_KEY, String(Math.round(clampPhonePanelWidth(finalWidth))));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [phoneLayout, phonePanelWidth]);

  const header = onTogglePinned ? (
    <div className="mb-1.5 flex min-h-9 items-center justify-end pb-1.5">
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
          <div className="mt-2 shrink-0 pt-2">
            <div className="flex items-center justify-between gap-1">
              <UtilityButton label="DM" active={dmOpen} count={dmCount} onClick={onOpenSocial} icon={<MessageCircle size={15} />} />
              {notificationSlot ?? <UtilityButton label="Bildirim" active={currentView === 'notifications'} onClick={onOpenNotifications} icon={<Bell size={15} />} />}
              <UtilityButton label="Ayarlar" active={currentView === 'settings'} onClick={onOpenSettings} icon={<Settings size={15} />} />
              <UtilityButton label="Kapat" tone="danger" onClick={onLogout} icon={<Power size={15} />} />
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const overlayRootClass = phoneLayout
    ? `fixed inset-0 z-40 transition-[visibility] duration-200 ${open ? 'visible' : 'invisible'}`
    : `absolute inset-0 z-40 transition-[visibility] duration-200 ${open ? 'visible' : 'invisible'}`;

  return (
    <div
      className={overlayRootClass}
      onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()}
      onTouchEnd={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`absolute inset-0 transition-opacity duration-150 ${phoneLayout ? 'bg-[rgba(var(--theme-bg-rgb),0.34)]' : 'bg-[rgba(var(--theme-bg-rgb),0.10)]'} ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="Arkadas panelini kapat"
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute bottom-0 right-0 overflow-hidden px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)] transition-[transform,opacity] duration-150 ease-out ${phoneLayout ? 'inset-y-0 h-full dm-glass-panel dm-mobile-solid-panel rounded-none border-y-0 border-r-0' : 'inset-y-0 h-full w-[clamp(168px,15vw,190px)]'} ${open ? 'translate-x-0 opacity-100' : 'translate-x-[104%] opacity-80'}`}
        style={phoneLayout ? { width: phonePanelWidth } : OVERLAY_PANEL_STYLE}
        aria-hidden={!open}
      >
        {phoneLayout && (
          <div
            className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize touch-none"
            onPointerDown={handlePhoneResizeStart}
            aria-hidden="true"
          >
            <span className="absolute left-0 top-1/2 h-14 w-px -translate-y-1/2 rounded-full bg-[rgba(var(--glass-tint),0.18)]" />
          </div>
        )}
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {header}
          {topSlot && <div className="mb-2 shrink-0">{topSlot}</div>}
          <div className="min-h-0 flex-1 overflow-hidden">
            {children}
          </div>
          <div className="mt-2 shrink-0 pt-2">
            <div className="flex items-center justify-between gap-1">
              <UtilityButton label="DM" active={dmOpen} count={dmCount} onClick={onOpenSocial} icon={<MessageCircle size={15} />} />
              {notificationSlot ?? <UtilityButton label="Bildirim" active={currentView === 'notifications'} onClick={onOpenNotifications} icon={<Bell size={15} />} />}
              <UtilityButton label="Ayarlar" active={currentView === 'settings'} onClick={onOpenSettings} icon={<Settings size={15} />} />
              <UtilityButton label="Kapat" tone="danger" onClick={onLogout} icon={<Power size={15} />} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

const UtilityButton = React.memo(function UtilityButton({
  icon,
  label,
  active,
  count,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  tone?: 'danger';
  onClick?: () => void;
}) {
  const showCount = typeof count === 'number' && count > 0 && !active;
  return (
    <button
      type="button"
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onClick={onClick}
      className={`relative flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors active:scale-[0.98] ${
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
      {showCount && (
        <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[var(--theme-accent)] px-[4px] text-[8px] font-black leading-none text-white shadow-[0_2px_8px_rgba(var(--theme-accent-rgb),0.38)]">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
});
