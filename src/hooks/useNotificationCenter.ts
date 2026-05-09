import { useMemo, useSyncExternalStore } from 'react';
import { useUser } from '../contexts/UserContext';
import { useAppState } from '../contexts/AppStateContext';
import {
  getInformationalSnapshot,
  subscribeInformational,
  type InformationalItem,
} from '../features/notifications/informationalStore';
import type { UserInvite } from '../lib/serverService';
import { getPublicDisplayName } from '../lib/formatName';

// ── Bildirim item tipi — panel render + gelecek genişleme için ──

export type NotifKind = 'social' | 'message' | 'system' | 'mention' | 'invite' | 'joinRequest' | 'restriction' | 'missedCall';
export type NotifPriority = 'high' | 'medium' | 'low';

export interface NotifItem {
  key: string;
  kind: NotifKind;
  priority: NotifPriority;
  label: string;
  detail: string;
  count: number;
  isActionable: boolean;
  /** joinRequest türü için hangi sunucuya gidileceği */
  serverId?: string;
  /** Informational item'lardan geliyorsa timestamp — relative time render için. */
  createdAt?: number;
  /** Aksiyon gerektiren item'larda ilgili kullanıcı (ör. arkadaşlık isteğini gönderen). */
  actorId?: string;
  /** Item avatar — arkadaşlık isteği item'ında gönderenin avatarı. */
  avatarUrl?: string | null;
  /** Okundu zamanı (ms). Informational item'lar için store'dan forward edilir; bildirim
   *  görüntülendikten sonra item silinmez, sadece "compact" gösterilir. */
  readAt?: number | null;
}

// ── Priority sıralama ağırlıkları ──
const PRIORITY_WEIGHT: Record<NotifPriority, number> = { high: 0, medium: 1, low: 2 };

export interface NotificationSummary {
  bellCount: number;
  settingsCount: number;

  friendRequestCount: number;
  dmUnreadCount: number;
  dmRequestCount: number;
  updateActionable: boolean;
  inviteReceivedCount: number;
  joinRequestCount: number;

  inviteRequestCount: number;
  passwordResetCount: number;

  isAdmin: boolean;

  /** Sıralanmış bildirim öğeleri (priority desc) */
  items: NotifItem[];
}

export interface JoinRequestSource {
  serverId: string;
  serverName: string;
  pendingCount: number;
}

/**
 * useNotificationCenter — bildirim sayılarını ve item listesini merkezden hesaplar.
 *
 * Kurallar:
 * - Ayarlar badge = yok (tüm bildirimler çanda)
 * - Çan badge = kişisel + admin bildirimler (friend + DM + update + admin invite talepleri)
 * - Item listesi priority'ye göre sıralı döner
 */
