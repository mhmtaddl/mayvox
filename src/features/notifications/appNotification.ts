/**
 * Unified Notification Model — Faz 1 iskelet.
 *
 * Amaç: Tüm bildirim kaynaklarının (DM, invite, system, update, CRUD action, ...)
 * tek tip üzerinden merkezi emitter'a akması. Emitter priority + type'tan hangi
 * UI kanallarının (toast/bell/banner/modal/sound/flash) tetikleneceğini çözer.
 *
 * Faz 1'de tipler + kanal çözümleyici eklenir. Mevcut `setToastMsg` ve service
 * handler çağrıları bu fazda DEĞİŞMEZ — UI bit-identical kalır. Migration Faz 2+.
 */

export type NotificationType =
  | 'dm'          // direkt mesaj
  | 'invite'      // sunucu daveti, katılma başvurusu, arkadaşlık
  | 'system'      // admin duyurusu, moderasyon kararı
  | 'mention'     // @kullanıcı
  | 'role'        // ban/kick/mute/konuşmacı-dinleyici
  | 'connection'  // internet kesildi, inactivity disconnect
  | 'update'      // uygulama güncellemesi
  | 'action';     // generic CRUD/success toast — bell'e yazılmaz

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

/** Priority × type çözülmesinden türeyen render kanalları. */
export interface ResolvedChannels {
  toast: boolean;
  bell: boolean;
  banner: boolean;
  modal: boolean;
  sound: boolean;
  /** Electron window flash — sadece unfocused iken anlam kazanır. */
  flash: boolean;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  /** `resolveChannels` çıktısı — emitter tarafından doldurulur. */
  channel?: ResolvedChannels;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  /** Ses + flash bypass — sadece görsel. */
  silent?: boolean;
  meta?: {
    actorId?: string;
    serverId?: string;
    roomId?: string;
    conversationKey?: string;
    inviteId?: string;
    [k: string]: unknown;
  };
}

/**
 * Priority → Kanal matrisi (sabit kural).
 *
 * | Priority  | Toast | Bell | Banner | Modal | Sound | Flash |
 * |-----------|-------|------|--------|-------|-------|-------|
 * | low       |   -   |  ✅  |   -    |   -   |   -   |   -   |
 * | medium    |  ✅   |  ✅  |   -    |   -   |   -   |   -   |
 * | high      |  ✅   |  ✅  |   -    |   -   |  ✅   |  ✅   |
 * | critical  |   -   | opt. |  opt.  | opt.  |  ✅   |  ✅   |
 *
 * Kurallar:
 *  - `action` type: toast-only (bell'e yazılmaz). low'da tamamen sessiz.
 *  - `critical`: asla toast'a düşmez. Banner VEYA modal — type bazlı.
 *  - `silent: true`: sound + flash kapatılır, görsel aynı kalır.
 */
export function resolveChannels(
  type: NotificationType,
  priority: NotificationPriority,
  silent = false,
): ResolvedChannels {
  if (priority === 'critical') {
    // Banner: inactivity gibi akışa engel olmayan kritik uyarılar
    // Modal: ban, force password gibi bloklayıcı UI
    // Bell: sadece sonradan erişim faydalı türler (update, system duyuru)
    const isBannerKind = type === 'connection';
    const bell = type === 'update' || type === 'system';
    return {
      toast: false,
      bell,
      banner: isBannerKind,
      modal: !isBannerKind,
      sound: !silent,
      flash: !silent,
    };
  }

  if (type === 'action') {
    return {
      toast: priority !== 'low',
      bell: false,
      banner: false,
      modal: false,
      sound: false,
      flash: false,
    };
  }

  if (priority === 'low') {
    return {
      toast: false,
      bell: true,
      banner: false,
      modal: false,
      sound: false,
      flash: false,
    };
  }

  if (priority === 'medium') {
    return {
      toast: true,
      bell: true,
      banner: false,
      modal: false,
      sound: false,
      flash: false,
    };
  }

  // high
  return {
    toast: true,
    bell: true,
    banner: false,
    modal: false,
    sound: !silent,
    flash: !silent,
  };
}

let nextSeq = 1;
export function makeNotificationId(prefix: string = 'n'): string {
  return `${prefix}-${Date.now()}-${nextSeq++}`;
}
