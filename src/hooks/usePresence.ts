import { useRef } from 'react';
import type React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { User, VoiceChannel } from '../types';

interface Props {
  currentUserRef: React.MutableRefObject<User>;
  activeChannelRef: React.MutableRefObject<string | null>;
  disconnectFromLiveKit: () => Promise<void>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  setToastMsg: (v: string | null) => void;
  setInvitationModal: (
    v: {
      inviterId: string;
      inviterName: string;
      roomName: string;
      roomId: string;
    } | null,
  ) => void;
  onMoved: (targetChannelId: string) => void;
  onPasswordResetUpdate?: (userId: string) => void;
}

export function usePresence({
  currentUserRef,
  activeChannelRef,
  disconnectFromLiveKit,
  setAllUsers,
  setCurrentUser,
  setChannels,
  setActiveChannel,
  setToastMsg,
  setInvitationModal,
  onMoved,
  onPasswordResetUpdate,
}: Props) {
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Use a ref so the kick handler always calls the latest disconnectFromLiveKit
  const disconnectRef = useRef(disconnectFromLiveKit);
  disconnectRef.current = disconnectFromLiveKit;

  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;

  const onPasswordResetUpdateRef = useRef(onPasswordResetUpdate);
  onPasswordResetUpdateRef.current = onPasswordResetUpdate;

  const startPresence = (user: User, appVersion?: string) => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
    }

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = channel;

    const applyPresenceState = () => {
      const state = channel.presenceState<{ userId: string; appVersion?: string }>();
      const presenceData = Object.values(state).flatMap(s => s);
      const onlineIds = new Set(presenceData.map(p => p.userId));
      const versionMap = new Map(
        presenceData.filter(p => p.appVersion).map(p => [p.userId, p.appVersion!]),
      );
      setAllUsers(prev =>
        prev.map(
          u =>
            ({
              ...u,
              appVersion: versionMap.get(u.id) ?? u.appVersion,
              status:
                u.id === user.id
                  ? 'online'
                  : onlineIds.has(u.id)
                    ? 'online'
                    : 'offline',
              statusText:
                u.id === user.id
                  ? u.statusText
                  : onlineIds.has(u.id)
                    ? u.statusText === 'Çevrimdışı'
                      ? 'Aktif'
                      : u.statusText
                    : 'Çevrimdışı',
            }) as User,
        ),
      );
    };

    channel.on('presence', { event: 'sync' }, applyPresenceState);
    channel.on('presence', { event: 'join' }, applyPresenceState);
    channel.on('presence', { event: 'leave' }, applyPresenceState);

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
        disconnectRef.current();
        setToastMsg('Odadan çıkarıldınız.');
        setTimeout(() => setToastMsg(null), 4000);
      }
    });

    channel.on('broadcast', { event: 'speaking' }, ({ payload }) => {
      if (payload.userId === user.id) return;
      setAllUsers(prev =>
        prev.map(u =>
          u.id === payload.userId
            ? { ...u, isSpeaking: payload.isSpeaking }
            : u,
        ),
      );
    });

    channel.on('broadcast', { event: 'moderation' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setCurrentUser(prev => ({ ...prev, ...payload.updates }));
        // Ban geldiğinde aktif sesli kanaldan çıkar
        if (payload.updates.isVoiceBanned === true) {
          setActiveChannel(null);
          disconnectRef.current();
        }
      }
      setAllUsers(prev =>
        prev.map(u =>
          u.id === payload.userId ? { ...u, ...payload.updates } : u,
        ),
      );
    });

    channel.on('broadcast', { event: 'password-reset-update' }, ({ payload }) => {
      onPasswordResetUpdateRef.current?.(payload.userId);
    });

    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.userId !== user.id) return;
      setActiveChannel(null);
      disconnectRef.current().then(() => {
        onMovedRef.current(payload.targetChannelId);
      });
    });

    channel.on('broadcast', { event: 'channel-update' }, ({ payload }) => {
      if (payload.action === 'create') {
        setChannels(prev =>
          prev.find(c => c.id === payload.channel.id)
            ? prev
            : [...prev, payload.channel],
        );
      } else if (payload.action === 'delete') {
        setChannels(prev => prev.filter(c => c.id !== payload.channelId));
        setActiveChannel(prev =>
          prev === payload.channelId ? null : prev,
        );
      } else if (payload.action === 'update') {
        setChannels(prev =>
          prev.map(c => {
            if (c.id !== payload.channelId) return c;
            const updates = { ...payload.updates };
            if (Array.isArray(updates.members)) {
              const myName = currentUserRef.current.name;
              const myChannel = activeChannelRef.current;
              // Remove own name then re-add based on actual channel membership.
              // This prevents stale broadcasts causing duplicate member entries.
              updates.members = (updates.members as string[]).filter(
                m => m !== myName,
              );
              if (myChannel === payload.channelId && myName) {
                updates.members = [...updates.members, myName];
              }
              updates.userCount = updates.members.length;
            }
            return { ...c, ...updates };
          }),
        );
      }
    });

    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId: user.id, appVersion: appVersion ?? '' });
      }
    });
  };

  const stopPresence = () => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
      presenceChannelRef.current = null;
    }
  };

  const resyncPresence = () => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const state = channel.presenceState<{ userId: string }>();
    const onlineIds = new Set(
      Object.values(state).flatMap(s => (s as { userId: string }[]).map(p => p.userId)),
    );
    if (onlineIds.size === 0) return;
    setAllUsers(prev =>
      prev.map(u => {
        if (onlineIds.has(u.id)) {
          return {
            ...u,
            status: 'online' as const,
            statusText: u.statusText === 'Çevrimdışı' ? 'Aktif' : u.statusText,
          };
        }
        return u;
      }),
    );
  };

  return { presenceChannelRef, startPresence, stopPresence, resyncPresence };
}
