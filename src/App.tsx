/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare const __APP_VERSION__: string;

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AppChrome from './components/AppChrome';
import CommandPalette from './components/CommandPalette';
import { AppView, User, VoiceChannel } from './types';
// Theme types + adaptive theme artık useAppSettings hook'unda
import {
  getProfileByUsername,
  getAllProfiles,
  deleteChannel,
  updateUserModeration,
  verifyChannelPassword,
  saveInviteCode,
  verifyInviteCodeForEmail,
  useInviteCodeForEmail,
  updateActivityOnLogout,
  updateShowLastSeen,
} from './lib/backendClient';
import { getMe, login as authLogin, logout as authLogout, register as authRegister } from './lib/authClient';
import { playSound } from './lib/sounds';
import { setAudioOutputDevice } from './lib/audio/audioOutputRegistry';
import { checkChannelAccess, getServerAccessContext, getMyModerationState, type ServerAccessContext } from './lib/serverService';
import { formatRemaining, getRemainingMs } from './lib/formatTimeout';
import { logger } from './lib/logger';
import { createVoiceJoinTrace, logVoiceJoinTrace } from './lib/voiceJoinTrace';
import { connectChat, disconnectChat, sendPresencePatch } from './lib/chatService';
import { applyVolumeToAudioElement, getAllUserVolumePercents } from './lib/userVolume';
import { buildAudioCaptureOptions } from './lib/audioConstraints';
import { readAppShortcuts, shortcutMatchesEvent, type AppShortcuts } from './lib/commandShortcut';
import {
  DEFAULT_THEME_PACK_ID,
  canAccessThemePack,
  getThemeAccessTier,
  getThemePack,
} from './lib/themePacks';

// Backend DB satır tipleri
type DbProfile = {
  id: string; name: string; display_name?: string; email?: string; first_name?: string; last_name?: string;
  age?: number; avatar?: string; is_admin?: boolean; is_primary_admin?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean; mute_expires?: number; is_voice_banned?: boolean; ban_expires?: number;
  app_version?: string; last_seen_at?: string; total_usage_minutes?: number;
  show_last_seen?: boolean;
  server_creation_plan?: 'none' | 'free' | 'pro' | 'ultra';
  allow_non_friend_dms?: boolean;
  dm_privacy_mode?: 'everyone' | 'mutual_servers' | 'friends_only' | 'closed';
  show_dm_read_receipts?: boolean;
};
import { AppStateContext, AppStateContextType } from './contexts/AppStateContext';
import { AudioCtx, AudioContextType } from './contexts/AudioContext';
import { UserContext, UserContextType } from './contexts/UserContext';
import { ChannelContext, ChannelContextType } from './contexts/ChannelContext';
import { UIContext, UIContextType } from './contexts/UIContext';
import { SettingsCtx, SettingsContextType } from './contexts/SettingsCtx';

import { useDevices } from './hooks/useDevices';
import { usePttAudio } from './hooks/usePttAudio';
import { useLiveKitConnection, type VoiceDisabledReason } from './hooks/useLiveKitConnection';
import { usePresence } from './hooks/usePresence';
import { useBackendPresence } from './hooks/useBackendPresence';
import { useModeration } from './hooks/useModeration';
import { useDucking } from './hooks/useDucking';
import { useAutoPresence, type AutoStatus } from './hooks/useAutoPresence';
import { useFriends } from './hooks/useFriends';

import LoginCodeView from './views/LoginCodeView';
import LoginPasswordView from './views/LoginPasswordView';
import RegisterDetailsView from './views/RegisterDetailsView';
import ChatView from './views/ChatView';
import BanScreen from './components/BanScreen';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import LegalModal, { type LegalModalKind } from './components/legal/LegalModal';
// getReleaseNotes artık App.tsx'te kullanılmıyor (auto-popup kaldırıldı).
// Settings içindeki ReleaseNotesModal hala ./lib/releaseNotes'ten çağırıyor.
import PermissionOnboarding from './components/PermissionOnboarding';
import { useWindowActivity } from './hooks/useWindowActivity';
import { isCapacitor } from './lib/platform';
import { toTitleCaseTr } from './lib/formatName';
import { logMemberIdentityDebug, resolveUserByMemberKey } from './lib/memberIdentity';
import { warmUpTokenServer } from './lib/livekit';
import { getRoomModeConfig } from './lib/roomModeConfig';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { FavoriteFriendsProvider } from './contexts/FavoriteFriendsContext';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { activatePresence } from './lib/presenceLifecycle';
import { useAppSettings } from './features/app/hooks/useAppSettings';
import { useGameActivity } from './features/game-activity/useGameActivity';
import { useOverlaySync } from './features/overlay/useOverlaySync';
import { useAdminPanel } from './features/app/hooks/useAdminPanel';
import { useChannelActions } from './features/app/hooks/useChannelActions';
import {
  registerToastSink,
  registerBellSink,
  registerSoundSink,
  registerFlashSink,
} from './features/notifications/emit';
import { pushInformational } from './features/notifications/informationalStore';
import { playNotifyBeep } from './features/notifications/notificationSound';
import { shouldSuppressSettingsSoundInChatRoom } from './lib/soundRoomPreference';
import { requestElectronFlash } from './features/notifications/electronAttention';
import { getDefaultChannelIconColor } from './lib/channelIconColor';
import { getDefaultChannelIconName } from './lib/channelIcon';

const isUuidUser = (userId: string) => userId.includes('-');

function resolveDmPrivacyMode(p: { dm_privacy_mode?: string | null; allow_non_friend_dms?: boolean }): User['dmPrivacyMode'] {
  const raw = p.dm_privacy_mode;
  if (raw === 'everyone' || raw === 'mutual_servers' || raw === 'friends_only' || raw === 'closed') return raw;
  return p.allow_non_friend_dms === false ? 'friends_only' : 'everyone';
}

function mapDbProfile(
  p: DbProfile,
  knownVersions?: Map<string, string>,
): User {
  const dmPrivacyMode = resolveDmPrivacyMode(p);
  return {
    id: p.id,
    email: p.email || '',
    name: p.name || '',
    displayName: p.display_name || undefined,
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
    serverCreationPlan: resolveServerCreationPlan(p),
    userLevel: (p as { user_level?: string | null }).user_level ?? null,
    avatarBorderColor: (p as { avatar_border_color?: string }).avatar_border_color ?? '',
    dmPrivacyMode,
    allowNonFriendDms: dmPrivacyMode === 'everyone' || dmPrivacyMode === 'mutual_servers',
    showDmReadReceipts: p.show_dm_read_receipts !== false,
  };
}

function resolveServerCreationPlan(p: { server_creation_plan?: string; is_admin?: boolean; is_primary_admin?: boolean }): 'none' | 'free' | 'pro' | 'ultra' {
  const raw = p.server_creation_plan;
  if (raw === 'free' || raw === 'pro' || raw === 'ultra' || raw === 'none') return raw;
  // DB değeri yok/eski → admin/primary admin için 'ultra' fallback (migration da aynı UPDATE'i
  // uygular; bu frontend fallback, migration öncesi session'lar için guard).
  if (p.is_admin || p.is_primary_admin) return 'ultra';
  return 'none';
}

