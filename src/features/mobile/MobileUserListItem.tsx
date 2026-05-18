import React from 'react';
import { Gamepad2, Server } from 'lucide-react';
import AvatarContent from '../../components/AvatarContent';
import DeviceBadge from '../../components/chat/DeviceBadge';

export type MobileUserStatus = 'online' | 'offline' | 'idle' | 'dnd';

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
  status,
  unreadCount,
  rightSlot,
  onClick,
}: MobileUserListItemProps) {
  return (
    <button
      type="button"
      onClick={(event) => onClick?.(id, event.clientX, event.clientY)}
      className="group flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors active:scale-[0.998]"
      style={{ background: 'transparent' }}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-visible text-[10px] font-black text-[var(--theme-text)]" style={{ background: 'transparent' }}>
        <span className="flex h-full w-full items-center justify-center overflow-hidden avatar-squircle">
          <AvatarContent avatar={avatarUrl || ''} statusText={statusText || subtitle} firstName={name} name={name} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" imgClassName="h-full w-full object-cover" />
        </span>
        {status && status !== 'offline' && <DeviceBadge platform={platform} size={11} className="absolute -bottom-0.5 -right-0.5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-[var(--theme-text)]/88">{name}</span>
        <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/56">{lastSeenText || subtitle || statusText || 'Cevrimdisi'}</span>
        {(serverName || gameActivity) && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px] font-medium text-[var(--theme-secondary-text)]/50">
            {serverName && (
              <span className="flex min-w-0 items-center gap-1">
                <Server size={9} className="shrink-0 text-[var(--theme-accent)]/58" />
                <span className="truncate">{serverName}</span>
              </span>
            )}
            {gameActivity && (
              <span className="flex min-w-0 items-center gap-1">
                <Gamepad2 size={9} className="shrink-0 text-[var(--theme-accent)]/58" />
                <span className="truncate">{gameActivity}</span>
              </span>
            )}
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
