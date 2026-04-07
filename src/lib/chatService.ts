/**
 * PigeVox WebSocket Chat Service
 * - Reconnect-safe
 * - Room-based
 * - Supabase JWT auth
 */

import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  senderId: string;
  sender: string;
  avatar: string;
  text: string;
  time: number;
}

type ChatEventHandler = {
  onMessage?: (msg: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => void;
  onClear?: (roomId: string) => void;
  onHistory?: (roomId: string, messages: ChatMessage[]) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
};

const CHAT_WS_URL = import.meta.env.VITE_CHAT_WS_URL || 'wss://api.cylksohbet.org/ws/chat';

console.log('[chatService] WS URL:', CHAT_WS_URL);

let ws: WebSocket | null = null;
let currentRoom: string | null = null;
let handlers: ChatEventHandler = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;

function getReconnectDelay() {
  return Math.min(1000 * Math.pow(2, reconnectAttempt), 15000);
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  console.log('[chatService] Token:', token ? `${token.slice(0, 20)}...` : 'YOK');
  return token;
}

export function setChatHandlers(h: ChatEventHandler) {
  handlers = h;
}

export async function connectChat() {
  console.log('[chatService] connectChat() çağrıldı, ws state:', ws?.readyState);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('[chatService] Zaten bağlı/bağlanıyor, skip');
    return;
  }

  intentionalClose = false;
  handlers.onStatusChange?.('connecting');

  const token = await getAuthToken();
  if (!token) {
    console.warn('[chatService] Token yok, bağlantı iptal');
    handlers.onStatusChange?.('disconnected');
    return;
  }

  console.log('[chatService] WebSocket açılıyor:', CHAT_WS_URL);
  try {
    ws = new WebSocket(CHAT_WS_URL);
  } catch (err) {
    console.error('[chatService] WebSocket oluşturulamadı:', err);
    handlers.onStatusChange?.('disconnected');
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[chatService] WS OPEN — auth gönderiliyor');
    reconnectAttempt = 0;
    ws!.send(JSON.stringify({ type: 'auth', token }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    console.log('[chatService] WS MSG:', msg.type, msg.type === 'history' ? `(${msg.messages?.length} mesaj)` : '');

    switch (msg.type) {
      case 'auth_ok':
        console.log('[chatService] Auth OK, userId:', msg.userId);
        handlers.onStatusChange?.('connected');
        if (currentRoom) {
          console.log('[chatService] Auth sonrası join:', currentRoom);
          ws!.send(JSON.stringify({ type: 'join', roomId: currentRoom }));
        }
        break;
      case 'auth_error':
        console.error('[chatService] Auth HATA:', msg.message);
        handlers.onStatusChange?.('disconnected');
        break;
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
        console.warn('[chatService] Server error:', msg.message);
        break;
    }
  };

  ws.onclose = (event) => {
    console.log('[chatService] WS CLOSE, code:', event.code, 'reason:', event.reason, 'intentional:', intentionalClose);
    ws = null;
    if (!intentionalClose) {
      handlers.onStatusChange?.('reconnecting');
      scheduleReconnect();
    } else {
      handlers.onStatusChange?.('disconnected');
    }
  };

  ws.onerror = (event) => {
    console.error('[chatService] WS ERROR:', event);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempt++;
  const delay = getReconnectDelay();
  console.log(`[chatService] Reconnect #${reconnectAttempt}, ${delay}ms sonra`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectChat();
  }, delay);
}

export function disconnectChat() {
  console.log('[chatService] disconnectChat()');
  intentionalClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  currentRoom = null;
  handlers.onStatusChange?.('disconnected');
}

export function joinRoom(roomId: string) {
  console.log('[chatService] joinRoom:', roomId, 'ws open:', ws?.readyState === WebSocket.OPEN);
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
  console.log('[chatService] sendMessage:', text.slice(0, 30), 'ws open:', ws?.readyState === WebSocket.OPEN, 'room:', currentRoom);
  if (ws?.readyState === WebSocket.OPEN && currentRoom) {
    ws.send(JSON.stringify({ type: 'send', text }));
  }
}

export function deleteMessage(messageId: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'delete', messageId }));
  }
}

export function editMessage(messageId: string, text: string) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'edit', messageId, text }));
  }
}

export function clearAllMessages() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'clear' }));
  }
}
