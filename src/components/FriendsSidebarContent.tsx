import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import {
  Mic, Headphones, ChevronDown, Check, X,
  UserPlus, Star, MessageSquare, PhoneCall, Gamepad2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPublicDisplayName } from '../lib/formatName';
import AvatarContent from './AvatarContent';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../lib/avatarFrame';
import { useSharedFavorites } from '../contexts/FavoriteFriendsContext';
import DeviceBadge from './chat/DeviceBadge';
import RoleBadge, { getUserRoleBadge } from './RoleBadge';
import type { User, VoiceChannel } from '../types';
import type { ServerMember } from '../lib/serverService';
import type { ThemePackId } from '../lib/themePacks';
import { isCapacitor } from '../lib/platform';

const FRIENDS_RENDER_STEP = 72;
const SERVER_RENDER_STEP = 84;

function lastSeenSortValue(user: User): number {
  if (!user.lastSeenAt) return 0;
  const value = new Date(user.lastSeenAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function compareByDisplayNameTr(a: User, b: User): number {
  const aName = getPublicDisplayName(a) || a.name || a.id || '';
  const bName = getPublicDisplayName(b) || b.name || b.id || '';
  return aName.localeCompare(bName, 'tr', { sensitivity: 'base' });
}

function getMayvoxStatusDotColor(statusLabel: string): string {
  if (statusLabel === 'Online' || statusLabel === 'Aktif') return '#34d399';
  if (statusLabel === 'AFK') return '#a78bfa';
  if (statusLabel === 'Pasif') return '#eab308';
  if (statusLabel === 'Dinliyor') return '#f97316';
  if (statusLabel === 'Sessiz') return 'rgba(var(--theme-secondary-text-rgb, 148, 163, 184), 0.72)';
  if (statusLabel === 'Rahatsız Etmeyin' || statusLabel === 'Duymuyor') return '#f87171';
  if (statusLabel === 'Çevrimdışı') return 'rgba(var(--theme-secondary-text-rgb, 148, 163, 184), 0.55)';
  return 'rgba(var(--theme-secondary-text-rgb, 148, 163, 184), 0.55)';
}

const ONLINE_CONTRAST_BY_THEME: Record<ThemePackId, string> = {
  'default-dark': '#FBBF24',
  'dual-tone': '#FBBF24',
  'ocean-blue': '#FBBF24',
  emerald: '#FBBF24',
  crimson: '#FBBF24',
  'amber-night': '#EF4444',
  'frost-light': '#EF4444',
  'graphite-pro': '#FBBF24',
  aurora: '#FBBF24',
};

function getOnlineContrastColor(themePackId: ThemePackId) {
  return ONLINE_CONTRAST_BY_THEME[themePackId] ?? ONLINE_CONTRAST_BY_THEME['default-dark'];
}

function HeaderOnlineFraction({ active, online, total, color }: { active: boolean; online: number; total: number; color: string }) {
  const countClassName = active
    ? 'text-[var(--theme-text)]/88'
    : 'text-[var(--theme-secondary-text)]/46 group-hover/tab:text-[var(--theme-text)]/78';
  return (
    <span className="ml-1 inline-flex items-baseline gap-0.5 text-[9px] font-black tabular-nums">
      <span className={countClassName} style={active && online > 0 ? { color } : undefined}>{online}</span>
      <span className={countClassName}>/</span>
      <span className={countClassName}>{total}</span>
    </span>
  );
}

function MoreListButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-2 mt-2 flex h-8 w-[calc(100%-1rem)] items-center justify-center rounded-md border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] text-[10px] font-semibold text-[var(--theme-secondary-text)]/62 transition-colors hover:border-[rgba(var(--glass-tint),0.12)] hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]/78"
    >
      +{count} kişi daha
    </button>
  );
}

function HeaderOnlineProgress({ online, total, color }: { online: number; total: number; color: string }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, online / total)) : 0;
  return (
    <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden rounded-full bg-[var(--theme-accent)]/75">
      <span
        className="block h-full rounded-full transition-[width] duration-200"
        style={{ width: `${ratio * 100}%`, background: color }}
      />
    </span>
  );
}

