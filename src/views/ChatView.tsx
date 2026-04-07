import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Settings,
  Trash2,
  LogOut,
  Power,
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
  Mail,
  ChevronDown,
  Menu,
  Home,
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
import ReleaseNotesPopover from '../components/ReleaseNotesModal';
import { getReleaseNotes } from '../lib/releaseNotes';
import InviteRequestPanel from '../components/InviteRequestPanel';
import AnnouncementsPanel from '../components/AnnouncementsPanel';
import BrandArea from '../components/BrandArea';
import UpdateVersionHub from '../features/update/components/UpdateVersionHub';
import MobileUpdateHub from '../features/update/components/MobileUpdateHub';
import { startInviteRingtone, stopInviteRingtone } from '../lib/sounds';
import { dismissInviteNotification } from '../lib/notifications';
import { UserCard, RoomNetworkVisualization, ConnectionQualityIndicator, CARD_SCALE_MAP } from '../components/chat';
import type { CardScale } from '../components/chat';
import { type CardStyle, CARD_STYLES, loadCardStyle, saveCardStyle } from '../components/chat/cardStyles';
import DeviceBadge from '../components/chat/DeviceBadge';
import ConfirmModal from '../components/ConfirmModal';
import { isCapacitor } from '../lib/platform';

// Capacitor (Android telefon/tablet) → her zaman mobil layout
// Electron / desktop web → CSS breakpoint ile responsive
const FORCE_MOBILE = isCapacitor();

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
    voiceMode,
    audioProfile: _audioProfile,
    setAudioProfile,
    showLastSeen,
    setShowLastSeen,
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
    setIsPttPressed,
    speakingLevels,
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

  // ── Mobil drawer state ──
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  // ── Handle swipe helper — handle üzerinden başlayan swipe'ı algılar ──
  const handleSwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);
  const makeHandleTouchEnd = useCallback((action: () => void, direction: 'right' | 'left') => (e: React.TouchEvent) => {
    if (!handleSwipeRef.current) return;
    const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX;
    const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY);
    handleSwipeRef.current = null;
    if (dy > 60) return; // Dikey kaydırma, swipe değil
    if (direction === 'right' && dx > 30) action();
    if (direction === 'left' && dx < -30) action();
  }, []);

  // Local state: draggedUser is only used inside ChatView
  const [draggedUser, setDraggedUser] = useState<string | null>(null);

  // ── TEST: Fake kullanıcı simülasyonu ──
  const FAKE_NAMES = [
    { firstName: 'Ahmet', lastName: 'Yılmaz', age: 28, avatar: 'AY' },
    { firstName: 'Elif', lastName: 'Demir', age: 24, avatar: 'ED' },
    { firstName: 'Can', lastName: 'Öztürk', age: 31, avatar: 'CÖ' },
    { firstName: 'Zeynep', lastName: 'Kaya', age: 22, avatar: 'ZK' },
    { firstName: 'Burak', lastName: 'Çelik', age: 27, avatar: 'BÇ' },
    { firstName: 'Seda', lastName: 'Arslan', age: 25, avatar: 'SA' },
    { firstName: 'Emre', lastName: 'Koç', age: 30, avatar: 'EK' },
    { firstName: 'Ayşe', lastName: 'Şahin', age: 23, avatar: 'AŞ' },
    { firstName: 'Mert', lastName: 'Aydın', age: 29, avatar: 'MA' },
    { firstName: 'Deniz', lastName: 'Yıldız', age: 26, avatar: 'DY' },
    { firstName: 'Oğuz', lastName: 'Kurt', age: 33, avatar: 'OK' },
    { firstName: 'Gizem', lastName: 'Tan', age: 21, avatar: 'GT' },
    { firstName: 'Hakan', lastName: 'Bal', age: 35, avatar: 'HB' },
    { firstName: 'Nisa', lastName: 'Er', age: 20, avatar: 'NE' },
    { firstName: 'Tolga', lastName: 'Ak', age: 32, avatar: 'TA' },
    { firstName: 'İrem', lastName: 'Güneş', age: 24, avatar: 'İG' },
    { firstName: 'Kaan', lastName: 'Işık', age: 27, avatar: 'Kİ' },
    { firstName: 'Pınar', lastName: 'Su', age: 26, avatar: 'PS' },
    { firstName: 'Arda', lastName: 'Tunç', age: 29, avatar: 'AT' },
    { firstName: 'Yağmur', lastName: 'Bulut', age: 23, avatar: 'YB' },
    { firstName: 'Onur', lastName: 'Kara', age: 34, avatar: 'OK' },
    { firstName: 'Ceren', lastName: 'Ay', age: 22, avatar: 'CA' },
    { firstName: 'Furkan', lastName: 'Gök', age: 28, avatar: 'FG' },
    { firstName: 'Ece', lastName: 'Özkan', age: 25, avatar: 'EÖ' },
    { firstName: 'Barış', lastName: 'Deniz', age: 31, avatar: 'BD' },
    { firstName: 'Dila', lastName: 'Yurt', age: 21, avatar: 'DY' },
    { firstName: 'Tuna', lastName: 'Sel', age: 30, avatar: 'TS' },
    { firstName: 'Melisa', lastName: 'Çam', age: 24, avatar: 'MÇ' },
    { firstName: 'Alp', lastName: 'Dağ', age: 33, avatar: 'AD' },
    { firstName: 'Simge', lastName: 'Yol', age: 22, avatar: 'SY' },
  ];
  const [fakeUserCount, setFakeUserCount] = useState(0);

  // ── Sohbet mesajları (WebSocket Chat Server) ──
  const [chatMessages, setChatMessages] = useState<{ id: string; senderId: string; sender: string; avatar: string; text: string; time: number }[]>([]);
  const [chatMuted, setChatMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [chatFontSize, setChatFontSize] = useState(() => {
    const saved = localStorage.getItem('chatFontSize');
    return saved ? Math.max(0, Math.min(5, parseInt(saved))) : 0;
  });
  const emojiRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);
  const getUserColor = useCallback((userId: string) => {
    const colors = ['#F87171','#FB923C','#FBBF24','#34D399','#22D3EE','#818CF8','#C084FC','#F472B6','#A78BFA','#6EE7B7'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    return colors[Math.abs(hash) % colors.length];
  }, []);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [cardsHeight, setCardsHeight] = useState(0);
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCardsHeight(e.contentRect.height + 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeChannel]);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // WebSocket chat bağlantısı
  useEffect(() => {
    import('../lib/chatService').then(({ connectChat, setChatHandlers, disconnectChat }) => {
      setChatHandlers({
        onHistory: (_roomId, messages) => {
          setChatMessages(messages);
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current?.scrollHeight ?? 0 }), 100);
        },
        onMessage: (msg) => {
          setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          // Kullanıcı en alttaysa auto-scroll, değilse badge artır
          const el = chatScrollRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
            setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 50);
          } else {
            setNewMsgCount(c => c + 1);
          }
        },
        onDelete: (messageId) => setChatMessages(prev => prev.filter(m => m.id !== messageId)),
        onEdit: (messageId, text) => setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, text } : m)),
        onClear: () => setChatMessages([]),
      });
      connectChat();
    });
    return () => { import('../lib/chatService').then(({ disconnectChat }) => disconnectChat()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Oda değişince WS'ye join/leave gönder + bağlantı yoksa yeniden bağlan
  useEffect(() => {
    if (!activeChannel) {
      setChatMessages([]);
      import('../lib/chatService').then(({ leaveRoom }) => leaveRoom());
      return;
    }
    import('../lib/chatService').then(({ joinRoom, connectChat }) => {
      connectChat(); // bağlı değilse yeniden dener, bağlıysa skip
      joinRoom(activeChannel);
    });
  }, [activeChannel]);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  // Scroll event — kullanıcı en altta mı?
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMsgCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    setNewMsgCount(0);
  }, []);

  const sendChatMessage = () => {
    if (chatMuted && !currentUser.isAdmin && !currentUser.isModerator) return;
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    import('../lib/chatService').then(({ sendMessage }) => sendMessage(text));
    setTimeout(scrollToBottom, 100);
  };
  const deleteChatMessage = (id: string) => {
    setChatMessages(prev => prev.filter(m => m.id !== id));
    import('../lib/chatService').then(({ deleteMessage }) => deleteMessage(id));
  };
  const clearAllMessages = () => {
    setChatMessages([]);
    import('../lib/chatService').then(({ clearAllMessages: clearAll }) => clearAll());
  };
  const startEditMessage = (msg: { id: string; text: string }) => { setEditingMsgId(msg.id); setEditingText(msg.text); };
  const saveEditMessage = () => {
    if (!editingMsgId) return;
    const t = editingText.trim();
    if (!t) { deleteChatMessage(editingMsgId); setEditingMsgId(null); return; }
    setChatMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text: t } : m));
    import('../lib/chatService').then(({ editMessage }) => editMessage(editingMsgId!, t));
    setEditingMsgId(null); setEditingText('');
  };
  const fakeUsers = useMemo(() => {
    return FAKE_NAMES.slice(0, fakeUserCount).map((f, i) => ({
      id: `fake-${i}`,
      name: `${f.firstName} ${f.lastName}`,
      firstName: f.firstName,
      lastName: f.lastName,
      age: f.age,
      avatar: f.avatar,
      status: 'online' as const,
      statusText: i % 3 === 0 ? 'Aktif' : i % 3 === 1 ? 'Telefonda' : 'Aktif',
      isSpeaking: i === 0 && fakeUserCount > 1, // ilk fake user konuşuyor simülasyonu
      platform: (i % 2 === 0 ? 'desktop' : 'mobile') as 'desktop' | 'mobile',
      isAdmin: i === 2,
      isModerator: i === 4,
      appVersion: '1.7.14',
      onlineSince: Date.now() - (i + 1) * 600000,
    }));
  }, [fakeUserCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Profile popup
  const [profilePopup, setProfilePopup] = useState<{ userId: string; x: number; y: number } | null>(null);

  // Offline users collapse
  const [offlineExpanded, setOfflineExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('offlineUsersExpanded');
    return saved !== null ? saved === 'true' : false;
  });
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

  // Davet gelince çağrı sesi: modal açılınca başlar, kapanınca durur
  // soundInvite kapalıysa hiç çalmaz; variant ayarı ile uygun ses seçilir
  useEffect(() => {
    if (invitationModal) {
      console.log('[ChatView] invite_modal_opened:', invitationModal.inviterName);
      if (soundInvite) startInviteRingtone(soundInviteVariant);
    } else {
      console.log('[ChatView] invite_modal_closed');
      stopInviteRingtone();
      dismissInviteNotification();
    }
    return () => { stopInviteRingtone(); };
  }, [invitationModal, soundInvite, soundInviteVariant]);

  // Bildirime tıklanınca uygulama ön plana gelir — in-app modal zaten açık.
  // Kabul/red kararı tamamen in-app modal butonlarıyla kullanıcıya bırakılır.
  // Native'den auto accept/reject YOKTUR.

  // Şifre sıfırlama bildirim baloncuğu
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [vadSliderOpen, setVadSliderOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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
    e.stopPropagation(); // Parent handleDropToRemove'a bubble etmesin
    const userName = e.dataTransfer.getData('userName') || draggedUser;
    if (userName) {
      handleMoveUser(userName, channelId);
    }
    setDraggedUser(null);
  };

  // Oda dışı alana bırakıldığında kullanıcıyı odadan çıkar (admin only)
  const handleDropToRemove = (e: React.DragEvent) => {
    e.preventDefault();
    const userName = e.dataTransfer.getData('userName') || draggedUser;
    setDraggedUser(null);
    if (!currentUser.isAdmin || !userName) return;
    const user = allUsers.find(u => u.name === userName);
    if (!user) return;
    // Kendini kickleme engeli
    if (user.id === currentUser.id) return;
    // Kullanıcı gerçekten bir odada mı kontrol et
    const inRoom = channels.some(c => c.members?.includes(userName));
    if (!inRoom) return;
    handleKickUser(user.id);
  };

  // cardScale config lookup
  const scaleConfig = CARD_SCALE_MAP[cardScale as CardScale];

  // Audio intensity per user: 0–1
  const getIntensity = useCallback((user: typeof sortedChannelMembers[0]): number => {
    const isMe = user.id === currentUser.id;
    if (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) {
      return Math.min(1, volumeLevel / 80);
    }
    if (user.isSpeaking) {
      return Math.min(1, (speakingLevels[user.name] ?? 0) * 2.5);
    }
    return 0;
  }, [currentUser.id, currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels]);

  // ─── Dominant speaker detection with hysteresis ───────────────
  const dominantSpeakerRef = useRef<string | null>(null);
  const dominantSpeakerId = useMemo(() => {
    // Find the speaker with the highest level among active speakers
    let maxLevel = 0;
    let maxId: string | null = null;

    for (const member of sortedChannelMembers) {
      const isMe = member.id === currentUser.id;
      const isSpeaking = isMe
        ? (isPttPressed && !isMuted && !currentUser.isVoiceBanned)
        : !!member.isSpeaking;

      if (!isSpeaking) continue;

      const level = isMe ? volumeLevel / 80 : (speakingLevels[member.name] ?? 0) * 2.5;
      if (level > maxLevel) {
        maxLevel = level;
        maxId = member.id;
      }
    }

    // Hysteresis: keep current dominant unless new speaker is 20% louder
    const prev = dominantSpeakerRef.current;
    if (prev && prev !== maxId && maxLevel > 0) {
      const prevMember = sortedChannelMembers.find(m => m.id === prev);
      if (prevMember) {
        const prevIsMe = prev === currentUser.id;
        const prevSpeaking = prevIsMe
          ? (isPttPressed && !isMuted && !currentUser.isVoiceBanned)
          : !!prevMember.isSpeaking;
        if (prevSpeaking) {
          const prevLevel = prevIsMe ? volumeLevel / 80 : (speakingLevels[prevMember.name] ?? 0) * 2.5;
          // Only switch if new speaker is significantly louder
          if (maxLevel < prevLevel * 1.2) {
            return prev;
          }
        }
      }
    }

    dominantSpeakerRef.current = maxId;
    return maxId;
  }, [sortedChannelMembers, currentUser.id, currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels]);

  return (
    <div className="flex flex-col h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      {/* Header — masaüstünde gizli, mobilde görünür */}
      <header className={`${FORCE_MOBILE ? '' : 'lg:hidden'} flex flex-col bg-[rgba(var(--theme-bg-rgb),0.7)] backdrop-blur-xl border-b border-[rgba(var(--glass-tint),0.04)] z-10 shrink-0`}>
        <div className={`flex items-center justify-between pl-3 sm:pl-6 pr-2 sm:pr-4 ${FORCE_MOBILE ? '' : 'lg:pr-0'} h-14 sm:h-16`}>
          {/* Mobil: sol drawer butonu */}
          <button
            onClick={() => setMobileLeftOpen(true)}
            className={`${FORCE_MOBILE ? '' : 'lg:hidden'} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors mr-1`}
          >
            <Menu size={20} />
          </button>

          <BrandArea />

          <div className="flex items-center h-full gap-1 sm:gap-2">
          {/* Mobil: sağ drawer (kullanıcılar) butonu */}
          <button
            onClick={() => setMobileRightOpen(true)}
            className={`${FORCE_MOBILE ? '' : 'lg:hidden'} p-2 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-sidebar)] transition-colors`}
          >
            <Users size={18} />
          </button>

          <div className={`h-full flex items-center ${FORCE_MOBILE ? '' : 'lg:w-64 lg:px-4'} gap-2 sm:gap-3 group relative cursor-pointer hover:bg-[rgba(var(--glass-tint),0.03)] transition-all duration-200`} onClick={(e) => { e.stopPropagation(); setIsStatusMenuOpen(!isStatusMenuOpen); }}>
            <div className="text-right hidden sm:flex flex-col items-end flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate w-full">{formatFullName(currentUser.firstName, currentUser.lastName)} ({currentUser.age})</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${getStatusColor(getEffectiveStatus())}`}>{getEffectiveStatus()}</p>
            </div>
            <div className="h-10 w-10 overflow-hidden border-2 avatar-squircle relative flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ borderColor: avatarBorderColor }}>
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

      </header>

      <div className={`flex flex-1 min-h-0 overflow-hidden relative ${FORCE_MOBILE ? '' : 'lg:p-3 lg:gap-[6px]'}`}>
        {/* ── Mobil kenar handle'ları — tıkla veya sürükle ile drawer aç ── */}
        {!mobileLeftOpen && !mobileRightOpen && (
          <>
            {/* Sol handle */}
            <div
              className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed left-0 top-1/2 -translate-y-1/2 z-30 flex items-center cursor-pointer touch-none select-none`}
              onClick={() => setMobileLeftOpen(true)}
              onTouchStart={onHandleTouchStart}
              onTouchEnd={makeHandleTouchEnd(() => setMobileLeftOpen(true), 'right')}
            >
              <div className="w-[6px] h-16 rounded-r-full bg-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)]/40 transition-colors flex items-center justify-center">
                <svg width="4" height="10" viewBox="0 0 4 10" fill="none" className="text-[var(--theme-accent)]/50">
                  <path d="M0.5 1L3 5L0.5 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Sağ handle */}
            <div
              className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center cursor-pointer touch-none select-none`}
              onClick={() => setMobileRightOpen(true)}
              onTouchStart={onHandleTouchStart}
              onTouchEnd={makeHandleTouchEnd(() => setMobileRightOpen(true), 'left')}
            >
              <div className="w-[6px] h-16 rounded-l-full bg-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)]/40 transition-colors flex items-center justify-center">
                <svg width="4" height="10" viewBox="0 0 4 10" fill="none" className="text-[var(--theme-accent)]/50">
                  <path d="M3.5 1L1 5L3.5 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </>
        )}

        {/* ── Mobil sol drawer overlay ── */}
        <AnimatePresence>
          {mobileLeftOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-0 bg-black/60 z-40`}
                onClick={() => setMobileLeftOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-y-0 left-0 w-72 bg-[var(--theme-sidebar)] z-50 flex flex-col shadow-2xl`}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  if (!handleSwipeRef.current) return;
                  const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX;
                  const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY);
                  handleSwipeRef.current = null;
                  if (dy < 60 && dx < -40) setMobileLeftOpen(false);
                }}
              >
                <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
                  <div className="flex items-center gap-2 text-[var(--theme-secondary-text)] font-bold">
                    <Volume2 size={16} />
                    <span className="uppercase text-xs tracking-widest">Ses Kanalları</span>
                  </div>
                  <button onClick={() => setMobileLeftOpen(false)} className="p-1.5 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)] transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar" onClick={() => setContextMenu(null)}>
                  {visibleChannels.map(channel => (
                    <div key={channel.id} className="space-y-1">
                      <button
                        onClick={() => { handleJoinChannel(channel.id); setMobileLeftOpen(false); }}
                        disabled={isConnecting}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group disabled:cursor-not-allowed ${
                          activeChannel === channel.id
                            ? `bg-[var(--theme-accent)] text-white shadow-lg shadow-black/20${isConnecting ? ' animate-pulse' : ''}`
                            : 'text-[var(--theme-secondary-text)] hover:bg-[var(--theme-bg)]/50'
                        }`}
                      >
                        <PhoneCall size={16} className="shrink-0" />
                        <span className="text-sm font-semibold truncate">{channel.name}</span>
                        {channel.password && <Lock size={12} className="shrink-0 ml-auto opacity-50" />}
                        {(channel.userCount ?? 0) > 0 && (
                          <span className={`text-[10px] font-bold ml-auto shrink-0 ${activeChannel === channel.id ? 'text-white/60' : 'text-[var(--theme-secondary-text)]/50'}`}>
                            {channel.userCount}
                          </span>
                        )}
                      </button>

                      {/* Members List — allUsers üzerinden ID ile resolve */}
                      {(() => {
                        const memberUsers = (channel.members ?? [])
                          .map(id => allUsers.find(u => u.id === id))
                          .filter(Boolean) as typeof allUsers;
                        if (!memberUsers.length) return null;
                        return (
                          <div className="pl-9 space-y-0.5 pb-2">
                            {memberUsers.map(user => (
                              <div
                                key={user.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (user.id !== currentUser.id) {
                                    handleUserActionClick(e, user.id);
                                  }
                                }}
                                className="flex items-center gap-2 py-1 rounded-lg transition-all cursor-pointer hover:bg-[var(--theme-bg)]/40 px-1"
                              >
                                <div className="relative shrink-0">
                                  <div className="h-6 w-6 overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[8px]">
                                    {user.avatar?.startsWith('http')
                                      ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      : user.avatar}
                                  </div>
                                  <DeviceBadge platform={user.platform} size={11} className="absolute -bottom-0.5 -right-0.5" />
                                </div>
                                <span className="text-[11px] font-medium text-[var(--theme-secondary-text)] truncate flex-1">
                                  {formatFullName(user.firstName, user.lastName)} ({user.age})
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </nav>
                <div className="p-4 border-t border-[var(--theme-border)]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const userRooms = channels.filter(c => c.ownerId === currentUser.id);
                      if (userRooms.length >= 2) {
                        setToastMsg('Aynı anda en fazla 2 oda oluşturabilirsiniz.');
                        return;
                      }
                      setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false });
                      setMobileLeftOpen(false);
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
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Mobil sağ drawer overlay ── */}
        <AnimatePresence>
          {mobileRightOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-0 bg-black/60 z-40`}
                onClick={() => setMobileRightOpen(false)}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed inset-y-0 right-0 w-72 bg-[var(--theme-sidebar)] z-50 flex flex-col shadow-2xl`}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  if (!handleSwipeRef.current) return;
                  const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX;
                  const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY);
                  handleSwipeRef.current = null;
                  if (dy < 60 && dx > 40) setMobileRightOpen(false);
                }}
              >
                <div className="flex items-center justify-between p-4 border-b border-[var(--theme-border)]">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text)]">Kullanıcılar</h3>
                    <span className="text-[10px] bg-[var(--theme-bg)] px-2 py-0.5 rounded-full text-[var(--theme-text)] font-bold">{allUsers.length}</span>
                  </div>
                  <button onClick={() => setMobileRightOpen(false)} className="p-1.5 rounded-lg text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)] transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                  {/* Online */}
                  <div>
                    <p className="text-[10px] font-bold text-[var(--theme-text)] opacity-80 uppercase mb-3 px-2">Çevrimiçi — {onlineUsers.length}</p>
                    <div className="space-y-1">
                      {onlineUsers.map(user => {
                        const isMe = user.id === currentUser.id;
                        return (
                          <div
                            key={user.id}
                            className="flex items-center gap-3 px-2 py-2 rounded-lg transition-colors group hover:bg-[var(--theme-bg)]/50 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                          >
                            <div className="relative shrink-0">
                              <div className="h-9 w-9 overflow-hidden border-2 avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]" style={{ borderColor: isMe ? avatarBorderColor : 'transparent' }}>
                                {user.avatar?.startsWith('http') ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.avatar}
                              </div>
                              {user.isAdmin && adminBorderEffect && (
                                <div className="absolute inset-[-3px] rounded-full ring-2 ring-[var(--theme-accent)]/50 animate-pulse pointer-events-none" />
                              )}
                              <DeviceBadge platform={user.platform} size={13} className="absolute -bottom-0.5 -right-0.5" />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-medium text-[var(--theme-text)] leading-none truncate">{formatFullName(user.firstName, user.lastName)}{user.age ? ` (${user.age})` : ''}</span>
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
                                {(isMe ? isMuted : (!!user.selfMuted || !!user.isMuted)) && <Mic size={8} className="text-red-500 shrink-0" />}
                                {(isMe ? isDeafened : !!user.selfDeafened) && <Headphones size={8} className="text-red-500 shrink-0" />}
                                {user.statusText === 'Telefonda' && <PhoneCall size={8} className="text-red-500" />}
                                <span className={`text-[9px] font-bold uppercase tracking-tight ${getStatusColor(user.statusText || 'Aktif')}`}>{user.statusText}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Offline */}
                  <div>
                    <p className="text-[10px] font-bold text-[var(--theme-text)] opacity-50 uppercase mb-3 px-2">Çevrimdışı — {offlineUsers.length}</p>
                    <div className="space-y-1">
                      {offlineUsers.map(user => (
                        <div
                          key={user.id}
                          className="flex items-center gap-3 px-2 py-2 rounded-lg opacity-60 cursor-pointer hover:bg-[var(--theme-bg)]/50"
                          onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                        >
                          <div className="h-9 w-9 rounded-full bg-[var(--theme-border)]/30 overflow-hidden flex items-center justify-center text-[var(--theme-secondary-text)] font-bold text-[10px]">
                            {user.avatar?.startsWith('http') ? <img src={user.avatar} alt="" className="w-full h-full object-cover grayscale" referrerPolicy="no-referrer" /> : user.avatar}
                          </div>
                          <span className="text-[13px] text-[var(--theme-secondary-text)] truncate">{formatFullName(user.firstName, user.lastName)}{user.age ? ` (${user.age})` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Left Sidebar — sadece masaüstünde sabit görünür */}
        <aside className={`w-60 bg-[rgba(var(--theme-sidebar-rgb),0.08)] backdrop-blur-[20px] rounded-2xl ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} flex-col shrink-0`} style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}>
          {/* Brand */}
          <div className="px-5 pt-4 pb-3 shrink-0">
            <BrandArea />
          </div>
          <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2.5 text-[var(--theme-secondary-text)] font-extrabold mb-4">
              <Volume2 size={14} className="opacity-60" />
              <span className="uppercase text-[10px] tracking-[0.15em]">Ses Kanalları</span>
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
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group disabled:cursor-not-allowed ${
                      activeChannel === channel.id
                        ? `bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20 shadow-[inset_0_0_12px_rgba(var(--theme-accent-rgb),0.08),inset_0_1px_0_rgba(var(--theme-accent-rgb),0.1)]${isConnecting ? ' animate-pulse' : ''}`
                        : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'
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
                        activeChannel === channel.id ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]'
                      }`}>
                        {channel.userCount}
                      </span>
                    )}
                  </button>

                  {/* Members List */}
                  {channel.members && channel.members.length > 0 && (
                    <div className="pl-8 pr-2 space-y-0.5 pb-2 mt-0.5 ml-4 border-l border-[var(--theme-accent)]/10">
                      {channel.members.map((memberId, idx) => {
                        const user = allUsers.find(u => u.id === memberId);
                        return (
                          <div
                            key={idx}
                            draggable={currentUser.isAdmin}
                            onDragStart={(e) => handleDragStart(e, user?.name || memberId)}
                            onClick={(e) => user && handleUserActionClick(e, user.id)}
                            className="flex items-center gap-2 text-[11px] font-medium transition-all duration-150 group/member cursor-pointer text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] py-1 px-1.5 rounded-lg hover:bg-[var(--theme-accent)]/5"
                          >
                            <div className="relative shrink-0">
                              <div className="h-5 w-5 overflow-hidden avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[7px]">
                                {user?.avatar?.startsWith('http')
                                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  : user?.avatar || '?'}
                              </div>
                              {user && <DeviceBadge platform={user.platform} size={10} className="absolute -bottom-0.5 -right-0.5" />}
                            </div>
                            <span className="truncate flex-1">{user ? formatFullName(user.firstName, user.lastName) : memberId}</span>
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

              {/* Oda Oluştur — kanal listesi akışında, son kanal altında */}
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                  channels.filter(c => c.ownerId === currentUser.id).length >= 2
                    ? 'text-[var(--theme-secondary-text)]/40 cursor-not-allowed'
                    : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-accent)]'
                }`}
              >
                <PlusCircle size={18} />
                <span className="text-sm font-medium">Oda Oluştur</span>
              </button>
            </nav>
          </div>

          {/* Sol alt kontroller — Versiyon notları + Sinyal seviyesi */}
          <div className="shrink-0 px-4 py-3 flex items-center justify-center gap-3">
            {appVersion && (
              <UpdateVersionHub
                currentVersion={appVersion}
                isAdmin={currentUser.isAdmin}
                autoShowNotes={showReleaseNotes}
                onNotesShown={() => setShowReleaseNotes(false)}
              />
            )}
            <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />
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
                <div className={`flex flex-col gap-2 p-2 ${activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(userActionMenu.userId) && userActionMenu.userId !== currentUser.id ? 'border-b border-[var(--theme-border)]' : ''}`}>
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

              {activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(userActionMenu.userId) && userActionMenu.userId !== currentUser.id && (() => {
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
        {invitationModal && console.log('[ChatView] modal_render_condition: true, inviter:', invitationModal.inviterName)}
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
                              inviteeName: formatFullName(currentUser.firstName, currentUser.lastName),
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
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
              onClick={() => setRoomModal({ ...roomModal, isOpen: false })}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="w-full max-w-[420px] rounded-2xl border border-[var(--theme-border)]/30 overflow-hidden"
                style={{ background: 'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-bg) 100%)', boxShadow: '0 25px 60px rgba(var(--shadow-base),0.4), 0 0 0 1px rgba(var(--theme-accent-rgb), 0.05)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Top accent line */}
                <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.3), transparent)` }} />

                {/* Header */}
                <div className="px-7 pt-7 pb-0 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: `rgba(var(--theme-accent-rgb), 0.1)`, boxShadow: `0 0 20px rgba(var(--theme-accent-rgb), 0.08)` }}>
                    {roomModal.type === 'create'
                      ? <PlusCircle className="text-[var(--theme-accent)]" size={24} />
                      : <Settings className="text-[var(--theme-accent)]" size={24} />
                    }
                  </div>
                  <h3 className="text-lg font-bold text-[var(--theme-text)]">
                    {roomModal.type === 'create' ? 'Yeni Oda Oluştur' : 'Oda Ayarları'}
                  </h3>
                  <p className="text-[11px] text-[var(--theme-secondary-text)]/50 mt-1.5">
                    {roomModal.type === 'create' ? 'Arkadaşlarınla konuşmak için bir alan oluştur.' : 'Bu odanın ayarlarını düzenleyin.'}
                  </p>
                </div>

                {/* Form */}
                <div className="px-7 pt-5 pb-7">
                  {/* Group A: Temel bilgiler */}
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.1em] mb-1.5">Oda İsmi</label>
                      <input
                        autoFocus
                        type="text"
                        placeholder="ör: Genel Sohbet"
                        className="w-full rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/25"
                        style={{
                          background: 'var(--theme-bg)',
                          border: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
                          boxShadow: 'inset 0 1px 3px rgba(var(--shadow-base),0.1)',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.3)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1), 0 0 0 3px rgba(var(--theme-accent-rgb), 0.06)`; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.08)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(0,0,0,0.1)`; }}
                        value={roomModal.name}
                        onChange={(e) => setRoomModal({ ...roomModal, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRoom();
                          if (e.key === 'Escape') setRoomModal({ ...roomModal, isOpen: false });
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.1em] mb-1.5">Kişi Limiti</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Sınırsız"
                        className="w-full rounded-lg px-3.5 py-2.5 text-sm font-semibold text-[var(--theme-text)] outline-none transition-all placeholder:text-[var(--theme-secondary-text)]/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{
                          background: 'var(--theme-bg)',
                          border: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
                          boxShadow: 'inset 0 1px 3px rgba(var(--shadow-base),0.1)',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.3)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(var(--shadow-base),0.1), 0 0 0 3px rgba(var(--theme-accent-rgb), 0.06)`; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = `rgba(var(--theme-accent-rgb), 0.08)`; e.currentTarget.style.boxShadow = `inset 0 1px 3px rgba(0,0,0,0.1)`; }}
                        value={roomModal.maxUsers}
                        onChange={(e) => setRoomModal({ ...roomModal, maxUsers: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-[9px] text-[var(--theme-secondary-text)]/35 mt-1.5 ml-0.5">Boş veya 0 bırakırsanız sınır olmaz.</p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="my-5 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.08), transparent)` }} />

                  {/* Group B: Gizlilik ayarları */}
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-[var(--theme-text)] leading-tight">Gizli Oda</p>
                        <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-0.5 leading-snug">Kanal listesinde görünmez, sadece davet ile ulaşılır.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={roomModal.isHidden}
                        onClick={() => {
                          const newIsHidden = !roomModal.isHidden;
                          setRoomModal({ ...roomModal, isHidden: newIsHidden, isInviteOnly: newIsHidden ? true : roomModal.isInviteOnly });
                        }}
                        className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${
                          roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                        }`}
                        style={roomModal.isHidden ? { backgroundColor: 'var(--theme-accent)', boxShadow: `0 0 8px rgba(var(--theme-accent-rgb), 0.25)` } : undefined}
                      >
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${roomModal.isHidden ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className={`text-[13px] font-semibold leading-tight ${roomModal.isHidden ? 'text-[var(--theme-secondary-text)]/40' : 'text-[var(--theme-text)]'}`}>Davetle Giriş</p>
                        <p className="text-[10px] text-[var(--theme-secondary-text)]/40 mt-0.5 leading-snug">Sadece davet edilen kullanıcılar katılabilir.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={roomModal.isInviteOnly}
                        disabled={roomModal.isHidden}
                        onClick={() => { if (!roomModal.isHidden) setRoomModal({ ...roomModal, isInviteOnly: !roomModal.isInviteOnly }); }}
                        className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${
                          roomModal.isHidden ? 'opacity-40 cursor-not-allowed' : ''
                        } ${
                          roomModal.isInviteOnly && !roomModal.isHidden ? '' : 'bg-[var(--theme-border)]'
                        }`}
                        style={roomModal.isInviteOnly ? { backgroundColor: 'var(--theme-accent)', boxShadow: roomModal.isHidden ? 'none' : `0 0 8px rgba(var(--theme-accent-rgb), 0.25)` } : undefined}
                      >
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${roomModal.isInviteOnly ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2.5 mt-7">
                    <button
                      onClick={() => setRoomModal({ ...roomModal, isOpen: false })}
                      className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-medium text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-secondary-text)]/80 hover:bg-[var(--theme-border)]/8 transition-all"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSaveRoom}
                      className="flex-[1.5] px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all hover:brightness-110"
                      style={{ backgroundColor: 'var(--theme-accent)', boxShadow: `0 2px 12px rgba(var(--theme-accent-rgb), 0.3)` }}
                    >
                      {roomModal.type === 'create' ? 'Oda Oluştur' : 'Kaydet'}
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

        {/* Main Content — outer shell (no scroll), inner region scrolls with bounded height */}
        <main className={`flex-1 flex flex-col min-h-0 bg-[rgba(var(--theme-sidebar-rgb),0.04)] relative ${FORCE_MOBILE ? '' : 'lg:rounded-2xl lg:backdrop-blur-[12px]'}`} style={{ boxShadow: FORCE_MOBILE ? undefined : '0 4px 24px rgba(0,0,0,0.1), inset 0 1px 0 rgba(var(--glass-tint), 0.02)', border: FORCE_MOBILE ? undefined : '1px solid rgba(var(--glass-tint), 0.03)', backgroundImage: 'radial-gradient(ellipse 50% 35% at 50% 25%, rgba(var(--theme-glow-rgb), 0.025) 0%, rgba(var(--theme-glow-rgb), 0.01) 40%, transparent 65%)' }}>
          {/* Content region */}
          <div
            onDragOver={currentUser.isAdmin ? handleDragOver : undefined}
            onDrop={currentUser.isAdmin ? handleDropToRemove : undefined}
            className={`flex-1 flex flex-col min-h-0 ${FORCE_MOBILE
              ? 'overflow-y-auto custom-scrollbar p-3'
              : `lg:mb-[72px] ${activeChannel && view !== 'settings'
                ? 'px-3 pt-3 sm:px-6 sm:pt-4'
                : 'overflow-y-auto custom-scrollbar p-3 sm:p-8'}`}`}
          >
          {view === 'settings' ? <SettingsView /> : activeChannel ? (
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Ambient background — canlı ama sessiz */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div
                  className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]"
                  style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4) 0%, transparent 65%)` }}
                />
                <div
                  className="absolute bottom-[10%] right-[15%] w-[300px] h-[300px] rounded-full opacity-[0.012]"
                  style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.3) 0%, transparent 70%)` }}
                />
              </div>

              {/* Oda başlığı — sadece mobilde göster, masaüstünde kontroller floating cluster'da */}
              <div className={`relative z-[1] flex items-center justify-between mb-3 sm:mb-6 ${FORCE_MOBILE ? '' : 'lg:hidden'}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center text-[var(--theme-accent)] border border-[var(--theme-accent)]/20 shrink-0">
                    <Volume2 size={18} className="sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-xl font-bold tracking-tight text-[var(--theme-text)] leading-none">
                      {channels.find(c => c.id === activeChannel)?.name || 'Sohbet Odası'}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const next = (cardScale % 3) + 1;
                      setCardScale(next);
                      localStorage.setItem('cardScale', String(next));
                    }}
                    className="p-2 rounded-lg border border-[var(--theme-border)]/40 hover:bg-[var(--theme-accent)]/8 transition-all group/density"
                    title={cardScale === 1 ? 'Kompakt' : cardScale === 2 ? 'Dengeli' : 'Geniş'}
                  >
                    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className="text-[var(--theme-secondary-text)] group-hover/density:text-[var(--theme-accent)] transition-colors">
                      {cardScale === 1 ? (
                        <><rect x="0" y="0" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.7" /><rect x="0" y="5.25" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.5" /><rect x="0" y="10.5" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.3" /></>
                      ) : cardScale === 2 ? (
                        <><rect x="0" y="0.5" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.7" /><rect x="0" y="8" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.45" /></>
                      ) : (
                        <rect x="0" y="0" width="16" height="14" rx="2" fill="currentColor" opacity="0.6" />
                      )}
                    </svg>
                  </button>

                  <button
                    onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }}
                    className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                    title="Odadan Ayrıl"
                  >
                    <PhoneOff size={18} />
                  </button>
                </div>
              </div>

              {/* TEST BUTONU — geçici */}
              <div className="absolute top-2 right-2 z-50 flex items-center gap-1.5">
                <span className="text-[9px] text-[var(--theme-secondary-text)] font-mono">Test: {fakeUserCount}/30</span>
                <button
                  onClick={() => setFakeUserCount(c => Math.min(c + 1, 30))}
                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                >+ Ekle</button>
                <button
                  onClick={() => setFakeUserCount(c => Math.max(c - 1, 0))}
                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                >− Çıkar</button>
                <button
                  onClick={() => setFakeUserCount(0)}
                  className="px-2 py-1 text-[10px] font-bold rounded-lg bg-[rgba(var(--glass-tint),0.08)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.06)]"
                >Sıfırla</button>
              </div>

              {/* Participant area */}
              <div className="relative z-[1] flex-1">
                {(() => {
                  // Gerçek üyeler + fake test kullanıcıları
                  const allMembers = [...sortedChannelMembers, ...fakeUsers];
                  const count = allMembers.length;
                  const s = cardScale;
                  const anySpeaking = allMembers.some(u =>
                    u.id === currentUser.id ? (isPttPressed && !isMuted && !currentUser.isVoiceBanned) : !!u.isSpeaking
                  );

                  // Desktop: sort users — dominant speaker first, then "me", then others
                  const desktopSorted = [...allMembers].sort((a, b) => {
                    const aIsMe = a.id === currentUser.id;
                    const bIsMe = b.id === currentUser.id;
                    const aIsSpeaking = aIsMe ? (isPttPressed && !isMuted && !currentUser.isVoiceBanned) : !!a.isSpeaking;
                    const bIsSpeaking = bIsMe ? (isPttPressed && !isMuted && !currentUser.isVoiceBanned) : !!b.isSpeaking;
                    const aIsDom = aIsSpeaking && a.id === dominantSpeakerId;
                    const bIsDom = bIsSpeaking && b.id === dominantSpeakerId;
                    if (aIsDom !== bIsDom) return aIsDom ? -1 : 1;
                    if (aIsSpeaking !== bIsSpeaking) return aIsSpeaking ? -1 : 1;
                    if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
                    return 0;
                  });

                  const renderCardProps = (user: typeof allMembers[0]) => {
                    const isMe = user.id === currentUser.id;
                    const isSpeakingActive = (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) || (!isMe && !!user.isSpeaking);
                    return {
                      user,
                      isMe,
                      isOwner: currentChannel?.ownerId === user.id,
                      isSpeakingActive,
                      isDominant: isSpeakingActive && user.id === dominantSpeakerId,
                      intensity: getIntensity(user),
                      scale: scaleConfig,
                      adminBorderEffect,
                      isPttPressed,
                      isMuted: isMe ? isMuted : false,
                      isDeafened: isMe ? isDeafened : false,
                      isVoiceBanned: isMe ? !!currentUser.isVoiceBanned : false,
                      volumeLevel,
                      speakingLevel: speakingLevels[user.name] ?? 0,
                      statusTimer: isMe ? statusTimer : null,
                      effectiveStatus: getEffectiveStatus(),
                      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); },
                      onDoubleClick: () => { if (!isMe && currentUser.isAdmin) handleKickUser(user.id); },
                      onContextMenu: (e: React.MouseEvent) => { if (!isMe && currentUser.isAdmin) { e.preventDefault(); if (confirm(`${user.name} odadan çıkarılsın mı?`)) handleKickUser(user.id); } },
                    };
                  };

                  return (
                    <>
                      {/* ── Masaüstü layout ── */}
                      {!FORCE_MOBILE && (
                        <div className="hidden lg:block relative h-full">

                          {/* Kullanıcı kartları — doğal akış */}
                          <div ref={cardsRef} className="px-3 pt-3 pb-1">
                            <RoomNetworkVisualization
                              cardStyle={cardStyle}
                              participants={allMembers.map(user => {
                                const isMe = user.id === currentUser.id;
                                const isSpeakingActive = (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) || (!isMe && !!user.isSpeaking);
                                return {
                                  id: user.id,
                                  name: user.name,
                                  firstName: user.firstName,
                                  lastName: user.lastName,
                                  age: user.age,
                                  avatar: user.avatar,
                                  isSelf: isMe,
                                  isSpeaking: isSpeakingActive,
                                  isMuted: isMe ? isMuted : (!!user.selfMuted || !!user.isMuted),
                                  isDeafened: isMe ? isDeafened : !!user.selfDeafened,
                                  platform: user.platform,
                                  isAdmin: user.isAdmin,
                                  isModerator: user.isModerator,
                                  appVersion: user.appVersion,
                                  adminBorderEffect,
                                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); },
                                  onDoubleClick: () => { if (!isMe && currentUser.isAdmin) handleKickUser(user.id); },
                                  onContextMenu: (e: React.MouseEvent) => { if (!isMe && currentUser.isAdmin) { e.preventDefault(); if (confirm(`${user.name} odadan çıkarılsın mı?`)) handleKickUser(user.id); } },
                                };
                              })}
                            />
                          </div>

                          {/* Sohbet penceresi — absolute, kartların altından en alta kadar */}
                          <div className="absolute left-3 right-3 bottom-0 flex flex-col rounded-2xl overflow-hidden" style={{ top: cardsHeight || '50%', border: '1px solid rgba(var(--glass-tint), 0.05)', borderBottom: 'none', boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.03)' }}>
                            {/* Yazı boyutu ayarı — sağ üst */}
                            <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
                              <button onClick={() => { const v = Math.max(0, chatFontSize - 1); setChatFontSize(v); localStorage.setItem('chatFontSize', String(v)); }} disabled={chatFontSize === 0} className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-[var(--theme-accent)] opacity-40 hover:opacity-70 disabled:opacity-10 transition-opacity" title="Küçült">A-</button>
                              <button onClick={() => { const v = Math.min(5, chatFontSize + 1); setChatFontSize(v); localStorage.setItem('chatFontSize', String(v)); }} disabled={chatFontSize === 5} className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-[var(--theme-accent)] opacity-40 hover:opacity-70 disabled:opacity-10 transition-opacity" title="Büyüt">A+</button>
                            </div>
                            {/* Mesaj listesi — TEK scroll */}
                            <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col relative" style={{ background: 'rgba(0,0,0,0.10)' }}>
                              <div className="flex-1" />
                              {chatMessages.length === 0 ? (
                                <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-20 text-center py-4">Sohbet mesajları burada görünecek</p>
                              ) : chatMessages.map((msg, idx) => {
                                const d = new Date(msg.time);
                                const now = new Date();
                                const isToday = d.toDateString() === now.toDateString();
                                const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
                                const ts = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                                const dateLabel = isToday ? '' : isYesterday ? 'Dün' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                                const isEd = editingMsgId === msg.id;
                                const fs = chatFontSize;
                                const avatarPx = 22 + fs * 2;
                                const isMe = msg.senderId === currentUser.id;
                                const nameColor = isMe ? 'var(--theme-accent)' : getUserColor(msg.senderId);
                                // Tarih ayırıcısı — önceki mesajdan farklı gün mü?
                                const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                                const showDateSep = !prevMsg || new Date(prevMsg.time).toDateString() !== d.toDateString();
                                return (
                                  <React.Fragment key={msg.id}>
                                    {showDateSep && dateLabel && (
                                      <div className="flex items-center gap-3 py-2 my-1">
                                        <div className="flex-1 h-px" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
                                        <span className="text-[9px] font-medium text-[var(--theme-secondary-text)] opacity-30 uppercase tracking-wider">{dateLabel}</span>
                                        <div className="flex-1 h-px" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
                                      </div>
                                    )}
                                    <div className={`flex items-start gap-2 py-1 group/msg ${isMe ? 'flex-row-reverse' : ''}`}>
                                      {/* Avatar */}
                                      <div className="shrink-0 overflow-hidden flex items-center justify-center mt-0.5 avatar-squircle" style={{ width: avatarPx, height: avatarPx, background: `${nameColor}15` }}>
                                        {msg.avatar?.startsWith('http') ? (
                                          <img src={msg.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                          <span className="font-bold" style={{ fontSize: 7 + fs, color: nameColor }}>{msg.avatar || msg.sender?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}</span>
                                        )}
                                      </div>
                                      {/* Mesaj balonu */}
                                      <div className={`flex flex-col max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          <span className="font-semibold truncate max-w-[100px]" style={{ fontSize: 10 + fs, color: nameColor }}>{msg.sender}</span>
                                          <span className="text-[var(--theme-secondary-text)] opacity-25 tabular-nums" style={{ fontSize: 8 + fs }}>{ts}</span>
                                        </div>
                                        {isEd ? (
                                          <input autoFocus type="text" value={editingText} onChange={(e) => setEditingText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEditMessage(); if (e.key === 'Escape') { setEditingMsgId(null); setEditingText(''); } }} onBlur={saveEditMessage} className="w-full bg-[rgba(var(--glass-tint),0.04)] border border-[var(--theme-accent)]/20 rounded-lg px-3 py-1.5 text-[12px] text-[var(--theme-text)] outline-none" />
                                        ) : (
                                          <div className={`rounded-xl px-3 py-1.5 break-words whitespace-pre-wrap ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} style={{ fontSize: 13 + fs, color: 'var(--theme-text)', background: isMe ? 'rgba(var(--theme-accent-rgb), 0.1)' : 'rgba(var(--glass-tint), 0.04)', border: `1px solid ${isMe ? 'rgba(var(--theme-accent-rgb), 0.08)' : 'rgba(var(--glass-tint), 0.03)'}` }}>
                                            {msg.text}
                                          </div>
                                        )}
                                      </div>
                                      {/* Edit/Delete */}
                                      {!isEd && (
                                        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1">
                                          <button onClick={() => startEditMessage(msg)} className="p-1 rounded hover:bg-[var(--theme-accent)]/10 transition-colors" title="Düzenle">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--theme-accent-rgb), 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                          </button>
                                          <button onClick={() => deleteChatMessage(msg.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors" title="Sil">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            {/* Yeni mesajlar butonu */}
                            {newMsgCount > 0 && !isAtBottom && (
                              <button onClick={scrollToBottom} className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-[10px] font-bold transition-all" style={{ background: 'var(--theme-accent)', color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                                ↓ {newMsgCount} yeni mesaj
                              </button>
                            )}
                            {/* Input — shrink-0, sabit */}
                            <div className="shrink-0 flex items-end gap-1.5 px-3 py-2 relative" style={{ background: 'rgba(var(--glass-tint), 0.04)', borderTop: '1px solid rgba(var(--glass-tint), 0.05)' }}>
                              {/* Emoji */}
                              <div ref={emojiRef} className="relative shrink-0">
                                <button onClick={() => setShowEmojiPicker(p => !p)} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] opacity-40 hover:opacity-70 hover:bg-[rgba(var(--glass-tint),0.04)] transition-all" title="Emoji">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                                </button>
                                {showEmojiPicker && (
                                  <div className="absolute bottom-full left-0 mb-1 z-50 rounded-xl shadow-2xl p-2 grid grid-cols-8 gap-1 w-[280px]" style={{ background: 'var(--theme-bg-elevated)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}>
                                    {['😀','😂','😍','🥺','😎','🤔','👍','👎','❤️','🔥','🎉','👋','😅','🙄','💪','🤝','😢','😡','🥳','🫡','✅','❌','⭐','💯','🎵','🎮','☕','💤'].map(e => (
                                      <button key={e} onClick={() => { setChatInput(prev => prev + e); setShowEmojiPicker(false); }} className="w-8 h-8 flex items-center justify-center rounded hover:bg-[rgba(var(--glass-tint),0.06)] text-[16px] transition-colors">{e}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {/* Textarea — Enter gönder, Shift+Enter yeni satır */}
                              <textarea
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                                placeholder={chatMuted && !currentUser.isAdmin && !currentUser.isModerator ? 'Sohbet engellendi' : 'Mesaj yaz...'}
                                disabled={chatMuted && !currentUser.isAdmin && !currentUser.isModerator}
                                rows={1}
                                className="flex-1 bg-[rgba(var(--glass-tint),0.03)] border border-[rgba(var(--glass-tint),0.06)] rounded-lg px-4 py-2 text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none focus:border-[var(--theme-accent)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed resize-none max-h-24 overflow-y-auto"
                                style={{ minHeight: 36 }}
                                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 96) + 'px'; }}
                              />
                              {/* Gönder */}
                              <button onClick={sendChatMessage} disabled={(chatMuted && !currentUser.isAdmin && !currentUser.isModerator) || !chatInput.trim()} className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${chatInput.trim() ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)] opacity-30'} disabled:cursor-not-allowed`}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              </button>
                              {/* Admin/Mod butonları */}
                              {(currentUser.isAdmin || currentUser.isModerator) && (
                                <>
                                  <button onClick={clearAllMessages} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Tüm mesajları sil">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                  </button>
                                  <button onClick={() => setChatMuted(!chatMuted)} className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${chatMuted ? 'text-orange-400 bg-orange-500/15' : 'text-[var(--theme-secondary-text)]/30 hover:text-orange-400 hover:bg-orange-500/10'}`} title={chatMuted ? 'Sohbeti aç' : 'Sohbeti engelle'}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{chatMuted ? <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m4.93 4.93 14.14 14.14"/></> : <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12h6"/></>}</svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                        </div>
                      )}

                      {/* ── Mobil + küçük ekran: klasik grid layout ── */}
                      <div className={`${FORCE_MOBILE ? '' : 'lg:hidden'} grid ${scaleConfig.gridGap} mx-auto w-full ${
                        s === 3
                          ? (count <= 1 ? 'grid-cols-1 max-w-lg' : count <= 4 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
                          : s === 2
                            ? (count <= 1 ? 'grid-cols-1 max-w-md' : count <= 3 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' : 'grid-cols-2 sm:grid-cols-3')
                            : (count <= 1 ? 'grid-cols-1 max-w-sm' : count <= 4 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')
                      }`}>
                        {allMembers.map(user => (
                          <UserCard key={user.id} {...renderCardProps(user)} />
                        ))}
                      </div>

                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="text-center pt-10 pb-2 px-6">
                <div className="relative inline-block mb-6">
                  {/* Focused halo behind icon */}
                  <div className="absolute inset-[-8px] bg-[var(--theme-accent)] rounded-full blur-xl opacity-[0.06]" />
                  <div className="relative w-16 h-16 rounded-2xl bg-[rgba(var(--theme-sidebar-rgb),0.5)] backdrop-blur-xl border border-[rgba(var(--glass-tint),0.06)] flex items-center justify-center shadow-[inset_0_1px_0_0_rgba(var(--glass-tint),0.04)]">
                    <Volume2 size={28} className="text-[var(--theme-accent)] opacity-70" />
                  </div>
                </div>
                <h2 className="text-lg font-bold tracking-wide text-[var(--theme-text)] mb-2">
                  Henüz Bir Odada Değilsiniz
                </h2>
                <p className="text-xs text-[var(--theme-secondary-text)]/55 max-w-[260px] leading-relaxed mx-auto">
                  Sohbete başlamak için sol taraftaki kanallardan birine katılın.
                </p>
              </div>
              <AnnouncementsPanel currentUser={currentUser} />
            </div>
          )}
          </div>{/* end bounded scroll region */}
        </main>

        {/* Right Sidebar */}
        <aside className={`w-56 bg-[rgba(var(--theme-sidebar-rgb),0.08)] backdrop-blur-[20px] rounded-2xl flex-col ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'}`} style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03)', border: '1px solid rgba(var(--glass-tint), 0.04)' }}>
          {/* Profil bloğu */}
          <div
            className="px-4 pt-4 pb-3 shrink-0 flex items-center gap-3 group relative cursor-pointer hover:bg-[rgba(var(--glass-tint),0.02)] rounded-t-2xl transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); setIsStatusMenuOpen(!isStatusMenuOpen); }}
          >
            <div className="h-9 w-9 overflow-hidden border-2 avatar-squircle relative flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ borderColor: avatarBorderColor }}>
              {currentUser.avatar?.startsWith('http')
                ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : currentUser.avatar}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-none truncate">{formatFullName(currentUser.firstName, currentUser.lastName)}</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${getStatusColor(getEffectiveStatus())}`}>{getEffectiveStatus()}</p>
            </div>
            {/* Status & Presence Panel — premium, tema-duyarlı */}
            <AnimatePresence>
              {isStatusMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl z-[100] overflow-hidden"
                  style={{ background: 'var(--theme-bg-elevated)', border: '1px solid rgba(var(--theme-accent-rgb), 0.06)', boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(var(--glass-tint), 0.03)', backdropFilter: 'blur(20px)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* ── Profil header ── */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                    <div className="h-11 w-11 overflow-hidden avatar-squircle flex items-center justify-center shrink-0" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
                      {currentUser.avatar?.startsWith('http')
                        ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        : <span className="text-[var(--theme-text)] font-bold text-sm">{currentUser.avatar}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--theme-text)] truncate leading-tight">{formatFullName(currentUser.firstName, currentUser.lastName)}</p>
                      <p className={`text-[10px] font-medium mt-0.5 ${getStatusColor(getEffectiveStatus())}`}>{getEffectiveStatus()}</p>
                    </div>
                  </div>

                  {/* ── Durum seçenekleri ── */}
                  <div className="px-2.5 py-1.5">
                    {([
                      { status: 'Aktif', icon: '🟢', label: 'Aktif' },
                      { status: 'Telefonda', icon: '📱', label: 'Telefonda' },
                      { status: 'Hemen Geleceğim', icon: '⏳', label: 'Hemen Geleceğim' },
                    ] as const).map(item => {
                      const isActive = getEffectiveStatus() === item.status;
                      return (
                        <button
                          key={item.status}
                          onClick={() => handleSetStatus(item.status)}
                          className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12px] font-medium transition-all duration-150 ${isActive ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text)] opacity-75 hover:opacity-100 hover:bg-[rgba(var(--theme-accent-rgb),0.06)]'}`}
                          style={isActive ? { background: 'rgba(var(--theme-accent-rgb), 0.08)' } : undefined}
                        >
                          <span className="text-[12px] w-5 text-center">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                          {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)]" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="h-px mx-3" style={{ background: 'rgba(var(--theme-accent-rgb), 0.04)' }} />

                  {/* ── Süre ayarı ── */}
                  <div className="px-3.5 py-2.5">
                    <p className="text-[10px] font-medium text-[var(--theme-secondary-text)] opacity-50 mb-2">Süre sonra geleceğim</p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        maxLength={3}
                        placeholder="Dk"
                        className="w-16 shrink-0 rounded-lg px-3 py-[6px] text-[12px] text-[var(--theme-text)] outline-none text-center transition-all focus:border-[var(--theme-accent)]/30"
                        style={{ background: 'rgba(var(--glass-tint), 0.035)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}
                        value={statusTimerInput}
                        onChange={(e) => setStatusTimerInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && statusTimerInput) { handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput)); setStatusTimerInput(''); } }}
                      />
                      <button
                        onClick={() => { if (statusTimerInput) { handleSetStatus(`${statusTimerInput}:00 Sonra Geleceğim`, parseInt(statusTimerInput)); setStatusTimerInput(''); } }}
                        disabled={!statusTimerInput}
                        className="flex-1 py-[6px] btn-primary text-[11px] disabled:opacity-30 disabled:cursor-not-allowed"
                      >Kur</button>
                    </div>
                  </div>

                  <div className="h-px mx-3" style={{ background: 'rgba(var(--theme-accent-rgb), 0.04)' }} />

                  {/* ── Son görülme ── */}
                  <div className="px-3.5 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[var(--theme-text)] opacity-75 leading-tight">Son görülme</p>
                      <p className="text-[9px] text-[var(--theme-secondary-text)] opacity-35 mt-0.5 leading-tight">Kapalıyken diğerleri göremez</p>
                    </div>
                    <button
                      onClick={() => setShowLastSeen(!showLastSeen)}
                      className={`relative w-[36px] h-[20px] rounded-full transition-all duration-200 shrink-0 ${showLastSeen ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.08)]'}`}
                    >
                      <span className={`absolute top-[2px] w-4 h-4 rounded-full transition-transform duration-200 ${showLastSeen ? 'translate-x-[18px] bg-white shadow-sm' : 'translate-x-[2px] bg-[var(--theme-secondary-text)] opacity-50'}`} />
                    </button>
                  </div>

                  {/* ── Presence ── */}
                  {currentUser.onlineSince && (
                    <div className="px-3.5 pb-3">
                      <p className="text-[9px] text-[var(--theme-secondary-text)] opacity-30">
                        {(() => {
                          const mins = Math.floor((Date.now() - currentUser.onlineSince!) / 60000);
                          if (mins < 1) return '< 1 dk\'dır aktif';
                          if (mins < 60) return `${mins} dk'dır aktif`;
                          const h = Math.floor(mins / 60);
                          return `${h} saat${mins % 60 > 0 ? ` ${mins % 60} dk` : ''}'dır aktif`;
                        })()}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]">Kullanıcılar</h3>
            <span className="text-[10px] bg-[var(--theme-accent)]/8 text-[var(--theme-accent)] px-2.5 py-0.5 rounded-full font-bold">{allUsers.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Online */}
            <div>
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/60 uppercase tracking-[0.14em]">Çevrimiçi</span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">{onlineUsers.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/10" />
              </div>
              <div className="space-y-1">
                {onlineUsers.map(user => {
                  const isMe = user.id === currentUser.id;
                  const alreadyInChannel = activeChannel && channels.find(c => c.id === activeChannel)?.members?.includes(user.name);
                  const canInvite = !isMe && activeChannel && !alreadyInChannel;
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 group hover:bg-[rgba(var(--glass-tint),0.05)] cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="h-8 w-8 overflow-hidden border-2 avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]"
                          style={{ borderColor: isMe ? avatarBorderColor : 'transparent' }}
                        >
                          {user.avatar?.startsWith('http')
                            ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : user.avatar}
                        </div>
                        {user.isAdmin && adminBorderEffect && (
                          <div className="absolute inset-[-3px] rounded-full ring-2 ring-[var(--theme-accent)]/50 animate-pulse pointer-events-none" />
                        )}
                        <DeviceBadge platform={user.platform} size={12} className="absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[13px] font-medium text-[var(--theme-text)] leading-none truncate">{formatFullName(user.firstName, user.lastName)}</span>
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
              <button
                type="button"
                onClick={() => { const next = !offlineExpanded; setOfflineExpanded(next); localStorage.setItem('offlineUsersExpanded', String(next)); }}
                className="flex items-center gap-2 w-full mb-3 px-2 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="text-[9px] font-bold text-[var(--theme-secondary-text)]/50 uppercase tracking-[0.14em]">Çevrimdışı</span>
                <span className="text-[9px] bg-[var(--theme-secondary-text)]/8 text-[var(--theme-secondary-text)]/50 px-2 py-0.5 rounded-full font-bold">{offlineUsers.length}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
                <ChevronDown size={11} className={`text-[var(--theme-secondary-text)]/40 transition-transform duration-200 ${offlineExpanded ? '' : '-rotate-90'}`} />
              </button>
              {offlineExpanded && <div className="space-y-1">
                {offlineUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg opacity-50 transition-all duration-200 group hover:opacity-70 hover:bg-[rgba(var(--glass-tint),0.03)] cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                  >
                    <div className="relative">
                      <div
                        className="h-8 w-8 overflow-hidden border-2 avatar-squircle flex items-center justify-center text-[var(--theme-text)] font-bold text-[10px]"
                        style={{ borderColor: user.id === currentUser.id ? avatarBorderColor : 'transparent' }}
                      >
                        {user.avatar?.startsWith('http')
                          ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          : user.avatar}
                      </div>
                      <DeviceBadge platform={user.platform} size={12} className="absolute -bottom-0.5 -right-0.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] font-medium text-[var(--theme-text)] opacity-80 leading-none truncate">{formatFullName(user.firstName, user.lastName)}</span>
                        <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 shrink-0">{user.age}</span>
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
                ))}
              </div>}
            </div>
          </div>

          {/* Sağ alt kontroller — Ayarlar, Bildirim Çanı, Çıkış */}
          <div className="shrink-0 px-3 py-3 flex items-center justify-center gap-2">
            {/* Ayarlar — hover çark dönme + accent renk */}
            <button
              onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
              className={`relative w-10 h-10 flex items-center justify-center transition-colors duration-200 group/settings ${view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]'}`}
              title="Ayarlar"
            >
              <Settings size={16} className={`transition-transform duration-500 ${view === 'settings' ? 'rotate-180' : 'group-hover/settings:rotate-180'}`} />
            </button>

            {/* Bildirim çanı — hover sallanma + accent renk */}
            <button
              onClick={() => { /* TODO: bildirim paneli toggle */ }}
              className="relative w-10 h-10 flex items-center justify-center transition-colors duration-200 text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] group/bell"
              title="Bildirimler"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover/bell:animate-[bell-ring_0.5s_ease-in-out]"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {(passwordResetRequests.length > 0 || inviteRequests.length > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
              )}
            </button>

            {/* Çıkış — her zaman kırmızı */}
            <button
              onClick={() => setLogoutConfirmOpen(true)}
              className="w-10 h-10 flex items-center justify-center transition-colors duration-200 text-red-400 hover:text-red-300"
              title="Çıkış"
            >
              <Power size={16} />
            </button>
          </div>
        </aside>
      </div>

      {/* ── Masaüstü floating kontroller (fixed, scroll-proof) ── */}
      <div className={`${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'} fixed bottom-4 left-1/2 -translate-x-1/2 z-30 items-center gap-1.5 px-3 py-2 rounded-2xl`} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)' }}>
        {/* Mikrofon + ayar */}
        <div className="relative group/mic">
          <button
            onClick={() => {
              if (isAdminMuted) return;
              const isSpecialStatus = currentUser.statusText === 'Telefonda' || currentUser.statusText === 'Hemen Geleceğim' || currentUser.statusText?.includes('Sonra Geleceğim');
              if (isSpecialStatus) { handleSetStatus('Aktif'); return; }
              if (isMuted && isDeafened) setIsDeafened(false);
              setIsMuted(!isMuted);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
              isAdminMuted ? 'bg-orange-500/20 text-orange-400 border border-orange-500/25'
              : isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/25'
              : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
            }`}
            title={isAdminMuted ? 'Susturuldu' : isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
          >
            <Mic size={16} />
          </button>
          <div onClick={(e) => { e.stopPropagation(); setShowInputSettings(!showInputSettings); setShowOutputSettings(false); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center cursor-pointer opacity-0 group-hover/mic:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]">
            <Settings size={8} className="text-[var(--theme-text)]" />
          </div>
          <AnimatePresence>
            {showInputSettings && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--theme-surface-card)] backdrop-blur-xl border border-[var(--theme-surface-card-border)] rounded-xl p-3 shadow-2xl z-50" onClick={(e) => e.stopPropagation()}>
                <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Giriş Cihazı</h4>
                <div className="space-y-1">
                  {inputDevices.map(device => (
                    <button key={device.deviceId} onClick={() => { setSelectedInput(device.deviceId); setShowInputSettings(false); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${selectedInput === device.deviceId ? 'bg-[var(--theme-accent)] text-white' : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]'}`}>
                      <span className="truncate">{device.label || `Mikrofon ${device.deviceId.slice(0, 5)}`}</span>
                      {selectedInput === device.deviceId && <Check size={12} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Kulaklık + ayar */}
        <div className="relative group/hp">
          <button
            onClick={() => {
              const isSpecialStatus = currentUser.statusText === 'Telefonda' || currentUser.statusText === 'Hemen Geleceğim' || currentUser.statusText?.includes('Sonra Geleceğim');
              if (isSpecialStatus) { setIsDeafened(false); return; }
              setIsDeafened(!isDeafened);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
              isDeafened ? 'bg-red-500/20 text-red-400 border border-red-500/25' : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'
            }`}
            title={isDeafened ? 'Sağırlığı kaldır' : 'Hoparlörü kapat'}
          >
            <Headphones size={16} />
          </button>
          <div onClick={(e) => { e.stopPropagation(); setShowOutputSettings(!showOutputSettings); setShowInputSettings(false); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[rgba(var(--glass-tint),0.15)] flex items-center justify-center cursor-pointer opacity-0 group-hover/hp:opacity-100 transition-opacity hover:bg-[rgba(var(--glass-tint),0.25)]">
            <Settings size={8} className="text-[var(--theme-text)]" />
          </div>
          <AnimatePresence>
            {showOutputSettings && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--theme-surface-card)] backdrop-blur-xl border border-[var(--theme-surface-card-border)] rounded-xl p-3 shadow-2xl z-50" onClick={(e) => e.stopPropagation()}>
                <h4 className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-widest mb-2">Çıkış Cihazı</h4>
                <div className="space-y-1">
                  {outputDevices.map(device => (
                    <button key={device.deviceId} onClick={() => { setSelectedOutput(device.deviceId); setShowOutputSettings(false); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${selectedOutput === device.deviceId ? 'bg-[var(--theme-accent)] text-white' : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]'}`}>
                      <span className="truncate">{device.label || `Hoparlör ${device.deviceId.slice(0, 5)}`}</span>
                      {selectedOutput === device.deviceId && <Check size={12} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Gürültü Susturma */}
        <button onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${isNoiseSuppressionEnabled ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25' : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.06)]'}`} title={isNoiseSuppressionEnabled ? 'Gürültü Susturma: Açık' : 'Gürültü Susturma: Kapalı'}>
          {isNoiseSuppressionEnabled ? <Shield size={16} /> : <ShieldOff size={16} />}
        </button>
        {/* PTT tuşu */}
        <button onClick={() => setIsListeningForKey(true)} className={`min-w-10 h-10 px-2.5 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 text-[10px] font-black whitespace-nowrap ${isListeningForKey ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] border border-[var(--theme-accent)]/30 animate-pulse' : 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border border-[var(--theme-accent)]/25'}`} title="Bas-Konuş tuşu">
          {isListeningForKey ? '...' : pttKey}
        </button>
        {/* Oda kontrolleri — sadece odadayken */}
        {activeChannel && view !== 'settings' && (
          <>
            <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
            <button
              onClick={cycleCardStyle}
              className="w-10 h-10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
              style={{
                borderRadius: cardStyle === 'revolt' ? 8 : cardStyle === 'linear' ? 12 : cardStyle === 'apple' ? 14 : 12,
                background: cardStyle === 'revolt'
                  ? 'rgba(var(--theme-bg-rgb), 0.85)'
                  : cardStyle === 'linear'
                    ? 'rgba(var(--theme-bg-rgb), 0.75)'
                    : cardStyle === 'apple'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(var(--glass-tint), 0.025)',
                border: cardStyle === 'linear'
                  ? '1px solid rgba(var(--theme-accent-rgb), 0.12)'
                  : cardStyle === 'apple'
                    ? '1px solid rgba(255,255,255,0.1)'
                    : '1px solid rgba(var(--glass-tint), 0.06)',
                boxShadow: cardStyle === 'linear'
                  ? '0 2px 8px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.06)',
                backdropFilter: cardStyle === 'apple' ? 'blur(12px)' : undefined,
                transition: 'all 0.2s ease',
              }}
              title={`Görünüm: ${CARD_STYLES.find(s => s.key === cardStyle)?.label}`}
            >
              {/* Stil ikonu — her stil için benzersiz mini şekil */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                {cardStyle === 'current' ? (
                  /* Varsayılan: basit yuvarlatılmış kare */
                  <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" className="text-[var(--theme-secondary-text)]" />
                ) : cardStyle === 'revolt' ? (
                  /* Revolt: keskin köşeli çift çerçeve */
                  <><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" opacity="0.5" /><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.3" /></>
                ) : cardStyle === 'linear' ? (
                  /* Linear: iç glow efektli elmas */
                  <><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" /><circle cx="8" cy="8" r="2.5" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.5" /><circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="0.8" className="text-[var(--theme-accent)]" opacity="0.25" /></>
                ) : (
                  /* Apple: soft rounded square + iç blur hissi */
                  <><rect x="2" y="2" width="12" height="12" rx="4" stroke="currentColor" strokeWidth="1.2" className="text-[var(--theme-accent)]" opacity="0.6" /><rect x="4.5" y="4.5" width="7" height="7" rx="2.5" fill="currentColor" className="text-[var(--theme-accent)]" opacity="0.15" /></>
                )}
              </svg>
            </button>
            <button onClick={async () => { await disconnectFromLiveKit(); setActiveChannel(null); }} className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500 hover:text-white" title="Odadan Ayrıl">
              <PhoneOff size={16} />
            </button>
          </>
        )}
        {/* Ayarlardayken ana sayfa butonu */}
        {view === 'settings' && (
          <>
            <div className="w-px h-6 bg-[rgba(var(--glass-tint),0.08)] mx-0.5" />
            <button onClick={() => setView('chat')} className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 bg-[rgba(var(--glass-tint),0.07)] text-[var(--theme-secondary-text)] border border-[rgba(var(--glass-tint),0.08)] hover:text-[var(--theme-text)]" title="Ana Sayfa">
              <Home size={16} />
            </button>
          </>
        )}
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
              currentAppVersion={appVersion}
            />
          );
        })()}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
           FOOTER — Masaüstü: 3 bölüm (hoparlör/mikrofon | PTT | ayarlar)
                     Mobil: kompakt kontrol çubuğu + büyük PTT butonu
         ═══════════════════════════════════════════════════════════════════ */}

      {/* ── Mobil footer ── */}
      <footer className={`${FORCE_MOBILE ? '' : 'lg:hidden'} bg-[var(--theme-sidebar)] shrink-0 pb-[env(safe-area-inset-bottom)]`}>
        {/* Mobil ses giriş butonu — PTT veya VAD moduna göre */}
        {activeChannel && view !== 'settings' && (() => {
          const pttDisabled = isMuted || isAdminMuted || !!currentUser.isVoiceBanned;
          const isVad = voiceMode === 'vad';

          const pttLabel = isAdminMuted
            ? (muteRemaining ?? 'Susturuldu')
            : isMuted
              ? 'Mikrofon Kapalı'
              : currentUser.isVoiceBanned
                ? 'Ses Yasağı'
                : isVad
                  ? (isPttPressed ? 'Konuşuyorsun' : 'Ses Algılama Aktif')
                  : isPttPressed
                    ? 'Konuşuyorsun'
                    : 'Basılı Tut — Konuş';

          if (isVad) {
            // ── VAD modu: otomatik ses algılama göstergesi ──
            return (
              <div className="flex flex-col items-center pt-3 pb-1 px-4 gap-2">
                <div
                  onClick={() => { if (!pttDisabled) setVadSliderOpen(p => !p); }}
                  className={`relative w-full max-w-xs rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer ${pttDisabled ? 'opacity-50' : ''}`}
                >
                  <div className={`absolute inset-0 rounded-2xl transition-all duration-200 ${
                    pttDisabled
                      ? 'bg-[var(--theme-border)]/20 border border-[var(--theme-border)]/30'
                      : isPttPressed
                        ? 'bg-[var(--theme-accent)] shadow-[0_0_25px_rgba(var(--theme-accent-rgb),0.4)]'
                        : 'bg-emerald-500/10 border border-emerald-500/25'
                  }`} />
                  {isPttPressed && !pttDisabled && (
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/50 ring-offset-2 ring-offset-[var(--theme-sidebar)]" />
                  )}
                  <div className="relative z-10 py-4 px-6">
                    <div className="flex items-center justify-center gap-3">
                      <Mic size={20} strokeWidth={2.5} className={`transition-all ${
                        pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-emerald-400'
                      }`} />
                      <span className={`font-bold text-[13px] tracking-wide transition-all ${
                        pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-emerald-400'
                      }`}>
                        {pttLabel}
                      </span>
                    </div>
                    {/* Ses seviyesi çubukları */}
                    {!pttDisabled && (
                      <div className="flex items-end justify-center gap-[3px] mt-3 h-4">
                        {[...Array(7)].map((_, i) => {
                          const base = volumeLevel > 0 ? Math.max(0.2, Math.min(1, volumeLevel / 80)) : 0.15;
                          const h = i % 2 === 0 ? base * 1.1 : base * 0.85;
                          return (
                            <div
                              key={i}
                              className={`w-[3px] rounded-full origin-bottom transition-all duration-150 ${
                                isPttPressed ? 'bg-white/80' : 'bg-emerald-400/40'
                              }`}
                              style={{ height: `${Math.min(100, h * 100)}%` }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                {/* Hassasiyet slider — butona tıklayınca açılır */}
                {vadSliderOpen && !pttDisabled && (
                  <div className="flex items-center gap-3 w-full max-w-xs px-2 py-1 rounded-xl bg-[var(--theme-sidebar)]/80 border border-[var(--theme-border)]/20">
                    <span className="text-[10px] text-[var(--theme-secondary-text)]/60 shrink-0">Hassasiyet</span>
                    <input
                      type="range"
                      min={5}
                      max={50}
                      value={noiseThreshold}
                      onChange={(e) => { setNoiseThreshold(parseInt(e.target.value)); setAudioProfile('custom'); }}
                      className="flex-1 h-1 accent-emerald-400 rounded-full"
                    />
                    <span className="text-[10px] text-emerald-400 font-bold w-5 text-right shrink-0">{noiseThreshold}</span>
                  </div>
                )}
              </div>
            );
          }

          // ── PTT modu: basılı tut konuş ──
          return (
            <div className="flex items-center justify-center pt-3 pb-1 px-4">
              <button
                onPointerDown={(e) => {
                  if (pttDisabled) return;
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setIsPttPressed(true);
                }}
                onPointerUp={(e) => {
                  if (pttDisabled) return;
                  (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                  setIsPttPressed(false);
                }}
                onPointerCancel={() => { if (!pttDisabled) setIsPttPressed(false); }}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative w-full max-w-xs select-none touch-none transition-all duration-150 rounded-2xl overflow-hidden ${
                  pttDisabled
                    ? 'opacity-50'
                    : isPttPressed
                      ? 'scale-[0.97]'
                      : 'scale-100'
                }`}
              >
                <div className={`absolute inset-0 transition-all duration-150 rounded-2xl ${
                  pttDisabled
                    ? 'bg-[var(--theme-border)]/20 border border-[var(--theme-border)]/30'
                    : isPttPressed
                      ? 'bg-[var(--theme-accent)] shadow-[0_0_30px_rgba(var(--theme-accent-rgb),0.5)]'
                      : 'bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/25'
                }`} />
                {isPttPressed && !pttDisabled && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--theme-accent)]/60 ring-offset-2 ring-offset-[var(--theme-sidebar)]" />
                )}
                <div className="relative z-10 py-5 px-6">
                  <div className="flex items-center justify-center gap-3">
                    <Mic size={22} strokeWidth={2.5} className={`transition-all duration-150 ${
                      pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-[var(--theme-accent)]'
                    }`} />
                    <span className={`font-bold text-[14px] tracking-wide transition-all duration-150 ${
                      pttDisabled ? 'text-[var(--theme-secondary-text)]/50' : isPttPressed ? 'text-white' : 'text-[var(--theme-accent)]'
                    }`}>
                      {pttLabel}
                    </span>
                  </div>
                  {isPttPressed && !pttDisabled && (
                    <div className="flex items-center justify-center gap-[3px] mt-3 h-4">
                      {[...Array(7)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{ scaleY: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
                          className="w-[3px] h-full bg-white/80 rounded-full origin-center"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })()}

        {/* Mobil kontrol çubuğu */}
        <div className="flex items-center justify-around px-3 py-2.5 border-t border-[var(--theme-border)]/20">
          {/* Hoparlör */}
          <button
            onClick={() => {
              const isSpecialStatus = currentUser.statusText === 'Telefonda' || currentUser.statusText === 'Hemen Geleceğim' || currentUser.statusText?.includes('Sonra Geleceğim');
              if (isSpecialStatus) setIsDeafened(false);
              else setIsDeafened(!isDeafened);
            }}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
              isDeafened ? 'bg-red-500/20 text-red-400' : 'text-[var(--theme-secondary-text)]'
            }`}
          >
            <Headphones size={18} />
            <span className="text-[9px] font-bold">{isDeafened ? 'Kapalı' : 'Hoparlör'}</span>
          </button>

          {/* Mikrofon */}
          <button
            onClick={() => {
              if (isAdminMuted) return;
              const isSpecialStatus = currentUser.statusText === 'Telefonda' || currentUser.statusText === 'Hemen Geleceğim' || currentUser.statusText?.includes('Sonra Geleceğim');
              if (isSpecialStatus) handleSetStatus('Aktif');
              else { if (isMuted && isDeafened) setIsDeafened(false); setIsMuted(!isMuted); }
            }}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
              isAdminMuted ? 'bg-orange-600/20 text-orange-400 cursor-not-allowed'
              : isMuted ? 'bg-red-500/20 text-red-400'
              : 'text-[var(--theme-secondary-text)]'
            }`}
          >
            <Mic size={18} />
            <span className="text-[9px] font-bold">{isAdminMuted ? (muteRemaining ?? 'Susturuldu') : isMuted ? 'Kapalı' : 'Mikrofon'}</span>
          </button>

          {/* Bağlantı */}
          <div className="flex flex-col items-center gap-0.5 p-2 min-w-[52px]">
            <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />
            {FORCE_MOBILE && <MobileUpdateHub currentVersion={appVersion} isAdmin={currentUser.isAdmin} autoShowNotes={showReleaseNotes} onNotesShown={() => setShowReleaseNotes(false)} />}
          </div>

          {/* Ayarlar */}
          <button
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all min-w-[52px] ${
              view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'
            }`}
          >
            <span className="relative">
              <Settings size={18} />
              {(passwordResetRequests.length > 0 || inviteRequests.length > 0) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
              )}
            </span>
            <span className="text-[9px] font-bold">Ayarlar</span>
          </button>

          {/* Çıkış */}
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex flex-col items-center gap-0.5 p-2 rounded-xl text-[var(--theme-secondary-text)] hover:text-red-400 transition-all min-w-[52px]"
          >
            <Power size={18} />
            <span className="text-[9px] font-bold">Çıkış</span>
          </button>
        </div>
      </footer>

      {/* ── Masaüstü footer — artık kullanılmıyor, kontroller sidebar ve floating cluster'a taşındı ── */}
      <footer className="hidden">
        <div className="w-60 px-4 flex gap-2 h-full items-center">
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
              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-all duration-200 ${
                isDeafened
                  ? 'bg-red-500/20 text-red-400 border border-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                  : 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] border border-[var(--theme-accent)]/30 shadow-[0_0_12px_rgba(var(--theme-accent-rgb),0.15)]'
              }`}
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
                  className="absolute bottom-full left-0 mb-2 w-64 bg-[rgba(var(--theme-bg-rgb),0.85)] backdrop-blur-xl border border-[rgba(var(--glass-tint),0.08)] rounded-xl p-3 shadow-2xl z-50"
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
                if (isAdminMuted) return;
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
              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-all duration-200 ${
                isAdminMuted
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/25 shadow-[0_0_12px_rgba(249,115,22,0.15)] cursor-not-allowed'
                  : isMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/25 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                    : 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] border border-[var(--theme-accent)]/30 shadow-[0_0_12px_rgba(var(--theme-accent-rgb),0.15)]'
              }`}
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
                  className="absolute bottom-full left-0 mb-2 w-64 bg-[rgba(var(--theme-bg-rgb),0.85)] backdrop-blur-xl border border-[rgba(var(--glass-tint),0.08)] rounded-xl p-3 shadow-2xl z-50"
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
          <div className="flex items-center gap-4 bg-[rgba(var(--theme-bg-rgb),0.6)] backdrop-blur-xl px-5 py-2.5 rounded-xl border border-[rgba(var(--glass-tint),0.08)] shadow-[inset_0_1px_0_0_rgba(var(--glass-tint),0.04),0_4px_16px_-2px_rgba(var(--theme-glow-rgb),0.08),0_1px_4px_rgba(var(--shadow-base),0.12)]">
            <div className="flex items-center gap-2 text-[var(--theme-text)]/90 font-bold text-[10px] uppercase tracking-widest shrink-0">
              <button
                onClick={() => setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled)}
                className={`p-1 rounded-md transition-all duration-200 ${
                  isNoiseSuppressionEnabled
                    ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]'
                    : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-secondary-text)]'
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
                        ? 'bg-[var(--theme-accent)] shadow-[0_0_6px_rgba(var(--theme-accent-rgb),0.5)]'
                        : 'bg-[rgba(var(--glass-tint),0.12)]'
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
                className={`px-3 py-1 rounded-md text-[10px] font-black transition-all duration-200 ${
                  isListeningForKey
                    ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] shadow-[0_0_12px_rgba(var(--theme-accent-rgb),0.25)] animate-pulse border border-[var(--theme-accent)]/30'
                    : 'bg-[rgba(var(--glass-tint),0.08)] text-[var(--theme-text)]/70 hover:bg-[rgba(var(--glass-tint),0.12)] border border-[rgba(var(--glass-tint),0.06)]'
                }`}
              >
                {isListeningForKey ? '...' : pttKey}
              </button>
            </div>
            {appVersion && !FORCE_MOBILE && (
              <div className="relative border-l border-[rgba(var(--glass-tint),0.08)] pl-3 ml-1">
                <UpdateVersionHub
                  currentVersion={appVersion}
                  isAdmin={currentUser.isAdmin}
                  autoShowNotes={showReleaseNotes}
                  onNotesShown={() => setShowReleaseNotes(false)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="w-56 px-4 flex items-center justify-evenly h-full">
          <ConnectionQualityIndicator connectionLevel={connectionLevel} isConnecting={isConnecting} isActive={!!activeChannel} />

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
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex items-center gap-1.5 text-[var(--theme-secondary-text)] hover:text-red-400 transition-all font-bold text-[10px] uppercase tracking-widest group"
          >
            <Power size={16} />
            Çıkış
          </button>
        </div>
      </footer>

      {/* Çıkış onay modalı */}
      <ConfirmModal
        isOpen={logoutConfirmOpen}
        title="Çıkış yapmak istiyor musun?"
        description="Hesabından çıkış yapacaksın. Tekrar giriş yapman gerekecek."
        confirmText="Çıkış Yap"
        cancelText="İptal"
        danger
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          // Mobilde haptic feedback
          try { navigator.vibrate?.(300); } catch {}
          handleLogout();
        }}
      />
    </div>
  );
}
