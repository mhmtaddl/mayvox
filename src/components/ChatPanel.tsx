import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VolumeX } from 'lucide-react';

export interface ChatMessage {
  id: string;
  senderId: string;
  sender: string;
  avatar: string;
  text: string;
  time: number;
}

interface Props {
  chatEnabled: boolean;
  cardsHeight: number;
  messages: ChatMessage[];
  currentUserId: string;
  isAdmin: boolean;
  isModerator: boolean;
  chatMuted: boolean;
  onToggleChatMuted: () => void;
  editingMsgId: string | null;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteMessage: (id: string) => void;
  onClearAll: () => void;
  onSendMessage: () => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isAtBottom: boolean;
  newMsgCount: number;
  onScrollToBottom: () => void;
}

const EMOJI_LIST = ['😀','😂','😍','🥺','😎','🤔','👍','👎','❤️','🔥','🎉','👋','😅','🙄','💪','🤝','😢','😡','🥳','🫡','✅','❌','⭐','💯','🎵','🎮','☕','💤'];

const USER_COLORS = ['#F87171','#FB923C','#FBBF24','#34D399','#22D3EE','#818CF8','#C084FC','#F472B6','#A78BFA','#6EE7B7'];

function getUserColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export default function ChatPanel({
  chatEnabled,
  cardsHeight,
  messages,
  currentUserId,
  isAdmin,
  isModerator,
  chatMuted,
  onToggleChatMuted,
  editingMsgId,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteMessage,
  onClearAll,
  onSendMessage,
  chatInput,
  onChatInputChange,
  chatScrollRef,
  onScroll,
  isAtBottom,
  newMsgCount,
  onScrollToBottom,
}: Props) {
  // Font size — local, sadece bu panel icin
  const [chatFontSize, setChatFontSize] = useState(() => {
    const saved = localStorage.getItem('chatFontSize');
    return saved ? Math.max(0, Math.min(5, parseInt(saved))) : 0;
  });

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const changeFontSize = useCallback((delta: number) => {
    setChatFontSize(prev => {
      const v = Math.max(0, Math.min(5, prev + delta));
      localStorage.setItem('chatFontSize', String(v));
      return v;
    });
  }, []);

  // Quiet mode — chat kapali
  if (!chatEnabled) {
    return (
      <div className="absolute left-3 right-3 bottom-4 flex flex-col items-center justify-end pointer-events-none" style={{ top: cardsHeight || '50%' }}>
        <VolumeX size={22} className="text-[var(--theme-secondary-text)] opacity-10 mb-2" />
        <p className="text-[11px] font-medium text-[var(--theme-secondary-text)] opacity-25">Bu oda modunda mesajlasma kapali</p>
      </div>
    );
  }

  const isChatDisabled = chatMuted && !isAdmin && !isModerator;
  const fs = chatFontSize;

  return (
    <div className="absolute left-3 right-3 bottom-0 flex flex-col rounded-2xl overflow-hidden" style={{ top: cardsHeight || '50%', border: '1px solid rgba(var(--glass-tint), 0.05)', borderBottom: 'none', boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.03)' }}>
      {/* Yazi boyutu ayari */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
        <button onClick={() => changeFontSize(-1)} disabled={fs === 0} className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-[var(--theme-accent)] opacity-40 hover:opacity-70 disabled:opacity-10 transition-opacity" title="Küçült">A-</button>
        <button onClick={() => changeFontSize(1)} disabled={fs === 5} className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-[var(--theme-accent)] opacity-40 hover:opacity-70 disabled:opacity-10 transition-opacity" title="Büyüt">A+</button>
      </div>

      {/* Mesaj listesi */}
      <div ref={chatScrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col relative" style={{ background: 'rgba(0,0,0,0.10)' }}>
        <div className="flex-1" />
        {messages.length === 0 ? (
          <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-20 text-center py-4">Sohbet mesajlari burada gorunecek</p>
        ) : messages.map((msg, idx) => {
          const d = new Date(msg.time);
          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
          const ts = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          const dateLabel = isToday ? '' : isYesterday ? 'Dün' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
          const isEd = editingMsgId === msg.id;
          const avatarPx = 22 + fs * 2;
          const isMe = msg.senderId === currentUserId;
          const nameColor = isMe ? 'var(--theme-accent)' : getUserColor(msg.senderId);
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const showDateSep = !prevMsg || new Date(prevMsg.time).toDateString() !== d.toDateString();
          return (
            <React.Fragment key={msg.id}>
              {showDateSep && dateLabel && (
                <div className="flex items-center gap-3 py-2 my-1">
                  <div className="flex-1 h-px" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
                  <span className="text-[9px] font-medium text-[var(--theme-secondary-text)] opacity-30 uppercase tracking-wider">{dateLabel}</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(var(--glass-tint), 0.04)' }} />
                </div>
              )}
              <div className={`flex items-start gap-2 py-1 group/msg ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className="shrink-0 overflow-hidden flex items-center justify-center mt-0.5 avatar-squircle" style={{ width: avatarPx, height: avatarPx, background: `${nameColor}15` }}>
                  {msg.avatar?.startsWith('http') ? (
                    <img src={msg.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="font-bold" style={{ fontSize: 7 + fs, color: nameColor }}>{msg.avatar || msg.sender?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}</span>
                  )}
                </div>
                {/* Mesaj balonu */}
                <div className={`flex flex-col max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold truncate max-w-[100px]" style={{ fontSize: 10 + fs, color: nameColor }}>{msg.sender}</span>
                    <span className="text-[var(--theme-secondary-text)] opacity-25 tabular-nums" style={{ fontSize: 8 + fs }}>{ts}</span>
                  </div>
                  {isEd ? (
                    <input autoFocus type="text" value={editingText} onChange={(e) => onEditingTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }} onBlur={onSaveEdit} className="w-full bg-[rgba(var(--glass-tint),0.04)] border border-[var(--theme-accent)]/20 rounded-lg px-3 py-1.5 text-[12px] text-[var(--theme-text)] outline-none" />
                  ) : (
                    <div className={`rounded-xl px-3 py-1.5 break-words whitespace-pre-wrap ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`} style={{ fontSize: 13 + fs, color: 'var(--theme-text)', background: isMe ? 'rgba(var(--theme-accent-rgb), 0.1)' : 'rgba(var(--glass-tint), 0.04)', border: `1px solid ${isMe ? 'rgba(var(--theme-accent-rgb), 0.08)' : 'rgba(var(--glass-tint), 0.03)'}` }}>
                      {msg.text}
                    </div>
                  )}
                </div>
                {/* Edit/Delete */}
                {!isEd && (
                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity mt-1">
                    <button onClick={() => onStartEdit(msg)} className="p-1 rounded hover:bg-[var(--theme-accent)]/10 transition-colors" title="Düzenle">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--theme-accent-rgb), 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={() => onDeleteMessage(msg.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors" title="Sil">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Yeni mesajlar butonu */}
      {newMsgCount > 0 && !isAtBottom && (
        <button onClick={onScrollToBottom} className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-[10px] font-bold transition-all" style={{ background: 'var(--theme-accent)', color: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          ↓ {newMsgCount} yeni mesaj
        </button>
      )}

      {/* Input */}
      <div className="shrink-0 flex items-end gap-1.5 px-3 py-2 relative" style={{ background: 'rgba(var(--glass-tint), 0.04)', borderTop: '1px solid rgba(var(--glass-tint), 0.05)' }}>
        {/* Emoji */}
        <div ref={emojiRef} className="relative shrink-0">
          <button onClick={() => setShowEmojiPicker(p => !p)} className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] opacity-40 hover:opacity-70 hover:bg-[rgba(var(--glass-tint),0.04)] transition-all" title="Emoji">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-1 z-50 p-2 grid grid-cols-8 gap-1 w-[280px] popup-surface">
              {EMOJI_LIST.map(e => (
                <button key={e} onClick={() => { onChatInputChange(chatInput + e); setShowEmojiPicker(false); }} className="w-8 h-8 flex items-center justify-center rounded hover:bg-[rgba(var(--glass-tint),0.06)] text-[16px] transition-colors">{e}</button>
              ))}
            </div>
          )}
        </div>
        {/* Textarea */}
        <textarea
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendMessage(); } }}
          placeholder={isChatDisabled ? 'Sohbet engellendi' : 'Mesaj yaz...'}
          disabled={isChatDisabled}
          rows={1}
          className="flex-1 bg-[rgba(var(--glass-tint),0.03)] border border-[rgba(var(--glass-tint),0.06)] rounded-lg px-4 py-2 text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none focus:border-[var(--theme-accent)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed resize-none max-h-24 overflow-y-auto"
          style={{ minHeight: 36 }}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 96) + 'px'; }}
        />
        {/* Gonder */}
        <button onClick={onSendMessage} disabled={isChatDisabled || !chatInput.trim()} className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${chatInput.trim() ? 'bg-[var(--theme-accent)]/20 text-[var(--theme-accent)]' : 'bg-[rgba(var(--glass-tint),0.03)] text-[var(--theme-secondary-text)] opacity-30'} disabled:cursor-not-allowed`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        {/* Admin/Mod butonlari */}
        {(isAdmin || isModerator) && (
          <>
            <button onClick={onClearAll} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Tüm mesajları sil">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
            <button onClick={onToggleChatMuted} className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${chatMuted ? 'text-orange-400 bg-orange-500/15' : 'text-[var(--theme-secondary-text)]/30 hover:text-orange-400 hover:bg-orange-500/10'}`} title={chatMuted ? 'Sohbeti aç' : 'Sohbeti engelle'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{chatMuted ? <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m4.93 4.93 14.14 14.14"/></> : <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12h6"/></>}</svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
