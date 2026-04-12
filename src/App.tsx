/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare const __APP_VERSION__: string;

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppView, User, VoiceChannel } from './types';
import { CHANNELS } from './constants';
// Theme types + adaptive theme artık useAppSettings hook'unda
import {
  signIn,
  signOut,
  signUp,
  getSession,
  saveProfile,
  getProfile,
  getProfileByUsername,
  getAllProfiles,
  getChannels,
  deleteChannel,
  updateUserModeration,
  verifyChannelPassword,
  saveInviteCode,
  verifyInviteCodeForEmail,
  useInviteCodeForEmail,
  getPendingInviteRequests,
  updateActivityOnLogout,
  updateLastSeenHeartbeat,
  updateShowLastSeen,
  supabase as supabaseClient,
} from './lib/supabase';
import { playSound } from './lib/sounds';
import { checkChannelAccess, getServerAccessContext, type ServerAccessContext } from './lib/serverService';
import { logger } from './lib/logger';
import { type AudioCaptureOptions } from 'livekit-client';

// Supabase DB satır tipleri
type DbProfile = {
  id: string; name: string; email?: string; first_name?: string; last_name?: string;
  age?: number; avatar?: string; is_admin?: boolean; is_primary_admin?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean; mute_expires?: number; is_voice_banned?: boolean; ban_expires?: number;
  app_version?: string; last_seen_at?: string; total_usage_minutes?: number;
  show_last_seen?: boolean;
};
type DbChannel = {
  id: string; name: string; owner_id?: string; max_users?: number;
  is_invite_only?: boolean; is_hidden?: boolean; password?: string;
  mode?: string; speaker_ids?: string[];
};

import { AppStateContext, AppStateContextType } from './contexts/AppStateContext';
import type { InviteRequest } from './types';
import { AudioCtx, AudioContextType } from './contexts/AudioContext';
import { UserContext, UserContextType } from './contexts/UserContext';
import { ChannelContext, ChannelContextType } from './contexts/ChannelContext';
import { UIContext, UIContextType } from './contexts/UIContext';
import { SettingsCtx, SettingsContextType } from './contexts/SettingsCtx';

import { useDevices } from './hooks/useDevices';
import { usePttAudio } from './hooks/usePttAudio';
import { useLiveKitConnection } from './hooks/useLiveKitConnection';
import { usePresence } from './hooks/usePresence';
import { useModeration } from './hooks/useModeration';
import { useDucking } from './hooks/useDucking';
import { useAutoPresence, type AutoStatus } from './hooks/useAutoPresence';
import { useFriends } from './hooks/useFriends';

// LoginSelectionView kaldırıldı — LoginPasswordView ana giriş ekranı
import LoginCodeView from './views/LoginCodeView';
import LoginPasswordView from './views/LoginPasswordView';
import RegisterDetailsView from './views/RegisterDetailsView';
import ChatView from './views/ChatView';
import BanScreen from './components/BanScreen';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import { type ResetRequest } from './components/PasswordResetPanel';
import { getReleaseNotes } from './lib/releaseNotes';
import PermissionOnboarding from './components/PermissionOnboarding';
import { useWindowActivity } from './hooks/useWindowActivity';
import { isCapacitor } from './lib/platform';
import { toTitleCaseTr, formatFullName } from './lib/formatName';
import { warmUpTokenServer } from './lib/livekit';
import { getRoomModeConfig } from './lib/roomModeConfig';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { activatePresence } from './lib/presenceLifecycle';
import { useAppSettings } from './features/app/hooks/useAppSettings';
import { useAdminPanel } from './features/app/hooks/useAdminPanel';
import { useChannelActions } from './features/app/hooks/useChannelActions';

const isSupabaseUser = (userId: string) => userId.includes('-');

function mapDbChannel(c: DbChannel): VoiceChannel {
  return {
    id: c.id,
    name: c.name,
    userCount: 0,
    members: [],
    isSystemChannel: false,
    ownerId: c.owner_id,
    maxUsers: c.max_users,
    isInviteOnly: c.is_invite_only,
    isHidden: c.is_hidden,
    password: c.password || undefined,
    mode: c.mode || undefined,
    speakerIds: c.speaker_ids || undefined,
    position: 0,
  };
}

function mapDbProfile(
  p: DbProfile,
  knownVersions?: Map<string, string>,
): User {
  return {
    id: p.id,
    email: p.email || '',
    name: p.name || '',
    firstName: p.first_name || p.name || '',
    lastName: p.last_name || '',
    age: p.age || 0,
    avatar: p.avatar || ((p.first_name?.[0] || p.name?.[0] || '?').toUpperCase()),
    status: 'offline' as const,
    statusText: 'Çevrimdışı',
    isAdmin: p.is_admin || false,
    isPrimaryAdmin: p.is_primary_admin || false,
    isModerator: p.is_moderator || false,
    isMuted: p.is_muted || false,
    isVoiceBanned: p.is_voice_banned || false,
    appVersion: knownVersions?.get(p.id) || p.app_version,
    lastSeenAt: p.last_seen_at || undefined,
    totalUsageMinutes: p.total_usage_minutes || 0,
    showLastSeen: p.show_last_seen !== false,
  };
}

async function loadChannelsFromDb(): Promise<VoiceChannel[]> {
  const { data } = await getChannels();
  return data && data.length > 0 ? data.map((c: DbChannel) => mapDbChannel(c)) : [];
}


function buildOnlineUser(id: string, email: string, profile: DbProfile | null): User {
  if (profile) {
    return {
      id,
      email,
      name: profile.name || email,
      firstName: profile.first_name || email.split('@')[0],
      lastName: profile.last_name || '',
      age: profile.age || 18,
      avatar: profile.avatar || '',
      status: 'online' as const,
      statusText: 'Aktif',
      isAdmin: profile.is_admin || false,
      isPrimaryAdmin: profile.is_primary_admin || false,
      isModerator: profile.is_moderator || false,
      isMuted: profile.is_muted || false,
      muteExpires: profile.mute_expires || undefined,
      isVoiceBanned: profile.is_voice_banned || false,
      banExpires: profile.ban_expires || undefined,
      mustChangePassword: (profile as any).must_change_password || false,
      appVersion: profile.app_version || undefined,
      lastSeenAt: profile.last_seen_at || undefined,
      totalUsageMinutes: profile.total_usage_minutes || 0,
      showLastSeen: profile.show_last_seen !== false,
    };
  }
  return {
    id,
    name: email,
    firstName: email.split('@')[0],
    lastName: '',
    age: 18,
    avatar: '',
    status: 'online' as const,
    statusText: 'Aktif',
    isAdmin: false,
    isPrimaryAdmin: false,
  };
}

async function loadOfflineUsers(
  excludeId: string | undefined,
  knownVersions: Map<string, string>,
): Promise<User[]> {
  const { data } = await getAllProfiles();
  if (!data) return [];
  return data
    .filter((p: DbProfile) => !excludeId || p.id !== excludeId)
    .map((p: DbProfile) => mapDbProfile(p, knownVersions));
}

export default function App() {
  // ── Window activity: toggles .window-inactive CSS class on <html> ──
  useWindowActivity();

  const [view, setView] = useState<AppView>('loading');
  const [isSessionLoading, setIsSessionLoading] = useState(true);


  // ── Mobil izin onboarding — her açılışta gerçek izin durumunu kontrol eder ──
  const [permissionsGranted, setPermissionsGranted] = useState(() => {
    if (!isCapacitor()) return true; // Masaüstünde izin akışı yok
    return false; // Mobilde her zaman kontrol et — PermissionOnboarding kendi içinde granted ise auto-complete yapar
  });
  const handlePermissionsComplete = () => {
    localStorage.setItem('cylk-permissions-setup-done', 'true');
    setPermissionsGranted(true);
  };

  // ── Settings state (useAppSettings hook) ──────────────────────────────
  const settings = useAppSettings();
  const {
    currentTheme, isLowDataMode, isNoiseSuppressionEnabled, noiseThreshold,
    pttKey, setPttKey, isListeningForKey, setIsListeningForKey,
    voiceMode, setVoiceMode, pttReleaseDelay, autoLeaveEnabled, autoLeaveMinutes,
    showLastSeen, setShowLastSeenLocal,
  } = settings;

  // showLastSeen DB sync — hook sadece localStorage yönetir, DB + user state burada
  const setShowLastSeen = (v: boolean) => {
    setShowLastSeenLocal(v);
    if (currentUser.id) {
      updateShowLastSeen(currentUser.id, v).catch(() => {});
      setCurrentUser(prev => ({ ...prev, showLastSeen: v }));
      setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, showLastSeen: v } : u));
    }
  };

