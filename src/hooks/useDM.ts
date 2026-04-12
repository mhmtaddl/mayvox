import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../lib/logger';
import {
  setDmHandlers,
  dmLoadConversations,
  dmOpenConversation,
  dmSendMessage,
  dmMarkRead,
  dmRequestUnreadTotal,
  dmHideConversation,
  dmEmitTyping,
  type DmConversation,
  type DmMessage,
} from '../lib/dmService';
import { TYPING_CLEAR_MS, TYPING_EMIT_THROTTLE_MS, shouldEmitTyping } from '../lib/dmUxLogic';
import { handleDmMessage as notifyDmMessage } from '../features/notifications/notificationService';
import { subscribeConnectionStatus } from '../lib/chatService';

/**
 * useDM — DM state yönetimi.
 * conversations listesi + aktif sohbet + unread sayacı.
 */
export function useDM(currentUserId: string | undefined) {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [activeConvKey, setActiveConvKey] = useState<string | null>(null);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitAtRef = useRef(0);

  const activeConvKeyRef = useRef(activeConvKey);
  activeConvKeyRef.current = activeConvKey;

  // Optimistic hide — server confirm gelene kadar client-side filtre
  const hiddenKeysRef = useRef<Set<string>>(new Set());

  // ── Event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    setDmHandlers({
      onConversations: (convos) => {
        // Optimistic hide filtresi — server henüz hide'ı işlememişse client tarafında filtrele
        const filtered = convos.filter(c => !hiddenKeysRef.current.has(c.conversationKey));
        setConversations(filtered);
      },
      onHistory: (convKey, _recipientId, msgs) => {
        if (convKey === activeConvKeyRef.current) {
          setMessages(msgs);
          setLoadingHistory(false);
        }
      },
      onNewMessage: (msg) => {
        // Yeni mesaj gelirse hidden set'ten kaldır — konuşma tekrar görünsün
        hiddenKeysRef.current.delete(msg.conversationKey);

        // Yeni mesaj geldiyse "yazıyor" yanılsamasını anında temizle.
        if (msg.conversationKey === activeConvKeyRef.current && msg.senderId !== currentUserId) {
          setTypingFrom(null);
          if (typingClearTimerRef.current) { clearTimeout(typingClearTimerRef.current); typingClearTimerRef.current = null; }
        }

        // Aktif sohbetteyse mesajları güncelle
        if (msg.conversationKey === activeConvKeyRef.current) {
          setMessages(prev => {
            // Duplicate check
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Aktif sohbetteyse okundu işaretle
          if (msg.senderId !== currentUserId) {
            dmMarkRead(msg.conversationKey);
          }
        }

        // Conversation listesini güncelle
        setConversations(prev => {
          const existing = prev.find(c => c.conversationKey === msg.conversationKey);
          const preview = msg.text.length > 100 ? msg.text.slice(0, 100) + '…' : msg.text;

          if (existing) {
            const updated = prev.map(c =>
              c.conversationKey === msg.conversationKey
                ? {
                    ...c,
                    lastMessage: preview,
                    lastMessageAt: msg.createdAt,
                    unreadCount: msg.conversationKey === activeConvKeyRef.current
                      ? 0
                      : (msg.senderId !== currentUserId ? c.unreadCount + 1 : c.unreadCount),
                  }
                : c
            );
            return updated.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
          }

          // Yeni konuşma
          const newConvo: DmConversation = {
            conversationKey: msg.conversationKey,
            recipientId: msg.senderId === currentUserId ? msg.recipientId : msg.senderId,
            lastMessage: preview,
            lastMessageAt: msg.createdAt,
            unreadCount: msg.conversationKey === activeConvKeyRef.current ? 0 : (msg.senderId !== currentUserId ? 1 : 0),
            createdAt: msg.createdAt,
            recipientName: msg.senderName,
            recipientAvatar: msg.senderAvatar,
          };
          return [newConvo, ...prev];
        });

        // Unread total güncelle
        if (msg.senderId !== currentUserId && msg.conversationKey !== activeConvKeyRef.current) {
          setTotalUnread(prev => prev + 1);
        }

        // Notification service — context filter'ı içeride (self-exclude, same-conv exclude).
        if (msg.senderId !== currentUserId) {
          try { notifyDmMessage(msg); } catch { /* no-op */ }
        }
      },
      onRead: (convKey, _readBy, _readAt) => {
        // Aktif sohbetteki mesajları güncelle
        if (convKey === activeConvKeyRef.current) {
          setMessages(prev => prev.map(m =>
            m.senderId === currentUserId && !m.readAt
              ? { ...m, readAt: _readAt }
              : m
          ));
        }
      },
      onUnreadTotal: (count) => {
        setTotalUnread(count);
      },
      onTyping: (convKey, fromUserId) => {
        // Sadece aktif sohbette ve karşı taraftan gelen typing'i göster.
        if (convKey !== activeConvKeyRef.current) return;
        if (fromUserId === currentUserId) return;
        setTypingFrom(fromUserId);
        if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = setTimeout(() => setTypingFrom(null), TYPING_CLEAR_MS);
      },
      onError: (message) => {
        console.warn('[useDM] Error:', message);
      },
      onConnected: () => {
        // WS auth tamamlandı — conversations ve unread yükle
        dmLoadConversations();
        dmRequestUnreadTotal();
      },
    });
  }, [currentUserId]);

  // İlk yüklemede konuşmaları ve unread çek
  const loadInitial = useCallback(() => {
    if (!currentUserId) return;
    dmLoadConversations();
    dmRequestUnreadTotal();
  }, [currentUserId]);

  // Reconnect recovery — WS yeniden bağlandığında conversation + unread'i senkronize et.
  // İlk 'connected' transition'ı atlanır (zaten onConnected tetikliyor).
  // Gerçek reconnect'te: conversation listesi ve unread total canonical fetch.
  // notificationService fingerprint dedupe sayesinde eski mesajlar için toast üretilmez.
  useEffect(() => {
    if (!currentUserId) return;
    let seenConnected = false;
    const unsub = subscribeConnectionStatus((status) => {
      if (status !== 'connected') return;
      if (!seenConnected) { seenConnected = true; return; }
      // Gerçek reconnect
      dmLoadConversations();
      dmRequestUnreadTotal();
    });
    return unsub;
  }, [currentUserId]);

  // ── Actions ────────────────────────────────────────────────────────────

  const openConversation = useCallback((recipientId: string) => {
    if (!currentUserId) return;
    logger.info('DM open', { recipientId });
    const convKey = currentUserId < recipientId
      ? `dm:${currentUserId}:${recipientId}`
      : `dm:${recipientId}:${currentUserId}`;

    setActiveConvKey(convKey);
    setActiveRecipientId(recipientId);
    setMessages([]);
    setLoadingHistory(true);
    setTypingFrom(null);
    setPanelOpen(true);

    dmOpenConversation(recipientId);

    // Unread güncelle — bu konuşmanın unread'ini sıfırla
    setConversations(prev => prev.map(c =>
      c.conversationKey === convKey ? { ...c, unreadCount: 0 } : c
    ));
    // Total'i yeniden hesapla
    setTotalUnread(prev => {
      const convUnread = conversations.find(c => c.conversationKey === convKey)?.unreadCount || 0;
      return Math.max(0, prev - convUnread);
    });
  }, [currentUserId, conversations]);

  const lastDmSendRef = useRef(0);
  const lastDmTextRef = useRef('');
  const sendMessage = useCallback((text: string) => {
    if (!activeRecipientId || !text.trim()) return;
    const trimmed = text.trim();
    const now = Date.now();
    // 500ms throttle
    if (now - lastDmSendRef.current < 500) return;
    // Duplicate suppression — aynı mesajı 3sn içinde tekrar gönderme
    if (trimmed === lastDmTextRef.current && now - lastDmSendRef.current < 3000) return;
    lastDmSendRef.current = now;
    lastDmTextRef.current = trimmed;
    logger.info('DM send', { recipientId: activeRecipientId });
    dmSendMessage(activeRecipientId, trimmed);
  }, [activeRecipientId]);

  const closeConversation = useCallback(() => {
    setActiveConvKey(null);
    setActiveRecipientId(null);
    setMessages([]);
    setTypingFrom(null);
    setLoadingHistory(false);
    if (typingClearTimerRef.current) { clearTimeout(typingClearTimerRef.current); typingClearTimerRef.current = null; }
  }, []);

  // Debounced typing emit — aktif sohbet olmadan NO-OP.
  const emitTyping = useCallback(() => {
    if (!activeRecipientId) return;
    const now = Date.now();
    if (!shouldEmitTyping(lastTypingEmitAtRef.current, now)) return;
    lastTypingEmitAtRef.current = now;
    dmEmitTyping(activeRecipientId);
  }, [activeRecipientId]);

  // Unmount cleanup — kalıntı typing state olmasın.
  useEffect(() => () => {
    if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    closeConversation();
  }, [closeConversation]);

  // Panel kapandığında aktif sohbeti resetle → tekrar açılınca liste gelsin
  const resetViewOnClose = useCallback(() => {
    setActiveConvKey(null);
    setActiveRecipientId(null);
    setMessages([]);
  }, []);

  const hideConversation = useCallback((convKey: string) => {
    hiddenKeysRef.current.add(convKey);
    dmHideConversation(convKey);
    setConversations(prev => prev.filter(c => c.conversationKey !== convKey));
    // Aktif sohbet buysa kapat
    if (activeConvKey === convKey) {
      setActiveConvKey(null);
      setActiveRecipientId(null);
      setMessages([]);
    }
  }, [activeConvKey]);

  return {
    conversations,
    activeConvKey,
    activeRecipientId,
    messages,
    totalUnread,
    panelOpen,
    loadingHistory,
    typingFrom,
    setPanelOpen,
    loadInitial,
    openConversation,
    sendMessage,
    emitTyping,
    closeConversation,
    resetViewOnClose,
    hideConversation,
    closePanel,
  };
}

// Re-export for consumers
export { TYPING_EMIT_THROTTLE_MS } from '../lib/dmUxLogic';
