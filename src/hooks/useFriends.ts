import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { playNotification } from '../lib/audio/SoundManager';
import { playNotifyBeep } from '../features/notifications/notificationSound';

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
      const { data } = await supabase
        .from('friendships')
        .select('user_low_id, user_high_id')
        .or(`user_low_id.eq.${currentUserId},user_high_id.eq.${currentUserId}`);

      if (!mountedRef.current) return;
      const ids = new Set<string>();
      for (const row of data || []) {
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
      const { data } = await supabase
        .from('friend_requests')
        .select('id, sender_id, receiver_id, status, created_at')
        .eq('status', 'pending')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

      if (!mountedRef.current) return;
      setRequests(
        (data || []).map(r => ({
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

  // ── Supabase Realtime — friend_requests + friendships ───────────────────
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel(`friends:${currentUserId}`)
      // friend_requests tablosu — INSERT/UPDATE/DELETE
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'friend_requests' },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (!row) return;
          // Bu kullanıcıyla ilgili mi kontrol et
          const isRelevant = row.sender_id === currentUserId || row.receiver_id === currentUserId;
          if (!isRelevant) return;

          // Yeni gelen arkadaşlık isteği → bildirim sesi çal.
          // INSERT + ben receiver + başkasından + pending. MP3 (bildirim_gelme.mp3)
          // playNotification; başarısızsa beep fallback (NotificationSound).
          if (payload.eventType === 'INSERT'
              && row.receiver_id === currentUserId
              && row.sender_id !== currentUserId
              && row.status === 'pending') {
            const ok = playNotification();
            if (!ok) playNotifyBeep();
          }

          // State'i tam yeniden fetch et — en güvenli yol
          fetchRequests();
          // Eğer accepted ise friendships da değişmiş olabilir
          if (row.status === 'accepted') fetchFriends();
        }
      )
      // friendships tablosu — INSERT/DELETE
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'friendships' },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (!row) return;
          const isRelevant = row.user_low_id === currentUserId || row.user_high_id === currentUserId;
          if (!isRelevant) return;
          fetchFriends();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

    const { data, error } = await supabase
      .from('friend_requests')
      .insert({ sender_id: currentUserId, receiver_id: otherId })
      .select('id, sender_id, receiver_id, status, created_at')
      .single();

    if (error) {
      // Duplicate pending (unique index)
      if (error.code === '23505') return false;
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

    // 1. Update request → accepted
    const { error: updateErr } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', req.id);

    if (updateErr) {
      console.error('acceptRequest update error:', updateErr);
      return false;
    }

    // 2. Insert into friendships
    const [low, high] = currentUserId < otherId
      ? [currentUserId, otherId]
      : [otherId, currentUserId];

    const { error: insertErr } = await supabase
      .from('friendships')
      .insert({ user_low_id: low, user_high_id: high });

    if (insertErr && insertErr.code !== '23505') {
      console.error('acceptRequest insert error:', insertErr);
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

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', req.id);

    if (error) {
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

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', req.id);

    if (error) {
      console.error('cancelRequest error:', error);
      return false;
    }

    setRequests(prev => prev.filter(r => r.id !== req.id));
    return true;
  }, [currentUserId, outgoingMap]);

  const removeFriend = useCallback(async (otherId: string): Promise<boolean> => {
    if (!currentUserId) return false;

    const [low, high] = currentUserId < otherId
      ? [currentUserId, otherId]
      : [otherId, currentUserId];

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_low_id', low)
      .eq('user_high_id', high);

    if (error) {
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
