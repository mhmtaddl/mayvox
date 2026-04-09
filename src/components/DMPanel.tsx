import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, ArrowLeft, Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import { useUser } from '../contexts/UserContext';
import { useDM } from '../hooks/useDM';
import type { DmConversation, DmMessage } from '../lib/dmService';
import MiniConfirm from './MiniConfirm';

// ── Conversation List Item ──────────────────────────────────────────────

function ConversationItem({
  convo, allUsers, currentUserId, onClick, onDelete,
}: {
  convo: DmConversation;
  allUsers: any[];
  currentUserId: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  const user = allUsers.find((u: any) => u.id === convo.recipientId);
  const name = user
    ? formatFullName(user.firstName, user.lastName)
    : convo.recipientName || 'Kullanıcı';
  const avatar = user?.avatar || convo.recipientAvatar || '';
  const hasAvatar = avatar?.startsWith('http');
  const initial = (name?.[0] || '?').toUpperCase();
  const hasUnread = convo.unreadCount > 0;

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
    <div className={`relative rounded-xl transition-all group/conv ${
      hasUnread
        ? 'bg-[rgba(var(--theme-accent-rgb),0.04)] hover:bg-[rgba(var(--theme-accent-rgb),0.07)]'
        : 'hover:bg-[rgba(var(--glass-tint),0.04)]'
    }`}>
      <button onClick={onClick} className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left">
        {/* Avatar */}
        <div className="shrink-0 w-9 h-9 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
          {hasAvatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[11px] font-bold text-[var(--theme-accent)] opacity-60">{initial}</span>}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[12px] font-semibold truncate ${hasUnread ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text)] opacity-80'}`}>{name}</span>
            {timeStr && (
              <span className={`text-[9px] shrink-0 ${hasUnread ? 'text-[var(--theme-accent)] font-semibold' : 'text-[var(--theme-secondary-text)]/35'}`}>
                {timeStr}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className={`text-[10px] truncate ${hasUnread ? 'text-[var(--theme-text)]/60 font-medium' : 'text-[var(--theme-secondary-text)]/40'}`}>
              {convo.lastMessage || 'Henüz mesaj yok'}
            </span>
            {hasUnread && (
              <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-[var(--theme-accent)] text-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]">
                {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Delete — hover'da görünür */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover/conv:opacity-60 hover:!opacity-100 hover:bg-red-500/10 text-[var(--theme-secondary-text)] hover:text-red-400 transition-all"
        title="Sohbeti kaldır"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: DmMessage; isOwn: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Outgoing bubble: accent renk üzerinde otomatik kontrast
  const ownBubbleRef = useRef<HTMLDivElement>(null);
  const [ownTextDark, setOwnTextDark] = useState(false);
  useEffect(() => {
    if (!isOwn || !ownBubbleRef.current) return;
    const bg = getComputedStyle(ownBubbleRef.current).backgroundColor;
    const m = bg.match(/(\d+)/g);
    if (m && m.length >= 3) {
      const [r, g, b] = m.map(Number);
      // Relative luminance (sRGB simplified)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      setOwnTextDark(lum > 0.55);
    }
  }, [isOwn]);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        ref={isOwn ? ownBubbleRef : undefined}
        className={`max-w-[78%] px-3 py-[7px] text-[12px] leading-relaxed ${
          isOwn
            ? 'bg-[var(--theme-accent)] rounded-[16px] rounded-br-[4px]'
            : 'bg-[rgba(var(--glass-tint),0.07)] text-[var(--theme-text)] rounded-[16px] rounded-bl-[4px]'
        }`}
        style={isOwn ? { color: ownTextDark ? '#111' : '#fff' } : undefined}
      >
        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        <span
          className={`block text-[8px] mt-0.5 leading-none ${isOwn ? 'text-right' : 'text-[var(--theme-secondary-text)]/25'}`}
          style={isOwn ? { opacity: 0.5 } : undefined}
        >
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => { inputRef.current?.focus(); }, [recipientId]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    inputRef.current?.focus();
  };

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
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.05)' }}
      >
        <button
          onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
        >
          <ArrowLeft size={15} />
        </button>
        <div
          className="shrink-0 w-8 h-8 overflow-hidden avatar-squircle flex items-center justify-center"
          style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}
        >
          {hasAvatar
            ? <img src={recipientAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-60">{(recipientName[0] || '?').toUpperCase()}</span>}
        </div>
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate block">{recipientName}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
              <MessageSquare size={20} className="text-[var(--theme-accent)] opacity-40" />
            </div>
            <p className="text-[11px] font-medium text-[var(--theme-secondary-text)] opacity-50">Henüz mesaj yok</p>
            <p className="text-[10px] text-[var(--theme-secondary-text)] opacity-25 mt-1">Bir mesaj göndererek başla</p>
          </div>
        ) : (
          groupedMessages.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-[var(--theme-border)]/6" />
                <span className="text-[8px] font-semibold text-[var(--theme-secondary-text)]/25 uppercase tracking-wider">{group.date}</span>
                <div className="flex-1 h-px bg-[var(--theme-border)]/6" />
              </div>
              {group.msgs.map(msg => (
                <div key={msg.id}>
                  <MessageBubble msg={msg} isOwn={msg.senderId === currentUserId} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2.5" style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.05)' }}>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors"
          style={{
            background: 'rgba(var(--glass-tint), 0.04)',
            border: '1px solid rgba(var(--glass-tint), 0.06)',
          }}
        >
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
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-all disabled:opacity-15 disabled:cursor-default"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main DM Panel ────────────────────────────────────────────────────────

interface DMPanelProps {
  isOpen: boolean;
  onClose: () => void;
  openUserId?: string | null;
  onOpenHandled?: () => void;
  onUnreadChange?: (count: number) => void;
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function DMPanel({ isOpen, onClose, openUserId, onOpenHandled, onUnreadChange, toggleRef }: DMPanelProps) {
  const { currentUser, allUsers } = useUser();
  const dm = useDM(currentUser.id || undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; convKey: string; name: string }>({ isOpen: false, convKey: '', name: '' });

  useEffect(() => { onUnreadChange?.(dm.totalUnread); }, [dm.totalUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panel kapanınca aktif sohbet görünümünü resetle → tekrar açılınca liste gelsin
  useEffect(() => {
    if (!isOpen) dm.resetViewOnClose();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) dm.loadInitial();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (openUserId) {
      dm.openConversation(openUserId);
      onOpenHandled?.();
    }
  }, [openUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (toggleRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, toggleRef]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-16 right-3 z-[99] w-[340px] h-[480px] rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'var(--theme-surface-card, var(--theme-bg))',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.12)',
            boxShadow: '0 24px 64px rgba(var(--shadow-base),0.5), 0 8px 20px rgba(var(--shadow-base),0.25)',
            isolation: 'isolate',
          }}
        >
          {/* Top accent line */}
          <div className="h-px shrink-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.25), transparent)' }} />

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
              <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.05)' }}>
                <h3 className="text-[13px] font-bold text-[var(--theme-text)]">Mesajlar</h3>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {dm.conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
                      <MessageSquare size={20} className="text-[var(--theme-accent)] opacity-40" />
                    </div>
                    <p className="text-[11px] font-medium text-[var(--theme-secondary-text)] opacity-50">Henüz mesajın yok</p>
                    <p className="text-[10px] text-[var(--theme-secondary-text)] opacity-25 mt-1">Bir arkadaşına mesaj göndererek başla</p>
                  </div>
                ) : (
                  <div className="p-1.5 space-y-0.5">
                    {dm.conversations.map(convo => {
                      const usr = allUsers.find((u: any) => u.id === convo.recipientId);
                      const nm = usr ? formatFullName(usr.firstName, usr.lastName) : convo.recipientName || 'Kullanıcı';
                      return (
                        <div key={convo.conversationKey}>
                          <ConversationItem
                            convo={convo}
                            allUsers={allUsers}
                            currentUserId={currentUser.id}
                            onClick={() => dm.openConversation(convo.recipientId)}
                            onDelete={() => setDeleteConfirm({ isOpen: true, convKey: convo.conversationKey, name: nm })}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>

    <MiniConfirm
      isOpen={deleteConfirm.isOpen}
      title="Sohbeti kaldır"
      description={`${deleteConfirm.name} ile olan sohbet listenden kaldırılsın mı? Karşı tarafın listesini etkilemez.`}
      confirmText="Kaldır"
      onConfirm={() => {
        dm.hideConversation(deleteConfirm.convKey);
        setDeleteConfirm({ isOpen: false, convKey: '', name: '' });
      }}
      onCancel={() => setDeleteConfirm({ isOpen: false, convKey: '', name: '' })}
      danger
    />
    </>
  );
}
