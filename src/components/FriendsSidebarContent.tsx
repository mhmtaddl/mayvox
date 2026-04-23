import React, { useState, useMemo, useEffect } from 'react';
import {
  Mic, Headphones, ShieldCheck, ChevronDown, Check, X,
  UserPlus, Star, MessageSquare, PhoneCall, Server as ServerIcon, Gamepad2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import AvatarContent from './AvatarContent';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../lib/avatarFrame';
import { useSharedFavorites } from '../contexts/FavoriteFriendsContext';
import DeviceBadge from './chat/DeviceBadge';
import type { User } from '../types';

interface Props {
  variant: 'desktop' | 'mobile';
  onUserClick: (userId: string, x: number, y: number) => void;
  onDM?: (userId: string) => void;
  // Desktop-specific props
  channels?: any[];
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
    currentUser, allUsers, friendIds, friendsLoading, getStatusColor,
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
  const isEffectivelyOnline = (u: { status: string; statusText?: string }) =>
    u.status === 'online' && u.statusText !== 'Çevrimdışı';
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
    () => offlineUsers.filter(u => !favoriteIds.has(u.id)),
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
    const userServerName = !isMe && user.serverId ? serverNameMap.get(user.serverId) : null;

    return (
      <div
        key={user.id}
        className={`flex items-center gap-3 ${isDesktop ? 'px-2.5 py-2 rounded-xl' : 'px-2 py-2 rounded-lg'} transition-all duration-200 group hover:bg-[rgba(var(--glass-tint),0.05)] cursor-pointer`}
        onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY); }}
        onContextMenu={(e) => {
          if (isMe) return;
          e.preventDefault();
          setFriendMenu({ userId: user.id, userName: formatFullName(user.firstName, user.lastName), x: e.clientX, y: e.clientY });
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
            className={`${isDesktop ? 'h-8 w-8' : 'h-9 w-9'} overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
          >
            <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.firstName} name={user.name} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" />
          </div>
          <DeviceBadge platform={user.platform} size={isDesktop ? 12 : 13} className="absolute -bottom-0.5 -right-0.5" />
        </div>
          ); })()}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[13px] font-medium text-[var(--theme-text)] leading-none truncate">
              {formatFullName(user.firstName, user.lastName)}
            </span>
            <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)] shrink-0">{user.age}</span>
            {user.isAdmin && (
              <span className="shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.12)', border: '1px solid rgba(var(--theme-accent-rgb), 0.2)' }}>
                <ShieldCheck size={9} className="text-[var(--theme-accent)]" strokeWidth={2.5} />
              </span>
            )}
            {!user.isAdmin && user.isModerator && (
              <span className="shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-2 h-2"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {(isMe ? selfMuted : (!!user.selfMuted || !!user.isMuted)) && <Mic size={8} className="text-red-500 shrink-0" />}
            {(isMe ? selfDeafened : !!user.selfDeafened) && <Headphones size={8} className="text-red-500 shrink-0" />}
            {user.statusText && user.statusText !== 'Online' && user.statusText !== 'Aktif' && (
              <span className={`text-[9px] font-bold uppercase tracking-tight ${getStatusColor(user.statusText)}`}>{user.statusText}</span>
            )}
          </div>
          {userServerName && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <ServerIcon size={8} className="text-[var(--theme-accent)]/60 shrink-0" />
              <span className="text-[9.5px] font-semibold truncate text-[var(--theme-text)]/85">
                {(() => {
                  const raw = userServerName;
                  const spaceIdx = raw.indexOf(' ');
                  if (spaceIdx > 0) {
                    const first = raw.slice(0, spaceIdx);
                    const rest = raw.slice(spaceIdx + 1);
                    return <>{first} <span style={{ color: 'var(--theme-accent)' }}>{rest}</span></>;
                  }
                  if (raw.toUpperCase() === 'MAYVOX') {
                    return <>MAY<span style={{ color: 'var(--theme-accent)' }}>VOX</span></>;
                  }
                  return raw;
                })()}
              </span>
            </div>
          )}
          {user.gameActivity && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <Gamepad2 size={9} className="text-[var(--theme-accent)]/70 shrink-0" strokeWidth={2.2} />
              <span className="text-[9.5px] font-medium truncate text-[var(--theme-text)]/75">
                {user.gameActivity} oynuyor
              </span>
            </div>
          )}
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
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-blue-400 bg-blue-500/10 hover:bg-red-500/20 hover:text-red-400 transition-colors group/cancel"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse group-hover/cancel:hidden" />
                <X size={12} className="hidden group-hover/cancel:block" />
              </button>
            );
          }
          if (status === 'accepted') return <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-emerald-400 bg-emerald-500/10"><Check size={12} /></span>;
          if (status === 'rejected') return <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-red-400 bg-red-500/10"><X size={12} /></span>;
          return (
            <button
              disabled={onCooldown}
              onClick={(e) => { e.stopPropagation(); handleInviteUser(user.id); }}
              title={onCooldown ? `${remaining}s sonra tekrar davet edebilirsiniz` : 'Odaya davet et'}
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {onCooldown ? <span className="text-[8px] font-bold">{remaining}</span> : <PhoneCall size={13} />}
            </button>
          );
        })()}
      </div>
    );
  };

  const renderOfflineUser = (user: User) => {
    const fav = isFavorite(user.id);
    const isMe = user.id === currentUser.id;
    return (
    <div
      key={user.id}
      className={`flex items-center gap-3 ${isDesktop ? 'px-2 py-1.5 rounded-lg' : 'px-2 py-2 rounded-lg'} opacity-50 transition-all duration-200 group hover:opacity-70 hover:bg-[rgba(var(--glass-tint),0.03)] cursor-pointer`}
      onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY); }}
      onContextMenu={(e) => {
        if (isMe) return;
        e.preventDefault();
        setFriendMenu({ userId: user.id, userName: formatFullName(user.firstName, user.lastName), x: e.clientX, y: e.clientY });
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
          className={`${isDesktop ? 'h-8 w-8' : 'h-9 w-9'} overflow-hidden ${isDesktop ? 'avatar-squircle' : 'rounded-[10px] bg-[var(--theme-border)]/30'} flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
        >
          <AvatarContent avatar={user.avatar} statusText="Çevrimdışı" firstName={user.firstName} name={user.name} imgClassName={`w-full h-full object-cover ${isDesktop ? '' : 'grayscale'}`} letterClassName="text-[10px] font-bold text-[var(--theme-accent)]" />
        </div>
        {isDesktop && <DeviceBadge platform={user.platform} size={12} className="absolute -bottom-0.5 -right-0.5" />}
      </div>
        ); })()}
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className={`text-[13px] font-medium text-[var(--theme-text)] ${isDesktop ? 'opacity-80' : ''} leading-none truncate`}>
            {formatFullName(user.firstName, user.lastName)}
          </span>
          <span className={`text-[10px] font-semibold text-[var(--theme-secondary-text)]${isDesktop ? '/60' : ''} shrink-0`}>{user.age}</span>
          {user.isAdmin && (
            <span className="shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.12)', border: '1px solid rgba(var(--theme-accent-rgb), 0.2)' }}>
              <ShieldCheck size={9} className="text-[var(--theme-accent)]" strokeWidth={2.5} />
            </span>
          )}
          {!user.isAdmin && user.isModerator && (
            <span className="shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-2 h-2"><path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/></svg>
            </span>
          )}
          {fav && <Star size={8} className="shrink-0 text-amber-400/50 fill-amber-400/50" />}
        </div>
        {showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
          <span className="text-[9px] text-[var(--theme-secondary-text)]/40 leading-none mt-0.5 block">
            {(() => {
              const d = new Date(user.lastSeenAt);
              const now = new Date();
              const yesterday = new Date(now);
              yesterday.setDate(now.getDate() - 1);
              const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
              if (d.toDateString() === now.toDateString()) return `Son görülme: Bugün ${time}`;
              if (d.toDateString() === yesterday.toDateString()) return `Son görülme: Dün ${time}`;
              return `Son görülme: ${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })} ${time}`;
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
                <Star size={9} className="text-amber-400/60 fill-amber-400/60" />
                <span className="text-[9px] font-bold text-amber-400/50 uppercase tracking-[0.14em]">Favoriler</span>
                <span className="text-[9px] bg-amber-400/8 text-amber-400/50 px-1.5 py-0.5 rounded-full font-bold">{favoriteUsers.length}</span>
                <div className="flex-1 h-px bg-amber-400/10" />
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
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.14em]">Çevrimiçi</span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">{onlineRest.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/10" />
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
                className="flex items-center gap-2 w-full mb-2 px-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/50 uppercase tracking-[0.14em]">Çevrimdışı</span>
                <span className="text-[9px] bg-[var(--theme-secondary-text)]/8 text-[var(--theme-secondary-text)]/50 px-1.5 py-0.5 rounded-full font-bold">{offlineRest.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
                <ChevronDown size={11} className={`text-[var(--theme-secondary-text)]/40 transition-transform duration-200 ${offlineExpanded ? '' : '-rotate-90'}`} />
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
