import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { subscribeRealtimeEvents } from '../lib/chatService';
import { playNotification } from '../lib/audio/SoundManager';
import { playNotifyBeep } from '../features/notifications/notificationSound';
import { shouldSuppressSettingsSoundInChatRoom } from '../lib/soundRoomPreference';
import {
  getFriendState,
  sendFriendRequest,
  updateFriendRequest,
  removeFriendship,
} from '../lib/friendsClient';

export type RequestDirection = 'incoming' | 'outgoing';

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

/**
 * useFriends v2 — request-based friendship system.
 * Layers: friendships (accepted) + friend_requests (pending/accepted/rejected).
 */
export function useFriends(currentUserId: string | undefined) {
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // ── Fetch friendships ────────────────────────────────────────────────────
  const fetchFriends = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const data = await getFriendState();

      if (!mountedRef.current) return;
      const ids = new Set<string>();
      for (const row of data.friends || []) {
        ids.add(row.user_low_id === currentUserId ? row.user_high_id : row.user_low_id);
      }
      setFriendIds(ids);
    } catch (e) {
      console.error('fetchFriends error:', e);
    }
  }, [currentUserId]);

  // ── Fetch pending requests ───────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const data = await getFriendState();

      if (!mountedRef.current) return;
      setRequests(
        (data.requests || []).map(r => ({
          id: r.id,
          senderId: r.sender_id,
          receiverId: r.receiver_id,
          status: r.status,
          createdAt: r.created_at,
        }))
      );
    } catch (e) {
      console.error('fetchRequests error:', e);
    }
  }, [currentUserId]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      await Promise.all([fetchFriends(), fetchRequests()]);
      if (mountedRef.current) setLoading(false);
    };
    load();
    return () => { mountedRef.current = false; };
  }, [fetchFriends, fetchRequests]);

  // ── WebSocket realtime — friend_requests + friendships ──────────────────
  useEffect(() => {
    if (!currentUserId) return;

    return subscribeRealtimeEvents(event => {
      if (event.type !== 'friend-update') return;
      const payload = event.payload || {};
      const targetUserIds = Array.isArray(payload.userIds) ? payload.userIds : [];
      const row = payload.row || payload.new || payload.old || {};
      const isRelevant =
        targetUserIds.includes(currentUserId) ||
        row.sender_id === currentUserId ||
        row.receiver_id === currentUserId ||
        row.user_low_id === currentUserId ||
        row.user_high_id === currentUserId;
      if (!isRelevant) return;

      if (
        payload.eventType === 'INSERT' &&
        row.receiver_id === currentUserId &&
        row.sender_id !== currentUserId &&
        row.status === 'pending'
      ) {
        if (!shouldSuppressSettingsSoundInChatRoom()) {
          const ok = playNotification();
          if (!ok) playNotifyBeep();
        }
      }

      void fetchRequests();
      void fetchFriends();
    });
  }, [currentUserId, fetchFriends, fetchRequests]);

  // ── Derived maps ─────────────────────────────────────────────────────────
  const incomingMap = useMemo(() => {
    const m = new Map<string, FriendRequest>();
    for (const r of requests) {
      if (r.receiverId === currentUserId && r.status === 'pending') m.set(r.senderId, r);
    }
    return m;
  }, [requests, currentUserId]);

  const outgoingMap = useMemo(() => {
    const m = new Map<string, FriendRequest>();
    for (const r of requests) {
      if (r.senderId === currentUserId && r.status === 'pending') m.set(r.receiverId, r);
    }
    return m;
  }, [requests, currentUserId]);

  const incomingRequests = useMemo(
    () => requests.filter(r => r.receiverId === currentUserId && r.status === 'pending'),
    [requests, currentUserId]
  );

  // ── Queries ──────────────────────────────────────────────────────────────
  const isFriend = useCallback(
    (otherId: string) => friendIds.has(otherId),
    [friendIds]
  );

  /**
   * Returns: 'friend' | 'incoming' | 'outgoing' | null
   */
  const getRelationship = useCallback(
    (otherId: string): 'friend' | 'incoming' | 'outgoing' | null => {
      if (friendIds.has(otherId)) return 'friend';
      if (incomingMap.has(otherId)) return 'incoming';
      if (outgoingMap.has(otherId)) return 'outgoing';
      return null;
    },
    [friendIds, incomingMap, outgoingMap]
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const sendRequest = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId || otherId === currentUserId) return false;
    if (friendIds.has(otherId)) return false; // already friends

    let data;
    try {
      const res = await sendFriendRequest(otherId);
      data = res.data;
    } catch (error) {
      console.error('sendRequest error:', error);
      return false;
    }

    if (data) {
      setRequests(prev => [...prev, {
        id: data.id,
        senderId: data.sender_id,
        receiverId: data.receiver_id,
        status: data.status,
        createdAt: data.created_at,
      }]);
    }
    return true;
  }, [currentUserId, friendIds]);

  const acceptRequest = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const req = incomingMap.get(otherId);
    if (!req) return false;

    try {
      await updateFriendRequest(req.id, 'accepted');
    } catch (error) {
      console.error('acceptRequest error:', error);
      return false;
    }

    // 3. Update local state
    setFriendIds(prev => new Set([...prev, otherId]));
    setRequests(prev => prev.filter(r => r.id !== req.id));
    return true;
  }, [currentUserId, incomingMap]);

  const rejectRequest = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const req = incomingMap.get(otherId);
    if (!req) return false;

    try {
      await updateFriendRequest(req.id, 'rejected');
    } catch (error) {
      console.error('rejectRequest error:', error);
      return false;
    }

    setRequests(prev => prev.filter(r => r.id !== req.id));
    return true;
  }, [currentUserId, incomingMap]);

  const cancelRequest = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const req = outgoingMap.get(otherId);
    if (!req) return false;

    try {
      await updateFriendRequest(req.id, 'rejected');
    } catch (error) {
      console.error('cancelRequest error:', error);
      return false;
    }

    setRequests(prev => prev.filter(r => r.id !== req.id));
    return true;
  }, [currentUserId, outgoingMap]);

  const removeFriend = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId) return false;

    try {
      await removeFriendship(otherId);
    } catch (error) {
      console.error('removeFriend error:', error);
      return false;
    }

    setFriendIds(prev => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
    return true;
  }, [currentUserId]);

  return {
    friendIds,
    isFriend,
    getRelationship,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    incomingRequests,
    loading,
    refetch: async () => { await Promise.all([fetchFriends(), fetchRequests()]); },
  };
}
