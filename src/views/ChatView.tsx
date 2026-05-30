import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Sparkles,
  Volume2,
  PhoneOff,
  X,
  Lock,
  Power,
  Headphones,
  Radio,
  Compass,
  Timer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPublicDisplayName, getPublicNickname } from '../lib/formatName';
import { sendRealtimeBroadcast, setRoomChatMuted, subscribeRealtimeEvents } from '../lib/chatService';
import { logMemberIdentityDebug, resolveUserByMemberKey } from '../lib/memberIdentity';
import { useAppState } from '../contexts/AppStateContext';
import { useAudio } from '../contexts/AudioContext';
import { useUser } from '../contexts/UserContext';
import { useChannel } from '../contexts/ChannelContext';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../contexts/SettingsCtx';
import type { SearchResult } from '../components/SocialSearchHub';
import { startInviteRingtone, stopInviteRingtone, INVITE_RING_DURATION_MS } from '../lib/sounds';
import { playReject } from '../lib/audio/SoundManager';
import { setSoundChatRoomActive } from '../lib/soundRoomPreference';
import { dismissInviteNotification } from '../lib/notifications';
import { handleServerRestricted, handleServerUnrestricted } from '../features/notifications/notificationService';
import { pushInformational } from '../features/notifications/informationalStore';
import { type CardStyle, loadCardStyle, saveCardStyle } from '../components/chat/cardStyles';
import DeviceBadge from '../components/chat/DeviceBadge';
import { useConfirm } from '../contexts/ConfirmContext';
import ToastContainer from '../features/notifications/ToastContainer';
import { useNotificationContextSync } from '../features/notifications/useNotificationContextSync';
import { registerHandlers as registerNotifHandlers } from '../features/notifications/notificationService';
import { useIsUserSpeaking } from '../features/notifications/useIsUserSpeaking';
import { useWindowActivity } from '../hooks/useWindowActivity';
import { getRoomModeConfig } from '../lib/roomModeConfig';
import { applyLocalChannelOrder } from '../lib/channelOrder';
import { applyLocalChannelIconColors, getChannelIconColor, getDefaultChannelIconColor } from '../lib/channelIconColor';
import { applyLocalChannelIcons, getChannelIconName, getDefaultChannelIconName } from '../lib/channelIcon';
import MobileHeader from '../components/MobileHeader';
import type { RoomMemberMenuCtx } from '../features/chatview/components/RoomMemberContextMenu';
import { ROLE_HIERARCHY, type ServerRole } from '../lib/permissionBundles';
import { NotificationBadge } from '../components/notifications';
import { useNotificationCenter } from '../hooks/useNotificationCenter';
import { useIncomingInvites } from '../hooks/useIncomingInvites';
import { useJoinRequestNotifications } from '../hooks/useJoinRequestNotifications';
import { useMyPendingJoinRequests } from '../hooks/useMyPendingJoinRequests';

// Feature imports
import { useChatMessages } from '../features/chatview/hooks/useChatMessages';
import { useRoomActivityLog } from '../features/chatview/hooks/useRoomActivityLog';
import { useDominantSpeaker } from '../features/chatview/hooks/useDominantSpeaker';
import { useRoomMusic } from '../features/chatview/hooks/useRoomMusic';
import RoomStatusBadges from '../features/chatview/components/RoomStatusBadges';
import type { MobileShellView } from '../features/mobile/MobileAppShell';
import { channelIconComponents, roomModeIcons, FORCE_MOBILE } from '../features/chatview/constants';
import { Coffee } from 'lucide-react';
import InactivityCountdownBanner from '../features/chatview/components/InactivityCountdownBanner';
import { registerE2eeDeviceKey } from '../lib/e2ee';
import AvatarContent from '../components/AvatarContent';
import { getFrameTier, getFrameStyle, getFrameClassName } from '../lib/avatarFrame';
import { hasCustomAvatar } from '../lib/statusAvatar';
import appLogo from '../assets/dock-logo-mv_tr.png';

import type { User, VoiceChannel } from '../types';
import { listMyServers, createServer, joinServer, leaveServer, previewSlug, getServerChannels, getMembers, clearRoomActivityEvents, type Server, type ServerMember } from '../lib/serverService';
import { getUserRoomLimit, roomLimitMessage } from '../lib/planConfig';
import { canCreateServer as canUserCreateServer } from '../lib/serverCreationPermission';
import { getPlanVisual } from '../lib/planStyles';
import { PLAN_LIMITS, PLAN_TAGLINE, planFeatureList, calcPersistentRoomsRemaining, type PlanKey } from '../lib/planLimits';
import { getUserRoleBadge } from '../components/RoleBadge';

// Android/tablet production UI. Do not gate this behind preview env flags.
const ENABLE_MOBILE_SHELL_V1 = FORCE_MOBILE;
const loadSettingsView = () => import('./SettingsView');
const loadDMPanel = () => import('../components/DMPanel');
const loadServerSettings = () => import('../components/server/ServerSettings');
const loadChatViewRoomModal = () => import('../features/chatview/components/ChatViewRoomModal');
const loadChatViewPasswordModal = () => import('../features/chatview/components/ChatViewPasswordModal');
const loadUserProfilePopup = () => import('../components/UserProfilePopup');
const loadSocialSearchHub = () => import('../components/SocialSearchHub');
const loadFriendsSidebarContent = () => import('../components/FriendsSidebarContent');
const loadRoomActivityLogPanel = () => import('../features/chatview/components/RoomActivityLogPanel');
const loadRoomMusicPanel = () => import('../components/room-music/RoomMusicPanel');
const loadAnnouncementsPanel = () => import('../components/AnnouncementsPanel');
const loadVoiceParticipants = () => import('../components/VoiceParticipants');
const loadNotificationBell = () => import('../components/notifications/NotificationBell');
const loadDesktopDock = () => import('../features/chatview/components/DesktopDock');
const loadChatViewContextMenu = () => import('../features/chatview/components/ChatViewContextMenu');
const loadChatViewUserActionMenu = () => import('../features/chatview/components/ChatViewUserActionMenu');
const loadRoomMemberContextMenu = () => import('../features/chatview/components/RoomMemberContextMenu');
const loadConnectionQualityIndicator = () => import('../components/chat/ConnectionQualityIndicator');
const loadMobileFooter = () => import('../features/chatview/components/MobileFooter');
const loadLeftSidebar = () => import('../features/chatview/components/LeftSidebar');
const loadMobileAppShell = () => import('../features/mobile/MobileAppShell');
const loadMobileChannelSheet = () => import('../features/mobile/MobileChannelSheet');
const loadMobileSocialSheet = () => import('../features/mobile/MobileSocialSheet');
const loadMobileDiscoverScreen = () => import('../features/mobile/MobileDiscoverScreen');
const loadMobileNotificationsScreen = () => import('../features/mobile/MobileNotificationsScreen');
const loadMobileProfileScreen = () => import('../features/mobile/MobileProfileScreen');
const loadMobileSocialScreen = () => import('../features/mobile/MobileSocialScreen');
const SettingsView = React.lazy(loadSettingsView);
const DMPanel = React.lazy(loadDMPanel);
const ServerSettings = React.lazy(loadServerSettings);
const UserProfilePopup = React.lazy(loadUserProfilePopup);
const SocialSearchHub = React.lazy(loadSocialSearchHub);
const FriendsSidebarContent = React.lazy(loadFriendsSidebarContent);
const RoomActivityLogPanel = React.lazy(loadRoomActivityLogPanel);
const RoomMusicPanel = React.lazy(loadRoomMusicPanel);
const AnnouncementsPanel = React.lazy(loadAnnouncementsPanel);
const VoiceParticipants = React.lazy(loadVoiceParticipants);
const NotificationBell = React.lazy(loadNotificationBell);
const DesktopDock = React.lazy(loadDesktopDock);
const ChatViewContextMenu = React.lazy(loadChatViewContextMenu);
const ChatViewUserActionMenu = React.lazy(loadChatViewUserActionMenu);
const RoomMemberContextMenu = React.lazy(loadRoomMemberContextMenu);
const ConnectionQualityIndicator = React.lazy(loadConnectionQualityIndicator);
const MobileFooter = React.lazy(loadMobileFooter);
const LeftSidebar = React.lazy(loadLeftSidebar);
const MobileAppShell = React.lazy(loadMobileAppShell);
const MobileChannelSheet = React.lazy(loadMobileChannelSheet);
const MobileSocialSheet = React.lazy(loadMobileSocialSheet);
const MobileDiscoverScreen = React.lazy(loadMobileDiscoverScreen);
const MobileNotificationsScreen = React.lazy(loadMobileNotificationsScreen);
const MobileProfileScreen = React.lazy(loadMobileProfileScreen);
const MobileSocialScreen = React.lazy(loadMobileSocialScreen);

const DiscoverPanel = React.lazy(() => import('../components/server/DiscoverPanel'));
const JoinServerModal = React.lazy(() => import('../components/server/JoinServerModal'));
const ChannelAccessModal = React.lazy(() => import('../components/server/ChannelAccessModal'));
const IncomingInvitesModal = React.lazy(() => import('../components/server/IncomingInvitesModal'));
const RestrictedServerScreen = React.lazy(() => import('../components/RestrictedServerScreen'));
const InvitationModal = React.lazy(() => import('../features/chatview/components/InvitationModal'));
const ChatViewRoomModal = React.lazy(loadChatViewRoomModal);
const ChatViewPasswordModal = React.lazy(loadChatViewPasswordModal);
const UpdateVersionHub = React.lazy(() => import('../features/update/components/UpdateVersionHub'));

export function preloadMobileHomeChunks() {
  if (!FORCE_MOBILE) return;
  void loadMobileAppShell();
  void loadMobileChannelSheet();
  void loadMobileSocialSheet();
  void loadMobileSocialScreen();
  void loadConnectionQualityIndicator();
}

function scheduleLazyPanelPreload() {
  if (typeof window === 'undefined') return () => undefined;
  const timers: number[] = [];
  const idleCallbacks: number[] = [];
  const schedule = (task: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(task, { timeout: FORCE_MOBILE ? 2600 : 1500 });
        idleCallbacks.push(idleId);
      } else {
        task();
      }
    }, delay);
    timers.push(id);
  };
  if (FORCE_MOBILE) {
    preloadMobileHomeChunks();
    schedule(() => { void loadConnectionQualityIndicator(); }, 2400);
    schedule(() => { void loadMobileProfileScreen(); }, 8000);
    return () => {
      timers.forEach(id => window.clearTimeout(id));
      if ('cancelIdleCallback' in window) idleCallbacks.forEach(id => window.cancelIdleCallback(id));
    };
  }
  schedule(() => { void loadLeftSidebar(); }, 250);
  schedule(() => { void loadMobileFooter(); }, 300);
  schedule(() => { void loadDesktopDock(); }, 400);
  schedule(() => { void loadConnectionQualityIndicator(); }, 650);
  schedule(() => { void loadDMPanel(); }, 900);
  schedule(() => { void loadSettingsView(); }, 1300);
  schedule(() => { void loadChatViewRoomModal(); }, 1700);
  schedule(() => { void loadChatViewPasswordModal(); }, 1900);
  schedule(() => { void loadChatViewContextMenu(); }, 2050);
  schedule(() => { void loadChatViewUserActionMenu(); }, 2125);
  schedule(() => { void loadRoomMemberContextMenu(); }, 2200);
  schedule(() => { void loadServerSettings(); }, 2200);
  schedule(() => { void loadNotificationBell(); }, 2400);
  schedule(() => { void loadAnnouncementsPanel(); }, 2600);
  schedule(() => { void loadVoiceParticipants(); }, 3200);
  return () => {
    timers.forEach(id => window.clearTimeout(id));
    if ('cancelIdleCallback' in window) idleCallbacks.forEach(id => window.cancelIdleCallback(id));
  };
}

function LazyPanelFallback({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-2xl text-[11px] font-semibold text-[var(--theme-secondary-text)]/55">
      {label}...
    </div>
  );
}

