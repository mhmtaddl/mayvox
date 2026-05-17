import React from 'react';
import { Bell, Compass, HeadphoneOff, Headphones, MessageCircle, Mic, MicOff, Power, Radio, Settings, ShieldCheck, Square } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';

interface MobileBottomBarProps {
  activeServerName?: string;
  activeChannelName?: string;
  currentView?: MobileShellView;
  onGoHome?: () => void;
  onOpenChannels?: () => void;
  onOpenRoom?: () => void;
  onOpenDiscover?: () => void;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onLogout?: () => void;
  isMuted?: boolean;
  isDeafened?: boolean;
  isPttPressed?: boolean;
  isNoiseSuppressionEnabled?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onPttChange?: (pressed: boolean) => void;
  onToggleNoiseSuppression?: () => void;
}

export default function MobileBottomBar({
  activeServerName,
  activeChannelName,
  currentView,
  onGoHome,
  onOpenRoom,
  onOpenDiscover,
  onOpenSocial,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
  isMuted,
  isDeafened,
  isPttPressed,
  isNoiseSuppressionEnabled,
  onToggleMute,
  onToggleDeafen,
  onPttChange,
  onToggleNoiseSuppression,
}: MobileBottomBarProps) {
  const serverLabel = activeServerName || 'MAYVox';
  const serverInitial = serverLabel.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const hasRoom = !!activeChannelName;
  const roomMode = currentView === 'room';
  const showReturnToRoom = hasRoom && currentView !== 'room';
  const serverActive = currentView === 'home';

  return (
    <footer
      className="relative z-10 shrink-0 overflow-hidden px-3 pb-[calc(env(safe-area-inset-bottom)+4px)] pt-1.5"
      style={{
        background: 'rgba(var(--theme-bg-rgb),0.24)',
      }}
    >
      <span
        className="pointer-events-none absolute left-0 right-0 top-0 z-0 h-px"
        style={{ background: 'rgba(var(--glass-tint),0.14)' }}
        aria-hidden="true"
      />
      <div
        className="relative z-10 mx-auto flex min-h-[60px] w-full max-w-[900px] items-center justify-center gap-4 overflow-hidden px-2"
      >
        <div className="flex shrink-0 items-center gap-1">
          <DockButton icon={isMuted ? <MicOff size={17} /> : <Mic size={17} />} label="Mikrofon" active={!!isMuted} tone={isMuted ? 'danger' : undefined} onClick={onToggleMute} />
          <DockButton icon={isDeafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />} label="Kulaklik" active={!!isDeafened} tone={isDeafened ? 'danger' : undefined} onClick={onToggleDeafen} />
          {roomMode && (
            <>
              <DockButton
                icon={<Radio size={16} />}
                label="Bas konus"
                active={!!isPttPressed}
                onPointerDown={() => onPttChange?.(true)}
                onPointerUp={() => onPttChange?.(false)}
                onPointerCancel={() => onPttChange?.(false)}
              />
              <DockButton icon={<ShieldCheck size={16} />} label="Gurultu azalt" active={!!isNoiseSuppressionEnabled} onClick={onToggleNoiseSuppression} />
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-center gap-1.5">
          {showReturnToRoom && <DockButton icon={<Square size={16} />} label="Odaya don" onClick={onOpenRoom} />}

          <button
            type="button"
            onClick={onGoHome}
            className={`relative mx-0.5 flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-[13px] font-black transition-colors duration-200 active:scale-[0.98] ${
              serverActive ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/74'
            }`}
            style={{
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
            aria-pressed={serverActive}
            aria-label={serverLabel}
            title={serverLabel}
          >
            <span className={`${serverActive ? 'text-[16px]' : 'text-[14px]'} leading-none`}>{serverInitial}</span>
            <span className={`max-w-[50px] truncate text-[8.5px] font-black leading-none ${serverActive ? 'opacity-90' : 'opacity-52'}`}>Sunucu</span>
            {serverActive && <span className="absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
          </button>

          <DockButton icon={<Compass size={17} />} label="Kesif" active={currentView === 'discover'} onClick={onOpenDiscover} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1">
          <DockButton icon={<MessageCircle size={17} />} label="DM" active={currentView === 'social'} onClick={onOpenSocial} />
          <DockButton icon={<Bell size={17} />} label="Bildirim" active={currentView === 'notifications'} onClick={onOpenNotifications} />
          <DockButton icon={<Settings size={17} />} label="Ayarlar" active={currentView === 'settings'} onClick={onOpenSettings} />
          <DockButton icon={<Power size={17} />} label="Cikis" onClick={onLogout} tone="danger" />
        </div>
      </div>
    </footer>
  );
}

function DockButton({
  icon,
  label,
  active,
  disabled,
  tone,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  tone?: 'danger';
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onPointerDown={(event) => {
        if (disabled) return;
        onPointerDown?.();
        if (onPointerDown) event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (disabled) return;
        onPointerUp?.();
        if (onPointerUp && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        if (!disabled) onPointerCancel?.();
      }}
      onContextMenu={onPointerDown ? event => event.preventDefault() : undefined}
      disabled={disabled}
      className={`relative flex shrink-0 flex-col items-center justify-center gap-0.5 transition-[transform,color,background,border-color,box-shadow,opacity] duration-200 ease-out active:scale-[0.96] disabled:opacity-35 ${
        tone === 'danger'
          ? 'text-red-300/76'
          : active
            ? 'text-[var(--theme-accent)]'
            : 'text-[var(--theme-secondary-text)]/74'
      } h-12 min-w-[64px] translate-y-0 border-0 bg-transparent px-2 shadow-none`}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <span className="leading-none">{icon}</span>
      <span className={`max-w-[66px] truncate text-[8.5px] font-black leading-none ${active ? 'opacity-90' : 'opacity-52'}`}>{label}</span>
      {active && tone !== 'danger' && <span className="absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
    </button>
  );
}
