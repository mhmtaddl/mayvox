import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, ArrowLeft, Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import { useUser } from '../contexts/UserContext';
import { useDM } from '../hooks/useDM';
import type { DmConversation, DmMessage } from '../lib/dmService';
import { useConfirm } from '../contexts/ConfirmContext';

// ── Conversation Item ───────────────────────────────────────────────────

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
  const name = user ? formatFullName(user.firstName, user.lastName) : convo.recipientName || 'Kullanıcı';
  const avatar = user?.avatar || convo.recipientAvatar || '';
  const hasAvatar = avatar?.startsWith('http');
  const initial = (name?.[0] || '?').toUpperCase();
  const hasUnread = convo.unreadCount > 0;

  const timeStr = convo.lastMessageAt ? (() => {
    const d = new Date(convo.lastMessageAt);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Dün';
    return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })}`;
  })() : '';

  return (
    <div className="relative group/conv">
      <button
        onClick={onClick}
        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-left transition-colors duration-150 ${
          hasUnread ? 'hover:bg-[rgba(var(--theme-accent-rgb),0.06)]' : 'hover:bg-[rgba(var(--glass-tint),0.035)]'
        }`}
      >
        {/* Avatar */}
        <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)' }}>
          {hasAvatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[12px] font-bold text-[var(--theme-accent)] opacity-50">{initial}</span>}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-[13px] truncate ${hasUnread ? 'font-semibold text-[var(--theme-text)]' : 'font-medium text-[var(--theme-text)] opacity-75'}`}>{name}</span>
            {timeStr && <span className={`text-[10px] shrink-0 tabular-nums ${hasUnread ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)] opacity-40'}`}>{timeStr}</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] truncate leading-snug ${hasUnread ? 'text-[var(--theme-text)] opacity-60' : 'text-[var(--theme-secondary-text)] opacity-40'}`}>
              {convo.lastMessage || 'Henüz mesaj yok'}
            </span>
            {hasUnread && (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-[var(--theme-badge-bg)] text-[var(--theme-badge-text)]">
                {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Delete — sağ alt, hover'da görünür */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute bottom-2.5 right-3 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover/conv:opacity-40 hover:!opacity-100 hover:bg-red-500/10 text-[var(--theme-secondary-text)] hover:text-red-400 transition-all duration-150"
        title="Sohbeti kaldır"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: DmMessage; isOwn: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const ownRef = useRef<HTMLDivElement>(null);
  const [textDark, setTextDark] = useState(false);
  useEffect(() => {
    if (!isOwn || !ownRef.current) return;
    const bg = getComputedStyle(ownRef.current).backgroundColor;
    const m = bg.match(/(\d+)/g);
    if (m && m.length >= 3) {
      const [r, g, b] = m.map(Number);
      setTextDark((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55);
    }
  }, [isOwn]);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-[3px]`}>
      <div
        ref={isOwn ? ownRef : undefined}
        className={`max-w-[80%] px-3.5 py-2 text-[13px] leading-[1.45] ${
          isOwn
            ? 'bg-[var(--theme-accent)] rounded-[18px] rounded-br-[6px]'
            : 'rounded-[18px] rounded-bl-[6px]'
        }`}
        style={isOwn
          ? { color: textDark ? '#111' : '#fff' }
          : { background: 'rgba(var(--glass-tint), 0.06)', color: 'var(--theme-text)' }
        }
      >
        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
        <span
          className={`block text-[9px] mt-1 leading-none tabular-nums ${isOwn ? 'text-right' : ''}`}
          style={{ opacity: isOwn ? 0.45 : 0.3, color: isOwn ? (textDark ? '#333' : '#fff') : 'var(--theme-secondary-text)' }}
        >
          {time}
        </span>
      </div>
    </div>
  );
}

