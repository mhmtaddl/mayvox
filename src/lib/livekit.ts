export const getLiveKitToken = async (roomName: string, participantName: string): Promise<string> => {
  const res = await fetch('http://localhost:3001/livekit-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantName }),
  });

  if (!res.ok) throw new Error('Token alınamadı');
  const { token } = await res.json();
  return token;
};

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
