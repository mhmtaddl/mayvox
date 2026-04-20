import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ArrowLeft, Send, Trash2, ChevronDown, Smile, Settings2, Check, CheckCheck } from 'lucide-react';
import {
  isToastEnabled, setToastEnabled,
  isGroupingEnabled, setGroupingEnabled,
} from '../features/notifications/notificationSound';
import { SoundManager, stopAllSamples, type MessageVariant } from '../lib/audio/SoundManager';
import { motion, AnimatePresence } from 'motion/react';
import { formatFullName } from '../lib/formatName';
import AvatarContent from './AvatarContent';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useUser } from '../contexts/UserContext';
import { useDM } from '../hooks/useDM';
import type { DmConversation, DmMessage } from '../lib/dmService';
import { useConfirm } from '../contexts/ConfirmContext';
import { isNearBottom, scheduleScroll } from '../lib/dmUxLogic';
import { MV_PRESS } from '../lib/signature';
import { replaceEmojiShortcuts } from '../lib/emojiShortcuts';
import { playMessageSend } from '../lib/audio/SoundManager';
import MessageText from './chat/MessageText';
// SoundManager re-exported above ile birlikte; ayrı import gerekmiyor.

// ── Lightweight emoji picker ─────────────────────────────────────────────
// Dependency yok; manuel curated set. 8 kolon × 5 satır = 40 emoji.
const EMOJI_SET = [
  '😀','😁','😂','🤣','😊','😍','🥰','😘',
  '😎','🤔','🙄','😅','😇','🤗','🤭','😏',
  '😢','😭','😤','😡','🤯','🥳','🎉','🔥',
  '❤️','💔','💯','👍','👎','👏','🙌','🙏',
  '✨','⭐','💫','☕','🎵','🎮','⚡','✅',
];

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-[56px] right-4 z-20 p-2 rounded-xl backdrop-blur-xl mv-depth"
      style={{
        background: 'var(--theme-surface-card, rgba(20,20,28,0.94))',
        border: '1px solid rgba(var(--theme-accent-rgb), 0.12)',
        width: '232px',
      }}
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_SET.map(em => (
          <button
            key={em}
            onClick={() => onPick(em)}
            className="w-6.5 h-6.5 rounded hover:bg-[rgba(var(--glass-tint),0.08)] text-[16px] leading-none flex items-center justify-center transition-colors"
            style={{ width: 26, height: 26 }}
          >
            {em}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Mesaj Ayarları Panel ────────────────────────────────────────────────
// Compact inline dropdown — DMPanel header'ından anchor'lı, modal değil.
// Mesaj sesi seçimi BURADA yönetilir; ana Settings > Sesler'de "Mesaj" YOK.
function MessageSettingsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useState(() => SoundManager.isMessageEnabled());
  const [sendOn, setSendOn] = useState(() => SoundManager.isMessageSendEnabled());
  const [variant, setVariant] = useState<MessageVariant>(() => SoundManager.getMessageVariant());
  const [vol, setVol] = useState<number>(() => SoundManager.getMessageVolume());
  const [toastOn, setToastOn] = useState(() => isToastEnabled());
  const [groupOn, setGroupOn] = useState(() => isGroupingEnabled());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-[7px] min-h-[28px]">
      <span className="text-[11px] text-[var(--theme-text)]/85 tracking-[-0.005em]">{label}</span>
      {children}
    </div>
  );

  const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!on)}
      className="relative w-8 h-[18px] rounded-full transition-colors duration-150"
      style={{ background: on ? 'var(--theme-accent)' : 'rgba(var(--glass-tint),0.18)' }}
    >
      <span
        className="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150"
        style={{ transform: on ? 'translateX(14px)' : 'translateX(0)' }}
      />
    </button>
  );

  // Classic iOS-style radio — accent-rengi bağımsız görünür.
  // Seçili değil: nötr glass-tint outline (tema-adaptif; accent'ten bağımsız).
  // Seçili: accent dolgu + İÇ BEYAZ NOKTA (her accent renginde kontrast) + dış soft glow.
  const RadioDot = ({ active }: { active: boolean }) => (
    <span
      className="relative block w-[15px] h-[15px] rounded-full transition-all duration-150"
      style={{
        background: active ? 'var(--theme-accent)' : 'transparent',
        boxShadow: active
          ? 'inset 0 0 0 1.5px var(--theme-accent), 0 0 0 3px rgba(var(--theme-accent-rgb),0.22), 0 1px 2px rgba(0,0,0,0.12)'
          : 'inset 0 0 0 1.5px rgba(var(--glass-tint),0.55), inset 0 0 0 2.5px rgba(var(--glass-tint),0.04)',
      }}
    >
      {active && (
        <span
          className="absolute rounded-full"
          style={{
            top: 4, left: 4, right: 4, bottom: 4,
            background: 'rgba(255,255,255,0.96)',
            boxShadow: '0 0 2px rgba(0,0,0,0.15)',
          }}
        />
      )}
    </span>
  );

  const variantOptions: ReadonlyArray<MessageVariant> = ['1', '2', '3'];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      onClick={e => e.stopPropagation()}
      className="absolute right-3 top-[48px] z-20 w-[260px] rounded-xl overflow-hidden"
      style={{
        background: 'var(--theme-bg)',
        border: '1px solid var(--theme-border)',
        boxShadow:
          '0 18px 40px -12px rgba(var(--shadow-base),0.55),' +
          ' 0 4px 12px -4px rgba(var(--shadow-base),0.25),' +
          ' inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div className="px-3.5 py-2.5 border-b" style={{ borderColor: 'rgba(var(--glass-tint),0.08)' }}>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/70">
          Mesaj Ayarları
        </span>
      </div>
      <div className="px-3.5 py-1 divide-y divide-[rgba(var(--glass-tint),0.05)]">
        <Row label="Mesaj sesi">
          <Toggle on={soundOn} onChange={v => { setSoundOn(v); SoundManager.setMessageEnabled(v); }} />
        </Row>
        <Row label="Mesaj gönderim sesi">
          <Toggle on={sendOn} onChange={v => {
            setSendOn(v);
            SoundManager.setMessageSendEnabled(v);
            if (v) { stopAllSamples(); SoundManager.preview.messageSend(); }
          }} />
        </Row>
        {/* Ton — tek satır, sağa hizalı radio */}
        <Row label="Ton">
          <div className="flex items-center gap-0.5 -mr-1">
            {variantOptions.map(opt => {
              const active = variant === opt;
              return (
                <button
                  key={opt}
                  onClick={() => {
                    stopAllSamples();
                    setVariant(opt);
                    SoundManager.setMessageVariant(opt);
                    SoundManager.preview.message(opt);
                  }}
                  className="p-1 rounded-full transition-transform active:scale-90"
                  aria-label={`Ses ${opt}`}
                >
                  <RadioDot active={active} />
                </button>
              );
            })}
          </div>
        </Row>
        {/* Mesaj ses seviyesi — kompakt iki satır */}
        <div className="py-[7px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[var(--theme-text)]/85 tracking-[-0.005em]">Mesaj ses seviyesi</span>
            <span className="text-[10px] tabular-nums text-[var(--theme-secondary-text)]/70 w-9 text-right">{Math.round(vol * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vol}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVol(v);
              SoundManager.setMessageVolume(v);
            }}
            className="w-full accent-[var(--theme-accent)]"
          />
        </div>
        <Row label="Masaüstü bildirimi">
          <Toggle on={toastOn} onChange={v => { setToastOn(v); setToastEnabled(v); }} />
        </Row>
        <Row label="Ardışık mesajları grupla">
          <Toggle on={groupOn} onChange={v => { setGroupOn(v); setGroupingEnabled(v); }} />
        </Row>
      </div>
    </motion.div>
  );
}

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
        className={`flex items-center gap-3 w-full pl-2.5 pr-3 py-2.5 rounded-[12px] text-left transition-[background-color,transform] duration-150 active:scale-[0.995] ${
          hasUnread
            ? 'bg-[rgba(var(--theme-accent-rgb),0.035)] hover:bg-[rgba(var(--theme-accent-rgb),0.08)] active:bg-[rgba(var(--theme-accent-rgb),0.11)]'
            : 'hover:bg-[rgba(var(--glass-tint),0.045)] active:bg-[rgba(var(--glass-tint),0.065)]'
        }`}
      >
        {/* Avatar — tek pipeline: custom → status PNG → initial */}
        <div
          className="shrink-0 relative w-10 h-10 rounded-[11px] overflow-hidden flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)',
            boxShadow: hasUnread
              ? 'inset 0 0 0 1.5px rgba(var(--theme-accent-rgb),0.45), 0 2px 6px -1px rgba(0,0,0,0.2)'
              : 'inset 0 0 0 1px rgba(var(--glass-tint),0.10), 0 1px 3px rgba(0,0,0,0.15)',
          }}
        >
          <AvatarContent avatar={avatar} statusText={user?.statusText} firstName={user?.firstName} name={name} letterClassName="text-[14px] font-bold tracking-tight text-[var(--theme-accent)]/85" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-[3px]">
            <span className={`text-[13px] leading-tight truncate tracking-[-0.01em] ${hasUnread ? 'font-semibold text-[var(--theme-text)]' : 'font-medium text-[var(--theme-text)]/80'}`}>{name}</span>
            {timeStr && <span className={`text-[10px] shrink-0 tabular-nums font-medium ${hasUnread ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/50'}`}>{timeStr}</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11.5px] truncate leading-snug ${hasUnread ? 'text-[var(--theme-text)]/70' : 'text-[var(--theme-secondary-text)]/55'}`}>
              {convo.lastMessage || <span className="italic opacity-70">Henüz mesaj yok</span>}
            </span>
            {hasUnread && (
              <span
                className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center bg-[var(--theme-badge-bg)] text-[var(--theme-badge-text)] leading-none"
                style={{ boxShadow: '0 2px 6px -1px rgba(var(--theme-accent-rgb),0.45)' }}
              >
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
        title="Sohbeti sil"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, isGrouped, isLastInGroup }: {
  msg: DmMessage;
  isOwn: boolean;
  /** Önceki mesaj aynı gönderen + ≤5dk → tighter spacing, tail radius korunur */
  isGrouped: boolean;
  /** Group'un son mesajı → timestamp göster */
  isLastInGroup: boolean;
}) {
  const time = new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Spec: same user 4px / different group 12px
  const wrapperSpacing = isGrouped ? 'mt-1' : 'mt-3';
  // Tail corner sadece group sonunda sert
  const radiusCls = isOwn
    ? (isLastInGroup ? 'rounded-[16px] rounded-br-[6px]' : 'rounded-[16px]')
    : (isLastInGroup ? 'rounded-[16px] rounded-bl-[6px]' : 'rounded-[16px]');

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${wrapperSpacing}`}>
      <div
        className={`max-w-[65%] px-3.5 py-2 text-[13px] leading-[1.45] transition-[filter,transform] duration-150 hover:brightness-[1.03] active:scale-[0.995] ${radiusCls}`}
        style={{
          background: isOwn ? 'var(--msg-self-bg)' : 'var(--msg-other-bg)',
          color: isOwn ? 'var(--msg-self-text)' : 'var(--msg-other-text)',
          border: isOwn ? 'var(--msg-self-border)' : 'var(--msg-other-border)',
          boxShadow: 'var(--msg-shadow)',
          backdropFilter: isOwn ? 'var(--msg-self-backdrop)' : 'var(--msg-other-backdrop)',
          WebkitBackdropFilter: isOwn ? 'var(--msg-self-backdrop)' : 'var(--msg-other-backdrop)',
        } as React.CSSProperties}
      >
        <MessageText text={msg.text} isOwn={isOwn} />
        {isLastInGroup && (
          <div
            className={`flex items-center gap-1.5 text-[10px] mt-1 leading-none tabular-nums ${isOwn ? 'justify-end' : ''}`}
            style={{ color: 'currentColor' }}
          >
            <span style={{ opacity: 0.55 }}>{time}</span>
            {isOwn && <MessageTick msg={msg} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Tick (sent / read) ──────────────────────────────────────────
// Tek tik = gönderildi (delivered durumu görsel olarak ayrıştırılmıyor —
// "çift gri" kullanıcılar için karıştırıcıydı). Çift yeşil = okundu.
// Opacity zinciri (0.5 × X) beyaz bubble'da kontrastı çöpe atıyor, bu yüzden
// tick time'dan ayrı sarmalanır ve tam opacity ile renderlanır.
function MessageTick({ msg }: { msg: DmMessage }) {
  if (msg.readAt) {
    return (
      <CheckCheck
        size={15}
        strokeWidth={2.5}
        style={{ color: '#10b981' }}
        aria-label="Okundu"
      />
    );
  }
  return (
    <Check
      size={15}
      strokeWidth={2.5}
      style={{ color: '#4b5563' }}
      aria-label="Gönderildi"
    />
  );
}

// ── Chat Area ───────────────────────────────────────────────────────────

function ChatArea({
  messages, currentUserId, recipientId, allUsers, loadingHistory, typingFrom,
  onSend, onTyping, onBack, onNearBottomChange,
}: {
  messages: DmMessage[];
  currentUserId: string;
  recipientId: string;
  allUsers: any[];
  loadingHistory: boolean;
  typingFrom: string | null;
  onSend: (text: string) => void;
  onTyping: () => void;
  onBack: () => void;
  onNearBottomChange?: (near: boolean) => void;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [nearBottom, setNearBottomState] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMsgLenRef = useRef(0);
  const prevRecipientRef = useRef(recipientId);
  const lastOwnMsgIdRef = useRef<string | null>(null);

  const recipient = allUsers.find((u: any) => u.id === recipientId);
  const recipientName = recipient ? formatFullName(recipient.firstName, recipient.lastName) : 'Kullanıcı';
  const recipientAvatar = recipient?.avatar || '';

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
    setShowJump(false);
    setNearBottomState(true);
    onNearBottomChange?.(true);
  }, [onNearBottomChange]);

  // Thread değişince reset + dipe in
  useEffect(() => {
    prevMsgLenRef.current = 0;
    lastOwnMsgIdRef.current = null;
    setShowJump(false);
    setNearBottomState(true);
    prevRecipientRef.current = recipientId;
  }, [recipientId]);

  // Mouse geri tuşu (X1, button === 3) → sohbet listesine dön
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    // Bazı tarayıcılar mouse back'i popstate olarak da firlatır
    const onPopState = () => onBack();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('popstate', onPopState);
    };
  }, [onBack]);

  // Initial history veya thread ilk render'da dipe in
  useEffect(() => {
    if (loadingHistory) return;
    if (prevMsgLenRef.current === 0 && messages.length > 0) {
      scheduleScroll(() => scrollToBottom(false));
    }
  }, [loadingHistory, messages.length, scrollToBottom]);

  // Yeni mesaj geldi — akıllı davran
  useEffect(() => {
    const prev = prevMsgLenRef.current;
    const curr = messages.length;
    if (curr > prev && prev > 0) {
      const latest = messages[curr - 1];
      const isOwn = latest.senderId === currentUserId;
      // Kendi mesajımsa veya tabandaydık → auto-scroll
      if (isOwn || nearBottom) {
        scheduleScroll(() => scrollToBottom(prev > 0));
        // Kendi mesaj echo geldi → sending state düşür
        if (isOwn && latest.id !== lastOwnMsgIdRef.current) {
          lastOwnMsgIdRef.current = latest.id;
          setSending(false);
        }
      } else {
        // Yukarıdayız, karşıdan geldi → badge göster, scroll'u bozma
        setShowJump(true);
      }
    }
    prevMsgLenRef.current = curr;
  }, [messages, currentUserId, nearBottom, scrollToBottom]);

  useEffect(() => { inputRef.current?.focus(); }, [recipientId]);

  // Safety: sending 4s'den uzun sürerse düşür (echo gelmedi bile)
  useEffect(() => {
    if (!sending) return;
    const t = setTimeout(() => setSending(false), 4000);
    return () => clearTimeout(t);
  }, [sending]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight, 100);
    setNearBottomState(prev => {
      if (prev !== near) onNearBottomChange?.(near);
      return near;
    });
    if (near) setShowJump(false);
  }, [onNearBottomChange]);

  const handleSend = () => {
    if (sending) return; // in-flight guard
    const t = input.trim();
    if (!t) return;
    setSending(true);
    onSend(t);
    setInput('');
    inputRef.current?.focus();
    // Mesaj gönderme sesi — düşük volume (SoundManager içinde scale edilir)
    playMessageSend();
    // Kendi gönderimimiz → dipe in
    scheduleScroll(() => scrollToBottom(true));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ':) → 🙂' gibi text shortcut'lar yazılırken anlık dönüşür (ChatPanel ile aynı davranış)
    const converted = replaceEmojiShortcuts(e.target.value);
    setInput(converted);
    if (converted.length > 0) onTyping();
  };

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

  const typingActive = typingFrom === recipientId;
  const canSend = input.trim().length > 0 && !sending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent)',
        }}
      >
        <button onClick={onBack} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] opacity-60 hover:opacity-100 hover:bg-[rgba(var(--glass-tint),0.06)] transition-all duration-150">
          <ArrowLeft size={16} />
        </button>
        <div
          className="shrink-0 w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.22) 0%, rgba(var(--theme-accent-rgb),0.08) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.10)',
          }}
        >
          <AvatarContent avatar={recipientAvatar} statusText={recipient?.statusText} firstName={recipient?.firstName} name={recipientName} letterClassName="text-[13px] font-bold text-[var(--theme-accent)]/85" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate leading-tight">{recipientName}</span>
          <AnimatePresence>
            {typingActive && (
              <motion.span
                key="typing-hdr"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.15 }}
                className="text-[10px] text-[var(--theme-accent)] opacity-70 leading-tight"
              >
                yazıyor…
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} data-mv-chat-area="dm" className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar relative">
        {loadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-5 h-5 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin mb-3" />
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-30">Yükleniyor…</p>
          </div>
        ) : messages.length === 0 ? (
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
            {group.msgs.map((msg, i, arr) => {
              // Sender-based grouping — aynı gönderen + ≤5dk aralık ise grouped
              const prev = i > 0 ? arr[i - 1] : null;
              const next = i < arr.length - 1 ? arr[i + 1] : null;
              const GROUP_GAP_MS = 5 * 60 * 1000;
              const isGrouped = !!prev
                && prev.senderId === msg.senderId
                && (msg.createdAt - prev.createdAt) < GROUP_GAP_MS;
              const isLastInGroup = !next
                || next.senderId !== msg.senderId
                || (next.createdAt - msg.createdAt) >= GROUP_GAP_MS;
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={msg.senderId === currentUserId}
                  isGrouped={isGrouped}
                  isLastInGroup={isLastInGroup}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Jump-to-bottom affordance */}
      <AnimatePresence>
        {showJump && (
          <motion.button
            key="jump"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            onClick={() => scrollToBottom(true)}
            className="absolute right-4 bottom-[78px] z-10 flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[10px] font-semibold text-[var(--theme-text-on-accent,#000)] transition-transform hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'var(--theme-accent)',
              boxShadow: '0 4px 12px rgba(var(--shadow-base),0.35)',
            }}
          >
            <ChevronDown size={11} />
            Yeni mesaj
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.06)' }}>
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 border transition-colors duration-150 border-[rgba(255,255,255,0.08)] focus-within:border-[rgba(var(--theme-accent-rgb),0.30)]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          } as React.CSSProperties}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  handleSend();
                  // Gönderme sonrası imleç input'ta kalsın
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
              }
            }}
            placeholder="Mesaj yaz..."
            maxLength={2000}
            className="flex-1 bg-transparent text-[13px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none"
          />
          <button
            onClick={() => setEmojiOpen(o => !o)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/55 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-colors"
            title="Emoji"
            aria-label="Emoji seç"
          >
            <Smile size={15} />
          </button>
          <motion.button
            {...(canSend ? MV_PRESS : {})}
            onClick={handleSend}
            disabled={!canSend}
            aria-busy={sending}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/10 transition-colors duration-150 disabled:opacity-15"
          >
            {sending
              ? <div className="w-3.5 h-3.5 border-2 border-[var(--theme-accent)]/30 border-t-[var(--theme-accent)] rounded-full animate-spin" />
              : <Send size={15} />
            }
          </motion.button>
        </div>
        <AnimatePresence>
          {emojiOpen && (
            <EmojiPicker
              onPick={(em) => { setInput(v => v + em); inputRef.current?.focus(); }}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </AnimatePresence>
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
  onActiveConvKeyChange?: (key: string | null) => void;
  onNearBottomChange?: (near: boolean) => void;
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function DMPanel({ isOpen, onClose, openUserId, onOpenHandled, onUnreadChange, onActiveConvKeyChange, onNearBottomChange, toggleRef }: DMPanelProps) {
  const { currentUser, allUsers } = useUser();
  const dm = useDM(currentUser.id || undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const { openConfirm } = useConfirm();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => { onUnreadChange?.(dm.totalUnread); }, [dm.totalUnread]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onActiveConvKeyChange?.(dm.activeConvKey); }, [dm.activeConvKey]); // eslint-disable-line react-hooks/exhaustive-deps
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

  useEscapeKey(onClose, isOpen);

  return (
    <>
    {createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="dm-panel"
            ref={panelRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
          // Surface: `.surface-card` class'ı Messages panel referanslı unified
          // materyali sağlar; Görünüm/Sesler/Performans vs aynı class üzerinden
          // BIREBIR aynı recipe'i kullanıyor. Tema değişince token'lar adapte
          // olur — ocean/emerald/crimson her biri kendi kimliğinde matched.
          className="surface-card fixed bottom-[60px] right-3 z-[110] w-[360px] h-[500px] rounded-2xl overflow-hidden flex flex-col"
        >
          {dm.activeRecipientId ? (
            <ChatArea
              messages={dm.messages}
              currentUserId={currentUser.id}
              recipientId={dm.activeRecipientId}
              allUsers={allUsers}
              loadingHistory={dm.loadingHistory}
              typingFrom={dm.typingFrom}
              onSend={dm.sendMessage}
              onTyping={dm.emitTyping}
              onBack={dm.closeConversation}
              onNearBottomChange={onNearBottomChange}
            />
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3.5 shrink-0 flex items-center justify-between relative" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.10)' }}>
                <span className="text-[14px] font-bold text-[var(--theme-text)]">Mesajlar</span>
                <button
                  onClick={() => setSettingsOpen(o => !o)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.08)] transition-colors"
                  title="Mesaj ayarları"
                >
                  <Settings2 size={14} />
                </button>
                <AnimatePresence>
                  {settingsOpen && <MessageSettingsPanel onClose={() => setSettingsOpen(false)} />}
                </AnimatePresence>
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
                              title: 'Sohbeti sil',
                              description: `${n} ile olan sohbet listenden silinsin mi? Karşı tarafın listesini etkilemez.`,
                              confirmText: 'Sil',
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
      </AnimatePresence>,
      document.body,
    )}

    </>
  );
}
