/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare const __APP_VERSION__: string;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppView, User, VoiceChannel, Theme } from './types';
import { CHANNELS, THEMES } from './constants';
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
  createChannel,
  updateChannel,
  deleteChannel,
  updateUserModeration,
  verifyChannelPassword,
  setChannelPassword,
  saveInviteCode,
  verifyInviteCodeForEmail,
  useInviteCodeForEmail,
  getPendingPasswordResets,
  getAdminInviteRequests,
  getPendingInviteRequests,
  adminSendInviteCode,
  adminMarkInviteSent,
  adminMarkInviteFailed,
  adminRejectInvite,
  sendInviteEmail,
  supabase as supabaseClient,
} from './lib/supabase';
import { playSound } from './lib/sounds';
import { logger } from './lib/logger';
import { type AudioCaptureOptions, type RemoteParticipant, RemoteAudioTrack } from 'livekit-client';

// Supabase DB satır tipleri
type DbProfile = {
  id: string; name: string; email?: string; first_name?: string; last_name?: string;
  age?: number; avatar?: string; is_admin?: boolean; is_primary_admin?: boolean;
  is_muted?: boolean; mute_expires?: number; is_voice_banned?: boolean; ban_expires?: number;
  app_version?: string;
};
type DbChannel = {
  id: string; name: string; owner_id?: string; max_users?: number;
  is_invite_only?: boolean; is_hidden?: boolean; password?: string;
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

import LoginSelectionView from './views/LoginSelectionView';
import LoginCodeView from './views/LoginCodeView';
import LoginPasswordView from './views/LoginPasswordView';
import RegisterDetailsView from './views/RegisterDetailsView';
import ChatView from './views/ChatView';
import BanScreen from './components/BanScreen';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import { type ResetRequest } from './components/PasswordResetPanel';
import { getReleaseNotes } from './lib/releaseNotes';

const isSupabaseUser = (userId: string) => userId.includes('-');

export default function App() {
  const [view, setView] = useState<AppView>('loading');
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // ── Settings state ───────────────────────────────────────────────────────
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return THEMES[0]; }
    }
    return THEMES[0];
  });

  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(currentTheme));
    const root = document.documentElement;
    root.style.setProperty('--theme-bg', currentTheme.bg);
    root.style.setProperty('--theme-surface', currentTheme.surface);
    root.style.setProperty('--theme-sidebar', currentTheme.sidebar);
    root.style.setProperty('--theme-text', currentTheme.text);
    root.style.setProperty('--theme-secondary-text', currentTheme.secondaryText);
    root.style.setProperty('--theme-accent', currentTheme.accent);
    root.style.setProperty('--theme-border', currentTheme.border);

    const hex = currentTheme.accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    root.style.setProperty('--theme-accent-rgb', `${r}, ${g}, ${b}`);

    root.style.colorScheme = currentTheme.id === 'beige' ? 'light' : 'dark';
  }, [currentTheme]);

  const [isLowDataMode, setIsLowDataMode] = useState(() => localStorage.getItem('lowDataMode') === 'true');
  useEffect(() => { localStorage.setItem('lowDataMode', String(isLowDataMode)); }, [isLowDataMode]);

  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(() => localStorage.getItem('noiseSuppression') !== 'false');
  useEffect(() => { localStorage.setItem('noiseSuppression', String(isNoiseSuppressionEnabled)); }, [isNoiseSuppressionEnabled]);

  const [noiseThreshold, setNoiseThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('noiseThreshold');
    return saved ? parseInt(saved) : 15;
  });
  useEffect(() => { localStorage.setItem('noiseThreshold', noiseThreshold.toString()); }, [noiseThreshold]);

  const [pttKey, setPttKey] = useState(() => localStorage.getItem('pttKey') || 'Control');
  useEffect(() => { localStorage.setItem('pttKey', pttKey); }, [pttKey]);

  const [isListeningForKey, setIsListeningForKey] = useState(false);

  const [soundJoinLeave, setSoundJoinLeaveState] = useState(() => localStorage.getItem('soundJoinLeave') !== 'false');
  const setSoundJoinLeave = (v: boolean) => { localStorage.setItem('soundJoinLeave', String(v)); setSoundJoinLeaveState(v); };
  const [soundJoinLeaveVariant, setSoundJoinLeaveVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundJoinLeaveVariant') || '1') || 1) as 1|2|3);
  const setSoundJoinLeaveVariant = (v: 1|2|3) => { localStorage.setItem('soundJoinLeaveVariant', String(v)); setSoundJoinLeaveVariantState(v); };

  const [soundMuteDeafen, setSoundMuteDeafenState] = useState(() => localStorage.getItem('soundMuteDeafen') !== 'false');
  const setSoundMuteDeafen = (v: boolean) => { localStorage.setItem('soundMuteDeafen', String(v)); setSoundMuteDeafenState(v); };
  const [soundMuteDeafenVariant, setSoundMuteDeafenVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundMuteDeafenVariant') || '1') || 1) as 1|2|3);
  const setSoundMuteDeafenVariant = (v: 1|2|3) => { localStorage.setItem('soundMuteDeafenVariant', String(v)); setSoundMuteDeafenVariantState(v); };

  const [soundPtt, setSoundPttState] = useState(() => localStorage.getItem('soundPtt') !== 'false');
  const setSoundPtt = (v: boolean) => { localStorage.setItem('soundPtt', String(v)); setSoundPttState(v); };
  const [soundPttVariant, setSoundPttVariantState] = useState<1|2|3>(() => (parseInt(localStorage.getItem('soundPttVariant') || '1') || 1) as 1|2|3);
  const setSoundPttVariant = (v: 1|2|3) => { localStorage.setItem('soundPttVariant', String(v)); setSoundPttVariantState(v); };

  const [soundInvite, setSoundInviteState] = useState(() => localStorage.getItem('soundInvite') !== 'false');
  const setSoundInvite = (v: boolean) => { localStorage.setItem('soundInvite', String(v)); setSoundInviteState(v); };
  const [soundInviteVariant, setSoundInviteVariantState] = useState<1|2>(() => (parseInt(localStorage.getItem('soundInviteVariant') || '1') || 1) as 1|2);
  const setSoundInviteVariant = (v: 1|2) => { localStorage.setItem('soundInviteVariant', String(v)); setSoundInviteVariantState(v); };

  const [avatarBorderColor, setAvatarBorderColorState] = useState(() => localStorage.getItem('avatarBorderColor') || '#3B82F6');
  const setAvatarBorderColor = (v: string) => { localStorage.setItem('avatarBorderColor', v); setAvatarBorderColorState(v); };

  const [pttReleaseDelay, setPttReleaseDelayState] = useState<number>(() => {
    const saved = localStorage.getItem('pttReleaseDelay');
    return saved !== null ? parseInt(saved) : 250;
  });
  const setPttReleaseDelay = (v: number) => { localStorage.setItem('pttReleaseDelay', String(v)); setPttReleaseDelayState(v); };

// ── Audio control state ──────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
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

  // ── Channel state ────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<VoiceChannel[]>(CHANNELS);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const currentChannel = useMemo(
    () => channels.find(c => c.id === activeChannel),
    [channels, activeChannel]
  );
  const channelMembers = useMemo(
    () => allUsers.filter(u => currentChannel?.members?.includes(u.name)),
    [allUsers, currentChannel]
  );

  // ── Auto-update state ─────────────────────────────────────────────────────
  type UpdateState = 'available' | 'downloading' | 'downloaded' | 'dismissed';
  const [updateInfo, setUpdateInfo] = useState<{ version: string; sizeMB: number | null; state: UpdateState; progress: number } | null>(null);
  const [appVersion, setAppVersion] = useState<string>(() => {
    try { return __APP_VERSION__ || ''; } catch { return ''; }
  });
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForcePasswordChange, setShowForcePasswordChange] = useState(false);
  const [passwordResetRequests, setPasswordResetRequests] = useState<ResetRequest[]>([]);
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([]);

  useEffect(() => {
    const w = window as Window & {
      electronUpdater?: {
        onUpdateAvailable: (cb: (info: { version: string; sizeMB: number | null }) => void) => void;
        onDownloadProgress: (cb: (info: { percent: number }) => void) => void;
        onUpdateDownloaded: (cb: (info: { version: string }) => void) => void;
        startDownload: () => void;
        installNow: () => void;
      };
      electronApp?: { getVersion: () => Promise<string> };
    };
    w.electronApp?.getVersion().then(v => {
      setAppVersion(v);
      const lastSeen = localStorage.getItem('cylk-last-version');
      if (lastSeen && lastSeen !== v && getReleaseNotes(v)) {
        setShowReleaseNotes(true);
      }
      localStorage.setItem('cylk-last-version', v);
    }).catch(() => {});
    const updater = w.electronUpdater;
    if (!updater) return;
    updater.onUpdateAvailable((info) => setUpdateInfo({ version: info.version, sizeMB: info.sizeMB, state: 'available', progress: 0 }));
    updater.onDownloadProgress((info) => setUpdateInfo(prev => prev ? { ...prev, state: 'downloading', progress: info.percent } : prev));
    updater.onUpdateDownloaded((info) => setUpdateInfo(prev => prev ? { ...prev, version: info.version, state: 'downloaded', progress: 100 } : prev));
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [invitationModal, setInvitationModal] = useState<{ inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string } | null>(null);
  const [userActionMenu, setUserActionMenu] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channelId: string } | null>(null);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusTimerInput, setStatusTimerInput] = useState('');
  const [roomModal, setRoomModal] = useState<{
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
  }>({ isOpen: false, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false });
  const [passwordModal, setPasswordModal] = useState<{ type: 'set' | 'enter'; channelId: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordRepeatInput, setPasswordRepeatInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('userVolumes');
    return saved ? JSON.parse(saved) : {};
  });

  // ── Invite cooldowns: davet reddedilince 60sn bekleme ───────────────────
  // Ref: senkron guard için; State: UI güncellemesi için
  const inviteCooldownsRef = useRef<Record<string, number>>({});
  const [inviteCooldowns, setInviteCooldowns] = useState<Record<string, number>>({});
  // Stable ref wrapper'lar — usePresence çağrısı bu fonksiyonlardan önce geldiği için ref gerekir
  const handleInviteRejectedCooldownRef = useRef<(inviteeId: string) => void>(() => {});
  const handleInviteAcceptedRef = useRef<(inviteeId: string) => void>(() => {});

  // Davet durum göstergesi: pending / accepted / rejected (yok = idle)
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, 'pending' | 'accepted' | 'rejected'>>({});

  // ── AppState-only state ──────────────────────────────────────────────────
  const [statusTimer, setStatusTimer] = useState<number | null>(null);
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
  const isDeafenedRef = useRef(isDeafened);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);
  const pendingInviteCodeRef = useRef<string | null>(null);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
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
  const { isPttPressed, volumeLevel } = usePttAudio({
    pttKey,
    setPttKey,
    isListeningForKey,
    setIsListeningForKey,
    isMuted,
    isVoiceBanned: currentUser.isVoiceBanned ?? false,
    selectedInput,
    isNoiseSuppressionEnabled,
    noiseThreshold,
    isLowDataMode,
    pttReleaseDelay,
  });

  // ── Presence hook ────────────────────────────────────────────────────────
  const { presenceChannelRef, knownVersionsRef, startPresence, stopPresence, resyncPresence } = usePresence({
    currentUserRef,
    activeChannelRef,
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

  // Stable ref so the 5s timer always calls the latest resyncPresence
  const resyncPresenceRef = useRef(resyncPresence);
  resyncPresenceRef.current = resyncPresence;

  // ── LiveKit hook ─────────────────────────────────────────────────────────
  const { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit } = useLiveKitConnection({
    presenceChannelRef,
    currentUserRef,
    activeChannelRef,
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
  });

  // Keep forward ref current so usePresence always calls the real function
  disconnectLKRef.current = disconnectFromLiveKit;

  // ── Moderation hook ──────────────────────────────────────────────────────
  const {
    broadcastModeration,
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
  } = useModeration({
    currentUser,
    allUsers,
    presenceChannelRef,
    setAllUsers,
    setToastMsg,
    onSelfDelete: () => setView('login-selection'),
  });

  // ── Global network quality monitoring ────────────────────────────────────
  useEffect(() => {
    const getQualityLevel = (): number => {
      if (!navigator.onLine) return 0;
      const conn = (navigator as any).connection;
      if (!conn) return 4;
      const type: string = conn.effectiveType || '4g';
      if (type === 'slow-2g') return 1;
      if (type === '2g') return 2;
      if (type === '3g') return 3;
      return 4;
    };

    const onOffline = () => {
      connectionLostRef.current = true;
      setConnectionLevel(0);
      setToastMsg('İnternet bağlantısı kesildi.');
    };
    const onOnline = () => {
      if (livekitRoomRef.current) return;
      setConnectionLevel(getQualityLevel());
      if (connectionLostRef.current) {
        connectionLostRef.current = false;
        setToastMsg('İnternet bağlantısı yeniden kuruldu.');
        setTimeout(() => setToastMsg(null), 3000);
      }
    };
    const onConnectionChange = () => {
      if (livekitRoomRef.current) return;
      setConnectionLevel(getQualityLevel());
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const conn = (navigator as any).connection;
    if (conn) conn.addEventListener('change', onConnectionChange);

    const pingInterval = setInterval(async () => {
      if (livekitRoomRef.current || !navigator.onLine) return;
      const start = Date.now();
      try {
        await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', { method: 'HEAD', cache: 'no-store', headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } });
        const rtt = Date.now() - start;
        setConnectionLevel(rtt < 100 ? 4 : rtt < 250 ? 3 : rtt < 500 ? 2 : 1);
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          setToastMsg(null);
        }
      } catch {
        setConnectionLevel(0);
      }
    }, 10000);

    setConnectionLevel(getQualityLevel());

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (conn) conn.removeEventListener('change', onConnectionChange);
      clearInterval(pingInterval);
    };
  }, []);

  // ── Session restore on page load ─────────────────────────────────────────
  useEffect(() => {
    getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session?.user) {
        setView('login-selection');
        setIsSessionLoading(false);
        return;
      }

      const email = session.user.email || '';
      const { data: profile } = await getProfile(session.user.id);

      const restoredUser: User = profile ? {
        id: session.user.id,
        email,
        name: profile.name || email,
        firstName: profile.first_name || email.split('@')[0],
        lastName: profile.last_name || '',
        age: profile.age || 18,
        avatar: profile.avatar || '',
        status: 'online',
        statusText: 'Aktif',
        isAdmin: profile.is_admin || false,
        isPrimaryAdmin: profile.is_primary_admin || false,
        isMuted: profile.is_muted || false,
        muteExpires: profile.mute_expires || undefined,
        isVoiceBanned: profile.is_voice_banned || false,
        banExpires: profile.ban_expires || undefined,
        // DB'deki kalıcı versiyon — startPresence'da değişip değişmediğini karşılaştırmak için
        appVersion: profile.app_version || undefined,
      } : {
        id: session.user.id,
        name: email,
        firstName: email.split('@')[0],
        lastName: '',
        age: 18,
        avatar: '',
        status: 'online',
        statusText: 'Aktif',
        isAdmin: false,
        isPrimaryAdmin: false,
      };

      if (!restoredUser.avatar) {
        restoredUser.avatar = ((restoredUser.firstName?.[0] || '') + '').toUpperCase() + (restoredUser.age || '');
      }

      setAllUsers((prev) => [...prev.filter((u) => u.id !== session.user.id), restoredUser]);
      setCurrentUser(restoredUser);
      setIsMuted(restoredUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt
      startPresence(restoredUser, appVersion);

      const { data: savedChannels } = await getChannels();
      if (savedChannels && savedChannels.length > 0) {
        const userChannels: VoiceChannel[] = savedChannels.map((c: DbChannel) => ({
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
        }));
        setChannels([...CHANNELS, ...userChannels]);
      }

      setChannels((prev) => prev.map((c) => ({
        ...c,
        members: (c.members || []).filter((m) => m !== 'Kullanıcı 1'),
      })));

      const { data: allProfiles } = await getAllProfiles();
      if (allProfiles) {
        setAllUsers((prev) => {
          const prevMap = new Map(prev.map((u) => [u.id, u]));
          const offlineUsers: User[] = allProfiles
            .filter((p: DbProfile) => !prevMap.has(p.id))
            .map((p: DbProfile) => ({
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
              isMuted: p.is_muted || false,
              isVoiceBanned: p.is_voice_banned || false,
              // Presence cache öncelikli; yoksa DB'deki kalıcı versiyon
              appVersion: knownVersionsRef.current.get(p.id) || p.app_version,
            }));
          return [...prev, ...offlineUsers];
        });
        resyncPresence();
        // Fallback: WebSocket bağlantısı getAllProfiles'tan yavaş olabilir.
        // 1.5s sonra tekrar dene — o zaman presenceState kesinlikle dolmuş olur.
        setTimeout(() => resyncPresenceRef.current(), 1500);
      }

      setView('chat');
      setIsSessionLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setIsStatusMenuOpen(false);
      setContextMenu(null);
      setUserActionMenu(null);
      setShowInputSettings(false);
      setShowOutputSettings(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [setShowInputSettings, setShowOutputSettings]);

  // ── Status timer: side effects when timer reaches 0 ──────────────────────
  useEffect(() => {
    if (statusTimer === null) return;
    const user = currentUserRef.current;
    if (statusTimer <= 0) {
      const updatedUser = { ...user, statusText: 'Aktif' };
      setCurrentUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'moderation',
        payload: { userId: user.id, updates: { statusText: 'Aktif' } },
      });
      setStatusTimer(null);
      setIsMuted(false);
      setIsDeafened(false);
      return;
    }
    const minutes = Math.floor(statusTimer / 60);
    const seconds = statusTimer % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')} Sonra Geleceğim`;
    if (user.statusText !== timeStr) {
      const updatedUser = { ...user, statusText: timeStr };
      setCurrentUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'moderation',
        payload: { userId: user.id, updates: { statusText: timeStr } },
      });
    }
  }, [statusTimer]);

  // ── Code timer: clear code when timeLeft hits 0 ──────────────────────────
  useEffect(() => {
    if (timeLeft === 0 && generatedCode) {
      setGeneratedCode(null);
    }
  }, [timeLeft, generatedCode]);

  // ── TEK 1000ms INTERVAL — status timer + code timer + room deletion ───────
  useEffect(() => {
    const interval = setInterval(() => {
      setStatusTimer(prev => (prev !== null && prev > 0 ? prev - 1 : prev));
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));

      setChannels(prevChannels => {
        let hasChanges = false;
        const channelsToDelete: string[] = [];

        const nextChannels = prevChannels.map(channel => {
          if (channel.isSystemChannel) return channel;

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
    const canSpeak = isPttPressed && !isMuted && !currentUser.isVoiceBanned;
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
    if (!activeChannel) return;
    playSound(isPttPressed ? 'ptt-on' : 'ptt-off');
  }, [isPttPressed]);

  // ── LiveKit PTT: enable/disable mic based on PTT state ───────────────────
  useEffect(() => {
    if (!livekitRoomRef.current) return;
    const canSpeak = isPttPressed && !isMuted && !currentUser.isVoiceBanned;
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

  // ── Kanaldan çıkılınca (activeChannel null) kullanıcıyı tüm kanallardan temizle ──
  // NOT: Kanala GİRİŞ için optimistic ekleme handleJoinChannel içinde yapılır;
  //      gerçek liste updateMembers() tarafından yazılır. Bu effect sadece çıkışı işler.
  useEffect(() => {
    if (activeChannel !== null) return;
    const name = currentUserRef.current.name;
    if (!name) return;
    setChannels(prev => prev.map(c => {
      if (!c.members?.includes(name)) return c;
      const members = c.members.filter(m => m !== name);
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
    if (statusText === 'Telefonda') return 'text-red-500';
    if (statusText === 'Hemen Geleceğim') return 'text-orange-500';
    if (statusText.includes('Sonra Geleceğim')) return 'text-yellow-500';
    if (statusText === 'Dinliyor') return 'text-orange-500';
    if (statusText === 'Sessiz') return 'text-[var(--theme-secondary-text)]';
    return 'text-blue-500';
  };

  const getEffectiveStatus = () => {
    if (currentUser.statusText !== 'Aktif') return currentUser.statusText;
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
  const handleSetStatus = (text: string, minutes?: number) => {
    const updatedUser = { ...currentUser, statusText: text };
    setCurrentUser(updatedUser);
    setAllUsers(allUsers.map(u => u.id === currentUser.id ? updatedUser : u));
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'moderation',
      payload: { userId: currentUser.id, updates: { statusText: text } },
    });

    if (text !== 'Aktif') {
      setIsMuted(true);
      setIsDeafened(true);
    } else {
      setIsMuted(false);
      setIsDeafened(false);
    }

    if (minutes) {
      setStatusTimer(minutes * 60);
    } else {
      setStatusTimer(null);
    }
    setIsStatusMenuOpen(false);
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
    }
  };

  const handleUpdateUserVolume = (userId: string, volume: number) => {
    const newVolumes = { ...userVolumes, [userId]: volume };
    setUserVolumes(newVolumes);
    localStorage.setItem('userVolumes', JSON.stringify(newVolumes));

    // LiveKit katılımcısının ses seviyesini gerçek zamanlı uygula
    const user = allUsers.find(u => u.id === userId);
    if (user && livekitRoomRef.current) {
        const participants = Array.from(livekitRoomRef.current.remoteParticipants.values()) as RemoteParticipant[];
      const participant = participants.find(p => p.identity === user.name);
      if (participant) {
        participant.audioTrackPublications.forEach(pub => {
          if (pub.track instanceof RemoteAudioTrack) {
            pub.track.setVolume(volume / 100);
          }
        });
      }
    }
  };

  const handleUserActionClick = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (userId === currentUser.id) return;

    const isAdmin = currentUser.isAdmin;
    const canInvite = activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(allUsers.find(u => u.id === userId)?.name || '') && userId !== currentUser.id;

    if (!isAdmin && !canInvite) return;

    setUserActionMenu({ userId, x: e.clientX, y: e.clientY });
    setContextMenu(null);
  };

  const handleInviteUser = (userId: string) => {
    // Cooldown guard: ret sonrası 60sn bekleme
    const cooldownUntil = inviteCooldownsRef.current[userId];
    if (cooldownUntil && Date.now() < cooldownUntil) return;

    const channel = channels.find(c => c.id === activeChannel);
    if (!channel || !presenceChannelRef.current) return;
    presenceChannelRef.current.send({
      type: 'broadcast',
      event: 'invite',
      payload: {
        inviterId: currentUser.id,
        inviteeId: userId,
        inviterName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        inviterAvatar: currentUser.avatar,
        roomName: channel.name,
        roomId: channel.id,
      },
    });
    // Davet gönderildi → pending durumuna geç, 10sn sonra otomatik sıfırla
    setInviteStatuses(prev => ({ ...prev, [userId]: 'pending' }));
    setTimeout(() => {
      setInviteStatuses(prev => {
        if (prev[userId] !== 'pending') return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 10_000);
    setUserActionMenu(null);
  };

  const handleInviteRejectedCooldown = (inviteeId: string) => {
    // Kısa süre "reddedildi" göster, sonra sil (cooldown buton disable'ı devralır)
    setInviteStatuses(prev => ({ ...prev, [inviteeId]: 'rejected' }));
    setTimeout(() => {
      setInviteStatuses(prev => {
        const next = { ...prev };
        delete next[inviteeId];
        return next;
      });
    }, 2_000);
    // 60sn cooldown başlat
    const expiresAt = Date.now() + 60_000;
    inviteCooldownsRef.current[inviteeId] = expiresAt;
    setInviteCooldowns(prev => ({ ...prev, [inviteeId]: expiresAt }));
    setTimeout(() => {
      setInviteCooldowns(prev => {
        const next = { ...prev };
        delete next[inviteeId];
        return next;
      });
      delete inviteCooldownsRef.current[inviteeId];
    }, 60_000);
  };
  handleInviteRejectedCooldownRef.current = handleInviteRejectedCooldown;

  const handleInviteAccepted = (inviteeId: string) => {
    setInviteStatuses(prev => ({ ...prev, [inviteeId]: 'accepted' }));
    setTimeout(() => {
      setInviteStatuses(prev => {
        const next = { ...prev };
        delete next[inviteeId];
        return next;
      });
    }, 2_000);
  };
  handleInviteAcceptedRef.current = handleInviteAccepted;

  const handleKickUser = (userId: string) => {
    if (!currentUser.isAdmin) return;
    const userToKick = allUsers.find(u => u.id === userId);
    if (!userToKick) return;

    setChannels(prev => prev.map(c => {
      const otherMembers = c.members?.filter(m => m !== userToKick.name) || [];
      return { ...c, members: otherMembers, userCount: otherMembers.length };
    }));

    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'kick',
      payload: { userId },
    });
  };

  const handleMoveUser = (userName: string, targetChannelId: string) => {
    if (!currentUser.isAdmin) return;

    const movedUser = allUsers.find(u => u.name === userName);
    const sourceChannel = channels.find(c => c.members?.includes(userName));

    setChannels(prev => prev.map(c => {
      const otherMembers = c.members?.filter(m => m !== userName) || [];
      const isTarget = c.id === targetChannelId;
      const newMembers = isTarget ? [...otherMembers, userName] : otherMembers;
      return { ...c, members: newMembers, userCount: newMembers.length };
    }));

    if (!presenceChannelRef.current) return;

    if (sourceChannel && sourceChannel.id !== targetChannelId) {
      const newSourceMembers = (sourceChannel.members || []).filter(m => m !== userName);
      presenceChannelRef.current.send({
        type: 'broadcast',
        event: 'channel-update',
        payload: {
          action: 'update',
          channelId: sourceChannel.id,
          updates: { members: newSourceMembers, userCount: newSourceMembers.length },
        },
      });
    }

    const targetChannel = channels.find(c => c.id === targetChannelId);
    if (targetChannel) {
      const newTargetMembers = [...(targetChannel.members || []).filter(m => m !== userName), userName];
      presenceChannelRef.current.send({
        type: 'broadcast',
        event: 'channel-update',
        payload: {
          action: 'update',
          channelId: targetChannelId,
          updates: { members: newTargetMembers, userCount: newTargetMembers.length },
        },
      });
    }

    if (movedUser) {
      presenceChannelRef.current.send({
        type: 'broadcast',
        event: 'move',
        payload: { userId: movedUser.id, targetChannelId },
      });
    }
  };

  const handleSaveRoom = async () => {
    if (!roomModal.name.trim()) return;

    if (roomModal.type === 'create') {
      const userRooms = channels.filter(c => c.ownerId === currentUser.id);
      if (userRooms.length >= 2) {
        alert("Aynı anda en fazla 2 oda oluşturabilirsiniz.");
        return;
      }
      const newRoom: VoiceChannel = {
        id: Date.now().toString(),
        name: roomModal.name,
        userCount: 0,
        members: [],
        isSystemChannel: false,
        maxUsers: roomModal.maxUsers,
        isInviteOnly: roomModal.isInviteOnly,
        isHidden: roomModal.isHidden,
        ownerId: currentUser.id,
      };
      const { error: createErr } = await createChannel({
        id: newRoom.id,
        name: newRoom.name,
        owner_id: currentUser.id,
        max_users: newRoom.maxUsers || 0,
        is_invite_only: newRoom.isInviteOnly || false,
        is_hidden: newRoom.isHidden || false,
      });
      if (createErr) {
        setToastMsg('Oda oluşturulamadı. Lütfen tekrar deneyin.');
        setTimeout(() => setToastMsg(null), 4000);
        return;
      }
      setChannels([...channels, newRoom]);
      presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'create', channel: newRoom } });
    } else if (roomModal.type === 'edit' && roomModal.channelId) {
      const updates = { name: roomModal.name, maxUsers: roomModal.maxUsers, isInviteOnly: roomModal.isInviteOnly, isHidden: roomModal.isHidden };
      setChannels(channels.map(c => c.id === roomModal.channelId ? { ...c, ...updates } : c));
      await updateChannel(roomModal.channelId, {
        name: roomModal.name,
        max_users: roomModal.maxUsers,
        is_invite_only: roomModal.isInviteOnly,
        is_hidden: roomModal.isHidden,
      });
      presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: roomModal.channelId, updates } });
    }

    setRoomModal({ isOpen: false, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false });
  };

  const handleDeleteRoom = async (id: string) => {
    const channel = channels.find(c => c.id === id);
    if (channel?.isSystemChannel) {
      alert("Sistem odaları silinemez!");
      return;
    }
    setChannels(channels.filter(c => c.id !== id));
    if (activeChannel === id) setActiveChannel(null);
    setContextMenu(null);
    await deleteChannel(id);
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'delete', channelId: id } });
  };

  const handleRenameRoom = async (id: string, newName: string) => {
    setChannels(channels.map(c => c.id === id ? { ...c, name: newName } : c));
    setContextMenu(null);
    await updateChannel(id, { name: newName });
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: id, updates: { name: newName } } });
  };

  const handleSetPassword = async (id: string, password: string, repeat: string) => {
    if (password.length !== 4 || isNaN(Number(password))) { setPasswordError(true); return; }
    if (password !== repeat) { setPasswordError(true); return; }
    const { error } = await setChannelPassword(id, password);
    if (error) {
      console.error('Şifre kaydetme hatası:', error);
      setToastMsg('Şifre kaydedilemedi. Lütfen tekrar deneyin.');
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }
    setChannels(channels.map(c => c.id === id ? { ...c, password: 'SET' } : c));
    setPasswordModal(null);
    setPasswordInput('');
    setPasswordRepeatInput('');
    setPasswordError(false);
    setContextMenu(null);
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: id, updates: { password: 'SET' } } });
  };

  const handleRemovePassword = async (id: string) => {
    await setChannelPassword(id, null);
    setChannels(channels.map(c => c.id === id ? { ...c, password: undefined } : c));
    setContextMenu(null);
    presenceChannelRef.current?.send({ type: 'broadcast', event: 'channel-update', payload: { action: 'update', channelId: id, updates: { password: undefined } } });
  };

  const handleContextMenu = (e: React.MouseEvent, channelId: string) => {
    if (!currentUser.isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, channelId });
  };

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
    const now = Date.now();
    const myName = currentUser.name;
    setActiveChannel(channelId);
    // Ref'i hemen güncelle — React render'ı beklemeden.
    // channel-update handler'ı activeChannelRef'i okur; stale kalırsa
    // incoming broadcast'ler kullanıcıyı yanlış kanala ekleyebilir.
    activeChannelRef.current = channelId;
    setIsConnecting(true);
    setChannels(prev => prev.map(c => {
      const members = (c.members || []).filter(m => m !== myName);
      return c.id === channelId
        ? { ...c, members: [...members, myName], userCount: members.length + 1 }
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
    }
  };

  const handleJoinChannel = async (id: string, isInvited: boolean = false) => {
    const channel = channels.find(c => c.id === id);
    if (!channel) return;

    if (!isInvited && channel.isInviteOnly && !currentUser.isAdmin && channel.ownerId !== currentUser.id) {
      alert("Bu odaya sadece davetle girilebilir.");
      return;
    }

    if (!isInvited && channel.maxUsers && channel.maxUsers > 0 && channel.userCount >= channel.maxUsers && activeChannel !== id) {
      alert(`Bu oda maksimum ${channel.maxUsers} kişi alabilir.`);
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

    const loggedInUser: User = profile ? {
      id: userId,
      email,
      name: profile.name || email,
      firstName: profile.first_name || email.split('@')[0],
      lastName: profile.last_name || '',
      age: profile.age || 18,
      avatar: profile.avatar || '',
      status: 'online',
      statusText: 'Aktif',
      isAdmin: profile.is_admin || false,
      isPrimaryAdmin: profile.is_primary_admin || false,
      isMuted: profile.is_muted || false,
      muteExpires: profile.mute_expires || undefined,
      isVoiceBanned: profile.is_voice_banned || false,
      banExpires: profile.ban_expires || undefined,
      mustChangePassword: profile.must_change_password || false,
      // DB'deki kalıcı versiyon — startPresence'da değişip değişmediğini karşılaştırmak için
      appVersion: profile.app_version || undefined,
    } : {
      id: userId,
      name: email,
      firstName: email.split('@')[0],
      lastName: '',
      age: 18,
      avatar: getAvatarText({ firstName: email.split('@')[0], lastName: '', age: 18 } as User),
      status: 'online',
      statusText: 'Aktif',
      isAdmin: false,
      isPrimaryAdmin: false,
    };

    if (!loggedInUser.avatar) loggedInUser.avatar = getAvatarText(loggedInUser);

    setCurrentUser(loggedInUser);
    setIsMuted(loggedInUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt
    startPresence(loggedInUser, appVersion);

    const { data: allProfiles } = await getAllProfiles();
    const offlineUsers: User[] = allProfiles
      ? allProfiles
          .filter((p: DbProfile) => p.id !== userId)
          .map((p: DbProfile) => ({
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
            isMuted: p.is_muted || false,
            isVoiceBanned: p.is_voice_banned || false,
            appVersion: knownVersionsRef.current.get(p.id),
          }))
      : [];

    setAllUsers(prev => {
      const prevMap = new Map<string, User>(prev.map(u => [u.id, u]));
      return [
        loggedInUser,
        ...offlineUsers.map(u => ({
          ...u,
          appVersion: prevMap.get(u.id)?.appVersion ?? u.appVersion,
        })),
      ];
    });
    resyncPresence();
    // Fallback: aynı timing koruması — login sırasında da WebSocket geç bağlanabilir
    setTimeout(() => resyncPresenceRef.current(), 1500);
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
      const { data: pending } = await getPendingPasswordResets();
      if (pending) {
        setPasswordResetRequests(pending.map((p: { id: string; name: string; email: string }) => ({
          userId: p.id,
          userName: p.name,
          userEmail: p.email,
        })));
      }
      const adminInvites = await getAdminInviteRequests();
      if (adminInvites.length > 0) {
        setInviteRequests(adminInvites.map(r => ({
          id: r.id,
          email: r.email,
          status: r.status as InviteRequest['status'],
          expiresAt: r.expires_at,
          rejectionCount: r.rejection_count,
          blockedUntil: r.blocked_until,
          permanentlyBlocked: r.permanently_blocked,
          createdAt: r.created_at,
          lastSendError: r.last_send_error ?? undefined,
          sentCode: r.code ?? undefined,
        })));
      }
    }
  };

  const handleLogout = async () => {
    logger.info('Logout', { userId: currentUser.id, name: currentUser.name });
    stopPresence();
    await disconnectFromLiveKit();
    await signOut();
    setView('login-selection');
    setActiveChannel(null);
    setPasswordResetRequests([]);
    setInviteRequests([]);
  };

  // ── appVersion IPC async geldikten sonra presence'ı güncelle
  useEffect(() => {
    if (!appVersion || !currentUser.id || !presenceChannelRef.current) return;
    presenceChannelRef.current.track({ userId: currentUser.id, appVersion });
  }, [appVersion, currentUser.id]);

  // ── Admin: bekleyen şifre sıfırlama isteklerini 15sn'de bir kontrol et
  useEffect(() => {
    if (!currentUser.id || (!currentUser.isAdmin && !currentUser.isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    const poll = async () => {
      const { data } = await getPendingPasswordResets();
      if (data) {
        setPasswordResetRequests(data.map((p: { id: string; name: string; email: string }) => ({
          userId: p.id,
          userName: p.name,
          userEmail: p.email,
        })));
      }
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [currentUser.isAdmin, currentUser.isPrimaryAdmin, view]);

  // ── Admin: bekleyen davet talep isteklerini 30sn'de bir kontrol et + Realtime
  useEffect(() => {
    if (!currentUser.id || (!currentUser.isAdmin && !currentUser.isPrimaryAdmin)) return;
    if (view !== 'chat' && view !== 'settings') return;

    const mapRow = (r: {
      id: string; email: string; status: string; code?: string | null;
      expires_at: number; created_at: string; rejection_count: number;
      blocked_until?: number | null; permanently_blocked: boolean;
      last_send_error?: string | null;
    }): InviteRequest => ({
      id: r.id,
      email: r.email,
      status: r.status as InviteRequest['status'],
      expiresAt: r.expires_at,
      rejectionCount: r.rejection_count,
      blockedUntil: r.blocked_until,
      permanentlyBlocked: r.permanently_blocked,
      createdAt: r.created_at,
      lastSendError: r.last_send_error ?? undefined,
      sentCode: r.code ?? undefined,
    });

    const refreshInvites = async () => {
      const requests = await getAdminInviteRequests();
      setInviteRequests(requests.map(mapRow));
    };

    refreshInvites();
    const interval = setInterval(refreshInvites, 30000);

    // Supabase Realtime: yeni INSERT ve statusun değiştiği UPDATE'leri anlık al
    const channel = supabaseClient
      .channel(`invite-requests-admin-rt-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'invite_requests' },
        (payload) => {
          const row = payload.new as {
            id: string; email: string; status: string; code?: string | null;
            expires_at: number; created_at: string;
            last_send_error?: string | null;
          };
          setInviteRequests(prev => {
            if (prev.find(r => r.id === row.id)) return prev;
            return [...prev, {
              id: row.id,
              email: row.email,
              status: row.status as InviteRequest['status'],
              expiresAt: row.expires_at,
              rejectionCount: 0,
              createdAt: row.created_at,
              lastSendError: row.last_send_error ?? undefined,
              sentCode: row.code ?? undefined,
            }];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invite_requests' },
        (payload) => {
          const row = payload.new as {
            id: string; status: string; code?: string | null;
            last_send_error?: string | null; expires_at: number;
          };
          // Artık aksiyon gerektirmeyen statüsleri listeden kaldır
          const actionable = ['pending', 'sending', 'failed'];
          if (!actionable.includes(row.status)) {
            setInviteRequests(prev => prev.filter(r => r.id !== row.id));
          } else {
            setInviteRequests(prev => prev.map(r =>
              r.id === row.id
                ? {
                    ...r,
                    status: row.status as InviteRequest['status'],
                    lastSendError: row.last_send_error ?? undefined,
                    sentCode: row.code ?? undefined,
                    expiresAt: row.expires_at,
                  }
                : r,
            ));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [currentUser.id, currentUser.isAdmin, currentUser.isPrimaryAdmin, view]);

  const SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'http://localhost:3001';

  const handleApproveReset = async (req: ResetRequest) => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) return;

    const res = await fetch(`${SERVER_URL}/api/admin-reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetUserId: req.userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToastMsg(data.error ?? 'Şifre sıfırlanamadı');
      setTimeout(() => setToastMsg(null), 4000);
      return;
    }

    setPasswordResetRequests(prev => prev.filter(r => r.userId !== req.userId));
    setToastMsg(`${req.userName} kullanıcısına yeni parola e-posta ile gönderildi.`);
    setTimeout(() => setToastMsg(null), 4000);

    // Diğer adminleri bilgilendir
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'password-reset-update',
      payload: { userId: req.userId },
    });
  };

  const handleDismissReset = async (userId: string) => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${SERVER_URL}/api/dismiss-password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetUserId: userId }),
    });

    setPasswordResetRequests(prev => prev.filter(r => r.userId !== userId));

    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'password-reset-update',
      payload: { userId },
    });
  };

  const handleAdminManualReset = async (userId: string, userName: string, userEmail: string) => {
    await handleApproveReset({ userId, userName, userEmail });
  };

  // ── Admin: Davet kodu gönder
  const handleSendInviteCode = async (req: InviteRequest): Promise<{ code?: string; error?: string }> => {
    let optimisticApplied = false;
    let lockedCode: string | undefined;
    try {
      // 1. DB'de atomik kilit: status → 'sending', yeni kod üret
      const result = await adminSendInviteCode(req.id);
      if (result.error) {
        if (result.error === 'invalid_status') return { error: 'Bu talep zaten işleme alınmış.' };
        return { error: result.error };
      }
      if (!result.ok || !result.code) return { error: 'Kod üretilemedi.' };
      lockedCode = result.code;

      // UI'da hemen 'sending' olarak işaretle (Realtime UPDATE gelmeden önce)
      setInviteRequests(prev => prev.map(r =>
        r.id === req.id
          ? { ...r, status: 'sending' as const, sentCode: lockedCode }
          : r,
      ));
      optimisticApplied = true;

      // 2. E-posta gönder — await ile bekle
      const emailResult = await sendInviteEmail(req.email, lockedCode, result.expires_at ?? 0);

      if (emailResult.success) {
        // 3a. Başarılı → 'sent' olarak işaretle, listeden kaldır
        await adminMarkInviteSent(req.id);
        setInviteRequests(prev => prev.filter(r => r.id !== req.id));
        return { code: lockedCode };
      } else {
        // 3b. Başarısız → 'failed' olarak kaydet, hata mesajını sakla
        const errMsg = emailResult.error ?? 'E-posta gönderilemedi';
        await adminMarkInviteFailed(req.id, errMsg);
        setInviteRequests(prev => prev.map(r =>
          r.id === req.id
            ? { ...r, status: 'failed' as const, lastSendError: errMsg }
            : r,
        ));
        return { code: lockedCode, error: errMsg };
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      // Eğer optimistik 'sending' uygulandıysa ama sonrasında exception fırladıysa
      // UI'ı 'failed' konumuna al; DB satırı 2 dakika sonra zaten timeout ile failed'a düşer.
      if (optimisticApplied) {
        setInviteRequests(prev => prev.map(r =>
          r.id === req.id
            ? { ...r, status: 'failed' as const, lastSendError: errMsg }
            : r,
        ));
        if (lockedCode) {
          adminMarkInviteFailed(req.id, errMsg).catch(() => {});
        }
      }
      return { error: errMsg };
    }
  };

  // ── Admin: Daveti reddet
  const handleRejectInvite = async (req: InviteRequest): Promise<void> => {
    try {
      await adminRejectInvite(req.id);
    } finally {
      setInviteRequests(prev => prev.filter(r => r.id !== req.id));
    }
  };

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

    const newUser: User = {
      id: data.user?.id || Math.random().toString(36).slice(2, 11),
      name: displayName,
      email: loginNick,
      firstName,
      lastName,
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

    setCurrentUser(newUser);
    startPresence(newUser, appVersion);

    const { data: regAllProfiles } = await getAllProfiles();
    const regOfflineUsers: User[] = regAllProfiles
      ? regAllProfiles
          .filter((p: DbProfile) => p.id !== newUser.id)
          .map((p: DbProfile) => ({
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
            isMuted: p.is_muted || false,
            isVoiceBanned: p.is_voice_banned || false,
            appVersion: knownVersionsRef.current.get(p.id),
          }))
      : [];

    setAllUsers(prev => {
      const prevMap = new Map<string, User>(prev.map(u => [u.id, u]));
      return [
        newUser,
        ...regOfflineUsers.map(u => ({
          ...u,
          appVersion: prevMap.get(u.id)?.appVersion ?? u.appVersion,
        })),
      ];
    });
    resyncPresence();
    // Fallback: kayıt sırasında da WebSocket henüz bağlanmamış olabilir
    setTimeout(() => resyncPresenceRef.current(), 1500);
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
  };

  const channelContextValue: ChannelContextType = {
    channels,
    setChannels,
    activeChannel,
    setActiveChannel,
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
    isStatusMenuOpen,
    setIsStatusMenuOpen,
    statusTimerInput,
    setStatusTimerInput,
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
    currentTheme,
    setCurrentTheme,
    isLowDataMode,
    setIsLowDataMode,
    isNoiseSuppressionEnabled,
    setIsNoiseSuppressionEnabled,
    noiseThreshold,
    setNoiseThreshold,
    pttKey,
    setPttKey,
    isListeningForKey,
    setIsListeningForKey,
    soundJoinLeave,
    setSoundJoinLeave,
    soundJoinLeaveVariant,
    setSoundJoinLeaveVariant,
    soundMuteDeafen,
    setSoundMuteDeafen,
    soundMuteDeafenVariant,
    setSoundMuteDeafenVariant,
    soundPtt,
    setSoundPtt,
    soundPttVariant,
    setSoundPttVariant,
    avatarBorderColor,
    setAvatarBorderColor,
    pttReleaseDelay,
    setPttReleaseDelay,
    soundInvite,
    setSoundInvite,
    soundInviteVariant,
    setSoundInviteVariant,
  };

  const appStateValue: AppStateContextType = {
    view,
    setView,
    isMuted,
    setIsMuted,
    isDeafened,
    setIsDeafened,
    statusTimer,
    setStatusTimer,
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
    handleSetStatus,
    handleCopyCode,
    handleUpdateUserVolume,
    handleUserActionClick,
    handleInviteUser,
    handleKickUser,
    handleMoveUser,
    handleSaveRoom,
    handleDeleteRoom,
    handleRenameRoom,
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
    handleGenerateCode,
    handleLogin,
    handleLogout,
    handleRegister,
    handleCompleteRegistration,
    disconnectFromLiveKit,
    formatTime,
    broadcastModeration,
    appVersion,
    updateInfo,
    onUpdateDownload: () => {
      const w = window as Window & { electronUpdater?: { startDownload: () => void } };
      w.electronUpdater?.startDownload();
      setUpdateInfo(prev => prev ? { ...prev, state: 'downloading' } : prev);
    },
    onUpdateInstall: () => {
      const w = window as Window & { electronUpdater?: { installNow: () => void } };
      w.electronUpdater?.installNow();
    },
    onUpdateDismiss: () => {
      setUpdateInfo(prev => {
        if (!prev) return prev;
        if (prev.state === 'dismissed') return null;
        return { ...prev, state: 'dismissed' };
      });
    },
    showReleaseNotes,
    setShowReleaseNotes,
    passwordResetRequests,
    handleApproveReset,
    handleDismissReset,
    handleAdminManualReset,
    inviteRequests,
    handleSendInviteCode,
    handleRejectInvite,
    inviteCooldowns,
    inviteStatuses,
  };

  const audioValue: AudioContextType = {
    volumeLevel,
    setVolumeLevel: () => {},
    isPttPressed,
    setIsPttPressed: () => {},
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
  };

  return (
    <SettingsCtx.Provider value={settingsContextValue}>
      <UserContext.Provider value={userContextValue}>
        <ChannelContext.Provider value={channelContextValue}>
          <UIContext.Provider value={uiContextValue}>
            <AppStateContext.Provider value={appStateValue}>
              <AudioCtx.Provider value={audioValue}>
                <div className="font-sans selection:bg-blue-500/30">
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
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center min-h-screen bg-[var(--theme-bg)]"
                        >
                          <div className="relative mb-6">
                            <div className="absolute inset-0 bg-[var(--theme-accent)]/20 blur-2xl rounded-full" />
                            <div className="relative w-16 h-16 rounded-full bg-[var(--theme-accent)]/10 border border-[var(--theme-accent)]/30 flex items-center justify-center text-[var(--theme-accent)]">
                              <Mic size={32} />
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map(i => (
                              <motion.div
                                key={i}
                                className="w-2 h-2 rounded-full bg-[var(--theme-accent)]"
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                      {view === 'login-selection' && (
                        <LoginSelectionView
                          onGoToCode={() => setView('login-code')}
                          onGoToPassword={() => setView('login-password')}
                        />
                      )}
                      {view === 'login-code' && (
                        <LoginCodeView
                          handleRegister={handleRegister}
                          handleLogout={handleLogout}
                        />
                      )}
                      {view === 'login-password' && (
                        <LoginPasswordView
                          handleLogin={handleLogin}
                          handleLogout={handleLogout}
                          onForgotPassword={() => setShowForgotPassword(true)}
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
                          onGoBack={() => setView('login-code')}
                        />
                      )}
                      {(view === 'chat' || view === 'settings') && <ChatView />}
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

                  {/* Toast bildirimi */}
                  <AnimatePresence>
                    {toastMsg && (
                      <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm font-bold shadow-2xl"
                      >
                        {toastMsg}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </AudioCtx.Provider>
            </AppStateContext.Provider>
          </UIContext.Provider>
        </ChannelContext.Provider>
      </UserContext.Provider>
    </SettingsCtx.Provider>
  );
}
