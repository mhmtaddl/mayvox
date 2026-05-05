/**
 * MAYVOX DM Service
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
  deliveredAt?: number | null;
  editedAt?: number | null;
  requestStatus?: 'none' | 'pending' | 'accepted' | 'rejected';
  requestReceiverId?: string | null;
  isRequest?: boolean;
}

export interface DmConversation {
  conversationKey: string;
  recipientId: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  createdAt: number;
  // Server-side enrichment (chat-server profiles cache). Yoksa client fallback.
  recipientName?: string;
  recipientAvatar?: string | null;
  requestStatus?: 'none' | 'pending' | 'accepted' | 'rejected';
  requestReceiverId?: string | null;
  requestCreatedAt?: number | null;
  isRequest?: boolean;
}

export type DmEventHandler = {
  onConversations?: (convos: DmConversation[], requests?: DmConversation[]) => void;
  onHistory?: (convKey: string, recipientId: string, messages: DmMessage[]) => void;
  onNewMessage?: (msg: DmMessage) => void;
  onRead?: (convKey: string, readBy: string, readAt: number) => void;
  onDelivered?: (convKey: string, messageIds: string[], deliveredAt: number) => void;
  onMessageEdited?: (msg: DmMessage, lastMessage?: string, lastMessageAt?: number) => void;
  onMessageDeleted?: (convKey: string, messageId: string, lastMessage?: string, lastMessageAt?: number) => void;
  onUnreadTotal?: (count: number) => void;
  onTyping?: (convKey: string, fromUserId: string) => void;
  onRequestUpdated?: (conversationKey: string, status: string, otherUserId?: string) => void;
  onBlocks?: (blockedIds: string[]) => void;
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
      handlers.onConversations?.(msg.conversations || [], msg.requests || []);
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
    case 'dm:delivered':
      handlers.onDelivered?.(msg.conversationKey, msg.messageIds || [], msg.deliveredAt);
      return true;
    case 'dm:message_edited':
      handlers.onMessageEdited?.(msg.message, msg.lastMessage, msg.lastMessageAt);
      return true;
    case 'dm:message_deleted':
      handlers.onMessageDeleted?.(msg.conversationKey, msg.messageId, msg.lastMessage, msg.lastMessageAt);
      return true;
    case 'dm:unread_total':
      handlers.onUnreadTotal?.(msg.count ?? 0);
      return true;
    case 'dm:typing':
      handlers.onTyping?.(msg.conversationKey, msg.fromUserId);
      return true;
    case 'dm:request_updated':
      handlers.onRequestUpdated?.(msg.conversationKey, msg.status, msg.otherUserId);
      return true;
    case 'dm:blocks':
      handlers.onBlocks?.(Array.isArray(msg.blockedIds) ? msg.blockedIds : []);
      return true;
    case 'dm:error':
      handlers.onError?.(msg.message || 'DM hatası');
      return true;
    default:
      return false;
  }
}

const MAX_DM_LENGTH = 2000;

// ── API ──────────────────────────────────────────────────────────────────

function wsSend(data: Record<string, unknown>): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  console.warn('[dmService] WebSocket hazır değil, DM event gönderilemedi:', data.type);
  return false;
}

export function dmLoadConversations() {
  wsSend({ type: 'dm:conversations' });
}

export function dmOpenConversation(recipientId: string) {
  if (!recipientId) return;
  wsSend({ type: 'dm:open', recipientId });
}

export function dmSendMessage(recipientId: string, text: string): boolean {
  if (!recipientId || !text) return false;
  return wsSend({ type: 'dm:send', recipientId, text: text.slice(0, MAX_DM_LENGTH) });
}

export function dmEditMessage(messageId: string, text: string) {
  if (!messageId || !text) return;
  wsSend({ type: 'dm:edit', messageId, text: text.slice(0, MAX_DM_LENGTH) });
}

export function dmDeleteMessage(messageId: string) {
  if (!messageId) return;
  wsSend({ type: 'dm:delete', messageId });
}

export function dmHideConversation(conversationKey: string) {
  if (!conversationKey) return;
  wsSend({ type: 'dm:hide_conversation', conversationKey });
}

export function dmMarkRead(conversationKey: string) {
  if (!conversationKey) return;
  wsSend({ type: 'dm:mark_read', conversationKey });
}

export function dmRequestUnreadTotal() {
  wsSend({ type: 'dm:unread_total' });
}

export function dmAcceptRequest(conversationKey: string) {
  if (!conversationKey) return;
  wsSend({ type: 'dm:accept_request', conversationKey });
}

export function dmRejectRequest(conversationKey: string) {
  if (!conversationKey) return;
  wsSend({ type: 'dm:reject_request', conversationKey });
}

export function dmBlockUser(userId: string) {
  if (!userId) return;
  wsSend({ type: 'dm:block_user', userId });
}

export function dmUnblockUser(userId: string) {
  if (!userId) return;
  wsSend({ type: 'dm:unblock_user', userId });
}

export function dmReportUser(userId: string, conversationKey?: string | null) {
  if (!userId) return;
  wsSend({ type: 'dm:report_user', userId, conversationKey: conversationKey || undefined });
}

export function dmLoadBlocks() {
  wsSend({ type: 'dm:blocks' });
}

// Ephemeral typing event — client-side debounce önerilir.
// chat-server sadece relay + DM access gate + burst rate limit uygular.
export function dmEmitTyping(recipientId: string) {
  if (!recipientId) return;
  wsSend({ type: 'dm:typing', recipientId });
}
