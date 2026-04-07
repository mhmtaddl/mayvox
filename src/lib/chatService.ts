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

let ws: WebSocket | null = null;
let currentRoom: string | null = null;
let handlers: ChatEventHandler = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;

function getReconnectDelay() {
  return Math.min(1000 * Math.pow(2, reconnectAttempt), 15000); // max 15sn
}

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function setChatHandlers(h: ChatEventHandler) {
  handlers = h;
}

export async function connectChat() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  intentionalClose = false;
  handlers.onStatusChange?.('connecting');

  const token = await getAuthToken();
  if (!token) {
    handlers.onStatusChange?.('disconnected');
    return;
  }

  try {
    ws = new WebSocket(CHAT_WS_URL);
  } catch {
    handlers.onStatusChange?.('disconnected');
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;
    // Auth gönder
    ws!.send(JSON.stringify({ type: 'auth', token }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case 'auth_ok':
        handlers.onStatusChange?.('connected');
        // Auth sonrası odaya katıl
        if (currentRoom) ws!.send(JSON.stringify({ type: 'join', roomId: currentRoom }));
        break;
      case 'auth_error':
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
        console.warn('[chat] Server error:', msg.message);
        break;
    }
  };

  ws.onclose = () => {
    ws = null;
    if (!intentionalClose) {
      handlers.onStatusChange?.('reconnecting');
      scheduleReconnect();
    } else {
      handlers.onStatusChange?.('disconnected');
    }
  };

  ws.onerror = () => {
    // onclose da tetiklenecek
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempt++;
  const delay = getReconnectDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectChat();
  }, delay);
}

export function disconnectChat() {
  intentionalClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  currentRoom = null;
  handlers.onStatusChange?.('disconnected');
}

export function joinRoom(roomId: string) {
  currentRoom = roomId;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join', roomId }));
  }
}

export function leaveRoom() {
  if (ws?.readyState === WebSocket.OPEN && currentRoom) {
    ws.send(JSON.stringify({ type: 'leave' }));
  }
  currentRoom = null;
}

export function sendMessage(text: string) {
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
