import { config } from '../config';

/**
 * chat-server.cjs üzerinden belirli bir kullanıcıya WS push gönderir.
 *
 * Davranış:
 * - Fire-and-forget: çağıran tarafın kritik akışı bloklanmaz.
 * - Secret tanımsızsa sessizce no-op (startup log'u zaten uyarıyor, burada spam yok).
 * - Ağ hatası, timeout, non-ok status → structured warn log. Akış etkilenmez.
 *
 * Log prefix'leri tek noktadan filtrelenebilsin diye sabit:
 *   [realtimeNotify] disabled   — secret yok
 *   [realtimeNotify] bad-input  — parametre hatası
 *   [realtimeNotify] non-ok     — chat-server 2xx dışı yanıt
 *   [realtimeNotify] aborted    — timeout
 *   [realtimeNotify] failed     — network/dns/connect hatası
 */
type NotifyPayload = Record<string, unknown> & { type: string };

// Startup-time warning sadece bir kez (ilk çağrıda) — sonraki spam önlenir.
let disabledWarnEmitted = false;

export async function notifyClient(userId: string, payload: NotifyPayload): Promise<void> {
  if (!config.internalNotifySecret) {
    if (!disabledWarnEmitted) {
      console.warn('[realtimeNotify] disabled — INTERNAL_NOTIFY_SECRET tanımsız; invite push çalışmayacak (polling fallback aktif).');
      disabledWarnEmitted = true;
    }
    return;
  }
  if (!userId || !payload || typeof payload.type !== 'string') {
    console.warn('[realtimeNotify] bad-input — userId veya payload.type eksik');
    return;
  }

  const url = `${config.chatServerUrl.replace(/\/$/, '')}/internal/notify-user`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.internalNotifySecret,
      },
      body: JSON.stringify({ userId, payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[realtimeNotify] non-ok status=${res.status} url=${url} body=${body.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted') || msg.includes('AbortError')) {
      console.warn(`[realtimeNotify] aborted url=${url} — chat-server 3s içinde cevap vermedi`);
    } else {
      console.warn(`[realtimeNotify] failed url=${url} err=${msg}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
