/**
 * MAYVOX WebSocket Chat Service
 * - Reconnect-safe
 * - Room-based
 * - App JWT auth
 */

import { getAuthToken as getStoredAuthToken } from './authClient';
import { handleDmMessage, setDmSocket, notifyDmConnected } from './dmService';
import { getOrCreateDeviceId } from './deviceId';

// Vite build-time sabiti (vite.config.ts define). package.json version değeri.
declare const __APP_VERSION__: string;

export interface ChatMessage {
  id: string;
  senderId: string;
  sender: string;
  avatar: string;
  text: string;
  time: number;
}

type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ChatErrorPayload {
  code?: string;         // örn. 'flood_control' (programatik ayrım)
  message: string;       // kullanıcıya gösterilebilir metin
  retryAfter?: number;   // ms — cooldown süresi (flood_control için)
}

type ChatEventHandler = {
  onMessage?: (msg: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => void;
  onClear?: (roomId: string) => void;
  onHistory?: (roomId: string, messages: ChatMessage[]) => void;
  onStatusChange?: (status: ChatStatus) => void;
  onError?: (err: ChatErrorPayload) => void;
};

const SERVER_API_URL = String(import.meta.env.VITE_SERVER_API_URL || '').replace(/\/$/, '');
const CHAT_WS_URL = import.meta.env.VITE_CHAT_WS_URL;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_RECONNECT_ATTEMPTS = 50;

console.log('[chatService] WS URL:', CHAT_WS_URL);

let ws: WebSocket | null = null;
let currentRoom: string | null = null;
let handlers: ChatEventHandler = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;
let isConnecting = false;

export interface PresencePatchPayload {
  serverId?: string;
  currentRoom?: string | null;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  statusText?: string;
  autoStatus?: 'active' | 'idle' | 'deafened' | null;
  gameActivity?: string | null;
  appVersion?: string;
  platform?: 'mobile' | 'desktop';
  onlineSince?: number | null;
}

let latestPresencePatch: PresencePatchPayload = {};

// ── Invite event bus ──
// Backend'den gelen `invite:*` WS mesajlarını dinleyen subscribe'lara dağıtır.
// Birden fazla subscriber'a izin verir (test edilebilirlik + hook remount safety).
export interface InviteEvent {
  type: 'invite:new' | 'invite:removed';
  inviteId?: string;
  serverId?: string;
  reason?: 'accepted' | 'declined' | 'cancelled';
}
type InviteEventHandler = (event: InviteEvent) => void;
const inviteSubscribers = new Set<InviteEventHandler>();

export function subscribeInviteEvents(handler: InviteEventHandler): () => void {
  inviteSubscribers.add(handler);
  return () => { inviteSubscribers.delete(handler); };
}

function dispatchInviteEvent(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== 'string' || !type.startsWith('invite:')) return false;
  const event = msg as InviteEvent;
  for (const h of inviteSubscribers) {
    try { h(event); } catch (err) { console.warn('[chatService] invite subscriber error:', err); }
  }
  return true;
}

// ── Server event bus ──
// server:* prefix'li WS mesajlarını (join_request:new vs.) dağıtır.
export interface ServerEvent {
  type: string;
  serverId?: string;
  requesterId?: string;
  [k: string]: unknown;
}
type ServerEventHandler = (event: ServerEvent) => void;
const serverSubscribers = new Set<ServerEventHandler>();

export function subscribeServerEvents(handler: ServerEventHandler): () => void {
  serverSubscribers.add(handler);
  return () => { serverSubscribers.delete(handler); };
}

function dispatchServerEvent(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== 'string' || !type.startsWith('server:')) return false;
  const event = msg as ServerEvent;
  for (const h of serverSubscribers) {
    try { h(event); } catch (err) { console.warn('[chatService] server subscriber error:', err); }
  }
  return true;
}

export interface PresenceUserState {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
  serverId?: string;
  currentRoom?: string | null;
  selfMuted?: boolean;
  selfDeafened?: boolean;
  statusText?: string;
  autoStatus?: 'active' | 'idle' | 'deafened' | null;
  gameActivity?: string | null;
  appVersion?: string;
  platform?: 'mobile' | 'desktop';
  onlineSince?: number | null;
  updatedAt?: string;
}