export default function ChatView() {
  const { currentUser, setCurrentUser, allUsers, setAllUsers, getEffectiveStatus, friendIds, acceptRequest, rejectRequest } = useUser();
  const { channels, setChannels, activeChannel, setActiveChannel, activeServerId, setActiveServerId, channelOrderTokenRef, accessContext, isConnecting, currentChannel, channelMembers } = useChannel();
  const {
    toastMsg, setToastMsg, invitationModal, setInvitationModal,
    userActionMenu, setUserActionMenu, roomModal, setRoomModal,
    passwordModal, setPasswordModal, passwordInput, setPasswordInput,
    passwordRepeatInput, setPasswordRepeatInput, passwordError, setPasswordError,
    contextMenu, setContextMenu, userVolumes, setSettingsTarget,
  } = useUI();
  const { avatarBorderColor, soundInvite, soundInviteVariant, isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled } = useSettings();
  const {
    isMuted, setIsMuted, isDeafened, setIsDeafened, handleUpdateUserVolume,
    handleInviteUser, handleCancelInvite, handleKickUser, handleMoveUser, handleSaveRoom,
    handleDeleteRoom, handleSetPassword, handleRemovePassword,
    handleJoinChannel, handleVerifyPassword, handleLogout,
    handleToggleSpeaker, disconnectFromLiveKit,
    presenceChannelRef, view, setView, appVersion, showReleaseNotes, setShowReleaseNotes,
    inviteCooldowns, inviteStatuses,
    isChatBanned: isChatBannedFromCtx,
    broadcastModeration,
  } = useAppState();
  const { volumeLevel, isPttPressed, setIsPttPressed, speakingLevels, connectionLevel, connectionLatencyMs, connectionJitterMs } = useAudio();

  const [showDiscover, setShowDiscover] = useState(false);
  const [roomMembersHidden, setRoomMembersHidden] = useState(false);
  const lastChannelIdRef = useRef<string | null>(null);

  useEffect(() => scheduleLazyPanelPreload(), []);

  useEffect(() => {
    setSoundChatRoomActive(Boolean(activeChannel));
    return () => setSoundChatRoomActive(false);
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel) lastChannelIdRef.current = activeChannel;
  }, [activeChannel]);

  // ── Kanal seçildiğinde merkez panel zorla chat view'e geçer ──
  // KURAL: Kullanıcı sohbet/ses odasına nerede tıklarsa tıklasın, orta panel
  // mutlaka o odayı açmalı. Settings/discover/home-peek varsa hepsi kapanır.
  // Bu kuralı bozan hiçbir refactor yapılmamalı (CLAUDE.md).
  useEffect(() => {
    if (!activeChannel) return;
    if (showDiscover) setShowDiscover(false);
    if (view === 'settings') setView('chat');
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
  }, [activeChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onGoto = () => {
      setShowDiscover(false);
      setIsServerHomeView(false);
      // Sunucu ayarları panelini de zorla kapat — kullanıcı sohbet/ses odasına
      // tıkladığında orta panel her zaman o odaya dönmeli, settings'te kalmamalı.
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
      if (view === 'settings') setView('chat');
    };
    // Sunucu ayarlarını kapat ama view'e dokunma — self panel'dan "Hesap Ayarları"
    // tıklandığında ServerSettings overlay'i temizlenmeli, SettingsView açılmalı.
    const onCloseServerSettings = () => {
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
    };
    window.addEventListener('mayvox:goto-chat', onGoto);
    window.addEventListener('mayvox:close-server-settings', onCloseServerSettings);
    return () => {
      window.removeEventListener('mayvox:goto-chat', onGoto);
      window.removeEventListener('mayvox:close-server-settings', onCloseServerSettings);
    };
  }, [view, setView]);

  // ── Mouse geri tuşu ile ayarlardan / discover'dan çık ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        if (view === 'settings') setView('chat');
        else if (showDiscover) setShowDiscover(false);
      }
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [view, setView, showDiscover]);

  // ── Chat messages hook ──
  const [chatMuted, setChatMuted] = useState(false);
  const [chatMuteRank, setChatMuteRank] = useState(0);
  const [chatMuteActivityEvent, setChatMuteActivityEvent] = useState<{ seq: number; muted: boolean; actorId?: string; actorName?: string } | null>(null);
  const [chatClearActivityEvent, setChatClearActivityEvent] = useState<{ seq: number; roomId: string; actorId?: string; actorName?: string } | null>(null);
  const [automodActivityEvent, setAutomodActivityEvent] = useState<{ seq: number; code?: string; userId?: string; userName?: string; label?: string } | null>(null);
  const [messageDeleteActivityEvent, setMessageDeleteActivityEvent] = useState<{ seq: number; roomId: string; type?: 'message_delete' | 'message_edit'; actorId?: string; actorName?: string; targetUserId?: string; targetName?: string; messageId?: string } | null>(null);
  const [messageReportActivityEvent, setMessageReportActivityEvent] = useState<{ seq: number; roomId: string; actorId?: string; actorName?: string; targetUserId?: string; targetName?: string; messageId?: string; reportCount?: number } | null>(null);
  const [highlightedRoomMessageId, setHighlightedRoomMessageId] = useState<string | null>(null);
  const [reportedRoomMessageIds, setReportedRoomMessageIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!currentUser?.id) return;
    void registerE2eeDeviceKey().catch(err => {
      console.warn('[e2ee] device key registration failed', err instanceof Error ? err.message : err);
    });
  }, [currentUser?.id]);
  const pendingChatMuteActorRef = useRef<{ muted: boolean; actorId: string; actorName: string; at: number } | null>(null);
  const pendingChatClearActorRef = useRef<{ actorId: string; actorName: string; at: number } | null>(null);
  const {
    chatMessages, chatInput, setChatInput, editingMsgId, editingText, setEditingText,
    isAtBottom, newMsgCount, chatScrollRef, handleChatScroll, scrollToBottom,
    sendChatMessage, deleteChatMessage, reportChatMessage, clearAllMessages: clearAllMessagesBase, startEditMessage, saveEditMessage, cancelEdit,
    isFloodCooling,
  } = useChatMessages({
    activeChannel, channels, roomRecipientIds: channelMembers.map(member => member.id), currentUser, chatMuted, chatMuteRank,
    isChatBanned: isChatBannedFromCtx,
    onChatBannedBlocked: () => setToastMsg('Bu sunucuda sohbet yasağınız aktif — mesaj yazamazsınız.'),
    onSendRejected: (message, code) => {
      setToastMsg(message);
      const normalizedCode = (code || '').toLocaleLowerCase('tr-TR');
      if (normalizedCode.includes('flood') || normalizedCode.includes('profanity') || normalizedCode.includes('spam')) {
        setAutomodActivityEvent({
          seq: Date.now(),
          code,
          userId: currentUser.id,
          userName: getPublicNickname(currentUser),
        });
      }
    },
    onChatMuteChange: (muted, rank, meta) => {
      const pending = pendingChatMuteActorRef.current;
      const fallback = pending && pending.muted === muted && Date.now() - pending.at < 5_000 ? pending : null;
      setChatMuteActivityEvent({
        seq: Date.now(),
        muted,
        actorId: meta?.actorId || fallback?.actorId,
        actorName: meta?.actorName || fallback?.actorName,
      });
      setChatMuted(muted);
      setChatMuteRank(rank);
    },
    onChatCleared: (roomId, meta) => {
      const pending = pendingChatClearActorRef.current;
      const fallback = pending && Date.now() - pending.at < 5_000 ? pending : null;
      setChatClearActivityEvent({
        seq: Date.now(),
        roomId,
        actorId: meta?.actorId || fallback?.actorId,
        actorName: meta?.actorName || fallback?.actorName,
      });
    },
    onMessageDeleted: (_messageId, meta) => {
      if (!activeChannel) return;
      setMessageDeleteActivityEvent({
        seq: Date.now(),
        roomId: activeChannel,
        type: meta?.moderated === false ? 'message_delete' : 'message_delete',
        actorId: meta.actorId,
        actorName: meta.actorName,
        targetUserId: meta.targetUserId,
        targetName: meta.targetName,
        messageId: meta.messageId,
      });
    },
    onMessageEdited: (_messageId, meta) => {
      if (!activeChannel) return;
      setMessageDeleteActivityEvent({
        seq: Date.now(),
        roomId: activeChannel,
        type: 'message_edit',
        actorId: meta?.actorId,
        actorName: meta?.actorName,
        targetUserId: meta?.targetUserId,
        targetName: meta?.targetName,
        messageId: meta?.messageId,
        reportCount: meta?.reportCount,
      });
    },
    onMessageReported: (_messageId, meta) => {
      if (!activeChannel) return;
      setMessageReportActivityEvent({
        seq: Date.now(),
        roomId: activeChannel,
        actorId: meta?.actorId,
        actorName: meta?.actorName,
        targetUserId: meta?.targetUserId,
        targetName: meta?.targetName,
        messageId: meta?.messageId,
      });
    },
  });
  const clearAllMessages = useCallback(() => {
    pendingChatClearActorRef.current = {
      actorId: currentUser.id,
      actorName: getPublicNickname(currentUser),
      at: Date.now(),
    };
    clearAllMessagesBase();
  }, [clearAllMessagesBase, currentUser]);

  const shouldPrepareRoomView = !!activeChannel;

  // ── Dominant speaker hook ──
  const sortedChannelMembers = useMemo(
    () => {
      if (!shouldPrepareRoomView) return [];
      return [...channelMembers].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    },
    [channelMembers, shouldPrepareRoomView]
  );
  const dominantSpeakerId = useDominantSpeaker({
    members: sortedChannelMembers, currentUserId: currentUser.id,
    isVoiceBanned: !!currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels,
  });

  // ── Local UI state ──
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [roomActivityPanelOpen, setRoomActivityPanelOpen] = useState(true);
  const [roomActivityPanelRatio, setRoomActivityPanelRatio] = useState(25);
  const [roomActivityClearing, setRoomActivityClearing] = useState(false);
  const [roomMusicPanelOpen, setRoomMusicPanelOpen] = useState(false);
  const roomActivitySplitRef = useRef<HTMLDivElement>(null);
  const roomActivityPhoneDefaultAppliedRef = useRef(false);
  const [draggedUser, setDraggedUser] = useState<string | null>(null);
  const [profilePopup, setProfilePopup] = useState<{
    userId: string;
    x: number;
    y: number;
    source?: 'search';
    fallbackUser?: User;
  } | null>(null);
  const [dmTargetUserId, setDmTargetUserId] = useState<string | null>(null);
  const [dmPanelOpen, setDmPanelOpen] = useState(false);
  const [dmPanelHasMounted, setDmPanelHasMounted] = useState(!FORCE_MOBILE);
  const [dmSettingsOpenNonce, setDmSettingsOpenNonce] = useState(0);
  // Oda içi sağ-tık role-aware context menu. Hedef sunucudan ayrılırsa (target
  // member artık listede yok) ctx'i temizleyerek menüyü otomatik kapatırız.
  const [roomMemberMenu, setRoomMemberMenu] = useState<RoomMemberMenuCtx | null>(null);
  useEffect(() => {
    if (!roomMemberMenu) return;
    const stillPresent = sortedChannelMembers.some(m => m.id === roomMemberMenu.user.id);
    if (!stillPresent) setRoomMemberMenu(null);
  }, [roomMemberMenu, sortedChannelMembers]);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [dmRequestCount, setDmRequestCount] = useState(0);
  const [activeDmConvKey, setActiveDmConvKey] = useState<string | null>(null);
  const [dmAtBottom, setDmAtBottom] = useState(true);
  const dmToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpenDm = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId) return;
      setView('chat');
      setSettingsTarget(null);
      setDmTargetUserId(userId);
      setDmPanelOpen(true);
    };
    window.addEventListener('mayvox:open-dm', onOpenDm);
    return () => window.removeEventListener('mayvox:open-dm', onOpenDm);
  }, [setSettingsTarget, setView]);

  useEffect(() => {
    const onOpenDiscover = () => {
      setView('chat');
      setSettingsTarget(null);
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
      setShowDiscover(true);
      setMobileLeftOpen(false);
      setMobileRightOpen(false);
    };
    window.addEventListener('mayvox:open-discover', onOpenDiscover);
    return () => window.removeEventListener('mayvox:open-discover', onOpenDiscover);
  }, [setSettingsTarget, setView]);

  useEffect(() => {
    const onOpenUserProfile = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId) return;
      setView('chat');
      setSettingsTarget(null);
      setDmPanelOpen(false);
      setProfilePopup({
        userId,
        x: Math.round(Math.max(320, window.innerWidth - 540)),
        y: 150,
        source: 'search',
      });
    };
    window.addEventListener('mayvox:open-user-profile', onOpenUserProfile);
    return () => window.removeEventListener('mayvox:open-user-profile', onOpenUserProfile);
  }, [setSettingsTarget, setView]);

  useEffect(() => {
    const onFocusUserSearch = () => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mayvox:social-search-focus'));
      }, 0);
    };
    window.addEventListener('mayvox:focus-user-search', onFocusUserSearch);
    return () => window.removeEventListener('mayvox:focus-user-search', onFocusUserSearch);
  }, []);

  useEffect(() => {
    const onOpenMessages = (event: Event) => {
      const detail = (event as CustomEvent<{ settings?: boolean; recipientId?: string }>).detail;
      const settings = !!detail?.settings;
      setView('chat');
      setSettingsTarget(null);
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
      setShowDiscover(false);
      setMobileRightOpen(false);
      if (detail?.recipientId) setDmTargetUserId(detail.recipientId);
      setDmPanelOpen(true);
      if (settings) setDmSettingsOpenNonce(nonce => nonce + 1);
    };
    window.addEventListener('mayvox:open-messages', onOpenMessages);
    return () => window.removeEventListener('mayvox:open-messages', onOpenMessages);
  }, [setSettingsTarget, setView]);

  useEffect(() => {
    if (!dmPanelOpen && !dmTargetUserId) return;
    setDmPanelHasMounted(true);
  }, [dmPanelOpen, dmTargetUserId]);

  useEffect(() => {
    if (!FORCE_MOBILE || dmPanelHasMounted) return;
    const timer = window.setTimeout(() => setDmPanelHasMounted(true), 800);
    return () => window.clearTimeout(timer);
  }, [dmPanelHasMounted]);

  const shouldRenderDmPanel = !FORCE_MOBILE || dmPanelHasMounted || dmPanelOpen || !!dmTargetUserId;

  useEffect(() => {
    if (!dmSettingsOpenNonce || !shouldRenderDmPanel || typeof window === 'undefined') return;
    const delays = [120, 360, 760, 1280];
    const timers = delays.map(delay => window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mayvox:open-message-settings'));
    }, delay));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [dmSettingsOpenNonce, shouldRenderDmPanel]);

  // ── Notification system v3 context sync ──
  const isAppFocused = useWindowActivity();
  // Real isUserSpeaking — speakingLevels[me] threshold + 400ms hold hysteresis.
  const isUserSpeaking = useIsUserSpeaking(currentUser.id || null, speakingLevels);

  // v4 voice-first polish: UI konuşurken sakinleşsin (CSS `html[data-user-speaking]` gate).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isUserSpeaking) document.documentElement.setAttribute('data-user-speaking', 'true');
    else document.documentElement.removeAttribute('data-user-speaking');
    return () => { document.documentElement.removeAttribute('data-user-speaking'); };
  }, [isUserSpeaking]);
  useNotificationContextSync({
    currentUserId: currentUser.id || null,
    isAppFocused,
    dmPanelOpen,
    activeDmConvKey,
    dmAtBottom,
    activeServerId,
    // v3 voice-first signals — canlı state'lerden bağlı.
    isInVoiceRoom: !!currentChannel,
    isPttActive: isPttPressed,
    isMuted,
    isDeafened,
    isUserSpeaking,
    // mode: NORMAL default; user settings geldiğinde buraya bağlanır.
  });
  useEffect(() => {
    // Notification click başında açık overlay'leri kapat. settings view'ındaysa chat'e dön,
    // server settings panel'i açıksa kapat, settingsTarget deep-link'i temizle. closeSettingsPanel
    // useEffect'i zaten view/activeServerId değişiminde fire ediyor ama navigation hemen sonra
    // gelen toast action'ları (modal açma vb.) için deterministik bir baseline sağlamak gerekli.
    const closeTransientPanels = () => {
      setView('chat');
      setSettingsTarget(null);
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
    };

    registerNotifHandlers({
      onDmClick: (recipientId /*, conversationKey */) => {
        closeTransientPanels();
        setDmTargetUserId(recipientId);
        setDmPanelOpen(true);
      },
      onInviteClick: (_inviteId, serverId) => {
        closeTransientPanels();
        // Gelen davetler modal'ını aç — kullanıcı accept/decline yapabilsin.
        setInvitesModalOpen(true);
        // Sunucu context'i varsa fokuslamak için active server'ı geçirme
        // (kullanıcı zaten modal içinden serverName görür; agresif switch etmiyoruz).
        void serverId;
      },
      onJoinRequestClick: (serverId) => {
        // Settings panel'e gideceğiz — view=chat'e değil, doğrudan hedef settings'i aç.
        // closeTransientPanels burada çağrılmaz çünkü hedefin kendisi settings panel.
        setView('chat'); // settings view'ından orta panel'e dön ki server settings inline açılsın
        setSettingsTarget(null);
        setSettingsInitialTab('requests');
        setSettingsServerId(serverId);
      },
      onJoinRequestAcceptedClick: (serverId) => {
        closeTransientPanels();
        // "Başvurun kabul edildi" toast'ına tıklayınca sunucuya geç.
        setActiveServerId(serverId);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sunucu state ──
  // activeServerId artık ChannelContext'ten geliyor — presence/server-izolasyon için global paylaşılıyor.
  const [serverList, setServerList] = useState<Server[]>([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverError, setServerError] = useState('');
  const [serverActionLoading, setServerActionLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPublic, setCreatePublic] = useState(true);
  const [createMotto, setCreateMotto] = useState('');
  const [createPlan, setCreatePlan] = useState('free');
  const [createError, setCreateError] = useState('');
  // joinCode/joinError artık JoinServerModal içinde yönetiliyor
  const [settingsServerId, setSettingsServerId] = useState<string | null>(null);
  type ServerSettingsInitialTab = 'general' | 'overview' | 'members' | 'roles' | 'invites' | 'automod' | 'streams' | 'requests' | 'bans' | 'audit' | 'insights';
  const [settingsInitialTab, setSettingsInitialTab] = useState<ServerSettingsInitialTab | undefined>(undefined);

  // ══════════════════════════════════════════════════════════
  // Server Settings otomatik kapanma
  // ══════════════════════════════════════════════════════════
  // Server settings orta panelde inline render oluyor. X butonu dışında
  // kapanması için "orta paneli tetikleyen" her aksiyon settings'i de
  // kapatmalı: Discover, Ayarlar (view=settings), sunucu switch, kanala
  // katılma. Her handler'a manuel setSettingsServerId(null) eklemek yerine
  // state-watcher useEffect'i tek yerden yönetiyor.
  //
  // Not: settingsServerId + settingsInitialTab bilinçli olarak deps
  // dışında — effect yalnız middle-panel target'ları değiştiğinde fire
  // etmeli, settings kendi açılışıyla kendini kapatmasın.
  const closeSettingsPanel = useCallback(() => {
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
  }, []);

  const toggleServerSettingsPanel = useCallback((serverId: string) => {
    if (!serverId) return;
    if (settingsServerId === serverId) {
      closeSettingsPanel();
      return;
    }
    setSettingsTarget(null);
    setSettingsInitialTab(undefined);
    setSettingsServerId(serverId);
  }, [closeSettingsPanel, setSettingsTarget, settingsServerId]);

  useEffect(() => {
    // Mount'ta fires ama settingsServerId zaten null → no-op.
    // Sonraki değişimler: Discover açılırsa, view=settings olursa, server
    // switch olursa, kanala katılınırsa → settings kapanır.
    closeSettingsPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, showDiscover, activeServerId, activeChannel]);

  // Mouse geri (XButton1 = button 3) → settings aktifse kapat.
  // Electron Chromium'da mouse back native navigation tetiklemez (SPA),
  // o yüzden preventDefault güvenli; diğer ortamlarda da zararsız.
  useEffect(() => {
    if (!settingsServerId) return;
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        closeSettingsPanel();
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [settingsServerId, closeSettingsPanel]);

  // Periyodik poll (45 sn) ve window focus'ta refreshServers() çağrılıyor.
  // Her seferinde setServerLoading(true) yapmak middle content'i spinner'a
  // çeviriyor ve "random refresh" hissi veriyordu. Loading state SADECE ilk
  // yüklemede gösterilmeli; sonraki arka plan refetch'leri silent olmalı.
  const initialServerLoadDoneRef = useRef(false);
  const refreshServersInFlightRef = useRef(false);
  const lastRefreshServersAtRef = useRef(0);
  const refreshServers = useCallback(async (opts: { force?: boolean } = {}) => {
    const now = Date.now();
    const isInitial = !initialServerLoadDoneRef.current;
    const force = opts.force === true;
    if (refreshServersInFlightRef.current) return;
    if (!isInitial && !force && now - lastRefreshServersAtRef.current < 2_500) return;

    refreshServersInFlightRef.current = true;
    lastRefreshServersAtRef.current = now;
    try {
      if (isInitial) setServerLoading(true);
      setServerError('');
      const servers = await listMyServers();
      setServerList(servers);
      // Aktif sunucu artık listede yoksa (ban/kick sonrası) fallback: ilk server veya null.
      // Eski fallback sadece "activeServerId yoksa" idi; stale activeServerId invalid olunca
      // sidebar yanlış sunucuyu highlight ediyordu ve settings panel açık kalıyordu.
      const activeStillValid = activeServerId && servers.some(s => s.id === activeServerId);
      if (!activeStillValid) {
        setActiveServerId(servers[0]?.id ?? '');
      }
    } catch (err: any) {
      setServerError(err.message || 'Sunucu listesi alınamadı');
    } finally {
      if (isInitial) setServerLoading(false);
      initialServerLoadDoneRef.current = true;
      refreshServersInFlightRef.current = false;
    }
  }, [activeServerId, setActiveServerId]);

  // Server list invalidation: moderation/ban/kick event'leri bu window event'ini fire eder.
  // useLiveKitConnection disconnect (PARTICIPANT_REMOVED) + usePresence (isVoiceBanned)
  // dispatch eder. Handler refreshServers çağırır — polling'i 45s beklemeden sidebar anlık güncellenir.
  useEffect(() => {
    const handler = () => { void refreshServers(); };
    window.addEventListener('mayvox:refresh-server-list', handler);
    return () => window.removeEventListener('mayvox:refresh-server-list', handler);
  }, [refreshServers]);

  useEffect(() => {
    return subscribeRealtimeEvents(event => {
      if (event.type !== 'server-member-role') return;
      const payload = event.payload || {};
      const serverId = typeof payload.serverId === 'string' ? payload.serverId : '';
      const userId = typeof payload.userId === 'string' ? payload.userId : '';
      if (!serverId) return;
      if (serverId !== activeServerId && userId !== currentUser.id) return;

      void refreshServers({ force: true });
      window.dispatchEvent(new CustomEvent('mayvox:refresh-server-access', {
        detail: { serverId, userId },
      }));
    });
  }, [activeServerId, currentUser.id, refreshServers]);

  // ── Restriction state transition notifications ──
  // İlk render = sadece baseline doldur, toast atma. Sonraki listler arasında
  // gerçek transition (false→true / true→false) yakalanırsa premium bildirim ver.
  const restrictionStateRef = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (serverList.length === 0) return;
    const prev = restrictionStateRef.current;
    const next = new Map<string, boolean>();
    for (const s of serverList) next.set(s.id, !!s.isBanned);

    if (prev === null) {
      // İlk sync — bildirim üretme.
      restrictionStateRef.current = next;
      return;
    }

    for (const s of serverList) {
      const before = prev.get(s.id);
      const now = !!s.isBanned;
      if (before === undefined || before === now) continue;

      if (now) {
        // Aktif → kısıtlandı
        const inAffectedRoom = activeServerId === s.id && !!activeChannel;
        if (inAffectedRoom) {
          // LiveKit'i temiz kapat ki UI tutarlı kalsın.
          void disconnectFromLiveKit();
          setActiveChannel(null);
        }
        // Top-right premium toast
        handleServerRestricted({ serverId: s.id, serverName: s.name, serverAvatar: s.avatarUrl ?? null });
        // Bell informational item
        pushInformational({
          key: `restricted:${s.id}`,
          kind: 'serverRestricted',
          label: s.name || 'Sunucu kısıtlandı',
          detail: 'Odalara ve sesli kanallara erişim kapatıldı',
          serverId: s.id,
          serverAvatar: s.avatarUrl ?? null,
          createdAt: Date.now(),
        });
      } else {
        // Kısıtlama kaldırıldı
        handleServerUnrestricted({ serverId: s.id, serverName: s.name, serverAvatar: s.avatarUrl ?? null });
        pushInformational({
          key: `unrestricted:${s.id}`,
          kind: 'serverUnrestricted',
          label: s.name || 'Sunucu tekrar aktif',
          detail: 'Odalara ve sesli kanallara erişim açıldı',
          serverId: s.id,
          serverAvatar: s.avatarUrl ?? null,
          createdAt: Date.now(),
        });
      }
    }

    restrictionStateRef.current = next;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverList]);

  useEffect(() => { refreshServers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periyodik sunucu listesi yenileme — restriction state transition tespiti için.
  // Tablet tarafında daha seyrek tutulur; focus event'i anlık tazelemeyi korur.
  useEffect(() => {
    const onFocus = () => { void refreshServers(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshServers();
    }, FORCE_MOBILE ? 120_000 : 45_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refreshServers]);

  const handleCreateServer = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    try {
      setServerActionLoading(true);
      setCreateError('');
      const server = await createServer(name, createDesc.trim(), createPublic, createMotto.trim() || undefined, createPlan);
      await refreshServers({ force: true });
      setActiveServerId(server.id);
      setShowCreateModal(false);
      setShowDiscover(false);
      setCreateName('');
      setCreateDesc('');
      setCreateMotto('');
      setCreatePlan('free');
      setCreateError('');
    } catch (err: any) {
      setCreateError(err.message || 'Sunucu oluşturulamadı');
    } finally {
      setServerActionLoading(false);
    }
  }, [createName, createDesc, createPublic, createMotto, createPlan, refreshServers]);

  const handleJoinServer = useCallback(async (code: string) => {
    try {
      setServerActionLoading(true);
      const server = await joinServer(code);
      await refreshServers({ force: true });
      setActiveServerId(server.id);
      setToastMsg('Sunucuya katıldın');
    } catch (err: unknown) {
      setToastMsg(err instanceof Error ? err.message : 'Sunucuya katılınamadı');
    } finally {
      setServerActionLoading(false);
    }
  }, [refreshServers, setToastMsg]);

  const handleLeaveServer = useCallback(async (serverId: string) => {
    try {
      setServerActionLoading(true);
      await leaveServer(serverId);
      await refreshServers({ force: true });
      if (activeServerId === serverId) setActiveServerId('');
    } catch (err: any) {
      setToastMsg(err.message || 'Sunucudan ayrılınamadı');
    } finally {
      setServerActionLoading(false);
    }
  }, [refreshServers, activeServerId, setToastMsg]);

  const activeServerData = serverList.find(s => s.id === activeServerId) ?? serverList[0] ?? null;
  const hasServer = serverList.length > 0;
  const activeServerCanManage = accessContext?.flags.canManageServer
    ?? (activeServerData?.role === 'owner' || activeServerData?.role === 'admin');
  const activeServerCanOpenSettings = !!activeServerId && (
    activeServerCanManage ||
    !!accessContext?.flags.canKickMembers ||
    !!accessContext?.flags.canCreateInvite ||
    !!accessContext?.flags.canRevokeInvite ||
    !!accessContext?.flags.canViewInsights
  );
  const activeServerRole = activeServerData?.role as string | undefined;
  const activeServerRoleKey = (activeServerRole || '').toLocaleLowerCase('tr-TR');
  const activeServerRolePriority =
    activeServerRoleKey === 'owner' ? 100 :
    activeServerRoleKey === 'super_admin' ? 90 :
    activeServerRoleKey === 'admin' ? 80 :
    activeServerRoleKey === 'super_mod' ? 70 :
    activeServerRoleKey === 'mod' || activeServerRoleKey === 'moderator' ? 60 :
    activeServerRoleKey === 'super_member' ? 30 :
    20;
  const activeServerCanCreateRecommendation = activeServerRolePriority >= 30;
  const activeServerCanModerateCommunityContent = activeServerRolePriority >= 60;
  const hasRoomActivityStaffRole = [
    'owner',
    'sahip',
    'primary_admin',
    'super_admin',
    'süper yönetici',
    'super yönetici',
    'super yonetici',
    'admin',
    'yönetici',
    'yonetici',
    'super_mod',
    'super_moderator',
    'moderator',
    'mod',
    'süper moderatör',
    'super moderator',
    'moderatör',
  ].includes((activeServerRole || '').toLocaleLowerCase('tr-TR'));
  const canViewRoomActivityLog = Boolean(
    hasRoomActivityStaffRole ||
    currentUser.isPrimaryAdmin ||
    currentUser.isAdmin ||
    currentUser.isModerator,
  );
  const canClearRoomActivityLog = ['owner', 'super_admin'].includes((activeServerRole || '').toLocaleLowerCase('tr-TR'));
  const { activities: roomActivities, clearActivities: clearRoomActivities } = useRoomActivityLog({
    activeChannel,
    activeServerId,
    members: sortedChannelMembers,
    allUsers,
    chatMuted,
    chatMuteEvent: chatMuteActivityEvent,
    chatClearEvent: chatClearActivityEvent,
    automodEvent: automodActivityEvent,
    messageDeleteEvent: messageDeleteActivityEvent,
    messageReportEvent: messageReportActivityEvent,
    enabled: canViewRoomActivityLog && shouldPrepareRoomView,
  });
  const beginRoomActivityResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!roomActivitySplitRef.current) return;
    event.preventDefault();
    const rect = roomActivitySplitRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRatio = roomActivityPanelRatio;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const isPhoneActivityResize = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px), (hover: none) and (pointer: coarse)').matches;
    let frameId = 0;
    let lastRatio = startRatio;
    document.body.style.userSelect = 'none';
    document.body.classList.add('mv-room-activity-resizing');

    const onMove = (moveEvent: PointerEvent) => {
      const delta = isPhoneActivityResize ? moveEvent.clientY - startY : startX - moveEvent.clientX;
      if (Math.abs(delta) < 5) return;
      const next = isPhoneActivityResize
        ? Math.min(68, Math.max(28, startRatio + (delta / height) * 100))
        : Math.min(50, Math.max(20, startRatio + (delta / width) * 100));
      const rounded = Math.round(next * 10) / 10;
      if (Math.abs(rounded - lastRatio) < 0.2) return;
      lastRatio = rounded;
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setRoomActivityPanelRatio(lastRatio);
      });
    };
    const onUp = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
      setRoomActivityPanelRatio(lastRatio);
      document.body.style.userSelect = '';
      document.body.classList.remove('mv-room-activity-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  }, [roomActivityPanelRatio]);
  // App-level rol + 0 sahip sunucu → sunucu oluşturma butonları görünür.
  const canCreateServer = canUserCreateServer(currentUser, serverList);

  useEffect(() => {
    const onOpenServerSettings = (event: Event) => {
      if (!activeServerId || !activeServerCanOpenSettings) return;
      const detail = (event as CustomEvent<{ highlightId?: string; tab?: ServerSettingsInitialTab }>).detail;
      const highlightId = detail?.highlightId;
      const tab = detail?.tab ?? 'overview';
      setView('chat');
      setSettingsTarget(null);
      setSettingsInitialTab(tab);
      setSettingsServerId(activeServerId);
      if (highlightId) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('mayvox:highlight-server-setting', { detail: { id: highlightId } }));
        }, 220);
      }
    };
    window.addEventListener('mayvox:open-server-settings', onOpenServerSettings);
    return () => window.removeEventListener('mayvox:open-server-settings', onOpenServerSettings);
  }, [activeServerCanOpenSettings, activeServerId, setSettingsTarget, setView]);

  // ── Sunucu kanalları — instant cache + background refresh ──
  const channelCacheRef = useRef(new Map<string, VoiceChannel[]>());
  const removeCurrentUserFromChannel = useCallback((channelId: string | null) => {
    if (!channelId) return;
    const myKeys = new Set([currentUser.id, currentUser.name].filter(Boolean));
    const removeFromList = (list: VoiceChannel[]) => list.map(channel => {
      if (channel.id !== channelId) return channel;
      const nextMembers = (channel.members || []).filter(memberKey => !myKeys.has(memberKey));
      return {
        ...channel,
        members: nextMembers,
        userCount: nextMembers.length,
      };
    });
    setChannels(prev => removeFromList(prev));
    if (activeServerId) {
      const cached = channelCacheRef.current.get(activeServerId);
      if (cached) channelCacheRef.current.set(activeServerId, removeFromList(cached));
    }
  }, [activeServerId, currentUser.id, currentUser.name, setChannels]);

  // Sunucu değişirken kanalları cache'e kaydet (member temiz)
  useEffect(() => {
    if (!activeServerId) return;
    return () => {
      if (activeServerId && channels.length > 0) {
        channelCacheRef.current.set(activeServerId, channels.map(c => ({ ...c, members: [], userCount: 0 })));
      }
    };
  }, [activeServerId, channels]);

  useEffect(() => {
    if (!activeServerId) return;
    let cancelled = false;

    // Cache varsa anında göster + aktif kanala current user inject et
    const cached = channelCacheRef.current.get(activeServerId);
    if (cached && cached.length > 0) {
      const myId = currentUser.id;
      setChannels(applyLocalChannelIcons(applyLocalChannelIconColors(applyLocalChannelOrder(activeServerId, cached.map(c => {
        if (c.id === activeChannel && myId && !c.members?.includes(myId)) {
          return { ...c, members: [...(c.members || []), myId], userCount: (c.userCount || 0) + 1 };
        }
        return c;
      })))));
    }

    // API'den güncelle (cache olsa bile fresh data al)
    (async () => {
      try {
        const payload = await getServerChannels(activeServerId);
        if (cancelled) return;
        const serverChannels = payload.channels;
        channelOrderTokenRef.current = payload.orderToken;
        const nameModeMap: Record<string, string> = {
          Genel: 'social',
          'Sohbet Muhabbet': 'social',
          Oyun: 'gaming',
          'Oyun Takımı': 'gaming',
          Yayın: 'broadcast',
          'Yayın Sahnesi': 'broadcast',
          Sessiz: 'quiet',
          'Sessiz Alan': 'quiet',
        };
        const displayNameMap: Record<string, string> = {
          'Sohbet Muhabbet': 'Genel',
          'Oyun Takımı': 'Oyun',
          'Yayın Sahnesi': 'Yayın',
          'Sessiz Alan': 'Sessiz',
        };
        const validIds = new Set(serverChannels.map(ch => ch.id));
        setChannels(prev => {
          const prevMap = new Map<string, VoiceChannel>(prev.map(c => [c.id, c]));
          const myId = currentUser.id;
          return applyLocalChannelIcons(applyLocalChannelIconColors(applyLocalChannelOrder(activeServerId, serverChannels.map(ch => {
            const existing = prevMap.get(ch.id);
            let members = existing?.members ?? [];
            let userCount = existing?.userCount ?? 0;
            if (ch.id === activeChannel && myId && !members.includes(myId)) {
              members = [...members, myId];
              userCount = members.length;
            }
            return {
              id: ch.id,
              name: displayNameMap[ch.name] ?? ch.name,
              userCount,
              members,
              isSystemChannel: ch.isDefault,
              isPersistent: ch.isPersistent,
              mode: ch.mode ?? nameModeMap[ch.name] ?? 'social',
              iconName: ch.iconName ?? undefined,
              iconColor: ch.iconColor ?? undefined,
              maxUsers: ch.maxUsers ?? undefined,
              isInviteOnly: ch.isInviteOnly,
              isHidden: ch.isHidden,
              ownerId: ch.ownerId ?? undefined,
              position: ch.position,
            };
          }))));
        });
        if (activeChannel && !validIds.has(activeChannel)) {
          setActiveChannel(null);
        }
      } catch {
        if (!cancelled && !channelCacheRef.current.has(activeServerId)) {
          setChannels([]);
          if (activeChannel) setActiveChannel(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gelen sunucu davetleri ──
  const incomingInvites = useIncomingInvites();
  // ── Sunucu adminleri için katılma başvurusu bildirimleri +
  //    başvuran kullanıcıya kabul/red sonuç bildirimi ──
  useJoinRequestNotifications({ onMembershipChanged: () => { void refreshServers(); } });
  const [invitesModalOpen, setInvitesModalOpen] = useState(false);
  const [accessModalChannelId, setAccessModalChannelId] = useState<string | null>(null);

  // ── Sunucu admin başvuru özeti ──
  const shouldPollPendingJoinRequests = serverLoading
    || serverList.some(server => server.role === 'owner' || server.role === 'admin');
  const myPendingJoinRequests = useMyPendingJoinRequests({ enabled: shouldPollPendingJoinRequests });

  // ── Notification center ──
  const notifications = useNotificationCenter(
    dmUnreadCount,
    dmRequestCount,
    false,
    incomingInvites.invites,
    myPendingJoinRequests.items.map(it => ({ serverId: it.serverId, serverName: it.serverName, pendingCount: it.pendingCount })),
  );

  // ── Card style ──
  const [cardScale, setCardScale] = useState<number>(() => {
    const saved = localStorage.getItem('cardScale');
    return saved ? Math.max(1, Math.min(3, parseInt(saved))) : 2;
  });
  const [cardStyle, setCardStyleState] = useState<CardStyle>(loadCardStyle);
  const cycleCardStyle = useCallback(() => {
    const order: CardStyle[] = ['current', 'revolt', 'linear'];
    const next = order[(order.indexOf(cardStyle) + 1) % order.length];
    saveCardStyle(next);
    setCardStyleState(next);
  }, [cardStyle]);

  // ── Middle panel view override ──
  // Kullanıcı bir kanaldayken "sunucu ana sayfasına göz at" butonuyla placeholder
  // view'e geçer. activeChannel DEĞİŞMEZ, voice bağlantısı DEĞİŞMEZ, dock alt bar
  // aynen kalır. Sadece orta panel render'ı override edilir. Kanal değişince auto-reset.
  const [isServerHomeView, setIsServerHomeView] = useState(false);
  const canSeeRoomMusic = ['owner', 'sahip'].includes((activeServerRole || '').toLocaleLowerCase('tr-TR'));
  const showRoomMusicPanel = canSeeRoomMusic && !!currentChannel && !isServerHomeView && ((currentChannel as { type?: string }).type ?? 'voice') === 'voice';
  const roomMusic = useRoomMusic({
    serverId: activeServerId,
    channelId: showRoomMusicPanel ? activeChannel : null,
    enabled: showRoomMusicPanel,
    serverPlan: activeServerData?.plan,
    userLevel: currentUser.userLevel,
    serverRole: activeServerRole,
  });
  useEffect(() => {
    setRoomMusicPanelOpen(false);
  }, [activeChannel, activeServerId]);
  useEffect(() => {
    // Yeni kanal seçilince (veya tamamen çıkılınca) override'ı sıfırla —
    // böylece kanal değiştirince eski override kalmaz.
    setIsServerHomeView(false);
  }, [activeChannel]);

  // ── Navigation state machine ──
  // Deterministic derive: 4 state'in kombinasyonundan tek bir currentView çıkar.
  // Dock butonları bu değere bakarak visibility + handler wiring yapar.
  type CurrentView = 'room' | 'server_home' | 'discover' | 'settings';
  const currentView: CurrentView = useMemo(() => {
    if (settingsServerId) return 'settings';
    if (view === 'settings') return 'settings';
    if (showDiscover) return 'discover';
    if (!activeChannel || isServerHomeView) return 'server_home';
    return 'room';
  }, [settingsServerId, view, showDiscover, activeChannel, isServerHomeView]);

  // handleGoHome — kullanıcıyı sunucu ana sayfasına götürür.
  // Hangi view'den olursa olsun: settings/discover kapanır, varsa oda peek moduna geçer.
  // activeChannel korunur (voice kesilmez). Return sonradan aynı odaya döner.
  const handleGoHome = useCallback(() => {
    if (view === 'settings') setView('chat');
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
    if (showDiscover) setShowDiscover(false);
    if (activeChannel) setIsServerHomeView(true);
    // activeChannel yoksa zaten natural server_home — ek aksiyon yok
  }, [view, setView, showDiscover, activeChannel]);

  useEffect(() => {
    const onCreateAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: 'announcement' | 'event' }>).detail;
      const type = detail?.type === 'event' ? 'event' : 'announcement';
      handleGoHome();
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mayvox:announcements-open-composer', { detail: { type } }));
      }, 180);
    };
    window.addEventListener('mayvox:create-announcement', onCreateAnnouncement);
    return () => window.removeEventListener('mayvox:create-announcement', onCreateAnnouncement);
  }, [handleGoHome]);

  // handleReturnToRoom — en son odaya geri dön.
  // activeChannel set değilse hiçbir şey yapmaz (Return zaten görünmemeli).
  const handleReturnToRoom = useCallback(() => {
    if (!activeChannel) return;
    if (view === 'settings') setView('chat');
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
    if (showDiscover) setShowDiscover(false);
    setIsServerHomeView(false);
  }, [activeChannel, view, setView, showDiscover]);

  // Sol sidebar kanal tıklamaları — isServerHomeView peek'i otomatik kapatır.
  // Aynı kanal tıklanırsa handleJoinChannel early-return yapar (activeChannel===id),
  // ama peek state'i bu wrapper sayesinde zaten resetlenmiş olur → kullanıcı odaya döner.
  const handleSidebarChannelClick = useCallback((channelId: string) => {
    setIsServerHomeView(false);
    if (showDiscover) setShowDiscover(false);
    handleJoinChannel(channelId);
  }, [handleJoinChannel, showDiscover]);

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

  // ── Incoming call: ringtone + 35s timeout + mute state ──
  // Modal açılınca: ringtone çalar (mute değilse), 35s timer başlar.
  // Mute: sadece ringtone durur — caller'a sinyal yok, modal kapanmaz, timeout
  // işlemeye devam eder (kullanıcı karar verme süresini kaybetmez).
  // Timeout dolduğunda: modal kapanır + caller'a reject YOK (user cevap vermedi,
  // aktif reject değil) + kullanıcıya missed-call informational push.
  const [invitationMuted, setInvitationMuted] = useState(false);
  const invitationDataRef = useRef<typeof invitationModal>(null);
  invitationDataRef.current = invitationModal;

  useEffect(() => {
    // Yeni davet geldiğinde mute sıfırlansın.
    if (invitationModal) setInvitationMuted(false);
  }, [invitationModal?.inviterId, invitationModal?.roomId]);

  useEffect(() => {
    if (!invitationModal) {
      stopInviteRingtone();
      dismissInviteNotification();
      return;
    }
    if (soundInvite && !invitationMuted) {
      startInviteRingtone(soundInviteVariant);
    } else {
      stopInviteRingtone();
    }
    return () => { stopInviteRingtone(); };
  }, [invitationModal, invitationMuted, soundInvite, soundInviteVariant]);

  useEffect(() => {
    if (!invitationModal) return;
    const snapshot = invitationModal;
    const timer = setTimeout(() => {
      // Stale guard: arada modal başka bir invite'a değiştiyse bu timeout'u at.
      if (invitationDataRef.current !== snapshot) return;
      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      // label = sadece isim (NotificationBell'de font-semibold render edilir),
      // detail = kalan cümle + zaman (font-normal; inline birleşir).
      pushInformational({
        key: `missedCall:${snapshot.inviterId}:${snapshot.roomId}:${now}`,
        kind: 'missedCall',
        label: snapshot.inviterName,
        detail: `seni aradı • ${timeStr}`,
        serverAvatar: snapshot.serverAvatar ?? null,
        createdAt: now,
      });
      setInvitationModal(null);
    }, INVITE_RING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [invitationModal, setInvitationModal]);

  const handleInvitationMute = useCallback(() => {
    setInvitationMuted(prev => !prev);
  }, []);

  // ChatView invite butonunu server context ile sararak useChannelActions'a iletir.
  // handleInviteUser imzası opsiyonel 2. param kabul eder; aktif server adı/avatarı burada resolve edilir.
  const handleInviteUserWithContext = useCallback((userId: string) => {
    handleInviteUser(userId, { name: activeServerData?.name, avatar: activeServerData?.avatarUrl ?? null });
  }, [handleInviteUser, activeServerData]);

  useEffect(() => {
    const onInviteUserToRoom = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId || !activeChannel) return;
      setView('chat');
      setSettingsTarget(null);
      handleInviteUserWithContext(userId);
    };
    window.addEventListener('mayvox:invite-user-to-room', onInviteUserToRoom);
    return () => window.removeEventListener('mayvox:invite-user-to-room', onInviteUserToRoom);
  }, [activeChannel, handleInviteUserWithContext, setSettingsTarget, setView]);

  // Auto-dismiss: toast 3s sonra kapanır (hover'da beklenir, yeni toastMsg render'ında
  // timer sıfırlanır). setInterval yerine setTimeout — ilk tick 3s'de garanti.
  useEffect(() => {
    if (!toastMsg) return;
    const tick = () => {
      if (dockToastHoveredRef.current) {
        // Hover sırasında 1s'de bir tekrar dene; hover biter bitmez dismiss olur.
        timerId = setTimeout(tick, 1000);
        return;
      }
      setToastMsg(null);
    };
    let timerId: ReturnType<typeof setTimeout> = setTimeout(tick, 3000);
    return () => clearTimeout(timerId);
  }, [toastMsg]);

  // ── Derived data ──
  const visibleChannels = useMemo(
    () => channels.filter(c => !c.isHidden || c.ownerId === currentUser.id || currentUser.isAdmin || activeChannel === c.id),
    [channels, currentUser.id, currentUser.isAdmin, activeChannel]
  );
  const userById = useMemo(() => new Map(allUsers.map(user => [user.id, user])), [allUsers]);
  const userByName = useMemo(() => new Map(allUsers.map(user => [user.name, user])), [allUsers]);
  const serverNameById = useMemo(() => new Map(serverList.map(server => [server.id, server.name])), [serverList]);
  const friendUsers = useMemo(() => allUsers.filter(u => friendIds.has(u.id)), [allUsers, friendIds]);
  const voicePresentUserKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const channel of channels) {
      for (const memberKey of channel.members || []) {
        if (memberKey) keys.add(memberKey);
      }
    }
    return keys;
  }, [channels]);
  const mobileIsFriendOnline = useCallback((user: User) => {
    const isVoicePresent = voicePresentUserKeys.has(user.id) || voicePresentUserKeys.has(user.name);
    return isVoicePresent || (user.status === 'online' && user.statusText !== 'Cevrimdisi' && user.statusText !== 'Çevrimdışı');
  }, [voicePresentUserKeys]);
  const mobileFormatLastSeen = useCallback((user: User) => {
    if (user.showLastSeen === false || !user.lastSeenAt) return 'Cevrimdisi';
    const seenAt = new Date(user.lastSeenAt);
    if (Number.isNaN(seenAt.getTime())) return 'Cevrimdisi';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfSeenDay = new Date(seenAt.getFullYear(), seenAt.getMonth(), seenAt.getDate()).getTime();
    const time = seenAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (startOfSeenDay === startOfToday) return `Son gorulme: Bugun ${time}`;
    if (startOfSeenDay === startOfToday - 24 * 60 * 60 * 1000) return `Son gorulme: Dun ${time}`;
    const date = seenAt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    return `Son gorulme: ${date} ${time}`;
  }, []);
  const mobileFriendPresence = useMemo(() => {
    let onlineCount = 0;
    const prepared = friendUsers.map(user => {
      const isOnline = mobileIsFriendOnline(user);
      if (isOnline) onlineCount += 1;
      const lastSeenText = isOnline ? undefined : mobileFormatLastSeen(user);
      return {
        user,
        isOnline,
        lastSeenText,
        lastSeenTime: user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0,
      };
    });
    const items = prepared
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (!a.isOnline && !b.isOnline) {
          if (a.lastSeenTime !== b.lastSeenTime) return b.lastSeenTime - a.lastSeenTime;
        }
        return getPublicDisplayName(a.user).localeCompare(getPublicDisplayName(b.user), 'tr');
      })
      .slice(0, 8)
      .map(({ user, isOnline, lastSeenText }) => {
        const serverName = isOnline && user.serverId
          ? serverNameById.get(user.serverId) ?? null
          : null;
        const status: 'online' | 'offline' | 'idle' | 'dnd' = isOnline
          ? user.status === 'away'
            ? 'idle'
            : user.status === 'busy'
              ? 'dnd'
              : 'online'
          : 'offline';
        return {
          id: user.id,
          name: getPublicDisplayName(user),
          avatarUrl: user.avatar,
          status,
          subtitle: isOnline
            ? status === 'idle'
              ? 'AFK'
              : status === 'dnd'
                ? 'Rahatsız Etmeyin'
                : 'Online'
            : lastSeenText,
          statusText: user.statusText,
          serverName,
          gameActivity: isOnline ? user.gameActivity : undefined,
          lastSeenText,
          platform: user.platform,
          role: getUserRoleBadge(user),
        };
      });
    return { items, onlineCount };
  }, [friendUsers, mobileFormatLastSeen, mobileIsFriendOnline, serverNameById]);
  const mobileFriendItems = mobileFriendPresence.items;
  const mobileOnlineFriendCount = mobileFriendPresence.onlineCount;
  const sidebarServers = useMemo(
    () => (FORCE_MOBILE && ENABLE_MOBILE_SHELL_V1 ? [] : serverList.map(s => ({ id: s.id, name: s.name }))),
    [serverList],
  );
  const handleFriendProfileClick = useCallback((userId: string, x: number, y: number, fallbackUser?: User) => {
    setProfilePopup({ userId, x, y, fallbackUser });
  }, []);
  const handleSearchUserProfileClick = useCallback((user: SearchResult, position: { x: number; y: number }) => {
    const knownUser = allUsers.find(u => u.id === user.id);
    const fallbackUser: User = knownUser ?? {
      id: user.id,
      name: user.name || getPublicDisplayName(user),
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      status: 'offline',
      statusText: 'Çevrimdışı',
      avatar: user.avatar || '',
      dmPrivacyMode: user.dmPrivacyMode || (user.allowNonFriendDms === false ? 'friends_only' : 'everyone'),
      allowNonFriendDms: user.allowNonFriendDms !== false,
    };
    setProfilePopup({
      userId: user.id,
      x: position.x,
      y: position.y,
      source: 'search',
      fallbackUser,
    });
  }, [allUsers]);
  const handleFriendDm = useCallback((userId: string) => {
    setDmTargetUserId(userId);
    setDmPanelOpen(true);
  }, []);
  const handleMobileFriendDm = useCallback((userId: string) => {
    setDmTargetUserId(userId);
    setDmPanelOpen(true);
    setMobileRightOpen(false);
  }, []);
  const handleVoiceParticipantProfileClick = useCallback((userId: string, x: number, y: number) => {
    // Büyük voice room kartları: tıklayınca profil popup (arkadaş ekle, DM vs).
    // Ses seviyesi slider'ı SADECE sol kanal üye listesinde inline.
    if (userId === currentUser.id) return;
    setProfilePopup({ userId, x, y });
  }, [currentUser.id]);
  const handleToggleChatMuted = useCallback(() => {
    const next = !chatMuted;
    pendingChatMuteActorRef.current = {
      muted: next,
      actorId: currentUser.id,
      actorName: getPublicNickname(currentUser),
      at: Date.now(),
    };
    setRoomChatMuted(next);
  }, [chatMuted, currentUser]);

  useEffect(() => {
    const onShortcutAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (!action) return;

      if (action === 'toggle-room') {
        if (activeChannel) {
          removeCurrentUserFromChannel(activeChannel);
          void disconnectFromLiveKit();
          setActiveChannel(null);
          setIsServerHomeView(false);
          return;
        }
        const target = lastChannelIdRef.current;
        if (target && channels.some(channel => channel.id === target)) {
          setIsServerHomeView(false);
          if (showDiscover) setShowDiscover(false);
          void handleJoinChannel(target);
        }
        return;
      }

      if (action === 'toggle-room-chat-muted') {
        if (activeChannel) handleToggleChatMuted();
        return;
      }

      if (action === 'toggle-room-members') {
        if (activeChannel) setRoomMembersHidden(prev => !prev);
        return;
      }

      if (action === 'open-server-home') {
        handleGoHome();
        return;
      }

      if (action === 'previous-server' || action === 'next-server') {
        if (serverList.length < 2) return;
        const currentIndex = Math.max(0, serverList.findIndex(server => server.id === activeServerId));
        const delta = action === 'next-server' ? 1 : -1;
        const nextIndex = (currentIndex + delta + serverList.length) % serverList.length;
        setActiveServerId(serverList[nextIndex].id);
        setShowDiscover(false);
        return;
      }

      if (action === 'previous-room' || action === 'next-room') {
        const roomList = channels.filter(channel => !channel.isSystemChannel);
        if (roomList.length < 1) return;
        const currentIndex = activeChannel ? roomList.findIndex(channel => channel.id === activeChannel) : -1;
        const delta = action === 'next-room' ? 1 : -1;
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (baseIndex + delta + roomList.length) % roomList.length;
        setIsServerHomeView(false);
        if (showDiscover) setShowDiscover(false);
        void handleJoinChannel(roomList[nextIndex].id);
        return;
      }

      if (action === 'open-unread-dm') {
        setView('chat');
        setSettingsTarget(null);
        setSettingsServerId(null);
        setSettingsInitialTab(undefined);
        setShowDiscover(false);
        setDmPanelOpen(true);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('mayvox:open-first-unread-dm')), 80);
        return;
      }

      if (action === 'close-dm') {
        setDmPanelOpen(false);
      }
    };

    window.addEventListener('mayvox:shortcut-action', onShortcutAction);
    return () => window.removeEventListener('mayvox:shortcut-action', onShortcutAction);
  }, [
    activeChannel,
    activeServerId,
    channels,
    disconnectFromLiveKit,
    handleGoHome,
    handleJoinChannel,
    handleToggleChatMuted,
    removeCurrentUserFromChannel,
    serverList,
    setActiveChannel,
    setActiveServerId,
    setSettingsTarget,
    setView,
    showDiscover,
  ]);
  const handleRequestRoomMemberMenu = useCallback((user: typeof sortedChannelMembers[0], x: number, y: number) => {
    void loadRoomMemberContextMenu();
    setRoomMemberMenu({ user, x, y });
  }, []);

  const handleMessageContextMenu = useCallback((msg: { senderId: string; sender: string; avatar?: string }, x: number, y: number) => {
    void loadRoomMemberContextMenu();
    const user =
      sortedChannelMembers.find(member => member.id === msg.senderId) ||
      allUsers.find(candidate => candidate.id === msg.senderId) ||
      ({
        id: msg.senderId,
        name: msg.sender,
        displayName: msg.sender,
        avatar: msg.avatar || '',
        status: 'online',
        statusText: 'Online',
      } as User);
    setRoomMemberMenu({ user, x, y });
  }, [allUsers, sortedChannelMembers]);

  const getIntensity = useCallback((user: typeof sortedChannelMembers[0]): number => {
    const isMe = user.id === currentUser.id;
    if (isMe && isPttPressed && !isMuted && !currentUser.isVoiceBanned) return Math.min(1, volumeLevel / 80);
    if (user.isSpeaking) return Math.min(1, (speakingLevels[user.name] ?? 0) * 2.5);
    return 0;
  }, [currentUser.id, currentUser.isVoiceBanned, isPttPressed, isMuted, volumeLevel, speakingLevels]);

  // ── Logout ──
  const { openConfirm } = useConfirm();
  const confirmLogout = useCallback(() => {
    openConfirm({
      title: 'Çıkış yapmak istiyor musun?',
      description: 'Hesabından çıkış yapacaksın. Tekrar giriş yapman gerekecek.',
      confirmText: 'Çıkış Yap', cancelText: 'İptal', danger: true,
      onConfirm: () => { try { navigator.vibrate?.(300); } catch {} handleLogout(); },
    });
  }, [handleLogout, openConfirm]);

  const handleClearRoomActivityLog = useCallback(() => {
    if (!activeServerId || !activeChannel || !canClearRoomActivityLog || roomActivityClearing) return;
    openConfirm({
      title: 'Son olayları temizle',
      description: 'Bu odadaki kayıtlı son olay geçmişi temizlenecek.',
      confirmText: 'Temizle',
      cancelText: 'İptal',
      danger: true,
      onConfirm: async () => {
        setRoomActivityClearing(true);
        try {
          await clearRoomActivityEvents(activeServerId, activeChannel);
          clearRoomActivities();
          setToastMsg('Son olaylar temizlendi');
        } catch (err) {
          setToastMsg(err instanceof Error ? err.message : 'Son olaylar temizlenemedi');
        } finally {
          setRoomActivityClearing(false);
        }
      },
    });
  }, [activeServerId, activeChannel, canClearRoomActivityLog, roomActivityClearing, openConfirm, clearRoomActivities, setToastMsg]);

  const handleReportRoomMessage = useCallback((msg: { id: string; sender?: string }) => {
    if (!msg.id) return;
    openConfirm({
      title: 'Mesajı bildir',
      description: `${msg.sender || 'Bu kullanıcı'} tarafından gönderilen mesaj moderasyon ekibine bildirilecek.`,
      confirmText: 'Bildir',
      cancelText: 'İptal',
      danger: true,
      onConfirm: () => {
        reportChatMessage(msg.id);
        setReportedRoomMessageIds(prev => {
          const next = new Set(prev);
          next.add(msg.id);
          return next;
        });
        setToastMsg('Mesaj bildirildi');
      },
    });
  }, [openConfirm, reportChatMessage, setToastMsg]);

  const handleSelectRoomActivity = useCallback((item: { messageId?: string }) => {
    if (!item.messageId) return;
    const selector = `[data-room-message-id="${CSS.escape(item.messageId)}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      setToastMsg('Bu mesaj artık sohbet geçmişinde görünmüyor');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedRoomMessageId(item.messageId);
    window.setTimeout(() => {
      setHighlightedRoomMessageId(prev => prev === item.messageId ? null : prev);
    }, 2600);
  }, [setToastMsg]);

  // ── Invitation modal callbacks ──
  const handleInvitationDecline = useCallback(() => {
    if (invitationModal) {
      sendRealtimeBroadcast('invite-rejected', {
        inviterId: invitationModal.inviterId,
        inviteeId: currentUser.id,
        inviteeName: getPublicDisplayName(currentUser),
      });
    }
    // Reject sesi — stopInviteRingtone effect'i zaten modal=null'da tetiklenir.
    playReject();
    setInvitationModal(null);
  }, [invitationModal, currentUser, setInvitationModal]);

  const handleInvitationAccept = useCallback(() => {
    if (invitationModal) {
      sendRealtimeBroadcast('invite-accepted', {
        inviterId: invitationModal.inviterId,
        inviteeId: currentUser.id,
      });
    }
    if (invitationModal) {
      handleJoinChannel(invitationModal.roomId, true);
      window.dispatchEvent(new CustomEvent('mayvox:mobile-invite-accepted'));
    }
    setInvitationModal(null);
  }, [invitationModal, currentUser.id, handleJoinChannel, setInvitationModal]);

  // ── Context menu callbacks ──
  const handleEditRoom = useCallback((channel: { id: string; name: string; maxUsers?: number; isInviteOnly?: boolean; isHidden?: boolean; mode?: string; iconColor?: string; iconName?: string }) => {
    void loadChatViewRoomModal();
    setRoomModal({ isOpen: true, type: 'edit', channelId: channel.id, name: channel.name, maxUsers: channel.maxUsers || 0, isInviteOnly: channel.isInviteOnly || false, isHidden: channel.isHidden || false, mode: channel.mode || 'social', iconColor: channel.iconColor ?? getChannelIconColor(channel.id, channel.mode), iconName: channel.iconName ?? getChannelIconName(channel.id, channel.mode) });
  }, [setRoomModal]);

  const handleSetPasswordModal = useCallback((channelId: string) => {
    void loadChatViewPasswordModal();
    setPasswordModal({ type: 'set', channelId }); setContextMenu(null);
  }, [setPasswordModal, setContextMenu]);

  const mobileDefaultShellView: MobileShellView = currentChannel && !isServerHomeView ? 'room' : 'home';
  const mobileInitialPhoneLayout = FORCE_MOBILE && typeof window !== 'undefined' && window.innerWidth < 640;
  const [mobilePhoneLayout, setMobilePhoneLayout] = useState(mobileInitialPhoneLayout);
  const [mobileShellViewState, setMobileShellViewState] = useState<MobileShellView>(mobileDefaultShellView);
  const [mobilePreviousShellView, setMobilePreviousShellView] = useState<MobileShellView>('home');
  const [mobileChannelSheetOpen, setMobileChannelSheetOpen] = useState(() => !mobileInitialPhoneLayout);
  const [mobileSocialSheetOpen, setMobileSocialSheetOpen] = useState(() => !mobileInitialPhoneLayout);
  const [mobileServerActionsOpen, setMobileServerActionsOpen] = useState(false);
  const mobileLastPhonePanelRef = useRef<'channels' | 'social' | null>(null);
  const mobileChannelSheetPinned = true;
  const mobileSocialSheetPinned = true;
  const mobileServerSwitcherList = serverList;
  const mobileDisplayedActiveServerData = activeServerData;
  const [mobileServerMembers, setMobileServerMembers] = useState<ServerMember[]>([]);
  const [mobileServerMembersRequested, setMobileServerMembersRequested] = useState(!FORCE_MOBILE);
  const [mobileServerHomeDetailOpen, setMobileServerHomeDetailOpen] = useState(false);

  useEffect(() => {
    if (!mobilePhoneLayout) {
      roomActivityPhoneDefaultAppliedRef.current = false;
      return;
    }
    if (!roomActivityPanelOpen || roomActivityPhoneDefaultAppliedRef.current) return;
    roomActivityPhoneDefaultAppliedRef.current = true;
    setRoomActivityPanelRatio(prev => (prev < 44 ? 44 : Math.min(prev, 48)));
  }, [mobilePhoneLayout, roomActivityPanelOpen]);

  useEffect(() => {
    if (!FORCE_MOBILE || typeof window === 'undefined') return;
    const syncPhoneLayout = () => {
      const nextPhoneLayout = window.innerWidth < 640;
      setMobilePhoneLayout(prev => {
        if (prev === nextPhoneLayout) return prev;
        if (nextPhoneLayout) {
          setMobileChannelSheetOpen(false);
          setMobileSocialSheetOpen(false);
        } else {
          setMobileChannelSheetOpen(true);
          setMobileSocialSheetOpen(true);
        }
        return nextPhoneLayout;
      });
    };
    syncPhoneLayout();
    window.addEventListener('resize', syncPhoneLayout);
    window.addEventListener('orientationchange', syncPhoneLayout);
    return () => {
      window.removeEventListener('resize', syncPhoneLayout);
      window.removeEventListener('orientationchange', syncPhoneLayout);
    };
  }, []);

  useEffect(() => {
    if (!mobilePhoneLayout || !mobileChannelSheetOpen || !mobileSocialSheetOpen) return;
    if (mobileLastPhonePanelRef.current === 'social') {
      setMobileChannelSheetOpen(false);
    } else {
      setMobileSocialSheetOpen(false);
    }
  }, [mobileChannelSheetOpen, mobilePhoneLayout, mobileSocialSheetOpen]);
  const mobileUserRoomCount = useMemo(
    () => channels.filter(channel => channel.ownerId === currentUser.id).length,
    [channels, currentUser.id]
  );
  const mobileServerMemberRoleById = useMemo(
    () => new Map(mobileServerMembers.map(member => [member.userId, member.role])),
    [mobileServerMembers]
  );
  const mobileServerMemberItems = useMemo(() => {
    const memberById = new Map<string, ServerMember>();
    for (const member of mobileServerMembers) memberById.set(member.userId, member);
    if (activeServerId) {
      for (const user of allUsers) {
        if (user.serverId !== activeServerId || memberById.has(user.id)) continue;
        memberById.set(user.id, {
          userId: user.id,
          username: user.name,
          displayName: getPublicDisplayName(user),
          avatar: user.avatar,
          role: 'member',
        } as ServerMember);
      }
    }
    return [...memberById.values()]
      .map(member => {
        const user = userById.get(member.userId);
        const isOnline = user ? mobileIsFriendOnline(user) : false;
        const lastSeenText = !isOnline && user ? mobileFormatLastSeen(user) : undefined;
        const status: 'online' | 'offline' | 'idle' | 'dnd' = isOnline
          ? user?.status === 'away'
            ? 'idle'
            : user?.status === 'busy'
              ? 'dnd'
              : 'online'
          : 'offline';
        return {
          id: member.userId,
          name: user ? getPublicDisplayName(user) : (member.displayName || member.username || 'Uye'),
          avatarUrl: user?.avatar || member.avatar || undefined,
          status,
          subtitle: isOnline
            ? status === 'idle'
              ? 'AFK'
              : status === 'dnd'
                ? 'Rahatsız Etmeyin'
                : 'Online'
            : user
              ? lastSeenText
              : 'Cevrimdisi',
          statusText: user?.statusText,
          serverName: null,
          gameActivity: isOnline ? user?.gameActivity : undefined,
          lastSeenText,
          platform: member.userId === currentUser.id ? (currentUser.platform ?? 'mobile') : user?.platform,
          role: getUserRoleBadge({ role: member.role }),
        };
      })
      .sort((a, b) => {
        const aOnline = a.status !== 'offline';
        const bOnline = b.status !== 'offline';
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [activeServerId, allUsers, currentUser.id, currentUser.platform, mobileFormatLastSeen, mobileIsFriendOnline, mobileServerMembers, userById]);
  const mobileServerOnlineCount = useMemo(
    () => mobileServerMemberItems.filter(member => member.status !== 'offline').length,
    [mobileServerMemberItems]
  );
  const mobileKnownServerOnlineCount = useMemo(() => {
    if (!activeServerId) return 0;
    const onlineIds = new Set<string>();
    for (const user of allUsers) {
      if (user.serverId === activeServerId && mobileIsFriendOnline(user)) onlineIds.add(user.id);
    }
    if (mobileIsFriendOnline(currentUser)) onlineIds.add(currentUser.id);
    return onlineIds.size;
  }, [activeServerId, allUsers, currentUser, mobileIsFriendOnline]);
  const handleMobileSocialTabChange = useCallback((tab: 'dm' | 'friends' | 'serverMembers' | 'requests' | 'online' | 'blocked' | 'messageSettings') => {
    if (tab === 'serverMembers') setMobileServerMembersRequested(true);
  }, []);
  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1) return;
    if (mobileSocialSheetOpen || mobileShellViewState === 'social') setMobileServerMembersRequested(true);
  }, [mobileShellViewState, mobileSocialSheetOpen]);
  const mobileChannelSheetItems = useMemo(() => {
    return visibleChannels.map(channel => {
      const baseMembers = (channel.members || [])
        .map(memberKey => {
          const user = userById.get(memberKey) ?? userByName.get(memberKey);
          if (!user) return null;
          const serverRole = mobileServerMemberRoleById.get(user.id);
          return serverRole ? { ...user, role: serverRole } : user;
        })
        .filter((user): user is User => Boolean(user));
      return {
        id: channel.id,
        name: channel.name,
        type: channel.mode || 'social',
        iconName: channel.iconName ?? getDefaultChannelIconName(channel.mode || 'social'),
        iconColor: channel.iconColor ?? getDefaultChannelIconColor(channel.mode || 'social'),
        active: activeChannel === channel.id,
        memberCount: channel.userCount ?? channel.members?.length,
        members: baseMembers.slice(0, 5),
      };
    });
  }, [activeChannel, mobileServerMemberRoleById, userById, userByName, visibleChannels]);
  const mobileActivePlan = activeServerData?.plan;
  const mobileRoomLimit = getUserRoomLimit(mobileActivePlan);
  const mobileAtRoomLimit = mobileUserRoomCount >= mobileRoomLimit;
  const setMobileShellView = useCallback((nextView: MobileShellView) => {
    React.startTransition(() => {
      setMobileShellViewState(prev => {
        if (prev === nextView) return prev;
        setMobilePreviousShellView(prev);
        return nextView;
      });
    });
  }, []);

  const closeMobileSettingsToPrevious = useCallback(() => {
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
    setSettingsTarget(null);
    if (view === 'settings') setView('chat');
    const returnView = mobilePreviousShellView === 'settings' || mobilePreviousShellView === 'profile'
      ? mobileDefaultShellView
      : mobilePreviousShellView;
    setMobileShellView(returnView);
  }, [mobileDefaultShellView, mobilePreviousShellView, setMobileShellView, setSettingsTarget, setView, view]);

  const handleMobileGoHome = useCallback(() => {
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setMobileServerHomeDetailOpen(false);
    setMobileShellView('home');
    window.dispatchEvent(new CustomEvent('mayvox:mobile-server-home-reset'));
  }, [mobilePhoneLayout, setMobileShellView]);

  const handleMobileSelectServer = useCallback((serverId: string) => {
    setMobileServerActionsOpen(false);
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setActiveServerId(serverId);
    setShowDiscover(false);
    setMobileServerHomeDetailOpen(false);
    setMobileShellView('home');
  }, [mobilePhoneLayout, setActiveServerId, setMobileShellView]);

  const handleMobileOpenRoom = useCallback(() => {
    if (currentChannel && !isServerHomeView) {
      setMobileChannelSheetOpen(!mobilePhoneLayout);
      setMobileSocialSheetOpen(!mobilePhoneLayout);
      setMobileShellView('room');
      return;
    }
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
  }, [currentChannel, isServerHomeView, mobilePhoneLayout, setMobileShellView]);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1 || typeof window === 'undefined') return;
    const handleAcceptedInvite = () => {
      setView('chat');
      setSettingsTarget(null);
      setSettingsServerId(null);
      setSettingsInitialTab(undefined);
      setShowDiscover(false);
      setIsServerHomeView(false);
      setMobileServerActionsOpen(false);
      setMobileChannelSheetOpen(!mobilePhoneLayout);
      setMobileSocialSheetOpen(!mobilePhoneLayout);
      setMobileShellView('room');
    };
    window.addEventListener('mayvox:mobile-invite-accepted', handleAcceptedInvite);
    return () => window.removeEventListener('mayvox:mobile-invite-accepted', handleAcceptedInvite);
  }, [mobilePhoneLayout, setMobileShellView, setSettingsTarget, setView]);

  const handleMobileOpenChannels = useCallback(() => {
    setMobileChannelSheetOpen(open => mobilePhoneLayout ? !open : true);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
  }, [mobilePhoneLayout]);

  const handleMobileOpenFriends = useCallback(() => {
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(open => mobilePhoneLayout ? !open : true);
  }, [mobilePhoneLayout]);

  const handleMobileOpenChannelsPanel = useCallback(() => {
    setMobileServerActionsOpen(false);
    mobileLastPhonePanelRef.current = 'channels';
    setMobileChannelSheetOpen(open => !open);
    setMobileSocialSheetOpen(false);
  }, []);

  const handleMobileOpenSocialPanel = useCallback(() => {
    setMobileServerActionsOpen(false);
    mobileLastPhonePanelRef.current = 'social';
    setMobileSocialSheetOpen(open => !open);
    setMobileChannelSheetOpen(false);
  }, []);

  const handleMobileRevealChannelsPanel = useCallback(() => {
    setMobileServerActionsOpen(false);
    mobileLastPhonePanelRef.current = 'channels';
    setMobileChannelSheetOpen(true);
    setMobileSocialSheetOpen(false);
  }, []);

  const handleMobileRevealSocialPanel = useCallback(() => {
    setMobileServerActionsOpen(false);
    mobileLastPhonePanelRef.current = 'social';
    setMobileSocialSheetOpen(true);
    setMobileChannelSheetOpen(false);
  }, []);

  const handleMobileOpenServerActions = useCallback(() => {
    setMobileChannelSheetOpen(false);
    setMobileSocialSheetOpen(false);
    setMobileServerActionsOpen(open => !open);
  }, []);

  const handleMobileConfirmLeaveServer = useCallback(() => {
    if (!activeServerId) return;
    setMobileServerActionsOpen(false);
    openConfirm({
      title: 'Sunucudan ayrıl',
      description: `${activeServerData?.name || 'Bu sunucu'} sunucusundan ayrılmak istiyor musun?`,
      confirmText: 'Ayrıl',
      cancelText: 'Vazgeç',
      danger: true,
      onConfirm: () => handleLeaveServer(activeServerId),
    });
  }, [activeServerData?.name, activeServerId, handleLeaveServer, openConfirm]);

  const handleMobileOpenSettings = useCallback(() => {
    void loadSettingsView();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    if ((mobileShellViewState === 'settings' || view === 'settings') && !settingsServerId) {
      closeMobileSettingsToPrevious();
      return;
    }
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
    setSettingsTarget('app');
    setMobileShellView('settings');
  }, [closeMobileSettingsToPrevious, mobilePhoneLayout, mobileShellViewState, setMobileShellView, setSettingsTarget, settingsServerId, view]);

  const handleMobileOpenServerSettings = useCallback(() => {
    void loadServerSettings();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    if ((mobileShellViewState === 'settings' || view === 'settings') && settingsServerId) {
      closeMobileSettingsToPrevious();
      return;
    }
    setSettingsTarget(null);
    setSettingsInitialTab(undefined);
    if (activeServerId && activeServerCanOpenSettings) {
      setSettingsServerId(activeServerId);
    } else {
      setSettingsServerId(null);
      setSettingsTarget('app');
    }
    setMobileShellView('settings');
  }, [activeServerCanOpenSettings, activeServerId, closeMobileSettingsToPrevious, mobilePhoneLayout, mobileShellViewState, setMobileShellView, setSettingsTarget, settingsServerId, view]);

  const handleMobileServerActionsSettings = useCallback(() => {
    setMobileServerActionsOpen(false);
    handleMobileOpenServerSettings();
  }, [handleMobileOpenServerSettings]);

  const handleMobileOpenAccountSettings = useCallback(() => {
    void loadSettingsView();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setSettingsServerId(null);
    setSettingsInitialTab(undefined);
    setSettingsTarget('account');
    setMobileShellView('settings');
  }, [mobilePhoneLayout, setMobileShellView, setSettingsTarget]);

  const handleMobileOpenProfile = useCallback(() => {
    void loadMobileProfileScreen();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setMobileShellView('profile');
  }, [mobilePhoneLayout, setMobileShellView]);

  const handleMobileOpenDiscover = useCallback(() => {
    void loadMobileDiscoverScreen();
    setMobileShellView('discover');
  }, [setMobileShellView]);

  const handleMobileOpenSocial = useCallback(() => {
    void loadDMPanel();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setMobileShellView('social');
  }, [mobilePhoneLayout, setMobileShellView]);

  const handleMobileOpenNotifications = useCallback(() => {
    void loadMobileNotificationsScreen();
    void loadNotificationBell();
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setMobileShellView('notifications');
  }, [mobilePhoneLayout, setMobileShellView]);

  const handleMobileLeaveRoom = useCallback(() => {
    removeCurrentUserFromChannel(activeChannel);
    setActiveChannel(null);
    setMobileShellView('home');
    void disconnectFromLiveKit();
  }, [activeChannel, disconnectFromLiveKit, removeCurrentUserFromChannel, setActiveChannel, setMobileShellView]);

  const handleMobileToggleMute = useCallback(() => {
    if (isMuted && isDeafened) setIsDeafened(false);
    setIsMuted(!isMuted);
  }, [isDeafened, isMuted, setIsDeafened, setIsMuted]);

  const handleMobileToggleDeafen = useCallback(() => {
    setIsDeafened(!isDeafened);
  }, [isDeafened, setIsDeafened]);

  const handleMobileToggleNoiseSuppression = useCallback(() => {
    setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled);
  }, [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled]);

  const handleMobileChannelSheetClose = useCallback(() => {
    setMobileChannelSheetOpen(!mobilePhoneLayout);
  }, [mobilePhoneLayout]);

  const handleMobileSelectChannel = useCallback((channelId: string) => {
    handleSidebarChannelClick(channelId);
    setMobileChannelSheetOpen(!mobilePhoneLayout);
    setMobileSocialSheetOpen(!mobilePhoneLayout);
    setMobileShellView('room');
  }, [handleSidebarChannelClick, mobilePhoneLayout, setMobileShellView]);

  const handleMobileOpenChannelMenu = useCallback((channelId: string, position: { x: number; y: number }) => {
    void loadChatViewContextMenu();
    setContextMenu({ x: position.x, y: position.y, channelId } as any);
  }, [setContextMenu]);

  const handleMobileCreateChannel = useCallback(() => {
    if (mobileAtRoomLimit) {
      setToastMsg(roomLimitMessage(mobileActivePlan));
      return;
    }
    void loadChatViewRoomModal();
    setRoomModal({
      isOpen: true,
      type: 'create',
      name: '',
      maxUsers: 0,
      isInviteOnly: false,
      isHidden: false,
      mode: 'social',
      iconColor: getDefaultChannelIconColor('social'),
      iconName: getDefaultChannelIconName('social'),
    });
    setMobileChannelSheetOpen(true);
  }, [mobileActivePlan, mobileAtRoomLimit, setRoomModal, setToastMsg]);

  const handleMobileStatusChange = useCallback((nextStatus: string) => {
    if (!currentUser.id) return;
    if (activeChannel && nextStatus === 'Çevrimdışı') {
      setToastMsg('Oda içindeyken Çevrimdışı seçilemez');
      return;
    }

    const updatedUser = { ...currentUser, statusText: nextStatus };
    setCurrentUser(updatedUser);
    setAllUsers(prev => prev.map(user => user.id === currentUser.id ? updatedUser : user));
    broadcastModeration(currentUser.id, { statusText: nextStatus });
  }, [activeChannel, broadcastModeration, currentUser, setAllUsers, setCurrentUser, setToastMsg]);

  const handleMobileSettingsBack = useCallback(() => {
    closeMobileSettingsToPrevious();
  }, [closeMobileSettingsToPrevious]);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1) return;
    if (mobileShellViewState === 'room' && (!currentChannel || isServerHomeView)) {
      setMobileShellViewState('home');
    }
  }, [currentChannel, isServerHomeView, mobileShellViewState]);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1 || typeof window === 'undefined') return;
    const handleServerHomeDetail = (event: Event) => {
      setMobileServerHomeDetailOpen(!!(event as CustomEvent<{ open?: boolean }>).detail?.open);
    };
    window.addEventListener('mayvox:mobile-server-home-detail', handleServerHomeDetail);
    return () => window.removeEventListener('mayvox:mobile-server-home-detail', handleServerHomeDetail);
  }, []);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1) return;
    if (mobileShellViewState !== 'home') {
      setMobileServerHomeDetailOpen(false);
    }
  }, [mobileShellViewState]);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1 || typeof window === 'undefined') return;

    (window as typeof window & { __mayvoxDmPanelOpen?: boolean }).__mayvoxDmPanelOpen = dmPanelOpen;
  }, [dmPanelOpen]);

  useEffect(() => {
    if (!FORCE_MOBILE || !ENABLE_MOBILE_SHELL_V1 || typeof window === 'undefined') return;

    const marker = { mayvoxMobileBackGuard: true };
    const ensureBackGuard = () => {
      if (window.history.state?.mayvoxMobileBackGuard) return;
      window.history.pushState(marker, document.title);
    };

    ensureBackGuard();

    const handleAndroidBack = () => {
      const profileMenuHandledAt = (window as typeof window & { __mayvoxProfileMenuBackHandledAt?: number }).__mayvoxProfileMenuBackHandledAt ?? 0;
      const serverHomeHandledAt = (window as typeof window & { __mayvoxServerHomeBackHandledAt?: number }).__mayvoxServerHomeBackHandledAt ?? 0;
      if (Date.now() - profileMenuHandledAt < 250 || Date.now() - serverHomeHandledAt < 250) {
        window.setTimeout(ensureBackGuard, 0);
        return;
      }

      if (showJoinModal) {
        setShowJoinModal(false);
      } else if (showCreateModal) {
        setShowCreateModal(false);
        setCreateError('');
      } else if (profilePopup) {
        setProfilePopup(null);
      } else if (dmPanelOpen) {
        setDmPanelOpen(false);
        setDmTargetUserId(null);
      } else if (roomModal.isOpen) {
        setRoomModal(prev => ({ ...prev, isOpen: false }));
      } else if (mobileShellViewState !== 'home') {
        setMobileShellView('home');
      } else {
        setMobileChannelSheetOpen(true);
        setMobileSocialSheetOpen(true);
      }

      window.setTimeout(ensureBackGuard, 0);
    };

    window.addEventListener('mayvox:android-back', handleAndroidBack);
    window.addEventListener('popstate', handleAndroidBack);
    return () => {
      window.removeEventListener('mayvox:android-back', handleAndroidBack);
      window.removeEventListener('popstate', handleAndroidBack);
    };
  }, [
    dmPanelOpen,
    mobileShellViewState,
    profilePopup,
    roomModal.isOpen,
    setMobileShellView,
    setRoomModal,
    showCreateModal,
    showJoinModal,
  ]);

  useEffect(() => {
    if (!activeServerId) return;
    const shouldLoadMobilePreview = FORCE_MOBILE && ENABLE_MOBILE_SHELL_V1 && mobileServerMembersRequested;
    const shouldLoadDesktop = !FORCE_MOBILE;
    if (!shouldLoadMobilePreview && !shouldLoadDesktop) return;
    let cancelled = false;
    void getMembers(activeServerId)
      .then(members => {
        if (!cancelled) setMobileServerMembers(members);
      })
      .catch(() => {
        if (!cancelled) setMobileServerMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId, mobileServerMembersRequested]);

  if (FORCE_MOBILE && ENABLE_MOBILE_SHELL_V1) {
    const mobileShellView: MobileShellView = view === 'settings' ? 'settings' : mobileShellViewState;
    const mobileServerMemberCount = activeServerData?.memberCount ?? mobileServerMembers.length ?? mobileServerMemberItems.length;
    const mobileServerVisibleOnlineCount = mobileServerMembers.length
      ? mobileServerOnlineCount
      : Math.max(mobileKnownServerOnlineCount, activeServerData?.activeCount ?? 0, mobileServerOnlineCount);

    return (
      <>
      <React.Suspense fallback={<LazyPanelFallback label="Tablet arayüzü yükleniyor" />}>
      <MobileAppShell
        phoneLayout={mobilePhoneLayout}
        activeServerName={mobileDisplayedActiveServerData?.name}
        activeServerAvatarUrl={mobileDisplayedActiveServerData?.avatarUrl}
        activeServerShortName={mobileDisplayedActiveServerData?.shortName}
        activeServerMotto={mobileDisplayedActiveServerData?.motto}
        serverList={mobileServerSwitcherList}
        activeServerId={activeServerId}
        activeChannelName={currentChannel?.name}
        hasActiveChannel={!!activeChannel}
        activeChannelMode={currentChannel?.mode}
        activeChannelIconName={currentChannel?.iconName ?? (currentChannel ? getDefaultChannelIconName(getRoomModeConfig(currentChannel.mode).id) : undefined)}
        activeChannelIconColor={currentChannel?.iconColor ?? (currentChannel ? getChannelIconColor(currentChannel.id, currentChannel.mode || getRoomModeConfig(currentChannel.mode).id) : undefined)}
        cardStyle={cardStyle}
        forceShowHomeButton={mobileServerHomeDetailOpen}
        userAvatarUrl={hasCustomAvatar(currentUser.avatar) ? currentUser.avatar : undefined}
        userLabel={getPublicDisplayName(currentUser)}
        userStatusText={currentUser.statusText || (currentUser.status === 'online' ? 'Online' : 'Çevrimdışı')}
        currentView={mobileShellView}
        tabs={undefined}
        activeTabKey={undefined}
        onOpenChannels={handleMobileOpenChannels}
        phoneChannelPanelOpen={mobileChannelSheetOpen}
        phoneSocialPanelOpen={mobileSocialSheetOpen}
        onOpenPhoneChannelsPanel={handleMobileOpenChannelsPanel}
        onOpenPhoneSocialPanel={handleMobileOpenSocialPanel}
        onRevealPhoneChannelsPanel={handleMobileRevealChannelsPanel}
        onRevealPhoneSocialPanel={handleMobileRevealSocialPanel}
        onOpenServerActions={handleMobileOpenServerActions}
        onLeaveServer={!mobilePhoneLayout ? handleMobileConfirmLeaveServer : undefined}
        onOpenRoom={handleMobileOpenRoom}
        onOpenDiscover={handleMobileOpenDiscover}
        onOpenSocial={handleMobileOpenSocial}
        onOpenNotifications={handleMobileOpenNotifications}
        onOpenFriends={handleMobileOpenFriends}
        onOpenSettings={handleMobileOpenSettings}
        onOpenServerSettings={handleMobileOpenServerSettings}
        onOpenProfile={handleMobileOpenProfile}
        onOpenAccountSettings={handleMobileOpenAccountSettings}
        currentUserId={currentUser.id}
        onSearchUserClick={handleSearchUserProfileClick}
        onChangeStatus={handleMobileStatusChange}
        onOpenQuickActions={handleMobileOpenProfile}
        onGoHome={handleMobileGoHome}
        onSelectServer={handleMobileSelectServer}
        onReturnToRoom={handleMobileOpenRoom}
        onLeaveRoom={handleMobileLeaveRoom}
        onTabChange={undefined}
        onLogout={confirmLogout}
        disableContentSwipe={mobileChannelSheetOpen || mobileSocialSheetOpen}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isPttPressed={isPttPressed}
        isNoiseSuppressionEnabled={isNoiseSuppressionEnabled}
        onToggleMute={handleMobileToggleMute}
        onToggleDeafen={handleMobileToggleDeafen}
        onPttChange={setIsPttPressed}
        onToggleNoiseSuppression={handleMobileToggleNoiseSuppression}
        onCycleCardStyle={cycleCardStyle}
      >
        <div className="relative flex h-full min-h-0 w-full overflow-hidden">
          {mobilePhoneLayout && mobileServerActionsOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[85] cursor-default bg-transparent"
                aria-label="Sunucu seçeneklerini kapat"
                onClick={() => setMobileServerActionsOpen(false)}
              />
              <div
                className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+54px)] z-[90] w-[210px] -translate-x-1/2 overflow-hidden rounded-[16px] border border-[rgba(var(--glass-tint),0.13)] p-1.5"
                style={{
                  background: 'linear-gradient(180deg, rgba(var(--glass-tint),0.070), rgba(var(--glass-tint),0.026)), rgba(var(--theme-bg-rgb),0.96)',
                  boxShadow: '0 18px 42px rgba(0,0,0,0.34), inset 0 1px 0 rgba(var(--glass-tint),0.08)',
                  backdropFilter: 'blur(18px) saturate(122%)',
                  WebkitBackdropFilter: 'blur(18px) saturate(122%)',
                }}
                onClick={event => event.stopPropagation()}
              >
                {activeServerCanOpenSettings && (
                  <button
                    type="button"
                    onClick={handleMobileServerActionsSettings}
                    className="flex h-9 w-full items-center rounded-[11px] px-3 text-left text-[12px] font-bold text-[var(--theme-text)]/86 transition-colors hover:bg-[rgba(var(--glass-tint),0.06)]"
                  >
                    Sunucu ayarları
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleMobileConfirmLeaveServer}
                  className="flex h-9 w-full items-center rounded-[11px] px-3 text-left text-[12px] font-bold text-red-300/88 transition-colors hover:bg-red-500/10"
                >
                  Sunucudan ayrıl
                </button>
              </div>
            </>
          )}
          {!mobilePhoneLayout && (
            <MobileChannelSheet
              variant="inline"
              open={mobileChannelSheetOpen}
              connectionLevel={connectionLevel}
              connectionLatencyMs={connectionLatencyMs}
              connectionJitterMs={connectionJitterMs}
              isConnecting={isConnecting}
              isActiveChannel={!!activeChannel}
              channels={mobileChannelSheetItems}
              onClose={handleMobileChannelSheetClose}
              onSelectChannel={handleMobileSelectChannel}
              onOpenChannelMenu={currentUser.isAdmin ? handleMobileOpenChannelMenu : undefined}
              pinned={mobileChannelSheetPinned}
              createTitle={mobileAtRoomLimit ? roomLimitMessage(mobileActivePlan) : undefined}
              createDisabled={mobileAtRoomLimit}
              onOpenDiscover={handleMobileOpenDiscover}
              onCreateChannel={handleMobileCreateChannel}
            />
          )}

          <div
            className={`min-w-0 flex-1 overflow-hidden ${mobilePhoneLayout ? 'px-1 pb-[76px]' : 'px-3 pb-16 sm:px-4'}`}
            onClick={() => {
              if (mobileShellView === 'discover' || mobileShellView === 'settings' || mobileShellView === 'profile' || mobileShellView === 'notifications') return;
              if (mobilePhoneLayout) return;
              setMobileChannelSheetOpen(true);
              setMobileSocialSheetOpen(true);
            }}
          >
            {mobileShellView === 'settings' ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <React.Suspense fallback={<LazyPanelFallback label="Ayarlar yükleniyor" />}>
                  {settingsServerId ? (
                    <ServerSettings
                      serverId={settingsServerId}
                      onClose={handleMobileSettingsBack}
                      onServerUpdated={() => refreshServers({ force: true })}
                      onServerDeleted={() => {
                        setSettingsServerId(null);
                        setSettingsInitialTab(undefined);
                        setActiveServerId('');
                        refreshServers({ force: true });
                        setMobileShellView('home');
                      }}
                      initialTab={settingsInitialTab}
                    />
                  ) : (
                    <SettingsView />
                  )}
                </React.Suspense>
              </div>
            ) : mobileShellView === 'discover' ? (
              <React.Suspense fallback={<LazyPanelFallback label="Keşfet yükleniyor" />}>
                <MobileDiscoverScreen
                  activeServerId={activeServerId}
                  canCreate={canCreateServer}
                  onCreateServer={() => { if (canCreateServer) setShowCreateModal(true); }}
                  onJoinModal={() => setShowJoinModal(true)}
                  onJoinSuccess={(serverId) => {
                    refreshServers({ force: true });
                    setActiveServerId(serverId);
                    setMobileShellView('home');
                  }}
                />
              </React.Suspense>
            ) : mobileShellView === 'profile' ? (
              <React.Suspense fallback={<LazyPanelFallback label="Profil yükleniyor" />}>
                <MobileProfileScreen
                  displayName={getPublicDisplayName(currentUser)}
                  username={currentUser.email || currentUser.name}
                  avatarUrl={hasCustomAvatar(currentUser.avatar) ? currentUser.avatar : undefined}
                  status={currentUser.status === 'online' ? 'online' : 'offline'}
                  subtitle={currentUser.statusText || undefined}
                  serverName={activeServerData?.name}
                  channelName={currentChannel?.name}
                  onOpenDm={() => setDmPanelOpen(true)}
                  onOpenSettings={handleMobileOpenSettings}
                  onEditProfile={handleMobileOpenSettings}
                  onLogout={confirmLogout}
                />
              </React.Suspense>
            ) : mobileShellView === 'social' ? (
              <React.Suspense fallback={<LazyPanelFallback label="Arkadaşlar yükleniyor" />}>
                <MobileSocialScreen
                  dmCount={dmUnreadCount}
                  friendCount={friendUsers.length}
                  onlineCount={mobileOnlineFriendCount}
                  requestCount={notifications.friendRequestCount}
                  serverName={activeServerData?.name}
                  serverMemberCount={mobileServerMemberCount}
                  serverOnlineCount={mobileServerVisibleOnlineCount}
                  friendItems={mobileFriendItems}
                  serverMemberItems={mobileServerMemberItems}
                  onOpenDm={(id) => { setDmTargetUserId(id); setDmPanelOpen(true); }}
                  onOpenProfile={handleFriendProfileClick}
                  onOpenRequests={() => {}}
                  onTabChange={handleMobileSocialTabChange}
                />
              </React.Suspense>
            ) : mobileShellView === 'notifications' ? (
              <React.Suspense fallback={<LazyPanelFallback label="Bildirimler yükleniyor" />}>
                <MobileNotificationsScreen
                  unreadCount={dmUnreadCount + notifications.friendRequestCount}
                  dmCount={dmUnreadCount}
                  requestCount={notifications.friendRequestCount}
                  serverCount={0}
                  systemCount={0}
                />
              </React.Suspense>
            ) : mobileShellView === 'room' ? (
              <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
                <div className="mv-room-ambient absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                  <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4) 0%, transparent 65%)` }} />
                  <div className="absolute bottom-[10%] right-[15%] w-[300px] h-[300px] rounded-full opacity-[0.012]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.3) 0%, transparent 70%)` }} />
                </div>
                <div ref={roomActivitySplitRef} className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
                  <React.Suspense fallback={<LazyPanelFallback label="Oda yükleniyor" />}>
                    <VoiceParticipants forceMobile={FORCE_MOBILE} members={roomMembersHidden ? [] : sortedChannelMembers} currentUser={currentUser}
                      isPttPressed={isPttPressed} isMuted={isMuted} isDeafened={isDeafened} isVoiceBanned={!!currentUser.isVoiceBanned}
                      volumeLevel={volumeLevel} speakingLevels={speakingLevels} dominantSpeakerId={dominantSpeakerId}
                      currentChannel={currentChannel} getIntensity={getIntensity} getEffectiveStatus={getEffectiveStatus}
                      cardScale={cardScale} cardStyle={cardStyle} onProfileClick={handleVoiceParticipantProfileClick}
                      onKickUser={handleKickUser} isAdmin={currentUser.isAdmin || false} isPrimaryAdmin={currentUser.isPrimaryAdmin || false} isModerator={currentUser.isModerator || false}
                      onRequestMemberMenu={handleRequestRoomMemberMenu}
                      activeChannel={activeChannel} channels={channels} chatMessages={chatMessages} chatMuted={chatMuted} chatMuteRank={chatMuteRank}
                      onToggleChatMuted={handleToggleChatMuted} editingMsgId={editingMsgId} editingText={editingText}
                      onEditingTextChange={setEditingText} onStartEdit={startEditMessage} onSaveEdit={saveEditMessage} onCancelEdit={cancelEdit}
                      onDeleteMessage={deleteChatMessage} onClearAll={clearAllMessages} onSendMessage={sendChatMessage}
                      onReportMessage={handleReportRoomMessage}
                      onMessageContextMenu={handleMessageContextMenu}
                      reportedMessageIds={reportedRoomMessageIds}
                      chatInput={chatInput} onChatInputChange={setChatInput} chatScrollRef={chatScrollRef} onChatScroll={handleChatScroll}
                      isAtBottom={isAtBottom} newMsgCount={newMsgCount} onScrollToBottom={scrollToBottom}
                      isFloodCooling={isFloodCooling}
                      canModerateMessages={canViewRoomActivityLog}
                      highlightedMessageId={highlightedRoomMessageId}
                      mobilePhoneLayout={mobilePhoneLayout}
                      musicAccessory={showRoomMusicPanel && roomMusic.shouldRender && roomMusicPanelOpen ? (
                        <React.Suspense fallback={null}>
                          <RoomMusicPanel
                            serverPlan={activeServerData?.plan}
                            userLevel={currentUser.userLevel}
                            serverRole={activeServerRole}
                            session={roomMusic.session}
                            source={roomMusic.activeSource}
                            sources={roomMusic.sources}
                            permissions={roomMusic.permissions}
                            loading={roomMusic.loading}
                            actionLoading={roomMusic.actionLoading}
                            error={roomMusic.error}
                            actionError={roomMusic.actionError}
                            errorCode={roomMusic.errorCode}
                            controlsDisabled={roomMusic.actionLoading || !roomMusic.permissions.canControl}
                            onPlayPause={roomMusic.togglePlayPause}
                            onStop={roomMusic.stop}
                            onPreviousSource={roomMusic.selectPreviousSource}
                            onNextSource={roomMusic.selectNextSource}
                            onVolumeChange={roomMusic.setVolume}
                            compact
                            variant="card"
                          />
                        </React.Suspense>
                      ) : null}
                      musicPanelAvailable={showRoomMusicPanel && roomMusic.shouldRender}
                      musicPanelOpen={roomMusicPanelOpen}
                      onToggleMusicPanel={showRoomMusicPanel && roomMusic.shouldRender ? () => setRoomMusicPanelOpen(prev => !prev) : undefined}
                      activityPanel={canViewRoomActivityLog ? (
                        <React.Suspense fallback={null}>
                          <RoomActivityLogPanel
                            activities={roomActivities}
                            onCollapse={() => setRoomActivityPanelOpen(false)}
                            onSelectActivity={handleSelectRoomActivity}
                            onClear={handleClearRoomActivityLog}
                            canClear={canClearRoomActivityLog}
                            clearing={roomActivityClearing}
                          />
                        </React.Suspense>
                      ) : undefined}
                      activityPanelRatio={roomActivityPanelRatio}
                      activityPanelOpen={roomActivityPanelOpen}
                      onActivityResizeStart={roomActivityPanelOpen ? beginRoomActivityResize : undefined}
                      onToggleActivityPanel={canViewRoomActivityLog ? () => setRoomActivityPanelOpen(prev => !prev) : undefined}
                    />
                  </React.Suspense>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-0 overflow-hidden">
                <React.Suspense fallback={<LazyPanelFallback label="Sunucu ana sayfası yükleniyor" />}>
                  <AnnouncementsPanel
                    currentUser={currentUser}
                    serverId={activeServerId}
                    serverName={mobileDisplayedActiveServerData?.name}
                    serverDescription={mobileDisplayedActiveServerData?.description}
                    serverRules={mobileDisplayedActiveServerData?.serverRules}
                    channels={visibleChannels}
                    serverMembers={mobileServerMembers}
                    canCreateAnnouncements={activeServerCanModerateCommunityContent}
                    canCreateRecommendations={activeServerCanCreateRecommendation}
                    canModerateCommunityContent={activeServerCanModerateCommunityContent}
                    canViewRoomActivity={canViewRoomActivityLog}
                    canViewInviteApplications={activeServerCanManage}
                    mobileTabletLayout
                    mobilePhoneLayout={mobilePhoneLayout}
                    onOpenInviteApplications={() => {
                      if (!activeServerId) return;
                      void loadServerSettings();
                      setMobileChannelSheetOpen(!mobilePhoneLayout);
                      setMobileSocialSheetOpen(!mobilePhoneLayout);
                      setSettingsTarget(null);
                      setSettingsInitialTab('requests');
                      setSettingsServerId(activeServerId);
                      setMobileShellView('settings');
                    }}
                  />
                </React.Suspense>
              </div>
            )}
          </div>

          {!mobilePhoneLayout && (
          <MobileSocialSheet
            variant="inline"
            open={mobileSocialSheetOpen}
            onClose={() => setMobileSocialSheetOpen(true)}
            pinned={mobileSocialSheetPinned}
            friendCount={friendUsers.length}
            serverName={activeServerData?.name}
            serverMemberCount={mobileServerMemberCount}
            currentView={mobileShellView}
            dmOpen={dmPanelOpen}
            dmCount={dmUnreadCount}
            onOpenSocial={() => {
              void loadDMPanel();
              setDmTargetUserId(null);
              setDmPanelOpen(prev => {
                const next = !prev;
                if (next) window.dispatchEvent(new CustomEvent('mayvox:close-notifications'));
                return next;
              });
            }}
            notificationSlot={
              <React.Suspense fallback={null}>
                <NotificationBell
                  summary={notifications}
                  quietButton
                  onOpenChange={(open) => {
                    if (open) setDmPanelOpen(false);
                  }}
                  onOpenFriendRequests={() => {}}
                  onOpenDM={() => {
                    void loadDMPanel();
                    setDmTargetUserId(null);
                    setDmPanelOpen(true);
                  }}
                  onOpenInvites={() => setInvitesModalOpen(true)}
                  onOpenAdminInviteRequests={() => { setSettingsTarget('invite_requests'); setView('settings'); }}
                  onOpenJoinRequest={(sid) => { setSettingsInitialTab('requests'); setSettingsServerId(sid); }}
                  onOpenServer={(sid) => setActiveServerId(sid)}
                  onAcceptFriendRequest={async (senderId) => {
                    const sender = allUsers.find(u => u.id === senderId);
                    const name = getPublicDisplayName(sender);
                    await acceptRequest(senderId);
                    pushInformational({
                      key: `friend-accepted:${senderId}`,
                      kind: 'generic',
                      label: name,
                      detail: 'Artık arkadaşsınız',
                      createdAt: Date.now(),
                    });
                  }}
                  onRejectFriendRequest={async (senderId) => {
                    const sender = allUsers.find(u => u.id === senderId);
                    const name = getPublicDisplayName(sender);
                    await rejectRequest(senderId);
                    pushInformational({
                      key: `friend-rejected:${senderId}`,
                      kind: 'generic',
                      label: name,
                      detail: 'Arkadaşlık isteğini reddettin',
                      createdAt: Date.now(),
                    });
                  }}
                  onAcceptServerInvite={async (invId) => {
                    const inv = incomingInvites.invites.find(i => i.id === invId);
                    const serverName = inv?.serverName ?? 'Sunucu';
                    await incomingInvites.acceptInvite(invId);
                    refreshServers({ force: true });
                    setToastMsg(`${serverName} sunucusuna katıldın`);
                    pushInformational({
                      key: `inv-accepted:${invId}`,
                      kind: 'generic',
                      label: serverName,
                      detail: 'Sunucuya katıldın',
                      serverId: inv?.serverId,
                      serverAvatar: inv?.serverAvatar ?? null,
                      createdAt: Date.now(),
                    });
                  }}
                  onDeclineServerInvite={async (invId) => {
                    const inv = incomingInvites.invites.find(i => i.id === invId);
                    await incomingInvites.declineInvite(invId);
                    setToastMsg('Davet reddedildi');
                    pushInformational({
                      key: `inv-declined:${invId}`,
                      kind: 'generic',
                      label: inv?.serverName ?? 'Sunucu',
                      detail: 'Daveti reddettin',
                      serverId: inv?.serverId,
                      serverAvatar: inv?.serverAvatar ?? null,
                      createdAt: Date.now(),
                    });
                  }}
                />
              </React.Suspense>
            }
            onOpenSettings={handleMobileOpenSettings}
            onLogout={confirmLogout}
          >
            <React.Suspense fallback={<LazyPanelFallback label="Arkadaşlar yükleniyor" />}>
              <MobileSocialScreen
                mode="friends"
                dmCount={dmUnreadCount}
                friendCount={friendUsers.length}
                onlineCount={mobileOnlineFriendCount}
                requestCount={notifications.friendRequestCount}
                serverName={activeServerData?.name}
                serverMemberCount={mobileServerMemberCount}
                serverOnlineCount={mobileServerVisibleOnlineCount}
                friendItems={mobileFriendItems}
                serverMemberItems={mobileServerMemberItems}
                onOpenDm={(id) => {
                  void loadDMPanel();
                  setMobileChannelSheetOpen(!mobilePhoneLayout);
                  setMobileSocialSheetOpen(!mobilePhoneLayout);
                  setDmTargetUserId(id);
                  setDmPanelOpen(true);
                }}
                onOpenProfile={handleFriendProfileClick}
                onOpenRequests={() => {}}
                onTabChange={handleMobileSocialTabChange}
              />
            </React.Suspense>
          </MobileSocialSheet>
          )}

          {mobilePhoneLayout && (
            <>
              <MobileChannelSheet
                variant="overlay"
                phoneLayout
                open={mobileChannelSheetOpen}
                connectionLevel={connectionLevel}
                connectionLatencyMs={connectionLatencyMs}
                connectionJitterMs={connectionJitterMs}
                isConnecting={isConnecting}
                isActiveChannel={!!activeChannel}
                channels={mobileChannelSheetItems}
                onClose={() => setMobileChannelSheetOpen(false)}
                onSelectChannel={handleMobileSelectChannel}
                onOpenChannelMenu={currentUser.isAdmin ? handleMobileOpenChannelMenu : undefined}
                pinned={false}
                createTitle={mobileAtRoomLimit ? roomLimitMessage(mobileActivePlan) : undefined}
                createDisabled={mobileAtRoomLimit}
                onOpenDiscover={handleMobileOpenDiscover}
                onCreateChannel={handleMobileCreateChannel}
              />
              <MobileSocialSheet
                variant="overlay"
                phoneLayout
                open={mobileSocialSheetOpen}
                onClose={() => setMobileSocialSheetOpen(false)}
                currentView={mobileShellView}
                dmOpen={dmPanelOpen}
                dmCount={dmUnreadCount}
                topSlot={
                  <React.Suspense fallback={null}>
                    <SocialSearchHub currentUserId={currentUser.id} variant="sidebar" onUserClick={handleSearchUserProfileClick} />
                  </React.Suspense>
                }
                onOpenSocial={() => {
                  void loadDMPanel();
                  setDmTargetUserId(null);
                  setDmPanelOpen(prev => {
                    const next = !prev;
                    if (next) window.dispatchEvent(new CustomEvent('mayvox:close-notifications'));
                    return next;
                  });
                }}
                notificationSlot={
                  <React.Suspense fallback={null}>
                    <NotificationBell
                      summary={notifications}
                      quietButton
                      onOpenChange={(open) => {
                        if (open) setDmPanelOpen(false);
                      }}
                      onOpenFriendRequests={() => {}}
                      onOpenDM={() => {
                        void loadDMPanel();
                        setDmTargetUserId(null);
                        setDmPanelOpen(true);
                      }}
                      onOpenInvites={() => setInvitesModalOpen(true)}
                      onOpenAdminInviteRequests={() => { setSettingsTarget('invite_requests'); setView('settings'); }}
                      onOpenJoinRequest={(sid) => { setSettingsInitialTab('requests'); setSettingsServerId(sid); }}
                      onOpenServer={(sid) => setActiveServerId(sid)}
                      onAcceptFriendRequest={async (senderId) => {
                        const sender = allUsers.find(u => u.id === senderId);
                        const name = getPublicDisplayName(sender);
                        await acceptRequest(senderId);
                        pushInformational({
                          key: `friend-accepted:${senderId}`,
                          kind: 'generic',
                          label: name,
                          detail: 'Artık arkadaşsınız',
                          createdAt: Date.now(),
                        });
                      }}
                      onRejectFriendRequest={async (senderId) => {
                        const sender = allUsers.find(u => u.id === senderId);
                        const name = getPublicDisplayName(sender);
                        await rejectRequest(senderId);
                        pushInformational({
                          key: `friend-rejected:${senderId}`,
                          kind: 'generic',
                          label: name,
                          detail: 'Arkadaşlık isteğini reddettin',
                          createdAt: Date.now(),
                        });
                      }}
                      onAcceptServerInvite={async (invId) => {
                        const inv = incomingInvites.invites.find(i => i.id === invId);
                        const serverName = inv?.serverName ?? 'Sunucu';
                        await incomingInvites.acceptInvite(invId);
                        refreshServers({ force: true });
                        setToastMsg(`${serverName} sunucusuna katıldın`);
                        pushInformational({
                          key: `inv-accepted:${invId}`,
                          kind: 'generic',
                          label: serverName,
                          detail: 'Sunucuya katıldın',
                          serverId: inv?.serverId,
                          serverAvatar: inv?.serverAvatar ?? null,
                          createdAt: Date.now(),
                        });
                      }}
                      onDeclineServerInvite={async (invId) => {
                        const inv = incomingInvites.invites.find(i => i.id === invId);
                        await incomingInvites.declineInvite(invId);
                        setToastMsg('Davet reddedildi');
                        pushInformational({
                          key: `inv-declined:${invId}`,
                          kind: 'generic',
                          label: inv?.serverName ?? 'Sunucu',
                          detail: 'Daveti reddettin',
                          serverId: inv?.serverId,
                          serverAvatar: inv?.serverAvatar ?? null,
                          createdAt: Date.now(),
                        });
                      }}
                    />
                  </React.Suspense>
                }
                onOpenSettings={handleMobileOpenSettings}
                onLogout={confirmLogout}
              >
                <React.Suspense fallback={<LazyPanelFallback label="Arkadaşlar yükleniyor" />}>
                  <MobileSocialScreen
                    mode="friends"
                    dmCount={dmUnreadCount}
                    friendCount={friendUsers.length}
                    onlineCount={mobileOnlineFriendCount}
                    requestCount={notifications.friendRequestCount}
                    serverName={activeServerData?.name}
                    serverMemberCount={mobileServerMemberCount}
                    serverOnlineCount={mobileServerVisibleOnlineCount}
                    friendItems={mobileFriendItems}
                    serverMemberItems={mobileServerMemberItems}
                    onOpenDm={(id) => {
                      void loadDMPanel();
                      setMobileSocialSheetOpen(false);
                      setDmTargetUserId(id);
                      setDmPanelOpen(true);
                    }}
                    onOpenProfile={handleFriendProfileClick}
                    onOpenRequests={() => {}}
                    onTabChange={handleMobileSocialTabChange}
                  />
                </React.Suspense>
              </MobileSocialSheet>
            </>
          )}

        </div>
      </MobileAppShell>
      </React.Suspense>
      <AnimatePresence>
        {profilePopup && (() => {
          const popupUser = allUsers.find(u => u.id === profilePopup.userId) ?? profilePopup.fallbackUser;
          if (!popupUser) return null;
          const isMe = popupUser.id === currentUser.id;
          const activeMembers = activeChannel ? channels.find(c => c.id === activeChannel)?.members : undefined;
          const alreadyInChannel = activeMembers?.includes(popupUser.id) || activeMembers?.includes(popupUser.name);
          const canInvite = !isMe && !!activeChannel && !alreadyInChannel && popupUser.status === 'online';
          const popupServerName = popupUser.serverId ? serverList.find(s => s.id === popupUser.serverId)?.name ?? null : null;
          return (
            <React.Suspense fallback={null}>
              <UserProfilePopup user={popupUser} position={profilePopup} onClose={() => setProfilePopup(null)}
                onInvite={() => { handleInviteUser(popupUser.id); setProfilePopup(null); }}
                onDM={(userId) => { setDmTargetUserId(userId); setDmPanelOpen(true); setProfilePopup(null); }}
                canInvite={!!canInvite} inviteStatus={inviteStatuses[popupUser.id]}
                onCooldown={!!(inviteCooldowns[popupUser.id] && Date.now() < inviteCooldowns[popupUser.id])}
                cooldownRemaining={inviteCooldowns[popupUser.id] ? Math.ceil((inviteCooldowns[popupUser.id] - Date.now()) / 1000) : 0}
                isMe={isMe} currentAppVersion={appVersion} serverName={popupServerName} source={profilePopup.source} />
            </React.Suspense>
          );
        })()}
      </AnimatePresence>
      {shouldRenderDmPanel && (
        <React.Suspense fallback={null}>
          <DMPanel
            isOpen={dmPanelOpen}
            onClose={() => setDmPanelOpen(false)}
            openUserId={dmTargetUserId}
            onOpenHandled={() => setDmTargetUserId(null)}
            onUnreadChange={setDmUnreadCount}
            onRequestCountChange={setDmRequestCount}
            onActiveConvKeyChange={setActiveDmConvKey}
            onNearBottomChange={setDmAtBottom}
            mobileDenseSurface
          />
        </React.Suspense>
      )}
      {showJoinModal && (
        <React.Suspense fallback={null}>
          <JoinServerModal
            onClose={() => setShowJoinModal(false)}
            onSuccess={refreshServers}
          />
        </React.Suspense>
      )}
      {roomModal.isOpen && (
        <React.Suspense fallback={null}>
          <ChatViewRoomModal
            roomModal={roomModal}
            onUpdate={(updates) => setRoomModal(prev => ({ ...prev, ...updates }))}
            onClose={() => setRoomModal(prev => ({ ...prev, isOpen: false }))}
            onSave={handleSaveRoom}
            persistentInfo={roomModal.type === 'create'
              ? calcPersistentRoomsRemaining(activeServerData?.plan, channels)
              : undefined}
          />
        </React.Suspense>
      )}
      <AnimatePresence>
        {contextMenu && currentUser.isAdmin && (
          <React.Suspense fallback={null}>
            <ChatViewContextMenu contextMenu={contextMenu} channels={channels} onEditRoom={handleEditRoom}
              onSetPassword={handleSetPasswordModal} onRemovePassword={handleRemovePassword}
              onDeleteRoom={handleDeleteRoom}
              onManageAccess={(channelId) => {
                setAccessModalChannelId(channelId);
                setContextMenu(null);
              }}
              onClose={() => setContextMenu(null)} />
          </React.Suspense>
        )}
      </AnimatePresence>
      {accessModalChannelId && activeServerId && (() => {
        const ch = channels.find(c => c.id === accessModalChannelId);
        if (!ch) return null;
        return (
          <React.Suspense fallback={null}>
            <ChannelAccessModal
              open={true}
              onClose={() => setAccessModalChannelId(null)}
              serverId={activeServerId}
              channelId={accessModalChannelId}
              channelName={ch.name}
            />
          </React.Suspense>
        );
      })()}
      {passwordModal && (
        <React.Suspense fallback={null}>
          <ChatViewPasswordModal passwordModal={passwordModal} passwordInput={passwordInput} setPasswordInput={setPasswordInput}
            passwordRepeatInput={passwordRepeatInput} setPasswordRepeatInput={setPasswordRepeatInput}
            passwordError={passwordError} setPasswordError={setPasswordError}
            onSetPassword={handleSetPassword} onVerifyPassword={handleVerifyPassword} onClose={() => setPasswordModal(null)} />
        </React.Suspense>
      )}
      {invitationModal && (
        <React.Suspense fallback={null}>
          <InvitationModal
            data={invitationModal}
            onAccept={handleInvitationAccept}
            onDecline={handleInvitationDecline}
            onMute={handleInvitationMute}
            isMuted={invitationMuted}
          />
        </React.Suspense>
      )}
      <ToastContainer />
      </>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden"
      onDragOver={currentUser.isAdmin ? handleDragOver : undefined}
      onDrop={currentUser.isAdmin ? handleDropToRemove : undefined}
    >
      {invitationModal && (
        <React.Suspense fallback={null}>
          <InvitationModal
            data={invitationModal}
            onAccept={handleInvitationAccept}
            onDecline={handleInvitationDecline}
            onMute={handleInvitationMute}
            isMuted={invitationMuted}
          />
        </React.Suspense>
      )}
      <MobileHeader
        forceMobile={FORCE_MOBILE}
        onOpenLeftDrawer={() => setMobileLeftOpen(true)}
        onOpenRightDrawer={() => setMobileRightOpen(true)}
        activeServerName={activeServerData?.name}
        activeServerAvatarUrl={activeServerData?.avatarUrl}
        activeServerShortName={activeServerData?.shortName}
        activeServerIsPublic={activeServerData?.isPublic}
      />

      {/* Mobile-only banner; desktop'ta DesktopDock içinde render ediliyor. */}
      <div className={FORCE_MOBILE ? '' : 'lg:hidden'}>
        <InactivityCountdownBanner />
      </div>

      <div className={`mv-desktop-shell-layout flex flex-1 min-h-0 min-w-0 overflow-hidden relative ${FORCE_MOBILE ? '' : 'lg:p-0 lg:gap-0'}`}>
        {/* ── Mobil kenar handle'ları ── */}
        {!mobileLeftOpen && !mobileRightOpen && (
          <>
            <div className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed left-0 top-1/2 -translate-y-1/2 z-30 flex h-20 w-11 items-center justify-start cursor-pointer touch-none select-none`}
              onClick={() => setMobileLeftOpen(true)} onTouchStart={onHandleTouchStart} onTouchEnd={makeHandleTouchEnd(() => setMobileLeftOpen(true), 'right')}>
              <div className="w-[6px] h-16 rounded-r-full bg-[var(--theme-accent)]/20 hover:bg-[var(--theme-accent)]/40 transition-colors flex items-center justify-center">
                <svg width="4" height="10" viewBox="0 0 4 10" fill="none" className="text-[var(--theme-accent)]/50"><path d="M0.5 1L3 5L0.5 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <div className={`${FORCE_MOBILE ? '' : 'lg:hidden'} fixed right-0 top-1/2 -translate-y-1/2 z-30 flex h-20 w-11 items-center justify-end cursor-pointer touch-none select-none`}
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
                transition={FORCE_MOBILE ? { duration: 0.18, ease: 'easeOut' } : { type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} mv-shell-panel fixed inset-y-0 left-0 w-72 z-50 flex flex-col shadow-2xl rounded-r-2xl`}
                style={{ background: 'rgba(var(--theme-sidebar-rgb),0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: 'var(--shell-panel-shadow, 0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03))', border: '1px solid var(--shell-panel-border, rgba(var(--glass-tint), 0.04))' }}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { if (!handleSwipeRef.current) return; const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX; const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY); handleSwipeRef.current = null; if (dy < 60 && dx < -40) setMobileLeftOpen(false); }}
              >
                {/* ── A. Marka / Sunucu Header ── */}
                <div className="px-5 pt-5 pb-3.5 shrink-0 flex items-center gap-3.5 select-none">
                  {activeServerData?.avatarUrl ? (
                    <img src={activeServerData.avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.1)]" style={{ border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }} draggable={false} />
                  ) : activeServerData?.shortName ? (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.08)]"
                      style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.14), rgba(var(--theme-accent-rgb), 0.06))', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
                      <span className="text-[13px] font-bold text-[var(--theme-accent)]">{activeServerData.shortName}</span>
                    </div>
                  ) : (
                    <div className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.08)]"
                      style={{ background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.10), rgba(var(--theme-accent-rgb), 0.04))', border: '1.5px solid rgba(var(--theme-accent-rgb), 0.15)' }}>
                      <img src={appLogo} alt="MAYVOX" className="w-full h-full object-cover rounded-[inherit]" draggable={false} />
                    </div>
                  )}
                  <div className="flex flex-col leading-none min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-[14px] font-bold text-[var(--theme-text)] truncate tracking-[-0.01em]">
                        {(() => {
                          const raw = activeServerData?.name ?? 'MAYVOX';
                          const spaceIdx = raw.indexOf(' ');
                          if (spaceIdx > 0) {
                            const first = raw.slice(0, spaceIdx);
                            const rest = raw.slice(spaceIdx + 1);
                            return <>{first} <span style={{ color: 'var(--theme-accent)' }}>{rest}</span></>;
                          }
                          return raw;
                        })()}
                      </h1>
                      {activeServerData?.isPublic === false && <Lock size={10} className="text-[var(--theme-secondary-text)]/35 shrink-0" />}
                    </div>
                    <span className="text-[8px] font-semibold tracking-[0.14em] uppercase text-[var(--theme-secondary-text)]/25 mt-1 truncate max-w-full">{activeServerData?.motto || 'voice & chat'}</span>
                  </div>
                  {activeServerId && (() => {
                    const hasServerStaffRole = activeServerData?.role === 'owner' || activeServerData?.role === 'admin' || activeServerData?.role === 'mod';
                    if (hasServerStaffRole) {
                      return (
                        <button onClick={() => { activeServerData && toggleServerSettingsPanel(activeServerData.id); setMobileLeftOpen(false); }} title="Sunucu Ayarları"
                          className="mv-icon-action mv-icon-action-accent mv-icon-gear-hover w-7 h-7 flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/25 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)]">
                          <Settings size={13} />
                        </button>
                      );
                    }
                    return (
                      <button onClick={() => setMobileLeftOpen(false)} title="Kapat"
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--theme-secondary-text)]/25 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-all duration-150">
                        <X size={13} />
                      </button>
                    );
                  })()}
                </div>
                <div className="mx-5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.07), transparent)' }} />

                <div className="px-5 pt-4 pb-4 flex flex-col flex-1 min-h-0">
                  {visibleChannels.length === 0 ? (
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

                  <nav className={`flex-1 space-y-1 overflow-y-auto custom-scrollbar ${serverList.find(s => s.id === activeServerId)?.isBanned ? 'opacity-75' : ''}`} onClick={() => setContextMenu(null)}>
                    {visibleChannels.map(channel => {
                      const serverBanned = !!serverList.find(s => s.id === activeServerId)?.isBanned;
                      return (
                      <div key={channel.id} className="space-y-1">
                        <button onClick={() => { handleSidebarChannelClick(channel.id); setMobileLeftOpen(false); }} disabled={isConnecting}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 group active:scale-[0.97] active:duration-75 ${serverBanned ? 'opacity-60' : ''} ${
                            activeChannel === channel.id
                              ? `bg-[var(--theme-accent)]/10 text-[var(--theme-text)] border border-[var(--theme-accent)]/20 shadow-[inset_0_0_12px_rgba(var(--theme-accent-rgb),0.08),inset_0_1px_0_rgba(var(--theme-accent-rgb),0.1)]${isConnecting ? ' animate-pulse' : ''}`
                              : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'
                          }`}>
                          <div className="relative">
                            {(() => {
                              const mode = channel.mode || 'social';
                              const IC = channelIconComponents[channel.iconName ?? getDefaultChannelIconName(mode)] || roomModeIcons[mode] || Coffee;
                              return <IC size={16} className="opacity-90" style={{ color: channel.iconColor ?? getDefaultChannelIconColor(mode) }} />;
                            })()}
                          </div>
                          <div className="flex items-center justify-between flex-1 min-w-0">
                            <span className="font-medium truncate" style={{ fontSize: channel.name.length > 14 ? '12px' : '14px' }}>{channel.name}</span>
                            {channel.deletionTimer !== undefined && !channel.userCount && (
                              <div className="flex items-center gap-1 bg-red-500/20 px-1.5 py-0.5 rounded border border-red-500/30 shrink-0">
                                <Timer size={10} className="text-red-500 animate-pulse" />
                                <span className="text-[9px] font-mono font-bold text-red-500">{channel.deletionTimer}s</span>
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
                          let memberUsers = (channel.members ?? []).map(memberKey => {
                            const user = resolveUserByMemberKey(memberKey, allUsers);
                            if (!user) {
                              logMemberIdentityDebug('chat_view_unresolved_member', { memberKey }, `chat_view:${memberKey}`);
                            }
                            return user;
                          }).filter(Boolean) as typeof allUsers;
                          if (!memberUsers.length) return null;
                          if (isBc) memberUsers = [...memberUsers].sort((a, b) => (isSpeakerFn(b.id) ? 1 : 0) - (isSpeakerFn(a.id) ? 1 : 0));
                          let shownSpLabel = false, shownLsLabel = false;

                          return (
                          <div className="pl-8 pr-2 space-y-0.5 pb-2 mt-0.5 ml-4 border-l border-[var(--theme-accent)]/10">
                            {memberUsers.map(user => {
                              const isSp = isBc && isSpeakerFn(user.id);
                              let groupLabel: string | null = null;
                              if (hasSpeakers) {
                                if (isSp && !shownSpLabel) { shownSpLabel = true; groupLabel = 'Konuşmacılar'; }
                                if (!isSp && !shownLsLabel) { shownLsLabel = true; groupLabel = 'Dinleyiciler'; }
                              }
                              const isSelf = user.id === currentUser.id;
                              const uColor = isSelf ? avatarBorderColor : (user.avatarBorderColor || '');
                              const uTier = isSelf ? getFrameTier(currentUser.userLevel, { isPrimaryAdmin: !!currentUser.isPrimaryAdmin, isAdmin: !!currentUser.isAdmin }) : getFrameTier(user.userLevel, { isPrimaryAdmin: !!user.isPrimaryAdmin, isAdmin: !!user.isAdmin });

                              return (
                              <React.Fragment key={user.id}>
                                {groupLabel && (
                                  <>
                                    {groupLabel === 'Dinleyiciler' && <div className="mx-1.5 my-1.5 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--glass-tint), 0.06), transparent)' }} />}
                                    <div className="flex items-center gap-1.5 pt-1.5 pb-1 px-1.5">
                                      {groupLabel === 'Konuşmacılar' ? <Radio size={8} className="text-[var(--theme-accent)] opacity-50" /> : <Headphones size={8} className="text-[var(--theme-secondary-text)] opacity-30" />}
                                      <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--theme-secondary-text)]/50">{groupLabel}</span>
                                    </div>
                                  </>
                                )}
                                <div
                                  onClick={(e) => { e.stopPropagation(); if (user.id !== currentUser.id) setProfilePopup({ userId: user.id, x: e.clientX, y: e.clientY }); }}
                                  className={`flex items-center gap-2 text-[11px] transition-all duration-150 group/member py-1 px-1.5 rounded-lg cursor-pointer hover:bg-[var(--theme-accent)]/5 active:scale-[0.98] ${
                                    isBc && isSp ? 'font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)]' : 'font-medium text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)]'
                                  } ${isBc && !isSp ? 'opacity-70' : ''}`}
                                >
                                  <div className={`relative shrink-0 ${uColor ? getFrameClassName(uTier) : ''}`}
                                    style={uColor ? { ...getFrameStyle(uColor, uTier), borderRadius: '22%' } : undefined}>
                                    <div className="h-5 w-5 overflow-hidden avatar-squircle flex items-center justify-center text-[8px] font-bold"
                                      style={{
                                        background: hasCustomAvatar(user.avatar)
                                          ? 'rgba(0,0,0,0.15)'
                                          : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)',
                                        color: 'var(--theme-accent)',
                                      }}>
                                      <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.displayName || user.firstName} name={getPublicDisplayName(user)} letterClassName="text-[8px] font-bold" />
                                    </div>
                                    <DeviceBadge platform={user.platform} size={10} className="absolute -bottom-0.5 -right-0.5" />
                                  </div>
                                  <span className="truncate flex-1">{getPublicDisplayName(user)}</span>
                                  {isBc && (isSp ? <Radio size={9} className="shrink-0 text-[var(--theme-accent)]" /> : <Headphones size={9} className="shrink-0 text-[var(--theme-secondary-text)] opacity-40" />)}
                                </div>
                              </React.Fragment>);
                            })}
                          </div>
                          );
                        })()}
                      </div>
                      );
                    })}

                    {/* Oda Oluştur */}
                    {(() => {
                      const activePlan = serverList.find(s => s.id === activeServerId)?.plan;
                      const roomLimit = getUserRoomLimit(activePlan);
                      const userRoomCount = channels.filter(c => c.ownerId === currentUser.id).length;
                      const atLimit = userRoomCount >= roomLimit;
                      return (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (atLimit) { setToastMsg(roomLimitMessage(activePlan)); return; } setRoomModal({ isOpen: true, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social', iconColor: getDefaultChannelIconColor('social'), iconName: getDefaultChannelIconName('social') }); setMobileLeftOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                          atLimit
                            ? 'text-[var(--theme-secondary-text)]/70 cursor-pointer hover:bg-[rgba(var(--glass-tint),0.04)]'
                            : 'text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-accent)]'
                        }`}
                        title={atLimit ? roomLimitMessage(activePlan) : undefined}>
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
                  <button onClick={() => { setView('chat'); setShowDiscover(true); setMobileLeftOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-accent)] hover:bg-[rgba(var(--theme-accent-rgb),0.05)] transition-all duration-150 mb-1.5 active:scale-[0.98]">
                    <Compass size={14} className="text-[var(--theme-accent)] opacity-50" /> Topluluk Keşfet
                  </button>
                  <div className="flex items-center justify-center gap-3 px-1 py-1.5 rounded-xl" style={{ background: 'rgba(var(--glass-tint), 0.02)' }}>
                    {appVersion && (
                      <React.Suspense fallback={null}>
                        <UpdateVersionHub
                          currentVersion={appVersion}
                          isAdmin={!!currentUser.isAdmin}
                          autoShowNotes={showReleaseNotes}
                          onNotesShown={() => setShowReleaseNotes(false)}
                        />
                      </React.Suspense>
                    )}
                    <React.Suspense fallback={<span className="inline-block h-4 w-4" />}>
                      <ConnectionQualityIndicator connectionLevel={connectionLevel} latencyMs={connectionLatencyMs} jitterMs={connectionJitterMs} isConnecting={isConnecting} isActive={!!activeChannel} />
                    </React.Suspense>
                  </div>
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
                transition={FORCE_MOBILE ? { duration: 0.18, ease: 'easeOut' } : { type: 'spring', damping: 25, stiffness: 300 }}
                className={`${FORCE_MOBILE ? '' : 'lg:hidden'} mv-shell-panel fixed inset-y-0 right-0 w-56 z-50 flex flex-col shadow-2xl rounded-l-2xl`}
                style={{ background: 'rgba(var(--theme-sidebar-rgb),0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: 'var(--shell-panel-shadow, 0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(var(--glass-tint),0.03))', border: '1px solid var(--shell-panel-border, rgba(var(--glass-tint), 0.04))' }}
                onTouchStart={(e) => { handleSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }; }}
                onTouchEnd={(e) => { if (!handleSwipeRef.current) return; const dx = e.changedTouches[0].clientX - handleSwipeRef.current.startX; const dy = Math.abs(e.changedTouches[0].clientY - handleSwipeRef.current.startY); handleSwipeRef.current = null; if (dy < 60 && dx > 40) setMobileRightOpen(false); }}
              >
                <React.Suspense fallback={null}>
                  <div className="pt-3 pb-1"><SocialSearchHub currentUserId={currentUser.id} variant="sidebar" onUserClick={handleSearchUserProfileClick} /></div>
                  <FriendsSidebarContent variant="desktop" onUserClick={handleFriendProfileClick}
                    onDM={handleMobileFriendDm}
                    channels={channels} activeChannel={activeChannel}
                    inviteStatuses={inviteStatuses} inviteCooldowns={inviteCooldowns} handleInviteUser={handleInviteUserWithContext} handleCancelInvite={handleCancelInvite}
                    isMuted={isMuted} isDeafened={isDeafened}
                    servers={sidebarServers}
                    activeServerName={activeServerData?.name}
                    activeServerMemberCount={mobileServerMembers.length}
                    serverMembers={mobileServerMembers} />
                </React.Suspense>
                <div className="shrink-0 px-2 py-2.5 flex items-center justify-evenly">
                  <button ref={dmToggleRef} onClick={() => { setDmPanelOpen(prev => !prev); setMobileRightOpen(false); }}
                    className={`mv-icon-action mv-icon-action-accent mv-icon-message-hover relative w-9 h-9 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)] ${dmPanelOpen ? 'text-[var(--theme-accent)]' : dmUnreadCount > 0 ? 'text-[var(--notif-unread)]' : 'text-[var(--theme-secondary-text)]'}`} title="Mesajlar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {dmUnreadCount > 0 && !dmPanelOpen && (
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor" stroke="none" className="notif-icon-pulse" />
                      )}
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {dmUnreadCount > 0 && !dmPanelOpen && (
                      <NotificationBadge count={dmUnreadCount} variant="accent" className={`absolute -top-0.5 ${dmRequestCount > 0 ? '-left-0.5' : '-right-0.5'}`} />
                    )}
                  </button>
                  <button onClick={() => {
                      setMobileRightOpen(false);
                      if (view === 'settings') { setView('chat'); }
                      else { setSettingsTarget('app'); setView('settings'); }
                    }}
                    className={`mv-icon-action mv-icon-action-accent mv-icon-gear-hover relative w-9 h-9 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)] ${view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'}`} title="Ayarlar">
                    <Settings size={16} />
                    {notifications.settingsCount > 0 && <NotificationBadge count={notifications.settingsCount} variant="amber" className="absolute -top-0.5 -right-0.5" />}
                  </button>
                  <React.Suspense fallback={null}>
                    <NotificationBell
                      summary={notifications}
                      onOpenFriendRequests={() => {}}
                      onOpenDM={() => { setDmPanelOpen(true); setMobileRightOpen(false); }}
                      onOpenInvites={() => { setInvitesModalOpen(true); setMobileRightOpen(false); }}
                      onOpenAdminInviteRequests={() => { setSettingsTarget('invite_requests'); setView('settings'); setMobileRightOpen(false); }}
                      onOpenJoinRequest={(sid) => { setSettingsInitialTab('requests'); setSettingsServerId(sid); setMobileRightOpen(false); }}
                      onOpenServer={(sid) => { setActiveServerId(sid); setMobileRightOpen(false); }}
                      onAcceptFriendRequest={async (senderId) => {
                        const sender = allUsers.find(u => u.id === senderId);
                        const name = getPublicDisplayName(sender);
                        await acceptRequest(senderId);
                        pushInformational({
                          key: `friend-accepted:${senderId}`,
                          kind: 'generic',
                          label: name,
                          detail: 'Artık arkadaşsınız',
                          createdAt: Date.now(),
                        });
                      }}
                      onRejectFriendRequest={async (senderId) => {
                        const sender = allUsers.find(u => u.id === senderId);
                        const name = getPublicDisplayName(sender);
                        await rejectRequest(senderId);
                        pushInformational({
                          key: `friend-rejected:${senderId}`,
                          kind: 'generic',
                          label: name,
                          detail: 'Arkadaşlık isteğini reddettin',
                          createdAt: Date.now(),
                        });
                      }}
                      onAcceptServerInvite={async (invId) => {
                        const inv = incomingInvites.invites.find(i => i.id === invId);
                        const serverName = inv?.serverName ?? 'Sunucu';
                        await incomingInvites.acceptInvite(invId);
                        refreshServers({ force: true });
                        setToastMsg(`${serverName} sunucusuna katıldın`);
                        pushInformational({
                          key: `inv-accepted:${invId}`,
                          kind: 'generic',
                          label: serverName,
                          detail: 'Sunucuya katıldın',
                          serverId: inv?.serverId,
                          serverAvatar: inv?.serverAvatar ?? null,
                          createdAt: Date.now(),
                        });
                      }}
                      onDeclineServerInvite={async (invId) => {
                        const inv = incomingInvites.invites.find(i => i.id === invId);
                        const serverName = inv?.serverName ?? 'Sunucu';
                        await incomingInvites.declineInvite(invId);
                        setToastMsg('Davet reddedildi');
                        pushInformational({
                          key: `inv-declined:${invId}`,
                          kind: 'generic',
                          label: serverName,
                          detail: 'Daveti reddettin',
                          serverId: inv?.serverId,
                          serverAvatar: inv?.serverAvatar ?? null,
                          createdAt: Date.now(),
                        });
                      }}
                    />
                  </React.Suspense>
                  <button onClick={() => { setMobileRightOpen(false); confirmLogout(); }} className="mv-icon-action mv-icon-action-danger mv-icon-power-hover w-9 h-9 flex items-center justify-center transition-colors duration-150 text-red-400/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/25" title="Çıkış"><Power size={16} /></button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ── Left Sidebar (masaüstü) ── */}
        <React.Suspense fallback={<div className="w-[260px] shrink-0 border-r border-[rgba(var(--glass-tint),0.06)] bg-[var(--theme-sidebar)]/70" />}>
        <LeftSidebar handleDragOver={handleDragOver} handleDrop={handleDrop} handleDragStart={handleDragStart} onUserClick={(userId, x, y) => {
            // Sol panelde (kanal üyesi) tıklama → ses seviyesi barı (action menu).
            // Kendine tıklama → hiçbir şey açılmaz (self row non-interactive).
            if (userId === currentUser.id) return;
            setUserActionMenu({ userId, x, y });
          }}
          onUserContextMenu={(userId, x, y) => {
            // Sol sidebar üye satırı sağ-tık → participant card ile aynı role-aware menü.
            const user = sortedChannelMembers.find(u => u.id === userId) ?? allUsers.find(u => u.id === userId);
            if (user) setRoomMemberMenu({ user, x, y });
          }}
          activeServerName={activeServerData?.name} activeServerShortName={activeServerData?.shortName} activeServerAvatarUrl={activeServerData?.avatarUrl} activeServerMotto={activeServerData?.motto}
          activeServerRole={activeServerData?.role} activeServerPublic={activeServerData?.isPublic} activeServerPlan={activeServerData?.plan} onShowSettings={() => activeServerData && toggleServerSettingsPanel(activeServerData.id)}
          onShowDiscover={() => { setView('chat'); setShowDiscover(true); }} onLeaveServer={handleLeaveServer} />
        </React.Suspense>

        {/* ── Popover / Modal layers ── */}
        <AnimatePresence>
          {userActionMenu && (
            <React.Suspense fallback={null}>
              <ChatViewUserActionMenu menu={userActionMenu} currentUserId={currentUser.id} userVolumes={userVolumes}
                onUpdateVolume={handleUpdateUserVolume} activeChannel={activeChannel} channels={channels} allUsers={allUsers}
                onToggleSpeaker={handleToggleSpeaker} inviteStatuses={inviteStatuses} inviteCooldowns={inviteCooldowns}
                onInvite={handleInviteUser} onClose={() => setUserActionMenu(null)} />
            </React.Suspense>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {contextMenu && (
            <React.Suspense fallback={null}>
              <ChatViewContextMenu contextMenu={contextMenu} channels={channels} onEditRoom={handleEditRoom}
                onSetPassword={handleSetPasswordModal} onRemovePassword={handleRemovePassword}
                onDeleteRoom={handleDeleteRoom}
                onManageAccess={(id) => setAccessModalChannelId(id)}
                onClose={() => setContextMenu(null)} />
            </React.Suspense>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {roomModal.isOpen && (
            <React.Suspense fallback={null}>
              <ChatViewRoomModal
                roomModal={roomModal}
                onUpdate={(updates) => setRoomModal(prev => ({ ...prev, ...updates }))}
                onClose={() => setRoomModal(prev => ({ ...prev, isOpen: false }))}
                onSave={handleSaveRoom}
                persistentInfo={roomModal.type === 'create'
                  ? calcPersistentRoomsRemaining(activeServerData?.plan, channels)
                  : undefined}
              />
            </React.Suspense>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {passwordModal && (
            <React.Suspense fallback={null}>
              <ChatViewPasswordModal passwordModal={passwordModal} passwordInput={passwordInput} setPasswordInput={setPasswordInput}
                passwordRepeatInput={passwordRepeatInput} setPasswordRepeatInput={setPasswordRepeatInput}
                passwordError={passwordError} setPasswordError={setPasswordError}
                onSetPassword={handleSetPassword} onVerifyPassword={handleVerifyPassword} onClose={() => setPasswordModal(null)} />
            </React.Suspense>
          )}
        </AnimatePresence>

        {/* ── Main Content ── */}
        <main className="mv-chat-main mv-shell-center-panel flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden relative" style={{ backgroundColor: 'var(--app-content-surface, var(--app-neutral-surface))', boxShadow: 'none', border: 0, backgroundImage: 'none' }}>
          {(() => {
            const activeSrv = serverList.find(s => s.id === activeServerId);
            // Restricted mode: settings/discover dışındaki tüm akışlarda merkezi panel
            // restriction ekranıyla DEĞİŞTİRİLİR (boş-state UI'sı görünmez).
            if (activeSrv?.isBanned && view !== 'settings' && !showDiscover && !settingsServerId) {
              return (
                <div className="flex-1 flex flex-col min-h-0">
                  <React.Suspense fallback={<LazyPanelFallback label="Erişim bilgisi yükleniyor" />}>
                    <RestrictedServerScreen
                      serverName={activeSrv.name}
                      isOwner={activeSrv.role === 'owner'}
                    />
                  </React.Suspense>
                </div>
              );
            }
            return null;
          })()}
          <div
            className={`flex-1 min-w-0 flex flex-col min-h-0 ${FORCE_MOBILE ? `overflow-y-auto custom-scrollbar ${settingsServerId ? '' : 'px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'}` : `pb-3 lg:pb-0 lg:mb-[var(--mv-content-bottom-reserve)] ${settingsServerId ? 'overflow-hidden' : currentChannel && view !== 'settings' ? 'px-3 pt-3 sm:px-6 sm:pt-4' : 'overflow-y-auto custom-scrollbar p-3 sm:px-8 sm:pt-8 sm:pb-[calc(var(--mv-content-bottom-reserve)+1rem)]'}`} ${(serverList.find(s => s.id === activeServerId)?.isBanned && view !== 'settings' && !showDiscover && !settingsServerId) ? 'hidden' : ''}`}>
          {settingsServerId ? (
            <React.Suspense fallback={<LazyPanelFallback label="Sunucu ayarları yükleniyor" />}>
              <ServerSettings serverId={settingsServerId} onClose={() => { setSettingsServerId(null); setSettingsInitialTab(undefined); }} onServerUpdated={() => refreshServers({ force: true })}
                onServerDeleted={() => { setSettingsServerId(null); setSettingsInitialTab(undefined); setActiveServerId(''); refreshServers({ force: true }); }}
                initialTab={settingsInitialTab} />
            </React.Suspense>
          ) : view === 'settings' ? (
            <React.Suspense fallback={<LazyPanelFallback label="Ayarlar yükleniyor" />}>
              <SettingsView />
            </React.Suspense>
          ) : showDiscover ? (
            <React.Suspense fallback={<LazyPanelFallback label="Keşfet yükleniyor" />}>
              <DiscoverPanel activeServerId={activeServerId}
                canCreate={canCreateServer}
                onJoinSuccess={(serverId) => { refreshServers({ force: true }); setActiveServerId(serverId); setShowDiscover(false); }}
                onCreateServer={() => { if (canCreateServer) setShowCreateModal(true); }}
                onJoinModal={() => setShowJoinModal(true)} />
            </React.Suspense>
          ) : currentChannel && !isServerHomeView ? (
            <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="mv-room-ambient absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.4) 0%, transparent 65%)` }} />
                <div className="absolute bottom-[10%] right-[15%] w-[300px] h-[300px] rounded-full opacity-[0.012]" style={{ background: `radial-gradient(circle, rgba(var(--theme-accent-rgb), 0.3) 0%, transparent 70%)` }} />
              </div>
              {/* Oda başlığı — sadece tarayıcı daralmış halde (Android'de gizli, desktop parity) */}
              <div className={`relative z-[1] flex items-center justify-between mb-3 sm:mb-6 ${FORCE_MOBILE ? 'hidden' : 'lg:hidden'}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  {(() => { const activeCh = channels.find(c => c.id === activeChannel); const mc = getRoomModeConfig(activeCh?.mode); const ModeIcon = channelIconComponents[activeCh?.iconName ?? getDefaultChannelIconName(mc.id)] || roomModeIcons[mc.id] || Volume2; const iconColor = activeCh?.iconColor ?? getDefaultChannelIconColor(mc.id); return (<><div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border shrink-0" style={{ color: iconColor, background: `${iconColor}1a`, borderColor: `${iconColor}33` }}><ModeIcon size={18} className="sm:w-5 sm:h-5" /></div><div><h2 className="text-base sm:text-xl font-bold tracking-tight text-[var(--theme-text)] leading-none">{activeCh?.name || 'Sohbet Odası'}</h2><p className="text-[9px] font-semibold text-[var(--theme-secondary-text)] opacity-50 mt-0.5">{mc.shortHelper}</p></div></>); })()}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { const next = (cardScale % 3) + 1; setCardScale(next); localStorage.setItem('cardScale', String(next)); }}
                    className="p-2 rounded-lg border border-[var(--theme-border)]/40 hover:bg-[var(--theme-accent)]/8 transition-all group/density" title={cardScale === 1 ? 'Kompakt' : cardScale === 2 ? 'Dengeli' : 'Geniş'}>
                    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className="text-[var(--theme-secondary-text)] group-hover/density:text-[var(--theme-accent)] transition-colors">
                      {cardScale === 1 ? (<><rect x="0" y="0" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.7" /><rect x="0" y="5.25" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.5" /><rect x="0" y="10.5" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.3" /></>) : cardScale === 2 ? (<><rect x="0" y="0.5" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.7" /><rect x="0" y="8" width="16" height="5.5" rx="1.5" fill="currentColor" opacity="0.45" /></>) : (<rect x="0" y="0" width="16" height="14" rx="2" fill="currentColor" opacity="0.6" />)}
                    </svg>
                  </button>
                  <button onClick={async () => { removeCurrentUserFromChannel(activeChannel); await disconnectFromLiveKit(); setActiveChannel(null); }} className="p-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all" title="Odadan Ayrıl"><PhoneOff size={18} /></button>
                </div>
              </div>
              <div ref={roomActivitySplitRef} className="relative z-[1] flex flex-col flex-1 min-h-0 overflow-hidden">
                <React.Suspense fallback={<LazyPanelFallback label="Oda yükleniyor" />}>
                <VoiceParticipants forceMobile={FORCE_MOBILE} members={roomMembersHidden ? [] : sortedChannelMembers} currentUser={currentUser}
                  isPttPressed={isPttPressed} isMuted={isMuted} isDeafened={isDeafened} isVoiceBanned={!!currentUser.isVoiceBanned}
                  volumeLevel={volumeLevel} speakingLevels={speakingLevels} dominantSpeakerId={dominantSpeakerId}
                  currentChannel={currentChannel} getIntensity={getIntensity} getEffectiveStatus={getEffectiveStatus}
                  cardScale={cardScale} cardStyle={cardStyle} onProfileClick={handleVoiceParticipantProfileClick}
                  onKickUser={handleKickUser} isAdmin={currentUser.isAdmin || false} isPrimaryAdmin={currentUser.isPrimaryAdmin || false} isModerator={currentUser.isModerator || false}
                  onRequestMemberMenu={handleRequestRoomMemberMenu}
                  activeChannel={activeChannel} channels={channels} chatMessages={chatMessages} chatMuted={chatMuted} chatMuteRank={chatMuteRank}
                  onToggleChatMuted={handleToggleChatMuted} editingMsgId={editingMsgId} editingText={editingText}
                  onEditingTextChange={setEditingText} onStartEdit={startEditMessage} onSaveEdit={saveEditMessage} onCancelEdit={cancelEdit}
                  onDeleteMessage={deleteChatMessage} onClearAll={clearAllMessages} onSendMessage={sendChatMessage}
                  onReportMessage={handleReportRoomMessage}
                  onMessageContextMenu={handleMessageContextMenu}
                  reportedMessageIds={reportedRoomMessageIds}
                  chatInput={chatInput} onChatInputChange={setChatInput} chatScrollRef={chatScrollRef} onChatScroll={handleChatScroll}
                  isAtBottom={isAtBottom} newMsgCount={newMsgCount} onScrollToBottom={scrollToBottom}
                  isFloodCooling={isFloodCooling}
                  canModerateMessages={canViewRoomActivityLog}
                  highlightedMessageId={highlightedRoomMessageId}
                  musicAccessory={showRoomMusicPanel && roomMusic.shouldRender && roomMusicPanelOpen ? (
                    <React.Suspense fallback={null}>
                      <RoomMusicPanel
                        serverPlan={activeServerData?.plan}
                        userLevel={currentUser.userLevel}
                        serverRole={activeServerRole}
                        session={roomMusic.session}
                        source={roomMusic.activeSource}
                        sources={roomMusic.sources}
                        permissions={roomMusic.permissions}
                        loading={roomMusic.loading}
                        actionLoading={roomMusic.actionLoading}
                        error={roomMusic.error}
                        actionError={roomMusic.actionError}
                        errorCode={roomMusic.errorCode}
                        controlsDisabled={roomMusic.actionLoading || !roomMusic.permissions.canControl}
                        onPlayPause={roomMusic.togglePlayPause}
                        onStop={roomMusic.stop}
                        onPreviousSource={roomMusic.selectPreviousSource}
                        onNextSource={roomMusic.selectNextSource}
                        onVolumeChange={roomMusic.setVolume}
                        compact
                        variant="card"
                      />
                    </React.Suspense>
                  ) : null}
                  musicPanelAvailable={showRoomMusicPanel && roomMusic.shouldRender}
                  musicPanelOpen={roomMusicPanelOpen}
                  onToggleMusicPanel={showRoomMusicPanel && roomMusic.shouldRender ? () => setRoomMusicPanelOpen(prev => !prev) : undefined}
                  activityPanel={canViewRoomActivityLog ? (
                    <React.Suspense fallback={null}>
                      <RoomActivityLogPanel
                        activities={roomActivities}
                        onCollapse={() => setRoomActivityPanelOpen(false)}
                        onSelectActivity={handleSelectRoomActivity}
                        onClear={handleClearRoomActivityLog}
                        canClear={canClearRoomActivityLog}
                        clearing={roomActivityClearing}
                      />
                    </React.Suspense>
                  ) : undefined}
                  activityPanelRatio={roomActivityPanelRatio}
                  activityPanelOpen={roomActivityPanelOpen}
                  onActivityResizeStart={roomActivityPanelOpen ? beginRoomActivityResize : undefined}
                  onToggleActivityPanel={canViewRoomActivityLog ? () => setRoomActivityPanelOpen(prev => !prev) : undefined}
                />
                </React.Suspense>
              </div>
            </div>
          ) : serverLoading ? (
            /* ── Sunucu yükleniyor ── */
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin" />
            </div>
          ) : !hasServer ? (
            /* ── Sunucu Keşfet paneli ── */
            <React.Suspense fallback={<LazyPanelFallback label="Keşfet yükleniyor" />}>
              <DiscoverPanel activeServerId={activeServerId}
                canCreate={canCreateServer}
                onJoinSuccess={(serverId) => { refreshServers({ force: true }); setActiveServerId(serverId); setShowDiscover(false); }}
                onCreateServer={() => { if (canCreateServer) setShowCreateModal(true); }}
                onJoinModal={() => setShowJoinModal(true)}
              />
            </React.Suspense>
          ) : (
            <div className="desktop-server-home-scrollbar flex-1 flex flex-col overflow-y-auto">
              <React.Suspense fallback={<LazyPanelFallback label="Sunucu ana sayfası yükleniyor" />}>
                <AnnouncementsPanel
                  currentUser={currentUser}
                  serverId={activeServerId}
                  serverName={activeServerData?.name}
                  serverDescription={activeServerData?.description}
                  serverRules={activeServerData?.serverRules}
                  channels={visibleChannels}
                  serverMembers={mobileServerMembers}
                  canCreateAnnouncements={activeServerCanModerateCommunityContent}
                  canCreateRecommendations={activeServerCanCreateRecommendation}
                  canModerateCommunityContent={activeServerCanModerateCommunityContent}
                  canViewRoomActivity={canViewRoomActivityLog}
                  canViewInviteApplications={activeServerCanManage}
                  onOpenInviteApplications={() => {
                    if (!activeServerId) return;
                    setSettingsInitialTab('requests');
                    setSettingsServerId(activeServerId);
                  }}
                />
              </React.Suspense>
            </div>
          )}
          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <aside className={`mv-shell-panel mv-shell-right-panel w-56 2xl:w-60 shrink-0 flex-col ${FORCE_MOBILE ? 'hidden' : 'hidden lg:flex'}`} style={{ backgroundColor: 'color-mix(in srgb, var(--app-content-surface, var(--app-neutral-surface)) 96%, white 4%)', boxShadow: 'none', border: 0 }}>
          <React.Suspense fallback={null}>
            <div className="pt-3 pb-1"><SocialSearchHub currentUserId={currentUser.id} variant="sidebar" onUserClick={handleSearchUserProfileClick} /></div>
            <FriendsSidebarContent variant="desktop" onUserClick={handleFriendProfileClick}
              onDM={handleFriendDm} channels={channels} activeChannel={activeChannel}
              inviteStatuses={inviteStatuses} inviteCooldowns={inviteCooldowns} handleInviteUser={handleInviteUserWithContext} handleCancelInvite={handleCancelInvite} isMuted={isMuted} isDeafened={isDeafened}
              servers={sidebarServers}
              activeServerName={activeServerData?.name}
              activeServerMemberCount={mobileServerMembers.length}
              serverMembers={mobileServerMembers} />
          </React.Suspense>
          <div className="shrink-0 px-3 py-2.5 flex items-center justify-evenly">
            <button ref={dmToggleRef} onClick={() => setDmPanelOpen(prev => !prev)}
              className={`mv-icon-action mv-icon-action-accent mv-icon-message-hover relative w-8 h-8 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)] ${dmPanelOpen ? 'text-[var(--theme-accent)]' : dmUnreadCount > 0 ? 'text-[var(--notif-unread)]' : 'text-[var(--theme-secondary-text)]'}`} title="Mesajlar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {dmUnreadCount > 0 && !dmPanelOpen && (
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor" stroke="none" className="notif-icon-pulse" />
                )}
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {dmUnreadCount > 0 && !dmPanelOpen && (
                <NotificationBadge count={dmUnreadCount} variant="accent" className={`absolute -top-0.5 ${dmRequestCount > 0 ? '-left-0.5' : '-right-0.5'}`} />
              )}
            </button>
            <React.Suspense fallback={null}>
              <NotificationBell
                summary={notifications}
                onOpenFriendRequests={() => {/* Arkadaşlar sidebar'ı zaten görünür */}}
                onOpenDM={() => setDmPanelOpen(true)}
                onOpenInvites={() => setInvitesModalOpen(true)}
                onOpenAdminInviteRequests={() => { setSettingsTarget('invite_requests'); setView('settings'); }}
                onOpenJoinRequest={(sid) => { setSettingsInitialTab('requests'); setSettingsServerId(sid); }}
                onOpenServer={(sid) => setActiveServerId(sid)}
                onAcceptFriendRequest={async (senderId) => {
                  const sender = allUsers.find(u => u.id === senderId);
                  const name = getPublicDisplayName(sender);
                  await acceptRequest(senderId);
                  pushInformational({
                    key: `friend-accepted:${senderId}`,
                    kind: 'generic',
                    label: name,
                    detail: 'Artık arkadaşsınız',
                    createdAt: Date.now(),
                  });
                }}
                onRejectFriendRequest={async (senderId) => {
                  const sender = allUsers.find(u => u.id === senderId);
                  const name = getPublicDisplayName(sender);
                  await rejectRequest(senderId);
                  pushInformational({
                    key: `friend-rejected:${senderId}`,
                    kind: 'generic',
                    label: name,
                    detail: 'Arkadaşlık isteğini reddettin',
                    createdAt: Date.now(),
                  });
                }}
                onAcceptServerInvite={async (invId) => {
                  const inv = incomingInvites.invites.find(i => i.id === invId);
                  const serverName = inv?.serverName ?? 'Sunucu';
                  await incomingInvites.acceptInvite(invId);
                  refreshServers({ force: true });
                  setToastMsg(`${serverName} sunucusuna katıldın`);
                  pushInformational({
                    key: `inv-accepted:${invId}`,
                    kind: 'generic',
                    label: serverName,
                    detail: 'Sunucuya katıldın',
                    serverId: inv?.serverId,
                    serverAvatar: inv?.serverAvatar ?? null,
                    createdAt: Date.now(),
                  });
                }}
                onDeclineServerInvite={async (invId) => {
                  const inv = incomingInvites.invites.find(i => i.id === invId);
                  const serverName = inv?.serverName ?? 'Sunucu';
                  await incomingInvites.declineInvite(invId);
                  setToastMsg('Davet reddedildi');
                  pushInformational({
                    key: `inv-declined:${invId}`,
                    kind: 'generic',
                    label: serverName,
                    detail: 'Daveti reddettin',
                    serverId: inv?.serverId,
                    serverAvatar: inv?.serverAvatar ?? null,
                    createdAt: Date.now(),
                  });
                }}
              />
            </React.Suspense>
            <button onClick={() => {
                if (view === 'settings') { setView('chat'); }
                else { setSettingsTarget('app'); setView('settings'); }
              }}
              className={`mv-icon-action mv-icon-action-accent mv-icon-gear-hover relative w-8 h-8 flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.28)] ${view === 'settings' ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]'}`} title="Ayarlar">
              <Settings size={14} />
              {notifications.settingsCount > 0 && <NotificationBadge count={notifications.settingsCount} variant="amber" className="absolute -top-0.5 -right-0.5" />}
            </button>
            <button onClick={confirmLogout} className="mv-icon-action mv-icon-action-danger mv-icon-power-hover w-8 h-8 flex items-center justify-center transition-colors duration-150 text-red-400/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/25" title="Çıkış"><Power size={14} /></button>
          </div>
        </aside>
      </div>

      {/* ── Desktop Dock — context-consuming, minimal props ── */}
      <React.Suspense fallback={null}>
        <DesktopDock dockToastHoveredRef={dockToastHoveredRef} listenerToastRef={listenerToastRef} cardStyle={cardStyle} cycleCardStyle={cycleCardStyle}
          serverList={serverList} activeServerId={activeServerId} onSelectServer={id => {
            setActiveServerId(id);
            setShowDiscover(false);
          }}
          onJoinServer={handleJoinServer} onLeaveServer={handleLeaveServer}
          onShowCreateModal={() => { if (canCreateServer) setShowCreateModal(true); }} canCreateServer={canCreateServer}
          currentView={currentView} onGoHome={handleGoHome} onReturnToRoom={handleReturnToRoom} />
      </React.Suspense>

      {/* ── Sunucuya Katıl Modal (global) ── */}
      {showJoinModal && (
        <React.Suspense fallback={null}>
          <JoinServerModal
            onClose={() => setShowJoinModal(false)}
            onSuccess={refreshServers}
          />
        </React.Suspense>
      )}

      {/* ── Kanal Erişim Modal ── */}
      {accessModalChannelId && activeServerId && (() => {
        const ch = channels.find(c => c.id === accessModalChannelId);
        if (!ch) return null;
        return (
          <React.Suspense fallback={null}>
            <ChannelAccessModal
              open={true}
              onClose={() => setAccessModalChannelId(null)}
              serverId={activeServerId}
              channelId={accessModalChannelId}
              channelName={ch.name}
            />
          </React.Suspense>
        );
      })()}

      {/* ── Gelen Sunucu Davetleri Modal ── */}
      {invitesModalOpen && (
        <React.Suspense fallback={null}>
          <IncomingInvitesModal
            open={invitesModalOpen}
            onClose={() => setInvitesModalOpen(false)}
            invites={incomingInvites.invites}
            loading={incomingInvites.loading}
            error={incomingInvites.error}
            onAccept={incomingInvites.acceptInvite}
            onDecline={incomingInvites.declineInvite}
            onAccepted={(inv) => { refreshServers({ force: true }); setToastMsg(`${inv.serverName} sunucusuna katıldın`); }}
            onDeclined={() => setToastMsg('Davet reddedildi')}
          />
        </React.Suspense>
      )}

      {/* ── Sunucu Oluştur Modal (global) ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowCreateModal(false); setCreateError(''); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 1.0 }}
            className="w-[380px] max-w-[90vw] rounded-2xl p-5 overflow-hidden mv-depth" onClick={e => e.stopPropagation()} style={{ background: 'rgba(var(--theme-bg-rgb, 6,10,20), 0.95)', border: '1px solid rgba(var(--glass-tint), 0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 className="text-[15px] font-bold text-[var(--theme-text)] mb-5">Sunucu Oluştur</h3>
            <label className="block text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-1.5">Sunucu Adı <span className="normal-case font-normal">(en fazla 3 kelime)</span></label>
            <input value={createName} onChange={e => { const v = e.target.value; if (v.trim().split(/\s+/).length <= 3 || v.length < createName.length) setCreateName(v); }} placeholder="Benim Sunucum" maxLength={15} className="w-full h-10 px-3 rounded-lg text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none mb-1" style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.1)' }} />
            {previewSlug(createName) && (
              <div className="text-[10px] text-[var(--theme-accent)]/60 mb-3 pl-0.5">Adres: <span className="font-semibold">{previewSlug(createName)}</span></div>
            )}
            {!previewSlug(createName) && <div className="mb-3" />}
            <label className="block text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-1.5">Açıklama</label>
            <input value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Kısa bir açıklama (opsiyonel)" maxLength={200} className="w-full h-10 px-3 rounded-lg text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none mb-3" style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.1)' }} />
            <label className="block text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-1.5">Motto</label>
            <input value={createMotto} onChange={e => setCreateMotto(e.target.value.slice(0, 15))} placeholder="Gece tayfa burada" maxLength={15} className="w-full h-10 px-3 rounded-lg text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none mb-3" style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.1)' }} />
            {/* ── Live server preview ── */}
            {(createName.trim() || createMotto.trim()) && (() => {
              const pv = getPlanVisual(createPlan);
              const planLimit = PLAN_LIMITS[createPlan as PlanKey].maxMembers;
              const displayName = createName.trim() || 'Sunucum';
              const displayInitial = (displayName[0] || '?').toUpperCase();
              return (
                <div className="mb-3 p-3 rounded-xl" style={{ background: pv.bg, border: `1px solid ${pv.border}` }}>
                  <div className="text-[8px] font-bold mb-2 uppercase tracking-wider" style={{ color: pv.accent, opacity: 0.7 }}>Önizleme</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[15px] font-bold" style={{ background: pv.selectBg, border: `1px solid ${pv.selectBorder}`, color: pv.selectText }}>
                      {displayInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--theme-text)] truncate">{displayName}</span>
                        {createPlan !== 'free' && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0" style={{ background: pv.selectBg, color: pv.selectText, border: `1px solid ${pv.selectBorder}` }}>
                            {createPlan}
                          </span>
                        )}
                      </div>
                      {createMotto.trim() && (
                        <div className="text-[10px] text-[var(--theme-secondary-text)] opacity-70 truncate mt-0.5">"{createMotto.trim()}"</div>
                      )}
                    </div>
                  </div>
                  {/* Kapasite hissi — mini bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--glass-tint),0.08)' }}>
                      <div className="h-full" style={{ width: `${createPlan === 'free' ? 20 : createPlan === 'pro' ? 50 : 100}%`, background: pv.accent, opacity: 0.6 }} />
                    </div>
                    <span className="text-[9px] tabular-nums text-[var(--theme-secondary-text)] opacity-55 shrink-0">{planLimit} kullanıcı</span>
                  </div>
                </div>
              );
            })()}
            {/* Plan seçimi */}
            <label className="block text-[10px] font-semibold text-[var(--theme-secondary-text)]/60 uppercase tracking-wider mb-2">Plan</label>
            {(() => {
              // Plan erişimi tamamen user.serverCreationPlan üzerinden. Rol baktığımız
              // eski kural kaldırıldı — admin default ultra olsa da öyle kontrol etmiyoruz.
              const tier = currentUser.serverCreationPlan ?? 'none';
              const TIER_RANK: Record<string, number> = { none: 0, free: 1, pro: 2, ultra: 3 };
              const allow = (p: 'free' | 'pro' | 'ultra') => TIER_RANK[p] <= TIER_RANK[tier];
              // Sayılar canonical planLimits.ts'den — hardcoded yok.
              const fmtSub = (p: 'free' | 'pro' | 'ultra'): string => {
                const l = PLAN_LIMITS[p];
                const parts: string[] = [`${l.systemRooms} sistem`];
                if (l.extraPersistentRooms > 0) parts.push(`${l.extraPersistentRooms} kalıcı`);
                if (l.maxNonPersistentRooms > 0) parts.push(`${l.maxNonPersistentRooms} özel`);
                return `${l.maxMembers.toLocaleString('tr-TR')} üye · ${parts.join(' + ')}`;
              };
              const planOptions = [
                { id: 'free' as const,  name: 'Free',  sub: fmtSub('free'),  disabled: !allow('free') },
                { id: 'pro' as const,   name: 'Pro',   sub: fmtSub('pro'),   disabled: !allow('pro') },
                { id: 'ultra' as const, name: 'Ultra', sub: fmtSub('ultra'), disabled: !allow('ultra') },
              ];
              // Seçili plan kullanıcıya kapalı hale geldiyse ilk izinliye düşür.
              if (planOptions.find(p => p.id === createPlan)?.disabled) {
                const firstAllowed = planOptions.find(p => !p.disabled)?.id;
                if (firstAllowed) setTimeout(() => setCreatePlan(firstAllowed), 0);
              }
              return (
            <div className="grid grid-cols-3 gap-2">
              {planOptions.map(p => {
                const sel = createPlan === p.id;
                const pv = getPlanVisual(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => {
                      if (p.disabled) {
                        setToastMsg('Bu ayar şu anda değiştirilemez');
                        return;
                      }
                      setCreatePlan(p.id);
                    }}
                    title={p.disabled ? 'Bu plan için yetkin yok' : p.name}
                    aria-disabled={p.disabled}
                    className={`relative p-2.5 rounded-xl text-center transition-all ${p.disabled ? 'opacity-70 cursor-pointer' : 'cursor-pointer'}`}
                    style={sel ? { background: pv.selectBg, border: `1px solid ${pv.selectBorder}` } : { background: 'rgba(var(--glass-tint),0.04)', border: '1px solid rgba(var(--glass-tint),0.06)' }}>
                    <div className="text-[11px] font-bold" style={{ color: sel ? pv.selectText : 'var(--theme-text)' }}>{p.name}</div>
                    <div className="text-[8px] text-[var(--theme-secondary-text)]/40 mt-0.5">{p.sub}</div>
                    {p.disabled && (
                      <span className="absolute top-1 right-1.5 text-[7px] font-bold uppercase tracking-wider text-[var(--theme-secondary-text)]/60">Kilitli</span>
                    )}
                  </button>
                );
              })}
            </div>
              );
            })()}
            {/* Plan detayı — seçili planın altında açılır */}
            <div className="mt-2 mb-4 rounded-xl overflow-hidden transition-all" style={{
              background: getPlanVisual(createPlan).bg,
              border: `1px solid ${getPlanVisual(createPlan).border}`,
            }}>
              <div className="p-3">
                <div className="text-[9px] font-bold mb-2" style={{ color: getPlanVisual(createPlan).accent }}>{PLAN_TAGLINE[createPlan as PlanKey]}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {planFeatureList(createPlan as PlanKey).map(f => (
                    <div key={f} className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ color: createPlan !== 'free' ? getPlanVisual(createPlan).accent : undefined }}
                        className={`shrink-0 ${createPlan === 'free' ? 'text-[var(--theme-secondary-text)]/30' : ''}`}><polyline points="20 6 9 17 4 12" /></svg>
                      <span className={`text-[9px] leading-tight ${createPlan !== 'free' ? 'text-[var(--theme-text)] opacity-70' : 'text-[var(--theme-text)] opacity-45'}`}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer mb-4 select-none">
              <button type="button" onClick={() => setCreatePublic(!createPublic)} className={`w-8 h-[18px] rounded-full transition-colors duration-150 relative ${createPublic ? 'bg-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.15)]'}`}>
                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-150 ${createPublic ? 'left-[16px]' : 'left-[2px]'}`} />
              </button>
              <span className="text-[11px] text-[var(--theme-text)]">Herkese açık sunucu</span>
            </label>
            {createError && <div className="text-[10px] text-red-400 mb-3 px-1">{createError}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCreateModal(false); setCreateError(''); }} className="h-9 px-4 rounded-lg text-[11px] font-semibold text-[var(--theme-secondary-text)]" style={{ background: 'rgba(var(--glass-tint), 0.06)' }}>İptal</button>
              <button onClick={handleCreateServer} disabled={!createName.trim() || serverActionLoading} className="h-9 px-4 rounded-lg text-[11px] font-semibold disabled:opacity-40 mv-pressable" style={{ background: 'var(--theme-accent)', color: 'var(--theme-text-on-accent, #000)' }}>
                {serverActionLoading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Task #10: Tek-düze bildirim — `toastMsg` yalnız DesktopDock içinde
          (buton alanında) render edilir. Burada ikinci kopya kaldırıldı. */}

      {/* ── Sunucu Ayarları artık orta panelde inline render ediliyor (yukarıda main içinde) ── */}

      {/* ── Profile Popup ── */}
      <AnimatePresence>
        {profilePopup && (() => {
          const popupUser = allUsers.find(u => u.id === profilePopup.userId) ?? profilePopup.fallbackUser;
          if (!popupUser) return null;
          const isMe = popupUser.id === currentUser.id;
          const activeMembers = activeChannel ? channels.find(c => c.id === activeChannel)?.members : undefined;
          const alreadyInChannel = activeMembers?.includes(popupUser.id) || activeMembers?.includes(popupUser.name);
          const canInvite = !isMe && !!activeChannel && !alreadyInChannel && popupUser.status === 'online';
          const popupServerName = popupUser.serverId ? serverList.find(s => s.id === popupUser.serverId)?.name ?? null : null;
          return (
            <React.Suspense fallback={null}>
              <UserProfilePopup user={popupUser} position={profilePopup} onClose={() => setProfilePopup(null)}
                onInvite={() => { handleInviteUser(popupUser.id); setProfilePopup(null); }}
                onDM={(userId) => { setDmTargetUserId(userId); setDmPanelOpen(true); setProfilePopup(null); }}
                canInvite={!!canInvite} inviteStatus={inviteStatuses[popupUser.id]}
                onCooldown={!!(inviteCooldowns[popupUser.id] && Date.now() < inviteCooldowns[popupUser.id])}
                cooldownRemaining={inviteCooldowns[popupUser.id] ? Math.ceil((inviteCooldowns[popupUser.id] - Date.now()) / 1000) : 0}
                isMe={isMe} currentAppVersion={appVersion} serverName={popupServerName} source={profilePopup.source} />
            </React.Suspense>
          );
        })()}
      </AnimatePresence>

      {/* ── Mobile Footer — desktop dock'u inline render eder, PTT/VAD butonu + update hub üstte ── */}
      <React.Suspense fallback={<div className="mx-2 mb-2 h-[76px] shrink-0 rounded-2xl" />}>
        <MobileFooter
          listenerToastRef={listenerToastRef}
          dockToastHoveredRef={dockToastHoveredRef}
          cardStyle={cardStyle}
          cycleCardStyle={cycleCardStyle}
          serverList={serverList}
          activeServerId={activeServerId}
          onSelectServer={id => { setActiveServerId(id); setShowDiscover(false); }}
          onJoinServer={handleJoinServer}
          onLeaveServer={handleLeaveServer}
          onShowCreateModal={() => { if (canCreateServer) setShowCreateModal(true); }}
          canCreateServer={canCreateServer}
          currentView={currentView}
          onGoHome={handleGoHome}
          onReturnToRoom={handleReturnToRoom}
        />
      </React.Suspense>

      {/* ── DM Panel ── */}
      <React.Suspense fallback={null}>
        <DMPanel isOpen={dmPanelOpen} onClose={() => setDmPanelOpen(false)} openUserId={dmTargetUserId}
          onOpenHandled={() => setDmTargetUserId(null)} onUnreadChange={setDmUnreadCount}
          onRequestCountChange={setDmRequestCount}
          onActiveConvKeyChange={setActiveDmConvKey} onNearBottomChange={setDmAtBottom} toggleRef={dmToggleRef} />
      </React.Suspense>

      {/* ── Oda içi üye moderation context menu (sağ-tık, role-aware) ──
          Tetikleme noktaları: (1) VoiceParticipants katılımcı kartı, (2) LeftSidebar üye satırı.
          İkisi de aynı state'i (`roomMemberMenu`) set eder, tek menü render edilir. */}
      {roomMemberMenu && (
        <React.Suspense fallback={null}>
          <RoomMemberContextMenu
            ctx={roomMemberMenu}
            onClose={() => setRoomMemberMenu(null)}
            serverId={activeServerId}
            myRole={(ROLE_HIERARCHY[activeServerData?.role as ServerRole] != null ? (activeServerData!.role as ServerRole) : 'member')}
            ownerUserId={null}
            currentUserId={currentUser.id}
            showToast={setToastMsg}
          />
        </React.Suspense>
      )}

      {/* ── Notification toast stack (top-right portal) ── */}
      <ToastContainer />
    </div>
  );
}
