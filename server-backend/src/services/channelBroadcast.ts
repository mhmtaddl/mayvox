/**
 * Channel metadata broadcast — pushes server-scoped channel list changes to clients
 * already subscribed to the shared Supabase realtime presence channel.
 */
import { config } from '../config';
import type { ChannelResponse } from '../types';

const BROADCAST_URL = `${config.supabaseUrl.replace(/\/+$/, '')}/realtime/v1/api/broadcast`;

export type ChannelBroadcastPayload =
  | { action: 'create'; serverId: string; channel: ChannelResponse }
  | { action: 'update'; serverId: string; channelId: string; updates: Partial<ChannelResponse> }
  | { action: 'delete'; serverId: string; channelId: string }
  | { action: 'reorder'; serverId: string; updates: Array<{ id: string; position: number }>; orderToken: string | null; timestamp?: number };

export async function broadcastChannelUpdate(payload: ChannelBroadcastPayload): Promise<void> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(BROADCAST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: 'app-presence',
          event: 'channel-update',
          payload,
          private: false,
        }, ...(payload.action === 'reorder' ? [{
          topic: 'app-presence',
          event: 'channels-reordered',
          payload: {
            serverId: payload.serverId,
            channels: payload.updates,
            orderToken: payload.orderToken,
            timestamp: payload.timestamp ?? Date.now(),
          },
          private: false,
        }] : [])],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[channel-broadcast] non-2xx:', res.status, body.slice(0, 200), payload.action, payload.serverId);
    }
  } catch (err) {
    console.warn('[channel-broadcast] send failed:', (err as Error).message, payload.action, payload.serverId);
  }
}
