import { useState, useRef, useCallback, useEffect } from 'react';
import { getRoomModeConfig } from '../../../lib/roomModeConfig';
import type { ChatMessage } from '../../../lib/chatService';

interface UseChatMessagesOptions {
  activeChannel: string | null;
  channels: Array<{ id: string; mode?: string }>;
  currentUser: { isAdmin?: boolean; isModerator?: boolean };
  chatMuted: boolean;
  /** Moderasyon chat ban aktif mi — aktifse kullanıcı bypass YAPAMAZ, isAdmin/isModerator farketmez. */
  isChatBanned?: boolean;
  /** Chat ban nedeniyle gönderim engellendiğinde kullanıcıya toast gösterme callback'i. */
  onChatBannedBlocked?: () => void;
}

export function useChatMessages({ activeChannel, channels, currentUser, chatMuted, isChatBanned, onChatBannedBlocked }: UseChatMessagesOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef(0);
  const lastSendTextRef = useRef('');

  // WebSocket chat bağlantısı
  useEffect(() => {
    import('../../../lib/chatService').then(({ connectChat, setChatHandlers }) => {
      setChatHandlers({
        onHistory: (_roomId, messages) => {
          setChatMessages(messages);
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current?.scrollHeight ?? 0 }), 100);
        },
        onMessage: (msg) => {
          setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          const el = chatScrollRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
            setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 50);
          } else {
            setNewMsgCount(c => c + 1);
          }
        },
        onDelete: (messageId) => setChatMessages(prev => prev.filter(m => m.id !== messageId)),
        onEdit: (messageId, text) => setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, text } : m)),
        onClear: () => setChatMessages([]),
      });
      connectChat();
    });
    return () => { import('../../../lib/chatService').then(({ disconnectChat }) => disconnectChat()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Oda değişince WS'ye join/leave gönder
  useEffect(() => {
    if (!activeChannel) {
      setChatMessages([]);
      import('../../../lib/chatService').then(({ leaveRoom }) => leaveRoom());
      return;
    }
    import('../../../lib/chatService').then(({ joinRoom, connectChat }) => {
      connectChat();
      joinRoom(activeChannel);
    });
  }, [activeChannel]);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMsgCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    setNewMsgCount(0);
  }, []);

  const sendChatMessage = useCallback(() => {
    const activeChannelObj = channels.find(c => c.id === activeChannel);
    if (!getRoomModeConfig(activeChannelObj?.mode).chatEnabled) return;
    // Chat ban — hedefe özgü moderasyon cezası, BYPASS YOK (admin/moderator bile engelli).
    // Backend hierarchy zaten kendi seviyeden üsttekine chat ban atılmasını önler,
    // yani buraya düşen zaten atılabilir bir kullanıcıdır.
    if (isChatBanned) {
      onChatBannedBlocked?.();
      return;
    }
    if (chatMuted && !currentUser.isAdmin && !currentUser.isModerator) return;
    const text = chatInput.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastSendRef.current < 300) return;
    if (text === lastSendTextRef.current && now - lastSendRef.current < 3000) return;
    lastSendRef.current = now;
    lastSendTextRef.current = text;
    setChatInput('');
    import('../../../lib/chatService').then(({ sendMessage }) => sendMessage(text));
    setTimeout(scrollToBottom, 100);
  }, [activeChannel, channels, chatMuted, isChatBanned, onChatBannedBlocked, currentUser.isAdmin, currentUser.isModerator, chatInput, scrollToBottom]);

  const deleteChatMessage = useCallback((id: string) => {
    setChatMessages(prev => prev.filter(m => m.id !== id));
    import('../../../lib/chatService').then(({ deleteMessage }) => deleteMessage(id));
  }, []);

  const clearAllMessages = useCallback(() => {
    setChatMessages([]);
    import('../../../lib/chatService').then(({ clearAllMessages: clearAll }) => clearAll());
  }, []);

  const startEditMessage = useCallback((msg: { id: string; text: string }) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.text);
  }, []);

  const saveEditMessage = useCallback(() => {
    if (!editingMsgId) return;
    const t = editingText.trim();
    if (!t) { deleteChatMessage(editingMsgId); setEditingMsgId(null); return; }
    setChatMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text: t } : m));
    import('../../../lib/chatService').then(({ editMessage }) => editMessage(editingMsgId!, t));
    setEditingMsgId(null); setEditingText('');
  }, [editingMsgId, editingText, deleteChatMessage]);

  const cancelEdit = useCallback(() => {
    setEditingMsgId(null);
    setEditingText('');
  }, []);

  return {
    chatMessages,
    chatInput,
    setChatInput,
    editingMsgId,
    editingText,
    setEditingText,
    isAtBottom,
    newMsgCount,
    chatScrollRef,
    handleChatScroll,
    scrollToBottom,
    sendChatMessage,
    deleteChatMessage,
    clearAllMessages,
    startEditMessage,
    saveEditMessage,
    cancelEdit,
  };
}
