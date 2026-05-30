import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Coffee, Compass, Crown, MoreVertical, Pin, Shield, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import AvatarContent from '../../components/AvatarContent';
import DeviceBadge from '../../components/chat/DeviceBadge';
import { getUserRoleBadge } from '../../components/RoleBadge';
import type { VisualRole } from '../../components/RoleBadge';
import { getPublicDisplayName } from '../../lib/formatName';
import { hasCustomAvatar } from '../../lib/statusAvatar';
import type { User } from '../../types';
import { channelIconComponents, roomModeIcons } from '../chatview/constants';

const MOBILE_CHANNEL_WINDOW = 28;
const PHONE_CHANNEL_WIDTH_KEY = 'mayvox.mobilePhone.channelPanelWidth';
const ConnectionQualityIndicator = React.lazy(() => import('../../components/chat/ConnectionQualityIndicator'));

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

function MobileRoleIcon({ role }: { role: VisualRole }) {
  if (role === 'member') return null;
  const meta = {
    owner: { label: 'Kurucu', Icon: Crown, className: 'text-amber-300/76' },
    admin: { label: 'Yonetici', Icon: ShieldCheck, className: 'text-cyan-300/76' },
    mod: { label: 'Moderator', Icon: Shield, className: 'text-violet-300/76' },
  }[role];

  if (!meta) return null;
  const { Icon } = meta;
  return (
    <Icon
      size={9.5}
      strokeWidth={2.25}
      aria-label={meta.label}
      className={`${meta.className} shrink-0 opacity-78`}
    />
  );
}

export interface MobileChannelSheetItem {
  id: string;
  name: string;
  type?: string;
  iconName?: string;
  iconColor?: string;
  active?: boolean;
  memberCount?: number;
  members?: User[];
}

interface MobileChannelSheetProps {
  open?: boolean;
  variant?: 'overlay' | 'inline';
  phoneLayout?: boolean;
  channels?: MobileChannelSheetItem[];
  onClose?: () => void;
  onSelectChannel?: (id: string) => void;
  onOpenChannelMenu?: (id: string, position: { x: number; y: number }) => void;
  onCreateChannel?: () => void;
  createDisabled?: boolean;
  createTitle?: string;
  pinned?: boolean;
  onTogglePinned?: () => void;
  onOpenDiscover?: () => void;
  connectionLevel?: number;
  connectionLatencyMs?: number;
  connectionJitterMs?: number;
  isConnecting?: boolean;
  isActiveChannel?: boolean;
}

