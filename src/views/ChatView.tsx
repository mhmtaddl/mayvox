import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Sparkles,
  Volume2,
  PhoneOff,
  X,
  Lock,
  MessageSquare,
  Power,
  Headphones,
  Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import { useAppState } from '../contexts/AppStateContext';
import { useAudio } from '../contexts/AudioContext';
import { useUser } from '../contexts/UserContext';
import { useChannel } from '../contexts/ChannelContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import SettingsView from './SettingsView';
import UserProfilePopup from '../components/UserProfilePopup';
import AnnouncementsPanel from '../components/AnnouncementsPanel';
import SocialSearchHub from '../components/SocialSearchHub';
import FriendsSidebarContent from '../components/FriendsSidebarContent';
import { startInviteRingtone, stopInviteRingtone } from '../lib/sounds';
import { dismissInviteNotification } from '../lib/notifications';
import { type CardStyle, loadCardStyle, saveCardStyle } from '../components/chat/cardStyles';
import DeviceBadge from '../components/chat/DeviceBadge';
import { useConfirm } from '../contexts/ConfirmContext';
import DMPanel from '../components/DMPanel';
import { getRoomModeConfig } from '../lib/roomModeConfig';
import MobileHeader from '../components/MobileHeader';
import VoiceParticipants from '../components/VoiceParticipants';
import { NotificationBadge, NotificationBell } from '../components/notifications';
import { useNotificationCenter } from '../hooks/useNotificationCenter';

// Feature imports
import { useChatMessages } from '../features/chatview/hooks/useChatMessages';
import { useDominantSpeaker } from '../features/chatview/hooks/useDominantSpeaker';
import InvitationModal from '../features/chatview/components/InvitationModal';
import ChatViewContextMenu from '../features/chatview/components/ChatViewContextMenu';
import ChatViewUserActionMenu from '../features/chatview/components/ChatViewUserActionMenu';
import ChatViewRoomModal from '../features/chatview/components/ChatViewRoomModal';
import ChatViewPasswordModal from '../features/chatview/components/ChatViewPasswordModal';
import DesktopDock from '../features/chatview/components/DesktopDock';
import MobileFooter from '../features/chatview/components/MobileFooter';
import LeftSidebar from '../features/chatview/components/LeftSidebar';
import { roomModeIcons, FORCE_MOBILE } from '../features/chatview/constants';
import { Coffee } from 'lucide-react';

import { listMyServers, searchServers, type Server } from '../lib/serverService';

