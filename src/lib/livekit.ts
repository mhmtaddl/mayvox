import { supabase } from './supabase';
import { logger } from './logger';

const TOKEN_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

// Belirli HTTP durum kodları için retry yapılabilir (Render cold-start 502/503)
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

export const getLiveKitToken = async (
  roomName: string,
  participantName: string,
  onWaiting?: () => void,
): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın');

  const tokenServerUrl = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'http://localhost:3001';
  const url = `${tokenServerUrl}/livekit-token`;

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ roomName, participantName }),
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // İlk deneme başlıyorsa bekleme bildirimi göster
    if (attempt === 1) onWaiting?.();

    try {
      const res = await fetchWithTimeout(url, options, TOKEN_TIMEOUT_MS);

      if (res.ok) {
        const json = await res.json();
        return json.token;
      }

      const body = await res.text().catch(() => '');
      logger.error('Token isteği başarısız', { url, status: res.status, body, attempt });

      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Kullanıcıya anlamlı mesaj ver
      if (res.status === 401 || res.status === 403) {
        throw new Error('Oturumunuz geçersiz, lütfen tekrar giriş yapın.');
      }
      if (res.status === 429) {
        throw new Error('Çok fazla istek gönderildi, lütfen biraz bekleyin.');
      }
      if (res.status >= 500) {
        throw new Error('Ses sunucusu şu an yanıt vermiyor, lütfen tekrar deneyin.');
      }
      throw new Error(`Odaya bağlanılamadı (${res.status}).`);

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.warn('Token isteği zaman aşımına uğradı', { attempt });
        lastError = new Error('Sunucu yanıt vermedi, bağlantınızı kontrol edin.');
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
      } else {
        // Anlamlı mesaj içeriyorsa direkt fırlat
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Token alınamadı.');
};

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
