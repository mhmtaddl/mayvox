import { useCallback, useEffect, useRef, useState } from 'react';
import { listMyPendingJoinRequestsSummary, type MyPendingJoinRequestsSummaryItem } from '../lib/serverService';
import { subscribeServerEvents, subscribeConnectionStatus, type ServerEvent } from '../lib/chatService';

const POLL_INTERVAL_MS = 45_000;

export interface UseMyPendingJoinRequestsApi {
  items: MyPendingJoinRequestsSummaryItem[];
  totalCount: number;
  refresh: () => Promise<void>;
}

/**
 * Admin/owner olduğu tüm sunuculardaki toplam pending başvuru özeti.
 * - Mount'ta ve 45 sn aralıkla fetch
 * - `server:join_request:*` WS event'i gelince anında refresh (optimistic yerine canonical)
 * - WS reconnect sonrası tek seferlik catch-up fetch
 */
export function useMyPendingJoinRequests(): UseMyPendingJoinRequestsApi {
  const [items, setItems] = useState<MyPendingJoinRequestsSummaryItem[]>([]);
  const mountedRef = useRef(true);
  const inflightRef = useRef(false);

  const load = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const data = await listMyPendingJoinRequestsSummary();
      if (mountedRef.current) setItems(data);
    } catch { /* sessizce yut: bir sonraki poll düzeltecek */ }
    finally { inflightRef.current = false; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load();
    }, POLL_INTERVAL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);

    const unsubEvents = subscribeServerEvents((event: ServerEvent) => {
      if (!mountedRef.current) return;
      if (typeof event.type !== 'string') return;
      if (event.type.startsWith('server:join_request:')) void load();
    });
    // Admin kendi ayarından onay/red verdiğinde WS push kendisine gelmez — lokal event ile refresh.
    const onLocalUpdate = () => { if (mountedRef.current) void load(); };
    window.addEventListener('pigevox:join-request:local-update', onLocalUpdate);
    let seenConnected = false;
    const unsubStatus = subscribeConnectionStatus((status) => {
      if (!mountedRef.current) return;
      if (status !== 'connected') return;
      if (!seenConnected) { seenConnected = true; return; }
      void load();
    });

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pigevox:join-request:local-update', onLocalUpdate);
      unsubEvents();
      unsubStatus();
    };
  }, [load]);

  const totalCount = items.reduce((sum, it) => sum + it.pendingCount, 0);
  return { items, totalCount, refresh: load };
}
