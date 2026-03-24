import React, { useState, useMemo, useEffect, useRef } from 'react';
import appLogo from '../assets/app-logo.png';
import {
  Mic,
  Settings,
  Trash2,
  LogOut,
  Headphones,
  PlusCircle,
  Check,
  Volume2,
  Volume1,
  PhoneCall,
  PhoneOff,
  Clock,
  X,
  Lock,
  Shield,
  ShieldOff,
  Users,
  Timer,
  ShieldCheck,
  Recycle,
  KeyRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppState } from '../contexts/AppStateContext';
import { useAudio } from '../contexts/AudioContext';
import { useUser } from '../contexts/UserContext';
import { useChannel } from '../contexts/ChannelContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import SettingsView from './SettingsView';
import UserProfilePopup from '../components/UserProfilePopup';
import ReleaseNotesPopover from '../components/ReleaseNotesModal';
import { getReleaseNotes } from '../lib/releaseNotes';
import InviteRequestPanel from '../components/InviteRequestPanel';
import { startInviteRingtone, stopInviteRingtone } from '../lib/sounds';
import { Mail } from 'lucide-react';

export default function ChatView() {
  const {
    currentUser,
    allUsers,
    getStatusColor,
    getEffectiveStatus,
  } = useUser();

  const {
    channels,
    activeChannel,
    setActiveChannel,
    isConnecting,
    currentChannel,
    channelMembers,
  } = useChannel();

  const {
    toastMsg,
    setToastMsg,
    invitationModal,
    setInvitationModal,
    userActionMenu,
    setUserActionMenu,
    roomModal,
    setRoomModal,
    passwordModal,
    setPasswordModal,
    passwordInput,
    setPasswordInput,
    passwordRepeatInput,
    setPasswordRepeatInput,
    passwordError,
    setPasswordError,
    contextMenu,
    setContextMenu,
    isStatusMenuOpen,
    setIsStatusMenuOpen,
    statusTimerInput,
    setStatusTimerInput,
    userVolumes,
  } = useUI();

  const {
    pttKey,
    isListeningForKey,
    setIsListeningForKey,
    isNoiseSuppressionEnabled,
    setIsNoiseSuppressionEnabled,
    noiseThreshold,
    setNoiseThreshold,
    avatarBorderColor,
    soundInvite,
    soundInviteVariant,
    adminBorderEffect,
  } = useSettings();

  const {
    isMuted,
    setIsMuted,
    isDeafened,
    setIsDeafened,
    statusTimer,
    handleSetStatus,
    handleUpdateUserVolume,
    handleUserActionClick,
    handleInviteUser,
    handleKickUser,
    handleMoveUser,
    handleSaveRoom,
    handleDeleteRoom,
    handleSetPassword,
    handleRemovePassword,
    handleJoinChannel,
    handleVerifyPassword,
    handleContextMenu,
    handleLogout,
    disconnectFromLiveKit,
    presenceChannelRef,
    view,
    setView,
    appVersion,
    updateInfo,
    onUpdateDownload,
    onUpdateInstall,
    onUpdateDismiss,
    showReleaseNotes,
    setShowReleaseNotes,
    passwordResetRequests,
    handleApproveReset,
    handleDismissReset,
    inviteRequests,
    handleSendInviteCode,
    handleRejectInvite,
    inviteCooldowns,
    inviteStatuses,
  } = useAppState();

  const {
    volumeLevel,
    isPttPressed,
    connectionLevel,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    inputDevices,
    outputDevices,
    showInputSettings,
    setShowInputSettings,
    showOutputSettings,
    setShowOutputSettings,
  } = useAudio();

  // Local state: draggedUser is only used inside ChatView
  const [draggedUser, setDraggedUser] = useState<string | null>(null);

  // Profile popup
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);

  // Davet gelince çağrı sesi: modal açılınca başlar, kapanınca durur
  // soundInvite kapalıysa hiç çalmaz; variant ayarı ile uygun ses seçilir
  useEffect(() => {
    if (invitationModal) {
      if (soundInvite) startInviteRingtone(soundInviteVariant);
    } else {
      stopInviteRingtone();
    }
    return () => { stopInviteRingtone(); };
  }, [invitationModal, soundInvite, soundInviteVariant]);

  // Şifre sıfırlama bildirim baloncuğu
  const [showResetPanel, setShowResetPanel] = useState(false);
  const resetPanelRef = useRef<HTMLDivElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Davet talebi bildirim baloncuğu
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  // Yeni istek gelince baloncuğu aç ve 15sn timer başlat
  useEffect(() => {
    if (passwordResetRequests.length === 0) { setShowResetPanel(false); return; }
    setShowResetPanel(true);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setShowResetPanel(false), 15000);
    return () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); };
  }, [passwordResetRequests.length]);

  // Yeni davet talebi gelince baloncuğu aç
  useEffect(() => {
    if (inviteRequests.length === 0) { setShowInvitePanel(false); return; }
    setShowInvitePanel(true);
  }, [inviteRequests.length]);

  // Dışarı tıklayınca kapat (her iki panel de resetPanelRef içinde)
  useEffect(() => {
    if (!showResetPanel && !showInvitePanel) return;
    const handler = (e: MouseEvent) => {
      if (resetPanelRef.current && !resetPanelRef.current.contains(e.target as Node)) {
        setShowResetPanel(false);
        setShowInvitePanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showResetPanel, showInvitePanel]);

  // Admin mute geri sayımı
  const isAdminMuted = currentUser.isMuted === true;
  const [muteRemaining, setMuteRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!isAdminMuted || !currentUser.muteExpires) {
      setMuteRemaining(null);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((currentUser.muteExpires! - Date.now()) / 1000));
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setMuteRemaining(m > 0 ? `${m}d ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAdminMuted, currentUser.muteExpires]);

  // Memoized derived lists — allUsers.filter() 60fps çalışmasın
  const visibleChannels = useMemo(
    () => channels.filter(c => !c.isHidden || c.ownerId === currentUser.id || currentUser.isAdmin || activeChannel === c.id),
    [channels, currentUser.id, currentUser.isAdmin, activeChannel]
  );
  const onlineUsers = useMemo(
    () => allUsers.filter(u => u.status === 'online' || (u.status === 'away' && u.statusText === 'Telefondayım')),
    [allUsers]
  );
  const offlineUsers = useMemo(
    () => allUsers.filter(u => u.status === 'offline'),
    [allUsers]
  );
  const sortedChannelMembers = useMemo(
    () => [...channelMembers].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)),
    [channelMembers]
  );

  const handleDragStart = (e: React.DragEvent, userName: string) => {
    if (!currentUser.isAdmin) {
      e.preventDefault();
      return;
    }
    setDraggedUser(userName);
    e.dataTransfer.setData('userName', userName);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, channelId: string) => {
    e.preventDefault();
    const userName = e.dataTransfer.getData('userName') || draggedUser;
    if (userName) {
      handleMoveUser(userName, channelId);
    }
    setDraggedUser(null);
  };

  // renderConnectionQuality (inline copy)
  const renderConnectionQuality = () => {
    const getColor = (level: number) => {
      if (level >= 4) return 'bg-emerald-500';
      if (level === 3) return 'bg-yellow-500';
      if (level === 2) return 'bg-orange-500';
      if (level === 1) return 'bg-red-500';
      return 'text-red-500';
    };

    const statusLabel = activeChannel
      ? isConnecting
        ? { text: 'Bağlanıyor', color: 'text-yellow-400' }
        : connectionLevel === 0
          ? { text: 'Bağlantı Yok', color: 'text-red-400' }
          : connectionLevel === 1
            ? { text: 'Zayıf', color: 'text-red-400' }
            : null
      : null;

    if (connectionLevel === 0 && !isConnecting) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <X size={14} className="text-red-500" />
          {statusLabel && (
            <span className={`text-[8px] font-bold animate-pulse ${statusLabel.color}`}>{statusLabel.text}</span>
          )}
        </div>
      );
    }

    return (
      <motion.div
        animate={connectionLevel <= 2 ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
        className="flex flex-col items-center gap-0.5"
      >
        <div className="flex items-end gap-0.5 h-3">
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              animate={connectionLevel <= 1 ? { height: [`${i * 25}%`, `${i * 15}%`, `${i * 25}%`] } : {}}
              transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              className={`w-1 rounded-full transition-all ${i <= connectionLevel ? getColor(connectionLevel) : 'bg-[var(--theme-border)]'}`}
              style={{ height: `${i * 25}%` }}
            />
          ))}
        </div>
        {statusLabel && (
          <span className={`text-[8px] font-bold animate-pulse leading-none ${statusLabel.color}`}>{statusLabel.text}</span>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      {/* Header */}
      <header className="flex flex-col bg-[var(--theme-bg)] z-10 shrink-0">
        <div className="flex items-center justify-between pl-6 pr-4 lg:pr-0 h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 overflow-hidden rounded-[20%] shrink-0">
              <img src={appLogo} alt="CylkSohbet" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">CAYLAKLAR İLE SOHBET</h1>
          </div>

          <div className="flex items-center h-full">
          <div className="h-full flex items-center lg:w-64 lg:px-4 gap-3 group relative cursor-pointer hover:bg-[var(--theme-sidebar)]/50 transition-colors" onClick={(e) => { e.stopPropagation(); setIsStatusMenuOpen(!isStatusMenuOpen); }}>
            <div className="text-right hidden sm:flex flex-col items-end flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate w-full">{currentUser.firstName} {currentUser.lastName} ({currentUser.age})</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${getStatusColor(getEffectiveStatus())}`}>{getEffectiveStatus()}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-500/20 border-2 overflow-hidden relative flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ borderColor: avatarBorderColor }}>
              {currentUser.avatar?.startsWith('http')
                ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : currentUser.avatar}
            </div>

            {/* Status Menu */}
            <AnimatePresence>
              {isStatusMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-64 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-2 z-[100] backdrop-blur-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleSetStatus('Aktif')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Aktif
                  </button>
                  <button
                    onClick={() => handleSetStatus('Telefonda')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Telefonda
                  </button>
                  <button
                    onClick={() => handleSetStatus('Hemen Geleceğim')}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                  >
                    Hemen Geleceğim
                  </button>
                  <div className="border-t border-[var(--theme-border)] my-1"></div>
                  <div className="px-3 py-2">
                    <label className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest block mb-2">Süre Sonra Geleceğim (Dk)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="99"
                        className="flex-1 bg-[var(--theme-sidebar)] border border-[var(--theme-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all"
                        value={statusTimerInput}
                        onChange={(e) => setStatusTimerInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && statusTimerInput) {
                            handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput));
                            setStatusTimerInput('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (statusTimerInput) {
                            handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput));
                            setStatusTimerInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-[var(--theme-accent)] text-white text-[10px] font-bold rounded-lg hover:opacity-90 transition-all"
                      >
                        Kur
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>

        {/* Güncelleme bildirimi — header alt bandı */}
        <AnimatePresence>
          {updateInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {updateInfo.state === 'available' && (
                <div className="flex items-center justify-between px-6 py-2 bg-blue-600/20 border-t border-blue-500/30 text-sm">
                  <span className="text-blue-300 font-medium">
                    Yeni sürüm: <span className="font-bold text-white">v{updateInfo.version}</span>
                    {updateInfo.sizeMB && <span className="text-blue-400 ml-1">({updateInfo.sizeMB} MB)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={onUpdateDownload} className="px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold transition-colors">
                      İndir
                    </button>
                    <button onClick={onUpdateDismiss} className="px-2 py-1 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-red-300 text-xs font-bold transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {updateInfo.state === 'downloading' && (
                <div className="flex items-center gap-3 px-6 py-2 bg-amber-600/20 border-t border-amber-500/30">
                  <span className="text-amber-300 text-xs font-medium shrink-0">v{updateInfo.version} indiriliyor…</span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${updateInfo.progress}%` }} />
                  </div>
                  <span className="text-amber-300 text-xs font-bold shrink-0">%{updateInfo.progress}</span>
                </div>
              )}
              {updateInfo.state === 'downloaded' && (
                <div className="flex items-center justify-between px-6 py-2 bg-emerald-600/20 border-t border-emerald-500/30 text-sm">
                  <span className="text-emerald-300 font-medium">v{updateInfo.version} indirildi ve hazır</span>
                  <button onClick={onUpdateInstall} className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-colors">
                    Yükle ve Yeniden Başlat
                  </button>
                </div>
              )}
              {updateInfo.state === 'dismissed' && (
                <div className="flex items-center justify-between px-6 py-2 bg-red-600/10 border-t border-red-500/20 text-xs">
                  <span className="text-red-400">Yeni versiyonu indirmediğiniz için uygulamayı kullanırken hatalarla karşılaşabilirsiniz.</span>
                  <button onClick={onUpdateDismiss} className="ml-3 text-red-400 hover:text-red-300 font-bold transition-colors shrink-0">✕</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-72 bg-[var(--theme-sidebar)]/30 flex flex-col">
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 text-[var(--theme-secondary-text)] font-bold mb-6">
              <Volume2 size={16} />
              <span className="uppercase text-xs tracking-widest">Ses Kanalları</span>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
              {visibleChannels.map(channel => (
                <div key={channel.id} className="space-y-1">
                  <button
                    onClick={() => handleJoinChannel(channel.id)}
                    onContextMenu={(e) => handleContextMenu(e, channel.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, channel.id)}
                    disabled={isConnecting}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group disabled:cursor-not-allowed ${
                      activeChannel === channel.id
                        ? `bg-[var(--theme-accent)] text-white shadow-lg shadow-black/20${isConnecting ? ' animate-pulse' : ''}`
                        : 'text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)]'
                    }`}
                  >
                    <div className="relative">
                      <Volume2 size={18} />
                      {channel.password && (
                        <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 border border-[var(--theme-border)]">
                          <Lock size={8} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{channel.name}</span>
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
                        activeChannel === channel.id ? 'bg-white/20 text-white' : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]'
                      }`}>
                        {channel.userCount}
                      </span>
                    )}
                  </button>

                  {/* Members List */}
                  {channel.members && channel.members.length > 0 && (
                    <div className="pl-10 space-y-1 pb-2">
                      {channel.members.map((member, idx) => {
                        const user = allUsers.find(u => u.name === member);
                        const memberDisplayName = user ? `${user.firstName} ${user.lastName} (${user.age})` : member;
                        return (
                          <div
                            key={idx}
                            draggable={currentUser.isAdmin}
                            onDragStart={(e) => handleDragStart(e, member)}
                            onClick={(e) => user && handleUserActionClick(e, user.id)}
                            className="flex items-center gap-2 text-[11px] font-medium transition-all group/member cursor-pointer hover:text-[var(--theme-accent)]"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)]"></div>
                            <span className="truncate flex-1">{memberDisplayName}</span>
                            {user && userVolumes[user.id] !== undefined && userVolumes[user.id] !== 50 && (
                              <span className="text-[9px] text-[var(--theme-secondary-text)] font-bold">%{userVolumes[user.id]}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            <div className="mt-auto pt-6">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const userRooms = channels.filter(c => c.ownerId === currentUser.id);
                  if (userRooms.length >= 2) {
                    setToastMsg('Aynı anda en fazla 2 oda oluşturabilirsiniz.');
                    return;
                  }
                  setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false });
                }}
                className={`w-full flex items-center justify-center gap-2 text-white transition-all py-3 rounded-xl font-bold text-sm shadow-lg shadow-black/10 ${
                  channels.filter(c => c.ownerId === currentUser.id).length >= 2
                    ? 'bg-gray-500 cursor-not-allowed opacity-50'
                    : 'bg-[var(--theme-accent)] hover:opacity-90'
                }`}
              >
                <PlusCircle size={18} />
                Oda Oluştur
              </button>
            </div>
          </div>
        </aside>

        {/* User Action Menu Popover */}
        <AnimatePresence>
          {userActionMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                position: 'fixed',
                top: Math.min(window.innerHeight - 120, userActionMenu.y),
                left: userActionMenu.x + 10,
                zIndex: 100
              }}
              className="bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-2 w-48 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {userActionMenu.userId !== currentUser.id && (
                <div className={`flex flex-col gap-2 p-2 ${activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(allUsers.find(u => u.id === userActionMenu.userId)?.name || '') && userActionMenu.userId !== currentUser.id ? 'border-b border-[var(--theme-border)]' : ''}`}>
                  <span className="text-[10px] uppercase font-bold text-[var(--theme-secondary-text)]">Ses Ayarı</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="99"
                      value={userVolumes[userActionMenu.userId] ?? 50}
                      onChange={(e) => handleUpdateUserVolume(userActionMenu.userId, parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                    />
                    <span className="text-xs font-bold text-white w-8 text-right">%{userVolumes[userActionMenu.userId] ?? 50}</span>
                  </div>
                </div>
              )}

              {activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(allUsers.find(u => u.id === userActionMenu.userId)?.name || '') && userActionMenu.userId !== currentUser.id && (() => {
                const uid = userActionMenu.userId;
                const status = inviteStatuses[uid];
                const cooldownUntil = inviteCooldowns[uid];
                const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
                const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

                if (status === 'pending') {
                  return (
                    <button disabled className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2 text-blue-400 cursor-default">
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      Aranıyor...
                    </button>
                  );
                }
                if (status === 'accepted') {
                  return (
                    <button disabled className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-emerald-400 cursor-default">
                      ✓ Kabul Edildi
                    </button>
                  );
                }
                if (status === 'rejected') {
                  return (
                    <button disabled className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-red-400 cursor-default">
                      ✕ Reddedildi
                    </button>
                  );
                }
                return (
                  <div>
                    <button
                      disabled={onCooldown}
                      onClick={() => { handleInviteUser(uid); setUserActionMenu(null); }}
                      className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white"
                    >
                      Davet Et
                    </button>
                    {onCooldown && (
                      <p className="text-[10px] text-orange-400 px-3 pb-1">
                        {remaining}s sonra tekrar davet edebilirsiniz.
                      </p>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invitation Modal — phone call UI */}
        <AnimatePresence>
          {invitationModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.90, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.90, opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className="w-full max-w-xs overflow-hidden rounded-3xl shadow-2xl border border-white/10"
                style={{ background: 'linear-gradient(160deg, #0f1623 0%, var(--theme-bg) 60%)' }}
              >
                {/* Header */}
                <div className="pt-10 pb-7 px-8 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-secondary-text)] mb-7">
                    Gelen Çağrı
                  </p>

                  {/* Pulsing avatar */}
                  <div className="relative w-20 h-20 mx-auto mb-5">
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'var(--theme-accent)',
                        opacity: 0.12,
                        animation: 'invitePing 1.6s ease-out infinite',
                      }}
                    />
                    <span
                      className="absolute inset-[-8px] rounded-full"
                      style={{
                        background: 'var(--theme-accent)',
                        opacity: 0.07,
                        animation: 'invitePing 1.6s ease-out 0.5s infinite',
                      }}
                    />
                    <style>{`
                      @keyframes invitePing {
                        0%   { transform: scale(0.85); opacity: 0.16; }
                        70%  { transform: scale(1.35); opacity: 0; }
                        100% { transform: scale(1.35); opacity: 0; }
                      }
                    `}</style>
                    <div
                      className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold select-none"
                      style={{
                        background: 'rgba(var(--theme-accent-rgb, 16,185,129), 0.15)',
                        border: '2px solid var(--theme-accent)',
                        boxShadow: '0 0 24px var(--theme-accent, #10b981)33',
                        color: 'var(--theme-accent)',
                      }}
                    >
                      {invitationModal.inviterAvatar?.startsWith('http') ? (
                        <img
                          src={invitationModal.inviterAvatar}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        invitationModal.inviterAvatar || invitationModal.inviterName.charAt(0).toUpperCase()
                      )}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-[var(--theme-text)] leading-tight">
                    {invitationModal.inviterName}
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--theme-secondary-text)]">
                    <span className="font-semibold" style={{ color: 'var(--theme-accent)' }}>
                      {invitationModal.roomName}
                    </span>{' '}
                    odasına davet ediyor
                  </p>
                </div>

                {/* Divider */}
                <div className="border-t border-white/8" />

                {/* Action buttons */}
                <div className="py-8 flex justify-center gap-16">
                  {/* Decline */}
                  <div className="flex flex-col items-center gap-2.5">
                    <button
                      onClick={() => {
                        if (presenceChannelRef.current && invitationModal) {
                          presenceChannelRef.current.send({
                            type: 'broadcast',
                            event: 'invite-rejected',
                            payload: {
                              inviterId: invitationModal.inviterId,
                              inviteeId: currentUser.id,
                              inviteeName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
                            },
                          });
                        }
                        setInvitationModal(null);
                      }}
                      className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 group"
                      style={{
                        background: 'rgba(239,68,68,0.12)',
                        border: '2px solid rgba(239,68,68,0.35)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(239,68,68)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(239,68,68)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.35)'; }}
                    >
                      <PhoneOff size={22} className="text-red-400 group-hover:text-white transition-colors" />
                    </button>
                    <span className="text-[11px] text-[var(--theme-secondary-text)]">Reddet</span>
                  </div>

                  {/* Accept */}
                  <div className="flex flex-col items-center gap-2.5">
                    <button
                      onClick={() => {
                        if (presenceChannelRef.current && invitationModal) {
                          presenceChannelRef.current.send({
                            type: 'broadcast',
                            event: 'invite-accepted',
                            payload: {
                              inviterId: invitationModal.inviterId,
                              inviteeId: currentUser.id,
                            },
                          });
                        }
                        handleJoinChannel(invitationModal.roomId, true);
                        setInvitationModal(null);
                      }}
                      className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 group"
                      style={{
                        background: 'rgba(16,185,129,0.12)',
                        border: '2px solid rgba(16,185,129,0.35)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgb(16,185,129)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(16,185,129)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.35)'; }}
                    >
                      <PhoneCall size={22} className="text-emerald-400 group-hover:text-white transition-colors" />
                    </button>
                    <span className="text-[11px] text-[var(--theme-secondary-text)]">Kabul</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context Menu */}
        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ top: contextMenu.y, left: contextMenu.x }}
              className="fixed z-[100] w-48 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl p-1.5 backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  const channel = channels.find(c => c.id === contextMenu.channelId);
                  if (channel) {
                    setRoomModal({
                      isOpen: true,
                      type: 'edit',
                      channelId: channel.id,
                      name: channel.name,
                      maxUsers: channel.maxUsers || 0,
                      isInviteOnly: channel.isInviteOnly || false,
                      isHidden: channel.isHidden || false,
                    });
                  }
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
              >
                <Settings size={14} />
                Oda Ayarları
              </button>
              {channels.find(c => c.id === contextMenu.channelId)?.password ? (
                <button
                  onClick={() => handleRemovePassword(contextMenu.channelId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                >
                  <Lock size={14} />
                  Oda Şifresini Kaldır
                </button>
              ) : (
                <button
                  onClick={() => {
                    setPasswordModal({ type: 'set', channelId: contextMenu.channelId });
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--theme-text)] hover:bg-[var(--theme-accent)] hover:text-white rounded-lg transition-colors"
                >
                  <Lock size={14} />
                  Odayı Şifrele
                </button>
              )}
              <button
                onClick={() => handleDeleteRoom(contextMenu.channelId)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Odayı Sil
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Room Modal */}
        <AnimatePresence>
          {roomModal.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setRoomModal({ ...roomModal, isOpen: false })}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-8 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-[var(--theme-accent)]/20 rounded-2xl flex items-center justify-center mb-6">
                    {roomModal.type === 'create'
                      ? <PlusCircle className="text-[var(--theme-accent)]" size={32} />
                      : <Settings className="text-[var(--theme-accent)]" size={32} />
                    }
                  </div>
                  <h3 className="text-xl font-bold text-[var(--theme-text)] mb-6">
                    {roomModal.type === 'create' ? 'Yeni Oda Oluştur' : 'Oda Ayarları'}
                  </h3>

                  <div className="w-full space-y-4 text-left">
                    <div>
                      <label className="block text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">
                        Oda İsmi
                      </label>
                      <input
                        autoFocus
                        type="text"
                        className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-colors"
                        value={roomModal.name}
                        onChange={(e) => setRoomModal({ ...roomModal, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRoom();
                          if (e.key === 'Escape') setRoomModal({ ...roomModal, isOpen: false });
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">
                        Maksimum Kullanıcı (0 = Sınırsız)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-colors"
                        value={roomModal.maxUsers}
                        onChange={(e) => setRoomModal({ ...roomModal, maxUsers: parseInt(e.target.value) || 0 })}
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => {
                          const newIsHidden = !roomModal.isHidden;
                          setRoomModal({
                            ...roomModal,
                            isHidden: newIsHidden,
                            isInviteOnly: newIsHidden ? true : roomModal.isInviteOnly
                          });
                        }}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          roomModal.isHidden ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                          roomModal.isHidden ? 'left-5' : 'left-1'
                        }`} />
                      </button>
                      <span className="text-sm font-bold text-[var(--theme-text)]">Odayı Gizle</span>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => {
                          if (!roomModal.isHidden) {
                            setRoomModal({ ...roomModal, isInviteOnly: !roomModal.isInviteOnly });
                          }
                        }}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          roomModal.isInviteOnly ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'
                        } ${roomModal.isHidden ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                          roomModal.isInviteOnly ? 'left-5' : 'left-1'
                        }`} />
                      </button>
                      <span className="text-sm font-bold text-[var(--theme-text)]">Davetle Girilebilir</span>
                    </div>
                  </div>

                  <div className="flex gap-3 w-full mt-8">
                    <button
                      onClick={() => setRoomModal({ ...roomModal, isOpen: false })}
                      className="flex-1 px-6 py-3 rounded-2xl bg-[var(--theme-surface)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] font-bold transition-colors"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSaveRoom}
                      className="flex-1 px-6 py-3 rounded-2xl bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] border border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-white font-bold shadow-lg transition-all"
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Password Modal */}
        <AnimatePresence>
          {passwordModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setPasswordModal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-3xl p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center text-center gap-6">
                  <div className="w-16 h-16 bg-[var(--theme-accent)]/20 rounded-2xl flex items-center justify-center">
                    <Lock className="text-[var(--theme-accent)]" size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--theme-text)] mb-2">
                      {passwordModal.type === 'set' ? 'Oda Şifrele' : 'Oda Şifreli'}
                    </h3>
                    <p className="text-[var(--theme-secondary-text)] text-sm">
                      {passwordModal.type === 'set'
                        ? 'Lütfen 4 haneli sayısal bir şifre belirleyin.'
                        : 'Bu odaya girmek için 4 haneli şifreyi giriniz.'}
                    </p>
                  </div>

                  <div className="w-full space-y-4">
                    <div className="w-full flex flex-col gap-4">
                      <input
                        autoFocus
                        type="password"
                        maxLength={4}
                        placeholder="• • • •"
                        className={`w-full bg-[var(--theme-sidebar)] border ${
                          passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
                        } rounded-2xl px-6 py-4 text-center text-2xl tracking-[1em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
                        value={passwordInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setPasswordInput(val);
                          setPasswordError(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (passwordModal.type === 'set') {
                              if (passwordInput.length === 4 && passwordInput === passwordRepeatInput) {
                                handleSetPassword(passwordModal.channelId, passwordInput, passwordRepeatInput);
                              } else {
                                setPasswordError(true);
                              }
                            } else {
                              handleVerifyPassword();
                            }
                          }
                          if (e.key === 'Escape') setPasswordModal(null);
                        }}
                      />
                      {passwordModal.type === 'set' && (
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="• • • •"
                          className={`w-full bg-[var(--theme-sidebar)] border ${
                            passwordError ? 'border-red-500' : 'border-[var(--theme-border)]'
                          } rounded-2xl px-6 py-4 text-center text-2xl tracking-[1em] text-[var(--theme-text)] outline-none focus:border-[var(--theme-accent)] transition-all`}
                          value={passwordRepeatInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setPasswordRepeatInput(val);
                            setPasswordError(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (passwordInput.length === 4 && passwordInput === passwordRepeatInput) {
                                handleSetPassword(passwordModal.channelId, passwordInput, passwordRepeatInput);
                              } else {
                                setPasswordError(true);
                              }
                            }
                            if (e.key === 'Escape') setPasswordModal(null);
                          }}
                        />
                      )}
                    </div>
                    {passwordError && (
                      <p className="text-red-500 text-xs font-medium animate-bounce">
                        {passwordModal.type === 'set' ? (passwordInput !== passwordRepeatInput ? 'Şifreler eşleşmiyor!' : 'Lütfen 4 haneli bir sayı giriniz!') : 'Hatalı şifre!'}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setPasswordModal(null)}
                      className="flex-1 px-6 py-3 rounded-2xl bg-[var(--theme-sidebar)] text-[var(--theme-secondary-text)] font-bold hover:opacity-80 transition-all"
                    >
                      İptal
                    </button>
                    <button
                      onClick={() => {
                        passwordModal.type === 'set'
                          ? handleSetPassword(passwordModal.channelId, passwordInput, passwordRepeatInput)
                          : handleVerifyPassword();
                      }}
                      className="flex-1 px-6 py-3 rounded-2xl bg-[var(--theme-sidebar)]/50 text-[var(--theme-accent)] border border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-white font-bold shadow-lg transition-all"
                    >
                      {passwordModal.type === 'set' ? 'Şifrele' : 'Giriş Yap'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className={`flex-1 flex flex-col bg-[var(--theme-surface)] overflow-y-auto custom-scrollbar ${view !== 'settings' ? 'p-8' : ''}`}>
          {view === 'settings' ? <SettingsView /> : activeChannel ? (
            <>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center text-[var(--theme-accent)] border border-[var(--theme-accent)]/20 shrink-0">
                    <Volume2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--theme-text)] leading-none">
                      {channels.find(c => c.id === activeChannel)?.name || 'Sohbet Odası'}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <p className="text-xs text-[var(--theme-secondary-text)] font-medium">
                        {channels.find(c => c.id === activeChannel)?.userCount || 0} kişi aktif
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }}
                  className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                  title="Odadan Ayrıl"
                >
                  <PhoneOff size={18} />
                </button>
              </div>

              <style>{`
                @keyframes speakBar {
                  0%, 100% { transform: scaleY(0.25); }
                  50%       { transform: scaleY(1); }
                }
                @keyframes speakCard {
                  0%, 100% { transform: scale(1);    box-shadow: 0 0 8px rgba(var(--theme-accent-rgb), 0.22); }
                  50%       { transform: scale(1.01); box-shadow: 0 0 16px rgba(var(--theme-accent-rgb), 0.42); }
                }
                @keyframes speakRingPulse {
                  0%, 100% { box-shadow: 0 0 0 2px rgba(var(--theme-accent-rgb), 0.65); }
                  50%       { box-shadow: 0 0 0 2px rgba(var(--theme-accent-rgb), 1), 0 0 8px rgba(var(--theme-accent-rgb), 0.28); }
                }
              `}</style>
              <div className={`grid gap-4 ${
                sortedChannelMembers.length <= 1 ? 'grid-cols-1' :
                sortedChannelMembers.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
                sortedChannelMembers.length <= 9 ? 'grid-cols-2 lg:grid-cols-3' :
                'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              }`}>
                {sortedChannelMembers.map((user, index) => {
                  const isMe = user.id === currentUser.id;
                  const memberCount = channelMembers.length;

                  const boxPadding = memberCount <= 4 ? 'p-4' : memberCount <= 9 ? 'p-3' : 'p-2';
                  const avatarSize = memberCount <= 4 ? 'w-14 h-14' : memberCount <= 9 ? 'w-12 h-12' : 'w-10 h-10';
                  const nameSize = memberCount <= 4 ? 'text-base' : memberCount <= 9 ? 'text-sm' : 'text-xs';
                  const statusSize = memberCount <= 4 ? 'text-xs' : 'text-[10px]';
                  const iconSize = memberCount <= 4 ? 16 : memberCount <= 9 ? 14 : 12;
                  const badgeSize = memberCount <= 4 ? 12 : memberCount <= 9 ? 10 : 8;

                  let roleLabel = (index + 1).toString();
                  if (currentChannel?.ownerId === user.id) {
                    roleLabel = 'M';
                  } else if (!currentChannel?.ownerId && user.isAdmin) {
                    roleLabel = 'A';
                  }

                  const isSpeakingActive =
                    (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) ||
                    (!isMe && !!user.isSpeaking);

                  return (
                    <div
                      key={user.id}
                      onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                      onDoubleClick={() => !isMe && currentUser.isAdmin && handleKickUser(user.id)}
                      className={`${
                        isMe ? 'bg-[var(--theme-accent)]/10 border-[var(--theme-accent)]/60' : 'bg-[var(--theme-sidebar)]/50 border-[var(--theme-border)]'
                      } border rounded-2xl ${boxPadding} flex items-center gap-3 relative group cursor-pointer transition-all duration-200 ${
                        isSpeakingActive
                          ? 'border-[var(--theme-accent)]'
                          : 'hover:bg-[var(--theme-accent)]/5 hover:scale-[1.005] hover:border-[var(--theme-accent)]/25'
                      }`}
                      style={isSpeakingActive ? { animation: 'speakCard 2.8s ease-in-out infinite' } : undefined}
                    >
                      <div className="relative shrink-0">
                        <div
                          className={`${avatarSize} rounded-xl bg-[var(--theme-accent)]/20 flex items-center justify-center text-[var(--theme-text)] font-bold text-lg overflow-hidden transition-all duration-200 ${
                            !isSpeakingActive ? 'ring-1 ring-[var(--theme-border)]/60' : ''
                          }`}
                          style={isSpeakingActive ? { animation: 'speakRingPulse 2s 0.4s ease-in-out infinite' } : undefined}
                        >
                          {user.avatar && user.avatar.startsWith('http') ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            user.avatar
                          )}
                        </div>
                        {user.isAdmin && adminBorderEffect && !isSpeakingActive && (
                          <div className="absolute inset-[-3px] rounded-xl ring-2 ring-[var(--theme-accent)]/45 animate-pulse pointer-events-none" />
                        )}
                        <div className={`absolute -bottom-1 -right-1 ${memberCount <= 9 ? 'w-4 h-4 text-[9px]' : 'w-3.5 h-3.5 text-[8px]'} bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-md flex items-center justify-center font-bold ${
                          roleLabel === 'M' || roleLabel === 'A' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'
                        }`}>
                          {roleLabel}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-semibold truncate ${nameSize} text-[var(--theme-text)]`}>
                            {user.firstName} {user.lastName} ({user.age})
                          </span>
                          {isMe && (
                            <span className="shrink-0 text-[7px] font-bold px-1.5 py-0.5 bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] rounded-full border border-[var(--theme-accent)]/25 leading-none">
                              SEN
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5">
                          {isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned ? (
                            <div className="flex items-end gap-0.5 h-3 w-12">
                              {[1, 2, 3, 4, 5, 6].map((i) => {
                                const isActive = volumeLevel > (i * 15);
                                return (
                                  <div
                                    key={i}
                                    className={`w-1 rounded-full transition-all duration-75 ${isActive ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'}`}
                                    style={{
                                      height: isActive ? `${Math.max(20, Math.min(100, volumeLevel - (i * 5)))}%` : '20%'
                                    }}
                                  />
                                );
                              })}
                            </div>
                          ) : user.isSpeaking ? (
                            <div className="flex items-end gap-[2px] h-3">
                              {[0, 1, 2].map(j => (
                                <div key={j} className="w-[2px] rounded-full bg-[var(--theme-accent)]" style={{
                                  height: '10px',
                                  transformOrigin: 'bottom',
                                  animation: `speakBar 0.75s ${j * 0.14}s ease-in-out infinite`,
                                }} />
                              ))}
                            </div>
                          ) : (
                            <p className={`${statusSize} font-bold truncate ${getStatusColor(user.id === currentUser.id ? getEffectiveStatus() : (user.statusText || 'Aktif'))}`}>
                              {user.id === currentUser.id ? getEffectiveStatus() : (user.statusText || 'Aktif')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5 bg-[var(--theme-bg)]/40 rounded-lg px-2 py-1">
                          <Headphones size={iconSize} className={(isMe ? isDeafened : !!user.selfDeafened) ? 'text-red-500' : 'text-[var(--theme-accent)]/70'} />
                          <Mic size={iconSize} className={(isMe ? isMuted : (!!user.selfMuted || !!user.isMuted)) ? 'text-red-500' : 'text-[var(--theme-accent)]/70'} />
                        </div>
                        <div className="flex gap-2 h-4 items-center justify-center">
                          {user.statusText === 'Telefonda' && (
                            <div className="flex items-center gap-0.5 text-red-500 font-black" style={{ fontSize: `${badgeSize - 2}px` }}>
                              <PhoneCall size={badgeSize} />
                              <span>TEL</span>
                            </div>
                          )}
                          {user.statusText === 'Hemen Geleceğim' && (
                            <div className="flex items-center gap-0.5 text-orange-500 font-black" style={{ fontSize: `${badgeSize - 2}px` }}>
                              <Recycle size={badgeSize} />
                              <span>HG</span>
                            </div>
                          )}
                          {isMe && statusTimer !== null && statusTimer > 0 && (
                            <div className="text-yellow-500 font-black" style={{ fontSize: `${badgeSize}px` }}>
                              {Math.floor(statusTimer / 60)}:{(statusTimer % 60).toString().padStart(2, '0')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--theme-accent)]/10 flex items-center justify-center mb-6">
                <Volume2 size={32} className="text-[var(--theme-accent)]" />
              </div>
              <h2 className="text-xl font-bold tracking-wide text-[var(--theme-text)] mb-3">
                Henüz Bir Odada Değilsiniz
              </h2>
              <p className="text-sm text-[var(--theme-secondary-text)] max-w-[260px] leading-relaxed">
                Sohbete başlamak için sol taraftaki kanallardan birine katılın.
              </p>
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="w-64 bg-[var(--theme-sidebar)]/30 flex flex-col hidden lg:flex">
          <div className="p-6 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text)]">Kullanıcılar</h3>
            <span className="text-[10px] bg-[var(--theme-sidebar)] px-2 py-0.5 rounded-full text-[var(--theme-text)] font-bold">{allUsers.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Online */}
            <div>
              <p className="text-[10px] font-bold text-[var(--theme-text)] opacity-80 uppercase mb-3 px-2">Çevrimiçi — {onlineUsers.length}</p>
              <div className="space-y-1">
                {onlineUsers.map(user => {
                  const isMe = user.id === currentUser.id;
                  const alreadyInChannel = activeChannel && channels.find(c => c.id === activeChannel)?.members?.includes(user.name);
                  const canInvite = !isMe && activeChannel && !alreadyInChannel;
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors group hover:bg-[var(--theme-sidebar)] cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="h-8 w-8 rounded-full bg-[var(--theme-accent)]/20 border-2 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]"
                          style={{ borderColor: isMe ? avatarBorderColor : 'transparent' }}
                        >
                          {user.avatar?.startsWith('http')
                            ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : user.avatar}
                        </div>
                        {user.isAdmin && adminBorderEffect && (
                          <div className="absolute inset-[-3px] rounded-full ring-2 ring-[var(--theme-accent)]/50 animate-pulse pointer-events-none" />
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-[var(--theme-sidebar)] rounded-full ${
                          user.status === 'online' ? 'bg-emerald-500' : 'bg-orange-500'
                        }`}></div>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-[var(--theme-text)] leading-none truncate">{user.firstName} {user.lastName} ({user.age})</span>
                          {user.isAdmin && <ShieldCheck size={12} className="text-[var(--theme-accent)] shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {/* Mic / deafen durum ikonları — kalıcı audio state */}
                          {(isMe ? isMuted : (!!user.selfMuted || !!user.isMuted)) && (
                            <Mic size={8} className="text-red-500 shrink-0" />
                          )}
                          {(isMe ? isDeafened : !!user.selfDeafened) && (
                            <Headphones size={8} className="text-red-500 shrink-0" />
                          )}
                          {/* Kalıcı durum — speaking göstergesi yok */}
                          {user.statusText === 'Telefonda' && <PhoneCall size={8} className="text-red-500" />}
                          {user.statusText === 'Hemen Geleceğim' && <Recycle size={8} className="text-orange-500" />}
                          <span className={`text-[9px] font-bold uppercase tracking-tight ${getStatusColor(user.statusText || 'Aktif')}`}>{user.statusText}</span>
                        </div>
                      </div>
                      {canInvite && (() => {
                        const status = inviteStatuses[user.id];
                        const cooldownUntil = inviteCooldowns[user.id];
                        const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
                        const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

                        if (status === 'pending') {
                          return (
                            <span className="shrink-0 opacity-100 px-2 py-0.5 rounded-md text-[9px] font-bold text-blue-400 border border-blue-400/30 flex items-center gap-1 bg-blue-500/10">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              Aranıyor
                            </span>
                          );
                        }
                        if (status === 'accepted') {
                          return (
                            <span className="shrink-0 opacity-100 px-2 py-0.5 rounded-md text-[9px] font-bold text-emerald-400 border border-emerald-400/30 bg-emerald-500/10">
                              ✓ Kabul
                            </span>
                          );
                        }
                        if (status === 'rejected') {
                          return (
                            <span className="shrink-0 opacity-100 px-2 py-0.5 rounded-md text-[9px] font-bold text-red-400 border border-red-400/30 bg-red-500/10">
                              ✕ Ret
                            </span>
                          );
                        }
                        return (
                          <button
                            disabled={onCooldown}
                            onClick={() => handleInviteUser(user.id)}
                            title={onCooldown ? `${remaining}s sonra tekrar davet edebilirsiniz` : 'Odaya davet et'}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-md text-[9px] font-bold bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] hover:bg-[var(--theme-accent)] hover:text-white border border-[var(--theme-accent)]/30 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {onCooldown ? `${remaining}s` : 'Davet'}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Offline */}
            <div>
              <p className="text-[10px] font-bold text-[var(--theme-text)] opacity-60 uppercase mb-3 px-2">Çevrimdışı — {offlineUsers.length}</p>
              <div className="space-y-1">
                {offlineUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg opacity-60 transition-all group hover:opacity-80 hover:bg-[var(--theme-sidebar)] cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                  >
                    <div className="relative">
                      <div
                        className="h-8 w-8 rounded-full bg-[var(--theme-accent)]/10 border-2 overflow-hidden flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]"
                        style={{ borderColor: user.id === currentUser.id ? avatarBorderColor : 'transparent' }}
                      >
                        {user.avatar?.startsWith('http')
                          ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          : user.avatar}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-[var(--theme-sidebar)] border-2 border-[var(--theme-sidebar)] rounded-full"></div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[var(--theme-text)] opacity-80 group-hover:text-[var(--theme-text)] transition-colors">{user.firstName} {user.lastName} ({user.age})</span>
                      {user.isAdmin && <ShieldCheck size={12} className="text-[var(--theme-accent)]" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* User Profile Popup */}
      <AnimatePresence>
        {profilePopup && (() => {
          const popupUser = allUsers.find(u => u.id === profilePopup.userId);
          if (!popupUser) return null;
          const isMe = popupUser.id === currentUser.id;
          const alreadyInChannel = activeChannel && channels.find(c => c.id === activeChannel)?.members?.includes(popupUser.name);
          const canInvite = !isMe && !!activeChannel && !alreadyInChannel && popupUser.status === 'online';
          const inviteStatus = inviteStatuses[popupUser.id];
          const cooldownUntil = inviteCooldowns[popupUser.id];
          const onCooldown = !!(cooldownUntil && Date.now() < cooldownUntil);
          const remaining = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
          return (
            <UserProfilePopup
              user={popupUser}
              position={profilePopup}
              onClose={() => setProfilePopup(null)}
              onInvite={() => { handleInviteUser(popupUser.id); setProfilePopup(null); }}
              canInvite={!!canInvite}
              inviteStatus={inviteStatus}
              onCooldown={onCooldown}
              cooldownRemaining={remaining}
              isMe={isMe}
            />
          );
        })()}
      </AnimatePresence>

      {/* Footer Controls */}
      <footer className="h-16 bg-[var(--theme-sidebar)] flex items-center relative">
        <div className="w-72 px-4 flex gap-2 h-full items-center">
          <div className="relative flex-1">
            <button
              onClick={() => {
                const isSpecialStatus = currentUser.statusText === 'Telefonda' ||
                                        currentUser.statusText === 'Hemen Geleceğim' ||
                                        currentUser.statusText?.includes('Sonra Geleceğim');
                if (isSpecialStatus) {
                  setIsDeafened(false);
                } else {
                  setIsDeafened(!isDeafened);
                }
              }}
              aria-label={isDeafened ? 'Sağırlığı kaldır' : 'Hoparlörü kapat'}
              aria-pressed={isDeafened}
              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                isDeafened
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'text-white shadow-lg'
              }`}
              style={!isDeafened ? { backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 14px rgba(var(--theme-accent-rgb),0.35)' } : undefined}
            >
              <Headphones size={14} />
              <span className="truncate">Hoparlör</span>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOutputSettings(!showOutputSettings);
                  setShowInputSettings(false);
                }}
                className="p-0.5 hover:bg-black/20 rounded transition-colors"
              >
                <Settings size={12} />
              </div>
            </button>

            <AnimatePresence>
              {showOutputSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl p-3 shadow-2xl z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Çıkış Cihazı Seçin</h4>
                  <div className="space-y-1">
                    {outputDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedOutput(device.deviceId);
                          setShowOutputSettings(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                          selectedOutput === device.deviceId
                            ? 'bg-[var(--theme-accent)] text-white'
                            : 'text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] hover:text-[var(--theme-text)]'
                        }`}
                      >
                        <span className="truncate">{device.label || `Hoparlör ${device.deviceId.slice(0, 5)}`}</span>
                        {selectedOutput === device.deviceId && <Check size={12} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative flex-1">
            <button
              onClick={() => {
                if (isAdminMuted) return; // Admin susturması devredeyken açılamaz
                const isSpecialStatus = currentUser.statusText === 'Telefonda' ||
                                        currentUser.statusText === 'Hemen Geleceğim' ||
                                        currentUser.statusText?.includes('Sonra Geleceğim');
                if (isSpecialStatus) {
                  handleSetStatus('Aktif');
                } else {
                  const willBeActive = isMuted;
                  if (willBeActive && isDeafened) {
                    setIsDeafened(false);
                  }
                  setIsMuted(!isMuted);
                }
              }}
              aria-label={isAdminMuted ? 'Susturuldu' : isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
              aria-pressed={isMuted}
              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                isAdminMuted
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20 cursor-not-allowed'
                  : isMuted
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                    : 'text-white shadow-lg'
              }`}
              style={!isAdminMuted && !isMuted ? { backgroundColor: 'var(--theme-accent)', boxShadow: '0 4px 14px rgba(var(--theme-accent-rgb),0.35)' } : undefined}
            >
              <Mic size={14} />
              <span className="truncate">
                {isAdminMuted ? (muteRemaining ?? 'Susturuldu') : 'Mikrofon'}
              </span>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInputSettings(!showInputSettings);
                  setShowOutputSettings(false);
                }}
                className="p-0.5 hover:bg-black/20 rounded transition-colors"
              >
                <Settings size={12} />
              </div>
            </button>

            <AnimatePresence>
              {showInputSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl p-3 shadow-2xl z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Giriş Cihazı Seçin</h4>
                  <div className="space-y-1">
                    {inputDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedInput(device.deviceId);
                          setShowInputSettings(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                          selectedInput === device.deviceId
                            ? 'bg-[var(--theme-accent)] text-white'
                            : 'text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] hover:text-[var(--theme-text)]'
                        }`}
                      >
                        <span className="truncate">{device.label || `Mikrofon ${device.deviceId.slice(0, 5)}`}</span>
                        {selectedInput === device.deviceId && <Check size={12} className="shrink-0" />}
                      </button>
                    ))}
                  </div>

                  <div className={`mt-4 pt-4 border-t border-[var(--theme-border)] ${!isNoiseSuppressionEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Shield size={12} className="text-[var(--theme-accent)]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-secondary-text)]">Gürültü Eşiği</span>
                      </div>
                      <span className="text-[10px] font-bold text-[var(--theme-accent)]">{noiseThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={noiseThreshold}
                      disabled={!isNoiseSuppressionEnabled}
                      onChange={(e) => setNoiseThreshold(parseInt(e.target.value))}
                      className="w-full h-1 bg-[var(--theme-sidebar)] rounded-lg appearance-none cursor-pointer accent-[var(--theme-accent)] disabled:cursor-not-allowed"
                    />
                    <p className="text-[9px] text-[var(--theme-secondary-text)] mt-2 leading-tight">
                      {isNoiseSuppressionEnabled
                        ? 'Daha yüksek değerler arka plan gürültüsünü daha fazla keser ancak sesinizin de kesilmesine neden olabilir.'
                        : 'Gürültü susturma kapalıyken eşik ayarı devre dışıdır.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Middle Section - PTT Indicator */}
        <div className="flex-1 h-full flex items-center justify-center px-4">
          <div className="flex items-center gap-4 bg-[var(--theme-surface)]/80 px-5 py-2 rounded-xl border border-[var(--theme-border)] shadow-sm">
            <div className="flex items-center gap-2 text-[var(--theme-text)] font-bold text-[10px] uppercase tracking-widest shrink-0">
              <button
                onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)}
                className={`p-1 rounded-md transition-all ${
                  isNoiseSuppressionEnabled
                    ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]'
                    : 'bg-[var(--theme-border)] text-[var(--theme-secondary-text)]'
                }`}
                title={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}
              >
                {isNoiseSuppressionEnabled ? <Shield size={12} /> : <ShieldOff size={12} />}
              </button>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 h-2.5">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={isPttPressed && !isMuted ? { height: ['30%', '100%', '30%'] } : { height: '30%' }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                      className="w-0.5 bg-[var(--theme-accent)] rounded-full"
                      style={{ height: '30%' }}
                    />
                  ))}
                </div>
                Bas-Konuş
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-4">
              {[...Array(6)].map((_, i) => {
                let isActive = false;
                if (volumeLevel > 0) {
                  if (volumeLevel < 20) isActive = i < 1;
                  else if (volumeLevel < 50) isActive = i < 3;
                  else if (volumeLevel < 85) isActive = i < 5;
                  else isActive = i < 6;
                }

                return (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isActive
                        ? 'bg-[var(--theme-accent)] shadow-[0_0_8px_var(--theme-accent)]'
                        : 'bg-[var(--theme-border)]'
                    }`}
                    style={{
                      height: isActive ? `${(i + 1) * 16.6}%` : '4px',
                      minHeight: '4px'
                    }}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsListeningForKey(true)}
                className={`px-3 py-1 rounded text-[10px] font-black transition-all ${
                  isListeningForKey
                    ? 'bg-[var(--theme-accent)] text-white animate-pulse'
                    : 'bg-[var(--theme-border)] text-[var(--theme-secondary-text)] hover:bg-[var(--theme-accent)]/10'
                }`}
              >
                {isListeningForKey ? '...' : pttKey}
              </button>
            </div>
            {appVersion && (
              <div className="relative border-l border-[var(--theme-border)] pl-3 ml-1">
                <button
                  onClick={() => getReleaseNotes(appVersion) && setShowReleaseNotes(!showReleaseNotes)}
                  className={`text-[9px] font-medium transition-colors ${getReleaseNotes(appVersion) ? 'text-[var(--theme-accent)]/70 hover:text-[var(--theme-accent)] cursor-pointer' : 'text-[var(--theme-secondary-text)]/50 cursor-default'}`}
                >
                  v{appVersion}
                </button>
                {showReleaseNotes && getReleaseNotes(appVersion) && (
                  <ReleaseNotesPopover
                    version={appVersion}
                    notes={getReleaseNotes(appVersion)!}
                    onClose={() => setShowReleaseNotes(false)}
                    isAdmin={currentUser.isAdmin}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-64 px-4 flex items-center justify-evenly h-full">
          {renderConnectionQuality()}

          <div className="relative" ref={resetPanelRef}>
            {/* Davet talebi bildirim baloncuğu (admin) */}
            {currentUser.isAdmin && (
              <AnimatePresence>
                {showInvitePanel && inviteRequests.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute bottom-full mb-3 right-0 w-72 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="absolute -bottom-[7px] right-6 w-3.5 h-3.5 bg-[var(--theme-bg)] border-r border-b border-[var(--theme-border)] rotate-45" />
                    <div className="px-3 py-2 border-b border-[var(--theme-border)] flex items-center gap-1.5">
                      <Mail size={12} className="text-[var(--theme-accent)]" />
                      <span className="text-[10px] font-bold text-[var(--theme-text)] uppercase tracking-wide">Davet Talepleri</span>
                      <span className="ml-auto text-[9px] bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] font-bold px-1.5 py-0.5 rounded-full">{inviteRequests.length}</span>
                    </div>
                    <div className="divide-y divide-[var(--theme-border)] max-h-80 overflow-y-auto custom-scrollbar">
                      <InviteRequestPanel
                        requests={inviteRequests}
                        onSendCode={handleSendInviteCode}
                        onReject={handleRejectInvite}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Şifre sıfırlama bildirim baloncuğu */}
            <AnimatePresence>
              {showResetPanel && passwordResetRequests.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute bottom-full mb-3 right-0 w-72 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  {/* Ok işareti */}
                  <div className="absolute -bottom-[7px] right-6 w-3.5 h-3.5 bg-[var(--theme-bg)] border-r border-b border-[var(--theme-border)] rotate-45" />
                  <div className="px-3 py-2 border-b border-[var(--theme-border)] flex items-center gap-1.5">
                    <KeyRound size={12} className="text-amber-500" />
                    <span className="text-[10px] font-bold text-[var(--theme-text)] uppercase tracking-wide">Şifre Sıfırlama İstekleri</span>
                    <span className="ml-auto text-[9px] bg-amber-500/15 text-amber-500 font-bold px-1.5 py-0.5 rounded-full">{passwordResetRequests.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--theme-border)]">
                    {passwordResetRequests.map(req => (
                      <div key={req.userId} className="px-3 py-2.5">
                        <p className="text-[11px] text-[var(--theme-text)] leading-snug mb-2">
                          <span className="font-bold text-[var(--theme-accent)]">{req.userName}</span> kullanıcısı parolasını sıfırlamak istiyor.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { handleApproveReset(req); setShowResetPanel(false); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"
                          >
                            <Check size={11} /> Onayla
                          </button>
                          <button
                            onClick={() => { handleDismissReset(req.userId); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                          >
                            <X size={11} /> Reddet
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
              className={`relative flex items-center gap-1.5 transition-all font-bold text-[10px] uppercase tracking-widest group ${view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)]'}`}
            >
              <span className="relative">
                <Settings size={14} className={`transition-transform duration-300 ${view === 'settings' ? 'rotate-90' : 'group-hover:rotate-90'}`} />
                {(passwordResetRequests.length > 0 || inviteRequests.length > 0) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                )}
              </span>
              Ayarlar
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-[var(--theme-secondary-text)] hover:text-red-500 transition-all font-bold text-[10px] uppercase tracking-widest group"
          >
            <LogOut size={18} />
            Çıkış
          </button>
        </div>
      </footer>
    </div>
  );
}
