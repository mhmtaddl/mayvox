/**
 * PigeVox DM Service
 * - Mevcut chat WebSocket üzerinden dm:* event'leri
 * - Room chat'ten bağımsız
 */

export interface DmMessage {
  id: string;
  conversationKey: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  recipientId: string;
  text: string;
  createdAt: number;
  readAt?: number | null;
}

export interface DmConversation {
  conversationKey: string;
  recipientId: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  createdAt: number;
  // Client-side enriched
  recipientName?: string;
  recipientAvatar?: string;
}

export type DmEventHandler = {
  onConversations?: (convos: DmConversation[]) => void;
  onHistory?: (convKey: string, recipientId: string, messages: DmMessage[]) => void;
  onNewMessage?: (msg: DmMessage) => void;
  onRead?: (convKey: string, readBy: string, readAt: number) => void;
  onUnreadTotal?: (count: number) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
};

// WebSocket reference — chatService'ten paylaşılacak
let ws: WebSocket | null = null;
let handlers: DmEventHandler = {};

export function setDmHandlers(h: DmEventHandler) {
  handlers = h;
}

export function setDmSocket(socket: WebSocket | null) {
  ws = socket;
}

/** chatService auth_ok sonrası çağırır */
export function notifyDmConnected() {
  handlers.onConnected?.();
}

/**
 * chatService onmessage içinden çağrılır — dm:* mesajlarını yakalar
 */
export function handleDmMessage(msg: any): boolean {
  switch (msg.type) {
    case 'dm:conversations':
      handlers.onConversations?.(msg.conversations || []);
      return true;
    case 'dm:history':
      handlers.onHistory?.(msg.conversationKey, msg.recipientId, msg.messages || []);
      return true;
    case 'dm:new_message':
      handlers.onNewMessage?.(msg.message);
      return true;
    case 'dm:read':
      handlers.onRead?.(msg.conversationKey, msg.readBy, msg.readAt);
      return true;
    case 'dm:unread_total':
      handlers.onUnreadTotal?.(msg.count ?? 0);
      return true;
    case 'dm:error':
      handlers.onError?.(msg.message || 'DM hatası');
      return true;
    default:
      return false;
  }
}

// ── API ──────────────────────────────────────────────────────────────────

function wsSend(data: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function dmLoadConversations() {
  wsSend({ type: 'dm:conversations' });
}

export function dmOpenConversation(recipientId: string) {
  wsSend({ type: 'dm:open', recipientId });
}

export function dmSendMessage(recipientId: string, text: string) {
  wsSend({ type: 'dm:send', recipientId, text });
}

export function dmMarkRead(conversationKey: string) {
  wsSend({ type: 'dm:mark_read', conversationKey });
}

export function dmRequestUnreadTotal() {
  wsSend({ type: 'dm:unread_total' });
}
