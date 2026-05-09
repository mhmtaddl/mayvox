import { useRef, useEffect, useCallback } from 'react';
import type React from 'react';
import { logger } from '../lib/logger';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  DisconnectReason,
  RemoteAudioTrack,
  ParticipantEvent,
  type Participant,
} from 'livekit-client';
import { getLiveKitToken, LIVEKIT_URL } from '../lib/livekit';
import { logMemberIdentityDebug, resolveUserByMemberKey } from '../lib/memberIdentity';
import { buildAudioCaptureOptions } from '../lib/audioConstraints';
import { MicGainCompensationProcessor } from '../lib/audio/micGainCompensationProcessor';
import { playSound } from '../lib/sounds';
import { applyVolumeToAudioElement, getUserVolumePercent } from '../lib/userVolume';
import type { User, VoiceChannel } from '../types';
import { formatRemainingFromIso, getRemainingMs, formatRemaining } from '../lib/formatTimeout';
import { getMyModerationState } from '../lib/serverService';
import { safePublicName } from '../lib/formatName';
import { logVoiceJoinTrace, type VoiceJoinTrace } from '../lib/voiceJoinTrace';

type PresenceChannelLike = {
  send: (payload: unknown) => Promise<unknown> | unknown;
};

// Toplam bağlantı süresi üst sınırı (token + connect + mic setup)
const TOTAL_JOIN_TIMEOUT_MS = 25_000;
const MIC_GAIN_PROCESSOR_NAME = 'mv-mic-gain-compensation';

/** Ses publish'ini engelleyen tek-kaynak gerçeklik. null = konuşabilir. */
export type VoiceDisabledReason =
  | 'server_muted'   // Moderatör canPublish=false setlemiş (kullanıcı odada kalır)
  | 'timeout'        // Sunucu-içi timeout — odadan düşürülmüş (PARTICIPANT_REMOVED)
  | 'kicked'         // Voice room kick — odadan düşürülmüş (PARTICIPANT_REMOVED)
  | 'banned'         // Sunucu erişimi kaldırılmış
  | null;

interface Props {
  presenceChannelRef: React.MutableRefObject<PresenceChannelLike | null>;
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  activeServerIdRef: React.MutableRefObject<string>;
  liveVoicePresenceRef: React.MutableRefObject<{ channelId: string | null; memberIds: Set<string> }>;
  connectionLostRef: React.MutableRefObject<boolean>;
  isDeafenedRef: React.MutableRefObject<boolean>;
  isNoiseSuppressionEnabled: boolean;
  /** 0..100 RNNoise strength — user slider */
  noiseSuppressionStrength: number;
  selectedInput: string;
  selectedOutput: string;
  setConnectionLevel: (v: number) => void;
  setToastMsg: (v: string | null) => void;
  /**
   * Tek-kaynak: ses publish'i neden kapalı. PTT/VAD/setMicrophoneEnabled bu state'e bakar.
   * Dispatch tipinde — reconnect/unmute yolunda fonksiyonel update ile sadece
   * 'server_muted' state'ini temizleyebilmek için (ban/timeout/kicked'a dokunmasın).
   */
  setVoiceDisabledReason: React.Dispatch<React.SetStateAction<VoiceDisabledReason>>;
  /**
   * Aktif timeout bitişi (ISO). Disconnect sırasında PARTICIPANT_REMOVED olursa
   * ref'e bakıp timeout vs kick ayırt ediliyor. App.tsx'ten forwarded ref.
   */
  timedOutUntilRef: React.MutableRefObject<string | null>;
  /** Disconnect sırasında backend'den çekilen timeout bilgisiyle state'i günceller. */
  setTimedOutUntil: (v: string | null) => void;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setIsConnecting: (v: boolean) => void;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  allUsersRef: React.MutableRefObject<User[]>;
  userVolumesRef: React.MutableRefObject<Record<string, number>>;
  setSpeakingLevels: (levels: Record<string, number>) => void;
  /** Yeni bir oturum başladığında (Reconnected dahil) çağrılır — epoch bump. */
  onSessionReset?: () => void;
  /** Local user audio level ref (yukarıdan verilir — voice activity consumer'larla paylaşım). */
  localAudioLevelRef: React.MutableRefObject<number>;
}

interface NoisePipelineSettings {
  enabled: boolean;
  strength: number;
  deviceId: string;
}

interface AppliedNoiseConfig extends NoisePipelineSettings {
  roomId: string;
  sessionVersion: number;
}