// ── Chat Area ───────────────────────────────────────────────────────────

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

  useEffect(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [messages.length]);
  useEffect(() => { inputRef.current?.focus(); }, [recipientId]);

  const handleSend = () => { const t = input.trim(); if (!t) return; onSend(t); setInput(''); inputRef.current?.focus(); };

  const grouped = useMemo(() => {
    const g: { date: string; msgs: DmMessage[] }[] = [];
    let last = '';
    for (const msg of messages) {
      const d = new Date(msg.createdAt); const now = new Date();
      const y = new Date(now); y.setDate(now.getDate() - 1);
      const ds = d.toDateString() === now.toDateString() ? 'Bugün'
        : d.toDateString() === y.toDateString() ? 'Dün'
        : `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'long' })} ${d.getFullYear()}`;
      if (ds !== last) { g.push({ date: ds, msgs: [] }); last = ds; }
      g[g.length - 1].msgs.push(msg);
    }
    return g;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.06)' }}>
        <button onClick={onBack} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] opacity-60 hover:opacity-100 hover:bg-[rgba(var(--glass-tint),0.06)] transition-all duration-150">
          <ArrowLeft size={16} />
        </button>
        <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)' }}>
          {hasAvatar
            ? <img src={recipientAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-50">{(recipientName[0] || '?').toUpperCase()}</span>}
        </div>
        <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{recipientName}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={24} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
            <p className="text-[12px] text-[var(--theme-secondary-text)] opacity-40">Henüz mesaj yok</p>
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-20 mt-1">Bir mesaj göndererek başla</p>
          </div>
        ) : grouped.map(group => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--theme-border)] opacity-30" />
              <span className="text-[9px] font-medium text-[var(--theme-secondary-text)] opacity-30 uppercase tracking-wider">{group.date}</span>
              <div className="flex-1 h-px bg-[var(--theme-border)] opacity-30" />
            </div>
            {group.msgs.map(msg => <div key={msg.id}><MessageBubble msg={msg} isOwn={msg.senderId === currentUserId} /></div>)}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.06)' }}>
        <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Mesaj yaz..."
            maxLength={2000}
            className="flex-1 bg-transparent text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-colors duration-150 disabled:opacity-15"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────

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
  const { openConfirm } = useConfirm();

  useEffect(() => { onUnreadChange?.(dm.totalUnread); }, [dm.totalUnread]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isOpen) dm.resetViewOnClose(); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen) dm.loadInitial(); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openUserId) { dm.openConversation(openUserId); onOpenHandled?.(); } }, [openUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside click
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || toggleRef?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen, onClose, toggleRef]);

  // ESC
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          className="fixed bottom-[60px] right-3 z-[99] w-[360px] h-[500px] rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'var(--theme-surface-card, var(--theme-bg))',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.10)',
            boxShadow: '0 16px 48px rgba(var(--shadow-base),0.45), 0 4px 12px rgba(var(--shadow-base),0.2)',
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
              {/* Header */}
              <div className="px-4 py-3.5 shrink-0" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.06)' }}>
                <span className="text-[14px] font-bold text-[var(--theme-text)]">Mesajlar</span>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {dm.conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8">
                    <MessageSquare size={24} className="text-[var(--theme-secondary-text)] opacity-15 mb-3" />
                    <p className="text-[12px] text-[var(--theme-secondary-text)] opacity-40">Henüz mesajın yok</p>
                    <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-20 mt-1">Bir arkadaşına mesaj göndererek başla</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {dm.conversations.map(convo => {
                      const u = allUsers.find((x: any) => x.id === convo.recipientId);
                      const n = u ? formatFullName(u.firstName, u.lastName) : convo.recipientName || 'Kullanıcı';
                      return (
                        <div key={convo.conversationKey}>
                          <ConversationItem
                            convo={convo}
                            allUsers={allUsers}
                            currentUserId={currentUser.id}
                            onClick={() => dm.openConversation(convo.recipientId)}
                            onDelete={() => openConfirm({
                              title: 'Sohbeti kaldır',
                              description: `${n} ile olan sohbet listenden kaldırılsın mı? Karşı tarafın listesini etkilemez.`,
                              confirmText: 'Kaldır',
                              cancelText: 'İptal',
                              danger: true,
                              onConfirm: () => dm.hideConversation(convo.conversationKey),
                            })}
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

    </>
  );
}
