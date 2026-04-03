import { useRef } from 'react';
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
import { playSound } from '../lib/sounds';
import type { User, VoiceChannel } from '../types';

// Toplam bağlantı süresi üst sınırı (token + connect + mic setup)
const TOTAL_JOIN_TIMEOUT_MS = 25_000;

interface Props {
  presenceChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  connectionLostRef: React.MutableRefObject<boolean>;
  isDeafenedRef: React.MutableRefObject<boolean>;
  isNoiseSuppressionEnabled: boolean;
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
}

export function useLiveKitConnection({
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
  setSpeakingLevels,
}: Props) {
  const livekitRoomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef(false);

  const disconnectFromLiveKit = async () => {
    setIsConnecting(false);
    isConnectingRef.current = false;
    if (livekitRoomRef.current) {
      await livekitRoomRef.current.disconnect();
      livekitRoomRef.current = null;
    }
    document.querySelectorAll('[data-livekit-audio]').forEach(el => el.remove());
  };

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
        (msg) => setToastMsg(msg),
      );

      const tokenMs = Math.round(performance.now() - t0);
      logger.info('Token alındı, LiveKit bağlantısı başlıyor', { channelId, tokenMs });

      if (joinAbort.signal.aborted) throw new Error('Bağlantı zaman aşımına uğradı.');

      // ── AŞAMA 2: Room oluştur + bağlan ──
      setToastMsg('Odaya bağlanılıyor...');

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
              statusText: 'Aktif',
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
          audioEl.muted = isDeafenedRef.current;
          document.body.appendChild(audioEl);

          const user = allUsersRef.current.find(u => u.name === participant.identity);
          if (user) {
            const savedVolume = userVolumesRef.current[user.id];
            if (savedVolume !== undefined && publication.track instanceof RemoteAudioTrack) {
              publication.track.setVolume(savedVolume / 100);
            }
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach(el => el.remove());
        }
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        updateMembers();
        syncUsers();
        playSound('join');
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        updateMembers();
        syncUsers();
        playSound('leave');
      });

      // ─── Throttled speaker levels (~30fps) ───────────────────
      let pendingLevels: Record<string, number> = {};
      let speakingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
      const SPEAKING_THROTTLE_MS = 33;

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const levels: Record<string, number> = {};
        speakers.forEach(p => {
          if (!p.isLocal) levels[p.identity] = p.audioLevel;
        });
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
        setToastMsg('Bağlantı kesildi, yeniden bağlanılıyor...');
        reconnectTimeout = setTimeout(async () => {
          await room.disconnect();
          setConnectionLevel(0);
          setToastMsg(
            'Bağlantı kesildi. İnternet bağlantınızı kontrol ediniz.',
          );
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
        setToastMsg('Bağlantı yeniden kuruldu.');
        setTimeout(() => setToastMsg(null), 3000);
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
            const isDualDevice = reason === DisconnectReason.DUPLICATE_IDENTITY
              || reason === DisconnectReason.PARTICIPANT_REMOVED;
            setToastMsg(
              isDualDevice
                ? 'Bağlantınız kesildi. Başka bir cihazdan sohbet odasına bağlandınız.'
                : 'Bağlantı kesildi. İnternet bağlantınızı kontrol ediniz.',
            );
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

      setToastMsg(null);
      isConnectingRef.current = false;
      clearTimeout(joinTimer);
      return true;
    } catch (err) {
      clearTimeout(joinTimer);
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
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 6000);
      return false;
    }
  };

  return { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit };
}
