import React, { useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import {
  Volume2,
  Lock,
  Sparkles,
  Timer,
  Radio,
  Headphones,
  Settings,
  Compass,
} from 'lucide-react';
import { formatFullName } from '../../../lib/formatName';
import { getUserRoomLimit, roomLimitMessage } from '../../../lib/planConfig';
import { ConnectionQualityIndicator } from '../../../components/chat';
import DeviceBadge from '../../../components/chat/DeviceBadge';
import UpdateVersionHub from '../../update/components/UpdateVersionHub';
import { useChannel } from '../../../contexts/ChannelContext';
import { useUser } from '../../../contexts/UserContext';
import { useUI } from '../../../contexts/UIContext';
import { useAudio } from '../../../contexts/AudioContext';
import { useAppState } from '../../../contexts/AppStateContext';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { roomModeIcons, FORCE_MOBILE } from '../constants';
import { Coffee } from 'lucide-react';

interface Props {
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, channelId: string) => void;
  handleDragStart: (e: React.DragEvent, userName: string) => void;
  onUserClick: (userId: string, x: number, y: number) => void;
  activeServerName?: string;
  activeServerShortName?: string;
  activeServerAvatarUrl?: string;
  activeServerMotto?: string;
  activeServerRole?: string;
  activeServerPublic?: boolean;
  activeServerPlan?: string | null;
  onShowSettings?: () => void;
  onShowDiscover?: () => void;
}

