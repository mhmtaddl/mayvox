import React, { useState, useMemo, useEffect } from 'react';
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

interface Props {
  variant: 'desktop' | 'mobile';
  onUserClick: (userId: string, x: number, y: number) => void;
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
}

export default function FriendsSidebarContent({
  variant, onUserClick, onDM, channels, activeChannel,
  inviteStatuses = {}, inviteCooldowns = {}, handleInviteUser, handleCancelInvite,
  isMuted: selfMuted, isDeafened: selfDeafened,
  servers = [],
}: Props) {
  const {
    currentUser, allUsers, friendIds, friendsLoading,
  } = useUser();
  const { setToastMsg } = useUI();
  const { avatarBorderColor, showLastSeen } = useSettings();

  const { favoriteIds, isFavorite, toggleFavorite } = useSharedFavorites();

  const serverNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of servers) m.set(s.id, s.name);
    return m;
  }, [servers]);

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

  // ── Offline collapse ───────────────────────────────────────────────────
  const [offlineExpanded, setOfflineExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('offlineUsersExpanded');
    return saved !== null ? saved === 'true' : false;
  });

  // ── Friend context menu (favorite + DM) ────────────────────────────────
  const [friendMenu, setFriendMenu] = useState<{ userId: string; userName: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!friendMenu) return;
    const handler = () => setFriendMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [friendMenu]);

  const isDesktop = variant === 'desktop';

  // ── Render user item ───────────────────────────────────────────────────
  const renderOnlineUser = (user: User) => {
    const isMe = user.id === currentUser.id;
    const publicName = getPublicDisplayName(user);
    const userServerName = !isMe && user.serverId ? serverNameMap.get(user.serverId) : null;
    const voicePresent = isVoicePresent(user);
    const displayStatusText = voicePresent && user.statusText === 'Çevrimdışı' ? 'Online' : user.statusText;
    const statusLabel = displayStatusText && displayStatusText !== 'Aktif' ? displayStatusText : 'Online';
    const isDefaultOnline = statusLabel === 'Online';
    const statusLineText = isDefaultOnline ? userServerName : statusLabel;
    const statusDotColor =
      statusLabel === 'Rahatsız Etmeyin' || statusLabel === 'Duymuyor' ? '#ef4444'
      : statusLabel === 'AFK' || statusLabel === 'Pasif' ? '#f59e0b'
      : '#22c55e';

    return (
      <div
        key={user.id}
        className={`mv-density-friend-item flex items-center ${isDesktop ? 'gap-2 px-2.5 py-2 rounded-lg' : 'gap-2.5 px-2.5 py-2 rounded-lg'} transition-colors duration-150 group hover:bg-[rgba(var(--glass-tint),0.045)] cursor-pointer`}
        onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY); }}
        onContextMenu={(e) => {
          if (isMe) return;
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
          <DeviceBadge platform={user.platform} size={isDesktop ? 11 : 13} className="absolute -top-0.5 -right-0.5" />
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
          {user.gameActivity && (
            <div className="mv-font-caption mt-[1px] min-w-0 overflow-hidden whitespace-nowrap text-[10.5px] leading-[13px] font-medium text-[var(--theme-text)]/62 flex items-center gap-1">
              <Gamepad2 size={10} className="shrink-0 text-[var(--theme-accent)]/75" strokeWidth={2.2} />
              <span className="block truncate min-w-0">{user.gameActivity}</span>
            </div>
          )}
          {!user.gameActivity && <div className="h-[1px]" />}
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
    const fav = isFavorite(user.id);
    const isMe = user.id === currentUser.id;
    const publicName = getPublicDisplayName(user);
    return (
    <div
      key={user.id}
      className={`mv-density-friend-item flex items-center ${isDesktop ? 'gap-2 px-2.5 py-2 rounded-lg' : 'gap-3 px-2.5 py-2 rounded-lg'} opacity-45 transition-colors duration-150 group hover:opacity-65 hover:bg-[rgba(var(--glass-tint),0.045)] cursor-pointer`}
      onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY); }}
      onContextMenu={(e) => {
        if (isMe) return;
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
        {isDesktop && <DeviceBadge platform={user.platform} size={12} className="absolute -bottom-0.5 -right-0.5" />}
      </div>
        ); })()}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className={`mv-font-message text-[13px] font-medium text-[var(--theme-text)] ${isDesktop ? 'opacity-80' : ''} leading-[18px] truncate min-w-0 shrink`}>
            {publicName}
          </span>
          <RoleBadge role={getUserRoleBadge(user)} size="xs" subtle variant="inlineIcon" />
          {fav && <Star size={8} className="shrink-0 text-amber-400/50 fill-amber-400/50" />}
        </div>
        {showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
          <span className="text-[9px] text-[var(--theme-secondary-text)]/35 leading-[14px] mt-[3px] block truncate">
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
        )}
      </div>
    </div>
  );
  };

  // ── Group section header ───────────────────────────────────────────────
  // Not: Bekleyen arkadaşlık istekleri artık SADECE bildirim çanında görünür
  // (NotificationBell'de inline Kabul/Reddet). Sağ panelde duplicate gösterim yok.
  const hasContent = friendUsers.length > 0;

  return (
    <>
      <div className={`mv-density-sidebar-content flex-1 overflow-y-auto ${isDesktop ? 'px-3 py-4' : 'p-4'} space-y-4 custom-scrollbar`}>
        {friendsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin mb-3" />
            <p className="text-[11px] text-[var(--theme-secondary-text)]/40">Yükleniyor...</p>
          </div>
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
              <div className="flex items-center gap-2 mb-2 px-2">
                <Star size={9} className="text-amber-400/45 fill-amber-400/45" />
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.10em]">Favoriler</span>
                <span className="h-4 min-w-4 px-[5px] inline-flex items-center justify-center rounded-full bg-amber-400/8 text-[10px] leading-none font-semibold text-amber-300/55 tabular-nums">{favoriteUsers.length}</span>
              </div>
              <div className="space-y-1">
                {favoriteUsers.map(u => isEffectivelyOnline(u) ? renderOnlineUser(u) : renderOfflineUser(u))}
              </div>
            </div>
          )}

          {/* 3. Online friends (non-favorites) */}
          {onlineRest.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-2">
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/62 uppercase tracking-[0.10em]">Çevrimiçi</span>
                <span className="h-4 min-w-4 px-[5px] inline-flex items-center justify-center rounded-full bg-emerald-500/8 text-[10px] leading-none font-semibold text-emerald-300/58 tabular-nums">{onlineRest.length}</span>
              </div>
              <div className="space-y-1">
                {onlineRest.map(renderOnlineUser)}
              </div>
            </div>
          )}

          {/* 4. Offline — favori olmayan offline üyeler */}
          {offlineRest.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => { const next = !offlineExpanded; setOfflineExpanded(next); localStorage.setItem('offlineUsersExpanded', String(next)); }}
                className="flex items-center gap-2 w-full mb-2 px-2 hover:opacity-85 transition-opacity cursor-pointer"
              >
                <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/56 uppercase tracking-[0.10em]">Çevrimdışı</span>
                <span className="h-4 min-w-4 px-[5px] inline-flex items-center justify-center rounded-full bg-[rgba(var(--glass-tint),0.035)] text-[10px] leading-none font-semibold text-[var(--theme-secondary-text)]/48 tabular-nums">{offlineRest.length}</span>
                <span className="flex-1" />
                <ChevronDown size={11} className={`text-[var(--theme-secondary-text)]/32 transition-transform duration-200 ${offlineExpanded ? '' : '-rotate-90'}`} />
              </button>
              {offlineExpanded && (
                <div className="space-y-1">
                  {offlineRest.map(renderOfflineUser)}
                </div>
              )}
            </div>
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
