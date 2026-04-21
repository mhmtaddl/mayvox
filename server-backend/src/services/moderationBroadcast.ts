/**
 * Moderation broadcast — frontend anlık sync için Supabase realtime.
 *
 * Strateji: Supabase `POST /realtime/v1/api/broadcast` HTTP endpoint'ine event push.
 * Subscribe gerektirmez — server tarafında WebSocket kurmakla uğraşmıyoruz (Node
 * ortamında sık sorun çıkarıyordu). Frontend public `app-presence` channel'ına
 * subscribe olmuş durumda; HTTP broadcast doğrudan o channel'a düşer.
 *
 * Fire-and-forget: Başarısız HTTP call'u DB işlemini iptal etmez; warn loglanır.
 */
import { config } from '../config';

const BROADCAST_URL = `${config.supabaseUrl.replace(/\/+$/, '')}/realtime/v1/api/broadcast`;

export type ModerationAction =
  | 'mute' | 'unmute'
  | 'timeout' | 'clear_timeout'
  | 'ban' | 'unban'
  | 'kick' | 'room_kick';

export interface ModerationBroadcastPayload {
  userId: string;
  action: ModerationAction;
  updates?: {
    isMuted?: boolean;
    isVoiceBanned?: boolean;
    muteExpires?: number | null;
    banExpires?: number | null;
    timedOutUntil?: string | null;
    isServerMuted?: boolean;
    voiceMutedUntil?: string | null;
  };
  reason?: string;
  actorId?: string;
  serverId?: string;
}

export async function broadcastModeration(payload: ModerationBroadcastPayload): Promise<void> {
  try {
    // 2 saniye timeout — realtime HTTP endpoint normalde 50-150ms yanıt verir.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(BROADCAST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.supabaseAnonKey}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: 'app-presence',
          event: 'moderation',
          payload,
          private: false,
        }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[moderation-broadcast] non-2xx:', res.status, body.slice(0, 200), payload.action, payload.userId);
    }
  } catch (err) {
    console.warn('[moderation-broadcast] send failed:', (err as Error).message, payload.action, payload.userId);
  }
}
