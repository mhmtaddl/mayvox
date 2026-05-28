import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AudioLines, Bell, Check, Gamepad2, HeadphoneOff, Headphones, Home, MessageCircle, Mic, MicOff, PhoneOff, Settings, UserRound } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';
import AvatarContent from '../../components/AvatarContent';
import { resolveAvatarUrls } from '../../lib/statusAvatar';
import { useSettings } from '../../contexts/SettingsCtx';
import { useAppState } from '../../contexts/AppStateContext';
import { useUI } from '../../contexts/UIContext';
import { useUser } from '../../contexts/UserContext';
import { useAudio } from '../../contexts/AudioContext';
import { getRoomModeConfig } from '../../lib/roomModeConfig';
import { getDefaultChannelIconColor } from '../../lib/channelIconColor';
import { getDefaultChannelIconName } from '../../lib/channelIcon';
import { channelIconComponents, roomModeIcons } from '../chatview/constants';
import { shouldShowAppHelp } from '../../lib/appHelpPreferences';

interface MobileBottomBarProps {
  phoneLayout?: boolean;
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeChannelName?: string;
  hasActiveChannel?: boolean;
  activeChannelMode?: string;
  activeChannelIconName?: string;
  activeChannelIconColor?: string;
  cardStyle?: string;
  forceShowHomeButton?: boolean;
  userAvatarUrl?: string;
  userLabel?: string;
  userStatusText?: string;
  currentView?: MobileShellView;
  onGoHome?: () => void;
  onOpenChannels?: () => void;
  onOpenRoom?: () => void;
  onReturnToRoom?: () => void;
  onOpenDiscover?: () => void;
  onOpenSocial?: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
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
  onCycleCardStyle?: () => void;
  onPttFloatingEnabledChange?: (enabled: boolean) => void;
}

const PROFILE_BUTTON_STYLE = {
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
};

const PROFILE_MENU_STYLE = {
  background: 'linear-gradient(180deg, rgba(var(--glass-tint),0.080), rgba(var(--glass-tint),0.034)), rgba(var(--theme-bg-rgb),0.58)',
  border: '1px solid rgba(var(--glass-tint),0.14)',
  boxShadow: '0 18px 42px rgba(0,0,0,0.34), inset 0 1px 0 rgba(var(--glass-tint),0.10)',
  backdropFilter: 'blur(20px) saturate(130%)',
  WebkitBackdropFilter: 'blur(20px) saturate(130%)',
};

const DOCK_SHELL_STYLE = {
  background: 'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.026)), rgba(var(--theme-bg-rgb),0.50)',
  boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.075), 0 8px 20px rgba(0,0,0,0.16)',
  backdropFilter: 'blur(12px) saturate(120%)',
  WebkitBackdropFilter: 'blur(12px) saturate(120%)',
};

