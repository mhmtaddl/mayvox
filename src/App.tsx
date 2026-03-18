/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AppView, User, VoiceChannel, Theme } from './types';
import { CHANNELS, THEMES } from './constants';
import { signIn, signOut, signUp, getSession, saveProfile, getProfile, getProfileByUsername, getAllProfiles, getChannels, createChannel, updateChannel, deleteChannel, updateUserModeration, verifyChannelPassword, setChannelPassword, deleteUser, supabase } from './lib/supabase';
import { getLiveKitToken, LIVEKIT_URL } from './lib/livekit';
import { Room, RoomEvent, Track, ConnectionQuality, DisconnectReason, type AudioCaptureOptions } from 'livekit-client';

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

import LoginSelectionView from './views/LoginSelectionView';
import LoginCodeView from './views/LoginCodeView';
import LoginPasswordView from './views/LoginPasswordView';
import RegisterDetailsView from './views/RegisterDetailsView';
import ChatView from './views/ChatView';
import SettingsView from './views/SettingsView';

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

  // ── Audio control state ──────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [connectionLevel, setConnectionLevel] = useState(4);

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
      if (livekitRoomRef.current) return; // Kanaldayken LiveKit Reconnected event'i yönetir
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

    // Periyodik ping (10sn) — kanaldayken atla
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

    // Başlangıç seviyesi
    setConnectionLevel(getQualityLevel());

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (conn) conn.removeEventListener('change', onConnectionChange);
      clearInterval(pingInterval);
    };
  }, []);

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
  // Sadece çok adımlı kayıt akışı için (LoginCodeView → RegisterDetailsView)
  const [loginNick, setLoginNick] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [displayName, setDisplayName] = useState('');

  // ── Refs ─────────────────────────────────────────────────────────────────
  const livekitRoomRef = useRef<Room | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectionLostRef = useRef(false);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  // Kanalsız kalınca (her nedenden dolayı) kullanıcıyı tüm channel members'dan temizle
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
  const isLowDataModeRef = useRef(isLowDataMode);
  useEffect(() => { isLowDataModeRef.current = isLowDataMode; }, [isLowDataMode]);

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
      }

      setView('chat');
      setIsSessionLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TEK 5000ms INTERVAL — bağlantı kalitesi + mute/ban süresi kontrolü ──
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
    if (statusTimer <= 0) {
      const user = currentUserRef.current;
      const updatedUser = { ...user, statusText: 'Aktif' };
      setCurrentUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      setStatusTimer(null);
      setIsMuted(false);
      setIsDeafened(false);
      return;
    }
    const minutes = Math.floor(statusTimer / 60);
    const seconds = statusTimer % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')} Sonra Geleceğim`;
    const user = currentUserRef.current;
    if (user.statusText !== timeStr) {
      const updatedUser = { ...user, statusText: timeStr };
      setCurrentUser(updatedUser);
      setAllUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
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
        }

        return hasChanges ? nextChannels : prevChannels;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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

  // ── Update channel membership when active channel changes ─────────────────
  useEffect(() => {
    if (!currentUser.name) return;
    setChannels(prev => prev.map(c => {
      const isUserInThisChannel = activeChannel === c.id;
      const otherMembers = c.members?.filter(m => m !== currentUser.name) || [];
      const newMembers = isUserInThisChannel ? [...otherMembers, currentUser.name] : otherMembers;
      return { ...c, members: newMembers, userCount: newMembers.length };
    }));
  }, [activeChannel, currentUser.name]);

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

  const isSupabaseUser = (userId: string) => userId.includes('-');

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSetStatus = (text: string, minutes?: number) => {
    const updatedUser = { ...currentUser, statusText: text };
    setCurrentUser(updatedUser);
    setAllUsers(allUsers.map(u => u.id === currentUser.id ? updatedUser : u));

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
      setToastMsg('Şifre kaydedilemedi: ' + error.message);
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

  const broadcastModeration = (userId: string, updates: Partial<User>) => {
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'moderation',
      payload: { userId, updates },
    });
  };

  const handleMuteUser = (userId: string, durationMinutes: number) => {
    const expires = Date.now() + durationMinutes * 60 * 1000;
    const updates = { isMuted: true, muteExpires: expires };
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (isSupabaseUser(userId)) updateUserModeration(userId, { is_muted: true, mute_expires: expires });
    broadcastModeration(userId, updates);
  };

  const handleBanUser = (userId: string, durationMinutes: number) => {
    const expires = Date.now() + durationMinutes * 60 * 1000;
    const updates = { isVoiceBanned: true, banExpires: expires };
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (isSupabaseUser(userId)) updateUserModeration(userId, { is_voice_banned: true, ban_expires: expires });
    broadcastModeration(userId, updates);
  };

  const handleUnmuteUser = (userId: string) => {
    const updates = { isMuted: false, muteExpires: undefined };
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (isSupabaseUser(userId)) updateUserModeration(userId, { is_muted: false, mute_expires: null });
    broadcastModeration(userId, updates);
  };

  const handleUnbanUser = (userId: string) => {
    const updates = { isVoiceBanned: false, banExpires: undefined };
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (isSupabaseUser(userId)) updateUserModeration(userId, { is_voice_banned: false, ban_expires: null });
    broadcastModeration(userId, updates);
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser.id) {
      await signOut();
      setView('login-selection');
      return;
    }

    const { data, error } = await deleteUser(userId);

    if (error || data?.error) {
      alert(data?.error || 'Kullanıcı silinemedi.');
      return;
    }

    setAllUsers(prev => prev.filter(u => u.id !== userId));
    broadcastModeration(userId, { status: 'offline' });
  };

  const handleToggleAdmin = (userId: string) => {
    if (!currentUser.isPrimaryAdmin) return;
    const targetUser = allUsers.find(u => u.id === userId);
    if (!targetUser) return;
    const newIsAdmin = !targetUser.isAdmin;
    const updates = { isAdmin: newIsAdmin };
    setAllUsers(allUsers.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (isSupabaseUser(userId)) updateUserModeration(userId, { is_admin: newIsAdmin });
    broadcastModeration(userId, updates);
  };

  const handleGenerateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedCode(code);
    setTimeLeft(180);
  };

  // ── LiveKit ───────────────────────────────────────────────────────────────
  const connectToLiveKit = async (channelId: string, channelName: string): Promise<boolean> => {
    try {
      if (livekitRoomRef.current) {
        await livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }

      const token = await getLiveKitToken(channelId, currentUser.name);
      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: isNoiseSuppressionEnabled,
          autoGainControl: isNoiseSuppressionEnabled,
          deviceId: selectedInput || undefined,
        },
        audioOutput: {
          deviceId: selectedOutput || undefined,
        },
      });
      livekitRoomRef.current = room;

      const updateMembers = () => {
        const participants = [
          room.localParticipant.identity,
          ...Array.from(room.remoteParticipants.values()).map(p => p.identity),
        ].filter(Boolean);

        setChannels(prev => prev.map(c =>
          c.id === channelId
            ? { ...c, members: participants, userCount: participants.length }
            : c
        ));
        presenceChannelRef.current?.send({
          type: 'broadcast',
          event: 'channel-update',
          payload: { action: 'update', channelId, updates: { members: participants, userCount: participants.length } },
        });
      };

      const syncUsers = () => {
        const remoteIdentities = Array.from(room.remoteParticipants.values()).map(p => p.identity);
        remoteIdentities.forEach(identity => {
          setAllUsers(prev => {
            if (prev.find(u => u.name === identity)) return prev;
            const newUser: User = {
              id: `lk-${identity}`,
              name: identity,
              firstName: identity,
              lastName: '',
              age: 0,
              avatar: (identity[0] || '?').toUpperCase(),
              status: 'online',
              statusText: 'Aktif',
              isAdmin: false,
              isPrimaryAdmin: false,
            };
            return [...prev, newUser];
          });
        });
        // lk-* kullanıcıları geçici LiveKit katılımcıları — ayrılınca listeden çıkar
        setAllUsers(prev => prev.filter(u =>
          !u.id.startsWith('lk-') || remoteIdentities.includes(u.name)
        ));
      };

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach() as HTMLAudioElement;
          audioEl.setAttribute('data-livekit-audio', 'true');
          audioEl.muted = isDeafened;
          document.body.appendChild(audioEl);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach(el => el.remove());
        }
      });

      room.on(RoomEvent.ParticipantConnected, () => { updateMembers(); syncUsers(); });
      room.on(RoomEvent.ParticipantDisconnected, () => { updateMembers(); syncUsers(); });
      room.on(RoomEvent.ConnectionQualityChanged, (quality) => {
        const level = quality === ConnectionQuality.Excellent ? 4
          : quality === ConnectionQuality.Good ? 3
          : quality === ConnectionQuality.Poor ? 1
          : 0;
        setConnectionLevel(level);
      });
      let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

      room.on(RoomEvent.Reconnecting, () => {
        setConnectionLevel(1);
        setToastMsg('Bağlantı kesildi, yeniden bağlanılıyor...');
        reconnectTimeout = setTimeout(async () => {
          await room.disconnect();
          setConnectionLevel(0);
          setToastMsg('Bağlantı kesildi. İnternet bağlantınızı kontrol ediniz.');
        }, 15000);
      });
      room.on(RoomEvent.Reconnected, () => {
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        connectionLostRef.current = false;
        setConnectionLevel(4);
        setToastMsg('Bağlantı yeniden kuruldu.');
        setTimeout(() => setToastMsg(null), 3000);
      });
      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        const identity = room.localParticipant?.identity || currentUserRef.current.name;
        livekitRoomRef.current = null;
        setIsConnecting(false);
        // CLIENT_INITIATED: ya manuel ayrılma (caller sıfırlar) ya da kanal geçişi
        // Kanal geçişinde activeChannel zaten yeni kanalı gösteriyor — sıfırlama
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          setActiveChannel(null);
        }
        setChannels(prev => {
          const updated = prev.map(c => {
            if (c.id !== channelId) return c;
            const members = c.members?.filter(m => m !== identity) || [];
            return { ...c, members, userCount: members.length };
          });
          const ch = updated.find(c => c.id === channelId);
          if (ch) {
            presenceChannelRef.current?.send({
              type: 'broadcast',
              event: 'channel-update',
              payload: { action: 'update', channelId, updates: { members: ch.members, userCount: ch.userCount } },
            });
          }
          return updated;
        });
        if (reason !== DisconnectReason.CLIENT_INITIATED) {
          connectionLostRef.current = true;
          setConnectionLevel(0);
          setToastMsg('Bağlantı kesildi. İnternet bağlantınızı kontrol ediniz.');
        } else {
          setConnectionLevel(4);
        }
      });

      await room.connect(LIVEKIT_URL, token);
      updateMembers();
      syncUsers();

      if (!currentUser.isVoiceBanned) {
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      return true;
    } catch (err) {
      console.error('LiveKit bağlantı hatası:', err);
      setToastMsg('Odaya bağlanılamadı. Lütfen tekrar deneyin.');
      setTimeout(() => setToastMsg(null), 4000);
      return false;
    }
  };

  const disconnectFromLiveKit = async () => {
    setIsConnecting(false);
    if (livekitRoomRef.current) {
      await livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    document.querySelectorAll('[data-livekit-audio]').forEach(el => el.remove());
  };

  // ── Presence ──────────────────────────────────────────────────────────────
  const startPresence = (user: User) => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
    }
    const channel = supabase.channel('app-presence', { config: { presence: { key: user.id } } });
    presenceChannelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ userId: string }>();
      const onlineIds = new Set(Object.values(state).flatMap(s => s.map(p => p.userId)));
      setAllUsers(prev => prev.map(u => ({
        ...u,
        status: u.id === user.id ? 'online' : onlineIds.has(u.id) ? 'online' : 'offline',
        statusText: u.id === user.id ? u.statusText : onlineIds.has(u.id) ? (u.statusText === 'Çevrimdışı' ? 'Aktif' : u.statusText) : 'Çevrimdışı',
      } as User)));
    });

    channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (payload.inviteeId === user.id) {
        setInvitationModal({
          inviterId: payload.inviterId,
          inviterName: payload.inviterName,
          roomName: payload.roomName,
          roomId: payload.roomId,
        });
      }
    });

    channel.on('broadcast', { event: 'invite-rejected' }, ({ payload }) => {
      if (payload.inviterId === user.id) {
        setToastMsg(`${payload.inviteeName} davetinize icabet etmedi.`);
        setTimeout(() => setToastMsg(null), 4000);
      }
    });

    channel.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setActiveChannel(null);
        disconnectFromLiveKit();
        setToastMsg('Odadan çıkarıldınız.');
        setTimeout(() => setToastMsg(null), 4000);
      }
    });

    channel.on('broadcast', { event: 'moderation' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setCurrentUser((prev: User) => ({ ...prev, ...payload.updates }));
      }
      setAllUsers(prev => prev.map(u => u.id === payload.userId ? { ...u, ...payload.updates } : u));
    });

    channel.on('broadcast', { event: 'channel-update' }, ({ payload }) => {
      if (payload.action === 'create') {
        setChannels(prev => prev.find(c => c.id === payload.channel.id) ? prev : [...prev, payload.channel]);
      } else if (payload.action === 'delete') {
        setChannels(prev => prev.filter(c => c.id !== payload.channelId));
        setActiveChannel(prev => prev === payload.channelId ? null : prev);
      } else if (payload.action === 'update') {
        setChannels(prev => prev.map(c => {
          if (c.id !== payload.channelId) return c;
          const updates = { ...payload.updates };
          // LiveKit'e bağlı değilsek gelen members listesinde kendimizi gösterme
          if (Array.isArray(updates.members) && !livekitRoomRef.current) {
            updates.members = (updates.members as string[]).filter(m => m !== currentUserRef.current.name);
            updates.userCount = updates.members.length;
          }
          return { ...c, ...updates };
        }));
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId: user.id });
      }
    });
  };

  const stopPresence = () => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }
  };

  // ── Join / verify password ────────────────────────────────────────────────
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
      const now = Date.now();
      setActiveChannel(id);
      setIsConnecting(true);
      setCurrentUser(prev => ({ ...prev, joinedAt: now }));
      setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: now } : u));
      const connected = await connectToLiveKit(id, channel.name);
      setIsConnecting(false);
      if (!connected) {
        setActiveChannel(null);
        setCurrentUser(prev => ({ ...prev, joinedAt: undefined }));
        setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: undefined } : u));
      }
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
      const channelId = passwordModal.channelId;
      const now = Date.now();
      setActiveChannel(channelId);
      setIsConnecting(true);
      setCurrentUser(prev => ({ ...prev, joinedAt: now }));
      setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: now } : u));
      const connected = await connectToLiveKit(channelId, channel.name);
      setIsConnecting(false);
      if (!connected) {
        setActiveChannel(null);
        setCurrentUser(prev => ({ ...prev, joinedAt: undefined }));
        setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: undefined } : u));
      }
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
    setView('chat');
    setLoginNick('');
    setLoginPassword('');
    setLoginError(null);
  };

  const handleLogout = async () => {
    stopPresence();
    await disconnectFromLiveKit();
    await signOut();
    setView('login-selection');
    setActiveChannel(null);
  };

  const handleRegister = (code: string, nick: string, password: string, repeatPwd: string) => {
    if (!code.trim()) throw new Error('Davet kodunu giriniz!');
    if (code.trim().toUpperCase() !== (generatedCode || '').toUpperCase()) throw new Error('Geçersiz veya süresi dolmuş davet kodu!');
    if (!nick || !password) throw new Error('E-posta ve parola giriniz!');
    if (password !== repeatPwd) throw new Error('Parolalar eşleşmiyor!');
    // Kayıt adımı için sakla
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
      setLoginError(error.message);
      return;
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
  };

  const audioValue: AudioContextType = {
    volumeLevel,
    setVolumeLevel: () => {},  // managed internally by usePttAudio
    isPttPressed,
    setIsPttPressed: () => {},  // managed internally by usePttAudio
    connectionLevel,
    setConnectionLevel,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    inputDevices,
    setInputDevices: () => {},  // managed internally by useDevices
    outputDevices,
    setOutputDevices: () => {},  // managed internally by useDevices
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
                      {view === 'chat' && <ChatView />}
                      {view === 'settings' && <SettingsView />}
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