export function useNotificationCenter(
  dmUnreadCount: number = 0,
  dmRequestCount: number = 0,
  updateActionable: boolean = false,
  incomingInvites: UserInvite[] = [],
  joinRequestSources: JoinRequestSource[] = [],
): NotificationSummary {
  const { incomingRequests, currentUser, allUsers } = useUser();
  const { inviteRequests, passwordResetRequests } = useAppState();
  const informational = useSyncExternalStore<InformationalItem[]>(
    subscribeInformational,
    getInformationalSnapshot,
    getInformationalSnapshot,
  );

  return useMemo(() => {
    const isAdmin = !!(currentUser.isAdmin || currentUser.isPrimaryAdmin);

    const friendRequestCount = incomingRequests.length;
    const inviteReceivedCount = incomingInvites.length;
    const joinRequestCount = joinRequestSources.reduce((s, it) => s + it.pendingCount, 0);
    // Informational badge: sadece OKUNMAMIŞ olanları say — kullanıcı çanı açınca readAt
    // set edilir (markAllInformationalRead), bir sonraki sayımdan düşer. Onay/ret gerektiren
    // aksiyon tipleri (friend/invite/joinRequest) readAt'tan bağımsız, kaynaktan düşene kadar sayılır.
    const informationalCount = informational.filter(i => !i.readAt).length;
    const inviteRequestCount = isAdmin ? inviteRequests.length : 0;
    const passwordResetCount = isAdmin ? passwordResetRequests.length : 0;
    // DM unread bell badge'ine beslenmez — Mesajlar butonunda ayrı badge var.
    // DM request ise aksiyon isteyen bir istek olduğu için çan sayısına dahil edilir.
    const bellCount = friendRequestCount + dmRequestCount + inviteReceivedCount + joinRequestCount + informationalCount + inviteRequestCount + (updateActionable ? 1 : 0);
    const settingsCount = 0;

    // ── Item listesi oluştur ──
    const items: NotifItem[] = [];

    if (dmRequestCount > 0) {
      items.push({
        key: 'dm-requests',
        kind: 'message',
        priority: 'medium',
        label: 'Mesaj istekleri',
        detail: dmRequestCount === 1 ? '1 bekleyen istek' : `${dmRequestCount} bekleyen istek`,
        count: dmRequestCount,
        isActionable: true,
      });
    }

    if (dmUnreadCount > 0) {
      items.push({
        key: 'dm-unread',
        kind: 'message',
        priority: 'low',
        label: 'Okunmamış mesajlar',
        detail: dmUnreadCount === 1 ? '1 okunmamış mesaj' : `${dmUnreadCount} okunmamış mesaj`,
        count: dmUnreadCount,
        isActionable: true,
      });
    }

    // Her arkadaşlık isteği için ayrı item — popover'da inline Kabul/Reddet'e olanak verir.
    // Kullanıcı aksiyonu almadığı sürece item silinmez (incomingRequests source of truth).
    for (const req of incomingRequests) {
      const sender = allUsers.find(u => u.id === req.senderId);
      const senderName = getPublicDisplayName(sender);
      items.push({
        key: `friend-req:${req.id}`,
        kind: 'social',
        priority: 'medium',
        label: senderName,
        detail: 'Arkadaş olmak istiyor',
        count: 0,
        isActionable: true,
        actorId: req.senderId,
        avatarUrl: sender?.avatar ?? null,
        createdAt: new Date(req.createdAt).getTime(),
      });
    }

    // Her sunucu daveti için ayrı item — popover'da inline Kabul/Reddet.
    // Kullanıcı aksiyon almadan silinmez (incomingInvites source of truth).
    for (const inv of incomingInvites) {
      items.push({
        key: `server-inv:${inv.id}`,
        kind: 'invite',
        priority: 'medium',
        label: inv.serverName || 'Sunucu daveti',
        detail: inv.invitedByName ? `${inv.invitedByName} seni davet etti` : 'Yeni davet',
        count: 0,
        isActionable: true,
        actorId: inv.id,
        avatarUrl: inv.serverAvatar ?? null,
        createdAt: new Date(inv.createdAt).getTime(),
      });
    }

    for (const src of joinRequestSources) {
      if (src.pendingCount <= 0) continue;
      items.push({
        key: `joinreq:${src.serverId}`,
        kind: 'joinRequest',
        priority: 'medium',
        label: src.serverName || 'Sunucu başvurusu',
        detail: src.pendingCount === 1 ? '1 yeni katılma başvurusu' : `${src.pendingCount} yeni katılma başvurusu`,
        count: src.pendingCount,
        isActionable: true,
        serverId: src.serverId,
      });
    }

    // Informational (aksiyon gerektirmeyen) item'lar — çan açılınca temizlenecek.
    for (const info of informational) {
      const kind: NotifKind =
        info.kind === 'serverRestricted' || info.kind === 'serverUnrestricted'
          ? 'restriction'
          : info.kind === 'missedCall'
            ? 'missedCall'
            : 'invite';
      items.push({
        key: `info:${info.key}`,
        kind,
        priority: 'low',
        label: info.label,
        detail: info.detail,
        count: 1,
        isActionable: !!info.serverId,
        serverId: info.serverId,
        createdAt: info.createdAt,
        readAt: info.readAt ?? null,
      });
    }

    if (inviteRequestCount > 0) {
      items.push({
        key: 'admin-invite-requests',
        kind: 'invite',
        priority: 'medium',
        label: inviteRequestCount === 1 ? 'Üyelik talebi' : 'Üyelik talepleri',
        detail: inviteRequestCount === 1 ? '1 yeni üyelik talebi' : `${inviteRequestCount} yeni üyelik talebi`,
        count: inviteRequestCount,
        isActionable: true,
      });
    }

    if (updateActionable) {
      items.push({
        key: 'update',
        kind: 'system',
        priority: 'medium',
        label: 'Güncelleme hazır',
        detail: 'Yeni sürüm yüklenmeye hazır',
        count: 0,
        isActionable: true,
      });
    }

    // Priority'ye göre sırala (high → medium → low)
    items.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);

    return {
      bellCount,
      settingsCount,
      friendRequestCount,
      dmUnreadCount,
      dmRequestCount,
      updateActionable,
      inviteReceivedCount,
      joinRequestCount,
      inviteRequestCount,
      passwordResetCount,
      isAdmin,
      items,
    };
  }, [
    incomingRequests,
    allUsers,
    dmUnreadCount,
    dmRequestCount,
    updateActionable,
    incomingInvites,
    joinRequestSources,
    informational,
    inviteRequests.length,
    passwordResetRequests.length,
    currentUser.isAdmin,
    currentUser.isPrimaryAdmin,
  ]);
}
