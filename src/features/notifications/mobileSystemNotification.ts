import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

type MobileNotificationPayload = {
  id: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

let listenerReady = false;
let permissionReady: boolean | null = null;

function isNativeMobile(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

function isForeground(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && document.hasFocus();
}

function stableNumericId(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 2147483647) || Date.now() % 2147483647;
}

async function ensurePermission(): Promise<boolean> {
  if (permissionReady != null) return permissionReady;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      permissionReady = true;
      return true;
    }
    const requested = await LocalNotifications.requestPermissions();
    permissionReady = requested.display === 'granted';
    return permissionReady;
  } catch {
    permissionReady = false;
    return false;
  }
}

function ensureActionListener(): void {
  if (listenerReady || !isNativeMobile()) return;
  listenerReady = true;
  void LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const data = event.notification.extra as Record<string, unknown> | undefined;
    if (data?.kind === 'dm') {
      window.dispatchEvent(new CustomEvent('mayvox:open-messages', {
        detail: {
          recipientId: typeof data.recipientId === 'string' ? data.recipientId : undefined,
          conversationKey: typeof data.conversationKey === 'string' ? data.conversationKey : undefined,
        },
      }));
    }
  });
}

export async function showMobileSystemNotification(payload: MobileNotificationPayload): Promise<void> {
  if (!isNativeMobile() || isForeground()) return;
  ensureActionListener();
  const granted = await ensurePermission();
  if (!granted) return;

  await LocalNotifications.schedule({
    notifications: [{
      id: stableNumericId(payload.id),
      title: payload.title,
      body: payload.body,
      extra: payload.data,
      schedule: { at: new Date(Date.now() + 100) },
    }],
  });
}
