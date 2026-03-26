import { useRef } from 'react';
import type React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, updateUserAppVersion } from '../lib/supabase';
import type { User, VoiceChannel } from '../types';

// ── Heartbeat: 5sn'de bir track, 15sn'den eski → stale sayılır ──────────
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_STALE_MS = 15_000;

type PresencePayload = {
  userId: string;
  appVersion?: string;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  currentRoom?: string;
  userName?: string;
  lastHeartbeat?: number;
};

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
      inviterAvatar?: string;
      roomName: string;
      roomId: string;
    } | null,
  ) => void;
  onMoved: (targetChannelId: string) => void;
  onPasswordResetUpdate?: (userId: string) => void;
  onInviteRejected?: (inviteeId: string) => void;
  onInviteAccepted?: (inviteeId: string) => void;
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
  onInviteRejected,
  onInviteAccepted,
}: Props) {
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Persistent cross-render cache: userId → appVersion
  const knownVersionsRef = useRef<Map<string, string>>(new Map());

  // Heartbeat refs
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTrackRef = useRef<Record<string, unknown> | null>(null);

  const disconnectRef = useRef(disconnectFromLiveKit);
  disconnectRef.current = disconnectFromLiveKit;

  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;

  const onPasswordResetUpdateRef = useRef(onPasswordResetUpdate);
  onPasswordResetUpdateRef.current = onPasswordResetUpdate;

  const onInviteRejectedRef = useRef(onInviteRejected);
  onInviteRejectedRef.current = onInviteRejected;

  const onInviteAcceptedRef = useRef(onInviteAccepted);
  onInviteAcceptedRef.current = onInviteAccepted;

  // ── trackPresence: tek noktadan track + lastHeartbeat + ref güncelle ───
  const trackPresence = (payload: Record<string, unknown>) => {
    const ch = presenceChannelRef.current;
    if (!ch) return;
    const full = { ...payload, lastHeartbeat: Date.now() };
    lastTrackRef.current = full;
    ch.track(full);
  };

  // ── Stale-aware: presenceData'dan alive olanları filtrele ──────────────
  const filterAlive = (presenceData: PresencePayload[]): PresencePayload[] => {
    const now = Date.now();
    return presenceData.filter(
      p => !p.lastHeartbeat || (now - p.lastHeartbeat) <= HEARTBEAT_STALE_MS,
    );
  };

  // ── Presence-derived room membership sync ────────────────────────────────
  const syncRoomMembersFromPresence = (
    presenceData: Array<{ currentRoom?: string; userName?: string; lastHeartbeat?: number }>,
  ) => {
    const now = Date.now();
    const roomMembers = new Map<string, string[]>();
    for (const p of presenceData) {
      // Skip stale heartbeats
      if (p.lastHeartbeat && (now - p.lastHeartbeat) > HEARTBEAT_STALE_MS) continue;
      if (p.currentRoom && p.userName) {
        const list = roomMembers.get(p.currentRoom) || [];
        if (!list.includes(p.userName)) list.push(p.userName);
        roomMembers.set(p.currentRoom, list);
      }
    }

    const myName = currentUserRef.current.name;
    const myChannel = activeChannelRef.current;

    setChannels(prev => {
      let hasChanges = false;
      const next = prev.map(c => {
        const presenceMembers = roomMembers.get(c.id) || [];
        let members = [...presenceMembers];
        if (myChannel === c.id && myName && !members.includes(myName)) {
          members.push(myName);
        }
        if (myChannel !== c.id && myName) {
          members = members.filter(m => m !== myName);
        }
        const currentMembers = c.members || [];
        const sortedNew = [...members].sort();
        const sortedOld = [...currentMembers].sort();
        if (
          sortedNew.length !== sortedOld.length ||
          sortedNew.some((m, i) => m !== sortedOld[i])
        ) {
          hasChanges = true;
          return { ...c, members, userCount: members.length };
        }
        return c;
      });
      return hasChanges ? next : prev;
    });
  };

  const startPresence = (user: User, appVersion?: string) => {
    // Önceki heartbeat'i temizle
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
    }

    const channel = supabase.channel('app-presence', {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = channel;

    const applyPresenceState = () => {
      const state = channel.presenceState<PresencePayload>();
      const presenceData = Object.values(state).flatMap(s => s);

      // Alive filter: stale heartbeat'li kullanıcıları online/room'dan çıkar
      const aliveData = filterAlive(presenceData);

      const onlineIds = new Set(aliveData.map(p => p.userId));

      // Version cache: tüm datadan (stale dahil) — versiyon expire olmaz
      const versionMap = new Map(
        presenceData.filter(p => p.appVersion).map(p => [p.userId, p.appVersion!]),
      );
      versionMap.forEach((v, id) => knownVersionsRef.current.set(id, v));

      const audioMap = new Map(
        aliveData
          .filter(p => p.selfMuted !== undefined || p.selfDeafened !== undefined)
          .map(p => [p.userId, { selfMuted: p.selfMuted, selfDeafened: p.selfDeafened }]),
      );

      const now = Date.now();
      setAllUsers(prev =>
        prev.map(u => {
          const audio = audioMap.get(u.id);
          const wasOnline = u.status === 'online';
          const willBeOnline = u.id === user.id || onlineIds.has(u.id);
          return {
            ...u,
            appVersion: versionMap.get(u.id) ?? knownVersionsRef.current.get(u.id) ?? u.appVersion,
            status: willBeOnline ? 'online' : 'offline',
            statusText:
              u.id === user.id
                ? u.statusText
                : willBeOnline
                  ? u.statusText === 'Çevrimdışı'
                    ? 'Aktif'
                    : u.statusText
                  : 'Çevrimdışı',
            onlineSince: willBeOnline
              ? (u.onlineSince ?? now)
              : undefined,
            lastSeenAt: !willBeOnline && wasOnline
              ? new Date().toISOString()
              : u.lastSeenAt,
            ...(audio !== undefined && u.id !== user.id && {
              selfMuted: audio.selfMuted,
              selfDeafened: audio.selfDeafened,
            }),
          } as User;
        }),
      );

      // Room membership from alive presence data
      syncRoomMembersFromPresence(aliveData);
    };

    channel.on('presence', { event: 'sync' }, () => {
      applyPresenceState();
    });
    channel.on('presence', { event: 'join' }, applyPresenceState);
    channel.on('presence', { event: 'leave' }, applyPresenceState);

    channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (payload.inviteeId === user.id) {
        setInvitationModal({
          inviterId: payload.inviterId,
          inviterName: payload.inviterName,
          inviterAvatar: payload.inviterAvatar,
          roomName: payload.roomName,
          roomId: payload.roomId,
        });
      }
    });

    channel.on('broadcast', { event: 'invite-accepted' }, ({ payload }) => {
      if (payload.inviterId === user.id && payload.inviteeId) {
        onInviteAcceptedRef.current?.(payload.inviteeId);
      }
    });

    channel.on('broadcast', { event: 'invite-rejected' }, ({ payload }) => {
      if (payload.inviterId === user.id) {
        setToastMsg(`${payload.inviteeName} davetinize icabet etmedi.`);
        setTimeout(() => setToastMsg(null), 4000);
        if (payload.inviteeId) {
          onInviteRejectedRef.current?.(payload.inviteeId);
        }
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
            ? {
                ...u,
                isSpeaking: payload.isSpeaking,
                ...(payload.selfMuted    !== undefined && { selfMuted:    payload.selfMuted }),
                ...(payload.selfDeafened !== undefined && { selfDeafened: payload.selfDeafened }),
              }
            : u,
        ),
      );
    });

    channel.on('broadcast', { event: 'moderation' }, ({ payload }) => {
      if (payload.userId === user.id) {
        setCurrentUser(prev => ({ ...prev, ...payload.updates }));
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
      activeChannelRef.current = null;
      setActiveChannel(null);
      disconnectRef.current().then(() => {
        onMovedRef.current(payload.targetChannelId);
      });
    });

    // ── room-leave: kullanıcı graceful çıkış yaptığında anında temizle ──
    channel.on('broadcast', { event: 'room-leave' }, ({ payload }) => {
      if (!payload.userName || !payload.channelId) return;
      setChannels(prev => prev.map(c => {
        if (c.id !== payload.channelId) return c;
        const members = (c.members || []).filter(m => m !== payload.userName);
        if (members.length === (c.members || []).length) return c;
        return { ...c, members, userCount: members.length };
      }));
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
            const myName = currentUserRef.current.name;
            const myChannel = activeChannelRef.current;

            if (c.id !== payload.channelId) {
              if (Array.isArray(payload.updates?.members)) {
                const incomingMembers = payload.updates.members as string[];
                const filtered = (c.members || []).filter(
                  m => m === myName || !incomingMembers.includes(m),
                );
                if (filtered.length !== (c.members || []).length) {
                  return { ...c, members: filtered, userCount: filtered.length };
                }
              }
              return c;
            }

            const updates = { ...payload.updates };
            if (Array.isArray(updates.members)) {
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
        const initPayload: Record<string, unknown> = {
          userId: user.id,
          appVersion: appVersion ?? '',
          userName: user.name,
          currentRoom: activeChannelRef.current || undefined,
        };
        trackPresence(initPayload);

        if (appVersion && appVersion !== user.appVersion) {
          updateUserAppVersion(user.id, appVersion).catch(() => {});
        }

        applyPresenceState();
        setTimeout(applyPresenceState, 300);

        // ── Heartbeat: 5sn'de bir track güncelle ─────────────────────────
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (!lastTrackRef.current) return;
          const payload = {
            ...lastTrackRef.current,
            currentRoom: activeChannelRef.current || undefined,
            lastHeartbeat: Date.now(),
          };
          lastTrackRef.current = payload;
          channel.track(payload).catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);
      }
    });
  };

  // ── cleanupPresence: graceful çıkış — broadcast + untrack + unsubscribe ─
  const cleanupPresence = () => {
    // 1. Heartbeat durdur
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    const ch = presenceChannelRef.current;
    if (!ch) return;

    const myName = currentUserRef.current.name;
    const myChannel = activeChannelRef.current;

    // 2. Odadaysa anında room-leave broadcast (fire-and-forget, sync WebSocket push)
    if (myChannel && myName) {
      ch.send({
        type: 'broadcast',
        event: 'room-leave',
        payload: { userName: myName, channelId: myChannel },
      });
    }

    // 3. Presence'dan kaldır + kanalı kapat
    ch.untrack();
    ch.unsubscribe();
    presenceChannelRef.current = null;
    lastTrackRef.current = null;
  };

  // stopPresence artık cleanupPresence'a delege ediyor
  const stopPresence = () => {
    cleanupPresence();
  };

  const resyncPresence = () => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    const state = channel.presenceState<PresencePayload>();
    const presenceData = (Object.values(state).flatMap(s => s)) as PresencePayload[];

    const aliveData = filterAlive(presenceData);
    const onlineIds = new Set(aliveData.map(p => p.userId));

    const mergedVersionMap = new Map(knownVersionsRef.current);
    presenceData.filter(p => p.appVersion).forEach(p => {
      mergedVersionMap.set(p.userId, p.appVersion!);
      knownVersionsRef.current.set(p.userId, p.appVersion!);
    });

    if (onlineIds.size === 0 && mergedVersionMap.size === 0) return;

    setAllUsers(prev =>
      prev.map(u => {
        const cachedVersion = mergedVersionMap.get(u.id);
        if (onlineIds.has(u.id)) {
          return {
            ...u,
            appVersion: cachedVersion ?? u.appVersion,
            status: 'online' as const,
            statusText: u.statusText === 'Çevrimdışı' ? 'Aktif' : u.statusText,
          };
        }
        if (cachedVersion && cachedVersion !== u.appVersion) {
          return { ...u, appVersion: cachedVersion };
        }
        return u;
      }),
    );

    // Room membership from alive presence data
    syncRoomMembersFromPresence(aliveData);
  };

  return {
    presenceChannelRef,
    knownVersionsRef,
    startPresence,
    stopPresence,
    cleanupPresence,
    resyncPresence,
    trackPresence,
  };
}
