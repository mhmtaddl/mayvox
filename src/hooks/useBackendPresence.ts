import { useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import { subscribePresenceEvents, getChatSocket } from '../lib/chatService';
import type { PresenceEvent, PresenceUserState } from '../lib/chatService';
import type { User } from '../types';

interface Deps {
  currentUserId: string | null;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const HEARTBEAT_MS = 20_000;
const OFFLINE_DEBOUNCE_MS = 3_000;

/**
 * Backend-driven presence hook.
 * - Subscribe to presence:update + presence:snapshot from chat-server
 * - Send 20s heartbeat over the existing chat WebSocket
 * - Graceful bye on unload
 * - Flapping debounce (3s) for offline transitions
 * - Server time offset tracking → getServerNow() for formatLastSeen
 *
 * Last seen yazımı tamamen backend'de; bu hook sadece state'i güncelliyor.
 */
export function useBackendPresence({ currentUserId, setAllUsers }: Deps) {
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // userId → pending offline debounce timer
  const offlineTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Server time offset (ms). +X = server X ms ilerde.
  const serverTimeOffsetRef = useRef(0);

  const getServerNow = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);

  // Presence event subscription
  useEffect(() => {
    if (!currentUserId) return;

    const apply = (userId: string, patch: Partial<User>) => {
      setAllUsers(prev => prev.map(u => (u.id === userId ? { ...u, ...patch } : u)));
    };

    const handler = (event: PresenceEvent) => {
      // Server time offset — her mesajdan yenilenir
      const serverMs = new Date(event.serverNow).getTime();
      if (Number.isFinite(serverMs)) {
        serverTimeOffsetRef.current = serverMs - Date.now();
      }

      const presencePatchFor = (u: PresenceUserState): Partial<User> => {
        const patch: Partial<User> = {
          status: u.online ? 'online' : 'offline',
          statusText: u.online ? (u.statusText || 'Online') : 'Çevrimdışı',
        };
        if (u.online) {
          patch.lastSeenAt = undefined;
          if (u.selfMuted !== undefined) patch.selfMuted = !!u.selfMuted;
          if (u.selfDeafened !== undefined) patch.selfDeafened = !!u.selfDeafened;
          if (u.autoStatus !== undefined) patch.autoStatus = u.autoStatus ?? undefined;
          if (u.gameActivity !== undefined) patch.gameActivity = u.gameActivity ?? undefined;
          if (u.currentRoom !== undefined) patch.currentRoom = u.currentRoom ?? undefined;
          if (u.onlineSince !== undefined) patch.onlineSince = u.onlineSince ?? undefined;
        } else {
          patch.lastSeenAt = u.lastSeenAt ?? undefined;
          patch.selfMuted = false;
          patch.selfDeafened = false;
          patch.autoStatus = undefined;
          patch.gameActivity = undefined;
          patch.currentRoom = undefined;
        }
        if (u.appVersion !== undefined) patch.appVersion = u.appVersion;
        if (u.platform !== undefined) patch.platform = u.platform;
        if (u.serverId !== undefined) patch.serverId = u.serverId;
        return patch;
      };

      if (event.type === 'presence:snapshot') {
        const byId = new Map(event.users.map(u => [u.userId, u] as const));
        setAllUsers(prev => prev.map(u => {
          if (u.id === currentUserId) return u;
          const state = byId.get(u.id);
          if (!state) return u;
          const patch = presencePatchFor(state);
          console.log('[presence] STATE MERGE', {
            source: 'snapshot',
            userId: u.id,
            before: {
              status: u.status,
              statusText: u.statusText,
              selfMuted: u.selfMuted,
              selfDeafened: u.selfDeafened,
              autoStatus: u.autoStatus,
            },
            patch,
          });
          return { ...u, ...patch };
        }));
        return;
      }

      // presence:update
      const { user } = event;
      const { userId, online } = user;
      if (!userId || userId === currentUserId) return;

      if (online === true) {
        // Pending offline timer varsa iptal (flap koruması)
        const pending = offlineTimersRef.current.get(userId);
        if (pending) {
          clearTimeout(pending);
          offlineTimersRef.current.delete(userId);
        }
        const patch = presencePatchFor(user);
        console.log('[presence] STATE MERGE', {
          source: 'update',
          userId,
          online,
          patch,
        });
        apply(userId, patch);
      } else if (online === false) {
        // 3sn debounce: kısa reconnect'lerde offline flicker olmasın
        const existing = offlineTimersRef.current.get(userId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          offlineTimersRef.current.delete(userId);
          const patch = presencePatchFor(user);
          console.log('[presence] STATE MERGE', {
            source: 'offline-update',
            userId,
            online,
            patch,
          });
          apply(userId, patch);
        }, OFFLINE_DEBOUNCE_MS);
        offlineTimersRef.current.set(userId, timer);
      }
    };

    const unsub = subscribePresenceEvents(handler);

    return () => {
      unsub();
      for (const t of offlineTimersRef.current.values()) clearTimeout(t);
      offlineTimersRef.current.clear();
    };
  }, [currentUserId, setAllUsers]);

  // Heartbeat + graceful bye
  useEffect(() => {
    if (!currentUserId) return;

    const startHeartbeat = () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        const socket = getChatSocket();
        if (socket && socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: 'presence:ping' })); }
          catch (err) { console.warn('[useBackendPresence] ping send failed:', err); }
        }
      }, HEARTBEAT_MS);
    };

    const stopHeartbeat = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    const sendBye = () => {
      const socket = getChatSocket();
      if (socket && socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'presence:bye' })); }
        catch { /* ignore */ }
      }
    };

    startHeartbeat();

    const onBeforeUnload = () => sendBye();
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      stopHeartbeat();
      window.removeEventListener('beforeunload', onBeforeUnload);
      sendBye();
    };
  }, [currentUserId]);

  return { getServerNow };
}
