import { supabase } from './supabase';

export const getLiveKitToken = async (roomName: string, participantName: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  console.log('[TOKEN] Session kontrol:', { hasSession: !!session, hasAccessToken: !!session?.access_token });
  if (!session?.access_token) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın');

  const tokenServerUrl = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'http://localhost:3001';
  const url = `${tokenServerUrl}/livekit-token`;
  console.log('[TOKEN] İstek atılıyor:', { url, roomName, participantName });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ roomName, participantName }),
  });

  console.log('[TOKEN] Sunucu yanıtı:', { status: res.status, ok: res.ok, statusText: res.statusText });
  if (!res.ok) {
    const body = await res.text().catch(() => '(body okunamadı)');
    console.error('[TOKEN] Hata body:', body);
    throw new Error(`Token alınamadı (HTTP ${res.status}): ${body}`);
  }
  const json = await res.json();
  console.log('[TOKEN] Token alındı ✓, keys:', Object.keys(json));
  return json.token;
};

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
