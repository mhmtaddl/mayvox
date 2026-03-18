import { supabase } from './supabase';

export const getLiveKitToken = async (roomName: string, participantName: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Oturum bulunamadı, lütfen tekrar giriş yapın');

  const tokenServerUrl = import.meta.env.VITE_TOKEN_SERVER_URL ?? 'http://localhost:3001';
  const res = await fetch(`${tokenServerUrl}/livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ roomName, participantName }),
  });

  if (!res.ok) throw new Error('Token alınamadı');
  const { token } = await res.json();
  return token;
};

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