interface Props {
  variant: 'desktop' | 'mobile';
  onUserClick: (userId: string, x: number, y: number, fallbackUser?: User) => void;
  onDM?: (userId: string) => void;
  // Desktop-specific props
  channels?: VoiceChannel[];
  activeChannel?: string | null;
  inviteStatuses?: Record<string, string>;
  inviteCooldowns?: Record<string, number>;
  handleInviteUser?: (userId: string) => void;
  handleCancelInvite?: (userId: string) => void;
  isMuted?: boolean;
  isDeafened?: boolean;
  /** Map id→name for "şu anda X sunucusunda" indicator under online friends */
  servers?: { id: string; name: string }[];
  activeServerName?: string;
  activeServerMemberCount?: number;
  serverMembers?: ServerMember[];
}

export default function FriendsSidebarContent({
  variant, onUserClick, onDM, channels, activeChannel,
  inviteStatuses = {}, inviteCooldowns = {}, handleInviteUser, handleCancelInvite,
  isMuted: selfMuted, isDeafened: selfDeafened,
  servers = [],
  activeServerName,
  activeServerMemberCount,
  serverMembers = [],
}: Props) {
  const {
    currentUser, allUsers, friendIds, friendsLoading,
  } = useUser();
  const { setToastMsg } = useUI();
  const { avatarBorderColor, showLastSeen, themePackId } = useSettings();
  const onlineContrastColor = getOnlineContrastColor(themePackId);

  const { favoriteIds, isFavorite, toggleFavorite } = useSharedFavorites();
  const tabletRuntime = isCapacitor();

  const serverNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of servers) m.set(s.id, s.name);
    return m;
  }, [servers]);
  const allUsersById = useMemo(() => {
    const map = new Map<string, User>();
    for (const user of allUsers) map.set(user.id, user);
    return map;
  }, [allUsers]);

  // ── Derived lists ──────────────────────────────────────────────────────
  // Manuel "Çevrimdışı" (premium/staff) — presence'ta hala online ama UI'da
  // offline grubunda gösterilir.
  const voicePresentKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const channel of channels ?? []) {
      for (const member of channel.members ?? []) {
        if (typeof member === 'string') keys.add(member);
      }
    }
    return keys;
  }, [channels]);
  const isVoicePresent = (u: { id: string; name?: string }) =>
    voicePresentKeys.has(u.id) || (!!u.name && voicePresentKeys.has(u.name));
  const isEffectivelyOnline = (u: { id: string; name?: string; status: string; statusText?: string }) =>
    isVoicePresent(u) || (u.status === 'online' && u.statusText !== 'Çevrimdışı');
  const friendUsers = useMemo(() => allUsers.filter(u => friendIds.has(u.id)), [allUsers, friendIds]);
  const onlineUsers = useMemo(() => friendUsers.filter(isEffectivelyOnline), [friendUsers]);
  const offlineUsers = useMemo(() => friendUsers.filter(u => !isEffectivelyOnline(u)), [friendUsers]);

  // Favoriler: hem online hem offline — online'lar önce (aktifler yukarıda).
  // Aynı kullanıcı Online/Offline bölümlerine DUPLIKE edilmez.
  const favoriteUsers = useMemo(
    () => friendUsers
      .filter(u => favoriteIds.has(u.id))
      .sort((a, b) => {
        const aOn = isEffectivelyOnline(a) ? 0 : 1;
        const bOn = isEffectivelyOnline(b) ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
        return 0;
      }),
    [friendUsers, favoriteIds]
  );
  const favoriteOnlineUsers = useMemo(
    () => favoriteUsers.filter(isEffectivelyOnline),
    [favoriteUsers],
  );
  const favoriteOfflineUsers = useMemo(
    () => favoriteUsers
      .filter(u => !isEffectivelyOnline(u))
      .sort((a, b) => {
        const aLastSeen = lastSeenSortValue(a);
        const bLastSeen = lastSeenSortValue(b);
        if (aLastSeen !== bLastSeen) return bLastSeen - aLastSeen;
        return compareByDisplayNameTr(a, b);
      }),
    [favoriteUsers],
  );
  const onlineRest = useMemo(
    () => onlineUsers.filter(u => !favoriteIds.has(u.id)),
    [onlineUsers, favoriteIds]
  );
  const offlineRest = useMemo(
    () => offlineUsers
      .filter(u => !favoriteIds.has(u.id))
      .sort((a, b) => {
        const aLastSeen = lastSeenSortValue(a);
        const bLastSeen = lastSeenSortValue(b);
        if (aLastSeen !== bLastSeen) return bLastSeen - aLastSeen;
        return compareByDisplayNameTr(a, b);
      }),
    [offlineUsers, favoriteIds]
  );
  const serverMemberUsers = useMemo(() => {
    return serverMembers
      .map(member => {
        const known = allUsersById.get(member.userId);
        if (known) return known;
        return {
          id: member.userId,
          name: member.displayName || member.username || 'Üye',
          displayName: member.displayName || member.username || 'Üye',
          firstName: member.firstName || member.displayName || member.username || 'Üye',
          lastName: member.lastName || '',
          avatar: member.avatar || '',
          status: 'offline',
          statusText: 'Çevrimdışı',
        } as User;
      })
      .sort((a, b) => {
        const aOnline = isEffectivelyOnline(a);
        const bOnline = isEffectivelyOnline(b);
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        if (!aOnline && !bOnline) {
          const aLastSeen = lastSeenSortValue(a);
          const bLastSeen = lastSeenSortValue(b);
          if (aLastSeen !== bLastSeen) return bLastSeen - aLastSeen;
        }
        return compareByDisplayNameTr(a, b);
      });
  }, [allUsersById, serverMembers]);
  const serverOnlineUsers = useMemo(() => serverMemberUsers.filter(isEffectivelyOnline), [serverMemberUsers]);
  const serverOfflineUsers = useMemo(() => serverMemberUsers.filter(u => !isEffectivelyOnline(u)), [serverMemberUsers]);
  const serverPanelTotalCount = activeServerMemberCount ?? serverMemberUsers.length;

  // ── Collapsible favorites ──────────────────────────────────────────────
  const [favoritesExpanded, setFavoritesExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('favoriteUsersExpanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [activePanel, setActivePanel] = useState<'friends' | 'server'>('friends');
  const [friendsRenderLimit, setFriendsRenderLimit] = useState(FRIENDS_RENDER_STEP);
  const [serverRenderLimit, setServerRenderLimit] = useState(SERVER_RENDER_STEP);

  // ── Friend context menu (favorite + DM) ────────────────────────────────
  const [friendMenu, setFriendMenu] = useState<{ userId: string; userName: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!friendMenu) return;
    const handler = () => setFriendMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [friendMenu]);

  const isDesktop = variant === 'desktop';

  useEffect(() => {
    setFriendsRenderLimit(FRIENDS_RENDER_STEP);
  }, [friendUsers.length, favoriteUsers.length, onlineRest.length, offlineRest.length]);

  useEffect(() => {
    setServerRenderLimit(SERVER_RENDER_STEP);
  }, [serverMemberUsers.length]);

  const deferredFavoriteOnlineUsers = useDeferredValue(favoriteOnlineUsers);
  const deferredFavoriteOfflineUsers = useDeferredValue(favoriteOfflineUsers);
  const deferredOnlineRest = useDeferredValue(onlineRest);
  const deferredOfflineRest = useDeferredValue(offlineRest);
  const deferredServerOnlineUsers = useDeferredValue(serverOnlineUsers);
  const deferredServerOfflineUsers = useDeferredValue(serverOfflineUsers);

  const visibleFriendSections = useMemo(() => {
    let budget = tabletRuntime ? friendsRenderLimit : Number.MAX_SAFE_INTEGER;
    const take = <T,>(items: T[]) => {
      const visible = items.slice(0, budget);
      budget -= visible.length;
      return visible;
    };
    const favoriteOnline = take(deferredFavoriteOnlineUsers);
    const favoriteOffline = take(deferredFavoriteOfflineUsers);
    const online = take(deferredOnlineRest);
    const offline = take(deferredOfflineRest);
    const totalVisible = favoriteOnline.length + favoriteOffline.length + online.length + offline.length;
    return {
      favoriteOnline,
      favoriteOffline,
      online,
      offline,
      hiddenCount: Math.max(0, friendUsers.length - totalVisible),
    };
  }, [deferredFavoriteOfflineUsers, deferredFavoriteOnlineUsers, deferredOfflineRest, deferredOnlineRest, friendUsers.length, friendsRenderLimit, tabletRuntime]);

  const visibleServerSections = useMemo(() => {
    let budget = tabletRuntime ? serverRenderLimit : Number.MAX_SAFE_INTEGER;
    const online = deferredServerOnlineUsers.slice(0, budget);
    budget -= online.length;
    const offline = deferredServerOfflineUsers.slice(0, budget);
    const totalVisible = online.length + offline.length;
    return {
      online,
      offline,
      hiddenCount: Math.max(0, serverMemberUsers.length - totalVisible),
    };
  }, [deferredServerOfflineUsers, deferredServerOnlineUsers, serverMemberUsers.length, serverRenderLimit, tabletRuntime]);

  // ── Render user item ───────────────────────────────────────────────────
  const renderOnlineUser = (user: User, options?: { serverPanel?: boolean }) => {
    const isServerPanel = options?.serverPanel === true;
    const isMe = user.id === currentUser.id;
    const publicName = getPublicDisplayName(user);
    const userServerName = !isServerPanel && !isMe && user.serverId ? serverNameMap.get(user.serverId) : null;
    const voicePresent = isVoicePresent(user);
    const displayStatusText = voicePresent && user.statusText === 'Çevrimdışı' ? 'Online' : user.statusText;
    const statusLabel = displayStatusText && displayStatusText !== 'Aktif' ? displayStatusText : 'Online';
    const isDefaultOnline = statusLabel === 'Online';
    const statusLineText = isServerPanel
      ? (user.gameActivity || statusLabel)
      : (isDefaultOnline ? userServerName : statusLabel);
    const statusDotColor = getMayvoxStatusDotColor(statusLabel);

    return (
      <div
        key={user.id}
        className={`mv-density-friend-item flex items-center ${isDesktop ? 'gap-2 px-2.5 py-2 rounded-lg' : 'gap-2.5 px-2.5 py-2 rounded-lg'} transition-colors duration-150 group hover:bg-[rgba(var(--glass-tint),0.045)] cursor-pointer`}
        onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY, user); }}
        onContextMenu={(e) => {
          if (isMe || !friendIds.has(user.id)) return;
          e.preventDefault();
          setFriendMenu({ userId: user.id, userName: publicName, x: e.clientX, y: e.clientY });
        }}
      >
        {(() => {
          const uColor = isMe ? avatarBorderColor : (user.avatarBorderColor || '');
          const uTier = getFrameTier(
            isMe ? currentUser.userLevel : user.userLevel,
            isMe ? { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin } : { isPrimaryAdmin: !!user.isPrimaryAdmin, isAdmin: !!user.isAdmin },
          );
          return (
        <div
          className={`relative shrink-0 ${uColor ? getFrameClassName(uTier) : ''}`}
          style={uColor ? { ...getFrameStyle(uColor, uTier), borderRadius: '22%' } : undefined}
        >
          <div
            className={`${isDesktop ? 'mv-density-friend-avatar h-[34px] w-[34px]' : 'h-9 w-9'} overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
          >
            <AvatarContent avatar={user.avatar} statusText={displayStatusText} firstName={user.displayName || user.firstName} name={publicName} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" />
          </div>
        </div>
          ); })()}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="mv-font-message text-[13px] font-semibold text-[var(--theme-text)] leading-[18px] truncate min-w-0 shrink">
              {publicName}
            </span>
            <RoleBadge role={getUserRoleBadge(user)} size="xs" subtle variant="inlineIcon" />
          </div>
          <div className="mv-font-meta flex items-center gap-1.5 mt-[2px] min-w-0 overflow-hidden whitespace-nowrap text-[11px] leading-[13px] font-medium text-[var(--theme-secondary-text)]/75">
            <DeviceBadge platform={user.platform} size={isDesktop ? 10 : 12} className="shrink-0 opacity-85" />
            <span className="inline-flex items-center shrink-0" title={statusLabel} aria-label={statusLabel}>
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: statusDotColor }}
              />
            </span>
            {(isMe ? selfMuted : (!!user.selfMuted || !!user.isMuted)) && <Mic size={8} className="text-red-500 shrink-0" />}
            {(isMe ? selfDeafened : !!user.selfDeafened) && <Headphones size={8} className="text-red-500 shrink-0" />}
            {statusLineText && (
              <span className="truncate min-w-0 text-[var(--theme-secondary-text)]/82">
                {statusLineText}
              </span>
            )}
          </div>
          {!isServerPanel && user.gameActivity && (
            <div className="mv-font-caption mt-[1px] min-w-0 overflow-hidden whitespace-nowrap text-[10.5px] leading-[13px] font-medium text-[var(--theme-text)]/62 flex items-center gap-1">
              <Gamepad2 size={10} className="shrink-0 text-[var(--theme-accent)]/75" strokeWidth={2.2} />
              <span className="block truncate min-w-0">{user.gameActivity}</span>
            </div>
          )}
          {(isServerPanel || !user.gameActivity) && <div className="h-[1px]" />}
        </div>
        {/* Desktop invite button */}
        {isDesktop && handleInviteUser && (() => {
          // members[] codebase'de hem user.id (UUID) hem user.name (LiveKit
          // identity) tutabiliyor — tutarsız. Her ikisini de kontrol et ki
          // aynı odadaki kullanıcıya call icon'u görünmesin.
          const activeCh = activeChannel ? channels?.find((c: any) => c.id === activeChannel) : undefined;
          const alreadyInChannel = !!(activeCh?.members?.includes(user.id) || activeCh?.members?.includes(user.name));
          const canInvite = !isMe && activeChannel && !alreadyInChannel;
          if (!canInvite) return null;

          const status = inviteStatuses[user.id];
          const cooldownUntil = inviteCooldowns[user.id];
          const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
          const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

          if (status === 'pending') {
            return (
              <button
                onClick={(e) => { e.stopPropagation(); handleCancelInvite?.(user.id); }}
                title="Daveti iptal et"
                aria-label="Daveti iptal et"
                className="group/action shrink-0 w-6 h-6 flex items-center justify-center bg-transparent text-blue-300/70 hover:text-rose-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse group-hover/action:hidden" />
                <X size={12} className="hidden group-hover/action:block transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(251,113,133,0.30)]" />
              </button>
            );
          }
          if (status === 'accepted') return <span className="shrink-0 w-6 h-6 flex items-center justify-center text-emerald-300/75"><Check size={12} /></span>;
          if (status === 'rejected') return <span className="shrink-0 w-6 h-6 flex items-center justify-center text-rose-300/70"><X size={12} /></span>;
          return (
            <button
              disabled={onCooldown}
              onClick={(e) => { e.stopPropagation(); handleInviteUser(user.id); }}
              title={onCooldown ? `${remaining}s sonra tekrar davet edebilirsiniz` : 'Odaya davet et'}
              className="group/action shrink-0 w-6 h-6 flex items-center justify-center bg-transparent opacity-0 group-hover:opacity-100 transition-[opacity,color] text-emerald-300/70 hover:text-emerald-300 disabled:opacity-30 disabled:cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)]"
            >
              {onCooldown ? <span className="text-[8px] font-bold">{remaining}</span> : <PhoneCall size={13} className="transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(110,231,183,0.28)]" />}
            </button>
          );
        })()}
      </div>
    );
  };

  const renderOfflineUser = (user: User) => {
    const isMe = user.id === currentUser.id;
    const publicName = getPublicDisplayName(user);
    return (
    <div
      key={user.id}
      className={`mv-density-friend-item flex items-center ${isDesktop ? 'gap-2 px-2.5 py-2 rounded-lg' : 'gap-3 px-2.5 py-2 rounded-lg'} opacity-58 transition-colors duration-150 group hover:opacity-78 hover:bg-[rgba(var(--glass-tint),0.045)] cursor-pointer`}
      onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY, user); }}
      onContextMenu={(e) => {
        if (isMe || !friendIds.has(user.id)) return;
        e.preventDefault();
        setFriendMenu({ userId: user.id, userName: publicName, x: e.clientX, y: e.clientY });
      }}
    >
      {(() => {
        const isSelf = user.id === currentUser.id;
        const uColor = isSelf ? avatarBorderColor : (user.avatarBorderColor || '');
        const uTier = getFrameTier(
          isSelf ? currentUser.userLevel : user.userLevel,
          isSelf ? { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin } : { isPrimaryAdmin: !!user.isPrimaryAdmin, isAdmin: !!user.isAdmin },
        );
        return (
      <div
        className="relative"
        style={isDesktop && uColor ? { ...getFrameStyle(uColor, uTier), borderRadius: '22%' } : undefined}
      >
        <div
          className={`${isDesktop ? 'mv-density-friend-avatar h-8 w-8' : 'h-9 w-9'} overflow-hidden ${isDesktop ? 'avatar-squircle' : 'rounded-[10px] bg-[var(--theme-border)]/30'} flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
        >
          <AvatarContent avatar={user.avatar} statusText="Çevrimdışı" firstName={user.displayName || user.firstName} name={publicName} imgClassName={`w-full h-full object-cover ${isDesktop ? '' : 'grayscale'}`} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" />
        </div>
      </div>
        ); })()}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className={`mv-font-message text-[13px] font-medium text-[var(--theme-text)] ${isDesktop ? 'opacity-80' : ''} leading-[18px] truncate min-w-0 shrink`}>
            {publicName}
          </span>
          <RoleBadge role={getUserRoleBadge(user)} size="xs" subtle variant="inlineIcon" />
        </div>
        {showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
          <span className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[9px] font-medium leading-[14px] text-[var(--theme-secondary-text)]/58 group-hover:text-[var(--theme-secondary-text)]/72">
            <DeviceBadge platform={user.platform} size={isDesktop ? 10 : 12} className="shrink-0 opacity-85" />
            <span className="truncate">
            {(() => {
              const d = new Date(user.lastSeenAt);
              const now = new Date();
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
              if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
              return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })} ${time}`;
            })()}
            </span>
          </span>
        )}
      </div>
    </div>
  );
  };

  // ── Group section header ───────────────────────────────────────────────
  // Not: Bekleyen arkadaşlık istekleri artık SADECE bildirim çanında görünür
  // (NotificationBell'de inline Kabul/Reddet). Sağ panelde duplicate gösterim yok.
  const hasContent = activePanel === 'server' ? serverMemberUsers.length > 0 : friendUsers.length > 0;
  const renderOfflineDivider = (key?: string) => (
    <div key={key} className="flex items-center gap-2 px-2 py-1.5">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[rgba(var(--glass-tint),0.10)] to-[rgba(var(--glass-tint),0.04)]" />
      <span className="text-[8.5px] font-black uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/38">Çevrimdışı</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[rgba(var(--glass-tint),0.10)] to-[rgba(var(--glass-tint),0.04)]" />
    </div>
  );

  return (
    <>
      <div className={`mv-density-sidebar-content flex-1 overflow-y-auto ${isDesktop ? 'px-3 py-4' : 'p-4'} space-y-4 custom-scrollbar`}>
        {isDesktop && activeServerName && (
          <div className="mb-1 flex gap-3 border-b border-[rgba(var(--glass-tint),0.055)]">
            <button
              type="button"
              onClick={() => setActivePanel('friends')}
              className={`group/tab relative h-8 min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors ${activePanel === 'friends' ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/58 hover:text-[var(--theme-text)]/78'}`}
            >
              Arkadaşlar <HeaderOnlineFraction active={activePanel === 'friends'} online={onlineUsers.length} total={friendUsers.length} color={onlineContrastColor} />
              {activePanel === 'friends' && <HeaderOnlineProgress online={onlineUsers.length} total={friendUsers.length} color={onlineContrastColor} />}
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('server')}
              className={`group/tab relative h-8 min-w-0 flex-1 truncate text-[10.5px] font-bold uppercase tracking-[0.08em] transition-colors ${activePanel === 'server' ? 'text-[var(--theme-text)]' : 'text-[var(--theme-secondary-text)]/58 hover:text-[var(--theme-text)]/78'}`}
            >
              {activeServerName} <HeaderOnlineFraction active={activePanel === 'server'} online={serverOnlineUsers.length} total={serverPanelTotalCount} color={onlineContrastColor} />
              {activePanel === 'server' && <HeaderOnlineProgress online={serverOnlineUsers.length} total={serverPanelTotalCount} color={onlineContrastColor} />}
            </button>
          </div>
        )}
        {friendsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin mb-3" />
            <p className="text-[11px] text-[var(--theme-secondary-text)]/40">Yükleniyor...</p>
          </div>
        ) : activePanel === 'server' ? (
          serverMemberUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <UserPlus size={28} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
              <p className="text-[11px] font-medium text-[var(--theme-secondary-text)] opacity-50 mb-1">Sunucu üyesi bulunamadı.</p>
            </div>
          ) : (
            <>
              {visibleServerSections.online.length > 0 && <div className="space-y-1">{visibleServerSections.online.map(user => renderOnlineUser(user, { serverPanel: true }))}</div>}
              {visibleServerSections.online.length > 0 && visibleServerSections.offline.length > 0 && (
                renderOfflineDivider('server-offline-divider')
              )}
              {visibleServerSections.offline.length > 0 && <div className="space-y-1">{visibleServerSections.offline.map(renderOfflineUser)}</div>}
              {visibleServerSections.hiddenCount > 0 && (
                <MoreListButton
                  count={visibleServerSections.hiddenCount}
                  onClick={() => setServerRenderLimit(limit => limit + SERVER_RENDER_STEP)}
                />
              )}
            </>
          )
        ) : !hasContent ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <UserPlus size={28} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
            <p className="text-[11px] font-medium text-[var(--theme-secondary-text)] opacity-50 mb-1">Henüz arkadaş eklemedin.</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] opacity-30 leading-relaxed">Kullanıcı ara ve arkadaş ekleyerek burada gör.</p>
          </div>
        ) : <>
          {/* Favorites — online + offline (favorite olan herkes burada) */}
          {favoriteUsers.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => {
                  const next = !favoritesExpanded;
                  setFavoritesExpanded(next);
                  localStorage.setItem('favoriteUsersExpanded', String(next));
                }}
                className="flex w-full items-center gap-2 mb-1.5 px-2 hover:opacity-85 transition-opacity cursor-pointer"
              >
                <span className="text-[9.5px] font-semibold text-amber-300/56 tracking-[0.035em]">
                  Favoriler <span className="text-amber-300/40 tabular-nums">· {favoriteUsers.length}</span>
                </span>
                <span className="flex-1" />
                <ChevronDown size={10} className={`text-amber-300/28 transition-transform duration-200 ${favoritesExpanded ? '' : '-rotate-90'}`} />
              </button>
              {favoritesExpanded && (
                <>
                  <div className="space-y-1">
                    {visibleFriendSections.favoriteOnline.map(renderOnlineUser)}
                  </div>
                  {visibleFriendSections.favoriteOffline.length > 0 && (
                    <div className="mt-2">
                      {visibleFriendSections.favoriteOnline.length > 0 && (
                        <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
                          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-300/12 to-amber-300/5" />
                          <span className="text-[8.5px] font-black uppercase tracking-[0.12em] text-amber-300/36">Çevrimdışı</span>
                          <span className="h-px flex-1 bg-gradient-to-l from-transparent via-amber-300/12 to-amber-300/5" />
                        </div>
                      )}
                      <div className="space-y-1">
                        {visibleFriendSections.favoriteOffline.map(renderOfflineUser)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 3. Online friends (non-favorites) */}
          {onlineRest.length > 0 && (
            <div className="space-y-1">
              {visibleFriendSections.online.map(renderOnlineUser)}
            </div>
          )}

          {/* 4. Offline — favori olmayan offline üyeler */}
          {visibleFriendSections.offline.length > 0 && (
            <div>
              {visibleFriendSections.online.length > 0 && (
                renderOfflineDivider('friends-offline-divider')
              )}
              <div className="space-y-1">
                {visibleFriendSections.offline.map(renderOfflineUser)}
              </div>
            </div>
          )}

          {visibleFriendSections.hiddenCount > 0 && (
            <MoreListButton
              count={visibleFriendSections.hiddenCount}
              onClick={() => setFriendsRenderLimit(limit => limit + FRIENDS_RENDER_STEP)}
            />
          )}

        </>}
      </div>

      {/* Friend context menu (right-click) */}
      <AnimatePresence>
        {friendMenu && (
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setFriendMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[201] py-1 rounded-lg overflow-hidden min-w-[160px]"
              style={{
                top: friendMenu.y,
                left: Math.min(friendMenu.x, window.innerWidth - 180),
                background: 'rgba(var(--theme-bg-rgb), 0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(var(--glass-tint), 0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}
            >
              {/* Favorite toggle */}
              <button
                onClick={async () => {
                  const wasFav = isFavorite(friendMenu.userId);
                  const ok = await toggleFavorite(friendMenu.userId);
                  if (ok) setToastMsg(wasFav ? `${friendMenu.userName} favorilerden çıkarıldı` : `${friendMenu.userName} favorilere eklendi`);
                  setFriendMenu(null);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
              >
                <Star size={11} className={isFavorite(friendMenu.userId) ? 'text-amber-400 fill-amber-400' : 'text-[var(--theme-secondary-text)]'} />
                {isFavorite(friendMenu.userId) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              </button>
              {/* DM */}
              {onDM && (
                <button
                  onClick={() => { onDM(friendMenu.userId); setFriendMenu(null); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
                >
                  <MessageSquare size={11} className="text-[var(--theme-secondary-text)]" /> Mesaj gönder
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  );
}
