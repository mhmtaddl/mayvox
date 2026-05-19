import React from 'react';
import { Clock3, Gamepad2, Server } from 'lucide-react';
import AvatarContent from '../../components/AvatarContent';
import DeviceBadge from '../../components/chat/DeviceBadge';
import RoleBadge, { type VisualRole } from '../../components/RoleBadge';

export type MobileUserStatus = 'online' | 'offline' | 'idle' | 'dnd';

function getAvatarFallbackStatus(status?: MobileUserStatus, statusText?: string, subtitle?: string): string | undefined {
  const displayStatus = displayStatusText(status, statusText);
  if (displayStatus) return displayStatus;
  if (status === 'online') return 'Online';
  if (status === 'idle') return 'AFK';
  if (status === 'dnd') return 'Rahatsız Etmeyin';
  if (status === 'offline') return 'Çevrimdışı';
  return subtitle;
}

function displayStatusText(status?: MobileUserStatus, statusText?: string): string {
  if (statusText === 'Online' || statusText === 'Aktif') return 'Online';
  if (statusText === 'AFK') return 'AFK';
  if (statusText === 'Rahatsız Etmeyin') return 'Rahatsız Etmeyin';
  if (statusText === 'Çevrimdışı' || statusText === 'Cevrimdisi') return 'Çevrimdışı';
  if (status === 'idle') return 'AFK';
  if (status === 'dnd') return 'Rahatsız Etmeyin';
  if (status === 'online') return 'Online';
  return 'Çevrimdışı';
}

function compactLastSeenText(value?: string) {
  if (!value) return undefined;
  return value
    .replace(/^Son\s+gorulme:\s*/i, '')
    .replace(/^Son\s+görülme:\s*/i, '')
    .trim();
}

function statusDotClass(status?: MobileUserStatus, statusText?: string) {
  if (status === 'idle' || statusText === 'AFK') return 'bg-violet-400';
  if (status === 'dnd' || statusText === 'Rahatsız Etmeyin') return 'bg-red-400';
  if (status === 'online' || statusText === 'Online' || statusText === 'Aktif') return 'bg-emerald-400';
  return 'bg-[var(--theme-secondary-text)]/45';
}

interface MobileUserListItemProps {
  key?: unknown;
  id: string;
  name: string;
  avatarUrl?: string;
  subtitle?: string;
  statusText?: string;
  serverName?: string | null;
  gameActivity?: string;
  lastSeenText?: string;
  platform?: 'mobile' | 'desktop';
  role?: VisualRole;
  presenceLayout?: 'friend' | 'server';
  status?: MobileUserStatus;
  unreadCount?: number;
  rightSlot?: React.ReactNode;
  onClick?: (id: string, x: number, y: number) => void;
}

export default function MobileUserListItem({
  id,
  name,
  avatarUrl,
  subtitle,
  statusText,
  serverName,
  gameActivity,
  lastSeenText,
  platform,
  role = 'member',
  presenceLayout = 'server',
  status,
  unreadCount,
  rightSlot,
  onClick,
}: MobileUserListItemProps) {
  const avatarFallbackStatus = getAvatarFallbackStatus(status, statusText, subtitle);
  const compactLastSeen = status === 'offline' ? compactLastSeenText(lastSeenText) : undefined;
  const fallbackSubtitle = displayStatusText(status, statusText);
  const isFriendPresence = presenceLayout === 'friend';

  return (
    <button
      type="button"
      onClick={(event) => onClick?.(id, event.clientX, event.clientY)}
      className="group flex min-h-10 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors active:scale-[0.998]"
      style={{ background: 'transparent' }}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-visible text-[10px] font-black text-[var(--theme-text)]" style={{ background: 'transparent' }}>
        <span className="flex h-full w-full items-center justify-center overflow-hidden avatar-squircle">
          <AvatarContent avatar={avatarUrl || ''} statusText={avatarFallbackStatus} firstName={name} name={name} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" imgClassName="h-full w-full object-cover" />
        </span>
        {status && status !== 'offline' && <DeviceBadge platform={platform} size={11} className="absolute -bottom-0.5 -right-0.5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-0.5">
          <span className="min-w-0 truncate text-[10.5px] font-semibold text-[var(--theme-text)]/86">{name}</span>
          <RoleBadge role={role} size="xs" subtle variant="inlineIcon" />
        </span>
        {compactLastSeen ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px] font-medium leading-none text-[var(--theme-secondary-text)]/58">
            <Clock3 size={8} strokeWidth={2.2} className="mt-px shrink-0 text-[var(--theme-accent)]/58" />
            <span className="truncate">{compactLastSeen}</span>
          </span>
        ) : (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px] font-medium leading-none text-[var(--theme-secondary-text)]/56">
            {isFriendPresence ? (
              <>
                <DeviceBadge platform={platform} size={11} className="relative shrink-0" />
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(status, statusText)}`} aria-hidden="true" />
                <span className="truncate">{serverName || fallbackSubtitle}</span>
              </>
            ) : gameActivity ? (
              <>
                <DeviceBadge platform={platform} size={11} className="relative shrink-0" />
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(status, statusText)}`} aria-hidden="true" />
                <span className="truncate">{gameActivity}</span>
              </>
            ) : (
              <>
                <DeviceBadge platform={platform} size={11} className="relative shrink-0" />
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(status, statusText)}`} aria-hidden="true" />
                <span className="truncate">{fallbackSubtitle}</span>
              </>
            )}
          </span>
        )}
        {isFriendPresence && gameActivity && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-medium text-[var(--theme-secondary-text)]/50">
            <Gamepad2 size={9} className="shrink-0 text-[var(--theme-accent)]/58" />
            <span className="truncate">{gameActivity}</span>
          </span>
        )}
        {!isFriendPresence && serverName && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] font-medium text-[var(--theme-secondary-text)]/50">
            <Server size={9} className="shrink-0 text-[var(--theme-accent)]/58" />
            <span className="truncate">{serverName}</span>
          </span>
        )}
      </span>

      {typeof unreadCount === 'number' && unreadCount > 0 && (
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-[10px] font-black text-[var(--theme-text-on-accent,#050505)]" style={{ background: 'var(--theme-accent)' }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {rightSlot}
    </button>
  );
}
