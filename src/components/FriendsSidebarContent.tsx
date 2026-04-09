import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Mic, Headphones, ShieldCheck, ChevronDown, Check, X,
  UserPlus, FolderPlus, MoreHorizontal, Pencil, Trash2, FolderInput, FolderMinus, Star, MessageSquare, PhoneCall,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import { useFriendGroups, type FriendGroup } from '../hooks/useFriendGroups';
import { useFavoriteFriends } from '../hooks/useFavoriteFriends';
import DeviceBadge from './chat/DeviceBadge';
import { useConfirm } from '../contexts/ConfirmContext';
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
  isMuted?: boolean;
  isDeafened?: boolean;
}

export default function FriendsSidebarContent({
  variant, onUserClick, onDM, channels, activeChannel,
  inviteStatuses = {}, inviteCooldowns = {}, handleInviteUser,
  isMuted: selfMuted, isDeafened: selfDeafened,
}: Props) {
  const {
    currentUser, allUsers, friendIds, friendsLoading, getStatusColor,
    incomingRequests, acceptRequest, rejectRequest,
  } = useUser();
  const { setToastMsg } = useUI();
  const { avatarBorderColor, showLastSeen } = useSettings();

  const {
    groups, memberMap, getGroupForFriend,
    createGroup, renameGroup, deleteGroup, assignToGroup, removeFromGroup,
  } = useFriendGroups(currentUser.id || undefined);

  const { favoriteIds, isFavorite, toggleFavorite } = useFavoriteFriends(currentUser.id || undefined);

  // ── Derived lists ──────────────────────────────────────────────────────
  const friendUsers = useMemo(() => allUsers.filter(u => friendIds.has(u.id)), [allUsers, friendIds]);
  const onlineUsers = useMemo(() => friendUsers.filter(u => u.status === 'online'), [friendUsers]);
  const offlineUsers = useMemo(() => friendUsers.filter(u => u.status === 'offline'), [friendUsers]);

  // Online favorites — exclusive section, not duplicated elsewhere
  const onlineFavorites = useMemo(
    () => onlineUsers.filter(u => favoriteIds.has(u.id)),
    [onlineUsers, favoriteIds]
  );
  const nonFavoriteOnline = useMemo(
    () => onlineUsers.filter(u => !favoriteIds.has(u.id)),
    [onlineUsers, favoriteIds]
  );

  // Group online users by their assigned group (excluding favorites)
  const groupedOnline = useMemo(() => {
    const result: { group: FriendGroup; users: User[] }[] = [];
    for (const g of groups) {
      const members = memberMap.get(g.id);
      if (!members || members.size === 0) continue;
      const users = nonFavoriteOnline.filter(u => members.has(u.id));
      if (users.length > 0) result.push({ group: g, users });
    }
    return result;
  }, [groups, memberMap, nonFavoriteOnline]);

  const ungroupedOnline = useMemo(() => {
    return nonFavoriteOnline.filter(u => !getGroupForFriend(u.id));
  }, [nonFavoriteOnline, getGroupForFriend]);

  // ── Offline collapse ───────────────────────────────────────────────────
  const [offlineExpanded, setOfflineExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('offlineUsersExpanded');
    return saved !== null ? saved === 'true' : false;
  });

  // ── Group management state ─────────────────────────────────────────────
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const [friendMenu, setFriendMenu] = useState<{ userId: string; userName: string; x: number; y: number } | null>(null);
  const { openConfirm } = useConfirm();

  useEffect(() => {
    if (creatingGroup && createInputRef.current) createInputRef.current.focus();
  }, [creatingGroup]);
  useEffect(() => {
    if (renamingGroupId && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingGroupId]);

  // Close menus on outside click
  useEffect(() => {
    if (!groupMenu && !friendMenu) return;
    const handler = () => { setGroupMenu(null); setFriendMenu(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [groupMenu, friendMenu]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const MAX_GROUPS = 10;

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { setCreatingGroup(false); return; }
    if (groups.length >= MAX_GROUPS) {
      setToastMsg(`En fazla ${MAX_GROUPS} grup oluşturabilirsin`);
      setCreatingGroup(false); setNewGroupName(''); return;
    }
    const ok = await createGroup(name);
    if (ok) setToastMsg(`"${name}" grubu oluşturuldu`);
    setNewGroupName('');
    setCreatingGroup(false);
  };

  const handleRenameGroup = async () => {
    if (!renamingGroupId) return;
    const name = renameValue.trim();
    if (!name) { setRenamingGroupId(null); return; }
    const ok = await renameGroup(renamingGroupId, name);
    if (ok) setToastMsg('Grup adı güncellendi');
    setRenamingGroupId(null);
    setRenameValue('');
  };

  const triggerDeleteGroup = (groupId: string, groupName: string) => {
    openConfirm({
      title: 'Grubu sil',
      description: `"${groupName}" grubunu silmek istiyor musun? Arkadaşların silinmez, sadece grup kaldırılır.`,
      confirmText: 'Sil',
      cancelText: 'İptal',
      danger: true,
      onConfirm: async () => {
        const ok = await deleteGroup(groupId);
        if (ok) setToastMsg(`"${groupName}" grubu silindi`);
      },
    });
  };

  const handleAcceptRequest = async (userId: string, name: string) => {
    const ok = await acceptRequest(userId);
    setToastMsg(ok ? `${name} artık arkadaşın` : 'İşlem başarısız');
  };

  const handleRejectRequest = async (userId: string) => {
    const ok = await rejectRequest(userId);
    setToastMsg(ok ? 'İstek reddedildi' : 'İşlem başarısız');
  };

  const isDesktop = variant === 'desktop';

  // ── Drag & drop state (desktop only) ───────────────────────────────────
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // groupId or '__ungrouped__'

  const handleDragStart = (e: React.DragEvent, userId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', userId);
    // Slight delay so the drag image renders first
    requestAnimationFrame(() => setDraggingUserId(userId));
  };

  const handleDragEnd = () => {
    setDraggingUserId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== targetId) setDropTarget(targetId);
  };

  const handleDragLeave = (e: React.DragEvent, targetId: string) => {
    // Only clear if actually leaving the container (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (dropTarget === targetId) setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const userId = e.dataTransfer.getData('text/plain');
    setDraggingUserId(null);
    setDropTarget(null);
    if (!userId) return;

    if (targetId === '__ungrouped__') {
      // Remove from any group
      const currentGroup = getGroupForFriend(userId);
      if (!currentGroup) return; // already ungrouped, no-op
      const ok = await removeFromGroup(userId);
      if (ok) {
        const user = onlineUsers.find(u => u.id === userId);
        if (user) setToastMsg(`${formatFullName(user.firstName, user.lastName)} gruptan çıkarıldı`);
      }
    } else {
      // Assign to group
      const currentGroup = getGroupForFriend(userId);
      if (currentGroup === targetId) return; // already in this group, no-op
      const group = groups.find(g => g.id === targetId);
      const ok = await assignToGroup(userId, targetId);
      if (ok && group) {
        const user = onlineUsers.find(u => u.id === userId);
        if (user) setToastMsg(`${formatFullName(user.firstName, user.lastName)} → ${group.name}`);
      }
    }
  };

  const dropHighlightClass = 'ring-1 ring-[var(--theme-accent)]/20 bg-[rgba(var(--theme-accent-rgb),0.03)]';

  // ── Render user item ───────────────────────────────────────────────────
  const renderOnlineUser = (user: User) => {
    const isMe = user.id === currentUser.id;

    const isDragging = draggingUserId === user.id;

    return (
      <div
        key={user.id}
        className={`flex items-center gap-3 ${isDesktop ? 'px-2.5 py-2 rounded-xl' : 'px-2 py-2 rounded-lg'} transition-all duration-200 group hover:bg-[rgba(var(--glass-tint),0.05)] cursor-pointer ${isDragging ? 'opacity-40 scale-[0.97]' : ''}`}
        draggable={isDesktop && !isMe}
        onDragStart={isDesktop && !isMe ? (e) => handleDragStart(e, user.id) : undefined}
        onDragEnd={isDesktop ? handleDragEnd : undefined}
        onClick={(e) => { e.stopPropagation(); onUserClick(user.id, e.clientX, e.clientY); }}
        onContextMenu={(e) => {
          if (isMe) return;
          e.preventDefault();
          setFriendMenu({ userId: user.id, userName: formatFullName(user.firstName, user.lastName), x: e.clientX, y: e.clientY });
        }}
      >
        <div className="relative shrink-0">
          <div
            className={`${isDesktop ? 'h-8 w-8' : 'h-9 w-9'} overflow-hidden border-2 avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
            style={{ borderColor: isMe ? avatarBorderColor : 'transparent' }}
          >
            {user.avatar?.startsWith('http')
              ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : user.avatar}
          </div>
          <DeviceBadge platform={user.platform} size={isDesktop ? 12 : 13} className="absolute -bottom-0.5 -right-0.5" />
        </div>
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
            {user.statusText && user.statusText !== 'Aktif' && (
              <span className={`text-[9px] font-bold uppercase tracking-tight ${getStatusColor(user.statusText)}`}>{user.statusText}</span>
            )}
          </div>
        </div>
        {/* Desktop invite button */}
        {isDesktop && handleInviteUser && (() => {
          const alreadyInChannel = activeChannel && channels?.find((c: any) => c.id === activeChannel)?.members?.includes(user.name);
          const canInvite = !isMe && activeChannel && !alreadyInChannel;
          if (!canInvite) return null;

          const status = inviteStatuses[user.id];
          const cooldownUntil = inviteCooldowns[user.id];
          const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
          const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

          if (status === 'pending') return <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-blue-400 bg-blue-500/10"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /></span>;
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
      <div className="relative">
        <div
          className={`${isDesktop ? 'h-8 w-8' : 'h-9 w-9'} overflow-hidden ${isDesktop ? 'border-2 avatar-squircle' : 'rounded-full bg-[var(--theme-border)]/30'} flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]`}
          style={isDesktop ? { borderColor: user.id === currentUser.id ? avatarBorderColor : 'transparent' } : undefined}
        >
          {user.avatar?.startsWith('http')
            ? <img src={user.avatar} alt="" className={`w-full h-full object-cover ${isDesktop ? '' : 'grayscale'}`} referrerPolicy="no-referrer" />
            : user.avatar}
        </div>
        {isDesktop && <DeviceBadge platform={user.platform} size={12} className="absolute -bottom-0.5 -right-0.5" />}
      </div>
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
        {isDesktop && showLastSeen && user.showLastSeen !== false && user.lastSeenAt && (
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

  // ── Render pending request ─────────────────────────────────────────────
  const renderPendingRequest = (req: typeof incomingRequests[number]) => {
    const user = allUsers.find(u => u.id === req.senderId);
    if (!user) return null;
    const name = formatFullName(user.firstName, user.lastName);
    return (
      <div key={req.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[rgba(var(--glass-tint),0.04)] transition-all">
        <div className="shrink-0 w-8 h-8 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
          {user.avatar?.startsWith('http')
            ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-70">{(user.firstName?.[0] || '?').toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[var(--theme-text)] truncate leading-tight">{name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleAcceptRequest(req.senderId, name)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
            title="Kabul et"
          >
            <Check size={13} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => handleRejectRequest(req.senderId)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Reddet"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  };

  // ── Group section header ───────────────────────────────────────────────
  const renderGroupHeader = (group: FriendGroup, count: number) => {
    if (renamingGroupId === group.id) {
      return (
        <div className="flex items-center gap-1.5 mb-2 px-2">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameGroup(); if (e.key === 'Escape') setRenamingGroupId(null); }}
            onBlur={handleRenameGroup}
            className="flex-1 text-[9px] font-bold uppercase tracking-[0.14em] bg-transparent text-[var(--theme-text)] border-b border-[var(--theme-accent)]/30 outline-none px-0.5 py-0.5"
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 mb-2 px-2 group/gh">
        <span className="text-[9px] font-bold text-[var(--theme-accent)]/50 uppercase tracking-[0.14em]">{group.name}</span>
        <span className="text-[9px] bg-[var(--theme-accent)]/6 text-[var(--theme-accent)]/40 px-1.5 py-0.5 rounded-full font-bold">{count}</span>
        <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
        <button
          onClick={(e) => { e.stopPropagation(); setGroupMenu({ groupId: group.id, x: e.clientX, y: e.clientY }); }}
          className="opacity-25 group-hover/gh:opacity-60 hover:!opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-[var(--theme-secondary-text)]"
          title="Grup ayarları"
        >
          <MoreHorizontal size={11} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            triggerDeleteGroup(group.id, group.name);
          }}
          className="opacity-0 group-hover/gh:opacity-40 hover:!opacity-100 hover:text-red-400 transition-all w-5 h-5 rounded flex items-center justify-center text-[var(--theme-secondary-text)]"
          title="Grubu sil"
        >
          <Trash2 size={10} />
        </button>
      </div>
    );
  };

  const hasContent = friendUsers.length > 0 || incomingRequests.length > 0;

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
          {/* 1. Pending requests */}
          {incomingRequests.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-2">
                <span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-[0.14em]">Bekleyen İstekler</span>
                <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-bold">{incomingRequests.length}</span>
                <div className="flex-1 h-px bg-blue-400/10" />
              </div>
              <div className="space-y-0.5">
                {incomingRequests.map(renderPendingRequest)}
              </div>
            </div>
          )}

          {/* 2. Favorites — online only */}
          {onlineFavorites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-2">
                <Star size={9} className="text-amber-400/60 fill-amber-400/60" />
                <span className="text-[9px] font-bold text-amber-400/50 uppercase tracking-[0.14em]">Favoriler</span>
                <span className="text-[9px] bg-amber-400/8 text-amber-400/50 px-1.5 py-0.5 rounded-full font-bold">{onlineFavorites.length}</span>
                <div className="flex-1 h-px bg-amber-400/10" />
              </div>
              <div className="space-y-1">
                {onlineFavorites.map(renderOnlineUser)}
              </div>
            </div>
          )}

          {/* 3. Friend groups — boş olsa da görünür */}
          {groups.map(group => {
            const entry = groupedOnline.find(g => g.group.id === group.id);
            const users = entry?.users || [];
            return (
              <div
                key={group.id}
                onDragOver={isDesktop ? (e) => handleDragOver(e, group.id) : undefined}
                onDragLeave={isDesktop ? (e) => handleDragLeave(e, group.id) : undefined}
                onDrop={isDesktop ? (e) => handleDrop(e, group.id) : undefined}
                className={`rounded-lg transition-all duration-150 ${draggingUserId && dropTarget === group.id ? dropHighlightClass : ''}`}
              >
                {renderGroupHeader(group, users.length)}
                <div className="space-y-1" style={{ minHeight: draggingUserId && users.length === 0 ? 20 : undefined }}>
                  {users.length > 0 ? users.map(renderOnlineUser) : !draggingUserId && (
                    <p className="text-[9px] text-[var(--theme-secondary-text)] opacity-25 px-2 py-1">Boş grup</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* 3. Ungrouped online friends */}
          {(ungroupedOnline.length > 0 || (draggingUserId && groups.length > 0)) && (
            <div
              onDragOver={isDesktop ? (e) => handleDragOver(e, '__ungrouped__') : undefined}
              onDragLeave={isDesktop ? (e) => handleDragLeave(e, '__ungrouped__') : undefined}
              onDrop={isDesktop ? (e) => handleDrop(e, '__ungrouped__') : undefined}
              className={`rounded-lg transition-all duration-150 ${draggingUserId && dropTarget === '__ungrouped__' ? dropHighlightClass : ''}`}
            >
              <div className="flex items-center gap-2 mb-2 px-2">
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.14em]">
                  {groups.length > 0 ? 'Diğer' : 'Çevrimiçi'}
                </span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">{ungroupedOnline.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/10" />
              </div>
              <div className="space-y-1" style={{ minHeight: draggingUserId ? 24 : undefined }}>
                {ungroupedOnline.map(renderOnlineUser)}
              </div>
            </div>
          )}

          {/* 4. Offline — all in one section */}
          {offlineUsers.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => { const next = !offlineExpanded; setOfflineExpanded(next); localStorage.setItem('offlineUsersExpanded', String(next)); }}
                className="flex items-center gap-2 w-full mb-2 px-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/50 uppercase tracking-[0.14em]">Çevrimdışı</span>
                <span className="text-[9px] bg-[var(--theme-secondary-text)]/8 text-[var(--theme-secondary-text)]/50 px-1.5 py-0.5 rounded-full font-bold">{offlineUsers.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
                <ChevronDown size={11} className={`text-[var(--theme-secondary-text)]/40 transition-transform duration-200 ${offlineExpanded ? '' : '-rotate-90'}`} />
              </button>
              {offlineExpanded && (
                <div className="space-y-1">
                  {offlineUsers.map(renderOfflineUser)}
                </div>
              )}
            </div>
          )}

          {/* New group: inline input or create button */}
          {creatingGroup ? (
            <div className="px-2">
              <input
                ref={createInputRef}
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); if (e.key === 'Escape') { setCreatingGroup(false); setNewGroupName(''); } }}
                onBlur={handleCreateGroup}
                placeholder="Grup adı..."
                className="w-full text-[10px] bg-transparent text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 border border-[var(--theme-accent)]/20 rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--theme-accent)]/40 transition-colors"
              />
            </div>
          ) : groups.length < MAX_GROUPS ? (
            <button
              onClick={() => setCreatingGroup(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 mx-2 rounded-lg text-[9px] font-semibold text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--glass-tint),0.04)] transition-all"
            >
              <FolderPlus size={10} /> Yeni grup
            </button>
          ) : null}
        </>}
      </div>


      {/* Group context menu */}
      <AnimatePresence>
        {groupMenu && (
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setGroupMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[201] py-1 rounded-lg overflow-hidden min-w-[140px]"
              style={{
                top: groupMenu.y,
                left: Math.min(groupMenu.x, window.innerWidth - 160),
                background: 'rgba(var(--theme-bg-rgb), 0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(var(--glass-tint), 0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}
            >
              <button
                onClick={() => {
                  const g = groups.find(g => g.id === groupMenu.groupId);
                  setRenameValue(g?.name || '');
                  setRenamingGroupId(groupMenu.groupId);
                  setGroupMenu(null);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
              >
                <Pencil size={11} className="text-[var(--theme-secondary-text)]" /> Yeniden adlandır
              </button>
              <button
                onClick={() => {
                  const g = groups.find(g => g.id === groupMenu.groupId);
                  triggerDeleteGroup(groupMenu.groupId, g?.name || '');
                  setGroupMenu(null);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/8 transition-colors"
              >
                <Trash2 size={11} /> Grubu sil
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
              <div className="h-px mx-2 my-0.5 bg-[var(--theme-border)]/10" />
              {/* Assign to group */}
              {groups.length > 0 && (
                <div className="px-3 py-1 text-[9px] font-bold text-[var(--theme-secondary-text)]/40 uppercase tracking-wider">Gruba taşı</div>
              )}
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={async () => {
                    const ok = await assignToGroup(friendMenu.userId, g.id);
                    if (ok) setToastMsg(`${friendMenu.userName} → ${g.name}`);
                    setFriendMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
                >
                  <FolderInput size={11} className="text-[var(--theme-secondary-text)]" /> {g.name}
                </button>
              ))}
              {getGroupForFriend(friendMenu.userId) && (
                <button
                  onClick={async () => {
                    const ok = await removeFromGroup(friendMenu.userId);
                    if (ok) setToastMsg(`${friendMenu.userName} gruptan çıkarıldı`);
                    setFriendMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-orange-400 hover:bg-orange-500/8 transition-colors"
                >
                  <FolderMinus size={11} /> Gruptan çıkar
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </>
  );
}
