import { useState, useRef, useCallback, useEffect } from 'react';
import { getRoomModeConfig } from '../../../lib/roomModeConfig';
import type { ChatEventMeta, ChatMessage } from '../../../lib/chatService';
import { isRoomMessageSoundEnabled } from '../../../features/notifications/notificationSound';
import { decryptTextIfNeeded, encryptTextForUsers } from '../../../lib/e2ee';

interface UseChatMessagesOptions {
  activeChannel: string | null;
  channels: Array<{ id: string; mode?: string; isHidden?: boolean }>;
  roomRecipientIds?: string[];
  currentUser: { id: string; isAdmin?: boolean; isPrimaryAdmin?: boolean; isModerator?: boolean };
  chatMuted: boolean;
  chatMuteRank: number;
  /** Moderasyon chat ban aktif mi — aktifse kullanıcı bypass YAPAMAZ, isAdmin/isModerator farketmez. */
  isChatBanned?: boolean;
  /** Chat ban nedeniyle gönderim engellendiğinde kullanıcıya toast gösterme callback'i. */
  onChatBannedBlocked?: () => void;
  /** Sunucu tarafı send reddi (flood / profanity / generic). Toast göstermek için. */
  onSendRejected?: (message: string, code?: string) => void;
  onChatMuteChange?: (muted: boolean, rank: number, meta?: ChatEventMeta) => void;
  onChatCleared?: (roomId: string, meta?: ChatEventMeta) => void;
  onMessageDeleted?: (messageId: string, meta?: ChatEventMeta) => void;
  onMessageEdited?: (messageId: string, meta?: ChatEventMeta) => void;
  onMessageReported?: (messageId: string, meta?: ChatEventMeta) => void;
}

