import { useState, useEffect, useCallback, useRef } from 'react';
import {
  setDmHandlers,
  dmLoadConversations,
  dmOpenConversation,
  dmSendMessage,
  dmMarkRead,
  dmRequestUnreadTotal,
  dmHideConversation,
  type DmConversation,
  type DmMessage,
} from '../lib/dmService';

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

  const activeConvKeyRef = useRef(activeConvKey);
  activeConvKeyRef.current = activeConvKey;

  // ── Event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    setDmHandlers({
      onConversations: (convos) => {
        setConversations(convos);
      },
      onHistory: (convKey, _recipientId, msgs) => {
        if (convKey === activeConvKeyRef.current) {
          setMessages(msgs);
        }
      },
      onNewMessage: (msg) => {
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

  // ── Actions ────────────────────────────────────────────────────────────

  const openConversation = useCallback((recipientId: string) => {
    if (!currentUserId) return;
    const convKey = currentUserId < recipientId
      ? `dm:${currentUserId}:${recipientId}`
      : `dm:${recipientId}:${currentUserId}`;

    setActiveConvKey(convKey);
    setActiveRecipientId(recipientId);
    setMessages([]);
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

  const sendMessage = useCallback((text: string) => {
    if (!activeRecipientId || !text.trim()) return;
    dmSendMessage(activeRecipientId, text.trim());
  }, [activeRecipientId]);

  const closeConversation = useCallback(() => {
    setActiveConvKey(null);
    setActiveRecipientId(null);
    setMessages([]);
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
    setPanelOpen,
    loadInitial,
    openConversation,
    sendMessage,
    closeConversation,
    resetViewOnClose,
    hideConversation,
    closePanel,
  };
}