// ── Audio control state ──────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafenedState] = useState(false);
  const isDeafenedRef = useRef(false);
  const setIsDeafened = (v: boolean) => {
    setIsDeafenedState(v);
    isDeafenedRef.current = v;
    // Tüm LiveKit audio element'lerini mute/unmute et
    document.querySelectorAll('audio[data-livekit-audio]').forEach(el => { (el as HTMLAudioElement).muted = v; });
  };
  const [connectionLevel, setConnectionLevel] = useState(4);

  // ── User state ───────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User>({
    id: '',
    name: '',
    firstName: '',
    lastName: '',
    age: 0,
    avatar: '',
    status: 'online',
    statusText: 'Aktif',
    isAdmin: false,
    isPrimaryAdmin: false,
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // ── Friends v2 ───────────────────────────────────────────────────────────
  const {
    friendIds, isFriend, getRelationship,
    sendRequest, acceptRequest, rejectRequest, cancelRequest, removeFriend,
    incomingRequests, loading: friendsLoading,
  } = useFriends(currentUser.id || undefined);

  // ── Channel state ────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);

  const currentChannel = useMemo(
    () => channels.find(c => c.id === activeChannel),
    [channels, activeChannel]
  );
  const channelMembers = useMemo(
    () => allUsers.filter(u => currentChannel?.members?.includes(u.id)),
    [allUsers, currentChannel]
  );

  const [appVersion, setAppVersion] = useState<string>(() => {
    try { return __APP_VERSION__ || '0.0.0'; } catch { return '0.0.0'; }
  });
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForcePasswordChange, setShowForcePasswordChange] = useState(false);
  // Admin panel state — hook çağrısı presenceChannelRef'ten sonra (aşağıda)

  useEffect(() => {
    const w = window as Window & {
      electronApp?: { getVersion: () => Promise<string>; setTrayChannel?: (name: string | null) => void };
    };
    w.electronApp?.getVersion().then(v => {
      setAppVersion(v);
      const lastSeen = localStorage.getItem('cylk-last-version');
      if (lastSeen && lastSeen !== v && getReleaseNotes(v)) {
        setShowReleaseNotes(true);
      }
      // Version'ı hemen kaydet — ilk açılışta zaten true set edildi
      localStorage.setItem('cylk-last-version', v);
    }).catch(() => {
      // Electron değilse build-time version kullan
      const v = appVersion;
      const lastSeen = localStorage.getItem('cylk-last-version');
      if (lastSeen && lastSeen !== v && getReleaseNotes(v)) {
        setShowReleaseNotes(true);
      }
      localStorage.setItem('cylk-last-version', v);
    });
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsgRaw] = useState<string | null>(null);
  const toastQueueRef = useRef<string[]>([]);
  const toastActiveRef = useRef<string | null>(null);

  const setToastMsg = useCallback((msg: string | null) => {
    if (msg === null) {
      // Dismiss aktif — sıradakini göster
      toastActiveRef.current = null;
      const next = toastQueueRef.current.shift() ?? null;
      setToastMsgRaw(next);
      toastActiveRef.current = next;
      return;
    }
    // Dedupe: aktif mesaj veya kuyrukta aynısı varsa atla
    if (toastActiveRef.current === msg || toastQueueRef.current.includes(msg)) return;
    // Aktif mesaj yoksa direkt göster
    if (!toastActiveRef.current) {
      toastActiveRef.current = msg;
      setToastMsgRaw(msg);
    } else {
      // Kuyruk sınırı 5
      if (toastQueueRef.current.length < 5) {
        toastQueueRef.current.push(msg);
      }
    }
  }, []);
  // ── Invite state: ephemeral state + persistent ref (rehydration için) ──
  type InviteData = { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string };
  const [invitationModal, setInvitationModalRaw] = useState<InviteData | null>(null);
  const pendingInviteRef = useRef<InviteData | null>(null);

  const setInvitationModal = useCallback((v: InviteData | null) => {
    if (v) {
      console.log('[InviteStore] pending_set:', v.inviterName, v.roomName);
      pendingInviteRef.current = v;
    } else {
      console.log('[InviteStore] pending_cleared');
      pendingInviteRef.current = null;
    }
    setInvitationModalRaw(v);
  }, []);
  // ── App resume / visibility change → pending invite rehydration ──
  // Android WebView suspend olduğunda React state update'leri işlenmeyebilir.
  // Ref her zaman synchronous güncel kalır. App ön plana gelince ref'ten state'e rehydrate.
  useEffect(() => {
    const rehydrate = () => {
      if (pendingInviteRef.current) {
        setInvitationModalRaw(prev => {
          if (prev) return prev; // zaten açık
          console.log('[InviteStore] pending_used (rehydrated on resume)');
          return pendingInviteRef.current;
        });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] resume_check_invite, pending:', !!pendingInviteRef.current);
        rehydrate();
      }
    };
    // Capacitor resume event
    const onResume = () => {
      console.log('[App] capacitor_resume, pending:', !!pendingInviteRef.current);
      rehydrate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
    };
  }, []);

  const [userActionMenu, setUserActionMenu] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channelId: string } | null>(null);
  // statusMenu / statusTimerInput kaldırıldı — manuel durum özelliği (Telefonda, Hemen Geleceğim vb.) artık yok
  const [roomModal, setRoomModal] = useState<{
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
    mode: string;
  }>({ isOpen: false, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' });
  const [passwordModal, setPasswordModal] = useState<{ type: 'set' | 'enter'; channelId: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordRepeatInput, setPasswordRepeatInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('userVolumes');
    return saved ? JSON.parse(saved) : {};
  });

  // Invite cooldown + status artık useChannelActions hook'unda
  // Stable ref wrapper'lar — usePresence çağrısı bu fonksiyonlardan önce geldiği için ref gerekir
  const handleInviteRejectedCooldownRef = useRef<(inviteeId: string) => void>(() => {});
  const handleInviteAcceptedRef = useRef<(inviteeId: string) => void>(() => {});

  // ── AppState-only state ──────────────────────────────────────────────────
  // statusTimer kaldırıldı — "X dk Sonra Geleceğim" özelliği artık yok
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loginNick, setLoginNick] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [displayName, setDisplayName] = useState('');

  // ── Refs ─────────────────────────────────────────────────────────────────
  const connectionLostRef = useRef(false);
  const pendingInviteCodeRef = useRef<string | null>(null);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const sessionStartedAtRef = useRef<number>(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  const activeServerIdRef = useRef(activeServerId);
  useEffect(() => { activeServerIdRef.current = activeServerId; }, [activeServerId]);

  // Kanal sırası optimistic concurrency token — backend listChannels / reorder ile senkron.
  const channelOrderTokenRef = useRef<string | null>(null);

  // Capability foundation: aktif sunucudaki kullanıcı context'i.
  const [accessContext, setAccessContext] = useState<ServerAccessContext | null>(null);
  useEffect(() => {
    if (!activeServerId || !currentUser.id) { setAccessContext(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const ctx = await getServerAccessContext(activeServerId);
        if (!cancelled) setAccessContext(ctx);
      } catch {
        if (!cancelled) setAccessContext(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeServerId, currentUser.id]);
  const isLowDataModeRef = useRef(isLowDataMode);
  useEffect(() => { isLowDataModeRef.current = isLowDataMode; }, [isLowDataMode]);
  const allUsersRef = useRef(allUsers);
  useEffect(() => { allUsersRef.current = allUsers; }, [allUsers]);
  const userVolumesRef = useRef(userVolumes);
  useEffect(() => { userVolumesRef.current = userVolumes; }, [userVolumes]);

  // Forward ref to break circular dependency: usePresence needs disconnectFromLiveKit,
  // but useLiveKitConnection needs presenceChannelRef (which comes from usePresence).
  const disconnectLKRef = useRef<() => Promise<void>>(async () => {});
  const handleJoinChannelRef = useRef<(id: string, isInvited?: boolean) => Promise<void>>(async () => {});

  // ── Device hook ─────────────────────────────────────────────────────────
  const {
    inputDevices,
    outputDevices,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    showInputSettings,
    setShowInputSettings,
    showOutputSettings,
    setShowOutputSettings,
  } = useDevices();

  // ── PTT Audio hook ───────────────────────────────────────────────────────
  // Room mode voice config: izin verilen modları kontrol et, yoksa default'a düş
  const activeRoomChannel = channels.find(c => c.id === activeChannel);
  const activeRoomModeConfig = getRoomModeConfig(activeRoomChannel?.mode);

  // Broadcast odada konuşmacı mı dinleyici mi?
  // speakerIds yoksa ve ownerId varsa → oda sahibi varsayılan konuşmacı
  // speakerIds yoksa ve ownerId de yoksa (sistem kanalı) → herkes konuşabilir
  const isBroadcastListener = activeRoomChannel?.mode === 'broadcast' && (() => {
    const speakers = activeRoomChannel.speakerIds;
    if (!speakers || speakers.length === 0) {
      // Hiç speaker atanmamış
      if (!activeRoomChannel.ownerId) return false; // Sistem kanalı → herkes konuşabilir
      return activeRoomChannel.ownerId !== currentUser.id;
    }
    return !speakers.includes(currentUser.id);
  })();

  const effectiveVoiceMode = (() => {
    if (!activeChannel) return voiceMode;
    const vc = activeRoomModeConfig.voice;
    // Kullanıcının mevcut tercihi izin verilenler arasındaysa koru
    if (vc.allowedModes.includes(voiceMode)) return voiceMode;
    // Değilse odanın varsayılanına düş
    return vc.defaultMode;
  })();

  const { isPttPressed, setIsPttPressed: setPttPressed, volumeLevel } = usePttAudio({
    pttKey,
    setPttKey,
    isListeningForKey,
    setIsListeningForKey,
    isMuted,
    isVoiceBanned: currentUser.isVoiceBanned ?? false,
    isVoiceConnected: !!activeChannel && !isConnecting,
    selectedInput,
    isNoiseSuppressionEnabled,
    noiseThreshold,
    isLowDataMode,
    pttReleaseDelay,
    voiceMode: effectiveVoiceMode,
    onMicError: (msg) => {
      setToastMsg(msg);
      // auto-dismiss dock useEffect'te yönetiliyor
    },
  });

  // ── Auto-Presence hook ───────────────────────────────────────────────────
  // Tek aktivite kaynağı: auto-presence + auto-leave aynı lastActivityRef'i kullanır.
  // idleThresholdMs: ayarlardaki autoLeaveMinutes'ten gelir → iki sistem senkron kalır.
  const autoStatusRef = useRef<AutoStatus>('active');
  // presenceChannelRef usePresence'tan sonra dolacak — callback lazy olduğundan ref üzerinden erişiyoruz
  const presenceChannelForAutoRef = useRef<any>(null);
  const {
    lastActivityRef: sharedLastActivityRef,
    recordActivity,
    recordActivityImmediate,
    currentAutoStatus,
  } = useAutoPresence({
    isLoggedIn: !!currentUser.id,
    isDeafened,
    isPttPressed,
    statusText: currentUser.statusText,
    // Auto-presence idle'ı auto-leave kick'ten ÖNCE göstermeli:
    // Threshold'un yarısında "Pasif" görünür, tam threshold'da oda çıkışı olur.
    idleThresholdMs: Math.floor(autoLeaveMinutes * 60 * 1000 / 2),
    onStatusChange: (status) => {
      autoStatusRef.current = status;
      // Presence payload'ı güncelle — diğer kullanıcılar yeni durumu görsün
      const ch = presenceChannelForAutoRef.current;
      if (!ch || !currentUserRef.current.id) return;
      ch.track({
        userId: currentUserRef.current.id,
        appVersion,
        selfMuted: isMuted,
        selfDeafened: isDeafened,
        userName: currentUserRef.current.name,
        currentRoom: activeChannelRef.current || undefined,
        serverId: activeServerIdRef.current || undefined,
        autoStatus: status,
      });
    },
  });

  // ── Presence hook ────────────────────────────────────────────────────────
  const { presenceChannelRef, knownVersionsRef, startPresence, stopPresence, resyncPresence } = usePresence({
    currentUserRef,
    activeChannelRef,
    activeServerIdRef,
    channelOrderTokenRef,
    disconnectFromLiveKit: () => disconnectLKRef.current(),
    setAllUsers,
    setCurrentUser,
    setChannels,
    setActiveChannel,
    setToastMsg,
    setInvitationModal,
    onMoved: (targetChannelId) => handleJoinChannelRef.current(targetChannelId, true),
    onPasswordResetUpdate: (userId) => {
      setPasswordResetRequests(prev => prev.filter(r => r.userId !== userId));
    },
    onInviteRejected: (inviteeId) => handleInviteRejectedCooldownRef.current(inviteeId),
    onInviteAccepted: (inviteeId) => handleInviteAcceptedRef.current(inviteeId),
  });

  // presenceChannelRef'i auto-presence callback'i için senkronize et
  presenceChannelForAutoRef.current = presenceChannelRef.current;

  // ── Admin panel hook — reset/invite polling + handlers ──
  const adminPanel = useAdminPanel({
    currentUserId: currentUser.id,
    isAdmin: currentUser.isAdmin || false,
    isPrimaryAdmin: currentUser.isPrimaryAdmin || false,
    view,
    presenceChannelRef,
    setToastMsg,
  });
  const { passwordResetRequests, setPasswordResetRequests, inviteRequests, setInviteRequests } = adminPanel;

  // Channel actions hook çağrısı livekitRoomRef'ten sonra (aşağıda)

  // Stable ref so the 5s timer always calls the latest resyncPresence
  const resyncPresenceRef = useRef(resyncPresence);
  resyncPresenceRef.current = resyncPresence;

  const presenceDeps = { startPresence, resyncPresence, resyncPresenceRef };

  // ── LiveKit hook ─────────────────────────────────────────────────────────
  const [speakingLevels, setSpeakingLevels] = useState<Record<string, number>>({});

  const { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit } = useLiveKitConnection({
    presenceChannelRef,
    currentUserRef,
    activeChannelRef,
    activeServerIdRef,
    connectionLostRef,
    isDeafenedRef,
    isNoiseSuppressionEnabled,
    selectedInput,
    selectedOutput,
    setConnectionLevel,
    setToastMsg,
    setActiveChannel,
    setIsConnecting,
    setChannels,
    setAllUsers,
    allUsersRef,
    userVolumesRef,
    setSpeakingLevels,
  });

  // Keep forward ref current so usePresence always calls the real function
  disconnectLKRef.current = disconnectFromLiveKit;

  // ── Channel actions hook (livekitRoomRef + presenceChannelRef hazır) ──
  const channelActions = useChannelActions({
    channels, setChannels, activeChannel, setActiveChannel,
    activeServerId,
    channelOrderTokenRef,
    currentUser, allUsers,
    presenceChannelRef, livekitRoomRef,
    roomModal, setRoomModal,
    setContextMenu, setUserActionMenu,
    setPasswordModal, setPasswordInput, setPasswordRepeatInput, setPasswordError,
    setToastMsg, userVolumes, setUserVolumes,
    view, setView,
  });
  const {
    inviteCooldowns, inviteStatuses,
    handleInviteRejectedCooldown, handleInviteAccepted,
    handleUpdateUserVolume, handleUserActionClick,
    handleToggleSpeaker, handleInviteUser,
    handleKickUser, handleMoveUser,
    handleSaveRoom, handleDeleteRoom, handleRenameRoom, handleReorderChannels,
    handleSetPassword, handleRemovePassword, handleContextMenu,
  } = channelActions;
  handleInviteRejectedCooldownRef.current = handleInviteRejectedCooldown;
  handleInviteAcceptedRef.current = handleInviteAccepted;

  // ── Smart Voice Ducking — dominant speaker based ────────────────────────
  // Room mode config'den ducking parametreleri okunur.
  useDucking({
    livekitRoomRef,
    speakingLevels,
    userVolumes,
    duckingConfig: getRoomModeConfig(channels.find(c => c.id === activeChannel)?.mode).ducking,
    isConnected: !!activeChannel && !isConnecting,
    localIdentity: currentUser.name,
  });

  // ── Moderation hook ──────────────────────────────────────────────────────
  const {
    broadcastModeration,
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleToggleModerator,
  } = useModeration({
    currentUser,
    allUsers,
    presenceChannelRef,
    setAllUsers,
    setToastMsg,
    onSelfDelete: () => setView('login-password'),
  });

  // ── Fallback network quality (oda dışı) ─────────────────────────────────
  // Oda içindeyken LiveKit kendi ConnectionQualityChanged eventi ile besler.
  // Bu fallback sadece LiveKit bağlantısı yokken çalışır.
  useEffect(() => {
    const isInRoom = () => !!livekitRoomRef.current;

    const getNetworkType = (): number => {
      if (!navigator.onLine) return 0;
      const conn = (navigator as any).connection;
      if (!conn) return 4;
      const type: string = conn.effectiveType || '4g';
      if (type === 'slow-2g') return 1;
      if (type === '2g') return 2;
      if (type === '3g') return 3;
      return 4;
    };

    const rttToLevel = (rtt: number): number =>
      rtt < 150 ? 4 : rtt < 300 ? 3 : rtt < 600 ? 2 : 1;

    const onOffline = () => {
      connectionLostRef.current = true;
      setConnectionLevel(0);
      setToastMsg('İnternet bağlantısı kesildi.');
    };
    const onOnline = () => {
      if (isInRoom()) return;
      setConnectionLevel(getNetworkType());
      if (connectionLostRef.current) {
        connectionLostRef.current = false;
      }
    };
    const onConnectionChange = () => {
      if (isInRoom()) return;
      setConnectionLevel(getNetworkType());
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const conn = (navigator as any).connection;
    if (conn) conn.addEventListener('change', onConnectionChange);

    // Fallback ping — sadece oda dışında
    const pingInterval = setInterval(async () => {
      if (isInRoom() || !navigator.onLine) return;
      const start = Date.now();
      try {
        await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', { method: 'HEAD', cache: 'no-store', headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } });
        const rtt = Date.now() - start;
        // Ref'i tekrar kontrol — fetch sırasında odaya girilmiş olabilir
        if (isInRoom()) return;
        const level = rttToLevel(rtt);
        logger.info('Fallback ping', { rtt, level });
        setConnectionLevel(level);
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          setToastMsg(null);
        }
      } catch {
        if (isInRoom()) return;
        setConnectionLevel(0);
      }
    }, 15000);

    setConnectionLevel(getNetworkType());

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (conn) conn.removeEventListener('change', onConnectionChange);
      clearInterval(pingInterval);
    };
  }, []);

  // ── Session restore on page load ─────────────────────────────────────────
  useEffect(() => {
    // Render cold start — sunucu uyuyorsa şimdiden uyandır
    warmUpTokenServer();

    getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session?.user) {
        setView('login-password');
        setIsSessionLoading(false);
        return;
      }

      try {

      const email = session.user.email || '';
      const { data: profile } = await getProfile(session.user.id);

      const restoredUser = buildOnlineUser(session.user.id, email, profile);
      if (!restoredUser.avatar) {
        restoredUser.avatar = ((restoredUser.firstName?.[0] || '') + '').toUpperCase() + (restoredUser.age || '');
      }

      setAllUsers((prev) => [...prev.filter((u) => u.id !== session.user.id), restoredUser]);
      setCurrentUser(restoredUser);
      // DB'deki son görülme tercihini localStorage'a sync et
      if (restoredUser.showLastSeen === false) localStorage.setItem('showLastSeen', 'false');
      else localStorage.setItem('showLastSeen', 'true');
      setIsMuted(restoredUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt

      // ── 1. Channels — sunucu seçilince ChatView'dan yüklenecek (server-scoped)
      // Eski global kanal yükleme devre dışı — sunucu izolasyonu için

      // ── 2. Users yükle
      const offlineUsers = await loadOfflineUsers(undefined, knownVersionsRef.current);
      if (offlineUsers.length > 0) {
        setAllUsers((prev) => {
          const prevMap = new Map(prev.map((u) => [u.id, u]));
          return [...prev, ...offlineUsers.filter(u => !prevMap.has(u.id))];
        });
      }

      // ── 3. Channels + users hazır — presence'ı ŞİMDİ başlat
      activatePresence(restoredUser, appVersion, presenceDeps);
      startHeartbeat(restoredUser.id);

      setView('chat');
      setIsSessionLoading(false);

      } catch (err) {
        logger.error('Session restore failed', { error: err instanceof Error ? err.message : err });
        setView('login-password');
        setIsSessionLoading(false);
      }
    }).catch((err) => {
      logger.error('getSession failed', { error: err instanceof Error ? err.message : err });
      setView('login-password');
      setIsSessionLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tray menüsüne aktif oda adını bildir ────────────────────────────────
  useEffect(() => {
    const w = window as Window & { electronApp?: { setTrayChannel?: (name: string | null) => void } };
    const channelName = activeChannel ? channels.find(c => c.id === activeChannel)?.name || null : null;
    w.electronApp?.setTrayChannel?.(channelName);
  }, [activeChannel, channels]);

  // ── TEK 5000ms INTERVAL — mute/ban süresi kontrolü ───────────────────────
  const slowTickRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      slowTickRef.current += 1;
      const shouldCheck = !isLowDataModeRef.current || slowTickRef.current % 3 === 0;
      if (shouldCheck) {
        const now = Date.now();
        setAllUsers(prev => prev.map(u => {
          let updated = false;
          const newUser = { ...u };
          if (newUser.muteExpires && newUser.muteExpires < now) {
            newUser.isMuted = false;
            newUser.muteExpires = undefined;
            updated = true;
            if (isSupabaseUser(u.id)) updateUserModeration(u.id, { is_muted: false, mute_expires: null });
            // Eğer süre dolan kullanıcı mevcut kullanıcıysa UI state'ini de sıfırla
            if (u.id === currentUserRef.current.id) {
              setCurrentUser(prev => ({ ...prev, isMuted: false, muteExpires: undefined }));
              setIsMuted(false);
            }
          }
          if (newUser.banExpires && newUser.banExpires < now) {
            newUser.isVoiceBanned = false;
            newUser.banExpires = undefined;
            updated = true;
            if (isSupabaseUser(u.id)) updateUserModeration(u.id, { is_voice_banned: false, ban_expires: null });
            if (u.id === currentUserRef.current.id) {
              setCurrentUser(prev => ({ ...prev, isVoiceBanned: false, banExpires: undefined }));
            }
          }
          return updated ? newUser : u;
        }));
        resyncPresenceRef.current();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Settings açıldığında presence versiyon bilgisini hemen tazele
  useEffect(() => {
    if (view === 'settings') resyncPresenceRef.current();
  }, [view]);

  // ── Global click listener to close all popups/menus ──────────────────────
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setUserActionMenu(null);
      setShowInputSettings(false);
      setShowOutputSettings(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [setShowInputSettings, setShowOutputSettings]);

  // statusTimer effect kaldırıldı — "X dk Sonra Geleceğim" özelliği artık yok

  // ── Code timer: clear code when timeLeft hits 0 ──────────────────────────
  useEffect(() => {
    if (timeLeft === 0 && generatedCode) {
      setGeneratedCode(null);
    }
  }, [timeLeft, generatedCode]);

  // ── TEK 1000ms INTERVAL — code timer + room deletion ──────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));

      setChannels(prevChannels => {
        let hasChanges = false;
        const channelsToDelete: string[] = [];

        // Task #18 defense-in-depth: is_default flag drift olursa name fallback'i.
        const SYSTEM_ROOM_NAMES = new Set(['Sohbet Muhabbet', 'Oyun Takımı', 'Yayın Sahnesi', 'Sessiz Alan']);
        const nextChannels = prevChannels.map(channel => {
          if (channel.isSystemChannel) return channel;
          if (SYSTEM_ROOM_NAMES.has(channel.name)) return channel; // hard fallback

          const isEmpty = !channel.members || channel.members.length === 0;

          if (isEmpty) {
            const currentTimer = channel.deletionTimer ?? 30;
            if (currentTimer > 0) {
              hasChanges = true;
              return { ...channel, deletionTimer: currentTimer - 1 };
            } else {
              hasChanges = true;
              channelsToDelete.push(channel.id);
              return null;
            }
          } else if (channel.deletionTimer !== undefined) {
            hasChanges = true;
            return { ...channel, deletionTimer: undefined };
          }

          return channel;
        }).filter((c): c is VoiceChannel => c !== null);

        if (channelsToDelete.length > 0) {
          if (activeChannelRef.current && channelsToDelete.includes(activeChannelRef.current)) {
            setActiveChannel(null);
          }
          channelsToDelete.forEach(id => {
            deleteChannel(id).catch(err => console.warn('Oda silinemedi:', err));
            presenceChannelRef.current?.send({
              type: 'broadcast',
              event: 'channel-update',
              payload: { action: 'delete', channelId: id },
            });
          });
        }

        return hasChanges ? nextChannels : prevChannels;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ── PTT speaking broadcast + audio state sync ─────────────────────────────
  // selfMuted / selfDeafened: kullanıcının kendi toggle'ı. Admin mute'tan ayrı.
  useEffect(() => {
    if (!activeChannel) return;
    const canSpeak = isPttPressed && !isMuted && !currentUser.isVoiceBanned && !isBroadcastListener;
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'speaking',
      payload: {
        userId: currentUser.id,
        isSpeaking: canSpeak,
        selfMuted: isMuted,
        selfDeafened: isDeafened,
      },
    });
  }, [isPttPressed, isMuted, isDeafened, currentUser.isVoiceBanned, activeChannel, currentUser.id]);

  // ── Ses bildirimleri ──────────────────────────────────────────────────────
  const soundMountedRef = useRef(false);
  useEffect(() => {
    if (!soundMountedRef.current) { soundMountedRef.current = true; return; }
    playSound(isMuted ? 'mute' : 'unmute');
  }, [isMuted]);

  const deafenMountedRef = useRef(false);
  useEffect(() => {
    if (!deafenMountedRef.current) { deafenMountedRef.current = true; return; }
    playSound(isDeafened ? 'deafen' : 'undeafen');
  }, [isDeafened]);

  // Admin-driven mute/unmute: currentUser.isMuted (DB) → isMuted (audio state) senkronizasyonu.
  // Self-mute currentUser.isMuted'i değiştirmez, bu effect yalnızca admin işlemlerinde tetiklenir.
  useEffect(() => {
    setIsMuted(currentUser.isMuted ?? false);
  }, [currentUser.isMuted]);

  useEffect(() => {
    if (!activeChannel || isConnecting) return;
    playSound(isPttPressed ? 'ptt-on' : 'ptt-off');
  }, [isPttPressed]);

  // ── LiveKit PTT: enable/disable mic based on PTT state ───────────────────
  useEffect(() => {
    if (!livekitRoomRef.current) return;
    const canSpeak = isPttPressed && !isMuted && !currentUser.isVoiceBanned && !isBroadcastListener;
    livekitRoomRef.current.localParticipant.setMicrophoneEnabled(canSpeak, {
      echoCancellation: true,
      noiseSuppression: isNoiseSuppressionEnabled,
      autoGainControl: isNoiseSuppressionEnabled,
      deviceId: selectedInput || undefined,
    } satisfies AudioCaptureOptions).catch(err => console.warn('Mikrofon durumu güncellenemedi:', err));
  }, [isPttPressed, isMuted, currentUser.isVoiceBanned, isNoiseSuppressionEnabled, selectedInput]);

  // ── Deafen: mute all remote audio elements ────────────────────────────────
  useEffect(() => {
    document.querySelectorAll<HTMLAudioElement>('[data-livekit-audio]').forEach(el => {
      el.muted = isDeafened;
    });
  }, [isDeafened]);

  // ── Auto-leave on idle: kullanıcı belirli süre pasif kalırsa kanaldan çıkar ──
  // NOT: lastActivity takibi useAutoPresence'ın sharedLastActivityRef'inde.
  // Bu timer sadece auto-leave mantığını (uyarı + oda çıkışı) çalıştırır.
  // Auto-presence durumu (Pasif/Aktif/Duymuyor) useAutoPresence tarafından yönetilir.
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastJoinRef = useRef(0);
  const idleWarningShownRef = useRef(false);

  // PTT basıldığında auto-leave uyarı flag'ini temizle (activity shared ref'te zaten güncelleniyor)
  useEffect(() => {
    if (isPttPressed) idleWarningShownRef.current = false;
  }, [isPttPressed]);

  // Kanal veya ayar değiştiğinde timer'ı yeniden kur
  useEffect(() => {
    if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = null; }
    if (!autoLeaveEnabled || !activeChannel) return;

    // Kanal değiştiğinde activity'yi sıfırla (shared ref üzerinden)
    recordActivityImmediate();
    idleWarningShownRef.current = false;

    const WARNING_SECONDS = 30;
    const thresholdMs = autoLeaveMinutes * 60 * 1000;
    const warningMs = thresholdMs - WARNING_SECONDS * 1000;

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - sharedLastActivityRef.current;

      // 30 saniye uyarısı — aynı idle döngüsünde sadece 1 kez
      if (warningMs > 0 && !idleWarningShownRef.current && elapsed >= warningMs && elapsed < thresholdMs) {
        idleWarningShownRef.current = true;
        setToastMsg('Pasif kaldığınız için kanaldan ayrılmanıza 30 saniye kaldı.');
      }

      // Otomatik ayrılma
      if (elapsed >= thresholdMs) {
        clearInterval(checkInterval);
        idleTimerRef.current = null;
        idleWarningShownRef.current = false;
        disconnectFromLiveKit().then(() => {
          setActiveChannel(null);
          // AFK durumu set et
          const afkUser = { ...currentUserRef.current, statusText: 'AFK' };
          setCurrentUser(afkUser);
          setAllUsers(prev => prev.map(u => u.id === afkUser.id ? afkUser : u));
          presenceChannelRef.current?.send({
            type: 'broadcast',
            event: 'moderation',
            payload: { userId: afkUser.id, updates: { statusText: 'AFK' } },
          });
          setToastMsg('Uzun süre konuşmadığınız için kanaldan ayrıldınız.');
        });
      }
    }, 10_000);

    idleTimerRef.current = checkInterval;
    return () => { clearInterval(checkInterval); };
  }, [autoLeaveEnabled, autoLeaveMinutes, activeChannel]);

  // ── Kanaldan çıkılınca (activeChannel null) kullanıcıyı tüm kanallardan temizle ──
  // NOT: Kanala GİRİŞ için optimistic ekleme handleJoinChannel içinde yapılır;
  //      gerçek liste updateMembers() tarafından yazılır. Bu effect sadece çıkışı işler.
  useEffect(() => {
    if (activeChannel !== null) return;
    const id = currentUserRef.current.id;
    if (!id) return;
    setChannels(prev => prev.map(c => {
      if (!c.members?.includes(id)) return c;
      const members = c.members.filter(m => m !== id);
      return { ...c, members, userCount: members.length };
    }));
  }, [activeChannel]);

  // ── Helper functions ──────────────────────────────────────────────────────
  const getAvatarText = (user: User) => {
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
    return `${initials}${user.age || ''}`;
  };

  const getStatusColor = (statusText: string) => {
    if (statusText === 'Aktif') return 'text-[var(--theme-accent)]';
    if (statusText === 'Dinliyor') return 'text-orange-500';
    if (statusText === 'Sessiz') return 'text-[var(--theme-secondary-text)]';
    if (statusText === 'AFK') return 'text-violet-400';
    if (statusText === 'Pasif') return 'text-yellow-500';
    if (statusText === 'Duymuyor') return 'text-red-400';
    return 'text-blue-500';
  };

  const getEffectiveStatus = () => {
    if (currentUser.statusText !== 'Aktif') return currentUser.statusText;
    // Auto-presence durumu
    const auto = autoStatusRef.current;
    if (auto === 'deafened') return 'Duymuyor';
    if (auto === 'idle') return 'Pasif';
    if (isDeafened) return 'Sessiz';
    if (isMuted) return 'Dinliyor';
    return 'Aktif';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  // handleSetStatus kaldırıldı — manuel durum (Telefonda, Hemen Geleceğim, Sonra Geleceğim) artık yok
  // Auto-presence (useAutoPresence) otomatik durumu yönetiyor

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
    }
  };

  // Channel action handler'ları artık useChannelActions hook'unda

  const handleGenerateCode = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const expiresAt = Date.now() + 180 * 1000;
    await saveInviteCode(code, expiresAt);
    setGeneratedCode(code);
    setTimeLeft(180);
  };

  // ── Join helpers ──────────────────────────────────────────────────────────
  // Extracted to avoid duplicating the optimistic join + connect + rollback logic
  const performJoin = async (channelId: string, channelName: string) => {
    // Client-side join throttle — 2sn cooldown
    if (Date.now() - lastJoinRef.current < 2000) return;
    lastJoinRef.current = Date.now();
    logger.info('Room join', { channelId, channelName, userId: currentUser.id });
    // AFK durumundaysa kanala girince temizle
    if (currentUser.statusText === 'AFK') {
      const activeUser = { ...currentUser, statusText: 'Aktif' };
      setCurrentUser(activeUser);
      setAllUsers(prev => prev.map(u => u.id === activeUser.id ? activeUser : u));
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'moderation',
        payload: { userId: activeUser.id, updates: { statusText: 'Aktif' } },
      });
    }
    const now = Date.now();
    const myId = currentUser.id;
    setActiveChannel(channelId);
    // Ref'i hemen güncelle — React render'ı beklemeden.
    // channel-update handler'ı activeChannelRef'i okur; stale kalırsa
    // incoming broadcast'ler kullanıcıyı yanlış kanala ekleyebilir.
    activeChannelRef.current = channelId;
    setIsConnecting(true);
    setChannels(prev => prev.map(c => {
      const members = (c.members || []).filter(m => m !== myId);
      return c.id === channelId
        ? { ...c, members: [...members, myId], userCount: members.length + 1 }
        : { ...c, members, userCount: members.length };
    }));
    setCurrentUser(prev => ({ ...prev, joinedAt: now }));
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: now } : u));

    const connected = await connectToLiveKit(channelId);
    setIsConnecting(false);
    if (!connected) {
      setActiveChannel(null);
      setCurrentUser(prev => ({ ...prev, joinedAt: undefined }));
      setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: undefined } : u));
    } else {
      // Room mode: giriş bildirimi + odanın varsayılan ses modunu uygula
      const joinedCh = channels.find(c => c.id === channelId);
      const joinedMode = getRoomModeConfig(joinedCh?.mode);
      if (joinedMode.pttRequired) {
        setToastMsg('Bu odada bas-konuş zorunludur.');
      } else if (joinedCh?.mode === 'broadcast') {
        const speakers = joinedCh.speakerIds || [];
        const isSpeaker = speakers.length > 0 ? speakers.includes(currentUser.id) : joinedCh.ownerId === currentUser.id;
        if (!isSpeaker && joinedCh.ownerId) {
          setToastMsg('Bu odada dinleyici olarak katıldınız.');
        }
      }
      // Her giriş odanın default moduna geçer
      setVoiceMode(joinedMode.voice.defaultMode);
    }
  };

  const handleJoinChannel = async (id: string, isInvited: boolean = false) => {
    if (view === 'settings') setView('chat');

    const channel = channels.find(c => c.id === id);
    if (!channel) return;

    // Backend canonical access check — private kanallar için gerçek doğrulama.
    if (!isInvited && activeChannel !== id && activeServerId && (channel.isInviteOnly || channel.isHidden)) {
      try {
        const summary = await checkChannelAccess(activeServerId, id);
        if (!summary.canJoin) {
          if (summary.reason === 'hidden') {
            setToastMsg('Bu kanala erişim yetkin yok.');
          } else if (summary.reason === 'invite-only') {
            setToastMsg('Bu özel kanal yalnızca davetlilere açık.');
          } else if (summary.reason === 'not-member' || summary.reason === 'not-found') {
            setToastMsg('Bu kanala erişim yetkin yok.');
          } else {
            setToastMsg('Bu kanala erişim yetkin yok.');
          }
          return;
        }
      } catch {
        // Ağ hatası: güvenli taraf — eski client-side kontrolle devam et
        if (channel.isInviteOnly && !currentUser.isAdmin && channel.ownerId !== currentUser.id) {
          setToastMsg('Bu özel kanal yalnızca davetlilere açık.');
          return;
        }
      }
    } else if (!isInvited && channel.isInviteOnly && !currentUser.isAdmin && channel.ownerId !== currentUser.id) {
      // Fallback sync check (aktif kanal hariç)
      setToastMsg('Bu özel kanal yalnızca davetlilere açık.');
      return;
    }

    if (!isInvited && channel.maxUsers && channel.maxUsers > 0 && channel.userCount >= channel.maxUsers && activeChannel !== id) {
      setToastMsg(`Bu oda maksimum ${channel.maxUsers} kişi alabilir.`);
      return;
    }

    if (!isInvited && channel?.password && activeChannel !== id) {
      setPasswordModal({ type: 'enter', channelId: id });
      setPasswordInput('');
      setPasswordError(false);
    } else {
      await performJoin(id, channel.name);
    }
  };

  // Keep forward ref current so usePresence.onMoved always calls the real function
  handleJoinChannelRef.current = handleJoinChannel;

  const handleVerifyPassword = async () => {
    if (!passwordModal) return;
    const channel = channels.find(c => c.id === passwordModal.channelId);
    if (!channel) return;
    const { data: isValid } = await verifyChannelPassword(passwordModal.channelId, passwordInput);
    if (isValid) {
      setPasswordModal(null);
      setPasswordInput('');
      setPasswordError(false);
      await performJoin(passwordModal.channelId, channel.name);
    } else {
      setPasswordError(true);
    }
  };

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleLogin = async (nick: string, password: string) => {
    if (!nick || !password) throw new Error('Kullanıcı adı ve parola giriniz!');

    let loginEmail = nick;
    if (!nick.includes('@')) {
      const { data: profileByName } = await getProfileByUsername(nick);
      if (!profileByName) throw new Error('Kullanıcı bulunamadı!');
      loginEmail = profileByName.email || nick;
    }

    const { data, error } = await signIn(loginEmail, password);

    if (error) {
      const authErrors: Record<string, string> = {
        'Invalid login credentials': 'Kullanıcı adı veya parola hatalı!',
        'Email not confirmed': 'E-posta adresiniz onaylanmamış.',
        'Too many requests': 'Çok fazla deneme yaptınız. Lütfen bekleyin.',
        'User not found': 'Kullanıcı bulunamadı!',
        'Invalid email or password': 'Kullanıcı adı veya parola hatalı!',
      };
      logger.warn('Login failed', { nick, reason: error.message });
      throw new Error(authErrors[error.message] ?? 'Giriş yapılamadı. Lütfen tekrar deneyin.');
    }

    const userId = data.user?.id || '';
    const email = data.user?.email || nick;
    const { data: profile } = await getProfile(userId);

    const loggedInUser = buildOnlineUser(userId, email, profile);
    if (!loggedInUser.avatar) loggedInUser.avatar = getAvatarText(loggedInUser);

    sessionStartedAtRef.current = Date.now();
    setCurrentUser(loggedInUser);
    setIsMuted(loggedInUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt

    await initPostAuth(loggedInUser);
    logger.info('Login success', { userId: loggedInUser.id, name: loggedInUser.name, isAdmin: loggedInUser.isAdmin });
    setView('chat');
    setLoginNick('');
    setLoginPassword('');
    setLoginError(null);

    // Geçici parola ile giriş yapıldıysa parola değiştirme ekranını göster
    if (loggedInUser.mustChangePassword) {
      setShowForcePasswordChange(true);
    }

    // Admin ise bekleyen şifre sıfırlama ve davet isteklerini yükle
    if (loggedInUser.isAdmin || loggedInUser.isPrimaryAdmin) {
      adminPanel.loadInitialAdminData();
    }
  };

  // last_seen_at heartbeat — crash/force-close'a karşı periyodik DB güncellemesi
  // Ortak post-auth setup: channels + users yükle, presence başlat
  const initPostAuth = async (user: User) => {
    // Channels sunucu seçilince ChatView'dan yüklenir (server-scoped)

    const offlineUsers = await loadOfflineUsers(user.id, knownVersionsRef.current);
    setAllUsers(prev => {
      const prevMap = new Map<string, User>(prev.map(u => [u.id, u]));
      return [
        user,
        ...offlineUsers.map(u => ({
          ...u,
          appVersion: prevMap.get(u.id)?.appVersion ?? u.appVersion,
        })),
      ];
    });

    activatePresence(user, appVersion, presenceDeps);
  };

  const startHeartbeat = (userId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    updateLastSeenHeartbeat(userId).catch(() => {});
    heartbeatRef.current = setInterval(() => {
      updateLastSeenHeartbeat(userId).catch(() => {});
    }, 5 * 60 * 1000);
  };
  const stopHeartbeat = () => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  };

  const handleLogout = async () => {
    logger.info('Logout', { userId: currentUser.id, name: currentUser.name });
    stopHeartbeat();
    if (currentUser.id) {
      const sessionMins = Math.floor((Date.now() - sessionStartedAtRef.current) / 60000);
      const newTotal = (currentUser.totalUsageMinutes || 0) + sessionMins;
      await updateActivityOnLogout(currentUser.id, newTotal).catch(() => {});
    }
    await disconnectFromLiveKit();
    stopPresence();
    await signOut();
    setView('login-password');
    setActiveChannel(null);
    setPasswordResetRequests([]);
    setInviteRequests([]);
  };

  // ── Presence track — tek merkez, tek payload, burst coalesce ──────────────
  // Supabase track() çağrısı her değişimde (mute/deafen/oda/sunucu/versiyon)
  // tam payload'u yeniden basar. Aynı commit'te birden fazla dep değişirse
  // 50ms micro-debounce ile tek track paketinde birleşir — network smooth.
  const trackPresence = useCallback(() => {
    if (!presenceChannelRef.current || !currentUser.id) return;
    presenceChannelRef.current.track({
      userId: currentUser.id,
      appVersion,
      selfMuted: isMuted,
      selfDeafened: isDeafened,
      userName: currentUser.name,
      currentRoom: activeChannel || undefined,
      serverId: activeServerId || undefined,
      autoStatus: autoStatusRef.current,
    });
  }, [currentUser.id, currentUser.name, appVersion, isMuted, isDeafened, activeChannel, activeServerId, presenceChannelRef]);

  const trackDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!appVersion) return;
    if (trackDebounceRef.current) window.clearTimeout(trackDebounceRef.current);
    trackDebounceRef.current = window.setTimeout(() => {
      trackDebounceRef.current = null;
      trackPresence();
    }, 50);
    return () => {
      if (trackDebounceRef.current) {
        window.clearTimeout(trackDebounceRef.current);
        trackDebounceRef.current = null;
      }
    };
  }, [trackPresence, appVersion]);

  // ── Pencere kapanırken son görülme + kullanım süresi kaydet
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopHeartbeat();
      const u = currentUserRef.current;
      if (!u.id) return;
      const sessionMins = Math.floor((Date.now() - sessionStartedAtRef.current) / 60000);
      const newTotal = (u.totalUsageMinutes || 0) + sessionMins;
      updateActivityOnLogout(u.id, newTotal).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopHeartbeat();
    };
  }, []);

  // Admin polling + handlers artık useAdminPanel hook'unda


  const handleRegister = async (code: string, nick: string, password: string, repeatPwd: string) => {
    if (!code.trim()) throw new Error('Davet kodunu giriniz!');
    if (!nick || !password) throw new Error('E-posta ve parola giriniz!');
    if (password !== repeatPwd) throw new Error('Parolalar eşleşmiyor!');
    const isValid = await verifyInviteCodeForEmail(code.trim(), nick);
    if (!isValid) throw new Error('Geçersiz veya süresi dolmuş davet kodu!');
    pendingInviteCodeRef.current = code.trim().toUpperCase();
    setLoginNick(nick);
    setLoginPassword(password);
    setView('register-details');
  };

  const handleCompleteRegistration = async () => {
    if (!displayName || !firstName || !lastName || !age) {
      setLoginError('Lütfen tüm bilgileri eksiksiz giriniz!');
      return;
    }

    if (!loginNick || !loginPassword) {
      setLoginError('E-posta ve parola eksik!');
      return;
    }

    const ageNum = parseInt(age);
    if (!ageNum || ageNum <= 0) {
      setLoginError('Geçerli bir yaş giriniz!');
      return;
    }

    const { data, error } = await signUp(loginNick, loginPassword);

    if (error) {
      const signUpErrors: Record<string, string> = {
        'User already registered': 'Bu e-posta zaten kayıtlı!',
        'Email rate limit exceeded': 'Çok fazla deneme. Lütfen bekleyin.',
        'Invalid email': 'Geçersiz e-posta adresi.',
        'Password should be at least 6 characters': 'Parola en az 6 karakter olmalıdır.',
        'Signup requires a valid password': 'Geçerli bir parola giriniz.',
      };
      setLoginError(signUpErrors[error.message] ?? 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.');
      return;
    }

    if (pendingInviteCodeRef.current) {
      await useInviteCodeForEmail(pendingInviteCodeRef.current, loginNick);
      pendingInviteCodeRef.current = null;
    }

    const normalizedFirst = toTitleCaseTr(firstName);
    const normalizedLast = toTitleCaseTr(lastName);

    const newUser: User = {
      id: data.user?.id || Math.random().toString(36).slice(2, 11),
      name: displayName,
      email: loginNick,
      firstName: normalizedFirst,
      lastName: normalizedLast,
      age: ageNum,
      avatar: '',
      status: 'online',
      statusText: 'Aktif',
      isAdmin: false,
      isPrimaryAdmin: false,
    };

    newUser.avatar = getAvatarText(newUser);

    await saveProfile({
      id: newUser.id,
      name: newUser.name,
      email: loginNick,
      first_name: newUser.firstName || '',
      last_name: newUser.lastName || '',
      age: newUser.age || 18,
      avatar: newUser.avatar,
    });

    sessionStartedAtRef.current = Date.now();
    setCurrentUser(newUser);

    await initPostAuth(newUser);
    startHeartbeat(newUser.id);
    setView('chat');
    setLoginNick('');
    setLoginPassword('');
    setDisplayName('');
    setFirstName('');
    setLastName('');
    setAge('');
    setGeneratedCode(null);
    setLoginError(null);
  };

  // ── Build context values ──────────────────────────────────────────────────
  const userContextValue: UserContextType = {
    currentUser,
    setCurrentUser,
    allUsers,
    setAllUsers,
    getAvatarText,
    getStatusColor,
    getEffectiveStatus,
    friendIds,
    isFriend,
    getRelationship,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    incomingRequests,
    friendsLoading,
  };

  const channelContextValue: ChannelContextType = {
    channels,
    setChannels,
    activeChannel,
    setActiveChannel,
    activeServerId,
    setActiveServerId,
    channelOrderTokenRef,
    accessContext,
    isConnecting,
    currentChannel,
    channelMembers,
  };

  const uiContextValue: UIContextType = {
    toastMsg,
    setToastMsg,
    invitationModal,
    setInvitationModal,
    userActionMenu,
    setUserActionMenu,
    contextMenu,
    setContextMenu,
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
    userVolumes,
    setUserVolumes,
  };

  const settingsContextValue: SettingsContextType = {
    ...settings,
    // showLastSeen'in DB sync wrapper'ı — hook'taki setShowLastSeenLocal yerine
    showLastSeen: settings.showLastSeen,
    setShowLastSeen,
  };

  const appStateValue: AppStateContextType = {
    view,
    setView,
    isMuted,
    setIsMuted,
    isDeafened,
    setIsDeafened,
    generatedCode,
    setGeneratedCode,
    timeLeft,
    setTimeLeft,
    loginNick,
    setLoginNick,
    loginPassword,
    setLoginPassword,
    loginError,
    setLoginError,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    age,
    setAge,
    displayName,
    setDisplayName,
    livekitRoomRef,
    presenceChannelRef,
    handleCopyCode,
    handleUpdateUserVolume,
    handleUserActionClick,
    handleInviteUser,
    handleKickUser,
    handleMoveUser,
    handleSaveRoom,
    handleDeleteRoom,
    handleRenameRoom,
    handleReorderChannels,
    handleSetPassword,
    handleRemovePassword,
    handleJoinChannel,
    handleVerifyPassword,
    handleContextMenu,
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
    handleToggleModerator,
    handleGenerateCode,
    handleLogin,
    handleLogout,
    handleRegister,
    handleCompleteRegistration,
    disconnectFromLiveKit,
    formatTime,
    broadcastModeration,
    handleToggleSpeaker,
    isBroadcastListener: !!isBroadcastListener,
    appVersion,
    showReleaseNotes,
    setShowReleaseNotes,
    passwordResetRequests,
    handleApproveReset: adminPanel.handleApproveReset,
    handleDismissReset: adminPanel.handleDismissReset,
    handleAdminManualReset: adminPanel.handleAdminManualReset,
    inviteRequests,
    handleSendInviteCode: adminPanel.handleSendInviteCode,
    handleRejectInvite: adminPanel.handleRejectInvite,
    inviteCooldowns,
    inviteStatuses,
  };

  const audioValue: AudioContextType = {
    volumeLevel,
    setVolumeLevel: () => {},
    isPttPressed,
    setIsPttPressed: setPttPressed,
    connectionLevel,
    setConnectionLevel,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    inputDevices,
    setInputDevices: () => {},
    outputDevices,
    setOutputDevices: () => {},
    showInputSettings,
    setShowInputSettings,
    showOutputSettings,
    setShowOutputSettings,
    speakingLevels,
  };

  return (
    <AppErrorBoundary>
    <ConfirmProvider>
    <SettingsCtx.Provider value={settingsContextValue}>
      <UserContext.Provider value={userContextValue}>
        <ChannelContext.Provider value={channelContextValue}>
          <UIContext.Provider value={uiContextValue}>
            <AppStateContext.Provider value={appStateValue}>
              <AudioCtx.Provider value={audioValue}>
                <div className="font-sans selection:bg-blue-500/30">
                  {/* Mobil izin onboarding — izinler verilmeden uygulamaya geçme */}
                  {!permissionsGranted ? (
                    <PermissionOnboarding onComplete={handlePermissionsComplete} />
                  ) : <>

                  {currentTheme.id === 'cylk' && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '52vw',
                          fontWeight: 100,
                          letterSpacing: '0.2em',
                          color: '#C8A84B',
                          opacity: 0.09,
                          userSelect: 'none',
                          lineHeight: 1,
                          fontFamily: 'Georgia, serif',
                          whiteSpace: 'nowrap',
                          transform: 'rotate(-32deg)',
                          display: 'block',
                        }}
                      >
                        CYLK
                      </span>
                    </div>
                  )}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <AnimatePresence mode="wait">
                      {view === 'loading' && (
                        <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="min-h-screen bg-[var(--theme-bg)]" />
                      )}
                      {view === 'login-password' && (
                        <motion.div key="login-password" initial={{ opacity: 0.96, scale: 0.995 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.14, ease: 'easeOut' }}>
                          <LoginPasswordView
                            handleLogin={handleLogin}
                            onForgotPassword={() => setShowForgotPassword(true)}
                            onGoToRegister={() => setView('login-code')}
                          />
                        </motion.div>
                      )}
                      {view === 'login-code' && (
                        <LoginCodeView
                          handleRegister={handleRegister}
                          handleLogout={() => setView('login-password')}
                          onGoBack={() => setView('login-password')}
                        />
                      )}
                      {view === 'register-details' && (
                        <RegisterDetailsView
                          displayName={displayName}
                          setDisplayName={setDisplayName}
                          firstName={firstName}
                          setFirstName={setFirstName}
                          lastName={lastName}
                          setLastName={setLastName}
                          age={age}
                          setAge={setAge}
                          loginError={loginError}
                          handleCompleteRegistration={handleCompleteRegistration}
                          onGoBack={() => setView('login-password')}
                        />
                      )}
                      {(view === 'chat' || view === 'settings') && (
                        <motion.div key="chat" initial={{ opacity: 0.96, scale: 0.995 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.14, ease: 'easeOut' }}>
                          <ChatView />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <style>{`
                    .custom-scrollbar::-webkit-scrollbar {
                      width: 4px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                      background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                      background: var(--theme-accent);
                      border-radius: 10px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                      background: var(--theme-accent);
                      opacity: 0.8;
                    }
                  `}</style>


                  {/* Ban ekranı — chat/settings görünümündeyken erişimi engeller */}
                  {(view === 'chat' || view === 'settings') && currentUser.isVoiceBanned && (
                    <BanScreen banExpires={currentUser.banExpires} />
                  )}

                  {/* Geçici parola ile giriş — parola değiştirme modalı */}
                  {showForcePasswordChange && (
                    <ForcePasswordChangeModal
                      onDone={() => setShowForcePasswordChange(false)}
                    />
                  )}


                  {/* Şifremi unuttum modalı */}
                  <AnimatePresence>
                    {showForgotPassword && (
                      <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
                    )}
                  </AnimatePresence>

                  {/* Toast bildirimi — dock içinde gösterilir, ayrı popup yok */}

                </>}
                </div>
              </AudioCtx.Provider>
            </AppStateContext.Provider>
          </UIContext.Provider>
        </ChannelContext.Provider>
      </UserContext.Provider>
    </SettingsCtx.Provider>
    </ConfirmProvider>
    </AppErrorBoundary>
  );
}