function buildOnlineUser(id: string, email: string, profile: DbProfile | null): User {
  if (profile) {
    const dmPrivacyMode = resolveDmPrivacyMode(profile);
    return {
      id,
      email,
      name: profile.name || email,
      displayName: profile.display_name || undefined,
      firstName: profile.first_name || email.split('@')[0],
      lastName: profile.last_name || '',
      age: profile.age || 18,
      avatar: profile.avatar || '',
      status: 'online' as const,
      statusText: 'Online',
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
      serverCreationPlan: resolveServerCreationPlan(profile),
      userLevel: (profile as { user_level?: string | null }).user_level ?? null,
      avatarBorderColor: (profile as { avatar_border_color?: string }).avatar_border_color ?? '',
      dmPrivacyMode,
      allowNonFriendDms: dmPrivacyMode === 'everyone' || dmPrivacyMode === 'mutual_servers',
      showDmReadReceipts: profile.show_dm_read_receipts !== false,
    };
  }
  logMemberIdentityDebug('missing_profile_fallback', { userId: id, email }, `missing_profile:${id}`);
  return {
    id,
    name: email,
    displayName: undefined,
    firstName: email.split('@')[0],
    lastName: '',
    age: 18,
    avatar: '',
    status: 'online' as const,
    statusText: 'Online',
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} zaman aşımına uğradı`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isConnectivityError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /zaman aşım|timeout|failed to fetch|network|fetch/i.test(message);
}

const STARTUP_MAINTENANCE_MESSAGE =
  'Şu anda MAYVOX sunucularına ulaşılamıyor. Kısa bir bakım veya bağlantı kesintisi olabilir.';

function getBackendHealthUrl(): string | null {
  const apiBase = import.meta.env.VITE_SERVER_API_URL;
  if (!apiBase) return null;
  return `${String(apiBase).replace(/\/$/, '')}/health`;
}

async function shouldShowStartupMaintenance(err: unknown): Promise<boolean> {
  if (!isConnectivityError(err)) return false;

  const healthUrl = getBackendHealthUrl();
  if (!healthUrl) return true;

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    return !res.ok;
  } catch {
    return true;
  }
}

function StartupMaintenanceNotice({ message }: { message: string }) {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="h-full min-h-[calc(100vh-var(--titlebar-height))] bg-[var(--theme-bg)] flex items-center justify-center px-6"
    >
      <div
        className="w-full max-w-[390px] rounded-[16px] px-6 py-5 text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.018))',
          border: '1px solid rgba(255,255,255,0.065)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="mx-auto mb-4 w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            color: 'var(--theme-accent)',
            background: 'rgba(var(--theme-accent-rgb), 0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
          }}
        >
          <CloudOff size={20} strokeWidth={2.1} />
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--theme-text)] leading-tight">
          Sunucu bakımı sürüyor
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--theme-secondary-text)]">
          {message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 mx-auto h-9 px-3.5 rounded-lg inline-flex items-center justify-center gap-2 text-[12px] font-semibold transition-colors"
          style={{
            color: 'var(--theme-text)',
            background: 'rgba(255,255,255,0.055)',
            border: '1px solid rgba(255,255,255,0.075)',
          }}
        >
          <RefreshCw size={13} strokeWidth={2.2} />
          Yeniden dene
        </button>
      </div>
    </motion.div>
  );
}

export default function App() {
  // ── Window activity: toggles .window-inactive CSS class on <html> ──
  useWindowActivity();

  const [view, setView] = useState<AppView>('loading');
  const [, setIsSessionLoading] = useState(true);
  const [startupMaintenanceMessage, setStartupMaintenanceMessage] = useState<string | null>(null);

  useEffect(() => {
    console.log('CONNECT CHAT TRIGGERED');
    void connectChat();
  }, []);

  useEffect(() => {
    const api = (window as Window & { electronWindow?: { setAuthMode?: (enabled: boolean, kind?: string) => void } }).electronWindow;
    if (!api?.setAuthMode) return;
    const authView = view === 'login-password' || view === 'login-code' || view === 'register-details';
    document.documentElement.classList.toggle('mv-auth-window', authView);
    api.setAuthMode(authView, authView ? view : undefined);
  }, [view]);


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
  const overlayThemeAccentRgb = getThemePack(settings.themePackId).accentRgb;
  const {
    isLowDataMode, isNoiseSuppressionEnabled, noiseThreshold, noiseSuppressionStrength,
    pttKey, setPttKey, isListeningForKey, setIsListeningForKey,
    voiceMode, setVoiceMode, pttReleaseDelay, autoLeaveEnabled, autoLeaveMinutes,
    setShowLastSeenLocal,
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

  // Oyun algılama hook'u (IPC dinleyici) — currentUser declaration'ından ÖNCE
  // çağrılmalı ki hook sırası sabit kalsın; reflect effect aşağıda.
  // Overlay game-only modunda da local detector gerekir; bu, oyun durumunu
  // presence'a yayınlamakla aynı şey değil. Presence payload'ı aşağıda ayrıca
  // settings.gameActivityEnabled ile gate edilir.
  const overlayNeedsGameDetection = settings.overlayEnabled && settings.overlayDisplayMode === 'game-only';
  const detectedGame = useGameActivity(settings.gameActivityEnabled || overlayNeedsGameDetection);

  // avatarBorderColor değişimini izle → currentUser + allUsers + broadcast sync
  const prevFrameColorRef = useRef(settings.avatarBorderColor);
  useEffect(() => {
    const color = settings.avatarBorderColor;
    if (color === prevFrameColorRef.current) return;
    prevFrameColorRef.current = color;
    if (!currentUser.id) return;
    setCurrentUser(prev => ({ ...prev, avatarBorderColor: color }));
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, avatarBorderColor: color } : u));
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'moderation',
      payload: { userId: currentUser.id, updates: { avatarBorderColor: color } },
    });
  }, [settings.avatarBorderColor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Oyun algılama — detected game değişince self user state'e yansıt ───────
  // Toggle kapalıyken gameActivity undefined → presence'ta alan bile gitmez
  // (backward-compat). Overlay için local detection çalışsa bile kullanıcı oyun
  // durumunu paylaşmayı kapattıysa currentUser.gameActivity doldurulmaz.
  useEffect(() => {
    if (!currentUser.id) return;
    const next = settings.gameActivityEnabled ? (detectedGame ?? undefined) : undefined;
    setCurrentUser(prev => prev.gameActivity === next ? prev : { ...prev, gameActivity: next });
    setAllUsers(prev => prev.map(u => u.id === currentUser.id
      ? (u.gameActivity === next ? u : { ...u, gameActivity: next })
      : u));
  }, [detectedGame, settings.gameActivityEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

// ── Audio control state ──────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafenedState] = useState(false);
  const isDeafenedRef = useRef(false);
  const setIsDeafened = (v: boolean) => {
    setIsDeafenedState(v);
    isDeafenedRef.current = v;
    // DOM seviyesinde mute (primary)
    document.querySelectorAll('audio[data-livekit-audio]').forEach(el => { (el as HTMLAudioElement).muted = v; });
    // LiveKit track seviyesinde de volume'u 0/1'e zorla — ducking sporadik ezmelerine karşı belt-and-suspenders.
    // Undeafen'da ducking bir sonraki tick'te doğru userVol * duckingGain değerini yazar.
    const room = livekitRoomRef.current;
    if (room) {
      for (const [, p] of room.remoteParticipants) {
        for (const pub of p.audioTrackPublications.values()) {
          const t = pub.track ?? (pub as any).audioTrack;
          if (t && typeof t.setVolume === 'function') t.setVolume(v ? 0 : 1);
        }
      }
    }
  };
  const [connectionLevel, setConnectionLevel] = useState(4);
  const [connectionLatencyMs, setConnectionLatencyMs] = useState<number | undefined>(undefined);
  const [connectionJitterMs, setConnectionJitterMs] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (connectionLevel !== 0) return;
    setConnectionLatencyMs(undefined);
    setConnectionJitterMs(undefined);
  }, [connectionLevel]);

  // ── User state ───────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User>({
    id: '',
    name: '',
    firstName: '',
    lastName: '',
    age: 0,
    avatar: '',
    status: 'online',
    statusText: 'Online',
    isAdmin: false,
    isPrimaryAdmin: false,
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!currentUser.id) return;
    void connectChat();
  }, [currentUser.id]);

  useEffect(() => {
    if (!currentUser.id) return;
    const themeAccessTier = getThemeAccessTier(currentUser);
    if (canAccessThemePack(settings.themePackId, themeAccessTier)) return;
    settings.setThemePackId(DEFAULT_THEME_PACK_ID);
  }, [
    currentUser.id,
    currentUser.serverCreationPlan,
    currentUser.userLevel,
    settings.themePackId,
  ]);

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
  const liveVoicePresenceRef = useRef<{ channelId: string | null; memberIds: Set<string> }>({
    channelId: null,
    memberIds: new Set(),
  });

  const currentChannel = useMemo(
    () => channels.find(c => c.id === activeChannel),
    [channels, activeChannel]
  );
  const channelMembers = useMemo(
    () => {
      const members = currentChannel?.members ?? [];
      const resolved: User[] = [];
      members.forEach(memberKey => {
        const user = resolveUserByMemberKey<User>(memberKey, allUsers);
        if (user && !resolved.some(u => u.id === user.id)) resolved.push(user);
        if (!user) {
          logMemberIdentityDebug('app_channel_members_unresolved', { memberKey }, `app_channel_members:${memberKey}`);
        }
      });
      return resolved;
    },
    [allUsers, currentChannel]
  );

  const [appVersion, setAppVersion] = useState<string>(() => {
    try { return __APP_VERSION__ || '0.0.0'; } catch { return '0.0.0'; }
  });
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForcePasswordChange, setShowForcePasswordChange] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalModalKind | null>(null);
  // Admin panel state — hook çağrısı presenceChannelRef'ten sonra (aşağıda)

  useEffect(() => {
    // Release notes auto-popup KALDIRILDI (user tercih — v2.0.9+).
    // Version bookkeeping korunuyor (cylk-last-version). getReleaseNotes import'u
    // Settings içindeki manuel "Sürüm Notları" butonu için hala kullanılabilir.
    const w = window as Window & {
      electronApp?: { getVersion: () => Promise<string>; setTrayChannel?: (name: string | null) => void };
    };
    w.electronApp?.getVersion().then(v => {
      setAppVersion(v);
      localStorage.setItem('cylk-last-version', v);
    }).catch(() => {
      localStorage.setItem('cylk-last-version', appVersion);
    });
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────
  // Toast pipeline — state-driven: tek gerçek kaynak setToastMsgRaw'ın kendi state'i.
  // toastActiveRef kaldırıldı; ref ile state ayrıştığı için aynı mesaj dedup'a yakalanıp
  // hiç görünmeden yutuluyordu. Queue kalıyor — sıradaki mesajlar için.
  // lastPresentedAtRef: minimum görünürlük süresi — setToastMsg(null) toast daha
  // render olmadan çağrılsa bile kullanıcı metni görene kadar kapatmaz.
  const [toastMsg, setToastMsgRaw] = useState<string | null>(null);
  const toastMsgRef = useRef<string | null>(null);
  const toastQueueRef = useRef<string[]>([]);
  const lastPresentedAtRef = useRef<number>(0);

  // ── Voice pipeline guard (tek-kaynak gerçeklik) ─────────────────────────
  // null = konuşabilir. Set edildiğinde PTT/VAD/setMicrophoneEnabled bloklanır.
  // Kaynaklar: LiveKit ParticipantPermissionsChanged (server_muted),
  // DisconnectReason.PARTICIPANT_REMOVED (kicked/timeout), currentUser.isVoiceBanned (banned).
  const [voiceDisabledReason, setVoiceDisabledReason] = useState<VoiceDisabledReason>(null);
  const voiceDisabledReasonRef = useRef<VoiceDisabledReason>(null);
  useEffect(() => { voiceDisabledReasonRef.current = voiceDisabledReason; }, [voiceDisabledReason]);
  const isVoiceBlocked = voiceDisabledReason !== null;

  // Timeout bitiş zamanı (ISO). Sunucu-içi timeout aktifken set edilir; join guard,
  // mic click, ve disconnect sırasında timeout vs kick ayrımı için okunur.
  // Ref: LiveKit event callback'lerinden closure-free erişim için.
  const [timedOutUntil, setTimedOutUntil] = useState<string | null>(null);
  const timedOutUntilRef = useRef<string | null>(null);
  useEffect(() => { timedOutUntilRef.current = timedOutUntil; }, [timedOutUntil]);

  // Chat ban — süresiz ise chatBannedUntil null kalabilir ama isChatBanned true olur.
  // Süreli ise chatBannedUntil dolu + isChatBanned true. Chat_unban / yok: ikisi de temizlenir.
  const [chatBannedUntil, setChatBannedUntil] = useState<string | null>(null);
  const chatBannedUntilRef = useRef<string | null>(null);
  useEffect(() => { chatBannedUntilRef.current = chatBannedUntil; }, [chatBannedUntil]);
  const [isChatBanned, setIsChatBanned] = useState(false);
  const isChatBannedRef = useRef(false);
  useEffect(() => { isChatBannedRef.current = isChatBanned; }, [isChatBanned]);

  const setToastMsg = useCallback((msg: string | null) => {
    if (msg === null) {
      // Minimum görünürlük: toast 600ms içinde dismiss edilmeye çalışılıyorsa
      // kalan süre kadar bekle — aksi halde yeni eklenen toast animasyon bitmeden kaybolur.
      const presented = Date.now() - lastPresentedAtRef.current;
      if (toastMsgRef.current && presented < 600) {
        const wait = 600 - presented;
        setTimeout(() => setToastMsg(null), wait);
        return;
      }
      const next = toastQueueRef.current.shift() ?? null;
      setToastMsgRaw(next);
      return;
    }
    // Dedupe state-driven: aktif mesaj veya kuyrukta aynısı varsa atla.
    if (toastMsgRef.current === msg || toastQueueRef.current.includes(msg)) return;
    // Aktif mesaj yoksa direkt göster; varsa kuyruk (sınır 5).
    if (!toastMsgRef.current) {
      setToastMsgRaw(msg);
    } else if (toastQueueRef.current.length < 5) {
      toastQueueRef.current.push(msg);
    }
  }, []);

  // toastMsg state → ref sync + present timestamp bookkeeping.
  useEffect(() => {
    toastMsgRef.current = toastMsg;
    if (toastMsg) lastPresentedAtRef.current = Date.now();
  }, [toastMsg]);

  // ── Faz 1: Unified notification emitter sinks ─────────────────────────────
  // emitNotification altyapısı Faz 1'de sadece kurulur; mevcut setToastMsg/
  // service handler path'leri aynı kalır (UI bit-identical). Faz 2+'de call
  // site'lar kademeli olarak emitNotification'a migrate edilecek. Sink register
  // edilmemişse emitter o kanalı sessizce atlar.
  useEffect(() => {
    registerToastSink((n) => setToastMsg(n.message));
    registerBellSink((n) => {
      pushInformational({
        key: n.id,
        kind: 'generic',
        label: n.title,
        detail: n.message,
        serverId: typeof n.meta?.serverId === 'string' ? n.meta.serverId : undefined,
        createdAt: n.timestamp,
      });
    });
    registerSoundSink(() => {
      if (!shouldSuppressSettingsSoundInChatRoom()) playNotifyBeep();
    });
    registerFlashSink(() => requestElectronFlash(true));
    return () => {
      registerToastSink(null);
      registerBellSink(null);
      registerSoundSink(null);
      registerFlashSink(null);
    };
  }, [setToastMsg]);

  // ── Invite state: ephemeral state + persistent ref (rehydration için) ──
  type InviteData = { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string; serverName?: string; serverAvatar?: string | null };
  const [invitationModal, setInvitationModalRaw] = useState<InviteData | null>(null);
  const pendingInviteRef = useRef<InviteData | null>(null);

  const setInvitationModal = useCallback((v: InviteData | null) => {
    if (v) {
      pendingInviteRef.current = v;
    } else {
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
    iconColor?: string;
    iconName?: string;
  }>({ isOpen: false, type: 'create', name: '', maxUsers: 0, isInviteOnly: false, isHidden: false, mode: 'social' });
  const [passwordModal, setPasswordModal] = useState<{ type: 'set' | 'enter'; channelId: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordRepeatInput, setPasswordRepeatInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    return getAllUserVolumePercents();
  });
  const [settingsTarget, setSettingsTarget] = useState<import('./contexts/UIContext').SettingsTarget>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
  const [publicDisplayName, setPublicDisplayName] = useState('');
  const [isCompletingRegistration, setIsCompletingRegistration] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const connectionLostRef = useRef(false);
  const pendingInviteCodeRef = useRef<string | null>(null);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const sessionStartedAtRef = useRef<number>(Date.now());
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

  // ── Session epoch — ghost countdown timeout'larını geçersiz kılmak için ──
  // Bump edildiği iki nokta:
  //   1) activeChannel non-null değere transition (kanal join)
  //   2) LiveKit RoomEvent.Reconnected
  // Channel leave'de bump YOK — cancelCountdown() yeterli.
  const sessionEpochRef = useRef(0);
  const bumpEpoch = useCallback(() => {
    sessionEpochRef.current += 1;
  }, []);

  // ── Local audio level ref — LiveKit yazar, useAutoPresence okur ──
  const localAudioLevelRef = useRef<number>(0);

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

  // Android/mobilde oda default'u baskındır; kullanıcı "change" butonu ile override edebilir.
  // Kanal değiştikçe override sıfırlanır. Desktop'ta davranış değişmedi.
  const [mobileVoiceModeOverride, setMobileVoiceModeOverride] = useState<typeof voiceMode | null>(null);
  useEffect(() => { setMobileVoiceModeOverride(null); }, [activeChannel]);

  const effectiveVoiceMode = (() => {
    if (!activeChannel) return voiceMode;
    const vc = activeRoomModeConfig.voice;
    if (isCapacitor()) {
      // Android: önce override, yoksa oda default'u (kullanıcının saved voiceMode'u DEĞİL)
      if (mobileVoiceModeOverride && vc.allowedModes.includes(mobileVoiceModeOverride)) return mobileVoiceModeOverride;
      return vc.defaultMode;
    }
    // Desktop: kullanıcı tercihi izin verilenlerse öncelikli
    if (vc.allowedModes.includes(voiceMode)) return voiceMode;
    return vc.defaultMode;
  })();

  const { isPttPressed, setIsPttPressed: setPttPressed, volumeLevel } = usePttAudio({
    pttKey,
    setPttKey,
    isListeningForKey,
    setIsListeningForKey,
    isMuted,
    isVoiceBanned: currentUser.isVoiceBanned ?? false,
    // Server-side blok (mute/timeout/kicked/banned) — tek-kaynak: voiceDisabledReason
    isServerMuted: isVoiceBlocked,
    isVoiceConnected: !!activeChannel && !isConnecting,
    selectedInput,
    isNoiseSuppressionEnabled,
    noiseThreshold,
    isLowDataMode,
    pttReleaseDelay,
    voiceMode: effectiveVoiceMode,
    visualMeterEnabled: settings.overlayEnabled,
    onMicError: (msg) => {
      setToastMsg(msg);
      // auto-dismiss dock useEffect'te yönetiliyor
    },
  });

  // ── Auto-Presence hook ───────────────────────────────────────────────────
  // Tek aktivite kaynağı: auto-presence + auto-leave aynı lastActivityRef'i kullanır.
  // Idle eşiği 10dk sabit (useAutoPresence içinde IDLE_THRESHOLD_MS) — auto-leave'den bağımsız.
  // State + ref ikilisi: state React re-render'ı tetikler (UI güncel kalsın),
  // ref callback closure'larında güncel değeri okumak için.
  const [autoStatus, setAutoStatus] = useState<AutoStatus>('active');
  const autoStatusRef = useRef<AutoStatus>('active');
  // presenceChannelRef usePresence'tan sonra dolacak — callback lazy olduğundan ref üzerinden erişiyoruz
  const presenceChannelForAutoRef = useRef<any>(null);
  const {
    lastActivityRef: sharedLastActivityRef,
    recordActivityImmediate,
  } = useAutoPresence({
    isLoggedIn: !!currentUser.id,
    isDeafened,
    isPttPressed,
    statusText: currentUser.statusText,
    isMuted,
    localAudioLevelRef,
    voiceActivityEnabled: !!activeChannel,
    onStatusChange: (status) => {
      autoStatusRef.current = status;
      setAutoStatus(status);
      // Presence payload'ı güncelle — diğer kullanıcılar yeni durumu görsün
      if (!currentUserRef.current.id) return;
      sendPresencePatch({
        appVersion,
        selfMuted: isMuted,
        selfDeafened: isDeafened,
        currentRoom: activeChannelRef.current || null,
        serverId: activeServerIdRef.current || undefined,
        autoStatus: status,
        onlineSince: onlineSinceRef.current,
        platform: platformRef.current,
        // Çevrimdışı/Rahatsız Etmeyin/AFK gibi manuel statüler — presence
        // payload'ında taşınarak broadcast-miss/resubscribe durumlarında da
        // stabil kalır. Observer usePresence'ta p.statusText okur.
        statusText: currentUserRef.current.statusText || 'Online',
      });
    },
  });

  // ── Presence hook ────────────────────────────────────────────────────────
  const { presenceChannelRef, knownVersionsRef, onlineSinceRef, platformRef, startPresence, stopPresence, resyncPresence } = usePresence({
    currentUserRef,
    activeChannelRef,
    activeServerIdRef,
    channelOrderTokenRef,
    liveVoicePresenceRef,
    disconnectFromLiveKit: () => disconnectLKRef.current(),
    allUsersRef,
    setAllUsers,
    setCurrentUser,
    setChannels,
    setActiveChannel,
    setToastMsg,
    setTimedOutUntil,
    setChatBannedUntil,
    setIsChatBanned,
    setVoiceDisabledReason,
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

  // ── Backend-driven presence (online + last_seen) ────────────────────────
  // Realtime presence oda/audio state'i için kalıyor; global online
  // ve last_seen kaynağı artık custom chat-server (Hetzner).
  useBackendPresence({
    currentUserId: currentUser.id || null,
    allUsers,
    setAllUsers,
  });

  useEffect(() => {
    if (!currentUser.id || !activeServerId) return;
    resyncPresenceRef.current();
  }, [currentUser.id, activeServerId, channels]);

  // ── LiveKit hook ─────────────────────────────────────────────────────────
  const [speakingLevels, setSpeakingLevels] = useState<Record<string, number>>({});

  const { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit, updateNoiseStrength, applyNoisePipeline } = useLiveKitConnection({
    presenceChannelRef,
    currentUserRef,
    activeChannelRef,
    activeServerIdRef,
    liveVoicePresenceRef,
    connectionLostRef,
    isDeafenedRef,
    isNoiseSuppressionEnabled,
    noiseSuppressionStrength,
    selectedInput,
    selectedOutput,
    setConnectionLevel,
    setToastMsg,
    setVoiceDisabledReason,
    timedOutUntilRef,
    setTimedOutUntil,
    setActiveChannel,
    setIsConnecting,
    setChannels,
    setAllUsers,
    allUsersRef,
    userVolumesRef,
    setSpeakingLevels,
    onSessionReset: bumpEpoch,
    localAudioLevelRef,
  });
  const micGuardRoomRef = useRef<typeof livekitRoomRef.current>(null);
  const lastRequestedMicEnabledRef = useRef<boolean | null>(null);

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
    handleToggleSpeaker, handleInviteUser, handleCancelInvite,
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
    allUsers,
    duckingConfig: getRoomModeConfig(channels.find(c => c.id === activeChannel)?.mode).ducking,
    isConnected: !!activeChannel && !isConnecting,
    localIdentity: currentUser.name,
    isDeafenedRef,
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
    handleSetServerCreationPlan,
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
    const pingSamples: number[] = [];
    let fallbackLevel = 4;
    let consecutiveWorseSamples = 0;
    let consecutiveFailures = 0;

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
      rtt < 300 ? 4 : rtt < 700 ? 3 : rtt < 1500 ? 2 : 1;

    const getMedianRtt = (): number => {
      const sorted = [...pingSamples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };

    const calculateJitter = (samples: number[]): number => {
      if (samples.length < 2) return 0;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const deviation = samples.reduce((sum, val) => sum + Math.abs(val - avg), 0) / samples.length;
      return Math.round(deviation);
    };

    const setFallbackLevel = (nextLevel: number) => {
      if (isInRoom()) return;

      if (nextLevel === 0) {
        fallbackLevel = 0;
        consecutiveWorseSamples = 0;
        setConnectionLatencyMs(undefined);
        setConnectionJitterMs(undefined);
        setConnectionLevel(0);
        return;
      }

      if (nextLevel > fallbackLevel) {
        fallbackLevel = nextLevel;
        consecutiveWorseSamples = 0;
        setConnectionLevel(nextLevel);
        return;
      }

      if (nextLevel < fallbackLevel) {
        consecutiveWorseSamples += 1;
        if (consecutiveWorseSamples >= 2) {
          fallbackLevel = nextLevel;
          consecutiveWorseSamples = 0;
          setConnectionLevel(nextLevel);
        }
        return;
      }

      consecutiveWorseSamples = 0;
      setConnectionLevel(nextLevel);
    };

    const onOffline = () => {
      connectionLostRef.current = true;
      fallbackLevel = 0;
      consecutiveFailures = 3;
      pingSamples.length = 0;
      setConnectionLevel(0);
      setToastMsg('İnternet bağlantısı kesildi.');
    };
    const onOnline = () => {
      if (isInRoom()) return;
      consecutiveFailures = 0;
      fallbackLevel = Math.max(getNetworkType(), 1);
      setConnectionLevel(fallbackLevel);
      if (connectionLostRef.current) {
        connectionLostRef.current = false;
      }
    };
    const onConnectionChange = () => {
      if (isInRoom()) return;
      setFallbackLevel(getNetworkType());
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    const conn = (navigator as any).connection;
    if (conn) conn.addEventListener('change', onConnectionChange);

    // Fallback ping — sadece oda dışında
    const pingInterval = setInterval(async () => {
      if (isInRoom() || !navigator.onLine) return;
      const healthUrl = getBackendHealthUrl();
      if (!healthUrl) return;
      const start = Date.now();
      try {
        const response = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error(`Backend health failed: ${response.status}`);
        const rtt = Date.now() - start;
        // Ref'i tekrar kontrol — fetch sırasında odaya girilmiş olabilir
        if (isInRoom()) return;
        consecutiveFailures = 0;
        pingSamples.push(rtt);
        if (pingSamples.length > 5) pingSamples.shift();
        const medianRtt = getMedianRtt();
        const jitter = calculateJitter(pingSamples);
        const level = rttToLevel(medianRtt);
        setConnectionLatencyMs(Math.round(medianRtt));
        setConnectionJitterMs(jitter);
        logger.info('Fallback ping', { rtt, medianRtt, jitter, level });
        setFallbackLevel(level);
        if (connectionLostRef.current) {
          connectionLostRef.current = false;
          setToastMsg(null);
        }
      } catch {
        if (isInRoom()) return;
        consecutiveFailures += 1;
        logger.warn('Fallback ping failed', { consecutiveFailures });
        if (consecutiveFailures >= 3) {
          connectionLostRef.current = true;
          setFallbackLevel(0);
        } else if (consecutiveFailures >= 2) {
          setFallbackLevel(1);
        }
      }
    }, 15000);

    fallbackLevel = getNetworkType();
    setConnectionLevel(fallbackLevel);

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

    withTimeout(getMe(), 8000, 'Oturum kontrolü').then(async ({ user }) => {
      if (!user?.profileId) {
        setStartupMaintenanceMessage(null);
        setView('login-password');
        setIsSessionLoading(false);
        return;
      }

      try {

      const email = user.email || '';
      const profile = user.profile as DbProfile;

      const restoredUser = buildOnlineUser(user.profileId, email, profile);
      if (!restoredUser.avatar) {
        restoredUser.avatar = ((restoredUser.firstName?.[0] || '') + '').toUpperCase() + (restoredUser.age || '');
      }

      setAllUsers((prev) => [...prev.filter((u) => u.id !== user.profileId), restoredUser]);
      setCurrentUser(restoredUser);
      // DB'deki son görülme tercihini localStorage'a sync et
      if (restoredUser.showLastSeen === false) localStorage.setItem('showLastSeen', 'false');
      else localStorage.setItem('showLastSeen', 'true');
      setIsMuted(restoredUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt

      // ── 1. Channels — sunucu seçilince ChatView'dan yüklenecek (server-scoped)
      // Eski global kanal yükleme devre dışı — sunucu izolasyonu için

      // ── 2. Users yükle
      const offlineUsers = await withTimeout(loadOfflineUsers(undefined, knownVersionsRef.current), 8000, 'Kullanıcı listesi yükleme');
      if (offlineUsers.length > 0) {
        setAllUsers((prev) => {
          const prevMap = new Map(prev.map((u) => [u.id, u]));
          return [...prev, ...offlineUsers.filter(u => !prevMap.has(u.id))];
        });
      }

      // ── 3. Channels + users hazır — presence'ı ŞİMDİ başlat
      activatePresence(restoredUser, appVersion, presenceDeps);

      setStartupMaintenanceMessage(null);
      setView('chat');
      setIsSessionLoading(false);

      } catch (err) {
        logger.error('Session restore failed', { error: err instanceof Error ? err.message : err });
        if (await shouldShowStartupMaintenance(err)) {
          setStartupMaintenanceMessage(STARTUP_MAINTENANCE_MESSAGE);
          setView('loading');
        } else {
          setStartupMaintenanceMessage(null);
          setView('login-password');
        }
        setIsSessionLoading(false);
      }
    }).catch(async (err) => {
      logger.error('getMe failed', { error: err instanceof Error ? err.message : err });
      if (await shouldShowStartupMaintenance(err)) {
        setStartupMaintenanceMessage(STARTUP_MAINTENANCE_MESSAGE);
        setView('loading');
      } else {
        setStartupMaintenanceMessage(null);
        setView('login-password');
      }
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
            if (isUuidUser(u.id)) updateUserModeration(u.id, { is_muted: false, mute_expires: null });
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
            if (isUuidUser(u.id)) updateUserModeration(u.id, { is_voice_banned: false, ban_expires: null });
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
  // NOT: React 19 synthetic event stopPropagation'ı native window listener'ı
  // her zaman güvenilir engellemiyor (root delegation race). Menü açmak için
  // tıklanan trigger'lar `data-keep-action-menu` attribute'ü ile opt-out eder;
  // window handler bu attribute'lü target üzerinden clear'ı atlar.
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('[data-keep-action-menu]')) {
        // Trigger'ın kendisi menu'yü AÇMAK için state setliyor — clear'ı atla.
        setContextMenu(null);
        setShowInputSettings(false);
        setShowOutputSettings(false);
        return;
      }
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
        const SYSTEM_ROOM_NAMES = new Set(['Genel', 'Sohbet Muhabbet', 'Oyun', 'Oyun Takımı', 'Yayın', 'Yayın Sahnesi', 'Sessiz', 'Sessiz Alan']);
        const nextChannels = prevChannels.map(channel => {
          if (channel.isSystemChannel) return channel;
          // Kalıcı odalar (kullanıcı toggle ile açtı) auto-delete'ten muaf.
          // Sadece is_default=false AND is_persistent=false olan geçici odalar timer'a girer.
          if (channel.isPersistent) return channel;
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

  // ── Ses odası overlay — ayrı Electron BrowserWindow'a sanitize snapshot ───
  // Electron dışında no-op; toggle kapalıyken IPC durur.
  const overlaySettings = useMemo(() => ({
    enabled: settings.overlayEnabled && (settings.overlayDisplayMode !== 'game-only' || !!detectedGame),
    position: settings.overlayPosition,
    size: settings.overlaySize,
    showOnlySpeaking: settings.overlayShowOnlySpeaking,
    showSelf: settings.overlayShowSelf,
    clickThrough: settings.overlayClickThrough,
    cardOpacity: settings.overlayCardOpacity,
    variant: settings.overlayVariant,
    displayMode: settings.overlayDisplayMode,
  }), [
    settings.overlayEnabled,
    settings.overlayDisplayMode,
    detectedGame,
    settings.overlayPosition,
    settings.overlaySize,
    settings.overlayShowOnlySpeaking,
    settings.overlayShowSelf,
    settings.overlayClickThrough,
    settings.overlayCardOpacity,
    settings.overlayVariant,
  ]);
  const overlaySelfUser = useMemo(() => ({
    id: currentUser.id,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    name: currentUser.name,
    avatar: currentUser.avatar,
  }), [
    currentUser.id,
    currentUser.firstName,
    currentUser.lastName,
    currentUser.name,
    currentUser.avatar,
  ]);
  useOverlaySync({
    settings: overlaySettings,
    themeAccentRgb: overlayThemeAccentRgb,
    currentUserId: currentUser.id,
    activeChannelId: activeChannel,
    activeChannelName: currentChannel?.name ?? null,
    roomMembers: channelMembers,
    speakingLevels,
    selfSpeaking: isPttPressed && !isMuted && !currentUser.isVoiceBanned && !isBroadcastListener,
    selfMuted: isMuted,
    selfDeafened: isDeafened,
    selfUser: overlaySelfUser,
  });

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

  // Ban → voiceDisabledReason senkronizasyonu (presence broadcast tetikler).
  // Ban kalkarsa ve LiveKit canPublish:true ise reason temizlenir.
  useEffect(() => {
    if (currentUser.isVoiceBanned) {
      setVoiceDisabledReason('banned');
    } else if (voiceDisabledReasonRef.current === 'banned') {
      setVoiceDisabledReason(null);
    }
  }, [currentUser.isVoiceBanned]);

  // ── Timeout expire watcher ────────────────────────────────────────────
  // timedOutUntil set iken tam süresi dolunca transition toast'ı fire et ve
  // voiceDisabledReason='timeout'u temizle. Polling yerine setTimeout — tek
  // precise fire; süre değiştikçe effect yeniden kurulur.
  useEffect(() => {
    if (!timedOutUntil) return;
    const remaining = getRemainingMs(timedOutUntil);
    if (remaining === 0) {
      // Zaten geçmiş — hemen temizle, bildirim at.
      setTimedOutUntil(null);
      setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
      setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
      return;
    }
    const t = setTimeout(() => {
      setTimedOutUntil(null);
      setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
      setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
    }, remaining + 50); // +50ms güvenlik payı
    return () => clearTimeout(t);
  }, [timedOutUntil, setToastMsg]);

  // ── Timeout focus re-sync ─────────────────────────────────────────────
  // Kullanıcı app'e geri döndüğünde (sekme/pencere focus) timeout state'i
  // backend ile uyumla. Moderatör erken kaldırmış olabilir; backend broadcast
  // yoksa frontend'i haberdar etmek için window focus tek reliable signal.
  // Throttle: 10sn içinde yeniden çağırma (spam önleme).
  useEffect(() => {
    let lastFetchAt = 0;
    const onFocus = async () => {
      const serverId = activeServerIdRef.current;
      if (!serverId) return;
      const now = Date.now();
      if (now - lastFetchAt < 10_000) return;
      lastFetchAt = now;
      // Yalnız aktif timeout varken re-sync yap — stale state düzeltmek için.
      const hadTimeout = voiceDisabledReasonRef.current === 'timeout' || timedOutUntilRef.current !== null;
      if (!hadTimeout) return;
      try {
        const mod = await getMyModerationState(serverId);
        const rem = mod.timedOutUntil ? getRemainingMs(mod.timedOutUntil) : 0;
        if (rem === 0 || !mod.timedOutUntil) {
          // Early clear — stale state'i düzelt + transition toast.
          setTimedOutUntil(null);
          setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
          setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
        } else if (mod.timedOutUntil !== timedOutUntilRef.current) {
          // Süre değişmişse state'i güncelle (moderator süre uzatmış olabilir).
          setTimedOutUntil(mod.timedOutUntil);
        }
      } catch { /* silent */ }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [setToastMsg]);

  useEffect(() => {
    if (!activeChannel || isConnecting) return;
    playSound(isPttPressed ? 'ptt-on' : 'ptt-off');
  }, [isPttPressed]);

  // ── LiveKit PTT: enable/disable mic based on PTT state ───────────────────
  // Guard: voiceDisabledReason !== null → mic ZORLA kapalı, kullanıcı UI hacklese
  // bile setMicrophoneEnabled(true) çağrılmaz. Server-side canPublish:false zaten
  // double-guarantee veriyor; bu local guard kullanıcı UX'ini doğru tutar
  // (volume meter, isPttPressed sound efektleri vs. tetiklenmez).
  useEffect(() => {
    const room = livekitRoomRef.current;
    if (!room) {
      micGuardRoomRef.current = null;
      lastRequestedMicEnabledRef.current = null;
      return;
    }
    if (micGuardRoomRef.current !== room) {
      micGuardRoomRef.current = room;
      lastRequestedMicEnabledRef.current = null;
    }
    const canSpeak = isPttPressed
      && !isMuted
      && !currentUser.isVoiceBanned
      && !isBroadcastListener
      && !isVoiceBlocked;
    if (lastRequestedMicEnabledRef.current === canSpeak) return;
    lastRequestedMicEnabledRef.current = canSpeak;
    room.localParticipant.setMicrophoneEnabled(
      canSpeak,
      buildAudioCaptureOptions({
        noiseSuppression: isNoiseSuppressionEnabled,
        autoGainControl: true,
        deviceId: selectedInput,
      }),
    ).then(() => {
      if (canSpeak) {
        void applyNoisePipeline({
          enabled: isNoiseSuppressionEnabled,
          strength: noiseSuppressionStrength,
          deviceId: selectedInput,
        });
      }
    }).catch(err => {
      lastRequestedMicEnabledRef.current = null;
      console.warn('Mikrofon durumu güncellenemedi:', err);
    });
  }, [isPttPressed, isMuted, currentUser.isVoiceBanned, isNoiseSuppressionEnabled, selectedInput, activeChannel, isConnecting, isVoiceBlocked, applyNoisePipeline]);

  // ── Voice pipeline guard: reason set olunca mic'i ZORLA kapat ──────────
  // PTT effect zaten isVoiceBlocked'ı dep alıyor; bu effect ek güvenlik
  // katmanı: reason herhangi bir sebeple non-null olursa anında mic kapat.
  // Race condition / late event durumlarında stuck "konuşuyor" hâlini önler.
  useEffect(() => {
    if (!isVoiceBlocked) return;
    const room = livekitRoomRef.current;
    if (!room) return;
    lastRequestedMicEnabledRef.current = false;
    room.localParticipant.setMicrophoneEnabled(false).catch(err => {
      lastRequestedMicEnabledRef.current = null;
      console.warn('Voice guard: mic force-disable failed:', err);
    });
  }, [isVoiceBlocked]);

  // ── RNNoise strength live update — slider değişince worklet'e postla ──
  useEffect(() => {
    updateNoiseStrength(noiseSuppressionStrength);
  }, [noiseSuppressionStrength, updateNoiseStrength]);

  useEffect(() => {
    void applyNoisePipeline({
      enabled: isNoiseSuppressionEnabled,
      strength: noiseSuppressionStrength,
      deviceId: selectedInput,
    });
  }, [isNoiseSuppressionEnabled, selectedInput, applyNoisePipeline]);

  // ── Deafen transition: pause/play SADECE isDeafened değişiminde ──
  // allUsers/userVolumes dep'lerine bağlanırsa her user update'inde play() spam olur →
  // autoplay policy log'u ve gereksiz reflow. Transition-only effect ile ayrıştırıldı.
  useEffect(() => {
    document.querySelectorAll<HTMLAudioElement>('[data-livekit-audio]').forEach(el => {
      el.muted = isDeafened;
      if (isDeafened) {
        el.volume = 0;
        try { el.pause(); } catch { /* no-op */ }
      } else {
        const userId = el.dataset.mayvoxUserId;
        if (userId) applyVolumeToAudioElement(el, userId);
        else el.volume = 1;
        // play() autoplay policy ilk gesture'dan önce reddedebilir — LiveKit zaten autoplay yapar.
        void el.play().catch(() => { /* safe — LiveKit attach tekrar tetikler */ });
      }
    });
  }, [isDeafened]);

  // ── Deafen + per-user volume restore: LiveKit track gain node ──
  // Her user/volume update'inde re-run — setVolume() idempotent ve ucuz (Web Audio gain param).
  useEffect(() => {
    const room = livekitRoomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach(participant => {
      participant.trackPublications.forEach(pub => {
        const track = pub.track as { setVolume?: (v: number) => void; kind?: string } | undefined;
        if (!track || typeof track.setVolume !== 'function') return;
        if (isDeafened) {
          track.setVolume(0);
        } else {
          const user = resolveUserByMemberKey<User>(participant.identity, allUsers);
          const savedPct = user ? userVolumes[user.id] : undefined;
          const vol = savedPct !== undefined ? Math.max(0, Math.min(1, savedPct / 100)) : 1;
          track.setVolume(vol);
        }
      });
    });
  }, [isDeafened, allUsers, userVolumes, livekitRoomRef]);

  // ── Output device routing: selectedOutput değişince runtime'da sink'i değiştir ──
  // Üç katman paralel uygulanır:
  //   1. AudioContext registry → SoundManager/sounds/notificationSound tümü seçili
  //      cihaza route olur (MP3 + oscillator bildirim/çağrı sesleri için KRİTİK —
  //      aksi halde Web Audio destination sistem default output'una gidiyordu).
  //   2. LiveKit Room.switchActiveDevice('audiooutput') — voice akışı.
  //   3. Tüm [data-livekit-audio] elementlere HTMLAudioElement.setSinkId — voice belt-and-suspenders.
  // Deafen sırasında sink'e dokunmuyoruz — zaten mute/pause/volume 0 ile sessiz.
  useEffect(() => {
    if (!selectedOutput) return;
    // 1. Managed AudioContext registry'ye broadcast
    setAudioOutputDevice(selectedOutput);

    const room = livekitRoomRef.current;
    if (room) {
      // 2. LiveKit v2 API — webAudioMix modunda Web Audio destination'ını da günceller.
      room.switchActiveDevice('audiooutput', selectedOutput).catch(err => {
        console.warn('[audio] switchActiveDevice audiooutput failed:', err);
      });
    }
    // 3. Tüm mevcut LiveKit audio element'lere sinkId uygula (setSinkId destekliyorsa).
    document.querySelectorAll<HTMLAudioElement>('[data-livekit-audio]').forEach(el => {
      const sinkEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof sinkEl.setSinkId === 'function') {
        sinkEl.setSinkId(selectedOutput).catch((err: unknown) => {
          console.warn('[audio] setSinkId failed:', err);
        });
      }
    });
  }, [selectedOutput, activeChannel, livekitRoomRef]);

  // ── Auto-leave on idle: kullanıcı belirli süre pasif kalırsa kanaldan çıkar ──
  // Mimari:
  //   - sharedLastActivityRef: DOM + PTT + voice activity kaynaklı son aktivite zamanı
  //   - countdownRef: 60sn'lik geri sayım state machine (start/cancel + epoch guard)
  //   - interval: her 1sn'de elapsed >= thresholdMs - COUNTDOWN_SECONDS*1000 ise
  //     startCountdown, tekrar aktivite geldiğinde cancelCountdown
  const COUNTDOWN_SECONDS = 60;
  const lastJoinRef = useRef(0);

  type CountdownState = {
    active: boolean;
    timeoutId: ReturnType<typeof setTimeout> | null;
    disconnectAt: number;
    sessionEpoch: number;
  };
  const countdownRef = useRef<CountdownState>({
    active: false,
    timeoutId: null,
    disconnectAt: 0,
    sessionEpoch: 0,
  });
  // DesktopDock banner'ın dock butonlarının yerini almasını tetiklemek için
  // active state'i React state'e de kopyalıyoruz (ref sadece re-render etmez).
  const [countdownActive, setCountdownActive] = useState(false);

  const performAutoLeave = useCallback(() => {
    setActiveChannel(null);
    activeChannelRef.current = null;
    disconnectFromLiveKit().then(() => {
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
  }, [disconnectFromLiveKit, setActiveChannel, setAllUsers, setCurrentUser, setToastMsg, presenceChannelRef]);

  const cancelCountdown = useCallback(() => {
    const s = countdownRef.current;
    if (s.timeoutId) clearTimeout(s.timeoutId);
    countdownRef.current = { active: false, timeoutId: null, disconnectAt: 0, sessionEpoch: 0 };
    setCountdownActive(false);
  }, []);

  const startCountdown = useCallback((durationMs: number) => {
    // Hard guard: zaten aktifse yeniden başlatma (refresh'i engeller).
    if (countdownRef.current.active) return;
    const epoch = sessionEpochRef.current;
    const timeoutId = setTimeout(() => {
      // Ghost protection: oturum değiştiyse (reconnect veya yeni kanal join)
      // eski timeout'u yok say.
      if (countdownRef.current.sessionEpoch !== sessionEpochRef.current) return;
      if (!countdownRef.current.active) return;
      countdownRef.current = { active: false, timeoutId: null, disconnectAt: 0, sessionEpoch: 0 };
      setCountdownActive(false);
      performAutoLeave();
    }, durationMs);
    countdownRef.current = {
      active: true,
      timeoutId,
      disconnectAt: Date.now() + durationMs,
      sessionEpoch: epoch,
    };
    setCountdownActive(true);
  }, [performAutoLeave]);

  // "Buradayım" butonu için — activity reset + countdown cancel.
  const dismissIdleCountdown = useCallback(() => {
    recordActivityImmediate();
    cancelCountdown();
  }, [recordActivityImmediate, cancelCountdown]);

  // Auto-leave OFF → ON toggle'ında lastActivity reset: "Ben buradayım, takip
  // etmeye başla" semantiği. Anında countdown başlamaz.
  const prevAutoLeaveEnabledRef = useRef(autoLeaveEnabled);
  useEffect(() => {
    if (autoLeaveEnabled && !prevAutoLeaveEnabledRef.current) {
      recordActivityImmediate();
      cancelCountdown();
    }
    prevAutoLeaveEnabledRef.current = autoLeaveEnabled;
  }, [autoLeaveEnabled, recordActivityImmediate, cancelCountdown]);

  // Kanal veya ayar değiştiğinde interval'ı yeniden kur
  useEffect(() => {
    if (!autoLeaveEnabled || !activeChannel) {
      cancelCountdown();
      return;
    }

    // Kanal değiştiğinde activity sıfırla
    recordActivityImmediate();

    const thresholdMs = autoLeaveMinutes * 60 * 1000;
    const countdownTriggerMs = Math.max(0, thresholdMs - COUNTDOWN_SECONDS * 1000);

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - sharedLastActivityRef.current;

      if (elapsed >= countdownTriggerMs) {
        // Countdown başlamadıysa başlat; aktivite geldiyse zaten
        // recordActivityImmediate → cancelCountdown zinciri gerekiyor.
        if (!countdownRef.current.active) {
          const remaining = thresholdMs - elapsed;
          // Tab uyuması / clock jump sonrası elapsed zaten threshold'u geçmişse
          // banner'ı 0 saniye gösterip flash etme — doğrudan auto-leave.
          if (remaining <= 0) {
            performAutoLeave();
          } else {
            startCountdown(remaining);
          }
        }
      } else if (countdownRef.current.active) {
        // Aktivite countdown başladıktan sonra elapsed'i düşürdü → iptal.
        cancelCountdown();
      }
    }, 1_000);

    return () => {
      clearInterval(checkInterval);
      cancelCountdown();
    };
  }, [autoLeaveEnabled, autoLeaveMinutes, activeChannel, cancelCountdown, performAutoLeave, recordActivityImmediate, sharedLastActivityRef, startCountdown]);

  // ── activeChannel non-null transition: session epoch bump ───────────────
  // Kanala her giriş (yeni kanal veya tekrar aynı kanal) yeni bir oturumdur;
  // önceki oturumdan kalan countdown timeout'ları geçersiz kılınmalı.
  const prevActiveChannelRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveChannelRef.current;
    if (activeChannel && activeChannel !== prev) {
      bumpEpoch();
    }
    prevActiveChannelRef.current = activeChannel;
  }, [activeChannel, bumpEpoch]);

  // ── Kanaldan çıkılınca (activeChannel null) kullanıcıyı tüm kanallardan temizle ──
  // NOT: Kanala GİRİŞ için optimistic ekleme handleJoinChannel içinde yapılır;
  //      gerçek liste updateMembers() tarafından yazılır. Bu effect sadece çıkışı işler.
  useEffect(() => {
    if (activeChannel !== null) return;
    const user = currentUserRef.current;
    const selfKeys = new Set([user.id, user.name].filter(Boolean));
    if (selfKeys.size === 0) return;
    setChannels(prev => prev.map(c => {
      const currentMembers = c.members || [];
      const members = currentMembers.filter(m => m && !selfKeys.has(m));
      if (members.length === currentMembers.length) return c;
      return { ...c, members, userCount: members.length };
    }));
  }, [activeChannel]);

  // ── Helper functions ──────────────────────────────────────────────────────
  const getAvatarText = (user: User) => {
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
    return `${initials}${user.age || ''}`;
  };

  const getStatusColor = (statusText: string) => {
    if (statusText === 'Online' || statusText === 'Aktif') return 'text-emerald-400';
    if (statusText === 'Dinliyor') return 'text-orange-500';
    if (statusText === 'Sessiz') return 'text-[var(--theme-secondary-text)]';
    if (statusText === 'AFK') return 'text-violet-400';
    if (statusText === 'Pasif') return 'text-yellow-500';
    if (statusText === 'Duymuyor' || statusText === 'Rahatsız Etmeyin') return 'text-red-400';
    if (statusText === 'Çevrimdışı') return 'text-[var(--theme-secondary-text)]/60';
    return 'text-blue-500';
  };

  const getEffectiveStatus = () => {
    // Legacy 'Aktif' değerleri de 'Online' gibi davransın — DB'den eski saklı
    // değerler geldiğinde.
    const st = currentUser.statusText;
    const isOnline = st === 'Online' || st === 'Aktif' || !st;
    if (!isOnline) return st!;
    // Auto-presence durumu — state'ten oku ki UI her değişimde re-render olsun
    if (autoStatus === 'deafened') return 'Duymuyor';
    if (autoStatus === 'idle') return 'Pasif';
    if (isDeafened) return 'Sessiz';
    if (isMuted) return 'Dinliyor';
    return 'Online';
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}s ${mins.toString().padStart(2, '0')}d`;
    }
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
    const INVITE_CODE_TTL_SEC = 24 * 60 * 60; // 24 saat — tek kullanımlık (DB'de used flag)
    const expiresAt = Date.now() + INVITE_CODE_TTL_SEC * 1000;
    await saveInviteCode(code, expiresAt);
    setGeneratedCode(code);
    setTimeLeft(INVITE_CODE_TTL_SEC);
  };

  // ── Join helpers ──────────────────────────────────────────────────────────
  // Extracted to avoid duplicating the optimistic join + connect + rollback logic
  const performJoin = async (channelId: string, channelName: string) => {
    // Client-side join throttle — 2sn cooldown
    if (Date.now() - lastJoinRef.current < 2000) return;
    lastJoinRef.current = Date.now();
    const joinTrace = createVoiceJoinTrace(channelId);
    logVoiceJoinTrace(joinTrace, 'click', { t: 0 });
    logger.info('Room join', { channelId, channelName, userId: currentUser.id });
    // AFK veya manuel Çevrimdışı durumundaysa kanala girince Online'a dön
    if (currentUser.statusText === 'AFK' || currentUser.statusText === 'Çevrimdışı') {
      const activeUser = { ...currentUser, statusText: 'Online' };
      setCurrentUser(activeUser);
      setAllUsers(prev => prev.map(u => u.id === activeUser.id ? activeUser : u));
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'moderation',
        payload: { userId: activeUser.id, updates: { statusText: 'Online' } },
      });
    }
    const now = Date.now();
    const myId = currentUser.id;
    const selfKeys = new Set([currentUser.id, currentUser.name].filter(Boolean));
    setActiveChannel(channelId);
    // Ref'i hemen güncelle — React render'ı beklemeden.
    // channel-update handler'ı activeChannelRef'i okur; stale kalırsa
    // incoming broadcast'ler kullanıcıyı yanlış kanala ekleyebilir.
    activeChannelRef.current = channelId;
    setIsConnecting(true);
    setChannels(prev => prev.map(c => {
      const members = (c.members || []).filter(m => m && !selfKeys.has(m));
      if (c.id === channelId) {
        const nextMembers = members.includes(myId) ? members : [...members, myId];
        return { ...c, members: nextMembers, userCount: nextMembers.length };
      }
      return { ...c, members, userCount: members.length };
    }));
    logVoiceJoinTrace(joinTrace, 'optimistic-ui');
    setCurrentUser(prev => ({ ...prev, joinedAt: now }));
    setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: now } : u));

    // Muted-join race guard + timeout join-block: Fresh token 'canPublish:true' ile
    // geliyor; LiveKit server connect sonrası ~100-400ms içinde permission push ediyor.
    // Bu pencerede kullanıcı konuşabiliyordu. Connect ÖNCE backend'den moderation state'i
    // çek → muted/timedOut ise voiceDisabledReason pre-set. Timeout aktifse join'i
    // tamamen iptal et — kullanıcı odaya hiç girmesin, anlamlı toast ver.
    // Silent-fail: backend hata verirse connect'i bloklama, mevcut LiveKit event path'i
    // yine reason'u doğru set edecek.
    const serverId = activeServerIdRef.current;
    if (serverId) {
      try {
        const mod = await getMyModerationState(serverId);
        const timeoutRemaining = mod.timedOutUntil ? getRemainingMs(mod.timedOutUntil) : 0;

        if (timeoutRemaining > 0 && mod.timedOutUntil) {
          // Aktif timeout — join'i tamamen iptal et, state rollback.
          setTimedOutUntil(mod.timedOutUntil);
          setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'timeout'));
          const remStr = formatRemaining(timeoutRemaining);
          setToastMsg(remStr
            ? `Zamanaşımı nedeniyle bu odaya giremezsiniz — kalan süre: ${remStr}`
            : 'Zamanaşımı nedeniyle bu odaya giremezsiniz');
          // Optimistic join state'ini rollback et — connectToLiveKit'e hiç gitme.
          setActiveChannel(null);
          activeChannelRef.current = null;
          setIsConnecting(false);
          setChannels(prev => prev.map(c => {
            const members = (c.members || []).filter(m => m && !selfKeys.has(m));
            return { ...c, members, userCount: members.length };
          }));
          setCurrentUser(prev => ({ ...prev, joinedAt: undefined }));
          setAllUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, joinedAt: undefined } : u));
          return;
        }

        // Timeout yok — sadece pre-set yap (mute varsa), timedOutUntil'i sıfırla.
        if (mod.isVoiceMuted) {
          setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'server_muted'));
        }
        // Early-clear detection: frontend timeout state'ı dolu ama backend null dönüyor →
        // moderator cezayı erken kaldırmış. Stale reason/state'i temizle, transition toast at.
        const hadTimeout = voiceDisabledReasonRef.current === 'timeout' || timedOutUntilRef.current !== null;
        if (hadTimeout && (timeoutRemaining === 0 || !mod.timedOutUntil)) {
          setTimedOutUntil(null);
          setVoiceDisabledReason(prev => (prev === 'timeout' ? null : prev));
          setToastMsg('Zamanaşımı cezanız kaldırıldı — tekrar konuşabilir ve sohbet odalarına girebilirsiniz.');
        }
        // Chat ban state senkronu — voice'u etkilemez, sadece mesaj guard'ı için.
        if (mod.chatBannedUntil !== chatBannedUntilRef.current) {
          setChatBannedUntil(mod.chatBannedUntil);
        }
        if (mod.isChatBanned !== isChatBannedRef.current) {
          setIsChatBanned(mod.isChatBanned);
        }
      } catch (err) {
        // Pre-check başarısız — LiveKit permission event'ine güven (daha geç ama çalışır).
        console.warn('[join] moderation state pre-check failed:', err);
      }
    }

    const connected = await connectToLiveKit(channelId, joinTrace);
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
    // Her tıklamada navigasyon: settings'ten dön + discover varsa kapat.
    if (view === 'settings') setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:goto-chat'));

    const channel = channels.find(c => c.id === id);
    if (!channel) return;

    // Aynı odadaysak sadece görünüm chat'e döner; tekrar join akışı tetiklenmez.
    if (activeChannel === id) return;

    // Restricted mode: sunucu sistem tarafından kısıtlandıysa oda/sesli bağlantı reddedilir.
    // Sunucu görünümü açık kalır; sadece aktif eylemler bloklanır.
    if (accessContext?.isBanned) {
      setToastMsg('Bu sunucu sistem yönetimi tarafından kısıtlandı. Odalara giriş kapalı.');
      return;
    }

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

  const openCommandSettings = useCallback((target: import('./contexts/UIContext').SettingsTarget, highlightId?: string) => {
    setSettingsTarget(target);
    setView('settings');
    if (highlightId) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mayvox:highlight-setting', { detail: { id: highlightId } }));
      }, 180);
    }
  }, []);

  const openCommandDm = useCallback((userId: string) => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:open-dm', { detail: { userId } }));
  }, []);

  const openCommandUserProfile = useCallback((userId: string) => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:open-user-profile', { detail: { userId } }));
  }, []);

  const inviteCommandUserToRoom = useCallback((userId: string) => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:invite-user-to-room', { detail: { userId } }));
  }, []);

  const openCommandUserSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mayvox:focus-user-search'));
  }, []);

  const openCommandMessages = useCallback((settingsPanel = false) => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:open-messages', { detail: { settings: settingsPanel } }));
  }, []);

  const openCommandLegal = useCallback((kind: 'kvkk' | 'storage' | 'terms') => {
    setView('settings');
    setSettingsTarget('account');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mayvox:open-legal', { detail: { kind } }));
    }, 120);
  }, [setSettingsTarget]);

  const openCommandAdmin = useCallback((target: 'users' | 'servers' | 'invite-codes' | 'invite-requests' | 'user-filters' | 'user-search' = 'users') => {
    setView('settings');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mayvox:open-admin', { detail: { target } }));
    }, 120);
  }, []);

  const openCommandDiscover = useCallback(() => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:open-discover'));
  }, []);

  const createCommandRoom = useCallback(() => {
    setView('chat');
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
  }, []);

  const openCommandInputSettings = useCallback(() => {
    setView('chat');
    setShowInputSettings(true);
    setShowOutputSettings(false);
  }, [setShowInputSettings, setShowOutputSettings]);

  const openCommandOutputSettings = useCallback(() => {
    setView('chat');
    setShowOutputSettings(true);
    setShowInputSettings(false);
  }, [setShowInputSettings, setShowOutputSettings]);

  const openCommandServerSettings = useCallback((highlightId?: string, tab?: string) => {
    setView('chat');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mayvox:open-server-settings', { detail: { highlightId, tab } }));
    }, 0);
  }, []);

  const createCommandAnnouncement = useCallback((type: 'announcement' | 'event') => {
    setView('chat');
    window.dispatchEvent(new CustomEvent('mayvox:create-announcement', { detail: { type } }));
  }, []);

  const toggleCommandDeafen = useCallback(() => {
    setIsDeafened(!isDeafenedRef.current);
  }, []);

  const toggleCommandMute = useCallback(() => {
    if (voiceDisabledReason) {
      setToastMsg(
        voiceDisabledReason === 'server_muted' ? 'Bu sunucuda susturuldunuz'
        : voiceDisabledReason === 'timeout' ? 'Zamanaşımı aktif'
        : voiceDisabledReason === 'kicked' ? 'Bu odadan çıkarıldınız'
        : voiceDisabledReason === 'banned' ? 'Sunucuya erişiminiz kaldırıldı'
        : 'Mikrofon şu anda kullanılamıyor',
      );
      return;
    }
    if (isBroadcastListener) {
      setToastMsg('Bu odada yalnızca konuşmacılar yayın yapabilir.');
      return;
    }
    if (currentUser.isMuted) return;
    if (isMuted && isDeafenedRef.current) setIsDeafened(false);
    setIsMuted(!isMuted);
  }, [currentUser.isMuted, isBroadcastListener, isMuted, setToastMsg, voiceDisabledReason]);

  const [appShortcuts, setAppShortcuts] = useState<AppShortcuts>(() => readAppShortcuts());
  useEffect(() => {
    const onChanged = () => setAppShortcuts(readAppShortcuts());
    window.addEventListener('mayvox:app-shortcuts-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('mayvox:app-shortcuts-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (commandPaletteOpen) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, [contenteditable="true"]');
      if (typing) return;

      if (shortcutMatchesEvent(appShortcuts['toggle-mute'], event)) {
        event.preventDefault();
        toggleCommandMute();
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['toggle-deafen'], event)) {
        event.preventDefault();
        toggleCommandDeafen();
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['user-search'], event)) {
        event.preventDefault();
        openCommandUserSearch();
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-server-settings'], event)) {
        if (!activeServerId || !(
          accessContext?.flags.canManageServer ||
          accessContext?.flags.canKickMembers ||
          accessContext?.flags.canCreateInvite ||
          accessContext?.flags.canRevokeInvite ||
          accessContext?.flags.canViewInsights
        )) return;
        event.preventDefault();
        openCommandServerSettings();
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-admin'], event)) {
        if (!currentUser.isAdmin && !currentUser.isPrimaryAdmin) return;
        event.preventDefault();
        openCommandAdmin('users');
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['toggle-room'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['toggle-room-chat-muted'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room-chat-muted' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['toggle-room-members'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'toggle-room-members' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-discover'], event)) {
        event.preventDefault();
        openCommandDiscover();
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-server-home'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'open-server-home' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['previous-server'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'previous-server' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['next-server'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'next-server' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['previous-room'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'previous-room' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['next-room'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'next-room' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-unread-dm'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'open-unread-dm' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['close-dm'], event)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('mayvox:shortcut-action', { detail: { action: 'close-dm' } }));
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-settings'], event)) {
        event.preventDefault();
        openCommandSettings('app');
        return;
      }
      if (shortcutMatchesEvent(appShortcuts['open-shortcuts'], event)) {
        event.preventDefault();
        openCommandSettings('shortcuts');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [accessContext, activeServerId, appShortcuts, commandPaletteOpen, currentUser.isAdmin, currentUser.isPrimaryAdmin, openCommandAdmin, openCommandDiscover, openCommandServerSettings, openCommandSettings, openCommandUserSearch, toggleCommandDeafen, toggleCommandMute]);

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

    const { user } = await authLogin(nick, password);
    const userId = user.profileId;
    const email = user.email || nick;
    const profile = user.profile as DbProfile;

    const loggedInUser = buildOnlineUser(userId, email, profile);
    if (!loggedInUser.avatar) loggedInUser.avatar = getAvatarText(loggedInUser);

    sessionStartedAtRef.current = Date.now();
    setCurrentUser(loggedInUser);
    setIsMuted(loggedInUser.isMuted ?? false); // DB'deki susturma durumunu UI state'e yansıt
    // Avatar çerçeve rengini DB'den localStorage'a sync et
    if (loggedInUser.avatarBorderColor !== undefined) {
      localStorage.setItem('avatarBorderColor', loggedInUser.avatarBorderColor || '');
      settings.setAvatarBorderColor?.(loggedInUser.avatarBorderColor || '');
    }

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

  const handleLogout = async () => {
    logger.info('Logout', { userId: currentUser.id, name: currentUser.name });
    if (currentUser.id) {
      const sessionMins = Math.floor((Date.now() - sessionStartedAtRef.current) / 60000);
      const newTotal = (currentUser.totalUsageMinutes || 0) + sessionMins;
      await updateActivityOnLogout(currentUser.id, newTotal).catch(() => {});
    }
    setActiveChannel(null);
    activeChannelRef.current = null;
    await disconnectFromLiveKit();
    stopPresence();
    disconnectChat();
    authLogout();
    setView('login-password');
    setPasswordResetRequests([]);
    setInviteRequests([]);
  };

  // ── Presence track — tek merkez, tek payload, burst coalesce ──────────────
  // WS presence:patch her değişimde (mute/deafen/oda/sunucu/versiyon)
  // tam payload'u yeniden basar. Aynı commit'te birden fazla dep değişirse
  // 50ms micro-debounce ile tek patch paketinde birleşir.
  const trackPresence = useCallback(() => {
    if (!currentUser.id) return;
    sendPresencePatch({
      appVersion,
      selfMuted: isMuted,
      selfDeafened: isDeafened,
      currentRoom: activeChannel || null,
      serverId: activeServerId || undefined,
      autoStatus: autoStatusRef.current,
      // SABİT session bilgileri — track() replace yaptığı için her çağrıda gerekli.
      onlineSince: onlineSinceRef.current,
      platform: platformRef.current,
      // Manuel statusText presence'ta taşınır (Çevrimdışı/Rahatsız Etmeyin/AFK).
      statusText: currentUser.statusText || 'Online',
      // Otomatik oyun algılama — yalnız toggle açıksa + whitelist eşleşmesi varsa.
      // Kapalıyken undefined → presence payload'ta alan gitmez (backward-compat).
      gameActivity: settings.gameActivityEnabled ? (currentUser.gameActivity || null) : null,
    });
  }, [currentUser.id, currentUser.statusText, currentUser.gameActivity, appVersion, isMuted, isDeafened, activeChannel, activeServerId, settings.gameActivityEnabled, onlineSinceRef, platformRef]);

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

  // ── Pencere kapanırken kullanım süresi kaydet
  // NOT: last_seen_at artık backend tarafından yazılıyor (WS close → handleDisconnect).
  useEffect(() => {
    const handleBeforeUnload = () => {
      const u = currentUserRef.current;
      if (!u.id) return;
      const sessionMins = Math.floor((Date.now() - sessionStartedAtRef.current) / 60000);
      const newTotal = (u.totalUsageMinutes || 0) + sessionMins;
      updateActivityOnLogout(u.id, newTotal).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
    if (isCompletingRegistration) return;
    setIsCompletingRegistration(true);
    setLoginError(null);

    try {
      if (!displayName || !publicDisplayName || !firstName || !lastName || !age) {
        setLoginError('Lütfen tüm bilgileri eksiksiz giriniz!');
        return;
      }

      const username = displayName.trim();
      const publicName = publicDisplayName.trim().replace(/\s+/g, ' ');
      if (!/^[a-z0-9]{1,10}$/.test(username)) {
        setLoginError('Kullanıcı adı sadece harf ve sayı olabilir.');
        return;
      }

      if (publicName.length < 2 || publicName.length > 24) {
        setLoginError('Takma ad 2-24 karakter olmalıdır.');
        return;
      }

      if (/[\p{C}]/u.test(publicName)) {
        setLoginError('Takma ad geçersiz karakter içeriyor.');
        return;
      }

      if (!/^\p{L}+( \p{L}+)?$/u.test(firstName) || firstName.length > 15) {
        setLoginError('Adınızı doğru giriniz.');
        return;
      }

      if (!/^\p{L}+$/u.test(lastName) || lastName.length > 15) {
        setLoginError('Soyadınızı doğru giriniz.');
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

      const { data: existingProfile, error: profileLookupError } = await getProfileByUsername(username);
      if (profileLookupError) {
        setLoginError(profileLookupError.message || 'Kullanıcı adı kontrol edilemedi.');
        return;
      }
      if (existingProfile) {
        setLoginError('Bu kullanıcı adı alınmış.');
        return;
      }

      const pendingCode = pendingInviteCodeRef.current;
      if (pendingCode) {
        const stillValid = await verifyInviteCodeForEmail(pendingCode, loginNick);
        if (!stillValid) {
          setLoginError('Davet kodu geçersiz, süresi dolmuş veya daha önce kullanılmış.');
          return;
        }
      }

      const normalizedFirst = toTitleCaseTr(firstName);
      const normalizedLast = toTitleCaseTr(lastName);
      const avatarText = ((normalizedFirst[0] || '') + ageNum).toUpperCase();
      const { user: registeredUser } = await authRegister({
        email: loginNick,
        username,
        password: loginPassword,
        displayName: publicName,
        firstName: normalizedFirst,
        lastName: normalizedLast,
        age: ageNum,
        avatar: avatarText,
      });

      if (pendingCode) {
        const used = await useInviteCodeForEmail(pendingCode, loginNick);
        if (!used) console.warn('[registration] Kullanıcı oluşturuldu ama davet kodu kullanıldı olarak işaretlenemedi.');
        pendingInviteCodeRef.current = null;
      }

      const newUser: User = {
        id: registeredUser.profileId,
        name: username,
        displayName: publicName,
        email: loginNick,
        firstName: normalizedFirst,
        lastName: normalizedLast,
        age: ageNum,
        avatar: '',
        status: 'online',
        statusText: 'Online',
        isAdmin: false,
        isPrimaryAdmin: false,
        allowNonFriendDms: true,
        dmPrivacyMode: 'everyone',
        showDmReadReceipts: true,
      };

      newUser.avatar = registeredUser.profile.avatar || getAvatarText(newUser);

      sessionStartedAtRef.current = Date.now();
      setCurrentUser(newUser);

      await initPostAuth(newUser);
      setView('chat');
      setLoginNick('');
      setLoginPassword('');
      setDisplayName('');
      setPublicDisplayName('');
      setFirstName('');
      setLastName('');
      setAge('');
      setGeneratedCode(null);
      setLoginError(null);
    } catch (err) {
      console.error('[registration] complete failed', err);
      setLoginError(err instanceof Error ? err.message : 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsCompletingRegistration(false);
    }
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
    settingsTarget,
    setSettingsTarget,
  };

  const settingsContextValue: SettingsContextType = {
    ...settings,
    // showLastSeen'in DB sync wrapper'ı — hook'taki setShowLastSeenLocal yerine
    showLastSeen: settings.showLastSeen,
    setShowLastSeen,
    // Oyun algılama toggle — localStorage-only, DB sync yok (privacy: local pref).
    gameActivityEnabled: settings.gameActivityEnabled,
    setGameActivityEnabled: settings.setGameActivityEnabled,
    // Ses overlay — localStorage-only local preferences
    overlayEnabled: settings.overlayEnabled,
    setOverlayEnabled: settings.setOverlayEnabled,
    overlayPosition: settings.overlayPosition,
    setOverlayPosition: settings.setOverlayPosition,
    overlaySize: settings.overlaySize,
    setOverlaySize: settings.setOverlaySize,
    overlayShowOnlySpeaking: settings.overlayShowOnlySpeaking,
    setOverlayShowOnlySpeaking: settings.setOverlayShowOnlySpeaking,
    overlayShowSelf: settings.overlayShowSelf,
    setOverlayShowSelf: settings.setOverlayShowSelf,
    overlayClickThrough: settings.overlayClickThrough,
    setOverlayClickThrough: settings.setOverlayClickThrough,
    overlayDisplayMode: settings.overlayDisplayMode,
    setOverlayDisplayMode: settings.setOverlayDisplayMode,
  };

  const appStateValue: AppStateContextType = {
    view,
    setView,
    isMuted,
    setIsMuted,
    isDeafened,
    setIsDeafened,
    voiceDisabledReason,
    timedOutUntil,
    chatBannedUntil,
    isChatBanned,
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
    countdownRef,
    countdownActive,
    dismissIdleCountdown,
    handleCopyCode,
    handleUpdateUserVolume,
    handleUserActionClick,
    handleInviteUser,
    handleCancelInvite,
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
    handleSetServerCreationPlan,
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
    handleDeleteInviteRequest: adminPanel.handleDeleteInviteRequest,
    inviteCooldowns,
    inviteStatuses,
  };

  const audioValue: AudioContextType = useMemo(() => ({
    volumeLevel,
    setVolumeLevel: () => {},
    isPttPressed,
    setIsPttPressed: setPttPressed,
    connectionLevel,
    setConnectionLevel,
    connectionLatencyMs,
    connectionJitterMs,
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
    mobileVoiceModeOverride,
    setMobileVoiceModeOverride,
  }), [
    volumeLevel,
    isPttPressed,
    connectionLevel,
    connectionLatencyMs,
    connectionJitterMs,
    selectedInput,
    selectedOutput,
    inputDevices,
    outputDevices,
    showInputSettings,
    showOutputSettings,
    speakingLevels,
    mobileVoiceModeOverride,
    setPttPressed,
    setSelectedInput,
    setSelectedOutput,
    setShowInputSettings,
    setShowOutputSettings,
    setMobileVoiceModeOverride,
  ]);

  return (
    <AppErrorBoundary>
    <ConfirmProvider>
    <SettingsCtx.Provider value={settingsContextValue}>
      <UserContext.Provider value={userContextValue}>
        <FavoriteFriendsProvider currentUserId={currentUser.id || undefined}>
        <ChannelContext.Provider value={channelContextValue}>
          <UIContext.Provider value={uiContextValue}>
            <AppStateContext.Provider value={appStateValue}>
              <AudioCtx.Provider value={audioValue}>
                <div
                  className={`font-sans selection:bg-blue-500/30 mv-app-shell ${view === 'login-password' || view === 'login-code' || view === 'register-details' ? 'mv-auth-shell' : ''}`}
                  data-ui-density={settings.uiDensity}
                  data-ui-font-scale={Math.round(settings.uiFontScale * 100)}
                >
                  {/* MayVox custom desktop chrome (frameless Electron) — web modunda render etmez */}
                  <AppChrome />
                  <CommandPalette
                    open={commandPaletteOpen}
                    onOpenChange={setCommandPaletteOpen}
                    currentUserId={currentUser.id}
                    users={allUsers}
                    friendIds={friendIds}
                    channels={channels}
                    activeChannelId={activeChannel}
                    hasActiveServer={!!activeServerId}
                    canManageServer={!!accessContext?.flags.canManageServer}
                    canCreateRoom={!!accessContext?.flags.canCreateChannel}
                    canManageAnnouncements={!!currentUser.isAdmin || !!currentUser.isModerator}
                    canKickMembers={!!accessContext?.flags.canKickMembers}
                    canCreateInvite={!!accessContext?.flags.canCreateInvite}
                    canRevokeInvite={!!accessContext?.flags.canRevokeInvite}
                    canViewInsights={!!accessContext?.flags.canViewInsights}
                    isAdmin={!!currentUser.isAdmin || !!currentUser.isPrimaryAdmin}
                    isPrimaryAdmin={!!currentUser.isPrimaryAdmin}
                    onJoinChannel={(channelId) => {
                      setView('chat');
                      return handleJoinChannel(channelId);
                    }}
                    onOpenSettings={openCommandSettings}
                    onOpenServerSettings={openCommandServerSettings}
                    onOpenDm={openCommandDm}
                    onOpenUserProfile={openCommandUserProfile}
                    onInviteUserToRoom={inviteCommandUserToRoom}
                    onOpenUserSearch={openCommandUserSearch}
                    onOpenMessages={openCommandMessages}
                    onOpenLegal={openCommandLegal}
                    onOpenAdmin={openCommandAdmin}
                    onOpenDiscover={openCommandDiscover}
                    onCreateAnnouncement={createCommandAnnouncement}
                    onCreateRoom={createCommandRoom}
                    onOpenInputSettings={openCommandInputSettings}
                    onOpenOutputSettings={openCommandOutputSettings}
                    onToggleMute={toggleCommandMute}
                    onToggleDeafen={toggleCommandDeafen}
                  />
                  {/* Mobil izin onboarding — izinler verilmeden uygulamaya geçme */}
                  {!permissionsGranted ? (
                    <PermissionOnboarding onComplete={handlePermissionsComplete} />
                  ) : <>
                  <div className="mv-app-main" style={{ position: 'relative', zIndex: 1 }}>
                    <AnimatePresence mode="wait">
                      {view === 'loading' && (
                        startupMaintenanceMessage ? (
                          <StartupMaintenanceNotice message={startupMaintenanceMessage} />
                        ) : (
                          <motion.div key="loading" exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="min-h-screen bg-[var(--theme-bg)]" />
                        )
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
                          publicDisplayName={publicDisplayName}
                          setPublicDisplayName={setPublicDisplayName}
                          firstName={firstName}
                          setFirstName={setFirstName}
                          lastName={lastName}
                          setLastName={setLastName}
                          age={age}
                          setAge={setAge}
                          loginError={loginError}
                          isSubmitting={isCompletingRegistration}
                          handleCompleteRegistration={handleCompleteRegistration}
                          onGoBack={() => setView('login-password')}
                          onOpenKvkk={() => setLegalModal('kvkk')}
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
                      width: 7px;
                      height: 7px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                      background: var(--scrollbar-track, transparent);
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                      background: var(--scrollbar-thumb, rgba(255,255,255,0.20));
                      border-radius: 999px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                      background: var(--scrollbar-thumb-hover, rgba(255,255,255,0.32));
                    }
                    .custom-scrollbar {
                      scrollbar-width: thin;
                      scrollbar-color: var(--scrollbar-thumb, rgba(255,255,255,0.20)) var(--scrollbar-track, transparent);
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

                  <LegalModal
                    kind={legalModal ?? 'kvkk'}
                    open={legalModal !== null}
                    onClose={() => setLegalModal(null)}
                  />

                  {/* Toast bildirimi — dock içinde gösterilir, ayrı popup yok */}

                </>}
                </div>
              </AudioCtx.Provider>
            </AppStateContext.Provider>
          </UIContext.Provider>
        </ChannelContext.Provider>
        </FavoriteFriendsProvider>
      </UserContext.Provider>
    </SettingsCtx.Provider>
    </ConfirmProvider>
    </AppErrorBoundary>
  );
}
