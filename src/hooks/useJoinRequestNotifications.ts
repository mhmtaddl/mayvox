import { useEffect, useRef } from 'react';
import { subscribeServerEvents, type ServerEvent } from '../lib/chatService';
import { handleJoinRequest, handleJoinRequestAccepted, handleJoinRequestRejected } from '../features/notifications/notificationService';
import { pushInformational } from '../features/notifications/informationalStore';
import { getServerDetails } from '../lib/serverService';
import { getProfile } from '../lib/backendClient';

interface Options {
  /** Accept/reject event'i geldiğinde kullanıcının sunucu listesini refresh etmek için. */
  onMembershipChanged?: () => void;
}

/**
 * Admin/owner için: sunucuya yeni başvuru geldiğinde çan bildirimi düşürür.
 *
 * WS üzerinden `server:join_request:new` event'i gelir → sunucu adı + başvuran
 * adı enrichment yapılır → notification service toast'a dönüştürür.
 * Payload minimal (serverId, requesterId) tutulduğu için detaylar lazy çekilir.
 * Fetch hatası toast'ı engellemez — fallback generic başlık gösterilir.
 */
export function useJoinRequestNotifications(opts: Options = {}): void {
  // Latest callback ref — hook ilk mount'ta sabit kalsın, callback değişince yeniden subscribe olmasın.
  const onMembershipChangedRef = useRef(opts.onMembershipChanged);
  useEffect(() => { onMembershipChangedRef.current = opts.onMembershipChanged; }, [opts.onMembershipChanged]);

  useEffect(() => {
    const unsub = subscribeServerEvents(async (event: ServerEvent) => {
      if (typeof event.type !== 'string') return;
      const serverId = typeof event.serverId === 'string' ? event.serverId : null;
      if (!serverId) return;

      if (event.type === 'server:join_request:new') {
        const requesterId = typeof event.requesterId === 'string' ? event.requesterId : null;
        let serverName: string | null = null;
        let serverAvatar: string | null = null;
        let requesterName: string | null = null;
        try {
          const s = await getServerDetails(serverId);
          serverName = s?.name ?? null;
          serverAvatar = s?.avatarUrl ?? null;
        } catch { /* no-op */ }
        if (requesterId) {
          try {
            const { data } = await getProfile(requesterId);
            const p = data as { name?: string | null; display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
            const full = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
            requesterName = p?.display_name || full || p?.name || null;
          } catch { /* no-op */ }
        }
        handleJoinRequest({ serverId, requesterId, serverName, serverAvatar, requesterName });
        window.dispatchEvent(new Event('pigevox:join-request:local-update'));
        return;
      }

      if (event.type === 'server:join_request:accepted' || event.type === 'server:join_request:rejected') {
        let serverName: string | null = null;
        let serverAvatar: string | null = null;
        try {
          const s = await getServerDetails(serverId);
          serverName = s?.name ?? null;
          serverAvatar = s?.avatarUrl ?? null;
        } catch { /* no-op */ }
        if (event.type === 'server:join_request:accepted') {
          handleJoinRequestAccepted({ serverId, serverName, serverAvatar });
          pushInformational({
            key: `joinreq-accepted:${serverId}`,
            kind: 'joinRequestAccepted',
            label: serverName || 'Başvurun kabul edildi',
            detail: serverName ? `${serverName} sunucusuna katıldın` : 'Sunucuya katıldın',
            serverId,
            serverAvatar,
            createdAt: Date.now(),
          });
        } else {
          handleJoinRequestRejected({ serverId, serverName, serverAvatar });
          pushInformational({
            key: `joinreq-rejected:${serverId}`,
            kind: 'joinRequestRejected',
            label: serverName || 'Başvurun reddedildi',
            detail: serverName ? `${serverName} başvurunu reddetti` : 'Başvurun reddedildi',
            serverId,
            serverAvatar,
            createdAt: Date.now(),
          });
        }
        // Accept → kullanıcı artık üye; reject → sunucu listesi etkilenmez ama discover
        // kartındaki pending pill'i temizlemek için refresh faydalı.
        try { onMembershipChangedRef.current?.(); } catch { /* no-op */ }
        return;
      }
    });
    return () => { unsub(); };
  }, []);
}
