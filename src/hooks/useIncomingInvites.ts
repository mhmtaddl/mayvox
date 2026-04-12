import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getMyInvites,
  acceptServerInvite,
  declineServerInvite,
  type UserInvite,
} from '../lib/serverService';
import { subscribeInviteEvents, subscribeConnectionStatus, type InviteEvent } from '../lib/chatService';

const POLL_INTERVAL_MS = 60_000;

export interface UseIncomingInvitesApi {
  invites: UserInvite[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  acceptInvite: (inviteId: string) => Promise<void>;
  declineInvite: (inviteId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Kullanıcıya gelen sunucu davetlerini yönetir.
 *
 * Realtime first, polling fallback:
 * - Chat WS üzerinden `invite:new` / `invite:removed` event'leri dinlenir.
 * - 60 sn polling fallback olarak çalışır (WS koparsa kullanıcı unutulmasın).
 *
 * İlk yükleme (`loading`) ile arka plan refresh (`refreshing`) ayrı tutulur.
 * Çakışan fetch istekleri guard ile engellenir; stale response state'e yazılmaz.
 * Unmount sonrası state güncellemesi yapılmaz.
 * Refresh sırasında hata olursa mevcut liste korunur, sadece `error` güncellenir.
 */
export function useIncomingInvites(): UseIncomingInvitesApi {
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const load = useCallback(async (isInitial: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;

    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await getMyInvites();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setInvites(data);
      setError('');
    } catch (e) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const msg = e instanceof Error ? e.message : 'Davetler yüklenemedi';
      setError(msg);
      if (isInitial) setInvites([]);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        if (isInitial) setLoading(false);
        else setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load(true);

    // Tab gizliyken poll etme; görünür olunca hemen bir tur at.
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      load(false);
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Realtime: WS event'leriyle anlık güncelleme.
    const unsubscribeInvites = subscribeInviteEvents((event: InviteEvent) => {
      if (!mountedRef.current) return;
      if (event.type === 'invite:removed' && event.inviteId) {
        // Multi-device sync: local optimistic remove + canonical refresh.
        setInvites(prev => prev.filter(inv => inv.id !== event.inviteId));
        void load(false);
        return;
      }
      if (event.type === 'invite:new') {
        // Yeni davet: tam detayı backend'den al — payload minimal tutuluyor.
        void load(false);
      }
    });

    // Reconnect senkronu: WS disconnect/reconnecting iken emit edilen event'ler kaçmış
    // olabilir. 'connected' transition'ı geldiğinde canonical fetch yap.
    // İlk 'connected' skip edilir çünkü mount'ta zaten load(true) çalıştı.
    let seenConnected = false;
    const unsubscribeStatus = subscribeConnectionStatus((status) => {
      if (!mountedRef.current) return;
      if (status !== 'connected') return;
      if (!seenConnected) { seenConnected = true; return; }
      // Gerçek reconnect — missed events için canonical fetch.
      void load(false);
    });

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeInvites();
      unsubscribeStatus();
    };
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  const acceptInvite = useCallback(async (inviteId: string) => {
    await acceptServerInvite(inviteId);
    if (!mountedRef.current) return;
    setInvites(prev => prev.filter(inv => inv.id !== inviteId));
    // Sunucu state'iyle drift'i önle: sessiz arka plan refresh.
    void load(false);
  }, [load]);

  const declineInvite = useCallback(async (inviteId: string) => {
    await declineServerInvite(inviteId);
    if (!mountedRef.current) return;
    setInvites(prev => prev.filter(inv => inv.id !== inviteId));
    // Drift önle: başka cihazdan eklenen yeni davetler varsa sessiz refresh ile yakala.
    void load(false);
  }, [load]);

  return { invites, loading, refreshing, error, acceptInvite, declineInvite, refresh };
}
