/**
 * Mobil yerel bildirim yardımcısı.
 * Capacitor LocalNotifications plugin'i üzerinden çalışır.
 * Masaüstünde sessizce no-op döner.
 */
import { isMobile } from './platform';

let LocalNotifications: any = null;

async function getPlugin() {
  if (LocalNotifications) return LocalNotifications;
  if (!isMobile()) return null;
  try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotifications = mod.LocalNotifications;
    // İzin iste (Android 13+ gerektirir)
    await LocalNotifications.requestPermissions();
    // Bildirim kanalı oluştur (Android)
    await LocalNotifications.createChannel?.({
      id: 'invites',
      name: 'Davetler',
      description: 'Oda davet bildirimleri',
      importance: 5, // MAX — heads-up notification
      visibility: 1, // PUBLIC
      vibration: true,
      sound: 'default',
    }).catch(() => {});
    return LocalNotifications;
  } catch {
    return null;
  }
}

/** Davet bildirimi gönder — mobilde heads-up notification olarak görünür */
export async function showInviteNotification(inviterName: string, roomName: string) {
  const plugin = await getPlugin();
  if (!plugin) return;
  await plugin.schedule({
    notifications: [{
      id: Date.now() % 100000,
      title: 'Sesli Sohbet Daveti',
      body: `${inviterName} seni "${roomName}" odasına davet ediyor`,
      channelId: 'invites',
      sound: 'default',
      smallIcon: 'ic_launcher',
      largeIcon: 'ic_launcher',
    }],
  }).catch(() => {});
}
