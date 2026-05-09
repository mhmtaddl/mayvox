import React, { useMemo, useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Volume2,
  Lock,
  Sparkles,
  Timer,
  Radio,
  Headphones,
  Settings,
  Compass,
  Power,
} from 'lucide-react';
import { getPublicDisplayName } from '../../../lib/formatName';
import { logMemberIdentityDebug, resolveUserByMemberKey } from '../../../lib/memberIdentity';
import AvatarContent from '../../../components/AvatarContent';
import { useSettings } from '../../../contexts/SettingsCtx';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../../../lib/avatarFrame';
import { hasCustomAvatar } from '../../../lib/statusAvatar';
import { getUserRoomLimit, roomLimitMessage } from '../../../lib/planConfig';
import { ConnectionQualityIndicator } from '../../../components/chat';
import appLogo from '../../../assets/dock-logo-mv_tr.png';
import DeviceBadge from '../../../components/chat/DeviceBadge';
import RoleBadge, { getUserRoleBadge } from '../../../components/RoleBadge';
import UpdateVersionHub from '../../update/components/UpdateVersionHub';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { rangeVisualStyle } from '../../../lib/rangeStyle';
import { useUI } from '../../../contexts/UIContext';
import { useAudio } from '../../../contexts/AudioContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { channelIconComponents, roomModeIcons, FORCE_MOBILE } from '../constants';
import { Coffee } from 'lucide-react';
import { getDefaultChannelIconColor } from '../../../lib/channelIconColor';
import { getDefaultChannelIconName } from '../../../lib/channelIcon';
import RoomStatusBadges from './RoomStatusBadges';

interface Props {
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, channelId: string) => void;
  handleDragStart: (e: React.DragEvent, userName: string) => void;
  onUserClick: (userId: string, x: number, y: number) => void;
  /** Sağ-tık / context menü talebi — ChatView seviyesinde role-aware menü açar. */
  onUserContextMenu?: (userId: string, x: number, y: number) => void;
  activeServerName?: string;
  activeServerShortName?: string;
  activeServerAvatarUrl?: string;
  activeServerMotto?: string;
  activeServerRole?: string;
  activeServerPublic?: boolean;
  activeServerPlan?: string | null;
  onShowSettings?: () => void;
  onShowDiscover?: () => void;
  onLeaveServer?: (serverId: string) => Promise<void>;
}

// ── VolumeLabel ──────────────────────────────────────────────────────────
// Member row'daki kalıcı "%NN" etiketinin yerine premium davranış:
//   1) Default (50) ise hiç render yok
//   2) Default değilse ama hover yoksa opacity 0 (group-hover ile açılır)
//   3) Slider değeri yeni değiştiyse 1.8 sn boyunca opacity 100, sonra fade
// Parent row `.group/member` classına sahip, group-hover pattern'i oradan gelir.
const VolumeLabel = React.memo(function VolumeLabel({ value }: { value: number | undefined }) {
  const [recentlyChanged, setRecentlyChanged] = useState(false);
  const prevRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === prevRef.current) return;
    const isInitialAssign = prevRef.current === undefined;
    prevRef.current = value;
    if (isInitialAssign) return;
    setRecentlyChanged(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setRecentlyChanged(false), 1800);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value]);

  if (value === undefined || value === 100) return null;

  return (
    <span
      className={`text-[9px] text-[var(--theme-secondary-text)] font-bold tabular-nums transition-opacity duration-500 shrink-0 ${
        recentlyChanged ? 'opacity-100' : 'opacity-0 group-hover/member:opacity-90'
      }`}
    >
      %{value}
    </span>
  );
});