export default function MobileChannelSheet({
  open = false,
  variant = 'overlay',
  phoneLayout = false,
  channels = [],
  onClose,
  onSelectChannel,
  onOpenChannelMenu,
  onCreateChannel,
  createDisabled = false,
  createTitle,
  pinned = false,
  onTogglePinned,
  onOpenDiscover,
  connectionLevel = 4,
  connectionLatencyMs,
  connectionJitterMs,
  isConnecting = false,
  isActiveChannel = false,
}: MobileChannelSheetProps) {
  const deferredChannels = useDeferredValue(channels);
  const [phonePanelWidth, setPhonePanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 190;
    const saved = Number(window.localStorage.getItem(PHONE_CHANNEL_WIDTH_KEY));
    return clampPhonePanelWidth(Number.isFinite(saved) && saved > 0 ? saved : getDefaultPhonePanelWidth());
  });
  const visibleChannels = useMemo(() => deferredChannels.slice(0, MOBILE_CHANNEL_WINDOW), [deferredChannels]);
  const hiddenChannelCount = Math.max(0, deferredChannels.length - visibleChannels.length);

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
      const next = clampPhonePanelWidth(startWidth + (moveEvent.clientX - startX));
      finalWidth = next;
      setPhonePanelWidth(next);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      window.localStorage.setItem(PHONE_CHANNEL_WIDTH_KEY, String(Math.round(clampPhonePanelWidth(finalWidth))));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [phoneLayout, phonePanelWidth]);
  const panelContent = (
    <>
      <div className="mb-1.5 flex min-h-9 items-center justify-between pb-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[var(--theme-secondary-text)]/54">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]">
            <Volume2 size={14} />
          </span>
          <h2 className="truncate text-[11px] font-black uppercase tracking-[0.12em]">Ses Kanallari</h2>
        </div>
        {onTogglePinned && (
          <button
            type="button"
            onClick={onTogglePinned}
            aria-label={pinned ? 'Panel sabitlemesini kaldir' : 'Paneli sabitle'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${pinned ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/45'}`}
          >
            <Pin size={13} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {visibleChannels.length > 0 ? (
            <>
              {visibleChannels.map(channel => (
                <MobileChannelRow
                  key={channel.id}
                  channel={channel}
                  onSelectChannel={onSelectChannel}
                  onOpenChannelMenu={onOpenChannelMenu}
                />
              ))}
              {hiddenChannelCount > 0 && (
                <div className="px-2 py-1.5 text-center text-[9.5px] font-bold text-[var(--theme-secondary-text)]/42">
                  +{hiddenChannelCount} oda daha
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl px-3 py-3 text-[11px] font-medium text-[var(--theme-secondary-text)]/62" style={{ background: 'rgba(var(--glass-tint),0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.04)' }}>
              Kanal bulunamadi
            </div>
          )}
        </div>

        {onCreateChannel && (
          <div className="mt-1.5 border-t border-[rgba(var(--glass-tint),0.07)] pt-1.5">
            <button
              type="button"
              onClick={onCreateChannel}
              disabled={createDisabled}
              title={createTitle}
              className={`flex min-h-8 w-full items-center gap-1.5 rounded-[9px] px-2 py-1 text-left transition-colors active:scale-[0.998] ${
                createDisabled
                  ? 'cursor-pointer text-[var(--theme-secondary-text)]/45'
                  : 'text-[var(--theme-secondary-text)]/74'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <Sparkles size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">Oda Olustur</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-auto shrink-0 pt-2">
        <button
          type="button"
          onClick={onOpenDiscover}
          className="mx-auto flex min-h-8 w-fit items-center justify-center gap-1.5 rounded-[9px] px-2 py-1 text-center text-[var(--theme-secondary-text)]/72 transition-colors active:scale-[0.998]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--theme-accent)]/82">
            <Compass size={14} />
          </span>
          <span className="min-w-0 truncate text-[11.5px] font-semibold">Topluluk Kesfet</span>
        </button>
        <div className="mt-1 flex items-center justify-center gap-3 px-2 text-[9.5px] font-bold text-[var(--theme-secondary-text)]/46">
          <span>v2.2.9</span>
          <span className="flex items-center gap-1.5">
            <React.Suspense fallback={<span className="inline-block h-4 w-4" />}>
              <ConnectionQualityIndicator
                connectionLevel={connectionLevel}
                latencyMs={connectionLatencyMs}
                jitterMs={connectionJitterMs}
                isConnecting={isConnecting}
                isActive={isActiveChannel}
              />
            </React.Suspense>
          </span>
        </div>
      </div>
    </>
  );

  if (variant === 'inline') {
    if (!open) return null;
    return (
      <aside
        className="flex h-full min-h-0 w-[clamp(168px,15vw,190px)] shrink-0 flex-col overflow-hidden px-2 pb-2.5 pt-1"
        onClick={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()}
        style={{
          background: 'transparent',
          boxShadow: 'inset -1px 0 0 rgba(var(--glass-tint),0.045)',
        }}
      >
        {panelContent}
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
        aria-label="Kanal panelini kapat"
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute bottom-0 left-0 flex min-h-0 flex-col overflow-hidden px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)] transition-[transform,opacity] duration-150 ease-out ${phoneLayout ? 'inset-y-0 h-full dm-glass-panel dm-mobile-solid-panel rounded-none border-y-0 border-l-0' : 'inset-y-0 h-full w-[clamp(168px,15vw,190px)]'} ${open ? 'translate-x-0 opacity-100' : '-translate-x-[104%] opacity-80'}`}
        style={phoneLayout ? { width: phonePanelWidth } : {
          background: 'rgba(var(--theme-bg-rgb),0.06)',
          boxShadow: 'inset -1px 0 0 rgba(var(--glass-tint),0.045)',
        }}
        aria-hidden={!open}
      >
        {panelContent}
        {phoneLayout && (
          <div
            className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize touch-none"
            onPointerDown={handlePhoneResizeStart}
            aria-hidden="true"
          >
            <span className="absolute right-0 top-1/2 h-14 w-px -translate-y-1/2 rounded-full bg-[rgba(var(--glass-tint),0.18)]" />
          </div>
        )}
    </aside>
    </div>
  );
}

const MobileChannelRow = React.memo(function MobileChannelRow({
  channel,
  onSelectChannel,
  onOpenChannelMenu,
}: {
  channel: MobileChannelSheetItem;
  onSelectChannel?: (id: string) => void;
  onOpenChannelMenu?: (id: string, position: { x: number; y: number }) => void;
}) {
  const mode = channel.type || 'social';
  const Icon = channelIconComponents[channel.iconName || ''] || roomModeIcons[mode] || Coffee;
  const iconColor = channel.iconColor || 'var(--theme-accent)';
  return (
    <div
      className="group relative overflow-hidden rounded-[9px] active:scale-[0.998]"
      style={{
        background: channel.active ? 'rgba(var(--theme-accent-rgb),0.055)' : 'transparent',
      }}
    >
      {channel.active && <span className="absolute inset-y-2 left-0 w-px rounded-r-full bg-[var(--theme-accent)]/70" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => onSelectChannel?.(channel.id)}
        className={`flex min-h-8 w-full items-center gap-1.5 px-2 py-0.5 text-left ${onOpenChannelMenu ? 'pr-6' : ''}`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <Icon size={15} className="opacity-90" style={{ color: iconColor }} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--theme-text)]/86">{channel.name}</span>
        {typeof channel.memberCount === 'number' && channel.memberCount > 0 && (
          <span className="mr-0.5 text-[9.5px] font-bold text-[var(--theme-secondary-text)]/42">{channel.memberCount}</span>
        )}
      </button>
      {onOpenChannelMenu && (
        <button
          type="button"
          className="absolute right-0.5 top-1 flex h-6 w-5 items-center justify-center rounded-[8px] text-[var(--theme-secondary-text)]/46 transition-colors hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]/76 active:scale-[0.96]"
          aria-label={`${channel.name} oda seçenekleri`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenChannelMenu(channel.id, { x: rect.right + 6, y: rect.top });
          }}
        >
          <MoreVertical size={13} />
        </button>
      )}
      {channel.members && channel.members.length > 0 && (
        <div className="space-y-0.5 pb-1 pl-8 pr-1.5">
          {channel.members.slice(0, (channel.memberCount ?? channel.members.length) > 5 ? 4 : 5).map(member => (
            <ChannelMemberPreview
              key={`${channel.id}-${member.id}`}
              channelId={channel.id}
              member={member}
              onSelectChannel={onSelectChannel}
            />
          ))}
          {(channel.memberCount ?? channel.members.length) > 5 && (
            <ChannelMembersOverflow
              channelId={channel.id}
              count={(channel.memberCount ?? channel.members.length) - 4}
              onSelectChannel={onSelectChannel}
            />
          )}
        </div>
      )}
    </div>
  );
});

const ChannelMembersOverflow = React.memo(function ChannelMembersOverflow({
  channelId,
  count,
  onSelectChannel,
}: {
  channelId: string;
  count: number;
  onSelectChannel?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectChannel?.(channelId)}
      className="flex h-7 w-full items-center rounded-md px-1 text-left text-[10.5px] font-bold text-[var(--theme-secondary-text)]/58"
    >
      <span className="truncate">+{count} Kişi Daha</span>
    </button>
  );
});

const ChannelMemberPreview = React.memo(function ChannelMemberPreview({
  channelId,
  member,
  onSelectChannel,
}: {
  channelId: string;
  member: User;
  onSelectChannel?: (id: string) => void;
}) {
  const displayName = getPublicDisplayName(member);
  const role = getUserRoleBadge(member);
  return (
    <button
      type="button"
      onClick={() => onSelectChannel?.(channelId)}
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left text-[10.5px] font-medium text-[var(--theme-secondary-text)]/68"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden avatar-squircle" style={{ background: hasCustomAvatar(member.avatar) ? 'rgba(0,0,0,0.14)' : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)' }}>
        <AvatarContent avatar={member.avatar} statusText={member.statusText} firstName={member.displayName || member.firstName} name={displayName} letterClassName="text-[8px] font-bold text-[var(--theme-accent)]" />
        <DeviceBadge platform={member.platform} size={9} className="absolute -bottom-0.5 -right-0.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{displayName}</span>
      <MobileRoleIcon role={role} />
    </button>
  );
});
