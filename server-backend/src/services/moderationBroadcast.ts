/**
 * Moderation broadcast.
 */
import { config } from '../config';

export type ModerationAction =
  | 'mute' | 'unmute'
  | 'timeout' | 'clear_timeout'
  | 'ban' | 'unban'
  | 'kick' | 'room_kick'
  | 'chat_ban' | 'chat_unban';

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
    chatBannedUntil?: string | null;
  };
  reason?: string;
  actorId?: string;
  serverId?: string;
}

export async function broadcastModeration(payload: ModerationBroadcastPayload): Promise<void> {
  if (!config.internalNotifySecret) {
    console.warn('[moderation-broadcast] disabled — INTERNAL_NOTIFY_SECRET tanımlı değil.');
    return;
  }

  const url = `${config.chatServerUrl.replace(/\/$/, '')}/internal/broadcast`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': config.internalNotifySecret,
      },
      body: JSON.stringify({ event: 'moderation-event', payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[moderation-broadcast] non-ok:', res.status, body.slice(0, 200), payload.action, payload.userId);
    }
  } catch (err) {
    console.warn('[moderation-broadcast] failed:', err instanceof Error ? err.message : err, payload.action, payload.userId);
  } finally {
    clearTimeout(timer);
  }
}
