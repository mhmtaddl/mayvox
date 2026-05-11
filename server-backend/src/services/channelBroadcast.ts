/**
 * Channel metadata broadcast.
 */
import { config } from '../config';
import type { ChannelResponse } from '../types';

export type ChannelBroadcastPayload =
  | { action: 'create'; serverId: string; channel: ChannelResponse }
  | { action: 'update'; serverId: string; channelId: string; updates: Partial<ChannelResponse> }
  | { action: 'delete'; serverId: string; channelId: string }
  | { action: 'reorder'; serverId: string; updates: Array<{ id: string; position: number }>; orderToken: string | null; timestamp?: number };

export async function postBroadcast(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!config.internalNotifySecret) {
    console.warn('[channel-broadcast] disabled — INTERNAL_NOTIFY_SECRET tanımlı değil.');
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
      body: JSON.stringify({ event, payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[channel-broadcast] non-ok:', { status: res.status, event });
    }
  } catch (err) {
    console.warn('[channel-broadcast] failed:', err instanceof Error ? err.message : err, { event });
  } finally {
    clearTimeout(timer);
  }
}

export async function broadcastChannelUpdate(payload: ChannelBroadcastPayload): Promise<void> {
  await postBroadcast('channel-update', payload);
  if (payload.action === 'reorder') {
    await postBroadcast('channels-reordered', {
      serverId: payload.serverId,
      channels: payload.updates,
      orderToken: payload.orderToken,
      timestamp: payload.timestamp ?? Date.now(),
    });
  }
}
