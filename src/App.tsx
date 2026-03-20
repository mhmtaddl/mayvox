/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  verifyInviteCode,
  useInviteCode,
} from './lib/supabase';
import { playSound } from './lib/sounds';
import { logger } from './lib/logger';
import { type AudioCaptureOptions, type RemoteParticipant, RemoteAudioTrack } from 'livekit-client';

// Supabase DB satır tipleri
type DbProfile = {
  id: string; name: string; email?: string; first_name?: string; last_name?: string;
  age?: number; avatar?: string; is_admin?: boolean; is_primary_admin?: boolean;
  is_muted?: boolean; mute_expires?: number; is_voice_banned?: boolean; ban_expires?: number;
};
type DbChannel = {
  id: string; name: string; owner_id?: string; max_users?: number;
  is_invite_only?: boolean; is_hidden?: boolean; password?: string;
};

import { AppStateContext, AppStateContextType } from './contexts/AppStateContext';
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

  const [avatarBorderColor, setAvatarBorderColorState] = useState(() => localStorage.getItem('avatarBorderColor') || '#3B82F6');
  const setAvatarBorderColor = (v: string) => { localStorage.setItem('avatarBorderColor', v); setAvatarBorderColorState(v); };

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
  const [appVersion, setAppVersion] = useState<string>('');

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
    w.electronApp?.getVersion().then(v => setAppVersion(v)).catch(() => {});
    const updater = w.electronUpdater;
    if (!updater) return;
    updater.onUpdateAvailable((info) => setUpdateInfo({ version: info.version, sizeMB: info.sizeMB, state: 'available', progress: 0 }));
    updater.onDownloadProgress((info) => setUpdateInfo(prev => prev ? { ...prev, state: 'downloading', progress: info.percent } : prev));
    updater.onUpdateDownloaded((info) => setUpdateInfo(prev => prev ? { ...prev, version: info.version, state: 'downloaded', progress: 100 } : prev));
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [invitationModal, setInvitationModal] = useState<{ inviterId: string; inviterName: string; roomName: string; roomId: string } | null>(null);
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
  });

  // ── Presence hook ────────────────────────────────────────────────────────
  const { presenceChannelRef, startPresence, stopPresence, resyncPresence } = usePresence({
    currentUserRef,
    activeChannelRef,
    disconnectFromLiveKit: () => disconnectLKRef.current(),
    setAllUsers,
    setCurrentUser,
    setChannels,
    setActiveChannel,
    setToastMsg,
    setInvitationModal,
  });

  // ── LiveKit hook ─────────────────────────────────────────────────────────
  const { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit } = useLiveKitConnection({
    presenceChannelRef,
    currentUserRef,
    activeChannelRef,
    connectionLostRef,
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
        await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', { method: 'HEAD', cache: 'no-store' });
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
      startPresence(restoredUser);

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
          const onlineIds = new Set(prev.map((u) => u.id));
          const offlineUsers: User[] = allProfiles
            .filter((p: DbProfile) => !onlineIds.has(p.id))
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
            }));
          return [...prev, ...offlineUsers];
        });
        resyncPresence();
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
          }
          return updated ? newUser : u;
        }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

  // ── PTT speaking broadcast ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    const canSpeak = isPttPressed && !isMuted && !currentUser.isVoiceBanned;
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'speaking',
      payload: { userId: currentUser.id, isSpeaking: canSpeak },
    });
  }, [isPttPressed, isMuted, currentUser.isVoiceBanned, activeChannel]);

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

    const isAdmin = currentUser.isAdmin;
    const canInvite = activeChannel && !channels.find(c => c.id === activeChannel)?.members?.includes(allUsers.find(u => u.id === userId)?.name || '') && userId !== currentUser.id;

    if (!isAdmin && !canInvite) return;

    setUserActionMenu({ userId, x: e.clientX, y: e.clientY });
    setContextMenu(null);
  };

  const handleInviteUser = (userId: string) => {
    const channel = channels.find(c => c.id === activeChannel);
    if (!channel || !presenceChannelRef.current) return;
    presenceChannelRef.current.send({
      type: 'broadcast',
      event: 'invite',
      payload: {
        inviterId: currentUser.id,
        inviteeId: userId,
        inviterName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        roomName: channel.name,
        roomId: channel.id,
      },
    });
    setUserActionMenu(null);
  };

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

    setChannels(prev => prev.map(c => {
      const otherMembers = c.members?.filter(m => m !== userName) || [];
      const isTarget = c.id === targetChannelId;
      const newMembers = isTarget ? [...otherMembers, userName] : otherMembers;
      return { ...c, members: newMembers, userCount: newMembers.length };
    }));
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
    console.log('[JOIN] handleJoinChannel çağrıldı', { id, isInvited, currentActiveChannel: activeChannel, currentUserName: currentUser.name });
    const channel = channels.find(c => c.id === id);
    if (!channel) { console.warn('[JOIN] Kanal bulunamadı:', id); return; }

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
      console.log('[JOIN] connectToLiveKit çağrılıyor...');
      await performJoin(id, channel.name);
    }
  };

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
    startPresence(loggedInUser);

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
          }))
      : [];

    setAllUsers([loggedInUser, ...offlineUsers]);
    resyncPresence();
    logger.info('Login success', { userId: loggedInUser.id, name: loggedInUser.name, isAdmin: loggedInUser.isAdmin });
    setView('chat');
    setLoginNick('');
    setLoginPassword('');
    setLoginError(null);
  };

  const handleLogout = async () => {
    logger.info('Logout', { userId: currentUser.id, name: currentUser.name });
    stopPresence();
    await disconnectFromLiveKit();
    await signOut();
    setView('login-selection');
    setActiveChannel(null);
  };

  const handleRegister = async (code: string, nick: string, password: string, repeatPwd: string) => {
    if (!code.trim()) throw new Error('Davet kodunu giriniz!');
    if (!nick || !password) throw new Error('E-posta ve parola giriniz!');
    if (password !== repeatPwd) throw new Error('Parolalar eşleşmiyor!');
    const isValid = await verifyInviteCode(code.trim());
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
      await useInviteCode(pendingInviteCodeRef.current);
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
    startPresence(newUser);

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
          }))
      : [];

    setAllUsers([newUser, ...regOfflineUsers]);
    resyncPresence();
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
