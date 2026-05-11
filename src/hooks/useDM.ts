import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '../lib/logger';
import {
  setDmHandlers,
  dmLoadConversations,
  dmOpenConversation,
  dmSendMessage,
  dmEditMessage,
  dmDeleteMessage,
  dmSetMessagePinned,
  dmReactMessage,
  dmMarkRead,
  dmRequestUnreadTotal,
  dmHideConversation,
  dmEmitTyping,
  dmAcceptRequest,
  dmRejectRequest,
  dmBlockUser,
  dmUnblockUser,
  dmReportUser,
  dmLoadBlocks,
  type DmConversation,
  type DmMessage,
} from '../lib/dmService';
import { TYPING_CLEAR_MS, shouldEmitTyping } from '../lib/dmUxLogic';
import { handleDmMessage as notifyDmMessage } from '../features/notifications/notificationService';
import { subscribeConnectionStatus } from '../lib/chatService';
import { decryptTextIfNeeded, encryptTextForUsers } from '../lib/e2ee';

function toMessagePreview(text: string): string {
  return text.length > 100 ? text.slice(0, 100) + '…' : text;
}

/**
 * useDM — DM state yönetimi.
 * conversations listesi + aktif sohbet + unread sayacı.
 */
export function useDM(currentUserId: string | undefined) {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [requests, setRequests] = useState<DmConversation[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeConvKey, setActiveConvKey] = useState<string | null>(null);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitAtRef = useRef(0);

  const activeConvKeyRef = useRef(activeConvKey);
  activeConvKeyRef.current = activeConvKey;

  // Optimistic hide — server confirm gelene kadar client-side filtre
  const hiddenKeysRef = useRef<Set<string>>(new Set());

  // Mark-read throttle — openConversation + onNewMessage + onConversations'tan
  // peş peşe tetiklenen WS spam'ini idempotent tutar (2sn cooldown per convKey).
  const lastMarkReadRef = useRef<Map<string, number>>(new Map());
  const MARK_READ_COOLDOWN_MS = 2000;
  const markReadSafe = useCallback((convKey: string) => {
    const now = Date.now();
    const last = lastMarkReadRef.current.get(convKey) ?? 0;
    if (now - last < MARK_READ_COOLDOWN_MS) return;
    lastMarkReadRef.current.set(convKey, now);
    dmMarkRead(convKey);
  }, []);

  const decryptDmMessage = useCallback(async (msg: DmMessage): Promise<DmMessage> => {
    const result = await decryptTextIfNeeded(msg.text);
    return { ...msg, text: result.text };
  }, []);

  const decryptConversationPreviews = useCallback(async (items: DmConversation[]): Promise<DmConversation[]> => {
    return Promise.all(items.map(async convo => {
      if (!convo.lastMessage) return convo;
      const result = await decryptTextIfNeeded(convo.lastMessage);
      return { ...convo, lastMessage: toMessagePreview(result.text) };
    }));
  }, []);

  // ── Event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    setDmHandlers({
      onConversations: (convos, requestConvos = []) => {
        // Optimistic hide filtresi — server henüz hide'ı işlememişse client tarafında filtrele
        const filtered = convos.filter(c => !hiddenKeysRef.current.has(c.conversationKey));
        const filteredRequests = requestConvos.filter(c => !hiddenKeysRef.current.has(c.conversationKey));
        // Defensive: openConversation ile loadInitial arasında race oluşmuş olabilir
        // — server listesi aktif konuşma için hâlâ unread>0 taşıyorsa lokalde sıfırla
        // + authoritative mark-read yolla. markReadSafe idempotent.
        const activeKey = activeConvKeyRef.current;
        const staleUnread = activeKey
          ? (filtered.find(c => c.conversationKey === activeKey)?.unreadCount ?? 0)
          : 0;
        const fixed = staleUnread > 0 && activeKey
          ? filtered.map(c => c.conversationKey === activeKey ? { ...c, unreadCount: 0 } : c)
          : filtered;
        void Promise.all([
          decryptConversationPreviews(fixed),
          decryptConversationPreviews(filteredRequests),
        ]).then(([decryptedConvos, decryptedRequests]) => {
          setConversations(decryptedConvos);
          setRequests(decryptedRequests);
        });
        if (staleUnread > 0 && activeKey) {
          markReadSafe(activeKey);
          setTotalUnread(prev => Math.max(0, prev - staleUnread));
        }
      },
      onHistory: (convKey, _recipientId, msgs) => {
        if (convKey === activeConvKeyRef.current) {
          if (historyTimeoutRef.current) {
            clearTimeout(historyTimeoutRef.current);
            historyTimeoutRef.current = null;
          }
          void Promise.all(msgs.map(decryptDmMessage)).then(decrypted => {
            if (convKey !== activeConvKeyRef.current) return;
            setLastError(null);
            setMessages(decrypted);
            setLoadingHistory(false);
          });
        }
      },
      onNewMessage: (rawMsg) => {
        void decryptDmMessage(rawMsg).then(msg => {
        const isIncomingRequest =
          msg.senderId !== currentUserId
          && (
            msg.isRequest === true
            || (msg.requestStatus === 'pending' && msg.requestReceiverId === currentUserId)
          );

        // Yeni mesaj gelirse hidden set'ten kaldır — konuşma tekrar görünsün
        hiddenKeysRef.current.delete(msg.conversationKey);
        if (msg.conversationKey === activeConvKeyRef.current) {
          setLastError(null);
        }

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
          // Aktif sohbetteyse okundu işaretle (throttled — peş peşe mesajda spam yok)
          if (msg.senderId !== currentUserId) {
            markReadSafe(msg.conversationKey);
          }
        }

        // Conversation listesini güncelle
        const updateList = (prev: DmConversation[]) => {
          const existing = prev.find(c => c.conversationKey === msg.conversationKey);
          const preview = toMessagePreview(msg.text);

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
            requestStatus: msg.requestStatus,
            requestReceiverId: msg.requestReceiverId,
            isRequest: msg.isRequest,
          };
          return [newConvo, ...prev];
        };
        if (isIncomingRequest) {
          setRequests(updateList);
          setConversations(prev => prev.filter(c => c.conversationKey !== msg.conversationKey));
        } else {
          setConversations(updateList);
          setRequests(prev => prev.filter(c => c.conversationKey !== msg.conversationKey));
        }

        // Unread total güncelle
        if (msg.senderId !== currentUserId && msg.conversationKey !== activeConvKeyRef.current) {
          setTotalUnread(prev => prev + 1);
        }

        // Notification service — context filter'ı içeride (self-exclude, same-conv exclude).
        if (msg.senderId !== currentUserId) {
          try { notifyDmMessage(msg); } catch { /* no-op */ }
        }
        });
      },
      onRead: (convKey, _readBy, _readAt) => {
        // Aktif sohbetteki mesajları güncelle
        if (convKey === activeConvKeyRef.current) {
          setMessages(prev => prev.map(m =>
            m.senderId === currentUserId && !m.readAt
              ? { ...m, readAt: _readAt, deliveredAt: m.deliveredAt ?? _readAt }
              : m
          ));
        }
      },
      onDelivered: (convKey, messageIds, deliveredAt) => {
        // Aktif sohbetteyse mesaj listesindeki ilgili mesajlara deliveredAt bas.
        if (convKey !== activeConvKeyRef.current) return;
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;
        const idSet = new Set(messageIds);
        setMessages(prev => prev.map(m =>
          idSet.has(m.id) && !m.deliveredAt
            ? { ...m, deliveredAt }
            : m
        ));
      },
      onMessageEdited: (msg, lastMessage, lastMessageAt) => {
        if (!msg?.id) return;
        void decryptDmMessage(msg).then(decrypted => {
          if (decrypted.conversationKey === activeConvKeyRef.current) {
            setMessages(prev => prev.map(m =>
              m.id === decrypted.id
                ? { ...m, text: decrypted.text, editedAt: decrypted.editedAt ?? Date.now() }
                : m
            ));
          }
          const preview = toMessagePreview(decrypted.text);
          if (typeof lastMessage === 'string' && typeof lastMessageAt === 'number') {
            setConversations(prev => prev.map(c =>
              c.conversationKey === decrypted.conversationKey
                ? { ...c, lastMessage: preview, lastMessageAt }
                : c
            ).sort((a, b) => b.lastMessageAt - a.lastMessageAt));
          }
        });
      },
      onMessageDeleted: (convKey, messageId, lastMessage, lastMessageAt) => {
        if (!convKey || !messageId) return;
        if (convKey === activeConvKeyRef.current) {
          setMessages(prev => prev.filter(m => m.id !== messageId));
        }
        if (typeof lastMessage === 'string' && typeof lastMessageAt === 'number') {
          void decryptTextIfNeeded(lastMessage).then(result => {
            const preview = toMessagePreview(result.text);
            setConversations(prev => prev.map(c =>
              c.conversationKey === convKey
                ? { ...c, lastMessage: preview, lastMessageAt }
                : c
            ).sort((a, b) => b.lastMessageAt - a.lastMessageAt));
          });
        }
      },
      onReaction: (convKey, messageId, reactions) => {
        if (convKey !== activeConvKeyRef.current) return;
        setMessages(prev => prev.map(m => (
          m.id === messageId ? { ...m, reactions } : m
        )));
      },
      onMessagePinned: (convKey, messageId, pinned, pinnedBy, pinnedAt) => {
        if (convKey !== activeConvKeyRef.current) return;
        setMessages(prev => prev.map(m => (
          m.id === messageId
            ? { ...m, pinnedBy: pinned ? (pinnedBy ?? null) : null, pinnedAt: pinned ? (pinnedAt ?? null) : null }
            : m
        )));
      },
      onUnreadTotal: (count) => {
        setTotalUnread(Math.max(0, count));
      },
      onTyping: (convKey, fromUserId) => {
        // Sadece aktif sohbette ve karşı taraftan gelen typing'i göster.
        if (convKey !== activeConvKeyRef.current) return;
        if (fromUserId === currentUserId) return;
        setTypingFrom(fromUserId);
        if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = setTimeout(() => setTypingFrom(null), TYPING_CLEAR_MS);
      },
      onRequestUpdated: (convKey, status) => {
        setLastError(null);
        if (convKey && status && convKey === activeConvKeyRef.current) {
          setMessages(prev => prev.map(m => ({ ...m, requestStatus: status as DmMessage['requestStatus'] })));
        }
        dmLoadConversations();
        dmRequestUnreadTotal();
      },
      onBlocks: (ids) => {
        setBlockedIds(new Set(ids));
      },
      onError: (message) => {
        console.warn('[useDM] Error:', message);
        setLastError(message);
        if (historyTimeoutRef.current) {
          clearTimeout(historyTimeoutRef.current);
          historyTimeoutRef.current = null;
        }
        setLoadingHistory(false);
      },
      onConnected: () => {
        // WS auth tamamlandı — conversations ve unread yükle
        dmLoadConversations();
        dmRequestUnreadTotal();
        dmLoadBlocks();
      },
    });
  }, [currentUserId, decryptConversationPreviews, decryptDmMessage, markReadSafe]);

  // İlk yüklemede konuşmaları ve unread çek
  const loadInitial = useCallback(() => {
    if (!currentUserId) return;
    dmLoadConversations();
    dmRequestUnreadTotal();
    dmLoadBlocks();
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
      dmLoadBlocks();
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

    activeConvKeyRef.current = convKey;
    setActiveConvKey(convKey);
    setActiveRecipientId(recipientId);
    setMessages([]);
    setLastError(null);
    setLoadingHistory(true);
    setTypingFrom(null);
    setPanelOpen(true);
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    historyTimeoutRef.current = setTimeout(() => {
      if (activeConvKeyRef.current === convKey) {
        setLoadingHistory(false);
      }
      historyTimeoutRef.current = null;
    }, 4500);

    dmOpenConversation(recipientId);
    // Authoritative mark-read — dm:open event'i mark-read GARANTİ ETMİYOR,
    // sunucu tarafı unread persistence'ını ayrı `dm:mark_read` ile sıfırla.
    // Throttle idempotency sağlar; loadInitial sonrası onConversations'ta da
    // race durumunda tekrar tetiklenebilir (cooldown içinde no-op).
    markReadSafe(convKey);

    // Unread güncelle — bu konuşmanın unread'ini lokalde sıfırla
    setConversations(prev => prev.map(c =>
      c.conversationKey === convKey ? { ...c, unreadCount: 0 } : c
    ));
    // Total'i yeniden hesapla (conversations boşsa convUnread=0, setTotalUnread
    // NO-OP; gerçek düşürme loadInitial dönüp onConversations race-fix'te olur).
    setTotalUnread(prev => {
      const convUnread = conversations.find(c => c.conversationKey === convKey)?.unreadCount || 0;
      return Math.max(0, prev - convUnread);
    });
  }, [currentUserId, conversations, markReadSafe]);

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
    setLastError(null);
    void encryptTextForUsers(trimmed, [currentUserId || '', activeRecipientId])
      .then(encrypted => {
        const sent = dmSendMessage(activeRecipientId, encrypted);
        if (!sent) setLastError('Mesaj gönderilemedi: bağlantı hazır değil.');
      })
      .catch(err => setLastError(err instanceof Error ? err.message : 'Mesaj şifrelenemedi.'));
  }, [activeRecipientId, currentUserId]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!messageId) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    dmDeleteMessage(messageId);
  }, []);

  const reactMessage = useCallback((messageId: string, emoji: string) => {
    if (!messageId || !emoji) return;
    dmReactMessage(messageId, emoji);
  }, []);

  const pinMessage = useCallback((messageId: string, pinned: boolean) => {
    if (!messageId) return;
    setMessages(prev => prev.map(m => (
      m.id === messageId
        ? { ...m, pinnedBy: pinned ? (currentUserId ?? null) : null, pinnedAt: pinned ? Date.now() : null }
        : m
    )));
    dmSetMessagePinned(messageId, pinned);
  }, [currentUserId]);

  const editMessage = useCallback((messageId: string, text: string) => {
    if (!messageId) return;
    const trimmed = text.trim();
    if (!trimmed) {
      deleteMessage(messageId);
      return;
    }
    const target = messages.find(m => m.id === messageId);
    if (!target || String(target.senderId) !== String(currentUserId)) return;
    setMessages(prev => prev.map(m => (
      m.id === messageId && String(m.senderId) === String(currentUserId)
        ? { ...m, text: trimmed, editedAt: Date.now() }
        : m
    )));
    void encryptTextForUsers(trimmed, [currentUserId || '', activeRecipientId || ''])
      .then(encrypted => dmEditMessage(messageId, encrypted))
      .catch(err => setLastError(err instanceof Error ? err.message : 'Mesaj şifrelenemedi.'));
  }, [activeRecipientId, currentUserId, deleteMessage, messages]);

  const closeConversation = useCallback(() => {
    setActiveConvKey(null);
    setActiveRecipientId(null);
    setMessages([]);
    setTypingFrom(null);
    setLoadingHistory(false);
    if (historyTimeoutRef.current) { clearTimeout(historyTimeoutRef.current); historyTimeoutRef.current = null; }
    if (typingClearTimerRef.current) { clearTimeout(typingClearTimerRef.current); typingClearTimerRef.current = null; }
  }, []);

  const acceptRequest = useCallback((convKey: string) => {
    if (!convKey) return;
    dmAcceptRequest(convKey);
    setRequests(prev => prev.filter(c => c.conversationKey !== convKey));
    dmLoadConversations();
  }, []);

  const rejectRequest = useCallback((convKey: string) => {
    if (!convKey) return;
    dmRejectRequest(convKey);
    setRequests(prev => prev.filter(c => c.conversationKey !== convKey));
    if (activeConvKey === convKey) closeConversation();
  }, [activeConvKey, closeConversation]);

  const blockUser = useCallback((userId: string) => {
    if (!userId) return;
    dmBlockUser(userId);
    setBlockedIds(prev => new Set(prev).add(userId));
    setConversations(prev => prev.filter(c => c.recipientId !== userId));
    setRequests(prev => prev.filter(c => c.recipientId !== userId));
    if (activeRecipientId === userId) closeConversation();
  }, [activeRecipientId, closeConversation]);

  const unblockUser = useCallback((userId: string) => {
    if (!userId) return;
    dmUnblockUser(userId);
    setBlockedIds(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    dmLoadConversations();
  }, []);

  const reportUser = useCallback((userId: string) => {
    if (!userId) return;
    dmReportUser(userId, activeConvKeyRef.current);
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
    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
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
    setLoadingHistory(false);
    if (historyTimeoutRef.current) { clearTimeout(historyTimeoutRef.current); historyTimeoutRef.current = null; }
  }, []);

  const hideConversation = useCallback((convKey: string) => {
    hiddenKeysRef.current.add(convKey);
    dmHideConversation(convKey);
    setConversations(prev => prev.filter(c => c.conversationKey !== convKey));
    setRequests(prev => prev.filter(c => c.conversationKey !== convKey));
    // Aktif sohbet buysa kapat
    if (activeConvKey === convKey) {
      setActiveConvKey(null);
      setActiveRecipientId(null);
      setMessages([]);
      setLoadingHistory(false);
      if (historyTimeoutRef.current) { clearTimeout(historyTimeoutRef.current); historyTimeoutRef.current = null; }
    }
  }, [activeConvKey]);

  return {
    conversations,
    requests,
    blockedIds,
    activeConvKey,
    activeRecipientId,
    messages,
    totalUnread,
    panelOpen,
    loadingHistory,
    typingFrom,
    lastError,
    setPanelOpen,
    loadInitial,
    openConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    reactMessage,
    acceptRequest,
    rejectRequest,
    blockUser,
    unblockUser,
    reportUser,
    emitTyping,
    closeConversation,
    resetViewOnClose,
    hideConversation,
    closePanel,
  };
}

// Re-export for consumers
export { TYPING_EMIT_THROTTLE_MS } from '../lib/dmUxLogic';
