import React, { useEffect, useMemo, useState } from 'react';
import { Check, HeadphoneOff, Headphones, Mic, MicOff, Settings, UserRound } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';
import AvatarContent from '../../components/AvatarContent';
import { resolveAvatarUrls } from '../../lib/statusAvatar';

interface MobileBottomBarProps {
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeChannelName?: string;
  userAvatarUrl?: string;
  userLabel?: string;
  userStatusText?: string;
  currentView?: MobileShellView;
  onGoHome?: () => void;
  onOpenChannels?: () => void;
  onOpenRoom?: () => void;
  onOpenDiscover?: () => void;
  onOpenProfile?: () => void;
  onOpenAccountSettings?: () => void;
  onChangeStatus?: (status: string) => void;
  onLeaveRoom?: () => void;
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
  activeServerAvatarUrl,
  activeServerShortName,
  activeChannelName,
  userAvatarUrl,
  userLabel,
  userStatusText,
  currentView,
  onGoHome,
  onOpenRoom,
  onOpenAccountSettings,
  onChangeStatus,
  onLeaveRoom,
  isMuted,
  isDeafened,
  isPttPressed,
  isNoiseSuppressionEnabled,
  onToggleMute,
  onToggleDeafen,
  onPttChange,
  onToggleNoiseSuppression,
}: MobileBottomBarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [serverAvatarFailed, setServerAvatarFailed] = useState(false);
  const [serverAvatarIndex, setServerAvatarIndex] = useState(0);
  const serverLabel = activeServerName || 'MAYVox';
  const serverInitial = (activeServerShortName || serverLabel).trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const serverActive = currentView === 'home';
  const displayedUserLabel = userLabel || 'Profil';
  const displayedStatus = userStatusText || 'Online';
  const serverAvatarUrls = resolveAvatarUrls(activeServerAvatarUrl);
  const activeServerAvatarSrc = serverAvatarUrls[serverAvatarIndex] || '';
  const canShowServerAvatar = !!activeServerAvatarSrc && !serverAvatarFailed;
  const statusDotClass =
    displayedStatus === 'AFK' ? 'bg-violet-400'
    : displayedStatus === 'Rahatsız Etmeyin' ? 'bg-red-400'
    : displayedStatus === 'Çevrimdışı' ? 'bg-[var(--theme-secondary-text)]/45'
    : 'bg-emerald-400';
  const statusOptions = useMemo(() => ([
    { key: 'Online', label: 'Çevrimiçi', dotClass: 'bg-emerald-400' },
    { key: 'AFK', label: 'AFK', dotClass: 'bg-violet-400' },
    { key: 'Rahatsız Etmeyin', label: 'Rahatsız Etmeyin', dotClass: 'bg-red-400' },
    { key: 'Çevrimdışı', label: 'Çevrimdışı', dotClass: 'bg-[var(--theme-secondary-text)]/45' },
  ]), []);

  useEffect(() => {
    setServerAvatarFailed(false);
    setServerAvatarIndex(0);
  }, [activeServerAvatarUrl]);

  const handleProfileButtonClick = () => {
    setProfileMenuOpen(open => !open);
  };

  return (
    <footer
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)]"
    >
      {profileMenuOpen && (
        <div
          className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+74px)] left-1/2 z-30 w-[238px] -translate-x-1/2 overflow-hidden rounded-[18px]"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.022)), rgba(var(--theme-bg-rgb),0.86)',
            border: '1px solid rgba(var(--glass-tint),0.11)',
            boxShadow: '0 18px 42px rgba(0,0,0,0.30), inset 0 1px 0 rgba(var(--glass-tint),0.08)',
            backdropFilter: 'blur(16px) saturate(125%)',
            WebkitBackdropFilter: 'blur(16px) saturate(125%)',
          }}
          onClick={event => event.stopPropagation()}
        >
          <div className="px-2 pb-1 pt-2">
            <span className="mb-1 block px-2 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/58">
              Durum
            </span>
            <div className="flex flex-col gap-0.5">
              {statusOptions.map(option => {
                const active = displayedStatus === option.key || (option.key === 'Online' && displayedStatus === 'Aktif');
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      onChangeStatus?.(option.key);
                      setProfileMenuOpen(false);
                    }}
                    className={`flex min-h-[36px] items-center justify-between rounded-[10px] px-2 text-left transition-colors ${
                      active ? 'bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/84 hover:bg-[var(--glass-tint)]/6'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${option.dotClass}`} aria-hidden="true" />
                      <span className="text-[11.5px] font-bold">{option.label}</span>
                    </span>
                    {active && <Check size={12} className="text-[var(--theme-accent)]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-3 h-px bg-[var(--glass-tint)]/10" />

          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                setProfileMenuOpen(false);
                onOpenAccountSettings?.();
              }}
              className="flex min-h-[36px] w-full items-center gap-2 rounded-[10px] px-2 text-left text-[11.5px] font-bold text-[var(--theme-text)]/84 transition-colors hover:bg-[var(--glass-tint)]/6"
            >
              <Settings size={13} className="text-[var(--theme-secondary-text)]/70" />
              <span>Hesap Ayarları</span>
            </button>
          </div>
        </div>
      )}

      <div
        className="pointer-events-auto mx-auto flex min-h-[58px] w-fit max-w-[min(760px,calc(100vw-420px))] items-center justify-center gap-2 rounded-[18px] px-2.5 py-1"
        style={{
          background: 'rgba(var(--theme-bg-rgb),0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.055), 0 10px 26px rgba(0,0,0,0.16)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex min-w-0 items-center justify-center gap-1">
          <button
            type="button"
            onClick={handleProfileButtonClick}
            className={`relative mx-1 flex h-12 min-w-[138px] max-w-[176px] shrink-0 items-center gap-2 rounded-[14px] px-2.5 text-left transition-colors duration-200 active:scale-[0.98] ${
              profileMenuOpen ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/74'
            }`}
            style={{
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
            aria-pressed={profileMenuOpen}
            aria-label="Durum"
            title="Durum"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden avatar-squircle">
              {userAvatarUrl || userLabel ? (
                <AvatarContent
                  avatar={userAvatarUrl || ''}
                  statusText={displayedStatus}
                  firstName={displayedUserLabel}
                  name={displayedUserLabel}
                  imgClassName="h-full w-full object-cover"
                  letterClassName="text-[11px] font-black text-[var(--theme-accent)]"
                />
              ) : (
                <UserRound size={17} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[11px] font-black leading-tight ${profileMenuOpen ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/86'}`}>{displayedUserLabel}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[9px] font-bold leading-none text-[var(--theme-secondary-text)]/58">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass}`} aria-hidden="true" />
                <span className="truncate">{displayedStatus}</span>
              </span>
            </span>
            {profileMenuOpen && <span className="absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
          </button>

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
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden avatar-squircle">
              {canShowServerAvatar ? (
                <img
                  src={activeServerAvatarSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (serverAvatarIndex + 1 < serverAvatarUrls.length) {
                      setServerAvatarIndex(index => index + 1);
                      return;
                    }
                    setServerAvatarFailed(true);
                  }}
                  draggable={false}
                />
              ) : (
                <span className={`${serverActive ? 'text-[15px]' : 'text-[13px]'} leading-none`}>{serverInitial}</span>
              )}
            </span>
            {serverActive && <span className="absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
          </button>

          <DockButton icon={isMuted ? <MicOff size={17} /> : <Mic size={17} />} label="Mikrofon" active={!!isMuted} tone={isMuted ? 'danger' : undefined} onClick={onToggleMute} />
          <DockButton icon={isDeafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />} label="Kulaklik" active={!!isDeafened} tone={isDeafened ? 'danger' : undefined} onClick={onToggleDeafen} />
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