// ── Presence event bus ──
// Tek format:
//   snapshot => { type: 'presence:snapshot', users: PresenceUserState[] }
//   update   => { type: 'presence:update', user: PresenceUserState }
export interface PresenceUpdateEvent {
  type: 'presence:update';
  user: PresenceUserState;
  serverNow: string;
}
export interface PresenceSnapshotEvent {
  type: 'presence:snapshot';
  users: PresenceUserState[];
  serverNow: string;
}
export type PresenceEvent = PresenceUpdateEvent | PresenceSnapshotEvent;
type PresenceEventHandler = (event: PresenceEvent) => void;
const presenceSubscribers = new Set<PresenceEventHandler>();
const latestPresenceByUser = new Map<string, PresenceUserState>();
let latestPresenceSnapshot: PresenceSnapshotEvent | null = null;

export function subscribePresenceEvents(handler: PresenceEventHandler): () => void {
  presenceSubscribers.add(handler);
  if (latestPresenceSnapshot) {
    try { handler(latestPresenceSnapshot); } catch (err) { console.warn('[chatService] presence subscriber error:', err); }
  }
  for (const user of latestPresenceByUser.values()) {
    try {
      handler({ type: 'presence:update', user, serverNow: user.updatedAt || new Date().toISOString() });
    } catch (err) {
      console.warn('[chatService] presence subscriber error:', err);
    }
  }
  return () => { presenceSubscribers.delete(handler); };
}

function emitPresenceEvent(event: PresenceEvent): void {
  if (event.type === 'presence:snapshot') {
    latestPresenceSnapshot = event;
    for (const user of event.users || []) {
      if (user?.userId) latestPresenceByUser.set(user.userId, user);
    }
  } else if (event.user?.userId) {
    latestPresenceByUser.set(event.user.userId, event.user);
  }
  for (const h of presenceSubscribers) {
    try { h(event); } catch (err) { console.warn('[chatService] presence subscriber error:', err); }
  }
}

function dispatchPresenceEvent(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  if (type !== 'presence:update' && type !== 'presence:snapshot') return false;
  const event = msg as PresenceEvent;
  if (event.type === 'presence:update') {
    console.log('[presence] CLIENT RECEIVE', {
      type: event.type,
      userId: event.user?.userId,
      online: event.user?.online,
      selfMuted: event.user?.selfMuted,
      selfDeafened: event.user?.selfDeafened,
      statusText: event.user?.statusText,
      autoStatus: event.user?.autoStatus,
      currentRoom: event.user?.currentRoom,
      serverId: event.user?.serverId,
    });
  } else {
    console.log('[presence] CLIENT RECEIVE', {
      type: event.type,
      users: event.users?.length ?? 0,
    });
  }
  emitPresenceEvent(event);
  return true;
}

// ── App realtime event bus ──
// chat-server /internal/broadcast üzerinden gelen global eventleri dağıtır.
export type AppRealtimeEventType =
  | 'channel-update'
  | 'channels-reordered'
  | 'moderation-event'
  | 'announcement-update'
  | 'friend-update';

export interface AppRealtimeEvent<TPayload = any> {
  type: AppRealtimeEventType;
  event?: AppRealtimeEventType;
  payload: TPayload;
}

type AppRealtimeEventHandler = (event: AppRealtimeEvent) => void;
const realtimeSubscribers = new Set<AppRealtimeEventHandler>();

export function subscribeRealtimeEvents(handler: AppRealtimeEventHandler): () => void {
  realtimeSubscribers.add(handler);
  return () => { realtimeSubscribers.delete(handler); };
}

function isAppRealtimeType(type: unknown): type is AppRealtimeEventType {
  return (
    type === 'channel-update' ||
    type === 'channels-reordered' ||
    type === 'moderation-event' ||
    type === 'announcement-update' ||
    type === 'friend-update'
  );
}

function dispatchRealtimeEvent(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  if (!isAppRealtimeType(type)) return false;
  const event = msg as AppRealtimeEvent;
  for (const h of realtimeSubscribers) {
    try { h(event); } catch (err) { console.warn('[chatService] realtime subscriber error:', err); }
  }

  return true;
}

// WebSocket instance erişimi — presence hook heartbeat göndermek için kullanır.
export function getChatSocket(): WebSocket | null {
  return ws;
}

