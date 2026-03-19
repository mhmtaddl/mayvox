import { useRef } from 'react';
import type React from 'react';
import { logger } from '../lib/logger';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  DisconnectReason,
} from 'livekit-client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getLiveKitToken, LIVEKIT_URL } from '../lib/livekit';
import { playSound } from '../lib/sounds';
import type { User, VoiceChannel } from '../types';

interface Props {
  presenceChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  connectionLostRef: React.MutableRefObject<boolean>;
  isNoiseSuppressionEnabled: boolean;
  selectedInput: string;
  selectedOutput: string;
  setConnectionLevel: (v: number) => void;
  setToastMsg: (v: string | null) => void;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setIsConnecting: (v: boolean) => void;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

export function useLiveKitConnection({
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
    console.log('[LK] connectToLiveKit BAŞLADI', {
      channelId,
      currentUserName: currentUserRef.current.name,
      hasExistingRoom: !!livekitRoomRef.current,
    });

    if (isConnectingRef.current) {
      console.warn('[LK] Zaten bağlanılıyor, bu çağrı iptal edildi');
      return false;
    }
    isConnectingRef.current = true;

    try {
      // Clear ref BEFORE disconnect so the old room's Disconnected handler
      // doesn't see the new room when it fires.
      const oldRoom = livekitRoomRef.current;
      if (oldRoom) {
        livekitRoomRef.current = null;
        console.log('[LK] Eski oda var, disconnect ediliyor...');
        await oldRoom.disconnect();
        console.log('[LK] Eski oda disconnect edildi');
      }

      console.log('[LK] Token alınıyor...', {
        channelId,
        participantName: currentUserRef.current.name,
      });
      const token = await getLiveKitToken(
        channelId,
        currentUserRef.current.name,
        () => setToastMsg('Ses sunucusuna bağlanılıyor…'),
      );
      setToastMsg(null);
      console.log('[LK] Token alındı ✓', { tokenLength: token?.length });

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
      // Ref is NOT set here — only after a successful connect() call.

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
          room.localParticipant.identity || currentUserRef.current.name;
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
        setAllUsers(prev =>
          prev.filter(
            u => !u.id.startsWith('lk-') || remoteIdentities.includes(u.name),
          ),
        );
      };

      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach() as HTMLAudioElement;
          audioEl.setAttribute('data-livekit-audio', 'true');
          // isDeafened is applied separately via the deafen useEffect in App.tsx
          document.body.appendChild(audioEl);
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

      room.on(RoomEvent.ConnectionQualityChanged, quality => {
        const level =
          quality === ConnectionQuality.Excellent
            ? 4
            : quality === ConnectionQuality.Good
              ? 3
              : quality === ConnectionQuality.Poor
                ? 1
                : 0;
        setConnectionLevel(level);
      });

      let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

      room.on(RoomEvent.Reconnecting, () => {
        logger.warn('LiveKit reconnecting', { channelId });
        setConnectionLevel(1);
        setToastMsg('Bağlantı kesildi, yeniden bağlanılıyor...');
        reconnectTimeout = setTimeout(async () => {
          console.log('[LK] Reconnect timeout (15s) — zorla disconnect');
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
          room.localParticipant?.identity || currentUserRef.current.name;

        // Always clean the member list and notify others
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

        // Only update app-level state if this room is still the active room.
        // On channel switch, livekitRoomRef is already null (cleared above)
        // so we won't accidentally reset state for the new room.
        if (livekitRoomRef.current === room) {
          livekitRoomRef.current = null;
          isConnectingRef.current = false;
          setIsConnecting(false);
          if (reason !== DisconnectReason.CLIENT_INITIATED) {
            console.log('[LK] Non-CLIENT_INITIATED → activeChannel null');
            setActiveChannel(null);
            connectionLostRef.current = true;
            setConnectionLevel(0);
            setToastMsg(
              'Bağlantı kesildi. İnternet bağlantınızı kontrol ediniz.',
            );
          } else {
            playSound('leave');
            setConnectionLevel(4);
          }
        }
      });

      logger.info('LiveKit connecting', { channelId, url: LIVEKIT_URL });
      await room.connect(LIVEKIT_URL, token);
      logger.info('LiveKit connected', { channelId, identity: room.localParticipant.identity });

      // Set ref only after successful connect
      livekitRoomRef.current = room;

      updateMembers();
      syncUsers();
      playSound('join');

      // Odaya girerken mikrofon her zaman kapalı başlar.
      // isVoiceBanned olsun ya da olmasın: PTT effect konuşmayı kontrol eder,
      // ban durumu değiştiğinde App.tsx'teki effect mic'i tekrar kapatır.
      await room.localParticipant.setMicrophoneEnabled(false);

      console.log('[LK] connectToLiveKit TAMAMLANDI ✓');
      isConnectingRef.current = false;
      return true;
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Odaya bağlanılamadı.';
      logger.error('LiveKit bağlantı hatası', {
        channelId,
        message: msg,
        stack: (err as Error)?.stack,
      });
      isConnectingRef.current = false;
      setIsConnecting(false); // UI'ın "bağlanılıyor" state'inde kalmasını önle
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 6000);
      return false;
    }
  };

  return { livekitRoomRef, connectToLiveKit, disconnectFromLiveKit };
}