export function useChatMessages({ activeChannel, channels, roomRecipientIds = [], currentUser, chatMuted, chatMuteRank, isChatBanned, onChatBannedBlocked, onSendRejected, onChatMuteChange, onChatCleared, onMessageDeleted, onMessageEdited, onMessageReported }: UseChatMessagesOptions) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef(0);
  const lastSendTextRef = useRef('');
  // Flood cooldown: server-side limit aşıldığında kullanıcı yazamaz / gönderemez.
  // Timestamp (ms) — 0 ise cooldown aktif değil.
  const [floodCooldownUntil, setFloodCooldownUntil] = useState(0);
  // Cooldown bitince UI'ı uyandırmak için timer ref.
  const floodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onMessage closure `[]` deps ile tek sefer kurulur — currentUser.id
  // değişiminde stale kalmaması için ref'te taşıyoruz. chatMuted ses gate'i
  // DEĞİL (moderator'ın sohbeti yazma engelleme toggle'ı); ses için kullanma.
  const currentUserIdRef = useRef(currentUser.id);
  useEffect(() => { currentUserIdRef.current = currentUser.id; }, [currentUser.id]);
  // onSendRejected callback stale olmasın — ref ile taşı (onMessage gibi tek-sefer handler).
  const onSendRejectedRef = useRef(onSendRejected);
  useEffect(() => { onSendRejectedRef.current = onSendRejected; }, [onSendRejected]);
  const onChatMuteChangeRef = useRef(onChatMuteChange);
  useEffect(() => { onChatMuteChangeRef.current = onChatMuteChange; }, [onChatMuteChange]);
  const onChatClearedRef = useRef(onChatCleared);
  useEffect(() => { onChatClearedRef.current = onChatCleared; }, [onChatCleared]);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  useEffect(() => { onMessageDeletedRef.current = onMessageDeleted; }, [onMessageDeleted]);
  const onMessageEditedRef = useRef(onMessageEdited);
  useEffect(() => { onMessageEditedRef.current = onMessageEdited; }, [onMessageEdited]);
  const onMessageReportedRef = useRef(onMessageReported);
  useEffect(() => { onMessageReportedRef.current = onMessageReported; }, [onMessageReported]);
  const roomRecipientIdsRef = useRef(roomRecipientIds);
  useEffect(() => { roomRecipientIdsRef.current = roomRecipientIds; }, [roomRecipientIds]);
  const channelsRef = useRef(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const decryptChatMessage = useCallback(async (msg: ChatMessage): Promise<ChatMessage> => {
    const result = await decryptTextIfNeeded(msg.text);
    return { ...msg, text: result.text };
  }, []);

  // WebSocket chat bağlantısı
  useEffect(() => {
    import('../../../lib/chatService').then(({ connectChat, setChatHandlers }) => {
      setChatHandlers({
        onHistory: (_roomId, messages) => {
          void Promise.all(messages.map(decryptChatMessage)).then(setChatMessages);
          setTimeout(() => chatScrollRef.current?.scrollTo({ top: chatScrollRef.current?.scrollHeight ?? 0 }), 100);
        },
        onMessage: (rawMsg) => {
          void decryptChatMessage(rawMsg).then(msg => {
          setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          const el = chatScrollRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
            setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 50);
          } else {
            setNewMsgCount(c => c + 1);
          }
          // Oda içi yazılı mesaj tonu — kullanıcı mesaj ayarlarından sessize alabilir.
          if (msg.senderId !== currentUserIdRef.current && isRoomMessageSoundEnabled()) {
            import('../../../lib/audio/SoundManager').then(({ playMessageReceive }) => {
              playMessageReceive();
            });
          }
          });
        },
        onDelete: (messageId, meta) => {
          setChatMessages(prev => prev.filter(m => m.id !== messageId));
          onMessageDeletedRef.current?.(messageId, meta);
        },
        onMessageReported: (messageId, meta) => {
          onMessageReportedRef.current?.(messageId, meta);
        },
        onEdit: (messageId, text, meta) => {
          void decryptTextIfNeeded(text).then(result => {
            setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: result.text } : m));
            onMessageEditedRef.current?.(messageId, meta);
          });
        },
        onClear: (roomId, meta) => {
          setChatMessages([]);
          onChatClearedRef.current?.(roomId, meta);
        },
        onChatMute: (_roomId, muted, rank, meta) => {
          // Oda sohbet kilidi server state'idir; admin/mod toggle'ı herkese yansır.
          onChatMuteChangeRef.current?.(muted, rank, meta);
        },
        onError: (err) => {
          // Cooldown yalnızca flood_control için — diğer rejection'lar anlık reddedilir.
          if (err.code === 'flood_control') {
            const until = Date.now() + (err.retryAfter ?? 3000);
            setFloodCooldownUntil(prev => Math.max(prev, until));
            // Cooldown bitiminde state'i temizle → input tekrar açılır (re-render tetikler).
            if (floodTimerRef.current) clearTimeout(floodTimerRef.current);
            floodTimerRef.current = setTimeout(() => setFloodCooldownUntil(0), (err.retryAfter ?? 3000) + 50);
          }
          // Her rejected send için toast (flood + profanity + generic).
          onSendRejectedRef.current?.(err.message, err.code);
        },
      });
      connectChat();
    });
    return () => {
      import('../../../lib/chatService').then(({ leaveRoom, setChatHandlers }) => {
        leaveRoom();
        setChatHandlers({});
      });
      if (floodTimerRef.current) { clearTimeout(floodTimerRef.current); floodTimerRef.current = null; }
    };
  }, [decryptChatMessage]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Flood cooldown — sunucu WS error dönmüş, UI mesajı gönderme (no-op, sessiz).
    if (Date.now() < floodCooldownUntil) return;
    const userRank = currentUser.isPrimaryAdmin ? 40 : currentUser.isAdmin ? 30 : currentUser.isModerator ? 20 : 0;
    if (chatMuted && userRank < chatMuteRank) return;
    const text = chatInput.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastSendRef.current < 300) return;
    if (text === lastSendTextRef.current && now - lastSendRef.current < 3000) return;
    lastSendRef.current = now;
    lastSendTextRef.current = text;
    setChatInput('');
    const encryptForHiddenRoom = activeChannelObj?.isHidden === true;
    if (encryptForHiddenRoom) {
      const recipients = [...new Set([currentUser.id, ...roomRecipientIdsRef.current])];
      void encryptTextForUsers(text, recipients)
        .then(encrypted => import('../../../lib/chatService').then(({ sendMessage }) => sendMessage(encrypted)))
        .catch(err => onSendRejectedRef.current?.(err instanceof Error ? err.message : 'Mesaj şifrelenemedi.', 'e2ee_encrypt_failed'));
    } else {
      import('../../../lib/chatService').then(({ sendMessage }) => sendMessage(text));
    }
    setTimeout(scrollToBottom, 100);
  }, [activeChannel, channels, chatMuted, chatMuteRank, isChatBanned, onChatBannedBlocked, floodCooldownUntil, currentUser.isAdmin, currentUser.isPrimaryAdmin, currentUser.isModerator, chatInput, scrollToBottom]);

  const deleteChatMessage = useCallback((id: string) => {
    import('../../../lib/chatService').then(({ deleteMessage }) => deleteMessage(id));
  }, []);

  const reportChatMessage = useCallback((id: string) => {
    import('../../../lib/chatService').then(({ reportMessage }) => reportMessage(id));
  }, []);

  const clearAllMessages = useCallback(() => {
    setChatMessages([]);
    import('../../../lib/chatService').then(({ clearAllMessages: clearAll }) => clearAll());
  }, []);

  const startEditMessage = useCallback((msg: { id: string; text: string; senderId?: string }) => {
    if (String(msg.senderId || '') !== String(currentUser.id)) return;
    setEditingMsgId(msg.id);
    setEditingText(msg.text);
  }, [currentUser.id]);

  const saveEditMessage = useCallback(() => {
    if (!editingMsgId) return;
    const t = editingText.trim();
    if (!t) { deleteChatMessage(editingMsgId); setEditingMsgId(null); return; }
    const original = chatMessages.find(m => m.id === editingMsgId);
    if (!original || String(original.senderId) !== String(currentUser.id)) {
      setEditingMsgId(null);
      setEditingText('');
      return;
    }
    setChatMessages(prev => prev.map(m => (
      m.id === editingMsgId && String(m.senderId) === String(currentUser.id)
        ? { ...m, text: t }
        : m
    )));
    const activeChannelObj = channelsRef.current.find(c => c.id === activeChannel);
    if (activeChannelObj?.isHidden) {
      const recipients = [...new Set([currentUser.id, ...roomRecipientIdsRef.current])];
      void encryptTextForUsers(t, recipients)
        .then(encrypted => import('../../../lib/chatService').then(({ editMessage }) => editMessage(editingMsgId!, encrypted)))
        .catch(err => onSendRejectedRef.current?.(err instanceof Error ? err.message : 'Mesaj şifrelenemedi.', 'e2ee_encrypt_failed'));
    } else {
      import('../../../lib/chatService').then(({ editMessage }) => editMessage(editingMsgId!, t));
    }
    setEditingMsgId(null); setEditingText('');
  }, [activeChannel, chatMessages, currentUser.id, editingMsgId, editingText, deleteChatMessage]);

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
    reportChatMessage,
    clearAllMessages,
    startEditMessage,
    saveEditMessage,
    cancelEdit,
    isFloodCooling: floodCooldownUntil > Date.now(),
  };
}
