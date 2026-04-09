import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, ArrowLeft, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import { useUser } from '../contexts/UserContext';
import { useDM } from '../hooks/useDM';
import type { DmConversation, DmMessage } from '../lib/dmService';

// ── Conversation List ────────────────────────────────────────────────────

function ConversationItem({
  convo, allUsers, currentUserId, onClick,
}: {
  key?: React.Key;
  convo: DmConversation;
  allUsers: any[];
  currentUserId: string;
  onClick: () => void;
}) {
  const user = allUsers.find((u: any) => u.id === convo.recipientId);
  const name = user
    ? formatFullName(user.firstName, user.lastName)
    : convo.recipientName || 'Kullanıcı';
  const avatar = user?.avatar || convo.recipientAvatar || '';
  const hasAvatar = avatar?.startsWith('http');
  const initial = (name?.[0] || '?').toUpperCase();

  const timeStr = convo.lastMessageAt
    ? (() => {
        const d = new Date(convo.lastMessageAt);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
          return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        }
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Dün';
        return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`;
      })()
    : '';

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition-all hover:bg-[rgba(var(--glass-tint),0.05)] text-left"
    >
      <div className="shrink-0 w-9 h-9 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
        {hasAvatar
          ? <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          : <span className="text-[11px] font-bold text-[var(--theme-accent)] opacity-60">{initial}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{name}</span>
          {timeStr && <span className="text-[9px] text-[var(--theme-secondary-text)]/40 shrink-0">{timeStr}</span>}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[10px] text-[var(--theme-secondary-text)]/50 truncate">{convo.lastMessage || 'Henüz mesaj yok'}</span>
          {convo.unreadCount > 0 && (
            <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-[var(--theme-accent)] text-white text-[9px] font-bold flex items-center justify-center">
              {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { key?: React.Key; msg: DmMessage; isOwn: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-[12px] leading-relaxed ${
          isOwn
            ? 'bg-[var(--theme-accent)] text-white rounded-br-md'
            : 'bg-[rgba(var(--glass-tint),0.06)] text-[var(--theme-text)] rounded-bl-md'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        <span className={`block text-[8px] mt-0.5 ${isOwn ? 'text-white/50 text-right' : 'text-[var(--theme-secondary-text)]/30'}`}>
          {time}
        </span>
      </div>
    </div>
  );
}

// ── Chat View (active conversation) ──────────────────────────────────────

function ChatArea({
  messages, currentUserId, recipientId, allUsers, onSend, onBack,
}: {
  messages: DmMessage[];
  currentUserId: string;
  recipientId: string;
  allUsers: any[];
  onSend: (text: string) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recipient = allUsers.find((u: any) => u.id === recipientId);
  const recipientName = recipient ? formatFullName(recipient.firstName, recipient.lastName) : 'Kullanıcı';
  const recipientAvatar = recipient?.avatar || '';
  const hasAvatar = recipientAvatar?.startsWith('http');

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [recipientId]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    inputRef.current?.focus();
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: DmMessage[] }[] = [];
    let lastDate = '';
    for (const msg of messages) {
      const d = new Date(msg.createdAt);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      let dateStr: string;
      if (d.toDateString() === now.toDateString()) dateStr = 'Bugün';
      else if (d.toDateString() === yesterday.toDateString()) dateStr = 'Dün';
      else dateStr = `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'long' })} ${d.getFullYear()}`;

      if (dateStr !== lastDate) {
        groups.push({ date: dateStr, msgs: [] });
        lastDate = dateStr;
      }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--theme-border)]/10 shrink-0">
        <button onClick={onBack} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="shrink-0 w-8 h-8 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
          {hasAvatar
            ? <img src={recipientAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-60">{(recipientName[0] || '?').toUpperCase()}</span>}
        </div>
        <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{recipientName}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare size={28} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-40">Henüz mesaj yok</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] opacity-25 mt-1">Bir mesaj göndererek başla</p>
          </div>
        ) : (
          groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
                <span className="text-[8px] font-semibold text-[var(--theme-secondary-text)]/30 uppercase tracking-wider">{group.date}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/8" />
              </div>
              {group.msgs.map(msg => (
                <MessageBubble key={msg.id} msg={msg} isOwn={msg.senderId === currentUserId} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2.5 border-t border-[var(--theme-border)]/10">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Mesaj yaz..."
            maxLength={2000}
            className="flex-1 bg-transparent text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/25 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-all disabled:opacity-20 disabled:cursor-default"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main DM Panel ────────────────────────────────────────────────────────

export default function DMPanel() {
  const { currentUser, allUsers } = useUser();
  const dm = useDM(currentUser.id || undefined);

  // Load conversations when panel opens
  useEffect(() => {
    if (dm.panelOpen) dm.loadInitial();
  }, [dm.panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request unread count on mount
  useEffect(() => {
    if (currentUser.id) {
      // Small delay to wait for WS auth
      const timer = setTimeout(() => dm.loadInitial(), 1500);
      return () => clearTimeout(timer);
    }
  }, [currentUser.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* DM Icon — sağ alt */}
      <button
        onClick={() => dm.setPanelOpen(!dm.panelOpen)}
        className={`fixed bottom-5 right-5 z-[100] w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-lg ${
          dm.panelOpen
            ? 'bg-[var(--theme-accent)] text-white shadow-[var(--theme-accent)]/30'
            : 'bg-[var(--theme-surface)] text-[var(--theme-secondary-text)] hover:text-[var(--theme-accent)] hover:shadow-xl'
        }`}
        style={{
          border: dm.panelOpen ? 'none' : '1px solid rgba(var(--glass-tint), 0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {dm.panelOpen ? <X size={18} /> : <MessageSquare size={18} />}
        {!dm.panelOpen && dm.totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
            {dm.totalUnread > 99 ? '99+' : dm.totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {dm.panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-20 right-5 z-[99] w-[340px] h-[480px] rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid rgba(var(--glass-tint), 0.08)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.15)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {dm.activeRecipientId ? (
              <ChatArea
                messages={dm.messages}
                currentUserId={currentUser.id}
                recipientId={dm.activeRecipientId}
                allUsers={allUsers}
                onSend={dm.sendMessage}
                onBack={dm.closeConversation}
              />
            ) : (
              <>
                {/* Conversation list header */}
                <div className="px-4 py-3 border-b border-[var(--theme-border)]/10 shrink-0">
                  <h3 className="text-[13px] font-bold text-[var(--theme-text)]">Mesajlar</h3>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {dm.conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <MessageSquare size={28} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
                      <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-40">Henüz mesajın yok</p>
                      <p className="text-[10px] text-[var(--theme-secondary-text)] opacity-25 mt-1">Bir arkadaşına mesaj göndererek başla</p>
                    </div>
                  ) : (
                    <div className="p-1.5">
                      {dm.conversations.map(convo => (
                        <ConversationItem
                          key={convo.conversationKey}
                          convo={convo}
                          allUsers={allUsers}
                          currentUserId={currentUser.id}
                          onClick={() => dm.openConversation(convo.recipientId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