export default function ChatView() {
  const { currentUser, allUsers, getStatusColor, getEffectiveStatus, friendIds, incomingRequests } = useUser();
  const { channels, activeChannel, setActiveChannel, isConnecting, currentChannel, channelMembers } = useChannel();
  const {
    toastMsg, setToastMsg, invitationModal, setInvitationModal,
    userActionMenu, setUserActionMenu, roomModal, setRoomModal,
    passwordModal, setPasswordModal, passwordInput, setPasswordInput,
    passwordRepeatInput, setPasswordRepeatInput, passwordError, setPasswordError,
    contextMenu, setContextMenu, userVolumes,
  } = useUI();
  const { avatarBorderColor, soundInvite, soundInviteVariant } = useSettings();
  const {
    isMuted, isDeafened, handleUpdateUserVolume, handleUserActionClick,
    handleInviteUser, handleKickUser, handleMoveUser, handleSaveRoom,
    handleDeleteRoom, handleSetPassword, handleRemovePassword,
    handleJoinChannel, handleVerifyPassword, handleContextMenu, handleLogout,
    handleToggleSpeaker, isBroadcastListener, disconnectFromLiveKit,
    presenceChannelRef, view, setView, appVersion, showReleaseNotes, setShowReleaseNotes,
    passwordResetRequests, inviteRequests, inviteCooldowns, inviteStatuses,
  } = useAppState();
  const { volumeLevel, isPttPressed, speakingLevels, connectionLevel } = useAudio();

  // ── Chat messages hook ──
  const [chatMuted, setChatMuted] = useState(false);
  const {
    chatMessages, chatInput, setChatInput, editingMsgId, editingText, setEditingText,
    isAtBottom, newMsgCount, chatScrollRef, handleChatScroll, scrollToBottom,
    sendChatMessage, deleteChatMessage, clearAllMessages, startEditMessage, saveEditMessage, cancelEdit,
  } = useChatMessages({ activeChannel, channels, currentUser, chatMuted });

  // ── Dominant speaker hook ──
  const sortedChannelMembers = useMemo(
    () => [...channelMembers].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
    [channelMembers]
  );
  const dominantSpeakerId = useDominantSpeaker({
    members: sortedChannelMembers, currentUserId: currentUser.id,
    isVoiceBanned: !!currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels,
  });

  // ── Local UI state ──
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [draggedUser, setDraggedUser] = useState<string | null>(null);
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [dmTargetUserId, setDmTargetUserId] = useState<string | null>(null);
  const [dmPanelOpen, setDmPanelOpen] = useState(false);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const dmToggleRef = useRef<HTMLButtonElement>(null);

  // ── Sunucu state ──
  const [serverList, setServerList] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState('');
  useEffect(() => {
    listMyServers().then(servers => {
      setServerList(servers);
      if (servers.length > 0 && !activeServerId) setActiveServerId(servers[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activeServerData = serverList.find(s => s.id === activeServerId) ?? serverList[0] ?? null;
  const hasServer = serverList.length > 0;

  // ── Notification center ──
  const notifications = useNotificationCenter(dmUnreadCount);

  // ── Card style ──
  const [cardScale, setCardScale] = useState<number>(() => {
    const saved = localStorage.getItem('cardScale');
    return saved ? Math.max(1, Math.min(3, parseInt(saved))) : 2;
  });
  const [cardStyle, setCardStyleState] = useState<CardStyle>(loadCardStyle);
  const cycleCardStyle = () => {
    const order: CardStyle[] = ['current', 'revolt', 'linear', 'apple'];
    const next = order[(order.indexOf(cardStyle) + 1) % order.length];
    saveCardStyle(next);
    setCardStyleState(next);
  };

  // ── Shared refs (passed to child components) ──
  const listenerToastRef = useRef<number>(0);
  const dockToastHoveredRef = useRef(false);

  // ── Swipe helpers ──
  const handleSwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);
  const makeHandleTouchEnd = useCallback((action: () => void, direction: 'right' | 'left') => (e: React.TouchEvent) => {
    if (!handleSwipeRef.current) return;
    const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX;
    const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY);
    handleSwipeRef.current = null;
    if (dy > 60) return;
    if (direction === 'right' && dx > 30) action();
    if (direction === 'left' && dx < -30) action();
  }, []);

  // ── Drag-drop handlers ──
  const handleDragStart = (e: React.DragEvent, userName: string) => {
    if (!currentUser.isAdmin) { e.preventDefault(); return; }
    if (userName === currentUser.name) { e.preventDefault(); return; }
    setDraggedUser(userName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('userName', userName);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, channelId: string) => {
    e.preventDefault(); e.stopPropagation();
    const userName = e.dataTransfer.getData('userName') || draggedUser;
    if (!userName || userName === currentUser.name) { setDraggedUser(null); return; }
    handleMoveUser(userName, channelId);
    setDraggedUser(null);
  };
  const handleDropToRemove = (e: React.DragEvent) => {
    e.preventDefault();
    const userName = e.dataTransfer.getData('userName') || draggedUser;
    setDraggedUser(null);
    if (!currentUser.isAdmin || !userName) return;
    const user = allUsers.find(u => u.name === userName);
    if (!user || user.id === currentUser.id) return;
    if (!channels.some(c => c.members?.includes(userName))) return;
    handleKickUser(user.id);
  };

  // ── Effects ──
  useEffect(() => {
    if (invitationModal) { if (soundInvite) startInviteRingtone(soundInviteVariant); }
    else { stopInviteRingtone(); dismissInviteNotification(); }
    return () => { stopInviteRingtone(); };
  }, [invitationModal, soundInvite, soundInviteVariant]);

  useEffect(() => {
    if (!toastMsg) return;
    const id = setInterval(() => { if (!dockToastHoveredRef.current) setToastMsg(null); }, 3000);
    return () => clearInterval(id);
  }, [toastMsg]);

  // ── Derived data ──
  const visibleChannels = useMemo(
    () => channels.filter(c => !c.isHidden || c.ownerId === currentUser.id || currentUser.isAdmin || activeChannel === c.id),
    [channels, currentUser.id, currentUser.isAdmin, activeChannel]
  );
  const friendUsers = useMemo(() => allUsers.filter(u => friendIds.has(u.id)), [allUsers, friendIds]);

  const getIntensity = useCallback((user: typeof sortedChannelMembers[0]): number => {
    const isMe = user.id === currentUser.id;
    if (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) return Math.min(1, volumeLevel / 80);
    if (user.isSpeaking) return Math.min(1, (speakingLevels[user.name] ?? 0) * 2.5);
    return 0;
  }, [currentUser.id, currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels]);

  // ── Logout ──
  const { openConfirm } = useConfirm();
  const confirmLogout = () => {
    openConfirm({
      title: 'Çıkış yapmak istiyor musun?',
      description: 'Hesabından çıkış yapacaksın. Tekrar giriş yapman gerekecek.',
      confirmText: 'Çıkış Yap', cancelText: 'İptal', danger: true,
      onConfirm: () => { try { navigator.vibrate?.(300); } catch {} handleLogout(); },
    });
  };

  // ── Invitation modal callbacks ──
  const handleInvitationDecline = useCallback(() => {
    if (presenceChannelRef.current && invitationModal) {
      presenceChannelRef.current.send({
        type: 'broadcast', event: 'invite-rejected',
        payload: { inviterId: invitationModal.inviterId, inviteeId: currentUser.id, inviteeName: formatFullName(currentUser.firstName, currentUser.lastName) },
      });
    }
    setInvitationModal(null);
  }, [invitationModal, currentUser.id, currentUser.firstName, currentUser.lastName, presenceChannelRef, setInvitationModal]);

  const handleInvitationAccept = useCallback(() => {
    if (presenceChannelRef.current && invitationModal) {
      presenceChannelRef.current.send({
        type: 'broadcast', event: 'invite-accepted',
        payload: { inviterId: invitationModal.inviterId, inviteeId: currentUser.id },
      });
    }
    if (invitationModal) handleJoinChannel(invitationModal.roomId, true);
    setInvitationModal(null);
  }, [invitationModal, currentUser.id, presenceChannelRef, handleJoinChannel, setInvitationModal]);

  // ── Context menu callbacks ──
  const handleEditRoom = useCallback((channel: { id: string; name: string; maxUsers?: number; isInviteOnly?: boolean; isHidden?: boolean; mode?: string }) => {
    setRoomModal({ isOpen: true, type: 'edit', channelId: channel.id, name: channel.name, maxUsers: channel.maxUsers || 0, isInviteOnly: channel.isInviteOnly || false, isHidden: channel.isHidden || false, mode: channel.mode || 'social' });
  }, [setRoomModal]);

  const handleSetPasswordModal = useCallback((channelId: string) => {
    setPasswordModal({ type: 'set', channelId }); setContextMenu(null);
  }, [setPasswordModal, setContextMenu]);

  return (
    <div
      className="flex flex-col h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden"
      onDragOver={currentUser.isAdmin ? handleDragOver : undefined}
      onDrop={currentUser.isAdmin ? handleDropToRemove : undefined}
    >
      <MobileHeader
        forceMobile={FORCE_MOBILE}
        onOpenLeftDrawer={() => setMobileLeftOpen(true)}
        onOpenRightDrawer={() => setMobileRightOpen(true)}
        userName={formatFullName(currentUser.firstName, currentUser.lastName)}
        userAge={currentUser.age ?? 0}
        statusText={getEffectiveStatus()}
        statusColor={getStatusColor(getEffectiveStatus())}
        avatar={currentUser.avatar}
        avatarBorderColor={avatarBorderColor}
      />

      <div className={`flex flex-1 min-h-0 overflow-hidden relative ${FORCE_MOBILE ? '' : 'lg:p-3 lg:gap-[6px]'}`}>
        {/* ── Mobil kenar handle'ları ── */}
        {!mobileLeftOpen && !mobileRightOpen && (
          <>
            <div className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed left-0 top-1/2 -translate-y-1/2 z-30 flex items-center cursor-pointer touch-none select-none`}
              onClick={() => setMobileLeftOpen(true)} onTouchStart={onHandleTouchStart} onTouchEnd={makeHandleTouchEnd(() => setMobileLeftOpen(true), 'right')}>
              <div className="w-[6px] h-16 rounded-r-full bg-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)]/40 transition-colors flex items-center justify-center">
                <svg width="4" height="10" viewBox="0 0 4 10" fill="none" className="text-[var(--theme-accent)]/50"><path d="M0.5 1L3 5L0.5 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <div className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center cursor-pointer touch-none select-none`}
              onClick={() => setMobileRightOpen(true)} onTouchStart={onHandleTouchStart} onTouchEnd={makeHandleTouchEnd(() => setMobileRightOpen(true), 'left')}>
              <div className="w-[6px] h-16 rounded-l-full bg-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)]/40 transition-colors flex items-center justify-center">
                <svg width="4" height="10" viewBox="0 0 4 10" fill="none" className="text-[var(--theme-accent)]/50"><path d="M3.5 1L1 5L3.5 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </>
        )}

        {/* ── Mobil sol drawer ── */}
        <AnimatePresence>
          {mobileLeftOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-0 bg-black/60 z-40`} onClick={() => setMobileLeftOpen(false)} />
              <motion.aside
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-y-0 left-0 w-72 bg-[var(--theme-sidebar)] z-50 flex flex-col shadow-2xl`}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { if (!handleSwipeRef.current) return; const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX; const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY); handleSwipeRef.current = null; if (dy < 60 && dx < -40) setMobileLeftOpen(false); }}
              >
                <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
                  <div className="flex items-center gap-2 text-[var(--theme-secondary-text)] font-bold">
                    <Volume2 size={16} /><span className="uppercase text-xs tracking-widest">Ses Kanalları</span>
                  </div>
                  <button onClick={() => setMobileLeftOpen(false)} className="p-1.5 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)] transition-colors"><X size={18} /></button>
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
                  {visibleChannels.map(channel => (
                    <div key={channel.id} className="space-y-1">
                      <button onClick={() => { handleJoinChannel(channel.id); setMobileLeftOpen(false); }} disabled={isConnecting}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group disabled:cursor-not-allowed ${activeChannel === channel.id ? `bg-[var(--theme-accent)] text-[var(--theme-badge-text)] shadow-lg shadow-black/20${isConnecting ? ' animate-pulse' : ''}` : 'text-[var(--theme-secondary-text)] hover:bg-[var(--theme-bg)]/50'}`}>
                        {(() => { const IC = roomModeIcons[channel.mode || 'social'] || Coffee; return <IC size={15} className="shrink-0 opacity-70" />; })()}
                        <span className="font-semibold truncate min-w-0" style={{ fontSize: channel.name.length > 14 ? '12px' : '14px' }}>{channel.name}</span>
                        {channel.password && <Lock size={12} className="shrink-0 ml-auto opacity-50" />}
                        {(channel.userCount ?? 0) > 0 && <span className={`text-[10px] font-bold ml-auto shrink-0 ${activeChannel === channel.id ? 'text-white/60' : 'text-[var(--theme-secondary-text)]/50'}`}>{channel.userCount}</span>}
                      </button>
                      {(() => {
                        const isBc = channel.mode === 'broadcast'; const speakers = channel.speakerIds || [];
                        const hasSpeakers = isBc && (speakers.length > 0 || !!channel.ownerId);
                        const isSpeakerFn = (uid: string) => speakers.length > 0 ? speakers.includes(uid) : channel.ownerId === uid;
                        let memberUsers = (channel.members ?? []).map(id => allUsers.find(u => u.id === id)).filter(Boolean) as typeof allUsers;
                        if (!memberUsers.length) return null;
                        if (isBc) memberUsers = [...memberUsers].sort((a, b) => (isSpeakerFn(b.id) ? 1 : 0) - (isSpeakerFn(a.id) ? 1 : 0));
                        let shownSpLabel = false, shownLsLabel = false;
                        return (
                          <div className="pl-9 space-y-0.5 pb-2">
                            {memberUsers.map(user => {
                              const isSp = isBc && isSpeakerFn(user.id);
                              let groupLabel: string | null = null;
                              if (hasSpeakers) { if (isSp && !shownSpLabel) { shownSpLabel = true; groupLabel = 'Konuşmacılar'; } if (!isSp && !shownLsLabel) { shownLsLabel = true; groupLabel = 'Dinleyiciler'; } }
                              return (
                              <React.Fragment key={user.id}>
                                {groupLabel && (<>{groupLabel === 'Dinleyiciler' && <div className="mx-1 my-1.5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />}<div className="flex items-center gap-1.5 pt-1 pb-0.5 px-1">{groupLabel === 'Konuşmacılar' ? <Radio size={8} className="text-[var(--theme-accent)] opacity-50" /> : <Headphones size={8} className="text-[var(--theme-secondary-text)] opacity-30" />}<span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]/50">{groupLabel}</span></div></>)}
                                <div onClick={(e) => { e.stopPropagation(); if (user.id !== currentUser.id) setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                                  className={`flex items-center gap-2 py-1 rounded-lg transition-all cursor-pointer hover:bg-[var(--theme-bg)]/40 px-1 ${isBc && !isSp ? 'opacity-70' : ''}`}>
                                  <div className="relative shrink-0"><div className="h-6 w-6 overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[8px]">{user.avatar?.startsWith('http') ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.avatar}</div><DeviceBadge platform={user.platform} size={11} className="absolute -bottom-0.5 -right-0.5" /></div>
                                  <span className={`text-[11px] truncate flex-1 ${isBc && isSp ? 'font-semibold text-[var(--theme-text)]' : 'font-medium text-[var(--theme-secondary-text)]'}`}>{formatFullName(user.firstName, user.lastName)} ({user.age})</span>
                                  {isBc && (isSp ? <Radio size={9} className="shrink-0 text-[var(--theme-accent)]" /> : <Headphones size={9} className="shrink-0 text-[var(--theme-secondary-text)] opacity-40" />)}
                                </div>
                              </React.Fragment>);
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </nav>
                <div className="p-4 border-t border-[var(--theme-border)]">
                  <button onClick={(e) => { e.stopPropagation(); const userRooms = channels.filter(c => c.ownerId === currentUser.id); if (userRooms.length >= 2) { setToastMsg('Aynı anda en fazla 2 oda oluşturabilirsiniz.'); return; } setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' }); setMobileLeftOpen(false); }}
                    className={`w-full flex items-center justify-center gap-2 text-white transition-all py-3 rounded-xl font-bold text-sm shadow-lg shadow-black/10 ${channels.filter(c => c.ownerId === currentUser.id).length >= 2 ? 'bg-gray-500 cursor-not-allowed opacity-50' : 'bg-[var(--theme-accent)] hover:opacity-90'}`}>
                    <Sparkles size={15} />Oda Oluştur
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Mobil sağ drawer ── */}
        <AnimatePresence>
          {mobileRightOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-0 bg-black/60 z-40`} onClick={() => setMobileRightOpen(false)} />
              <motion.aside
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-y-0 right-0 w-72 bg-[var(--theme-sidebar)] z-50 flex flex-col shadow-2xl`}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { if (!handleSwipeRef.current) return; const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX; const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY); handleSwipeRef.current = null; if (dy < 60 && dx > 40) setMobileRightOpen(false); }}
              >
                <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text)]">Arkadaşlar</h3>
                    <span className="text-[10px] bg-[var(--theme-bg)] px-2 py-0.5 rounded-full text-[var(--theme-text)] font-bold">{friendUsers.length}</span>
                    {incomingRequests.length > 0 && <span className="text-[9px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-bold animate-pulse">{incomingRequests.length}</span>}
                  </div>
                  <button onClick={() => setMobileRightOpen(false)} className="p-1.5 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)] transition-colors"><X size={18} /></button>
                </div>
                <FriendsSidebarContent variant="mobile" onUserClick={(userId, x, y) => setProfilePopup({ userId, x, y })} onDM={(userId) => { setDmTargetUserId(userId); setDmPanelOpen(true); setMobileRightOpen(false); }} isMuted={isMuted} isDeafened={isDeafened} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Left Sidebar (masaüstü) ── */}
        <LeftSidebar handleDragOver={handleDragOver} handleDrop={handleDrop} handleDragStart={handleDragStart} onUserClick={(userId, x, y) => setProfilePopup({ userId, x, y })}
          activeServerName={activeServerData?.name} activeServerShortName={activeServerData?.shortName} activeServerAvatarUrl={activeServerData?.avatarUrl} />

        {/* ── Popover / Modal layers ── */}
        <AnimatePresence>
          {userActionMenu && (
            <ChatViewUserActionMenu menu={userActionMenu} currentUserId={currentUser.id} userVolumes={userVolumes}
              onUpdateVolume={handleUpdateUserVolume} activeChannel={activeChannel} channels={channels}
              onToggleSpeaker={handleToggleSpeaker} inviteStatuses={inviteStatuses} inviteCooldowns={inviteCooldowns}
              onInvite={handleInviteUser} onClose={() => setUserActionMenu(null)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {invitationModal && <InvitationModal data={invitationModal} onAccept={handleInvitationAccept} onDecline={handleInvitationDecline} />}
        </AnimatePresence>
        <AnimatePresence>
          {contextMenu && (
            <ChatViewContextMenu contextMenu={contextMenu} channels={channels} onEditRoom={handleEditRoom}
              onSetPassword={handleSetPasswordModal} onRemovePassword={handleRemovePassword}
              onDeleteRoom={handleDeleteRoom} onClose={() => setContextMenu(null)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {roomModal.isOpen && (
            <ChatViewRoomModal roomModal={roomModal} onUpdate={(updates) => setRoomModal(prev => ({ ...prev, ...updates }))}
              onClose={() => setRoomModal(prev => ({ ...prev, isOpen: false }))} onSave={handleSaveRoom} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {passwordModal && (
            <ChatViewPasswordModal passwordModal={passwordModal} passwordInput={passwordInput} setPasswordInput={setPasswordInput}
              passwordRepeatInput={passwordRepeatInput} setPasswordRepeatInput={setPasswordRepeatInput}
              passwordError={passwordError} setPasswordError={setPasswordError}
              onSetPassword={handleSetPassword} onVerifyPassword={handleVerifyPassword} onClose={() => setPasswordModal(null)} />
          )}
        </AnimatePresence>

        {/* ── Main Content ── */}
        <main className={`flex-1 flex flex-col min-h-0 bg-[rgba(var(--theme-sidebar-rgb),0.04)] relative ${FORCE_MOBILE ? '' : 'lg:rounded-2xl lg:backdrop-blur-[12px]'}`} style={{ boxShadow: FORCE_MOBILE ? undefined : '0 4px 24px rgba(0,0,0,0.1), inset 0 1px 0 rgba(var(--glass-tint), 0.02)', border: FORCE_MOBILE ? undefined : '1px solid rgba(var(--glass-tint), 0.03)', backgroundImage: 'radial-gradient(ellipse 50% 35% at 50% 25%, rgba(var(--theme-glow-rgb), 0.025) 0%, rgba(var(--theme-glow-rgb), 0.01) 40%, transparent 65%)' }}>
          <div
            className={`flex-1 flex flex-col min-h-0 ${FORCE_MOBILE ? 'overflow-y-auto custom-scrollbar p-3' : `lg:mb-[72px] ${activeChannel && view !== 'settings' ? 'px-3 pt-3 sm:px-6 sm:pt-4' : 'overflow-y-auto custom-scrollbar p-3 sm:p-8'}`}`}>
          {view === 'settings' ? <SettingsView /> : activeChannel ? (
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4) 0%, transparent 65%)` }} />
                <div className="absolute bottom-[10%] right-[15%] w-[300px] h-[300px] rounded-full opacity-[0.012]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.3) 0%, transparent 70%)` }} />
              </div>
              {/* Oda başlığı — sadece mobilde */}
              <div className={`relative z-[1] flex items-center justify-between mb-3 sm:mb-6 ${FORCE_MOBILE ? '' : 'lg:hidden'}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  {(() => { const activeCh = channels.find(c => c.id === activeChannel); const mc = getRoomModeConfig(activeCh?.mode); const ModeIcon = roomModeIcons[mc.id] || Volume2; return (<><div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center text-[var(--theme-accent)] border border-[var(--theme-accent)]/20 shrink-0"><ModeIcon size={18} className="sm:w-5 sm:h-5" /></div><div><h2 className="text-base sm:text-xl font-bold tracking-tight text-[var(--theme-text)] leading-none">{activeCh?.name || 'Sohbet Odası'}</h2><p className="text-[9px] font-semibold text-[var(--theme-secondary-text)] opacity-50 mt-0.5">{mc.shortHelper}</p></div></>); })()}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { const next = (cardScale % 3) + 1; setCardScale(next); localStorage.setItem('cardScale', String(next)); }}
                    className="p-2 rounded-lg border border-[var(--theme-border)]/40 hover:bg-[var(--theme-accent)]/8 transition-all group/density" title={cardScale === 1 ? 'Kompakt' : cardScale === 2 ? 'Dengeli' : 'Geniş'}>
                    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className="text-[var(--theme-secondary-text)] group-hover/density:text-[var(--theme-accent)] transition-colors">
                      {cardScale === 1 ? (<><rect x="0" y="0" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.7" /><rect x="0" y="5.25" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.5" /><rect x="0" y="10.5" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.3" /></>) : cardScale === 2 ? (<><rect x="0" y="0.5" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.7" /><rect x="0" y="8" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.45" /></>) : (<rect x="0" y="0" width="16" height="14" rx="2" fill="currentColor" opacity="0.6" />)}
                    </svg>
                  </button>
                  <button onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all" title="Odadan Ayrıl"><PhoneOff size={18} /></button>
                </div>
              </div>
              <div className="relative z-[1] flex-1">
                <VoiceParticipants forceMobile={FORCE_MOBILE} members={sortedChannelMembers} currentUser={currentUser}
                  isPttPressed={isPttPressed} isMuted={isMuted} isDeafened={isDeafened} isVoiceBanned={!!currentUser.isVoiceBanned}
                  volumeLevel={volumeLevel} speakingLevels={speakingLevels} dominantSpeakerId={dominantSpeakerId}
                  currentChannel={currentChannel} getIntensity={getIntensity} getEffectiveStatus={getEffectiveStatus}
                  cardScale={cardScale} cardStyle={cardStyle} onProfileClick={(userId, x, y) => setProfilePopup({ userId, x, y })}
                  onKickUser={handleKickUser} isAdmin={currentUser.isAdmin || false} isModerator={currentUser.isModerator || false}
                  activeChannel={activeChannel} channels={channels} chatMessages={chatMessages} chatMuted={chatMuted}
                  onToggleChatMuted={() => setChatMuted(!chatMuted)} editingMsgId={editingMsgId} editingText={editingText}
                  onEditingTextChange={setEditingText} onStartEdit={startEditMessage} onSaveEdit={saveEditMessage} onCancelEdit={cancelEdit}
                  onDeleteMessage={deleteChatMessage} onClearAll={clearAllMessages} onSendMessage={sendChatMessage}
                  chatInput={chatInput} onChatInputChange={setChatInput} chatScrollRef={chatScrollRef} onChatScroll={handleChatScroll}
                  isAtBottom={isAtBottom} newMsgCount={newMsgCount} onScrollToBottom={scrollToBottom} />
              </div>
            </div>
          ) : !hasServer ? (
            /* ── Sunucusuz kullanıcı — onboarding empty state ── */
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              <div className="relative mb-8">
                <div className="absolute inset-[-16px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.5), transparent 70%)' }} />
                <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--theme-accent-rgb), 0.1)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-accent)] opacity-70">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-[17px] font-bold text-[var(--theme-text)] mb-2 tracking-tight">Bir sohbet sunucusuna katıl</h2>
              <p className="text-[12px] text-[var(--theme-secondary-text)]/50 max-w-[280px] leading-relaxed text-center mb-8">
                Davet kodu ile bir sunucuya katılabilir ya da kendi sohbet sunucunu oluşturabilirsin.
              </p>
              <div className="flex items-center gap-3">
                <button className="h-10 px-5 rounded-xl text-[12px] font-semibold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)', boxShadow: '0 2px 12px rgba(var(--theme-accent-rgb), 0.25)' }}>
                  Sunucuya Katıl
                </button>
                <button className="h-10 px-5 rounded-xl text-[12px] font-semibold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 text-[var(--theme-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}>
                  Sunucu Oluştur
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="text-center pt-10 pb-2 px-6">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-[-8px] bg-[var(--theme-accent)] rounded-full blur-xl opacity-[0.06]" />
                  <div className="relative w-16 h-16 rounded-2xl bg-[rgba(var(--theme-sidebar-rgb),0.5)] backdrop-blur-xl border border-[rgba(var(--glass-tint),0.06)] flex items-center justify-center shadow-[inset_0_1px_0_0_rgba(var(--glass-tint),0.04)]">
                    <Volume2 size={28} className="text-[var(--theme-accent)] opacity-70" />
                  </div>
                </div>
                <h2 className="text-lg font-bold tracking-wide text-[var(--theme-text)] mb-2">Henüz Bir Odada Değilsiniz</h2>
                <p className="text-xs text-[var(--theme-secondary-text)]/55 max-w-[260px] leading-relaxed mx-auto">Sohbete başlamak için sol taraftaki kanallardan birine katılın.</p>
              </div>
              <AnnouncementsPanel currentUser={currentUser} />
            </div>
          )}
          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <aside className={`w-56 bg-[rgba(var(--theme-sidebar-rgb),0.08)] backdrop-blur-[20px] rounded-2xl flex-col ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'}`} style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}>
          <div className="pt-3 pb-1"><SocialSearchHub currentUserId={currentUser.id} variant="sidebar" /></div>
          <div className="px-4 pt-2 pb-2 flex items-center justify-between relative">
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]">Arkadaşlar</h3>
              <span className="text-[10px] bg-[var(--theme-accent)]/8 text-[var(--theme-accent)] px-2.5 py-0.5 rounded-full font-bold">{friendUsers.length}</span>
            </div>
            {incomingRequests.length > 0 && <span className="text-[9px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-bold animate-pulse">{incomingRequests.length}</span>}
          </div>
          <FriendsSidebarContent variant="desktop" onUserClick={(userId, x, y) => setProfilePopup({ userId, x, y })}
            onDM={(userId) => { setDmTargetUserId(userId); setDmPanelOpen(true); }} channels={channels} activeChannel={activeChannel}
            inviteStatuses={inviteStatuses} inviteCooldowns={inviteCooldowns} handleInviteUser={handleInviteUser} isMuted={isMuted} isDeafened={isDeafened} />
          <div className="shrink-0 px-2 py-2.5 flex items-center justify-evenly">
            <button ref={dmToggleRef} onClick={() => setDmPanelOpen(prev => !prev)}
              className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 ${dmPanelOpen ? 'text-[var(--theme-accent)] bg-[var(--theme-accent)]/8' : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`} title="Mesajlar">
              <MessageSquare size={16} />
              {dmUnreadCount > 0 && !dmPanelOpen && <NotificationBadge count={dmUnreadCount} variant="accent" className="absolute -top-0.5 -right-0.5" />}
            </button>
            <button onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
              className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 group/settings ${view === 'settings' ? 'text-[var(--theme-accent)] bg-[var(--theme-accent)]/8' : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`} title="Ayarlar">
              <Settings size={16} className={`transition-transform duration-500 ${view === 'settings' ? 'rotate-180' : 'group-hover/settings:rotate-180'}`} />
              {notifications.settingsCount > 0 && <NotificationBadge count={notifications.settingsCount} variant="amber" className="absolute -top-0.5 -right-0.5" />}
            </button>
            <NotificationBell
              summary={notifications}
              onOpenFriendRequests={() => {/* Arkadaşlar sidebar'ı zaten görünür */}}
              onOpenDM={() => setDmPanelOpen(true)}
            />
            <button onClick={confirmLogout} className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 text-red-400/70 hover:text-red-400 hover:bg-red-500/8" title="Çıkış"><Power size={16} /></button>
          </div>
        </aside>
      </div>

      {/* ── Desktop Dock — context-consuming, minimal props ── */}
      <DesktopDock dockToastHoveredRef={dockToastHoveredRef} listenerToastRef={listenerToastRef} cardStyle={cardStyle} cycleCardStyle={cycleCardStyle}
        serverList={serverList} activeServerId={activeServerId} onSelectServer={setActiveServerId} />

      {/* ── Profile Popup ── */}
      <AnimatePresence>
        {profilePopup && (() => {
          const popupUser = allUsers.find(u => u.id === profilePopup.userId);
          if (!popupUser) return null;
          const isMe = popupUser.id === currentUser.id;
          const activeMembers = activeChannel ? channels.find(c => c.id === activeChannel)?.members : undefined;
          const alreadyInChannel = activeMembers?.includes(popupUser.id) || activeMembers?.includes(popupUser.name);
          const canInvite = !isMe && !!activeChannel && !alreadyInChannel && popupUser.status === 'online';
          return (
            <UserProfilePopup user={popupUser} position={profilePopup} onClose={() => setProfilePopup(null)}
              onInvite={() => { handleInviteUser(popupUser.id); setProfilePopup(null); }}
              onDM={(userId) => { setDmTargetUserId(userId); setDmPanelOpen(true); setProfilePopup(null); }}
              canInvite={!!canInvite} inviteStatus={inviteStatuses[popupUser.id]}
              onCooldown={!!(inviteCooldowns[popupUser.id] && Date.now() < inviteCooldowns[popupUser.id])}
              cooldownRemaining={inviteCooldowns[popupUser.id] ? Math.ceil((inviteCooldowns[popupUser.id] - Date.now()) / 1000) : 0}
              isMe={isMe} currentAppVersion={appVersion} />
          );
        })()}
      </AnimatePresence>

      {/* ── Mobile Footer — context-consuming, minimal props ── */}
      <MobileFooter listenerToastRef={listenerToastRef} onOpenBell={() => setMobileRightOpen(true)} />

      {/* ── DM Panel ── */}
      <DMPanel isOpen={dmPanelOpen} onClose={() => setDmPanelOpen(false)} openUserId={dmTargetUserId}
        onOpenHandled={() => setDmTargetUserId(null)} onUnreadChange={setDmUnreadCount} toggleRef={dmToggleRef} />
    </div>
  );
}
