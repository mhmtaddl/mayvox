import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminUserSessions, type AdminUserSession } from '../lib/systemAdminApi';
import { subscribePresenceEvents } from '../lib/chatService';

interface Result {
  data: AdminUserSession[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const REFETCH_DEBOUNCE_MS = 300;

/**
 * Admin panel hook — tek user'ın sessions'ını backend'den çeker + presence
 * event'leriyle tazelenir.
 *
 * Kullanım:
 *   const { data, loading, error } = useAdminUserSessions(userId);
 *
 * Realtime:
 *   - presence:update (userId === target) → refetch (debounced)
 *   - presence:snapshot (onlineUserIds içerir target) → refetch (debounced)
 *
 * Performans:
 *   - Modal kapalıyken userId=null → hiç fetch/listen yok
 *   - Debounce: burst presence event'leri tek fetch'e indirger
 *   - AbortController: hızlı userId değişiminde stale response ignore
 */
export function useAdminUserSessions(userId: string | null): Result {
  const [data, setData] = useState<AdminUserSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async (uid: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const r = await getAdminUserSessions(uid);
      if (ac.signal.aborted) return;
      setData(r.sessions);
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Session bilgisi alınamadı');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    if (!userId) return;
    await fetchOnce(userId);
  }, [userId, fetchOnce]);

  // Mount / userId change → fetch
  useEffect(() => {
    if (!userId) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }
    fetchOnce(userId);
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId, fetchOnce]);

  // Realtime: presence events → debounced refetch
  useEffect(() => {
    if (!userId) return;
    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchOnce(userId);
      }, REFETCH_DEBOUNCE_MS);
    };
    const unsub = subscribePresenceEvents((ev) => {
      if (ev.type === 'presence:update' && ev.userId === userId) {
        scheduleRefetch();
      } else if (ev.type === 'presence:snapshot' && ev.onlineUserIds.includes(userId)) {
        scheduleRefetch();
      }
    });
    return () => { unsub(); };
  }, [userId, fetchOnce]);

  return { data, loading, error, refetch };
}
