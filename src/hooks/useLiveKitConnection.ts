import { useRef, useCallback } from 'react';
import type React from 'react';
import { logger } from '../lib/logger';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  DisconnectReason,
  RemoteAudioTrack,
  type Participant,
} from 'livekit-client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getLiveKitToken, LIVEKIT_URL } from '../lib/livekit';
import { buildAudioCaptureOptions } from '../lib/audioConstraints';
import { AUDIO_FLAGS } from '../lib/audioFlags';
import { RNNoiseTrackProcessor } from '../lib/audio/rnnoiseProcessor';
import { playSound } from '../lib/sounds';
import type { User, VoiceChannel } from '../types';

// Toplam bağlantı süresi üst sınırı (token + connect + mic setup)
const TOTAL_JOIN_TIMEOUT_MS = 25_000;

interface Props {
  presenceChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  activeServerIdRef: React.MutableRefObject<string>;
  connectionLostRef: React.MutableRefObject<boolean>;
  isDeafenedRef: React.MutableRefObject<boolean>;
  isNoiseSuppressionEnabled: boolean;
  /** 0..100 RNNoise strength — user slider */
  noiseSuppressionStrength: number;
  selectedInput: string;
  selectedOutput: string;
  setConnectionLevel: (v: number) => void;
  setToastMsg: (v: string | null) => void;
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

export function useLiveKitConnection({
  presenceChannelRef,
  currentUserRef,
  activeChannelRef,
  activeServerIdRef,
  connectionLostRef,
  isDeafenedRef,
  isNoiseSuppressionEnabled,
  noiseSuppressionStrength,
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
  onSessionReset,
  localAudioLevelRef,
}: Props) {
  const livekitRoomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef(false);
  /** Aktif RNNoise processor — strength slider anlık değişimi için. */
  const activeRnnoiseProcessorRef = useRef<RNNoiseTrackProcessor | null>(null);
  /** Singleton disconnect — paralel çağrılar aynı promise'e bağlanır. */
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);

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
        if (activeRnnoiseProcessorRef.current) {
          try { await activeRnnoiseProcessorRef.current.destroy(); } catch { /* no-op */ }
          activeRnnoiseProcessorRef.current = null;
          console.log('[rnnoise] destroyed');
        }
        if (livekitRoomRef.current) {
          await livekitRoomRef.current.disconnect();
          livekitRoomRef.current = null;
        }
        document.querySelectorAll('[data-livekit-audio]').forEach(el => el.remove());
        localAudioLevelRef.current = 0;
      } finally {
        disconnectPromiseRef.current = null;
      }
    })();
    return disconnectPromiseRef.current;
  }, [setIsConnecting, localAudioLevelRef]);

  const connectToLiveKit = async (
    channelId: string,
  ): Promise<boolean> => {
    if (isConnectingRef.current) {
      return false;
    }
    isConnectingRef.current = true;

    // Toplam süre koruması — sonsuz beklemeyi önler
    const joinAbort = new AbortController();
    const joinTimer = setTimeout(() => joinAbort.abort(), TOTAL_JOIN_TIMEOUT_MS);

    let room: Room | null = null;
    try {
      // Clear ref BEFORE disconnect so the old room's Disconnected handler
      // doesn't see the new room when it fires.
      const oldRoom = livekitRoomRef.current;
      if (oldRoom) {
        livekitRoomRef.current = null;
        await oldRoom.disconnect();
      }

      // ── AŞAMA 1: Token al ──
      const t0 = performance.now();

      if (joinAbort.signal.aborted) throw new Error('Bağlantı zaman aşımına uğradı.');

      const token = await getLiveKitToken(
        channelId,
        currentUserRef.current.name,
        activeServerIdRef.current,
        channelId,
      );

      const tokenMs = Math.round(performance.now() - t0);
      logger.info('Token alındı, LiveKit bağlantısı başlıyor', { channelId, tokenMs });

      if (joinAbort.signal.aborted) throw new Error('Bağlantı zaman aşımına uğradı.');

      // ── AŞAMA 2: Room oluştur + bağlan ──

      // RNNoise aktifse Chromium native NS'yi kapat (double-processing fix).
      // Kullanıcı NS toggle'ı AÇIK ise RNNoise devrededir; KAPALI ise native NS aktif.
      const rnnoiseActive = isNoiseSuppressionEnabled;
      room = new Room({
        audioCaptureDefaults: buildAudioCaptureOptions({
          noiseSuppression: isNoiseSuppressionEnabled,
          autoGainControl: true,
          rnnoiseActive,
          deviceId: selectedInput,
        }),
        audioOutput: {
          deviceId: selectedOutput || undefined,
        },
        // Web Audio GainNode üzerinden mix — remote audio tracks setVolume(>1)
        // değeri artık HTMLMediaElement'te clamp edilmiyor; Web Audio gain ile
        // gerçek amplifikasyon (100% üstü boost) sağlıyor.
        webAudioMix: true,
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

      const updateMembers = () => {
        const localIdentity =
          room.localParticipant.identity || currentUserRef.current.id;
        const participants = [
          localIdentity,
          ...Array.from(room.remoteParticipants.values()).map(p => p.identity),
        ].filter(Boolean);
        setChannels(prev =>
          prev.map(c =>
            c.id === channelId
              ? { ...c, members: participants, userCount: participants.length }
              : c,
          ),
        );
        broadcastMemberUpdate(participants, participants.length);
      };

      const syncUsers = () => {
        const remoteIdentities = Array.from(
          room.remoteParticipants.values(),
        ).map(p => p.identity);
        remoteIdentities.forEach(identity => {
          setAllUsers(prev => {
            if (prev.find(u => u.id === identity)) return prev;
            const newUser: User = {
              id: identity,
              name: identity,
              firstName: identity,
              lastName: '',
              age: 0,
              avatar: (identity[0] || '?').toUpperCase(),
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
          audioEl.setAttribute('data-livekit-audio', 'true');
          audioEl.setAttribute('data-participant', participant.identity);
          audioEl.muted = isDeafenedRef.current;
          document.body.appendChild(audioEl);

          const user = allUsersRef.current.find(u => u.name === participant.identity);
          if (user) {
            const savedVolume = userVolumesRef.current[user.id];
            if (savedVolume !== undefined) {
              // webAudioMix: true sayesinde setVolume(>1) gerçek amplifikasyon.
              // Clamp 0..1.5 (150%).
              const vol = Math.max(0, Math.min(1.5, savedVolume / 100));
              if (track instanceof RemoteAudioTrack) {
                track.setVolume(vol);
              }
              // HTMLMediaElement fallback 0..1 clamp.
              audioEl.volume = Math.min(1, vol);
            }
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach(el => el.remove());
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

      // ─── Throttled speaker levels (~30fps) ───────────────────
      let pendingLevels: Record<string, number> = {};
      let speakingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
      const SPEAKING_THROTTLE_MS = 33;

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
            setSpeakingLevels(pendingLevels);
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
        // Yeni oturum — ghost countdown timeout'larını geçersiz kıl
        onSessionReset?.();
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
        const identity =
          room.localParticipant?.identity || currentUserRef.current.id;

        setChannels(prev => {
          const updated = prev.map(c => {
            if (c.id !== channelId) return c;
            const members = c.members?.filter(m => m !== identity) || [];
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
            // Toast kaldırıldı
          } else {
            playSound('leave');
            setConnectionLevel(4);
          }
        }
      });

      const t1 = performance.now();
      logger.info('LiveKit connecting', { channelId, url: LIVEKIT_URL });
      await room.connect(LIVEKIT_URL, token);
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

      updateMembers();
      syncUsers();
      playSound('join');

      await room.localParticipant.setMicrophoneEnabled(false);

      // ── RNNoise processor attach (user-controlled, idempotent) ──
      // ECHO/DUPLICATE FIX: multi-attach engellemesi + eski processor destroy.
      // Invariant'lar:
      //   1) Tek aktif processor referansı (activeRnnoiseProcessorRef)
      //   2) Aynı track ID için ikinci attach reddedilir
      //   3) Yeni attach öncesi eski processor destroy edilir
      //   4) Paralel attach race'i promise-lock ile tek yola indirilir
      const userEnabled = isNoiseSuppressionEnabled;
      const devForced = AUDIO_FLAGS.RNNOISE_ENABLED;
      const shouldAttach = userEnabled || devForced;
      activeRnnoiseProcessorRef.current = null;
      let attachedTrackId: string | null = null;
      let attachInFlight: Promise<void> | null = null;

      if (shouldAttach) {
        console.log('[rnnoise] simple mode active');
        const strengthNorm = Math.max(0, Math.min(1, noiseSuppressionStrength / 100));

        const attachRnnoise = async (trackPub: unknown) => {
          if (attachInFlight) { try { await attachInFlight; } catch { /* no-op */ } }
          const pub = trackPub as { audioTrack?: { setProcessor?: (p: unknown) => Promise<void>; mediaStreamTrack?: MediaStreamTrack } };
          const audioTrack = pub?.audioTrack;
          if (!audioTrack?.setProcessor || !audioTrack.mediaStreamTrack) return;
          const trackId = audioTrack.mediaStreamTrack.id;
          if (attachedTrackId === trackId && activeRnnoiseProcessorRef.current) return;

          attachInFlight = (async () => {
            try {
              const old = activeRnnoiseProcessorRef.current;
              if (old) {
                try { await old.destroy(); } catch { /* no-op */ }
                activeRnnoiseProcessorRef.current = null;
                console.log('[rnnoise] destroyed');
              }
              const proc = new RNNoiseTrackProcessor();
              (proc as unknown as { initialStrength?: number }).initialStrength = strengthNorm;
              await audioTrack.setProcessor!(proc);
              activeRnnoiseProcessorRef.current = proc;
              attachedTrackId = trackId;
              proc.setStrength(strengthNorm);
              console.log('[rnnoise] attached');
            } catch (err) {
              console.warn('[rnnoise] fallback triggered:', err);
            }
          })();
          await attachInFlight;
          attachInFlight = null;
        };

        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub) void attachRnnoise(micPub);
        room.localParticipant.on('localTrackPublished', (pub) => {
          const anyPub = pub as unknown as { source?: unknown };
          if (anyPub.source !== Track.Source.Microphone) return;
          void attachRnnoise(pub);
        });
        room.localParticipant.on('localTrackUnpublished', (pub) => {
          const anyPub = pub as unknown as { source?: unknown; audioTrack?: { mediaStreamTrack?: MediaStreamTrack } };
          if (anyPub.source !== Track.Source.Microphone) return;
          const unpubId = anyPub.audioTrack?.mediaStreamTrack?.id ?? null;
          if (attachedTrackId && attachedTrackId === unpubId) {
            attachedTrackId = null;
            const old = activeRnnoiseProcessorRef.current;
            if (old) { void old.destroy(); activeRnnoiseProcessorRef.current = null; console.log('[rnnoise] destroyed'); }
          }
        });
      }

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
    const proc = activeRnnoiseProcessorRef.current;
    if (!proc) return;
    const norm = Math.max(0, Math.min(1, strength0to100 / 100));
    proc.setStrength(norm);
  };

  return { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit, updateNoiseStrength };
}
