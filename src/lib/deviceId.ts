/**
 * Persistent device identifier for presence/session tracking.
 *
 * Backend tarafında session_key = deviceId + ws suffix. Aynı cihaz/tarayıcıdan
 * tekrar bağlanınca UNIQUE(device_id) gerekmez; her WS ayrı session_key alır.
 * DeviceId sadece "hangi cihazdan geliyor" bilgisini persist etmek için.
 */
const KEY = 'mayvox.deviceId';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length > 0) return existing;
    const id = cryptoRandomId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // localStorage erişilemiyor (private mode vb.) — session-only ID üret
    return cryptoRandomId();
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
