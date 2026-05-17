import React from 'react';
import { Coffee, Crown, Pin, Shield, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import AvatarContent from '../../components/AvatarContent';
import DeviceBadge from '../../components/chat/DeviceBadge';
import { getUserRoleBadge } from '../../components/RoleBadge';
import type { VisualRole } from '../../components/RoleBadge';
import { getPublicDisplayName } from '../../lib/formatName';
import { hasCustomAvatar } from '../../lib/statusAvatar';
import type { User } from '../../types';
import { channelIconComponents, roomModeIcons } from '../chatview/constants';

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
      size={12}
      strokeWidth={2.25}
      aria-label={meta.label}
      className={`${meta.className} shrink-0 opacity-85`}
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
  channels?: MobileChannelSheetItem[];
  onClose?: () => void;
  onSelectChannel?: (id: string) => void;
  onCreateChannel?: () => void;
  createDisabled?: boolean;
  createTitle?: string;
  pinned?: boolean;
  onTogglePinned?: () => void;
}

export default function MobileChannelSheet({ open = false, variant = 'overlay', channels = [], onClose, onSelectChannel, onCreateChannel, createDisabled = false, createTitle, pinned = false, onTogglePinned }: MobileChannelSheetProps) {
  const panelContent = (
    <>
      <div className="mb-1.5 flex min-h-9 items-center justify-between border-b border-[rgba(var(--glass-tint),0.045)] pb-1.5">
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

      <div className="max-h-[calc(100vh-96px-env(safe-area-inset-top))] space-y-0.5 overflow-y-auto custom-scrollbar">
        {channels.length > 0 ? channels.map(channel => {
          const mode = channel.type || 'social';
          const Icon = channelIconComponents[channel.iconName || ''] || roomModeIcons[mode] || Coffee;
          const iconColor = channel.iconColor || 'var(--theme-accent)';
          return (
            <div
              key={channel.id}
              className="group relative overflow-hidden rounded-[9px] active:scale-[0.998]"
              style={{
                background: channel.active ? 'rgba(var(--theme-accent-rgb),0.055)' : 'transparent',
              }}
            >
              {channel.active && <span className="absolute inset-y-2 left-0 w-px rounded-r-full bg-[var(--theme-accent)]/70" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => onSelectChannel?.(channel.id)}
                className="flex min-h-8 w-full items-center gap-1.5 px-2 py-0.5 text-left"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center"
                >
                  <Icon size={15} className="opacity-90" style={{ color: iconColor }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--theme-text)]/86">{channel.name}</span>
                {typeof channel.memberCount === 'number' && (
                  <span className="text-[9.5px] font-bold text-[var(--theme-secondary-text)]/42">{channel.memberCount}</span>
                )}
              </button>
              {channel.members && channel.members.length > 0 && (
                <div className="space-y-0.5 pb-1 pl-8 pr-1.5">
                  {channel.members.slice(0, 5).map(member => (
                    <button
                      key={`${channel.id}-${member.id}`}
                      type="button"
                      onClick={() => onSelectChannel?.(channel.id)}
                      className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left text-[10.5px] font-medium text-[var(--theme-secondary-text)]/68"
                    >
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden avatar-squircle" style={{ background: hasCustomAvatar(member.avatar) ? 'rgba(0,0,0,0.14)' : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)' }}>
                        <AvatarContent avatar={member.avatar} statusText={member.statusText} firstName={member.displayName || member.firstName} name={getPublicDisplayName(member)} letterClassName="text-[8px] font-bold text-[var(--theme-accent)]" />
                        <DeviceBadge platform={member.platform} size={9} className="absolute -bottom-0.5 -right-0.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{getPublicDisplayName(member)}</span>
                      <MobileRoleIcon role={getUserRoleBadge(member)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="rounded-xl px-3 py-3 text-[11px] font-medium text-[var(--theme-secondary-text)]/62" style={{ background: 'rgba(var(--glass-tint),0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.04)' }}>
            Kanal bulunamadi
          </div>
        )}
      </div>

      {onCreateChannel && (
        <div className="mt-2 border-t border-[rgba(var(--glass-tint),0.045)] pt-1.5">
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
    </>
  );

  if (variant === 'inline') {
    if (!open) return null;
    return (
      <aside
        className="h-full min-h-0 w-[clamp(168px,15vw,190px)] shrink-0 overflow-hidden px-2 pb-2.5 pt-1"
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

  return (
    <div
      className={`absolute inset-0 z-40 transition-[visibility] duration-200 ${open ? 'visible' : 'invisible'}`}
      onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()}
      onTouchEnd={event => event.stopPropagation()}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-[rgba(var(--theme-bg-rgb),0.12)] backdrop-blur-[1.5px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-label="Kanal panelini kapat"
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute inset-y-0 left-0 h-full w-[clamp(168px,15vw,190px)] overflow-hidden px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+12px)] transition-[transform,opacity] duration-220 ease-out ${open ? 'translate-x-0 opacity-100' : '-translate-x-[104%] opacity-80'}`}
        style={{
          background: 'rgba(var(--theme-bg-rgb),0.06)',
          boxShadow: 'inset -1px 0 0 rgba(var(--glass-tint),0.045)',
        }}
        aria-hidden={!open}
      >
      {panelContent}
    </aside>
    </div>
  );
}