export function useLiveKitConnection({
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
  onSessionReset,
  localAudioLevelRef,
}: Props) {
  const livekitRoomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef(false);
  const noiseSettingsRef = useRef<NoisePipelineSettings>({
    enabled: isNoiseSuppressionEnabled,
    strength: noiseSuppressionStrength,
    deviceId: selectedInput,
  });
  const noisePipelinePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const lastAppliedNoiseConfigRef = useRef<AppliedNoiseConfig | null>(null);
  const noiseSessionVersionRef = useRef(0);
  /** Singleton disconnect — paralel çağrılar aynı promise'e bağlanır. */
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);
  /**
   * selectedOutput ref — TrackSubscribed handler closure'ında stale kalmaması için.
   * Kullanıcı connect sonrası output değiştirirse yeni katılımcıların audio element'i
   * doğru sink'e atanır.
   */
  const selectedOutputRef = useRef(selectedOutput);
  useEffect(() => { selectedOutputRef.current = selectedOutput; }, [selectedOutput]);

  const isLocalMicEnabled = useCallback((room: Room): boolean => {
    const participant = room.localParticipant as unknown as {
      isMicrophoneEnabled?: boolean;
    };
    return Boolean(participant.isMicrophoneEnabled);
  }, []);

  const sameNoiseConfig = (a: AppliedNoiseConfig | null, b: AppliedNoiseConfig): boolean => (
    !!a
    && a.enabled === b.enabled
    && a.strength === b.strength
    && a.deviceId === b.deviceId
    && a.roomId === b.roomId
    && a.sessionVersion === b.sessionVersion
  );

  const applyMicGainCompensation = useCallback(async (room: Room, enabled: boolean): Promise<void> => {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const localTrack = (mic?.audioTrack ?? mic?.track) as unknown as
      | (Record<string, unknown> & {
          setProcessor?: (processor: MicGainCompensationProcessor) => Promise<void>;
          stopProcessor?: (keepElement?: boolean) => Promise<void>;
        })
      | undefined;
    if (!localTrack) return;

    const currentProcessor = localTrack.processor as { name?: string } | undefined;
    const isOurProcessor = currentProcessor?.name === MIC_GAIN_PROCESSOR_NAME;

    if (!enabled) {
      if (isOurProcessor && typeof localTrack.stopProcessor === 'function') {
        await localTrack.stopProcessor(false).catch(err => {
          console.warn('[mic-gain] stop failed:', err);
        });
      }
      return;
    }

    if (isOurProcessor || typeof localTrack.setProcessor !== 'function') return;
    if (currentProcessor?.name) {
      console.warn('[mic-gain] skipped because another processor is active:', currentProcessor.name);
      return;
    }

    if (!localTrack.audioContext) {
      try {
        localTrack.audioContext = new AudioContext({ sampleRate: 48000 });
      } catch {
        localTrack.audioContext = new AudioContext();
      }
    }

    await localTrack.setProcessor(new MicGainCompensationProcessor()).catch(err => {
      console.warn('[mic-gain] apply failed:', err);
    });
  }, []);

  const applyNoisePipeline = useCallback((settings: NoisePipelineSettings, options: { force?: boolean } = {}): Promise<void> => {
    noiseSettingsRef.current = settings;

    noisePipelinePromiseRef.current = noisePipelinePromiseRef.current
      .catch(() => undefined)
      .then(async () => {
        const room = livekitRoomRef.current;
        if (!room) return;

        const currentSettings = noiseSettingsRef.current;
        const nextConfig: AppliedNoiseConfig = {
          ...currentSettings,
          roomId: room.sid || room.name || 'connected-room',
          sessionVersion: noiseSessionVersionRef.current,
        };
        if (!options.force && sameNoiseConfig(lastAppliedNoiseConfigRef.current, nextConfig)) {
          console.debug('[ns] skip restart, config unchanged');
          await applyMicGainCompensation(room, currentSettings.enabled);
          return;
        }

        const micWasEnabled = isLocalMicEnabled(room);
        const participant = room.localParticipant;
        const captureOptions = buildAudioCaptureOptions({
          noiseSuppression: currentSettings.enabled,
          autoGainControl: true,
          deviceId: currentSettings.deviceId,
        });

        console.log('[ns] restarting track');
        console.log('[ns] using native suppression', { enabled: currentSettings.enabled });
        try {
          await participant.setMicrophoneEnabled(false);
          if (!micWasEnabled) {
            lastAppliedNoiseConfigRef.current = nextConfig;
            return;
          }

          await participant.setMicrophoneEnabled(true, captureOptions);
          await applyMicGainCompensation(room, currentSettings.enabled);
          lastAppliedNoiseConfigRef.current = nextConfig;
        } finally {
          // no-op; kept to preserve serialized pipeline structure.
        }
      });

    return noisePipelinePromiseRef.current;
  }, [isLocalMicEnabled, applyMicGainCompensation]);

  // useCallback — stable reference. Auto-leave effect'inin dep zinciri bu
  // fonksiyona kadar uzanıyor; her render'da yeni referans dönerse effect
  // yeniden kurulur ve recordActivityImmediate() lastActivity'yi sıfırlar →
  // Pasif/AFK hiç tetiklenmez. Kritik.
  const disconnectFromLiveKit = useCallback(async (): Promise<void> => {
    if (disconnectPromiseRef.current) return disconnectPromiseRef.current;
    disconnectPromiseRef.current = (async () => {
      try {
        setIsConnecting(false);
        isConnectingRef.current = false;
        if (livekitRoomRef.current) {
          await livekitRoomRef.current.disconnect();
          livekitRoomRef.current = null;
        }
        document.querySelectorAll('[data-livekit-audio]').forEach(el => el.remove());
        localAudioLevelRef.current = 0;
        // Bağlantı yokken voice pipeline guard'ı serbest bırak — kullanıcı yeni
        // bir kanala join ederken stuck "kicked"/"server_muted" reason kalmasın.
        // Initial check yeni connect'te tekrar set eder.
        setVoiceDisabledReason(null);
      } finally {
        disconnectPromiseRef.current = null;
      }
    })();
    return disconnectPromiseRef.current;
  }, [setIsConnecting, localAudioLevelRef, setVoiceDisabledReason]);

  const connectToLiveKit = async (
    channelId: string,
    joinTrace?: VoiceJoinTrace,
  ): Promise<boolean> => {
    if (isConnectingRef.current) {
      return false;
    }
    isConnectingRef.current = true;

    // Toplam süre koruması — sonsuz beklemeyi önler
    const joinAbort = new AbortController();
    const joinTimer = setTimeout(() => joinAbort.abort(), TOTAL_JOIN_TIMEOUT_MS);

    // ── Moderation toast dedupe ─────────────────────────────────────
    // LiveKit SDK aynı permission değişikliği için nadiren birden fazla event
    // fırlatabilir; ayrıca connect/reconnect yakınlığında duplicate olabilir.
    // 2sn penceresi içinde aynı mesajı ikinci kez gösterme. Room her connect'te
    // yeniden yaratıldığından closure state reset olur.
    let lastToastAt = 0;
    let lastToastMsg = '';
    const moderationToast = (msg: string) => {
      const now = Date.now();
      if (msg === lastToastMsg && now - lastToastAt < 2000) return;
      lastToastMsg = msg;
      lastToastAt = now;
      setToastMsg(msg);
      // NOT: Moderation chime bu path'ten çalınmaz. Sadece usePresence'daki self
      // branch'ı (actor gate'li) sesi tetikler — böylece moderator/admin/owner
      // kendi uyguladığı aksiyonda ses almaz.
    };

    let room: Room | null = null;
    try {
      // Clear ref BEFORE disconnect so the old room's Disconnected handler
      // doesn't see the new room when it fires.
      const oldRoom = livekitRoomRef.current;
      if (oldRoom) {
        const oldDisconnectStart = performance.now();
        logVoiceJoinTrace(joinTrace, 'old-disconnect-start');
        livekitRoomRef.current = null;
        lastAppliedNoiseConfigRef.current = null;
        await oldRoom.disconnect();
        logVoiceJoinTrace(joinTrace, 'old-disconnect-done', {
          ms: Math.round(performance.now() - oldDisconnectStart),
        });
      }

      // ── AŞAMA 1: Token al ──
      const t0 = performance.now();

      if (joinAbort.signal.aborted) throw new Error('Bağlantı zaman aşımına uğradı.');

      logVoiceJoinTrace(joinTrace, 'token-start');
      const token = await getLiveKitToken(
        channelId,
        currentUserRef.current.name,
        activeServerIdRef.current,
        channelId,
      );

      const tokenMs = Math.round(performance.now() - t0);
      logVoiceJoinTrace(joinTrace, 'token-done', { ms: tokenMs });
      logger.info('Token alındı, LiveKit bağlantısı başlıyor', { channelId, tokenMs });

      if (joinAbort.signal.aborted) throw new Error('Bağlantı zaman aşımına uğradı.');

      // ── AŞAMA 2: Room oluştur + bağlan ──

      room = new Room({
        audioCaptureDefaults: buildAudioCaptureOptions({
          noiseSuppression: isNoiseSuppressionEnabled,
          autoGainControl: true,
          deviceId: selectedInput,
        }),
        audioOutput: {
          deviceId: selectedOutput || undefined,
        },
      });

      const broadcastMemberUpdate = (members: string[], count: number) => {
        presenceChannelRef.current?.send({
          type: 'broadcast',
          event: 'channel-update',
          payload: {
            action: 'update',
            channelId,
            updates: { members, userCount: count },
          },
        });
      };

      let membersUpdatedLogged = false;
      const updateMembers = () => {
        const localIdentity =
          room.localParticipant.identity || currentUserRef.current.id;
        const identities = [
          localIdentity,
          ...Array.from(room.remoteParticipants.values()).map(p => p.identity),
        ].filter((identity): identity is string => Boolean(identity));
        const participants: string[] = [];
        identities.forEach(identity => {
          const resolved = identity === currentUserRef.current.name || identity === currentUserRef.current.id
            ? currentUserRef.current
            : resolveUserByMemberKey(identity, allUsersRef.current);
          const memberId = resolved?.id ?? identity;
          if (!resolved) {
            logMemberIdentityDebug('unresolved_livekit_identity', { channelId, identity }, `lk_identity:${channelId}:${identity}`);
          }
          if (!participants.includes(memberId)) participants.push(memberId);
        });
        liveVoicePresenceRef.current = {
          channelId,
          memberIds: new Set(participants),
        };
        setChannels(prev =>
          prev.map(c =>
            c.id === channelId
              ? { ...c, members: participants, userCount: participants.length }
              : c,
          ),
        );
        if (!membersUpdatedLogged) {
          membersUpdatedLogged = true;
          logVoiceJoinTrace(joinTrace, 'members-updated', { count: participants.length });
        }
        broadcastMemberUpdate(participants, participants.length);
      };

      const syncUsers = () => {
        const remoteIdentities = Array.from(
          room.remoteParticipants.values(),
        ).map(p => p.identity);
        remoteIdentities.forEach(identity => {
          setAllUsers(prev => {
            if (prev.find(u => u.id === identity)) return prev;
            logMemberIdentityDebug('synthetic_user_created', { identity }, `synthetic_user:${identity}`);
            const safeIdentityName = safePublicName(identity);
            const newUser: User = {
              id: identity,
              name: safeIdentityName,
              firstName: safeIdentityName,
              lastName: '',
              age: 0,
              avatar: (safeIdentityName[0] || '?').toUpperCase(),
              status: 'online',
              statusText: 'Online',
              isAdmin: false,
              isPrimaryAdmin: false,
            };
            return [...prev, newUser];
          });
        });
        setAllUsers(prev =>
          prev.filter(
            u => !u.id.startsWith('lk-') || remoteIdentities.includes(u.id),
          ),
        );
      };

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach() as HTMLAudioElement;
          const user = resolveUserByMemberKey(participant.identity, allUsersRef.current);
          const remoteUserId = user?.id ?? participant.identity;
          audioEl.setAttribute('data-livekit-audio', 'true');
          audioEl.setAttribute('data-participant', participant.identity);
          audioEl.dataset.mayvoxUserId = remoteUserId;
          audioEl.muted = isDeafenedRef.current;
          if (isDeafenedRef.current) {
            audioEl.volume = 0;
            try { audioEl.pause(); } catch { /* no-op */ }
          } else {
            applyVolumeToAudioElement(audioEl, remoteUserId);
          }
          document.body.appendChild(audioEl);

          // Yeni subscribe olan audio element seçili output cihazına route edilsin.
          // Ref üzerinden oku — closure stale kalmasın (kullanıcı connect sonrası output değiştirmiş olabilir).
          const currentSink = selectedOutputRef.current;
          if (currentSink) {
            const sinkEl = audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
            if (typeof sinkEl.setSinkId === 'function') {
              sinkEl.setSinkId(currentSink).catch(err => {
                console.warn('[audio] TrackSubscribed setSinkId failed:', err);
              });
            }
          }

          // Deafened state'te yeni subscribe olan track sessiz başlasın.
          // HTMLAudioElement.muted webAudioMix=true'da yetersiz → track.setVolume(0)
          // LiveKit API garantili sessizlik.
          if (isDeafenedRef.current && track instanceof RemoteAudioTrack) {
            track.setVolume(0);
          } else {
            const savedVolume = userVolumesRef.current[remoteUserId] ?? getUserVolumePercent(remoteUserId);
            // RemoteAudioTrack.setVolume is used elsewhere in this codebase; keep it scoped to per-track gain.
            const vol = Math.max(0, Math.min(1, savedVolume / 100));
            if (track instanceof RemoteAudioTrack) {
              track.setVolume(vol);
            }
            applyVolumeToAudioElement(audioEl, remoteUserId);
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach(el => el.remove());
        }
      });

      // ── AudioPlaybackStatusChanged — autoplay blocked recovery ──
      // Prod Electron'da autoplay-policy flag'i ile default olarak sorunsuz,
      // ama güvenlik ağı: eğer bir sebepten remote audio elementler play()
      // yapamadıysa (canPlaybackAudio=false), ilk kullanıcı gesture'ında
      // room.startAudio() ile hepsini unlock et. Kullanıcı "başkalarını
      // duyamıyorum" durumundan otomatik kurtulur.
      let audioUnlockArmed = false;
      let cleanupAudioUnlock = () => {};
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          if (audioUnlockArmed) return;
          audioUnlockArmed = true;
          console.warn('[audio] canPlaybackAudio=false — awaiting user gesture to startAudio');
          const unlock = () => {
            cleanupAudioUnlock();
            room.startAudio().then(() => {
              console.log('[audio] startAudio unlocked');
            }).catch(err => {
              console.warn('[audio] startAudio failed:', err);
            });
          };
          cleanupAudioUnlock = () => {
            if (!audioUnlockArmed) return;
            audioUnlockArmed = false;
            window.removeEventListener('click', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            window.removeEventListener('touchstart', unlock, true);
          };
          window.addEventListener('click', unlock, { capture: true, once: true });
          window.addEventListener('keydown', unlock, { capture: true, once: true });
          window.addEventListener('touchstart', unlock, { capture: true, once: true });
        } else {
          cleanupAudioUnlock();
          console.log('[audio] canPlaybackAudio=true');
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        updateMembers();
        syncUsers();
        // Duplicate-notification fix: self-join için ayrı bir playSound ('join')
        // zaten başarılı connect sonrasında tetiklenir (aşağıda). isLocal participant
        // için burada tekrar ses çalmaz.
        if (!participant?.isLocal) playSound('join');
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        updateMembers();
        syncUsers();
        if (!participant?.isLocal) playSound('leave');
      });

      // ─── Throttled speaker levels (~8fps UI update) ───────────────────
      let pendingLevels: Record<string, number> = {};
      let speakingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
      let lastSpeakingLevels: Record<string, number> = {};
      const SPEAKING_THROTTLE_MS = 120;
      const levelsChanged = (a: Record<string, number>, b: Record<string, number>) => {
        const ak = Object.keys(a);
        const bk = Object.keys(b);
        if (ak.length !== bk.length) return true;
        return ak.some(k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 0.01);
      };

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const levels: Record<string, number> = {};
        let localLevel = 0;
        speakers.forEach(p => {
          if (p.isLocal) localLevel = p.audioLevel;
          else levels[p.identity] = p.audioLevel;
        });
        localAudioLevelRef.current = localLevel;
        pendingLevels = levels;
        if (!speakingThrottleTimer) {
          speakingThrottleTimer = setTimeout(() => {
            if (levelsChanged(pendingLevels, lastSpeakingLevels)) {
              lastSpeakingLevels = pendingLevels;
              setSpeakingLevels(pendingLevels);
            }
            speakingThrottleTimer = null;
          }, SPEAKING_THROTTLE_MS);
        }
      });

      room.on(RoomEvent.ConnectionQualityChanged, quality => {
        const level =
          quality === ConnectionQuality.Excellent
            ? 4
            : quality === ConnectionQuality.Good
              ? 3
              : quality === ConnectionQuality.Poor
                ? 2
                : 1;
        logger.info('LiveKit quality', { quality: ConnectionQuality[quality], level });
        setConnectionLevel(level);
      });

      let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

      room.on(RoomEvent.Reconnecting, () => {
        logger.warn('LiveKit reconnecting', { channelId });
        setConnectionLevel(1);
        
        reconnectTimeout = setTimeout(async () => {
          await room.disconnect();
          setConnectionLevel(0);
        }, 15000);
      });

      room.on(RoomEvent.Reconnected, () => {
        logger.info('LiveKit reconnected', { channelId });
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        connectionLostRef.current = false;
        setConnectionLevel(4);
        updateMembers();
        syncUsers();
        noiseSessionVersionRef.current += 1;
        lastAppliedNoiseConfigRef.current = null;
        // Reconnect sonrası permission'ı tekrar oku — reconnect sırasında mute/unmute
        // gelmiş olabilir ve Permission event'i reconnect boyunca kaçırılmış olabilir.
        const canPublishNow = room.localParticipant.permissions?.canPublish;
        if (canPublishNow === false) {
          setVoiceDisabledReason('server_muted');
        } else if (canPublishNow === true) {
          // Sadece 'server_muted' ise temizle — 'banned' (App.tsx sync'i ile gelir)
          // ya da başka reason'a dokunmuyoruz. timeout/kicked zaten disconnect olduğu
          // için reconnect code-path'ine girmez.
          setVoiceDisabledReason(prev => (prev === 'server_muted' || prev === 'kicked' ? null : prev));
        }
        // Yeni oturum — ghost countdown timeout'larını geçersiz kıl
        onSessionReset?.();
        void applyNoisePipeline(noiseSettingsRef.current, { force: true });
      });

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        logger.info('LiveKit disconnected', {
          channelId,
          reason,
          clientInitiated: reason === DisconnectReason.CLIENT_INITIATED,
        });
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        if (speakingThrottleTimer) {
          clearTimeout(speakingThrottleTimer);
          speakingThrottleTimer = null;
        }
        cleanupAudioUnlock();
        const identity =
          room.localParticipant?.identity || currentUserRef.current.id;
        const selfKeys = new Set([
          identity,
          currentUserRef.current.id,
          currentUserRef.current.name,
        ].filter(Boolean));
        if (liveVoicePresenceRef.current.channelId === channelId) {
          liveVoicePresenceRef.current = { channelId: null, memberIds: new Set() };
        }

        setChannels(prev => {
          const updated = prev.map(c => {
            if (c.id !== channelId) return c;
            const members = c.members?.filter(m => !selfKeys.has(m)) || [];
            return { ...c, members, userCount: members.length };
          });
          const ch = updated.find(c => c.id === channelId);
          if (ch) broadcastMemberUpdate(ch.members ?? [], ch.userCount ?? 0);
          return updated;
        });

        setSpeakingLevels({});
        if (livekitRoomRef.current === room) {
          livekitRoomRef.current = null;
          isConnectingRef.current = false;
          setIsConnecting(false);
          if (reason !== DisconnectReason.CLIENT_INITIATED) {
            setActiveChannel(null);
            connectionLostRef.current = true;
            setConnectionLevel(0);
            // Moderator removeParticipant çağırdıysa LiveKit bu reason ile disconnect eder.
            // Timeout + room-kick için ortak (ikisi de backend'de removeParticipant kullanıyor).
            // Backend'den ek sinyal gelene kadar 'kicked' kullanıyoruz; usePresence
            // moderation broadcast'ı timeout/banned'i daha spesifik üzerine yazabilir.
            if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
              // Timeout vs room-kick ayrımı. Backend timeoutMember ve kickFromRoom ikisi de
              // removeParticipant çağırıyor.
              //   - Timeout ise: reason='timeout' set et (mic kilitli kalır, süre dolana kadar konuşamaz).
              //   - Room-kick ise: reason SET ETME — kullanıcı sadece odadan düştü, mikrofonu
              //     kilitleme yok. Başka odaya girince normal konuşabilir. Aksi halde stale
              //     'kicked' reason yeni join'e taşınıyor ve mic UI'da "locked" kalıyordu.
              const staleRem = getRemainingMs(timedOutUntilRef.current);
              if (staleRem > 0) {
                setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'timeout'));
                const remStr = formatRemainingFromIso(timedOutUntilRef.current);
                moderationToast(remStr
                  ? `Zamanaşımı cezası aldınız — ${remStr} boyunca konuşamaz ve sohbet odalarına giremezsiniz.`
                  : 'Zamanaşımı cezası aldınız — belirli bir süre konuşamaz ve sohbet odalarına giremezsiniz.');
              } else {
                // Pessimistic "kicked" reason SET ETMİYORUZ. Backend'de timeout varsa async
                // fetch upgrade eder. Fetch dönene kadar kısa pencere: aktif channel zaten null,
                // PTT/VAD guard `isVoiceConnected`'e bağlı → otomatik pasif. Kullanıcı başka
                // odaya join etmek isterse engel yok (gerçek mute/timeout değilse).
                const srvId = activeServerIdRef.current;
                if (srvId) {
                  void (async () => {
                    try {
                      const mod = await getMyModerationState(srvId);
                      const rem = getRemainingMs(mod.timedOutUntil);
                      if (rem > 0 && mod.timedOutUntil) {
                        setTimedOutUntil(mod.timedOutUntil);
                        setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'timeout'));
                        const remStr = formatRemaining(rem);
                        moderationToast(remStr
                          ? `Zamanaşımı cezası aldınız — ${remStr} boyunca konuşamaz ve sohbet odalarına giremezsiniz.`
                          : 'Zamanaşımı cezası aldınız — belirli bir süre konuşamaz ve sohbet odalarına giremezsiniz.');
                      } else {
                        moderationToast('Odadan çıkarıldınız');
                      }
                    } catch {
                      moderationToast('Odadan çıkarıldınız');
                    }
                  })();
                } else {
                  moderationToast('Odadan çıkarıldınız');
                }
              }
              // Sidebar invalidation — moderatör ban atmışsa server listesi stale kalmasın.
              // ChatView bu event'i yakalar → refreshServers() + aktif sunucu düştüyse fallback.
              window.dispatchEvent(new CustomEvent('mayvox:refresh-server-list'));
            }
          } else {
            playSound('leave');
            setConnectionLevel(4);
            // Kullanıcının kendi ayrılışı — server-mute reason'unu temizle
            setVoiceDisabledReason(null);
          }
        }
      });

      let livekitConnectedLogged = false;
      let livekitConnectStart = 0;
      const logLiveKitConnected = () => {
        if (livekitConnectedLogged) return;
        livekitConnectedLogged = true;
        logVoiceJoinTrace(joinTrace, 'livekit-connected', {
          ms: Math.round(performance.now() - livekitConnectStart),
        });
      };
      room.once(RoomEvent.Connected, logLiveKitConnected);

      const t1 = performance.now();
      livekitConnectStart = t1;
      logger.info('LiveKit connecting', { channelId, url: LIVEKIT_URL });
      logVoiceJoinTrace(joinTrace, 'livekit-connect-start');
      await room.connect(LIVEKIT_URL, token);
      logLiveKitConnected();
      noiseSessionVersionRef.current += 1;
      lastAppliedNoiseConfigRef.current = null;
      const connectMs = Math.round(performance.now() - t1);
      const totalMs = Math.round(performance.now() - t0);
      logger.info('LiveKit connected', {
        channelId,
        identity: room.localParticipant.identity,
        tokenMs,
        connectMs,
        totalMs,
      });

      // Set ref only after successful connect
      livekitRoomRef.current = room;

      // ── Moderation: canPublish değişimi (mute/unmute) ─────────────
      // Backend updateParticipant ile canPublish'i değiştirince LiveKit bu event'i
      // emit eder. Tek-kaynak gerçeklik: voiceDisabledReason store'u burada güncellenir;
      // PTT/VAD/setMicrophoneEnabled effect'i bu reason'a bakarak guard yapar.
      room.localParticipant.on(
        ParticipantEvent.ParticipantPermissionsChanged,
        // ParticipantPermission tipi livekit-client'tan export değil; ihtiyacımız olan tek
        // alan canPublish, minimal inline shape yeterli.
        (prev?: { canPublish?: boolean }) => {
          const nextCanPublish = room!.localParticipant.permissions?.canPublish;
          const prevCanPublish = prev?.canPublish;
          if (nextCanPublish === prevCanPublish) return;
          if (nextCanPublish === false) {
            // 'banned' zaten daha ağır bir durum — ona dokunmayalım (App.tsx sync'i üzerine yazabilirdi).
            setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'server_muted'));
            moderationToast('Bu sunucuda susturuldunuz');
          } else if (nextCanPublish === true && prevCanPublish !== true) {
            // false→true (veya undefined→true ilk yerleşim): mute kaldırıldı.
            // REGRESSION FIX: canPublish:false iken LiveKit track'i unpublish eder.
            // canPublish:true döndüğünde SDK otomatik republish etmez — manuel çağırmalıyız.
            // PTT effect zaten isPttPressed'e göre tekrar enable edecek; burada sadece
            // mute'tan döndüğümüzü işaretlemek + reason temizlemek yeter (sadece server_muted'den).
            setVoiceDisabledReason(prev => (prev === 'server_muted' || prev === 'kicked' ? null : prev));
            // Eğer kullanıcı şu an PTT basılı tutuyorsa veya VAD aktifse mic'i hemen aç.
            // (Aksi takdirde bir sonraki PTT basılışında zaten enable olur.)
            room!.localParticipant.setMicrophoneEnabled(true).catch(err => {
              console.warn('[moderation] mic re-enable failed', err);
            });
            // prev === false (gerçek unmute) iken toast at; ilk yerleşim (undefined→true)
            // sessizce geçsin — kullanıcı zaten normal join etti.
            if (prevCanPublish === false) {
              moderationToast('Susturulmanız kaldırıldı');
            }
          }
        },
      );

      updateMembers();
      syncUsers();
      playSound('join');

      // Initial check: zaten muted state'te bir kanala join olduysa LiveKit
      // ParticipantPermissionsChanged event'ini fire ETMEZ (sadece değişimde fire eder).
      // İlk publish girişiminden ÖNCE permission'ı oku ve reason'u set et.
      //
      // ÖNEMLİ: undefined → dokunma. Permission henüz server'dan sync edilmediyse
      // bilgi yok demek; reason'u temizlersek handleJoinChannel pre-set'ini ezeriz
      // (muted kullanıcı ilk frame'de konuşur). Sadece true veya false'ta state değiştir.
      const initialCanPublish = room.localParticipant.permissions?.canPublish;
      if (initialCanPublish === false) {
        setVoiceDisabledReason(prev => (prev === 'banned' ? prev : 'server_muted'));
        moderationToast('Bu sunucuda susturuldunuz');
      } else if (initialCanPublish === true) {
        // Sadece server_muted'den temizle — ban/timeout/kicked korunur.
        setVoiceDisabledReason(prev => (prev === 'server_muted' || prev === 'kicked' ? null : prev));
      }
      // undefined → no-op; ParticipantPermissionsChanged event geldiğinde düzeltir.
      logVoiceJoinTrace(joinTrace, 'local-participant-ready', {
        canPublish: initialCanPublish ?? 'unknown',
        identity: room.localParticipant.identity,
      });

      await room.localParticipant.setMicrophoneEnabled(false);

      void applyNoisePipeline({
        enabled: isNoiseSuppressionEnabled,
        strength: noiseSuppressionStrength,
        deviceId: selectedInput,
      }, { force: true });

      // ── Audio baseline log (Seviye 1 foundation) ──
      // RNNoise entegrasyonundan ÖNCEKİ ses pipeline metriklerini kaydeder;
      // sonra A/B karşılaştırma yapılabilsin. Prod'da da zararsız: tek log satırı.
      try {
        const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const s = mic?.audioTrack?.mediaStreamTrack?.getSettings();
        logger.info('[audio-baseline]', {
          channelId,
          joinMs: totalMs,
          tokenMs,
          connectMs,
          sampleRate: s?.sampleRate,
          channelCount: s?.channelCount,
          echoCancellation: s?.echoCancellation,
          noiseSuppression: s?.noiseSuppression,
          autoGainControl: s?.autoGainControl,
          deviceId: s?.deviceId,
        });
      } catch { /* baseline best-effort */ }

      isConnectingRef.current = false;
      logVoiceJoinTrace(joinTrace, 'ready', {
        totalMs: joinTrace ? Math.round(performance.now() - joinTrace.startedAt) : totalMs,
      });
      clearTimeout(joinTimer);
      return true;
    } catch (err) {
      clearTimeout(joinTimer);
      // Cleanup: oluşturulan room'u temizle (event listener leak önleme).
      // await ile beklenir — LiveKit disconnect() internal removeAllListeners çağırır,
      // ancak senkron değildir; await edilmezse dangling listener penceresi açık kalır.
      try { await room?.disconnect(); } catch { /* ignore */ }
      const errMsg = (err as Error)?.message ?? '';
      const isTimeout = errMsg.includes('zaman aşımı') || (err as Error)?.name === 'AbortError';

      const msg = isTimeout
        ? 'Bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.'
        : errMsg || 'Odaya bağlanılamadı.';

      logger.error('LiveKit bağlantı hatası', {
        channelId,
        message: msg,
        stack: (err as Error)?.stack,
      });
      isConnectingRef.current = false;
      setIsConnecting(false);
      return false;
    }
  };

  /** Runtime strength update — slider değişince App'ten çağrılır. */
  const updateNoiseStrength = (strength0to100: number) => {
    noiseSettingsRef.current = {
      ...noiseSettingsRef.current,
      strength: Math.max(0, Math.min(100, strength0to100)),
    };
  };

  return { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit, updateNoiseStrength, applyNoisePipeline };
}