export default function LeftSidebar({ handleDragOver, handleDrop, handleDragStart, onUserContextMenu, activeServerName, activeServerShortName, activeServerAvatarUrl, activeServerMotto, activeServerRole, activeServerPublic, activeServerPlan, onShowSettings, onShowDiscover, onLeaveServer }: Props) {
  const { channels, activeChannel, isConnecting, activeServerId, accessContext } = useChannel();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const canReorderChannels = accessContext?.flags.canReorderChannels ?? false;
  const canCreateChannel = accessContext?.flags.canCreateChannel ?? false;
  const canMoveMembers = accessContext?.flags.canMoveMembers ?? false;
  // Server-specific fallback: accessContext henüz yüklenmediyse (ilk render),
  // listMyServers'dan gelen activeServerRole'ü kullan — global currentUser.isAdmin yerine.
  const serverAdminFallback = activeServerRole === 'owner' || activeServerRole === 'admin';
  const { currentUser, allUsers } = useUser();
  const { avatarBorderColor } = useSettings();
  const selfFrameTier = getFrameTier(currentUser.userLevel, { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin });
  const { userVolumes, setContextMenu, setRoomModal, setToastMsg } = useUI();
  const { connectionLevel, connectionLatencyMs, connectionJitterMs } = useAudio();
  const { handleJoinChannel, handleContextMenu, handleReorderChannels, appVersion, showReleaseNotes, setShowReleaseNotes, handleUpdateUserVolume } = useAppState();

  // Inline volume edit — tıklanan kullanıcının ismi yerine slider çıkar,
  // dışına tıklayınca kapanır. Popup (action menu) yerine in-row UX.
  const [editingVolumeUserId, setEditingVolumeUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!editingVolumeUserId) return;
    const handler = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('[data-inline-volume-row]')) return;
      setEditingVolumeUserId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingVolumeUserId]);

  // ── Channel drag-reorder state (local) ──
  const CHANNEL_DRAG_MIME = 'mayvox/channel';
  const [draggingChannelId, setDraggingChannelId] = useState<string | null>(null);
  const [dropTargetChannelId, setDropTargetChannelId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState(false);

  const clearDragState = useCallback(() => {
    setDraggingChannelId(null);
    setDropTargetChannelId(null);
    setDropBefore(false);
  }, []);

  // Reorder sırasında scroll pozisyonunu koru — uzun listede jump'ı önler.
  const channelScrollRef = useRef<HTMLElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingScrollRef.current != null && channelScrollRef.current) {
      channelScrollRef.current.scrollTop = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [channels]);

  const { leftSidebarW, handleSidebarDragStart } = useSidebarResize();

  // Backend zaten hidden kanalları filtreliyor (authoritative). Client filtresi sadece
  // defans amaçlı: backend bir an eski veriyi döndürürse kullanıcının ownerId/admin/active
  // kanalı yine de görünür kalsın.
  const visibleChannels = useMemo(
    () => channels.filter(c => !c.isHidden || c.ownerId === currentUser.id || currentUser.isAdmin || activeChannel === c.id),
    [channels, currentUser.id, currentUser.isAdmin, activeChannel]
  );
  const userLookup = useMemo(() => {
    const byId = new Map<string, typeof allUsers[number]>();
    const byName = new Map<string, typeof allUsers[number]>();
    for (const user of allUsers) {
      byId.set(user.id, user);
      if (user.name) byName.set(user.name, user);
    }
    return { byId, byName };
  }, [allUsers]);
  const resolveMemberUser = useCallback((memberId: string) => {
    return userLookup.byId.get(memberId)
      ?? userLookup.byName.get(memberId)
      ?? resolveUserByMemberKey(memberId, allUsers);
  }, [userLookup, allUsers]);
  const userRoomCount = useMemo(
    () => channels.filter(c => c.ownerId === currentUser.id).length,
    [channels, currentUser.id],
  );

  return (
    <aside
      className={`mv-shell-panel mv-shell-left-panel relative ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} flex-col shrink-0`}
      style={{
        width: leftSidebarW,
        '--left-sidebar-width': `${leftSidebarW}px`,
        background: 'var(--sidebar-tint-bg)',
        boxShadow: 'none',
        border: 0,
      } as React.CSSProperties}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleSidebarDragStart}
        className="group/resize absolute top-0 -right-[3px] w-[6px] h-full cursor-col-resize z-20"
      >
        <span className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full bg-[var(--theme-accent)]/35 opacity-0 transition-opacity group-hover/resize:opacity-100 group-active/resize:opacity-100" />
      </div>
      {/* ── A. Marka / Sunucu Header ── */}
      <div className="px-5 pt-5 pb-3.5 shrink-0 flex items-center gap-3.5 select-none group/header">
        {activeServerAvatarUrl ? (
          <img src={activeServerAvatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.1)]" style={{ border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }} draggable={false} />
        ) : activeServerShortName ? (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.08)]"
            style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.14), rgba(var(--theme-accent-rgb), 0.06))', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
            <span className="text-[13px] font-bold text-[var(--theme-accent)]">{activeServerShortName}</span>
          </div>
        ) : (
          <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.08)]"
            style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.10), rgba(var(--theme-accent-rgb), 0.04))', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
            {/* Kulaklıktan yayılan sessiz ses — sol + sağ arc, premium idle */}
            <svg className="mv-brand-wave-l" viewBox="0 0 8 12" fill="none" aria-hidden="true">
              <path d="M6 2 C 3 4, 3 8, 6 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <path d="M3 3.2 C 1.3 5, 1.3 7, 3 8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.65" />
            </svg>
            <svg className="mv-brand-wave-r" viewBox="0 0 8 12" fill="none" aria-hidden="true">
              <path d="M2 2 C 5 4, 5 8, 2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
              <path d="M5 3.2 C 6.7 5, 6.7 7, 5 8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.65" />
            </svg>
            <img src={appLogo} alt="MAYVOX" className="w-full h-full object-cover rounded-[inherit] mv-brand-breath" draggable={false}
              onError={e => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const fb = document.createElement('span');
                fb.className = 'text-[13px] font-bold text-[var(--theme-accent)]';
                fb.textContent = 'MV';
                img.parentElement?.appendChild(fb);
              }} />
          </div>
        )}
        <div className="flex flex-col leading-none min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="mv-font-title text-[14px] font-bold text-[var(--theme-text)] truncate tracking-[-0.01em]">
              {(() => {
                // Marka rengi uyumu: ikinci kelime (veya MAYVOX'ta "VOX") accent renginde.
                const raw = activeServerName ?? 'MAYVOX';
                const spaceIdx = raw.indexOf(' ');
                if (spaceIdx > 0) {
                  const first = raw.slice(0, spaceIdx);
                  const rest = raw.slice(spaceIdx + 1);
                  return <>{first} <span style={{ color: 'var(--theme-accent)' }}>{rest}</span></>;
                }
                return raw;
              })()}
            </h1>
            {activeServerPublic === false && <Lock size={10} className="text-[var(--theme-secondary-text)]/35 shrink-0" />}
          </div>
          <span className="mv-sidebar-motto text-[8px] font-semibold tracking-[0.14em] uppercase text-[var(--theme-secondary-text)]/25 mt-1 truncate max-w-full">{activeServerMotto || 'voice & chat'}</span>
        </div>
        {activeServerId && (() => {
          // SUNUCU ROLÜ tek belirleyici — app-level admin (canManageServer flag) kasten
          // dikkate alınmaz; bu buton sunucu-içi yetki içindir.
          //   owner / admin / mod   → Ayarlar ikonu
          //   member (veya tanımsız) → Ayrıl (Power) ikonu
          const hasServerStaffRole = activeServerRole === 'owner' || activeServerRole === 'admin' || activeServerRole === 'mod';
          if (hasServerStaffRole && onShowSettings) {
            return (
              <button onClick={onShowSettings} title="Sunucu Ayarları"
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/25 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 transition-all duration-150">
                <Settings size={13} />
              </button>
            );
          }
          if (onLeaveServer) {
            return (
              <button onClick={() => setLeaveConfirmOpen(true)} title="Sunucudan Ayrıl"
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/25 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150">
                <Power size={13} />
              </button>
            );
          }
          return null;
        })()}
      </div>
      <div className="mx-5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.07), transparent)' }} />

      <div className="mv-density-sidebar-content px-5 pt-4 pb-4 flex flex-col flex-1 min-h-0">
        {visibleChannels.length === 0 ? (
          /* Sunucusuz durum — sidebar empty state */
          <div className="flex-1 flex flex-col items-center justify-center px-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(var(--glass-tint), 0.04)' }}>
              <Volume2 size={18} className="text-[var(--theme-secondary-text)]/20" />
            </div>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/35 text-center leading-relaxed max-w-[160px]">
              Bir sohbet sunucusuna katılarak ses kanallarını görüntüleyebilirsin.
            </p>
          </div>
        ) : (
        <>
        <div className="flex items-center gap-2 text-[var(--theme-secondary-text)] mb-3">
          <Volume2 size={13} className="opacity-40" />
          <span className="uppercase text-[9px] tracking-[0.18em] font-bold opacity-40">Ses Kanalları</span>
        </div>

        <nav ref={channelScrollRef} className="mv-density-channel-stack flex-1 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
          {visibleChannels.map(channel => {
            // Capability-driven: resolver falsy iken legacy isAdmin fallback.
            const canReorderThis = canReorderChannels || serverAdminFallback;
            const isDragging = draggingChannelId === channel.id;
            const isDropTarget = dropTargetChannelId === channel.id && draggingChannelId && draggingChannelId !== channel.id;
            return (
            <div key={channel.id} className="mv-density-channel-stack space-y-1">
              <button
                draggable={canReorderThis}
                onDragStart={(e) => {
                  if (!canReorderThis) return;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(CHANNEL_DRAG_MIME, channel.id);
                  setDraggingChannelId(channel.id);
                }}
                onDragEnd={clearDragState}
                onClick={() => handleJoinChannel(channel.id)}
                onContextMenu={(e) => handleContextMenu(e, channel.id)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(CHANNEL_DRAG_MIME)) {
                    if (draggingChannelId === channel.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const before = e.clientY < rect.top + rect.height / 2;
                    if (dropTargetChannelId !== channel.id || dropBefore !== before) {
                      setDropTargetChannelId(channel.id);
                      setDropBefore(before);
                    }
                    return;
                  }
                  handleDragOver(e);
                }}
                onDragLeave={(e) => {
                  if (!e.dataTransfer.types.includes(CHANNEL_DRAG_MIME)) return;
                  if (dropTargetChannelId === channel.id) setDropTargetChannelId(null);
                }}
                onDrop={(e) => {
                  const dragId = e.dataTransfer.getData(CHANNEL_DRAG_MIME);
                  if (dragId) {
                    e.preventDefault();
                    e.stopPropagation();
                    clearDragState();
                    if (!activeServerId || dragId === channel.id) return;
                    // Sıralamayı yeniden üret: kaynakt kanalı hedefin önüne/arkasına yerleştir
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const placeBefore = e.clientY < rect.top + rect.height / 2;
                    const baseOrder = channels.map(c => c.id).filter(id => id !== dragId);
                    const targetIdx = baseOrder.indexOf(channel.id);
                    if (targetIdx < 0) return;
                    const insertAt = placeBefore ? targetIdx : targetIdx + 1;
                    baseOrder.splice(insertAt, 0, dragId);
                    // Scroll pozisyonunu snapshot et — useLayoutEffect commit sonrası restore eder.
                    pendingScrollRef.current = channelScrollRef.current?.scrollTop ?? null;
                    void handleReorderChannels(baseOrder);
                    return;
                  }
                  handleDrop(e, channel.id);
                }}
                disabled={isConnecting}
                style={
                  isDropTarget
                    ? {
                        boxShadow: dropBefore
                          ? 'inset 0 2px 0 0 var(--theme-accent)'
                          : 'inset 0 -2px 0 0 var(--theme-accent)',
                      }
                    : undefined
                }
                className={`mv-density-channel-row w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 group active:scale-[0.97] active:duration-75 ${
                  isDragging ? 'opacity-40 ' : ''
                }${
                  activeChannel === channel.id
                    ? `bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20 shadow-[inset_0_0_12px_rgba(var(--theme-accent-rgb),0.08),inset_0_1px_0_rgba(var(--theme-accent-rgb),0.1)]${isConnecting ? ' animate-pulse' : ''}`
                    : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'
                }`}
              >
                <div className="relative">
                  {(() => {
                    const mode = channel.mode || 'social';
                    const IC = channelIconComponents[channel.iconName ?? getDefaultChannelIconName(mode)] || roomModeIcons[mode] || Coffee;
                    return <IC size={16} className="opacity-90" style={{ color: channel.iconColor ?? getDefaultChannelIconColor(mode) }} />;
                  })()}
                </div>
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="mv-font-title font-medium truncate" style={{ fontSize: channel.name.length > 14 ? 'var(--mv-font-body)' : 'var(--mv-font-title)' }}>{channel.name}</span>
                  {channel.deletionTimer !== undefined && !channel.userCount && (
                    <div className="flex items-center gap-1 bg-red-500/20 px-1.5 py-0.5 rounded border border-red-500/30 shrink-0">
                      <Timer size={10} className="text-red-500 animate-pulse" />
                      <span className="text-[9px] font-mono font-bold text-red-500">
                        {channel.deletionTimer}s
                      </span>
                    </div>
                  )}
                </div>
                <RoomStatusBadges channel={channel} isActive={activeChannel === channel.id} compact />
              </button>

              {/* Members List */}
              {channel.members && channel.members.length > 0 && (() => {
                const isBc = channel.mode === 'broadcast';
                const speakers = channel.speakerIds || [];
                const hasSpeakers = isBc && (speakers.length > 0 || !!channel.ownerId);
                const isSpeakerFn = (uid: string) => speakers.length > 0 ? speakers.includes(uid) : channel.ownerId === uid;
                const memberRows: Array<{ memberId: string; stableId: string; user: ReturnType<typeof resolveMemberUser> }> = [];
                for (const memberId of channel.members || []) {
                  if (!memberId) continue;
                  const user = resolveMemberUser(memberId);
                  const stableId = user?.id || memberId;
                  if (memberRows.some(row => row.stableId === stableId)) continue;
                  memberRows.push({ memberId, stableId, user });
                }

                const sorted = isBc
                  ? [...memberRows].sort((a, b) => (isSpeakerFn(b.stableId) ? 1 : 0) - (isSpeakerFn(a.stableId) ? 1 : 0))
                  : memberRows;

                let shownSpeakerLabel = false;
                let shownListenerLabel = false;

                return (
                <div className="pl-8 pr-2 space-y-0.5 pb-2 mt-0.5 ml-4 border-l border-[var(--theme-accent)]/10">
                  {sorted.map(({ memberId, stableId, user }) => {
                    if (!user) {
                      logMemberIdentityDebug('left_sidebar_unresolved_member', { memberId }, `left_sidebar:${memberId}`);
                    }
                    const isSp = isBc && user ? isSpeakerFn(user.id) : false;

                    let groupLabel: string | null = null;
                    if (hasSpeakers && user) {
                      if (isSp && !shownSpeakerLabel) { shownSpeakerLabel = true; groupLabel = 'Konuşmacılar'; }
                      if (!isSp && !shownListenerLabel) { shownListenerLabel = true; groupLabel = 'Dinleyiciler'; }
                    }

                    return (
                      <React.Fragment key={`${channel.id}:${stableId}`}>
                        {groupLabel && (
                          <>
                            {groupLabel === 'Dinleyiciler' && (
                              <div className="mx-1.5 my-1.5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />
                            )}
                            <div className="flex items-center gap-1.5 pt-1.5 pb-1 px-1.5">
                              {groupLabel === 'Konuşmacılar'
                                ? <Radio size={8} className="text-[var(--theme-accent)] opacity-50" />
                                : <Headphones size={8} className="text-[var(--theme-secondary-text)] opacity-30" />
                              }
                              <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]/50">{groupLabel}</span>
                            </div>
                          </>
                        )}
                      {/* Crossfade: placeholder ↔ real user */}
                      <div className="mv-density-member-row relative h-7">
                        {/* Placeholder layer */}
                        <div className={`absolute inset-0 flex items-center gap-2 py-1 px-1.5 transition-opacity duration-150 ${user ? 'opacity-0' : 'opacity-40'}`}>
                          <div className="h-5 w-5 rounded-[6px] bg-[rgba(var(--glass-tint),0.08)] shrink-0" />
                          <div className="text-[10px] font-medium text-[var(--theme-secondary-text)] truncate">
                            Bilinmeyen kullanıcı
                          </div>
                        </div>
                        {/* Real user layer */}
                        <div
                          data-keep-action-menu
                          data-inline-volume-row
                          draggable={(canMoveMembers || serverAdminFallback) && !!user && editingVolumeUserId !== user?.id}
                          onDragStart={(e) => user && handleDragStart(e, user.name || memberId)}
                          onClick={(e) => {
                            if (!user) return;
                            if (user.id === currentUser.id) return;
                            // Slider içindeki tıklamalar inline edit'i kapatmasın
                            if ((e.target as Element).closest('[data-volume-slider-control]')) return;
                            setEditingVolumeUserId(prev => (prev === user.id ? null : user.id));
                          }}
                          onContextMenu={(e) => {
                            if (!user) return;
                            if (user.id === currentUser.id) return;
                            e.preventDefault();
                            onUserContextMenu?.(user.id, e.clientX, e.clientY);
                          }}
                          className={`mv-font-meta absolute inset-0 flex items-center gap-2 text-[11px] transition-all duration-150 group/member py-1 px-1.5 rounded-lg ${user ? 'cursor-pointer hover:bg-[var(--theme-accent)]/5 active:scale-[0.98]' : 'pointer-events-none'} ${user ? (
                            isBc && isSp
                              ? 'font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)]'
                              : 'font-medium text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]'
                          ) : ''} ${isBc && !isSp && user ? 'opacity-70' : ''}`}
                          style={{ opacity: user ? undefined : 0, transform: user ? 'scale(1)' : 'scale(0.98)', transition: 'opacity 150ms ease-out, transform 150ms ease-out' }}
                        >
                          {user && <>
                            {(() => {
                              const isSelf = user.id === currentUser.id;
                              const uColor = isSelf ? avatarBorderColor : (user.avatarBorderColor || '');
                              const uTier = isSelf ? selfFrameTier : getFrameTier(user.userLevel, { isPrimaryAdmin: !!user.isPrimaryAdmin, isAdmin: !!user.isAdmin });
                              return (
                            <div
                              className={`relative shrink-0 ${uColor ? getFrameClassName(uTier) : ''}`}
                              style={uColor ? { ...getFrameStyle(uColor, uTier), borderRadius: '22%' } : undefined}
                            >
                              <div
                                className="h-5 w-5 overflow-hidden avatar-squircle flex items-center justify-center text-[8px] font-bold"
                                style={{
                                  background: hasCustomAvatar(user.avatar)
                                    ? 'rgba(0,0,0,0.15)'
                                    : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)',
                                  color: 'var(--theme-accent)',
                                }}
                              >
                                <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.displayName || user.firstName} name={getPublicDisplayName(user)} letterClassName="text-[8px] font-bold" />
                              </div>
                              <DeviceBadge platform={user.platform} size={10} className="absolute -bottom-0.5 -right-0.5" />
                            </div>
                              ); })()}
                            {editingVolumeUserId === user.id ? (
                              <div data-volume-slider-control className="flex-1 flex items-center gap-1.5 pr-1 min-w-0 overflow-hidden">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={userVolumes[user.id] ?? 100}
                                  onChange={e => handleUpdateUserVolume(user.id, parseInt(e.target.value, 10))}
                                  onMouseDown={e => e.stopPropagation()}
                                  onPointerDown={e => e.stopPropagation()}
                                  className="premium-range flex-1 min-w-0"
                                  style={rangeVisualStyle(userVolumes[user.id] ?? 100, 0, 100, { height: '3px' })}
                                />
                                <span className="text-[8px] font-bold tabular-nums text-[var(--theme-accent)] shrink-0">%{userVolumes[user.id] ?? 100}</span>
                              </div>
                            ) : (
                              <>
                                <span className="truncate flex-1">{getPublicDisplayName(user)}</span>
                                <RoleBadge role={getUserRoleBadge(user)} size="xs" subtle />
                                {isBc && (isSp
                                  ? <Radio size={9} className="shrink-0 text-[var(--theme-accent)]" />
                                  : <Headphones size={9} className="shrink-0 text-[var(--theme-secondary-text)] opacity-40" />
                                )}
                                <VolumeLabel value={userVolumes[user.id]} />
                              </>
                            )}
                          </>}
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          );
          })}

          {/* Oda Oluştur — capability-gated */}
          {(canCreateChannel || serverAdminFallback) && (() => {
            const roomLimit = getUserRoomLimit(activeServerPlan);
            const atLimit = userRoomCount >= roomLimit;
            return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (atLimit) {
                  setToastMsg(roomLimitMessage(activeServerPlan));
                  return;
                }
                setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social', iconColor: getDefaultChannelIconColor('social'), iconName: getDefaultChannelIconName('social') });
              }}
              className={`mv-density-channel-row w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                atLimit
                  ? 'text-[var(--theme-secondary-text)]/70 cursor-pointer hover:bg-[rgba(var(--glass-tint),0.04)]'
                  : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-accent)]'
              }`}
              title={atLimit ? roomLimitMessage(activeServerPlan) : undefined}
            >
              <Sparkles size={15} />
              <span className="mv-font-title font-medium">Oda Oluştur</span>
            </button>
            );
          })()}
        </nav>
        </>
        )}
      </div>

      {/* ── C. Alt Navigation + Sistem ── */}
      <div className="shrink-0 px-4 pb-3">
        <div className="h-px mb-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />

        {/* Keşfet */}
        {onShowDiscover && (
          <button onClick={onShowDiscover} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.05)] transition-all duration-150 mb-1.5 active:scale-[0.98]">
            <Compass size={14} className="text-[var(--theme-accent)] opacity-50" /> Topluluk Keşfet
          </button>
        )}

        {/* Sistem durumu */}
        <div className="flex items-center justify-center gap-3 px-1 py-1.5 rounded-xl" style={{ background: 'rgba(var(--glass-tint), 0.02)' }}>
          {appVersion && (
            <UpdateVersionHub
              currentVersion={appVersion}
              isAdmin={!!currentUser.isAdmin}
              autoShowNotes={showReleaseNotes}
              onNotesShown={() => setShowReleaseNotes(false)}
            />
          )}
          <ConnectionQualityIndicator connectionLevel={connectionLevel} latencyMs={connectionLatencyMs} jitterMs={connectionJitterMs} isConnecting={isConnecting} isActive={!!activeChannel} />
        </div>
      </div>

      {/* Sunucudan Ayrıl onay modalı — portal ile body'ye; aside'in backdrop-filter'ı
          fixed elementlere containing block olur, aksi halde modal panel içinde kalır. */}
      {leaveConfirmOpen && activeServerId && onLeaveServer && createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !leaving && setLeaveConfirmOpen(false)}>
          <div className="w-[340px] rounded-2xl p-5" onClick={e => e.stopPropagation()} style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.97)', border: '1px solid rgba(239,68,68,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <h3 className="text-[13px] font-bold text-red-400 mb-1">Sunucudan Ayrıl</h3>
            <p className="text-[10px] text-[var(--theme-secondary-text)]/55 mb-4">
              <strong className="text-[var(--theme-text)]">{activeServerName}</strong> sunucusundan ayrılmak istediğinden emin misin? Tekrar katılmak için davet gerekir.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLeaveConfirmOpen(false)} disabled={leaving}
                className="h-8 px-3 rounded-lg text-[10px] font-semibold text-[var(--theme-secondary-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)' }}>Vazgeç</button>
              <button
                onClick={async () => {
                  if (!activeServerId || !onLeaveServer) return;
                  setLeaving(true);
                  try { await onLeaveServer(activeServerId); setLeaveConfirmOpen(false); }
                  finally { setLeaving(false); }
                }}
                disabled={leaving}
                className="h-8 px-3 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-20 disabled:cursor-default transition-colors">
                {leaving ? 'Ayrılıyor...' : 'Ayrıl'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
