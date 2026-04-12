import { supabase } from './supabase';
import { logger } from './logger';

const TOKEN_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

const TOKEN_SERVER_URL = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'https://api.cylksohbet.org';

const isRetryable = (status: number) => status === 502 || status === 503 || status === 504;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Token server health check ─────────────────────────────────────────────
let _warmedUp = false;

export const warmUpTokenServer = () => {
  if (_warmedUp) return;
  _warmedUp = true;
  fetch(`${TOKEN_SERVER_URL}/health`, { method: 'GET' }).catch(() => {});
};

// ── Token alma ─────────────────────────────────────────────────────────────
export const getLiveKitToken = async (
  roomName: string,
  participantName: string,
  serverId: string,
  channelId: string,
  onStatus?: (msg: string) => void,
): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın');

  const url = `${TOKEN_SERVER_URL}/livekit-token`;

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ roomName, participantName, serverId, channelId }),
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt === 1) {
        onStatus?.('Bağlantı kuruluyor...');
      } else {
        onStatus?.(`Tekrar deneniyor (${attempt}/${MAX_RETRIES})...`);
      }

      const t0 = performance.now();
      const res = await fetchWithTimeout(url, options, TOKEN_TIMEOUT_MS);
      const elapsed = Math.round(performance.now() - t0);

      const rawText = await res.text();

      if (res.ok) {
        try {
          const json = JSON.parse(rawText);
          logger.info('Token alındı', { attempt, ms: elapsed });
          return json.token;
        } catch {
          throw new Error('Sunucu geçersiz yanıt döndü.');
        }
      }

      logger.error('Token isteği başarısız', { status: res.status, attempt, ms: elapsed });

      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        onStatus?.('Sunucu geçici olarak meşgul, tekrar deneniyor...');
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      const parseErrorMsg = (fallback: string): string => {
        try {
          const j = JSON.parse(rawText);
          if (j && typeof j.error === 'string' && j.error.length > 0) return j.error;
        } catch { /* default */ }
        return fallback;
      };

      if (res.status === 401) {
        throw new Error('Oturumunuz geçersiz, lütfen tekrar giriş yapın.');
      }
      if (res.status === 400) {
        throw new Error(parseErrorMsg('Kanal bilgisi geçersiz.'));
      }
      if (res.status === 403) {
        throw new Error(parseErrorMsg('Bu kanala erişim yetkin yok.'));
      }
      if (res.status === 429) {
        throw new Error(parseErrorMsg('Çok fazla istek gönderildi, lütfen biraz bekleyin.'));
      }
      if (res.status >= 500) {
        throw new Error('Ses sunucusu şu an yanıt vermiyor, lütfen tekrar deneyin.');
      }
      throw new Error(`Odaya bağlanılamadı (${res.status}).`);

    } catch (err) {
      const error = err as Error;
      const isNetworkError = error.name === 'AbortError'
        || error.message.includes('Failed to fetch')
        || error.message.includes('NetworkError')
        || error.message.includes('Load failed');

      if (isNetworkError) {
        logger.warn('Token ağ hatası', { attempt, error: error.message });
        lastError = new Error(
          attempt >= MAX_RETRIES
            ? 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.'
            : 'Bağlantı kurulamıyor...',
        );
        if (attempt < MAX_RETRIES) {
          onStatus?.('Bağlantı kurulamıyor, tekrar deneniyor...');
          await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }
      } else {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('Token alınamadı.');
};

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
