import { useEffect, useRef, useCallback } from 'react';
import type React from 'react';
import { subscribePresenceEvents, getChatSocket } from '../lib/chatService';
import type { PresenceEvent } from '../lib/chatService';
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

      if (event.type === 'presence:snapshot') {
        const onlineSet = new Set(event.onlineUserIds);
        setAllUsers(prev => prev.map(u => {
          if (u.id === currentUserId) return u;
          if (onlineSet.has(u.id)) {
            return u.status === 'online' ? u : { ...u, status: 'online' as const };
          }
          return u.status === 'offline' ? u : { ...u, status: 'offline' as const };
        }));
        return;
      }

      // presence:update
      const { userId, online, lastSeenAt } = event;
      if (!userId || userId === currentUserId) return;

      if (online === true) {
        // Pending offline timer varsa iptal (flap koruması)
        const pending = offlineTimersRef.current.get(userId);
        if (pending) {
          clearTimeout(pending);
          offlineTimersRef.current.delete(userId);
        }
        apply(userId, { status: 'online' });
      } else if (online === false) {
        // 3sn debounce: kısa reconnect'lerde offline flicker olmasın
        const existing = offlineTimersRef.current.get(userId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          offlineTimersRef.current.delete(userId);
          apply(userId, {
            status: 'offline',
            lastSeenAt: lastSeenAt ?? undefined,
          });
        }, OFFLINE_DEBOUNCE_MS);
        offlineTimersRef.current.set(userId, timer);
      } else {
        // online === null → privacy gizli (Phase 2'de anlamlı olacak)
        apply(userId, { status: 'offline', lastSeenAt: undefined });
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
