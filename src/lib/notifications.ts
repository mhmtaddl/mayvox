/**
 * Mobil bildirim yardımcısı.
 * Android'de IncomingCallPlugin ile bildirim gösterir.
 * App foreground'dayken native bildirim gösterilmez — in-app modal yeterli.
 * Masaüstünde sessizce no-op döner.
 */
import IncomingCall from './incomingCall';

/** Davet bildirimi göster — sadece app arka plandayken çalışır */
export async function showInviteNotification(
  inviterName: string,
  roomName: string,
  roomId: string,
) {
  console.log('[notifications] invite_received:', inviterName, roomName);
  if (!IncomingCall) {
    console.log('[notifications] no_plugin — skipping');
    return;
  }
  try {
    const perms = await IncomingCall.checkPermissions();
    console.log('[notifications] notification_permission:', perms.notifications);
    if (perms.notifications !== 'granted') {
      console.log('[notifications] skipping — no notification permission');
      return;
    }
    // Plugin içinde foreground kontrolü var — foreground'da skip eder
    console.log('[notifications] calling_plugin_show');
    await IncomingCall.show({ inviterName, roomName, roomId });
    console.log('[notifications] plugin_show_done');
  } catch (err) {
    console.error('[notifications] error:', err);
  }
}

/** Davet bildirimi kapat — modal kapandığında çağrılmalı */
export async function dismissInviteNotification() {
  if (!IncomingCall) return;
  try {
    await IncomingCall.dismiss();
  } catch {}
}