export function sendPresencePatch(payload: PresencePatchPayload): void {
  latestPresencePatch = { ...latestPresencePatch, ...payload };
  console.log('[presence] PATCH SEND', {
    readyState: ws?.readyState,
    queued: ws?.readyState !== WebSocket.OPEN,
    payload,
    latestPresencePatch,
  });
  if (ws?.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'presence:patch', payload: latestPresencePatch }));
  } catch (err) {
    console.warn('[chatService] presence patch send failed:', err);
  }
}

// ── Connection status event bus ──
// setChatHandlers() tek global subscriber (room/mesaj handler'ı). Ama birden çok
// modül (ör. useIncomingInvites) reconnect olaylarını izlemek isteyebilir:
// bu bus override yerine ek subscriber destekler.
type ConnectionStatusHandler = (status: ChatStatus) => void;
const statusSubscribers = new Set<ConnectionStatusHandler>();

export function subscribeConnectionStatus(handler: ConnectionStatusHandler): () => void {
  statusSubscribers.add(handler);
  return () => { statusSubscribers.delete(handler); };
}

function emitStatus(status: ChatStatus): void {
  handlers.onStatusChange?.(status);
  for (const h of statusSubscribers) {
    try { h(status); } catch (err) { console.warn('[chatService] status subscriber error:', err); }
  }
}

function getReconnectDelay() {
  return Math.min(1000 * Math.pow(2, reconnectAttempt), 15000);
}

async function getAuthToken(): Promise<string | null> {
  const token = getStoredAuthToken();
  console.log(
    '[chatService] Token:',
    token ? `${token.slice(0, 20)}...` : 'YOK'
  );
  return token;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (intentionalClose) {
    console.log('[chatService] intentionalClose=true, reconnect yapılmayacak');
    return;
  }
  if (reconnectTimer) return;

  reconnectAttempt += 1;
  if (reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
    console.warn(`[chatService] Max reconnect (${MAX_RECONNECT_ATTEMPTS}) aşıldı, durduruluyor`);
    emitStatus('disconnected');
    return;
  }
  const delay = getReconnectDelay();
  console.log(`[chatService] Reconnect #${reconnectAttempt}, ${delay}ms sonra`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectChat();
  }, delay);
}

export function setChatHandlers(h: ChatEventHandler) {
  handlers = h;
}