export default function LeftSidebar({ handleDragOver, handleDrop, handleDragStart, onUserClick, activeServerName, activeServerShortName, activeServerAvatarUrl, activeServerMotto, activeServerRole, activeServerPublic, activeServerPlan, onShowSettings, onShowDiscover }: Props) {
  const { channels, activeChannel, isConnecting, activeServerId, accessContext } = useChannel();
  const canReorderChannels = accessContext?.flags.canReorderChannels ?? false;
  const canCreateChannel = accessContext?.flags.canCreateChannel ?? false;
  const canManageServer = accessContext?.flags.canManageServer ?? false;
  const canMoveMembers = accessContext?.flags.canMoveMembers ?? false;
  // Server-specific fallback: accessContext henüz yüklenmediyse (ilk render),
  // listMyServers'dan gelen activeServerRole'ü kullan — global currentUser.isAdmin yerine.
  const serverAdminFallback = activeServerRole === 'owner' || activeServerRole === 'admin';
  const { currentUser, allUsers } = useUser();
  const { userVolumes, setContextMenu, setRoomModal, setToastMsg } = useUI();
  const { connectionLevel } = useAudio();
  const { handleJoinChannel, handleContextMenu, handleReorderChannels, view, appVersion, showReleaseNotes, setShowReleaseNotes } = useAppState();

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

  return (
    <aside className={`relative bg-[rgba(var(--theme-sidebar-rgb),0.08)] backdrop-blur-[20px] rounded-2xl ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} flex-col shrink-0`} style={{ width: leftSidebarW, boxShadow: '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleSidebarDragStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-[var(--theme-accent)]/20 active:bg-[var(--theme-accent)]/30 transition-colors"
      />
      {/* ── A. Marka / Sunucu Header ── */}
      <div className="px-5 pt-5 pb-3.5 shrink-0 flex items-center gap-3.5 select-none group/header">
        {activeServerAvatarUrl ? (
          <img src={activeServerAvatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.1)]" style={{ border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }} draggable={false} />
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.08)]"
            style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.14), rgba(var(--theme-accent-rgb), 0.06))', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
            <span className="text-[13px] font-bold text-[var(--theme-accent)]">{activeServerShortName ?? 'MV'}</span>
          </div>
        )}
        <div className="flex flex-col leading-none min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[14px] font-bold text-[var(--theme-text)] truncate tracking-[-0.01em]">{activeServerName ?? 'MAYVOX'}</h1>
            {activeServerPublic === false && <Lock size={10} className="text-[var(--theme-secondary-text)]/35 shrink-0" />}
          </div>
          <span className="text-[8px] font-semibold tracking-[0.14em] uppercase text-[var(--theme-secondary-text)]/25 mt-1 truncate max-w-full">{activeServerMotto || 'voice & chat'}</span>
        </div>
        {onShowSettings && (canManageServer || activeServerRole === 'owner' || activeServerRole === 'admin' || activeServerRole === 'mod') && (
          <button onClick={onShowSettings} title="Sunucu Ayarları"
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/25 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 transition-all duration-150">
            <Settings size={13} />
          </button>
        )}
      </div>
      <div className="mx-5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.07), transparent)' }} />

      <div className="px-5 pt-4 pb-4 flex flex-col flex-1 min-h-0">
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

        <nav ref={channelScrollRef} className="flex-1 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
          {visibleChannels.map(channel => {
            // Capability-driven: resolver falsy iken legacy isAdmin fallback.
            const canReorderThis = (canReorderChannels || serverAdminFallback) && !channel.isSystemChannel;
            const isDragging = draggingChannelId === channel.id;
            const isDropTarget = dropTargetChannelId === channel.id && draggingChannelId && draggingChannelId !== channel.id;
            return (
            <div key={channel.id} className="space-y-1">
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
                    if (channel.isSystemChannel) return; // sistem kanalları drop hedefi değil
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
                    if (!activeServerId || dragId === channel.id || channel.isSystemChannel) return;
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 group disabled:cursor-not-allowed active:scale-[0.97] active:duration-75 ${
                  isDragging ? 'opacity-40 ' : ''
                }${
                  activeChannel === channel.id
                    ? `bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20 shadow-[inset_0_0_12px_rgba(var(--theme-accent-rgb),0.08),inset_0_1px_0_rgba(var(--theme-accent-rgb),0.1)]${isConnecting ? ' animate-pulse' : ''}`
                    : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'
                }`}
              >
                <div className="relative">
                  {(() => { const IC = roomModeIcons[channel.mode || 'social'] || Coffee; return <IC size={16} className="opacity-70" />; })()}
                  {channel.password && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[var(--theme-border)]">
                      <Lock size={8} className="text-white" />
                    </div>
                  )}
                  {!channel.password && channel.isInviteOnly && (
                    <div
                      className="absolute -top-1 -right-1 rounded-full p-0.5 border border-[var(--theme-border)]"
                      style={{ background: 'rgba(var(--theme-accent-rgb), 0.7)' }}
                      title="Özel kanal"
                    >
                      <Lock size={8} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="font-medium truncate" style={{ fontSize: channel.name.length > 14 ? '12px' : '14px' }}>{channel.name}</span>
                  {channel.deletionTimer !== undefined && !channel.userCount && (
                    <div className="flex items-center gap-1 bg-red-500/20 px-1.5 py-0.5 rounded border border-red-500/30 shrink-0">
                      <Timer size={10} className="text-red-500 animate-pulse" />
                      <span className="text-[9px] font-mono font-bold text-red-500">
                        {channel.deletionTimer}s
                      </span>
                    </div>
                  )}
                </div>
                {channel.userCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeChannel === channel.id ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]'
                  }`}>
                    {channel.userCount}
                  </span>
                )}
              </button>

              {/* Members List */}
              {channel.members && channel.members.length > 0 && (() => {
                const isBc = channel.mode === 'broadcast';
                const speakers = channel.speakerIds || [];
                const hasSpeakers = isBc && (speakers.length > 0 || !!channel.ownerId);
                const isSpeakerFn = (uid: string) => speakers.length > 0 ? speakers.includes(uid) : channel.ownerId === uid;

                const sorted = isBc
                  ? [...channel.members].sort((a, b) => (isSpeakerFn(b) ? 1 : 0) - (isSpeakerFn(a) ? 1 : 0))
                  : channel.members;

                let shownSpeakerLabel = false;
                let shownListenerLabel = false;

                return (
                <div className="pl-8 pr-2 space-y-0.5 pb-2 mt-0.5 ml-4 border-l border-[var(--theme-accent)]/10">
                  {sorted.map((memberId, idx) => {
                    const user = allUsers.find(u => u.id === memberId);
                    const isSp = isBc && user ? isSpeakerFn(user.id) : false;

                    let groupLabel: string | null = null;
                    if (hasSpeakers && user) {
                      if (isSp && !shownSpeakerLabel) { shownSpeakerLabel = true; groupLabel = 'Konuşmacılar'; }
                      if (!isSp && !shownListenerLabel) { shownListenerLabel = true; groupLabel = 'Dinleyiciler'; }
                    }

                    return (
                      <React.Fragment key={idx}>
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
                      <div className="relative h-7">
                        {/* Placeholder layer */}
                        <div className={`absolute inset-0 flex items-center gap-2 py-1 px-1.5 transition-opacity duration-150 ${user ? 'opacity-0' : 'opacity-40'}`}>
                          <div className="h-5 w-5 rounded-[6px] bg-[rgba(var(--glass-tint),0.08)] shrink-0" />
                          <div className="h-2.5 w-16 rounded bg-[rgba(var(--glass-tint),0.06)]" />
                        </div>
                        {/* Real user layer */}
                        <div
                          draggable={(canMoveMembers || serverAdminFallback) && !!user}
                          onDragStart={(e) => user && handleDragStart(e, user.name || memberId)}
                          onClick={(e) => user && onUserClick(user.id, e.clientX, e.clientY)}
                          className={`absolute inset-0 flex items-center gap-2 text-[11px] transition-all duration-150 group/member py-1 px-1.5 rounded-lg ${user ? 'cursor-pointer hover:bg-[var(--theme-accent)]/5 active:scale-[0.98]' : 'pointer-events-none'} ${user ? (
                            isBc && isSp
                              ? 'font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)]'
                              : 'font-medium text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]'
                          ) : ''} ${isBc && !isSp && user ? 'opacity-70' : ''}`}
                          style={{ opacity: user ? undefined : 0, transform: user ? 'scale(1)' : 'scale(0.98)', transition: 'opacity 150ms ease-out, transform 150ms ease-out' }}
                        >
                          {user && <>
                            <div className="relative shrink-0">
                              <div className="h-5 w-5 overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[7px]">
                                {user.avatar?.startsWith('http')
                                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  : user.avatar || '?'}
                              </div>
                              <DeviceBadge platform={user.platform} size={10} className="absolute -bottom-0.5 -right-0.5" />
                            </div>
                            <span className="truncate flex-1">{formatFullName(user.firstName, user.lastName)}</span>
                            {isBc && (isSp
                              ? <Radio size={9} className="shrink-0 text-[var(--theme-accent)]" />
                              : <Headphones size={9} className="shrink-0 text-[var(--theme-secondary-text)] opacity-40" />
                            )}
                            {userVolumes[user.id] !== undefined && userVolumes[user.id] !== 50 && (
                              <span className="text-[9px] text-[var(--theme-secondary-text)] font-bold">%{userVolumes[user.id]}</span>
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
            const userRoomCount = channels.filter(c => c.ownerId === currentUser.id).length;
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
                setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' });
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                atLimit
                  ? 'text-[var(--theme-secondary-text)]/40 cursor-not-allowed'
                  : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-accent)]'
              }`}
            >
              <Sparkles size={15} />
              <span className="text-sm font-medium">Oda Oluştur</span>
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
          <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />
        </div>
      </div>
    </aside>
  );
}
