import React from 'react';
import { Activity, EyeOff, Lock, Users } from 'lucide-react';
import type { VoiceChannel } from '../../../types';

type Props = {
  channel: VoiceChannel;
  isActive?: boolean;
  hasActiveSpeaker?: boolean;
  compact?: boolean;
};

type Badge = {
  key: string;
  title: string;
  node: React.ReactNode;
  className?: string;
};

function securityBadge(channel: VoiceChannel): Badge | null {
  if (channel.password) {
    return {
      key: 'locked',
      title: 'Sifreli oda',
      node: <Lock size={10} strokeWidth={2.4} />,
      className: 'text-amber-300 border-amber-400/20 bg-amber-400/10',
    };
  }

  if (channel.isHidden) {
    return {
      key: 'hidden',
      title: 'Gizli oda',
      node: <EyeOff size={10} strokeWidth={2.4} />,
      className: 'text-violet-300 border-violet-400/20 bg-violet-400/10',
    };
  }

  if (channel.isInviteOnly) {
    return {
      key: 'private',
      title: 'Ozel oda',
      node: <Lock size={10} strokeWidth={2.4} />,
      className: 'text-[var(--theme-accent)] border-[var(--theme-accent)]/20 bg-[var(--theme-accent)]/10',
    };
  }

  return null;
}

export default function RoomStatusBadges({ channel, isActive = false, hasActiveSpeaker = false, compact = false }: Props) {
  const userCount = channel.userCount ?? 0;
  const maxUsers = channel.maxUsers ?? 0;
  const occupancy = userCount > 0
    ? {
        key: 'occupancy',
        title: maxUsers > 0 ? `${userCount}/${maxUsers} kisi` : `${userCount} kisi`,
        node: (
          <>
            <Users size={compact ? 9 : 10} strokeWidth={2.3} />
            <span>{maxUsers > 0 ? `${userCount}/${maxUsers}` : userCount}</span>
          </>
        ),
        className: isActive
          ? 'text-[var(--theme-accent)] border-[var(--theme-accent)]/20 bg-[var(--theme-accent)]/12'
          : 'text-[var(--theme-secondary-text)] border-[rgba(var(--glass-tint),0.08)] bg-[rgba(var(--glass-tint),0.045)]',
      }
    : null;

  const badges = [
    occupancy,
    securityBadge(channel),
    hasActiveSpeaker
      ? {
          key: 'speaking',
          title: 'Aktif konusma',
          node: <Activity size={compact ? 9 : 10} strokeWidth={2.4} />,
          className: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/10 animate-pulse',
        }
      : null,
  ].filter(Boolean).slice(0, 3) as Badge[];

  if (!badges.length) return null;

  return (
    <div className="ml-2 flex w-[42px] shrink-0 items-center justify-end gap-1 overflow-hidden">
      {badges.map(badge => (
        <span
          key={badge.key}
          title={badge.title}
          className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center gap-0.5 rounded-md border px-1 text-[9px] font-extrabold leading-none tabular-nums ${badge.className ?? ''}`}
        >
          {badge.node}
        </span>
      ))}
    </div>
  );
}