export async function connectChat() {
  console.log(
    '[chatService] connectChat() çağrıldı, ws state:',
    ws?.readyState,
    'intentionalClose:',
    intentionalClose
  );

  if (
    ws &&
    (ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING)
  ) {
    console.log('[chatService] Zaten bağlı/bağlanıyor, skip');
    return;
  }

  // Race guard: getAuthToken() async — iki çağrı aynı anda bu noktayı geçebilir
  if (isConnecting) {
    console.log('[chatService] Zaten bağlanma sürecinde, skip');
    return;
  }
  isConnecting = true;

  intentionalClose = false;
  clearReconnectTimer();
  emitStatus('connecting');

  const token = await getAuthToken();
  if (!token) {
    console.warn('[chatService] Token yok, bağlantı iptal');
    isConnecting = false;
    emitStatus('disconnected');
    return;
  }

  console.log('[chatService] WebSocket açılıyor:', CHAT_WS_URL);

  try {
    const socket = new WebSocket(CHAT_WS_URL);
    ws = socket;

    socket.onopen = () => {
      console.log('[chatService] WS OPEN — auth gönderiliyor');
      isConnecting = false;
      reconnectAttempt = 0;

      if (socket.readyState === WebSocket.OPEN) {
        const isMobile =
          !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
            .Capacitor?.isNativePlatform?.() ||
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        // __APP_VERSION__ Vite define constant (vite.config.ts:11). Async
        // getAppVersion() yerine sync path'i auth payload'a gerek var.
        const appVersion: string =
          (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '';
        socket.send(JSON.stringify({
          type: 'auth',
          token,
          deviceId: getOrCreateDeviceId(),
          platform: isMobile ? 'mobile' : 'desktop',
          appVersion,
        }));
      }
    };

    socket.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.warn('[chatService] Geçersiz JSON alındı');
        return;
      }

      console.log(
        '[chatService] WS MSG:',
        msg.type,
        msg.type === 'history' ? `(${msg.messages?.length ?? 0} mesaj)` : ''
      );

      switch (msg.type) {
        case 'auth_ok': {
          console.log('[chatService] Auth OK, userId:', msg.userId);
          setDmSocket(socket);
          notifyDmConnected();
          emitStatus('connected');
          if (Object.keys(latestPresencePatch).length > 0) {
            sendPresencePatch(latestPresencePatch);
          }

          if (currentRoom && socket.readyState === WebSocket.OPEN) {
            console.log('[chatService] Auth sonrası join:', currentRoom);
            socket.send(JSON.stringify({ type: 'join', roomId: currentRoom }));
          }
          break;
        }

        case 'auth_error': {
          console.error('[chatService] Auth HATA:', msg.message);
          intentionalClose = true;
          emitStatus('disconnected');
          break;
        }

        case 'history':
          handlers.onHistory?.(msg.roomId, msg.messages || []);
          break;

        case 'message':
          handlers.onMessage?.(msg.message);
          break;

        case 'delete':
          handlers.onDelete?.(msg.messageId);
          break;

        case 'edit':
          handlers.onEdit?.(msg.messageId, msg.text);
          break;

        case 'clear':
          handlers.onClear?.(msg.roomId);
          break;

        case 'error':
          console.warn('[chatService] Server error:', msg.message, msg.code ? `(${msg.code})` : '');
          handlers.onError?.({
            code: typeof msg.code === 'string' ? msg.code : undefined,
            message: typeof msg.message === 'string' ? msg.message : 'Bilinmeyen hata',
            retryAfter: typeof msg.retryAfter === 'number' ? msg.retryAfter : undefined,
          });
          break;

        default:
          if (dispatchRealtimeEvent(msg)) break;
          // Presence event'lerini dağıt (presence:update / presence:snapshot)
          if (dispatchPresenceEvent(msg)) break;
          // Invite event'lerini bus'a ilet
          if (dispatchInviteEvent(msg)) break;
          // server:* event'leri (join_request:new vs.)
          if (dispatchServerEvent(msg)) break;
          // DM event'lerini dmService'e yönlendir
          if (!handleDmMessage(msg)) {
            console.log('[chatService] Bilinmeyen mesaj tipi:', msg.type);
          }
      }
    };

    socket.onclose = (event) => {
      console.log(
        '[chatService] WS CLOSE, code:',
        event.code,
        'reason:',
        event.reason,
        'intentional:',
        intentionalClose
      );

      isConnecting = false;
      if (ws === socket) {
        ws = null;
      }

      if (!intentionalClose) {
        emitStatus('reconnecting');
        scheduleReconnect();
      } else {
        emitStatus('disconnected');
      }
    };

    socket.onerror = (event) => {
      console.error('[chatService] WS ERROR:', event);
    };
  } catch (err) {
    isConnecting = false;
    console.error('[chatService] WebSocket oluşturulamadı:', err);
    emitStatus('disconnected');
    scheduleReconnect();
  }
}

export function disconnectChat() {
  console.log('[chatService] disconnectChat()');
  intentionalClose = true;
  clearReconnectTimer();
  setDmSocket(null);

  if (ws) {
    ws.close();
    ws = null;
  }

  currentRoom = null;
  emitStatus('disconnected');
}

export function joinRoom(roomId: string) {
  console.log(
    '[chatService] joinRoom:',
    roomId,
    'ws open:',
    ws?.readyState === WebSocket.OPEN
  );

  currentRoom = roomId;

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join', roomId }));
  }
}

export function leaveRoom() {
  console.log('[chatService] leaveRoom, current:', currentRoom);

  if (ws?.readyState === WebSocket.OPEN && currentRoom) {
    ws.send(JSON.stringify({ type: 'leave' }));
  }

  currentRoom = null;
}

export function sendMessage(text: string) {
  console.log(
    '[chatService] sendMessage:',
    text.slice(0, 30),
    'ws open:',
    ws?.readyState === WebSocket.OPEN,
    'room:',
    currentRoom
  );

  if (ws?.readyState === WebSocket.OPEN && currentRoom) {
    const trimmed = text.slice(0, MAX_MESSAGE_LENGTH);
    ws.send(JSON.stringify({ type: 'send', text: trimmed }));
  }
}

export function deleteMessage(messageId: string) {
  if (!messageId) return;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'delete', messageId }));
  }
}

export function editMessage(messageId: string, text: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'edit', messageId, text: text.slice(0, MAX_MESSAGE_LENGTH) }));
  }
}

export function clearAllMessages() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'clear' }));
  }
}
