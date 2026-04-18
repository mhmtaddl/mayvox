import { useMemo, useSyncExternalStore } from 'react';
import { useUser } from '../contexts/UserContext';
import { useAppState } from '../contexts/AppStateContext';
import {
  getInformationalSnapshot,
  subscribeInformational,
  type InformationalItem,
} from '../features/notifications/informationalStore';

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
}

// ── Priority sıralama ağırlıkları ──
const PRIORITY_WEIGHT: Record<NotifPriority, number> = { high: 0, medium: 1, low: 2 };

export interface NotificationSummary {
  bellCount: number;
  settingsCount: number;

  friendRequestCount: number;
  dmUnreadCount: number;
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
  updateActionable: boolean = false,
  inviteReceivedCount: number = 0,
  joinRequestSources: JoinRequestSource[] = [],
): NotificationSummary {
  const { incomingRequests, currentUser } = useUser();
  const { inviteRequests, passwordResetRequests } = useAppState();
  const informational = useSyncExternalStore<InformationalItem[]>(
    subscribeInformational,
    getInformationalSnapshot,
    getInformationalSnapshot,
  );

  return useMemo(() => {
    const isAdmin = !!(currentUser.isAdmin || currentUser.isPrimaryAdmin);

    const friendRequestCount = incomingRequests.length;
    const joinRequestCount = joinRequestSources.reduce((s, it) => s + it.pendingCount, 0);
    const informationalCount = informational.length;
    const inviteRequestCount = isAdmin ? inviteRequests.length : 0;
    const passwordResetCount = isAdmin ? passwordResetRequests.length : 0;
    // DM unread'leri artık bell badge'ine beslenmez — Mesajlar bölümüne özel.
    const bellCount = friendRequestCount + inviteReceivedCount + joinRequestCount + informationalCount + inviteRequestCount + (updateActionable ? 1 : 0);
    const settingsCount = 0;

    // ── Item listesi oluştur ──
    const items: NotifItem[] = [];

    if (friendRequestCount > 0) {
      items.push({
        key: 'friends',
        kind: 'social',
        priority: 'medium',
        label: friendRequestCount === 1 ? 'Arkadaşlık isteği' : 'Arkadaşlık istekleri',
        detail: friendRequestCount === 1 ? 'Bekleyen bir istek var' : `${friendRequestCount} bekleyen istek`,
        count: friendRequestCount,
        isActionable: true,
      });
    }

    if (inviteReceivedCount > 0) {
      items.push({
        key: 'invites',
        kind: 'invite',
        priority: 'medium',
        label: 'Sunucu davetleri',
        detail: inviteReceivedCount === 1 ? 'Bekleyen 1 davet var' : `Bekleyen ${inviteReceivedCount} davet var`,
        count: inviteReceivedCount,
        isActionable: true,
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
      updateActionable,
      inviteReceivedCount,
      joinRequestCount,
      inviteRequestCount,
      passwordResetCount,
      isAdmin,
      items,
    };
  }, [
    incomingRequests.length,
    dmUnreadCount,
    updateActionable,
    inviteReceivedCount,
    joinRequestSources,
    informational,
    inviteRequests.length,
    passwordResetRequests.length,
    currentUser.isAdmin,
    currentUser.isPrimaryAdmin,
  ]);
}