export default function MobileBottomBar({
  phoneLayout = false,
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeChannelName,
  hasActiveChannel,
  activeChannelMode,
  activeChannelIconName,
  activeChannelIconColor,
  cardStyle = 'current',
  forceShowHomeButton = false,
  userAvatarUrl,
  userLabel,
  userStatusText,
  currentView,
  onGoHome,
  onOpenRoom,
  onReturnToRoom,
  onOpenSocial,
  onOpenNotifications,
  onOpenSettings,
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
  onCycleCardStyle,
  onPttFloatingEnabledChange,
}: MobileBottomBarProps) {
  const { voiceMode, setVoiceMode } = useSettings();
  const { mobileVoiceModeOverride, setMobileVoiceModeOverride } = useAudio();
  const { isBroadcastListener, voiceDisabledReason, timedOutUntil } = useAppState();
  const { setToastMsg } = useUI();
  const { currentUser } = useUser();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [serverAvatarFailed, setServerAvatarFailed] = useState(false);
  const [serverAvatarIndex, setServerAvatarIndex] = useState(0);
  const serverLabel = activeServerName || 'MAYVox';
  const serverInitial = (activeServerShortName || serverLabel).trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const serverActive = currentView === 'home';
  const displayedUserLabel = userLabel || 'Profil';
  const displayedStatus = userStatusText || 'Online';
  const serverAvatarUrls = useMemo(() => resolveAvatarUrls(activeServerAvatarUrl), [activeServerAvatarUrl]);
  const activeServerAvatarSrc = serverAvatarUrls[serverAvatarIndex] || '';
  const canShowServerAvatar = !!activeServerAvatarSrc && !serverAvatarFailed;
  const roomConnected = !!hasActiveChannel;
  const showHomeButton = currentView !== 'home' || forceShowHomeButton;
  const showReturnButton = roomConnected && currentView !== 'room';
  const roomMode = getRoomModeConfig(activeChannelMode).id;
  const RoomIcon = channelIconComponents[activeChannelIconName ?? getDefaultChannelIconName(roomMode)] || roomModeIcons[roomMode] || Gamepad2;
  const roomIconColor = activeChannelIconColor ?? getDefaultChannelIconColor(roomMode);
  const roomName = activeChannelName || 'Sohbet odası';
  const isVoiceBlocked = voiceDisabledReason !== null;
  const timeoutRemaining = voiceDisabledReason === 'timeout' && timedOutUntil
    ? Math.max(0, Math.ceil((new Date(timedOutUntil).getTime() - Date.now()) / 1000))
    : null;
  const voiceBlockedLabel =
    voiceDisabledReason === 'server_muted' ? 'Bu sunucuda susturuldunuz'
    : voiceDisabledReason === 'timeout' ? (timeoutRemaining ? `Zamanaşımı aktif: ${Math.ceil(timeoutRemaining / 60)} dk` : 'Zamanaşımı aktif')
    : voiceDisabledReason === 'kicked' ? 'Odadan çıkarıldınız'
    : voiceDisabledReason === 'banned' ? 'Sunucuya erişiminiz kaldırıldı'
    : '';
  const isAdminMuted = currentUser.isMuted === true;
  const activeVoiceConfig = roomConnected ? getRoomModeConfig(activeChannelMode).voice : null;
  const allowedVoiceModes = activeVoiceConfig?.allowedModes ?? ['ptt', 'vad'];
  const effectiveVoiceMode = mobileVoiceModeOverride && allowedVoiceModes.includes(mobileVoiceModeOverride)
    ? mobileVoiceModeOverride
    : activeVoiceConfig?.defaultMode ?? (allowedVoiceModes.includes(voiceMode) ? voiceMode : voiceMode);
  const canSwitchVoiceMode = allowedVoiceModes.length > 1;
  const showFloatingPtt = roomConnected && effectiveVoiceMode === 'ptt' && !isVoiceBlocked && !isBroadcastListener && !isAdminMuted;
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

  useEffect(() => {
    if (!profileMenuOpen || typeof window === 'undefined') return;
    (window as typeof window & { __mayvoxProfileMenuOpen?: boolean }).__mayvoxProfileMenuOpen = true;
    const closeProfileMenu = () => {
      (window as typeof window & { __mayvoxProfileMenuBackHandledAt?: number }).__mayvoxProfileMenuBackHandledAt = Date.now();
      setProfileMenuOpen(false);
    };
    window.addEventListener('mayvox:android-back', closeProfileMenu);
    return () => {
      (window as typeof window & { __mayvoxProfileMenuOpen?: boolean }).__mayvoxProfileMenuOpen = false;
      window.removeEventListener('mayvox:android-back', closeProfileMenu);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    onPttFloatingEnabledChange?.(showFloatingPtt);
    return () => onPttFloatingEnabledChange?.(false);
  }, [onPttFloatingEnabledChange, showFloatingPtt]);

  useEffect(() => {
    if (!roomConnected || !canSwitchVoiceMode || typeof window === 'undefined') return;
    if (shouldShowAppHelp('mobile-voice-mode')) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mayvox:mobile-help', {
          detail: {
            id: 'mobile-voice-mode',
            anchor: 'voice-mode',
            message: 'Bu tuşla Bas-Konuş ve Ses Etkinliği arasında geçebilirsin.',
          },
        }));
      }, 0);
    }
  }, [canSwitchVoiceMode, roomConnected, setToastMsg]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHelpChanged = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled: boolean }>).detail?.enabled;
      if (!enabled) return;
      if (roomConnected && canSwitchVoiceMode && shouldShowAppHelp('mobile-voice-mode')) {
        window.dispatchEvent(new CustomEvent('mayvox:mobile-help', {
          detail: {
            id: 'mobile-voice-mode',
            anchor: 'voice-mode',
            message: 'Bu tuşla Bas-Konuş ve Ses Etkinliği arasında geçebilirsin.',
          },
        }));
      }
    };
    window.addEventListener('mayvox:app-help-changed', onHelpChanged);
    return () => window.removeEventListener('mayvox:app-help-changed', onHelpChanged);
  }, [canSwitchVoiceMode, roomConnected]);

  const handleProfileButtonClick = useCallback(() => {
    setProfileMenuOpen(open => !open);
  }, []);

  const closeProfileMenu = useCallback(() => setProfileMenuOpen(false), []);

  const handleMicClick = useCallback(() => {
    if (isVoiceBlocked) {
      if (voiceBlockedLabel) setToastMsg(voiceBlockedLabel);
      return;
    }
    if (isBroadcastListener) {
      setToastMsg('Bu odada yalnızca konuşmacılar yayın yapabilir.');
      return;
    }
    if (isAdminMuted) return;
    onToggleMute?.();
  }, [isAdminMuted, isBroadcastListener, isVoiceBlocked, onToggleMute, setToastMsg, voiceBlockedLabel]);

  const toggleVoiceMode = useCallback(() => {
    if (!canSwitchVoiceMode) return;
    (window as typeof window & { __mayvoxSuppressPttUntil?: number }).__mayvoxSuppressPttUntil = Date.now() + 650;
    const nextMode = effectiveVoiceMode === 'vad' ? 'ptt' : 'vad';
    onPttChange?.(false);
    setVoiceMode(nextMode);
    setMobileVoiceModeOverride(nextMode);
    window.setTimeout(() => onPttChange?.(false), 0);
  }, [canSwitchVoiceMode, effectiveVoiceMode, onPttChange, setMobileVoiceModeOverride, setVoiceMode]);

  const handleOpenAccountSettings = useCallback(() => {
    setProfileMenuOpen(false);
    onOpenAccountSettings?.();
  }, [onOpenAccountSettings]);

  return (
    <footer
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom)+8px)] ${phoneLayout ? 'px-2' : 'px-3'}`}
    >
      {profileMenuOpen && (
        <>
          <button
            type="button"
            className="pointer-events-auto fixed inset-0 z-20 cursor-default bg-transparent"
            aria-label="Durum menüsünü kapat"
            onClick={closeProfileMenu}
          />
          <div
            className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+74px)] left-1/2 z-30 w-[238px] -translate-x-1/2 overflow-hidden rounded-[18px]"
            style={PROFILE_MENU_STYLE}
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

            <div className="mx-3 h-px bg-[rgba(var(--glass-tint),0.13)]" />

            <div className="p-2">
              <button
                type="button"
                onClick={handleOpenAccountSettings}
                className="flex min-h-[36px] w-full items-center gap-2 rounded-[10px] px-2 text-left text-[11.5px] font-bold text-[var(--theme-text)]/84 transition-colors hover:bg-[var(--glass-tint)]/6"
              >
                <Settings size={13} className="text-[var(--theme-secondary-text)]/70" />
                <span>Hesap Ayarları</span>
              </button>
            </div>
          </div>
        </>
      )}

      <div
        className={`pointer-events-auto mx-auto flex items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 py-0 ${phoneLayout ? 'min-h-[48px] w-full max-w-none' : 'min-h-[44px] w-fit max-w-[min(760px,calc(100vw-360px))]'}`}
        style={DOCK_SHELL_STYLE}
      >
        <div className={`custom-scrollbar flex min-w-0 max-w-full items-center overflow-x-auto overflow-y-hidden pb-0.5 ${phoneLayout ? 'w-full justify-start gap-1.5' : 'justify-start gap-1'}`}>
          <button
            type="button"
            onClick={handleProfileButtonClick}
            className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-[12px] px-1 text-left transition-colors duration-200 active:scale-[0.98] ${phoneLayout ? 'min-w-9 max-w-9 justify-center' : 'min-w-[108px] max-w-[138px]'} ${
              profileMenuOpen ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/74'
            }`}
            style={PROFILE_BUTTON_STYLE}
            aria-pressed={profileMenuOpen}
            aria-label="Durum"
            title="Durum"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden avatar-squircle">
              {userAvatarUrl || userLabel ? (
                <AvatarContent
                  avatar={userAvatarUrl || ''}
                  statusText={displayedStatus}
                  firstName={displayedUserLabel}
                  name={displayedUserLabel}
                  imgClassName="h-full w-full object-cover"
                  letterClassName="text-[10px] font-black text-[var(--theme-accent)]"
                />
              ) : (
                <UserRound size={16} />
              )}
            </span>
            <span className={`min-w-0 flex-1 items-center gap-1 ${phoneLayout ? 'hidden' : 'flex'}`}>
              <span className={`min-w-0 flex-none max-w-[76px] truncate text-[11px] font-black leading-tight ${profileMenuOpen ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)]/90'}`}>{displayedUserLabel}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass}`} aria-hidden="true" title={displayedStatus} />
            </span>
          </button>

          <button
            type="button"
            onClick={onGoHome}
            className={`relative flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] font-black transition-colors duration-200 active:scale-[0.98] ${
              serverActive ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/74'
            }`}
            style={PROFILE_BUTTON_STYLE}
            aria-pressed={serverActive}
            aria-label={serverLabel}
            title={serverLabel}
          >
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden avatar-squircle">
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
                <span className={`${serverActive ? 'text-[12px]' : 'text-[11px]'} leading-none`}>{serverInitial}</span>
              )}
            </span>
          </button>

          <span className="mx-0.5 h-6 w-px shrink-0 bg-[rgba(var(--glass-tint),0.10)]" aria-hidden="true" />

          <DockButton
            icon={(isMuted || isAdminMuted || isVoiceBlocked) ? <MicOff size={15} /> : <Mic size={15} />}
            label={isVoiceBlocked ? voiceBlockedLabel || 'Mikrofon kilitli' : isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
            active={!!isMuted || isAdminMuted || isVoiceBlocked}
            tone={(isMuted || isAdminMuted || isVoiceBlocked) ? 'danger' : undefined}
            onClick={handleMicClick}
          />
          <DockButton icon={isDeafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />} label="Kulaklik" active={!!isDeafened} tone={isDeafened ? 'danger' : undefined} onClick={onToggleDeafen} />

          {roomConnected && (
            <>
              <DockButton
                icon={<NoiseIcon active={!!isNoiseSuppressionEnabled} />}
                label={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}
                active={false}
                onClick={onToggleNoiseSuppression}
              />
              {effectiveVoiceMode === 'vad' && (
                <DockButton icon={<Mic size={15} />} label="Ses Etkinliği" active underline={false} onClick={toggleVoiceMode} />
              )}
              {canSwitchVoiceMode && (
                <DockButton icon={<span className="text-[12px] font-black leading-none">⇄</span>} label={effectiveVoiceMode === 'vad' ? 'Bas-Konuşa geç' : 'Ses Etkinliğine geç'} onClick={toggleVoiceMode} helpAnchor="voice-mode" />
              )}
              {currentView === 'room' && onCycleCardStyle && (
                <DockButton icon={<CardStyleIcon cardStyle={cardStyle} />} label="Oda kart görünümü" onClick={onCycleCardStyle} />
              )}
              <span className="mx-0.5 h-6 w-px shrink-0 bg-[rgba(var(--glass-tint),0.10)]" aria-hidden="true" />
              <DockButton icon={<PhoneOff size={15} />} label="Çağrıdan Ayrıl" active tone="danger" onClick={onLeaveRoom} />
            </>
          )}

          {showReturnButton && (
            <DockButton
              icon={<RoomIcon size={15} style={{ color: roomIconColor }} />}
              label={`${roomName} odasına dön`}
              active
              underline={false}
              onClick={onReturnToRoom ?? onOpenRoom}
            />
          )}

          {showHomeButton && (
            <>
              <span className="mx-0.5 h-6 w-px shrink-0 bg-[rgba(var(--glass-tint),0.10)]" aria-hidden="true" />
              <DockButton icon={<Home size={15} />} label="Sunucu ana sayfası" onClick={onGoHome} helpAnchor="home" />
            </>
          )}

          {phoneLayout && (
            <>
              <span className="mx-0.5 h-6 w-px shrink-0 bg-[rgba(var(--glass-tint),0.10)]" aria-hidden="true" />
              <DockButton icon={<MessageCircle size={15} />} label="Mesajlar" active={currentView === 'social'} onClick={onOpenSocial} />
              <DockButton icon={<Bell size={15} />} label="Bildirimler" active={currentView === 'notifications'} onClick={onOpenNotifications} />
              <DockButton icon={<Settings size={15} />} label="Ayarlar" active={currentView === 'settings'} onClick={onOpenSettings} />
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

const DockButton = React.memo(function DockButton({
  icon,
  label,
  active,
  disabled,
  tone,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  underline = true,
  helpAnchor,
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
  underline?: boolean;
  helpAnchor?: string;
}) {
  return (
    <button
      type="button"
      data-mobile-help-anchor={helpAnchor}
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
      className={`relative flex shrink-0 items-center justify-center transition-[transform,color,background,border-color,box-shadow,opacity] duration-200 ease-out active:scale-[0.96] disabled:opacity-35 ${
        tone === 'danger'
          ? 'text-red-300/76'
          : active
            ? 'text-[var(--theme-accent)]'
            : 'text-[var(--theme-secondary-text)]/74'
      } h-8 w-8 translate-y-0 rounded-[11px] px-0.5`}
      style={{
        background: active
          ? tone === 'danger'
            ? 'rgba(248,113,113,0.10)'
            : 'rgba(var(--theme-accent-rgb),0.10)'
          : 'rgba(var(--glass-tint),0.040)',
        border: `1px solid ${active
          ? tone === 'danger'
            ? 'rgba(248,113,113,0.20)'
            : 'rgba(var(--theme-accent-rgb),0.18)'
          : 'rgba(var(--glass-tint),0.075)'}`,
        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.055)',
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <span className="leading-none">{icon}</span>
      {underline && active && tone !== 'danger' && <span className="absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-[var(--theme-accent)]" aria-hidden="true" />}
    </button>
  );
});

function NoiseIcon({ active }: { active: boolean }) {
  return (
    <span className="relative flex items-center justify-center">
      <AudioLines size={15} />
      {!active && <span className="absolute h-[1.5px] w-[20px] rotate-45 rounded-full bg-current opacity-55" aria-hidden="true" />}
    </span>
  );
}

function CardStyleIcon({ cardStyle }: { cardStyle: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {cardStyle === 'revolt' ? (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
          <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" opacity="0.25" />
        </>
      ) : cardStyle === 'linear' ? (
        <>
          <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2.5" fill="currentColor" opacity="0.45" />
          <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
        </>
      ) : (
        <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      )}
    </svg>
  );
}
