import { useMemo } from 'react';
import { useUser } from '../contexts/UserContext';
import { useAppState } from '../contexts/AppStateContext';

// ── Bildirim item tipi — panel render + gelecek genişleme için ──

export type NotifKind = 'social' | 'message' | 'system' | 'mention';
export type NotifPriority = 'high' | 'medium' | 'low';

export interface NotifItem {
  key: string;
  kind: NotifKind;
  priority: NotifPriority;
  label: string;
  detail: string;
  count: number;
  isActionable: boolean;
}

// ── Priority sıralama ağırlıkları ──
const PRIORITY_WEIGHT: Record<NotifPriority, number> = { high: 0, medium: 1, low: 2 };

export interface NotificationSummary {
  bellCount: number;
  settingsCount: number;

  friendRequestCount: number;
  dmUnreadCount: number;
  updateActionable: boolean;

  inviteRequestCount: number;
  passwordResetCount: number;

  isAdmin: boolean;

  /** Sıralanmış bildirim öğeleri (priority desc) */
  items: NotifItem[];
}

/**
 * useNotificationCenter — bildirim sayılarını ve item listesini merkezden hesaplar.
 *
 * Kurallar:
 * - Ayarlar badge = sadece admin bildirimler (inviteRequests + passwordResetRequests)
 * - Çan badge = kullanıcıya gelen kişisel bildirimler (friend + DM + update)
 * - Item listesi priority'ye göre sıralı döner
 */
export function useNotificationCenter(
  dmUnreadCount: number = 0,
  updateActionable: boolean = false,
): NotificationSummary {
  const { incomingRequests, currentUser } = useUser();
  const { inviteRequests, passwordResetRequests } = useAppState();

  return useMemo(() => {
    const isAdmin = !!(currentUser.isAdmin || currentUser.isPrimaryAdmin);

    const friendRequestCount = incomingRequests.length;
    const bellCount = friendRequestCount + dmUnreadCount + (updateActionable ? 1 : 0);

    const inviteRequestCount = isAdmin ? inviteRequests.length : 0;
    const passwordResetCount = isAdmin ? passwordResetRequests.length : 0;
    const settingsCount = inviteRequestCount + passwordResetCount;

    // ── Item listesi oluştur ──
    const items: NotifItem[] = [];

    if (dmUnreadCount > 0) {
      items.push({
        key: 'dm',
        kind: 'message',
        priority: 'high',
        label: 'Okunmamış mesajlar',
        detail: dmUnreadCount === 1 ? '1 yeni mesaj' : `${dmUnreadCount} yeni mesaj`,
        count: dmUnreadCount,
        isActionable: true,
      });
    }

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
      inviteRequestCount,
      passwordResetCount,
      isAdmin,
      items,
    };
  }, [
    incomingRequests.length,
    dmUnreadCount,
    updateActionable,
    inviteRequests.length,
    passwordResetRequests.length,
    currentUser.isAdmin,
    currentUser.isPrimaryAdmin,
  ]);
}
