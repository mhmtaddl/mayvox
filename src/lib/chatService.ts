/**
 * PigeVox WebSocket Chat Service
 * - Reconnect-safe
 * - Room-based
 * - Supabase JWT auth
 */

import { supabase } from './supabase';
import { handleDmMessage, setDmSocket, notifyDmConnected } from './dmService';

export interface ChatMessage {
  id: string;
  senderId: string;
  sender: string;
  avatar: string;
  text: string;
  time: number;
}

type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type ChatEventHandler = {
  onMessage?: (msg: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string) => void;
  onClear?: (roomId: string) => void;
  onHistory?: (roomId: string, messages: ChatMessage[]) => void;
  onStatusChange?: (status: ChatStatus) => void;
};

const CHAT_WS_URL =
  import.meta.env.VITE_CHAT_WS_URL || 'wss://api.cylksohbet.org/ws/chat';

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
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[chatService] getSession error:', error);
    return null;
  }

  const token = data.session?.access_token ?? null;
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

  intentionalClose = false;
  clearReconnectTimer();
  handlers.onStatusChange?.('connecting');

  const token = await getAuthToken();
  if (!token) {
    console.warn('[chatService] Token yok, bağlantı iptal');
    handlers.onStatusChange?.('disconnected');
    return;
  }

  console.log('[chatService] WebSocket açılıyor:', CHAT_WS_URL);

  try {
    const socket = new WebSocket(CHAT_WS_URL);
    ws = socket;

    socket.onopen = () => {
      console.log('[chatService] WS OPEN — auth gönderiliyor');
      reconnectAttempt = 0;

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', token }));
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
          handlers.onStatusChange?.('connected');

          if (currentRoom && socket.readyState === WebSocket.OPEN) {
            console.log('[chatService] Auth sonrası join:', currentRoom);
            socket.send(JSON.stringify({ type: 'join', roomId: currentRoom }));
          }
          break;
        }

        case 'auth_error': {
          console.error('[chatService] Auth HATA:', msg.message);
          intentionalClose = true;
          handlers.onStatusChange?.('disconnected');
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
          console.warn('[chatService] Server error:', msg.message);
          break;

        default:
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

      if (ws === socket) {
        ws = null;
      }

      if (!intentionalClose) {
        handlers.onStatusChange?.('reconnecting');
        scheduleReconnect();
      } else {
        handlers.onStatusChange?.('disconnected');
      }
    };

    socket.onerror = (event) => {
      console.error('[chatService] WS ERROR:', event);
    };
  } catch (err) {
    console.error('[chatService] WebSocket oluşturulamadı:', err);
    handlers.onStatusChange?.('disconnected');
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
  handlers.onStatusChange?.('disconnected');
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