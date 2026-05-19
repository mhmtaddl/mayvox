import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Pin, Megaphone, Edit2, Trash2, X, AlertTriangle, AlertCircle,
  Calendar, Clock, Users, UserCheck, Check, Compass,
  Sparkles, PlusCircle, ShieldCheck, Volume2, Radio, Twitch, Youtube,
  Clapperboard, Tv, Gamepad2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Announcement, AnnouncementPriority, AnnouncementType, VoiceChannel } from '../types';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../lib/backendClient';
import { subscribeRealtimeEvents } from '../lib/chatService';
import { getPublicDisplayName } from '../lib/formatName';
import { channelIconComponents, roomModeIcons } from '../features/chatview/constants';
import { getDefaultChannelIconName } from '../lib/channelIcon';
import { getDefaultChannelIconColor } from '../lib/channelIconColor';
import { useJoinRequests } from '../hooks/useJoinRequests';
import {
  createServerStreamLink,
  getTwitchStreamIntegration,
  getYoutubeStreamIntegration,
  getServerRecommendations,
  listServerStreamLinks,
  listRoomActivityEvents,
  type JoinRequestListItem,
  type RecommendationItem,
  type RoomActivityEvent,
  type ServerMember,
  type ServerStreamLink,
  type StreamPlatform,
} from '../lib/serverService';
import { getRecommendationAuthorDisplayName, recommendationCoverUrlFromItem } from './recommendations/recommendationTypes';

const RecommendationsTab = React.lazy(() => import('./recommendations/RecommendationsTab'));

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `Bugün ${hm}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Dün ${hm}`;

  return `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'short' })} ${hm}`;
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayName = d.toLocaleDateString('tr-TR', { weekday: 'long' });
  const dayMonth = `${d.getDate()} ${d.toLocaleString('tr-TR', { month: 'long' })}`;
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  if (isToday) return `Bugün · ${hm}`;
  if (isTomorrow) return `Yarın · ${hm}`;
  return `${dayMonth} ${dayName} · ${hm}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCompactDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function timeValue(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

const MIN_ROOM_SESSION_MS = 10 * 60_000;
const ACTIVITY_PAGE_SIZE = 4;

type ActivityTimelineItem = {
  key: string;
  tab?: Tab;
  label: string;
  title: string;
  time: string;
  timeLabel?: string;
  tone: string;
  icon: React.ElementType;
  iconColor?: string;
  wrapTitle?: boolean;
};

function YoutubeBrandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path
        fill="#ff0033"
        d="M21.58 7.19a2.77 2.77 0 0 0-1.95-1.96C17.9 4.77 12 4.77 12 4.77s-5.9 0-7.63.46a2.77 2.77 0 0 0-1.95 1.96A28.93 28.93 0 0 0 1.96 12c0 1.64.15 3.28.46 4.81a2.77 2.77 0 0 0 1.95 1.96c1.73.46 7.63.46 7.63.46s5.9 0 7.63-.46a2.77 2.77 0 0 0 1.95-1.96c.31-1.53.46-3.17.46-4.81 0-1.64-.15-3.28-.46-4.81Z"
      />
      <path fill="#fff" d="m10.03 15.31 5.16-3.31-5.16-3.31v6.62Z" />
    </svg>
  );
}

function formatSessionDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} sa ${minutes} dk`;
  if (hours > 0) return `${hours} sa`;
  return `${totalMinutes} dk`;
}

function formatLiveStartedAt(iso?: string | null): string {
  if (!iso) return '';
  const started = new Date(iso);
  if (!Number.isFinite(started.getTime())) return '';
  return started.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLiveDuration(iso?: string | null): string {
  if (!iso) return '';
  const startedAt = new Date(iso).getTime();
  if (!Number.isFinite(startedAt)) return '';
  const elapsed = Date.now() - startedAt;
  if (elapsed < 0) return '';
  return formatSessionDuration(elapsed);
}

function formatRelativeAgo(iso?: string | null): string {
  const value = timeValue(iso);
  if (!value) return '';
  const totalMinutes = Math.max(1, Math.round((Date.now() - value) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0 && hours > 0) return `${days}g ${hours}s önce`;
  if (days > 0) return `${days}g önce`;
  if (hours > 0 && minutes > 0) return `${hours}s ${minutes}dk önce`;
  if (hours > 0) return `${hours}s önce`;
  return `${minutes}dk önce`;
}

function recommendationCategoryLabel(category: RecommendationItem['category']): string {
  if (category === 'film') return 'Film';
  if (category === 'series') return 'Dizi';
  if (category === 'game') return 'Oyun';
  return 'Keşif';
}

function recommendationCategoryIcon(category: RecommendationItem['category']): React.ElementType {
  if (category === 'film') return Clapperboard;
  if (category === 'series') return Tv;
  if (category === 'game') return Gamepad2;
  return Compass;
}

function avatarInitial(name: string | null | undefined): string {
  return (name || 'U').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'U';
}

function RecommendationPreviewCover({ item }: { item: RecommendationItem }) {
  const coverSrc = recommendationCoverUrlFromItem(item);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [coverSrc, item.id]);

  if (!coverSrc || failed) {
    return <Compass size={14} className="text-[var(--theme-accent)]/75" />;
  }

  return (
    <img
      src={coverSrc}
      alt=""
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => {
        if (import.meta.env.DEV) console.warn('recommendation cover failed', { id: item.id, title: item.title, url: coverSrc });
        setFailed(true);
      }}
    />
  );
}

function RecommendationPreviewItem({ item, onOpen, compact = false }: { key?: unknown; item: RecommendationItem; onOpen: () => void; compact?: boolean }) {
  const authorName = getRecommendationAuthorDisplayName(item);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.04)]"
    >
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[rgba(var(--theme-accent-rgb),0.09)] ${compact ? 'h-8 w-7' : 'h-10 w-8'}`}>
        <RecommendationPreviewCover item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold text-[var(--theme-text)] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{item.title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[9px] font-medium text-[var(--theme-secondary-text)]/48">
          {item.createdByAvatar ? (
            <img src={item.createdByAvatar} alt="" className="h-4 w-4 shrink-0 rounded-[5px] object-cover ring-1 ring-[rgba(var(--glass-tint),0.12)]" />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-[rgba(var(--glass-tint),0.055)] text-[8px] font-semibold text-[var(--theme-text)]/70 ring-1 ring-[rgba(var(--glass-tint),0.10)]">
              {avatarInitial(authorName)}
            </span>
          )}
          <span className="min-w-0 truncate">{authorName}</span>
          <span className="shrink-0 opacity-55">·</span>
          <span className="shrink-0">{recommendationCategoryLabel(item.category)}</span>
          {item.createdAt && (
            <>
              <span className="shrink-0 opacity-55">·</span>
              <span className="shrink-0">{compact ? formatCompactDate(item.createdAt) : formatShortDate(item.createdAt)}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function RulesModal({
  open,
  serverName,
  rules,
  onClose,
}: {
  open: boolean;
  serverName: string;
  rules: string[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[520] flex items-center justify-center px-3 py-4 backdrop-blur-[3px]"
      style={{ background: 'rgba(var(--theme-bg-rgb),0.72)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[rgba(var(--glass-tint),0.09)] shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.035), rgba(var(--glass-tint),0.012)), var(--theme-bg)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.018)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">Sunucu Kuralları</h3>
            <p className="mt-0.5 truncate text-[11px] text-[var(--theme-secondary-text)]/52">{serverName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div
                key={`${index}-${rule}`}
                className="rounded-xl border border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.025)] px-3 py-2.5 text-[12px] leading-5 text-[var(--theme-text)]/88"
              >
                <span className="whitespace-normal break-words">{rule}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const PriorityIcon = ({ priority, size = 14 }: { priority: AnnouncementPriority; size?: number }) => {
  if (priority === 'critical') return <AlertCircle size={size} className="text-red-400" />;
  if (priority === 'important') return <AlertTriangle size={size} className="text-amber-400" />;
  return null;
};

const PRIORITY_BORDER: Record<AnnouncementPriority, string> = {
  normal: 'border-[var(--theme-border)]/30',
  important: 'border-amber-500/25',
  critical: 'border-red-500/25',
};

const RECOMMENDATIONS_ENABLED =
  import.meta.env.VITE_RECOMMENDATIONS_ENABLED !== 'false';

// ── Shared input classes ────────────────────────────────────────────────────

const inputCls = 'w-full h-8 rounded-xl px-3 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 focus:outline-none transition-all border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] focus:border-[rgba(var(--theme-accent-rgb),0.34)] focus:shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.07),inset_0_1px_0_rgba(var(--glass-tint),0.045)]';
const labelCls = 'block text-[10px] font-medium text-[var(--theme-secondary-text)]/72 mb-1';
const modalPanelCls = 'rounded-2xl border border-[rgba(var(--glass-tint),0.065)] bg-[var(--theme-panel)]';

// ── Modal ───────────────────────────────────────────────────────────────────

interface ModalData {
  title: string;
  content: string;
  priority: AnnouncementPriority;
  is_pinned: boolean;
  type: AnnouncementType;
  event_date?: string | null;
  participation_time?: string | null;
  participation_requirements?: string | null;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ModalData) => void;
  initial?: Announcement | null;
  initialType: AnnouncementType;
  loading: boolean;
}

// ── Date / Time picker helpers ─────────────────────────────────────────────
const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function CalendarPicker({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const today = new Date();
  const selected = value ? new Date(value + 'T00:00') : null;
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay() || 7; // 1=Mon
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const pad = Array.from({ length: firstDay - 1 }, (_, i) => i);

  const prev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const next = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  return (
    <div className="p-3 rounded-xl border w-[260px]" style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', boxShadow: 'none', color: 'var(--popover-text)' }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prev} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors text-xs">&lt;</button>
        <span className="text-[12px] font-bold text-[var(--theme-text)]">{MONTHS_TR[viewMonth]} {viewYear}</span>
        <button type="button" onClick={next} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors text-xs">&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {['Pt','Sa','Ça','Pe','Cu','Ct','Pa'].map(d => <span key={d} className="text-[9px] font-bold text-[var(--theme-secondary-text)]/50 py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {pad.map(i => <span key={`p${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSel = value === dateStr;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const isPast = new Date(dateStr) < new Date(today.toISOString().slice(0, 10));
          return (
            <button
              key={day} type="button" disabled={isPast}
              onClick={() => { onChange(dateStr); onClose(); }}
              className={`w-8 h-8 rounded-lg text-[11px] font-semibold transition-all ${
                isSel ? 'bg-[var(--theme-accent)] text-white' :
                isToday ? 'text-[var(--theme-accent)] border border-[var(--theme-accent)]/30' :
                isPast ? 'text-[var(--theme-secondary-text)]/20 cursor-default' :
                'text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)]'
              }`}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}

function TimePicker({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const [h, m] = value ? value.split(':').map(Number) : [20, 0];
  const [hour, setHour] = useState(h);
  const [minute, setMinute] = useState(m);

  const apply = () => { onChange(`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`); onClose(); };

  return (
    <div className="p-4 rounded-xl border w-[200px]" style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', boxShadow: 'none', color: 'var(--popover-text)' }} onClick={e => e.stopPropagation()}>
      <p className="text-[10px] font-bold text-[var(--theme-secondary-text)]/70 uppercase tracking-wider mb-3 text-center">Saat Seç</p>
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex flex-col items-center">
          <button type="button" onClick={() => setHour(p => (p + 1) % 24)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9650;</button>
          <span className="text-2xl font-bold text-[var(--theme-text)] tabular-nums w-10 text-center">{String(hour).padStart(2,'0')}</span>
          <button type="button" onClick={() => setHour(p => (p - 1 + 24) % 24)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9660;</button>
        </div>
        <span className="text-2xl font-bold text-[var(--theme-text)]/40">:</span>
        <div className="flex flex-col items-center">
          <button type="button" onClick={() => setMinute(p => (p + 5) % 60)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9650;</button>
          <span className="text-2xl font-bold text-[var(--theme-text)] tabular-nums w-10 text-center">{String(minute).padStart(2,'0')}</span>
          <button type="button" onClick={() => setMinute(p => (p - 5 + 60) % 60)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9660;</button>
        </div>
      </div>
      <button type="button" onClick={apply} className="w-full py-1.5 rounded-lg btn-primary text-xs font-bold active:scale-[0.97]">Tamam</button>
    </div>
  );
}

const ItemModal = ({ open, onClose, onSubmit, initial, initialType, loading }: ModalProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [type, setType] = useState<AnnouncementType>('announcement');
  const [eventDate, setEventDate] = useState(''); // YYYY-MM-DD
  const [eventTime, setEventTime] = useState(''); // HH:MM
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPartTimePicker, setShowPartTimePicker] = useState(false);
  const calBtnRef = useRef<HTMLButtonElement>(null);
  const timeBtnRef = useRef<HTMLButtonElement>(null);
  const partTimeBtnRef = useRef<HTMLButtonElement>(null);
  const [participationTime, setParticipationTime] = useState('');
  const [participationReqs, setParticipationReqs] = useState('');

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setContent(initial.content);
      setPriority(initial.priority);
      setIsPinned(initial.is_pinned);
      setType(initial.type);
      if (initial.event_date) {
        const d = new Date(initial.event_date);
        setEventDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        setEventTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
      } else { setEventDate(''); setEventTime(''); }
      setParticipationTime(initial.participation_time || '');
      setParticipationReqs(initial.participation_requirements || '');
    } else {
      setTitle('');
      setContent('');
      setPriority('normal');
      setIsPinned(false);
      setType(initialType);
      setEventDate('');
      setEventTime('');
      setParticipationTime('');
      setParticipationReqs('');
    }
    setShowCalendar(false);
    setShowTimePicker(false);
    setShowPartTimePicker(false);
  }, [initial, initialType, open]);

  if (!open) return null;

  const isEvent = type === 'event';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[520] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-[1.5px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-[760px] max-h-[92vh] overflow-y-auto rounded-[24px] border border-[var(--theme-border)]/18 p-3"
        style={{
          background:
            'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.018), rgba(var(--glass-tint),0.006)), var(--theme-bg)',
          color: 'var(--theme-text)',
          boxShadow: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(var(--theme-accent-rgb),0.13)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-2.5 py-1 text-[10px] font-semibold text-[var(--theme-accent)]">
              {isEvent
                ? <Calendar size={12} />
                : <Megaphone size={12} />
              }
              {isEvent ? 'Etkinlik' : 'Duyuru'}
            </div>
            <p className="truncate text-[12px] text-[var(--theme-secondary-text)]/68">
              {initial
                ? (isEvent ? 'Etkinlik bilgilerini güncelle.' : 'Duyuru içeriğini güncelle.')
                : (isEvent ? 'Sunucu için yeni bir etkinlik paylaş.' : 'Sunucu için yeni bir duyuru paylaş.')
              }
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={`${modalPanelCls} p-3 space-y-3`}>
          <div>
            <label className={labelCls}>{isEvent ? 'Etkinlik Adı' : 'Başlık'}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className={inputCls} placeholder={isEvent ? 'Etkinlik adı...' : 'Duyuru başlığı...'} />
          </div>

          <div>
            <label className={labelCls}>{isEvent ? 'Açıklama' : 'İçerik'}</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={3} className={`${inputCls} h-[74px] resize-none py-2 leading-5`} placeholder={isEvent ? 'Etkinlik açıklaması...' : 'Duyuru içeriği...'} />
          </div>

          {/* Event-specific fields */}
          {isEvent && (
            <>
              {/* Tarih — tek satır */}
              <div className="relative">
                <label className={labelCls}>Etkinlik Tarihi</label>
                <div className="relative">
                  <input
                    type="text" readOnly
                    value={eventDate ? new Date(eventDate + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    placeholder="Tarih seç..."
                    onClick={() => { setShowCalendar(p => !p); setShowTimePicker(false); setShowPartTimePicker(false); }}
                    className={`${inputCls} text-xs cursor-pointer pr-8`}
                  />
                  <button ref={calBtnRef} type="button" onClick={() => { setShowCalendar(p => !p); setShowTimePicker(false); setShowPartTimePicker(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-accent)] transition-colors">
                    <Calendar size={14} />
                  </button>
                </div>
                {showCalendar && calBtnRef.current && createPortal(
                  <>
                    <div className="fixed inset-0 z-[530]" onClick={() => setShowCalendar(false)} />
                    <div className="fixed z-[531]" style={{ top: calBtnRef.current.getBoundingClientRect().top - 8, left: calBtnRef.current.getBoundingClientRect().left, transform: 'translateY(-100%)' }}>
                      <CalendarPicker value={eventDate} onChange={setEventDate} onClose={() => setShowCalendar(false)} />
                    </div>
                  </>,
                  document.body,
                )}
              </div>
              {/* Etkinlik Saati + Katılım Saati — yan yana */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className={labelCls}>Etkinlik Saati</label>
                  <div className="relative">
                    <input type="text" readOnly value={eventTime || ''} placeholder="Saat seç..."
                      onClick={() => { setShowTimePicker(p => !p); setShowCalendar(false); setShowPartTimePicker(false); }}
                      className={`${inputCls} text-xs cursor-pointer pr-8`} />
                    <button ref={timeBtnRef} type="button" onClick={() => { setShowTimePicker(p => !p); setShowCalendar(false); setShowPartTimePicker(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-accent)] transition-colors">
                      <Clock size={14} />
                    </button>
                  </div>
                  {showTimePicker && timeBtnRef.current && createPortal(
                    <>
                      <div className="fixed inset-0 z-[530]" onClick={() => setShowTimePicker(false)} />
                      <div className="fixed z-[531]" style={{ top: timeBtnRef.current.getBoundingClientRect().top - 8, left: timeBtnRef.current.getBoundingClientRect().right - 200, transform: 'translateY(-100%)' }}>
                        <TimePicker value={eventTime || '20:00'} onChange={setEventTime} onClose={() => setShowTimePicker(false)} />
                      </div>
                    </>,
                    document.body,
                  )}
                </div>
                <div className="relative">
                  <label className={labelCls}>Katılım Saati</label>
                  <div className="relative">
                    <input type="text" readOnly value={participationTime || ''} placeholder="Saat seç..."
                      onClick={() => { setShowPartTimePicker(p => !p); setShowCalendar(false); setShowTimePicker(false); }}
                      className={`${inputCls} text-xs cursor-pointer pr-8`} />
                    <button ref={partTimeBtnRef} type="button" onClick={() => { setShowPartTimePicker(p => !p); setShowCalendar(false); setShowTimePicker(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-accent)] transition-colors">
                      <Clock size={14} />
                    </button>
                  </div>
                  {showPartTimePicker && partTimeBtnRef.current && createPortal(
                    <>
                      <div className="fixed inset-0 z-[530]" onClick={() => setShowPartTimePicker(false)} />
                      <div className="fixed z-[531]" style={{ top: partTimeBtnRef.current.getBoundingClientRect().top - 8, left: partTimeBtnRef.current.getBoundingClientRect().right - 200, transform: 'translateY(-100%)' }}>
                        <TimePicker value={participationTime || '20:00'} onChange={setParticipationTime} onClose={() => setShowPartTimePicker(false)} />
                      </div>
                    </>,
                    document.body,
                  )}
                </div>
              </div>
              {/* Katılım Şartları — tek satır */}
              <div>
                <label className={labelCls}>Katılım Şartları</label>
                <input type="text" value={participationReqs} onChange={e => setParticipationReqs(e.target.value)} maxLength={200} className={inputCls} placeholder="ör: Mikrofon zorunlu, min. 1 haftalık üye" />
              </div>
            </>
          )}

          {/* Priority */}
          <div>
            <label className={labelCls}>Önem Seviyesi</label>
            <div className="flex gap-2">
              {(['normal', 'important', 'critical'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-medium transition-all ${
                    priority === p
                      ? p === 'normal'
                        ? 'border-[rgba(var(--theme-accent-rgb),0.36)] bg-[rgba(var(--theme-accent-rgb),0.105)] text-[var(--theme-accent)]'
                        : p === 'important'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                          : 'border-red-500/50 bg-red-500/10 text-red-400'
                      : 'border-[rgba(var(--glass-tint),0.065)] bg-[rgba(var(--glass-tint),0.023)] text-[var(--theme-secondary-text)] hover:border-[rgba(var(--theme-accent-rgb),0.22)] hover:bg-[rgba(var(--theme-accent-rgb),0.045)]'
                  }`}
                >
                  {p === 'important' && <AlertTriangle size={11} />}
                  {p === 'critical' && <AlertCircle size={11} />}
                  {p === 'normal' ? 'Normal' : p === 'important' ? 'Önemli' : 'Kritik'}
                </button>
              ))}
            </div>
          </div>

          {/* Pin toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={isPinned}
              onClick={() => setIsPinned(!isPinned)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                isPinned ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isPinned ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </button>
            <span className="text-xs text-[var(--theme-secondary-text)]">Sabitle (öne çıkar)</span>
          </label>
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-[rgba(var(--glass-tint),0.055)] pt-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--glass-tint),0.025)] px-4 py-2 text-[12px] font-medium text-[var(--theme-secondary-text)] transition hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] active:scale-[0.98]">
            İptal
          </button>
          <button
            type="button"
            disabled={!title.trim() || loading || (isEvent && (!eventDate || !eventTime))}
            onClick={() => onSubmit({
              title: title.trim(),
              content: content.trim(),
              priority,
              is_pinned: isPinned,
              type,
              event_date: isEvent && eventDate && eventTime ? new Date(`${eventDate}T${eventTime}`).toISOString() : isEvent && eventDate ? new Date(`${eventDate}T00:00`).toISOString() : null,
              participation_time: isEvent ? participationTime.trim() || null : null,
              participation_requirements: isEvent ? participationReqs.trim() || null : null,
            })}
            className="rounded-xl border border-[rgba(var(--theme-accent-rgb),0.22)] bg-[linear-gradient(135deg,rgba(var(--theme-accent-rgb),0.92),rgba(var(--theme-accent-rgb),0.70))] px-4 py-2 text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(var(--theme-accent-rgb),0.18)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-default disabled:opacity-40"
          >
            {loading ? 'Kaydediliyor...' : initial ? 'Güncelle' : 'Yayınla'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Delete confirm ──────────────────────────────────────────────────────────

const DeleteConfirm = ({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) => {
  if (!open) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-[360px] rounded-2xl border border-[var(--theme-border)]/22 bg-[var(--theme-panel)] p-4 shadow-2xl shadow-black/30"
        style={{ boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-400/20 bg-red-500/12 text-red-200 hover:bg-red-500/18">
              <Trash2 size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-[var(--theme-text)]">Öğeyi sil</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.05)] hover:text-[var(--theme-text)] disabled:opacity-45"
            title="Kapat"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[var(--theme-secondary-text)]/72">Bu öğeyi silmek istediğinize emin misiniz?</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl px-3.5 py-2 text-[12px] text-[var(--theme-secondary-text)] transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-45">İptal</button>
          <button type="button" disabled={loading} onClick={onConfirm} className="rounded-xl border border-red-400/20 bg-red-500/12 px-3.5 py-2 text-[12px] font-semibold text-red-200 transition-colors hover:bg-red-500/18 disabled:opacity-50">
            {loading ? 'Siliniyor...' : 'Sil'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Announcement card ───────────────────────────────────────────────────────

function AnnouncementCard({ item, isPinned, canEdit, onEdit, onDelete }: {
  item: Announcement;
  isPinned?: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) { return (
  <motion.div
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className={`relative rounded-xl border ${PRIORITY_BORDER[item.priority]} ${
      isPinned
        ? 'bg-[rgba(var(--glass-tint),0.052)] p-5 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.06)]'
        : 'bg-[rgba(var(--glass-tint),0.04)] hover:bg-[rgba(var(--glass-tint),0.058)] p-4 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.045)]'
    } group transition-colors`}
  >
    {/* Top-right badges + actions */}
    <div className="absolute top-3 right-3 flex items-center gap-1.5">
      {isPinned && (
        <span className="flex items-center gap-1 text-[9px] font-medium text-[var(--theme-accent)]/70 bg-[var(--theme-accent)]/8 px-2 py-0.5 rounded-full">
          <Pin size={9} />
          Sabit
        </span>
      )}
      <PriorityIcon priority={item.priority} size={isPinned ? 14 : 13} />
      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onEdit} className="p-1 rounded-md hover:bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] transition-colors" title="Düzenle">
            <Edit2 size={11} />
          </button>
          <button type="button" onClick={onDelete} className="p-1 rounded-md hover:bg-red-500/10 text-[var(--theme-secondary-text)]/50 hover:text-red-400 transition-colors" title="Sil">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>

    <div className="flex items-start gap-3">
      <div className={`shrink-0 rounded-lg flex items-center justify-center ${isPinned ? 'w-9 h-9 bg-[var(--theme-accent)]/10' : 'w-7 h-7 bg-[var(--theme-accent)]/8'}`}>
        <Megaphone size={isPinned ? 16 : 13} className="text-[var(--theme-accent)]" />
      </div>
      <div className="flex-1 min-w-0 pr-16">
        <h4 className={`font-semibold text-[var(--theme-text)] leading-snug mb-1 ${isPinned ? 'text-[15px]' : 'text-sm'}`}>{item.title}</h4>
        {item.content && (
          <p className={`text-[var(--theme-secondary-text)] leading-relaxed whitespace-pre-wrap ${isPinned ? 'text-xs mb-3' : 'text-[11px] line-clamp-2 mb-2'}`}>{item.content}</p>
        )}
        <div className="flex items-center gap-2 text-[10px] text-[var(--theme-secondary-text)]/50">
          <span>{item.author_name}</span>
          <span>·</span>
          <span>{formatDate(item.created_at)}</span>
        </div>
      </div>
    </div>
  </motion.div>
); }

// ── Event card ──────────────────────────────────────────────────────────────

function EventCard({ item, isPinned, canEdit, onEdit, onDelete }: {
  item: Announcement;
  isPinned?: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) { return (
  <motion.div
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className={`relative rounded-xl border ${PRIORITY_BORDER[item.priority]} ${
      isPinned
        ? 'bg-[rgba(var(--glass-tint),0.052)] p-5 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.06)]'
        : 'bg-[rgba(var(--glass-tint),0.04)] hover:bg-[rgba(var(--glass-tint),0.058)] p-4 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.045)]'
    } group transition-colors`}
  >
    {/* Top-right badges + actions */}
    <div className="absolute top-3 right-3 flex items-center gap-1.5">
      {isPinned && (
        <span className="flex items-center gap-1 text-[9px] font-medium text-violet-400/70 bg-violet-500/8 px-2 py-0.5 rounded-full">
          <Pin size={9} />
          Sabit
        </span>
      )}
      <PriorityIcon priority={item.priority} size={isPinned ? 14 : 13} />
      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onEdit} className="p-1 rounded-md hover:bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)] transition-colors" title="Düzenle">
            <Edit2 size={11} />
          </button>
          <button type="button" onClick={onDelete} className="p-1 rounded-md hover:bg-red-500/10 text-[var(--theme-secondary-text)]/50 hover:text-red-400 transition-colors" title="Sil">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>

    <div className="flex items-start gap-3">
      <div className={`shrink-0 rounded-lg flex items-center justify-center ${isPinned ? 'w-9 h-9 bg-violet-500/10' : 'w-7 h-7 bg-violet-500/8'}`}>
        <Calendar size={isPinned ? 16 : 13} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0 pr-16">
        <h4 className={`font-semibold text-[var(--theme-text)] leading-snug mb-1 ${isPinned ? 'text-[15px]' : 'text-sm'}`}>{item.title}</h4>

        {/* Event meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {item.event_date && (
            <span className="flex items-center gap-1.5 text-[11px] text-violet-400/90 font-medium">
              <Calendar size={11} />
              {formatEventDate(item.event_date)}
            </span>
          )}
          {item.participation_time && (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--theme-secondary-text)]/70">
              <Clock size={11} />
              {item.participation_time}
            </span>
          )}
        </div>

        {item.content && (
          <p className={`text-[var(--theme-secondary-text)] leading-relaxed whitespace-pre-wrap ${isPinned ? 'text-xs mb-2' : 'text-[11px] line-clamp-2 mb-2'}`}>{item.content}</p>
        )}

        {item.participation_requirements && (
          <div className="flex items-start gap-1.5 mb-2">
            <Users size={11} className="text-[var(--theme-secondary-text)]/50 mt-0.5 shrink-0" />
            <span className="text-[10px] text-[var(--theme-secondary-text)]/60 leading-relaxed">{item.participation_requirements}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-[var(--theme-secondary-text)]/50">
          <span>{item.author_name}</span>
          <span>·</span>
          <span>{formatDate(item.created_at)}</span>
        </div>
      </div>
    </div>
  </motion.div>
); }

function InviteApplicationsFeed({
  items,
  error,
  busyId,
  onAccept,
  onReject,
  onManage,
  showManageButton = true,
}: {
  items: JoinRequestListItem[] | null;
  error: string;
  busyId: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onManage: () => void;
  showManageButton?: boolean;
}) {
  const pendingItems = (items ?? []).filter(it => it.status === 'pending');
  const hasPendingItems = pendingItems.length > 0;

  return (
    <div className={`rounded-[18px] p-3.5 ${
      hasPendingItems
        ? 'border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)]'
        : 'border border-transparent bg-transparent'
    }`}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--theme-accent-rgb),0.14)] bg-[rgba(var(--theme-accent-rgb),0.075)] text-[var(--theme-accent)]">
            <UserCheck size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--theme-text)]">Bekleyen Davetler</span>
            <span className="mt-0.5 block truncate text-[10px] text-[var(--theme-secondary-text)]/50">Sunucuya katılma başvuruları</span>
          </span>
        </div>
        {showManageButton && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[10px] font-semibold text-[var(--theme-accent)] transition-colors sm:self-auto"
            style={{
              background: 'rgba(var(--theme-accent-rgb), 0.085)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.16)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.085)'; }}
          >
            <Users size={12} />
            Davetleri Yönet
          </button>
        )}
      </div>

      {error && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg text-[11px] text-red-400/80"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.10)' }}
        >
          <AlertCircle size={12} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {!items ? (
        <div className="py-5 text-center text-xs text-[var(--theme-secondary-text)]/40">Yükleniyor...</div>
      ) : pendingItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-5 text-center">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.045)] text-[var(--theme-accent)]/70">
            <UserCheck size={16} />
          </span>
          <div className="text-[12px] font-semibold text-[var(--theme-text)]/82">Bekleyen davet veya başvuru yok.</div>
          <div className="mt-1 text-[10px] text-[var(--theme-secondary-text)]/44">Yeni başvuru geldiğinde burada görünecek.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {pendingItems.map(it => {
            const hasAvatar = typeof it.userAvatar === 'string' && it.userAvatar.startsWith('http');
            const busy = busyId !== null;
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: 'rgba(var(--glass-tint), 0.035)',
                  border: '1px solid rgba(var(--glass-tint), 0.07)',
                }}
              >
                <div
                  className="shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center"
                  style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)' }}
                >
                  {hasAvatar
                    ? <img src={it.userAvatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <span className="text-[10px] font-bold text-[var(--theme-accent)]/70">{(it.userName[0] ?? '?').toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{it.userName}</div>
                  <div className="text-[9px] text-[var(--theme-secondary-text)]/55 flex items-center gap-1.5">
                    <Clock size={9} />
                    <span>{formatDate(it.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onReject(it.id)}
                    disabled={busy}
                    title="Reddet"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-300/80 disabled:opacity-35 transition-all duration-[120ms] ease-out hover:scale-[1.05] disabled:hover:scale-100"
                    style={{
                      background: 'rgba(239, 68, 68, 0.09)',
                      border: '1px solid rgba(248, 113, 113, 0.18)',
                      boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)',
                    }}
                    onMouseEnter={(e) => {
                      if (busy) return;
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.14)';
                      e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.26)';
                      e.currentTarget.style.boxShadow = '0 6px 14px rgba(239, 68, 68, 0.12), inset 0 1px 0 rgba(var(--glass-tint), 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.09)';
                      e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.18)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)';
                    }}
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(it.id)}
                    disabled={busy}
                    title="Kabul Et"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-300/85 disabled:opacity-35 transition-all duration-[120ms] ease-out hover:scale-[1.05] disabled:hover:scale-100"
                    style={{
                      background: 'rgba(16, 185, 129, 0.10)',
                      border: '1px solid rgba(52, 211, 153, 0.20)',
                      boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)',
                    }}
                    onMouseEnter={(e) => {
                      if (busy) return;
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.16)';
                      e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.30)';
                      e.currentTarget.style.boxShadow = '0 6px 14px rgba(16, 185, 129, 0.13), inset 0 1px 0 rgba(var(--glass-tint), 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.10)';
                      e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.20)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)';
                    }}
                  >
                    <Check size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  currentUser: User;
  serverId?: string;
  serverName?: string;
  serverDescription?: string;
  serverRules?: string | null;
  channels?: VoiceChannel[];
  serverMembers?: ServerMember[];
  canCreateAnnouncements?: boolean;
  canCreateRecommendations?: boolean;
  canModerateCommunityContent?: boolean;
  canViewRoomActivity?: boolean;
  canViewInviteApplications?: boolean;
  onOpenInviteApplications?: () => void;
  mobileTabletLayout?: boolean;
}

type Tab = 'announcement' | 'event' | 'invites' | 'recommendations' | 'streams';
type ActiveSection = Tab | null;
type ServerHomeRoomSession = {
  key: string;
  channelId: string;
  channelName: string;
  channelMode?: string;
  channelIconName?: string;
  channelIconColor?: string;
  participantCount: number;
  durationMs: number;
  startedAt: string;
  endedAt: string;
};

function roomActivityUserKey(event: RoomActivityEvent): string | null {
  return event.targetUserId || event.actorId || null;
}

function buildRoomSessionSummaries(channel: VoiceChannel, events: RoomActivityEvent[]): ServerHomeRoomSession[] {
  const sortedEvents = [...events]
    .filter(event => event.type === 'join' || event.type === 'leave')
    .sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt));
  const activeUsers = new Set<string>();
  const sessions: ServerHomeRoomSession[] = [];
  let sessionStartedAt: string | null = null;
  let sessionPeak = 0;

  const closeSession = (endedAt: string) => {
    if (!sessionStartedAt) return;
    const durationMs = timeValue(endedAt) - timeValue(sessionStartedAt);
    if (durationMs >= MIN_ROOM_SESSION_MS && sessionPeak >= 2) {
      sessions.push({
        key: `room-session-${channel.id}-${sessionStartedAt}-${endedAt}`,
        channelId: channel.id,
        channelName: channel.name,
        channelMode: channel.mode || 'social',
        channelIconName: channel.iconName ?? getDefaultChannelIconName(channel.mode || 'social'),
        channelIconColor: channel.iconColor ?? getDefaultChannelIconColor(channel.mode || 'social'),
        participantCount: sessionPeak,
        durationMs,
        startedAt: sessionStartedAt,
        endedAt,
      });
    }
    sessionStartedAt = null;
    sessionPeak = activeUsers.size;
  };

  for (const event of sortedEvents) {
    const userKey = roomActivityUserKey(event);
    if (!userKey) continue;

    if (event.type === 'join') {
      activeUsers.add(userKey);
      if (activeUsers.size >= 2 && !sessionStartedAt) {
        sessionStartedAt = event.createdAt;
        sessionPeak = activeUsers.size;
      } else if (sessionStartedAt) {
        sessionPeak = Math.max(sessionPeak, activeUsers.size);
      }
      continue;
    }

    if (event.type === 'leave') {
      const wasInSession = !!sessionStartedAt;
      activeUsers.delete(userKey);
      if (wasInSession && activeUsers.size < 2) {
        closeSession(event.createdAt);
      } else if (sessionStartedAt) {
        sessionPeak = Math.max(sessionPeak, activeUsers.size);
      }
    }
  }

  if (sessionStartedAt && activeUsers.size >= 2) {
    closeSession(new Date().toISOString());
  }

  return sessions;
}

export default function AnnouncementsPanel({
  currentUser,
  serverId,
  serverName,
  serverDescription,
  serverRules,
  channels = [],
  serverMembers = [],
  canCreateAnnouncements = false,
  canCreateRecommendations = false,
  canModerateCommunityContent = false,
  canViewRoomActivity = false,
  canViewInviteApplications = false,
  onOpenInviteApplications,
  mobileTabletLayout = false,
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<AnnouncementType>('announcement');
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveSection>(null);
  const [recommendationPreviewItems, setRecommendationPreviewItems] = useState<RecommendationItem[]>([]);
  const [streamPreviewItems, setStreamPreviewItems] = useState<ServerStreamLink[]>([]);
  const [roomActivitySessionItems, setRoomActivitySessionItems] = useState<ServerHomeRoomSession[]>([]);
  const [dismissedActivityKeys, setDismissedActivityKeys] = useState<Set<string>>(() => new Set());
  const [activityPage, setActivityPage] = useState(0);
  const [recommendationPage, setRecommendationPage] = useState(0);
  const [recommendationCreateSignal, setRecommendationCreateSignal] = useState(0);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [streamAddModalOpen, setStreamAddModalOpen] = useState(false);
  const [streamModalChecking, setStreamModalChecking] = useState(false);
  const [streamModalSaving, setStreamModalSaving] = useState(false);
  const [quickTwitchName, setQuickTwitchName] = useState('');
  const [quickTwitchUrl, setQuickTwitchUrl] = useState('');
  const [quickYoutubeName, setQuickYoutubeName] = useState('');
  const [quickYoutubeUrl, setQuickYoutubeUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [mobileTouchStart, setMobileTouchStart] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const openStreamsSettings = useCallback(() => {
    if (!serverId) return;
    window.dispatchEvent(new CustomEvent('mayvox:open-server-settings', {
      detail: { tab: 'streams' },
    }));
  }, [serverId]);

  const fetchStreamLinks = useCallback(async () => {
    if (!serverId) {
      setStreamPreviewItems([]);
      return;
    }
    const items = await listServerStreamLinks(serverId);
    setStreamPreviewItems(items.filter(item => item.enabled));
  }, [serverId]);

  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const update = () => setPanelWidth(node.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === 'number') setPanelWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const openStreamAdd = useCallback(async () => {
    if (!serverId || streamModalChecking) return;
    try {
      setStreamModalChecking(true);
      const [twitch, youtube] = await Promise.all([
        getTwitchStreamIntegration(serverId),
        getYoutubeStreamIntegration(serverId),
      ]);
      if (twitch.hasClientSecret && youtube.hasApiKey) {
        setStreamAddModalOpen(true);
        return;
      }
      openStreamsSettings();
      showToast('Önce Twitch ve YouTube API bağlantılarını tamamla.');
    } catch {
      openStreamsSettings();
      showToast('Yayın API bağlantılarını kontrol edemedim. Ayarlar sayfasını açtım.');
    } finally {
      setStreamModalChecking(false);
    }
  }, [openStreamsSettings, serverId, showToast, streamModalChecking]);

  const handleQuickAddStream = useCallback(async (platform: StreamPlatform, channelUrl: string, channelName: string) => {
    if (!serverId || streamModalSaving || !channelUrl.trim()) return;
    try {
      setStreamModalSaving(true);
      await createServerStreamLink(serverId, {
        platform,
        channelUrl: channelUrl.trim(),
        channelName: channelName.trim() || undefined,
      });
      if (platform === 'twitch') {
        setQuickTwitchName('');
        setQuickTwitchUrl('');
      } else {
        setQuickYoutubeName('');
        setQuickYoutubeUrl('');
      }
      await fetchStreamLinks();
      showToast('Yayın bağlantısı eklendi.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Yayın bağlantısı eklenemedi.');
    } finally {
      setStreamModalSaving(false);
    }
  }, [fetchStreamLinks, serverId, showToast, streamModalSaving]);

  const canManage = canCreateAnnouncements;
  const canModerateContent = canModerateCommunityContent;
  const showInvitesTab = !!serverId && canViewInviteApplications;
  const showRecommendationsTab = !!serverId && RECOMMENDATIONS_ENABLED;
  const {
    items: joinRequestItems,
    error: joinRequestError,
    busyId: joinRequestBusyId,
    onAccept: acceptJoinRequest,
    onReject: rejectJoinRequest,
  } = useJoinRequests({
    serverId: serverId ?? '',
    includeHistory: false,
    enabled: showInvitesTab,
  });
  const pendingJoinRequests = (joinRequestItems ?? []).filter(it => it.status === 'pending');
  const pendingJoinRequestCount = pendingJoinRequests.length;

  useEffect(() => {
    setActiveTab(null);
  }, [serverId]);

  useEffect(() => {
    if (!mobileTabletLayout || typeof window === 'undefined') return;
    const resetHome = () => setActiveTab(null);
    window.addEventListener('mayvox:mobile-server-home-reset', resetHome);
    return () => window.removeEventListener('mayvox:mobile-server-home-reset', resetHome);
  }, [mobileTabletLayout]);

  useEffect(() => {
    if (!mobileTabletLayout || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('mayvox:mobile-server-home-detail', { detail: { open: !!activeTab } }));
    return () => {
      window.dispatchEvent(new CustomEvent('mayvox:mobile-server-home-detail', { detail: { open: false } }));
    };
  }, [activeTab, mobileTabletLayout]);

  useEffect(() => {
    if (!mobileTabletLayout || !activeTab || typeof window === 'undefined') return;
    const handleTabletHomeBack = (event: Event) => {
      const profileMenuOpen = (window as typeof window & { __mayvoxProfileMenuOpen?: boolean }).__mayvoxProfileMenuOpen;
      const dmPanelOpen = (window as typeof window & { __mayvoxDmPanelOpen?: boolean }).__mayvoxDmPanelOpen;
      if (profileMenuOpen || dmPanelOpen) return;
      event.stopImmediatePropagation();
      (window as typeof window & { __mayvoxServerHomeBackHandledAt?: number }).__mayvoxServerHomeBackHandledAt = Date.now();
      setActiveTab(null);
    };
    window.addEventListener('mayvox:android-back', handleTabletHomeBack, { capture: true });
    return () => window.removeEventListener('mayvox:android-back', handleTabletHomeBack, { capture: true });
  }, [activeTab, mobileTabletLayout]);

  useEffect(() => {
    if (activeTab === 'invites' && !showInvitesTab) setActiveTab(null);
    if (activeTab === 'recommendations' && !showRecommendationsTab) setActiveTab(null);
  }, [activeTab, showInvitesTab, showRecommendationsTab]);

  const toggleSection = useCallback((tab: Tab) => {
    setActiveTab(current => current === tab ? null : tab);
  }, []);

  useEffect(() => {
    const onOpenComposer = (event: Event) => {
      if (!canManage) return;
      const detail = (event as CustomEvent<{ type?: AnnouncementType }>).detail;
      const type: AnnouncementType = detail?.type === 'event' ? 'event' : 'announcement';
      setActiveTab(type);
      setEditTarget(null);
      setModalType(type);
      setModalOpen(true);
    };
    window.addEventListener('mayvox:announcements-open-composer', onOpenComposer);
    return () => window.removeEventListener('mayvox:announcements-open-composer', onOpenComposer);
  }, [canManage]);

  // ── Fetch ──
  const fetchAnnouncements = useCallback(async () => {
    const { data } = await getAnnouncements(serverId);
    if (data) setAnnouncements(data as Announcement[]);
  }, [serverId]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  useEffect(() => {
    if (!serverId || !showRecommendationsTab) {
      setRecommendationPreviewItems([]);
      return;
    }
    let cancelled = false;
    void getServerRecommendations(serverId, { limit: 3, includeHidden: canManage })
      .then(items => {
        if (!cancelled) setRecommendationPreviewItems(items);
      })
      .catch(() => {
        if (!cancelled) setRecommendationPreviewItems([]);
      });
    return () => { cancelled = true; };
  }, [canManage, serverId, showRecommendationsTab]);

  useEffect(() => {
    if (!serverId) {
      setStreamPreviewItems([]);
      return;
    }
    let cancelled = false;
    const loadStreams = () => {
      void fetchStreamLinks()
      .catch(() => {
        if (!cancelled) setStreamPreviewItems([]);
      });
    };

    loadStreams();
    const interval = window.setInterval(loadStreams, 90_000);
    const onFocus = () => loadStreams();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadStreams();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchStreamLinks, serverId]);

  useEffect(() => {
    if (!serverId) {
      setDismissedActivityKeys(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`mayvox:server-home-dismissed-activity:${serverId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissedActivityKeys(new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []));
    } catch {
      setDismissedActivityKeys(new Set());
    }
  }, [serverId]);

  const dismissActivityItem = useCallback((key: string) => {
    if (!serverId) return;
    setDismissedActivityKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem(`mayvox:server-home-dismissed-activity:${serverId}`, JSON.stringify([...next]));
      } catch {
        // localStorage quota/private mode failure should not break the UI.
      }
      return next;
    });
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !canViewRoomActivity || channels.length === 0) {
      setRoomActivitySessionItems([]);
      return;
    }
    let cancelled = false;
    const candidates = channels.filter(channel => channel.id).slice(0, 16);
    void Promise.allSettled(
      candidates.map(async channel => {
        const events = await listRoomActivityEvents(serverId, channel.id, 75);
        return buildRoomSessionSummaries(channel, events);
      }),
    ).then(results => {
      if (cancelled) return;
      const items = results
        .flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .sort((a, b) => timeValue(b.endedAt) - timeValue(a.endedAt))
        .slice(0, 3);
      setRoomActivitySessionItems(items);
    }).catch(() => {
      if (!cancelled) setRoomActivitySessionItems([]);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewRoomActivity, channels, serverId]);

  // ── WebSocket realtime ──
  useEffect(() => {
    return subscribeRealtimeEvents(event => {
      if (event.type !== 'announcement-update') return;
      const payload = event.payload || {};
      if (payload.serverId && serverId && payload.serverId !== serverId) return;
      void fetchAnnouncements();
    });
  }, [fetchAnnouncements, serverId]);

  // ── Handlers ──
  const handleSubmit = async (data: ModalData) => {
    setLoading(true);
    try {
      if (editTarget) {
        const { error } = await updateAnnouncement(editTarget.id, data);
        if (error) { showToast('Güncelleme başarısız: ' + error.message); return; }
      } else {
        const { error } = await createAnnouncement({
          ...data,
          server_id: serverId,
          author_id: currentUser.id,
          author_name: getPublicDisplayName(currentUser),
        });
        if (error) { showToast('Ekleme başarısız: ' + error.message); return; }
      }
      setModalOpen(false);
      setEditTarget(null);
      await fetchAnnouncements();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setLoading(true);
    try {
      // Immediate optimistic removal
      setAnnouncements(prev => prev.filter(a => a.id !== targetId));
      setDeleteTarget(null);

      const { error } = await deleteAnnouncement(targetId);
      if (error) {
        showToast('Silme başarısız: ' + error.message);
        // Rollback — refetch to restore
        await fetchAnnouncements();
        return;
      }
      // Confirm with server state
      await fetchAnnouncements();
    } finally {
      setLoading(false);
    }
  };

  const canEditItem = (_a: Announcement) => canModerateContent;

  // ── Filter ──
  const filtered = !activeTab || activeTab === 'invites' || activeTab === 'recommendations'
    ? []
    : announcements.filter(a => a.type === activeTab);

  const pinned = filtered.find(a => a.is_pinned);
  const rest = filtered.filter(a => a !== pinned);

  const announcementCount = announcements.filter(a => a.type === 'announcement').length;
  const eventCount = announcements.filter(a => a.type === 'event').length;
  const recommendationPreviewCount = recommendationPreviewItems.length >= 3
    ? '2+'
    : String(recommendationPreviewItems.length);
  const welcomeServerName = serverName?.trim() || 'Sunucu';
  const welcomeDescription = serverDescription?.trim();
  const allRuleItems = (serverRules ?? '')
    .split(/\r?\n/)
    .map(rule => rule.trim())
    .filter(Boolean);
  const rulePreviewItems = allRuleItems.slice(0, 3);

  const {
    featuredAnnouncement,
    upcomingEvent,
    activityItems,
    upcomingEventCount,
  } = useMemo(() => {
    const announcementItems = announcements
      .filter(a => a.type === 'announcement')
      .sort((a, b) => timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at));
    const eventItems = announcements
      .filter(a => a.type === 'event')
      .sort((a, b) => timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at));
    const pinnedAnnouncement = announcementItems
      .filter(a => a.is_pinned)
      .sort((a, b) => timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at))[0] ?? null;
    const now = Date.now();
    const upcoming = eventItems
      .filter(a => timeValue(a.event_date) >= now - 60_000)
      .sort((a, b) => timeValue(a.event_date) - timeValue(b.event_date));
    const latestRecommendation = [...recommendationPreviewItems]
      .sort((a, b) => timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt))[0] ?? null;
    const latestMember = [...serverMembers]
      .filter(member => timeValue(member.joinedAt) > 0)
      .sort((a, b) => timeValue(b.joinedAt) - timeValue(a.joinedAt))[0] ?? null;
    const latestRoomSession = roomActivitySessionItems[0] ?? null;
    const timeline: ActivityTimelineItem[] = [];
    if (announcementItems[0]) {
      timeline.push({
        key: `announcement-${announcementItems[0].id}`,
        tab: 'announcement',
        label: 'Son duyuru',
        title: announcementItems[0].title,
        time: announcementItems[0].updated_at || announcementItems[0].created_at,
        tone: 'text-[var(--theme-accent)]',
        icon: Megaphone,
      });
    }
    if (eventItems[0]) {
      timeline.push({
        key: `event-${eventItems[0].id}`,
        tab: 'event',
        label: 'Son etkinlik',
        title: eventItems[0].title,
        time: eventItems[0].event_date || eventItems[0].updated_at || eventItems[0].created_at,
        tone: 'text-violet-300',
        icon: Calendar,
      });
    }
    if (showInvitesTab && pendingJoinRequestCount > 0) {
      timeline.push({
        key: 'invites-pending',
        tab: 'invites',
        label: 'Davetler',
        title: `${pendingJoinRequestCount} bekleyen başvuru`,
        time: pendingJoinRequests[0]?.createdAt || new Date().toISOString(),
        tone: 'text-emerald-300',
        icon: UserCheck,
      });
    }
    if (latestRecommendation) {
      const RecommendationIcon = recommendationCategoryIcon(latestRecommendation.category);
      timeline.push({
        key: `recommendation-${latestRecommendation.id}`,
        tab: 'recommendations',
        label: 'Son keşif',
        title: `${latestRecommendation.title} - ${recommendationCategoryLabel(latestRecommendation.category)}`,
        time: latestRecommendation.updatedAt || latestRecommendation.createdAt,
        tone: 'text-amber-300',
        icon: RecommendationIcon,
      });
    }
    if (latestMember) {
      const memberName = latestMember.displayName || latestMember.username || 'Yeni üye';
      timeline.push({
        key: `member-${latestMember.userId}-${latestMember.joinedAt}`,
        label: 'Yeni üye',
        title: `${memberName} sunucuya katıldı`,
        time: latestMember.joinedAt,
        tone: 'text-cyan-300',
        icon: Users,
      });
    }
    if (latestRoomSession && canViewRoomActivity) {
      const roomMode = latestRoomSession.channelMode || 'social';
      const RoomActivityIcon =
        channelIconComponents[latestRoomSession.channelIconName ?? getDefaultChannelIconName(roomMode)] ||
        roomModeIcons[roomMode] ||
        Volume2;
      timeline.push({
        key: latestRoomSession.key,
        label: `ODA - ${latestRoomSession.channelName}`,
        title: `${latestRoomSession.participantCount} kişi ${formatSessionDuration(latestRoomSession.durationMs)} birlikte vakit geçirdi`,
        time: latestRoomSession.endedAt,
        tone: 'text-rose-300',
        icon: RoomActivityIcon,
        iconColor: latestRoomSession.channelIconColor ?? getDefaultChannelIconColor(roomMode),
        wrapTitle: true,
      });
    }
    for (const stream of streamPreviewItems) {
      if (stream.liveStatus || !stream.lastLiveEndedAt || !stream.lastLiveStartedAt) continue;
      const startedAt = timeValue(stream.lastLiveStartedAt);
      const endedAt = timeValue(stream.lastLiveEndedAt);
      if (!startedAt || !endedAt || endedAt <= startedAt) continue;
      const streamerName = stream.channelName || stream.displayName || stream.username || 'Yayıncı';
      const streamTitle = stream.lastLiveTitle || stream.liveTitle || 'canlı yayın';
      timeline.push({
        key: `stream-ended-${stream.id}-${stream.lastLiveEndedAt}`,
        label: 'Yayın sona erdi',
        title: `${streamerName}, ${formatSessionDuration(endedAt - startedAt)} ${streamTitle} yayını yaptı`,
        time: stream.lastLiveEndedAt,
        timeLabel: formatRelativeAgo(stream.lastLiveEndedAt),
        tone: 'text-red-300',
        icon: stream.platform === 'youtube' ? YoutubeBrandIcon : stream.platform === 'twitch' ? Twitch : Radio,
        wrapTitle: true,
      });
    }
    return {
      featuredAnnouncement: pinnedAnnouncement ?? announcementItems[0] ?? null,
      upcomingEvent: upcoming[0] ?? eventItems[0] ?? null,
      activityItems: timeline
        .filter(item => !dismissedActivityKeys.has(item.key))
        .sort((a, b) => timeValue(b.time) - timeValue(a.time))
        .slice(0, 24),
      upcomingEventCount: upcoming.length,
    };
  }, [
    announcements,
    canViewRoomActivity,
    dismissedActivityKeys,
    pendingJoinRequestCount,
    pendingJoinRequests,
    recommendationPreviewItems,
    roomActivitySessionItems,
    serverMembers,
    showInvitesTab,
    streamPreviewItems,
  ]);

  const useCompactServerHome = panelWidth > 0 && panelWidth < 760;
  const activityPageSize = useCompactServerHome ? 2 : (activityItems.some(item => item.wrapTitle) ? 3 : ACTIVITY_PAGE_SIZE);
  const activityPageCount = Math.max(1, Math.ceil(activityItems.length / activityPageSize));
  const safeActivityPage = Math.min(activityPage, activityPageCount - 1);
  const visibleActivityItems = activityItems.slice(
    safeActivityPage * activityPageSize,
    safeActivityPage * activityPageSize + activityPageSize,
  );
  const recommendationPageSize = 3;
  const recommendationPageCount = Math.max(1, Math.ceil(recommendationPreviewItems.length / recommendationPageSize));
  const safeRecommendationPage = Math.min(recommendationPage, recommendationPageCount - 1);
  const visibleRecommendationPreviewItems = recommendationPreviewItems.slice(
    safeRecommendationPage * recommendationPageSize,
    safeRecommendationPage * recommendationPageSize + recommendationPageSize,
  );

  useEffect(() => {
    setActivityPage(current => Math.min(current, Math.max(0, Math.ceil(activityItems.length / activityPageSize) - 1)));
  }, [activityItems.length, activityPageSize]);

  useEffect(() => {
    setRecommendationPage(current => Math.min(current, Math.max(0, Math.ceil(recommendationPreviewItems.length / recommendationPageSize) - 1)));
  }, [recommendationPreviewItems.length, recommendationPageSize]);

  if (announcements.length === 0 && !canManage && !canCreateRecommendations && !showInvitesTab && !showRecommendationsTab) return null;

  const detailEmptyState = activeTab === 'event'
    ? {
      icon: Calendar,
      title: 'Henüz etkinlik yok.',
      description: canManage ? 'İlk etkinliği oluşturduğunda burada görünecek.' : 'Yeni etkinlikler burada görünecek.',
    }
    : {
      icon: Megaphone,
      title: 'Henüz duyuru yok.',
      description: canManage ? 'İlk duyuruyu eklediğinde burada görünecek.' : 'Yeni duyurular burada görünecek.',
    };
  const DetailEmptyIcon = detailEmptyState.icon;
  const liveStreamItems = streamPreviewItems.filter(item => item.liveStatus);
  const liveStreamCount = liveStreamItems.length;
  const summaryMetrics = [
    {
      label: 'Duyuru',
      value: announcementCount,
      tab: 'announcement' as Tab,
      icon: Megaphone,
      accentRgb: '34, 197, 94',
      action: canManage ? 'Duyuru ekle' : '',
      actionIcon: PlusCircle,
      onAction: () => { setEditTarget(null); setModalType('announcement'); setModalOpen(true); },
    },
    {
      label: 'Yaklaşan',
      value: upcomingEventCount,
      tab: 'event' as Tab,
      icon: Calendar,
      accentRgb: '167, 139, 250',
      action: canManage ? 'Etkinlik oluştur' : '',
      actionIcon: Calendar,
      onAction: () => { setEditTarget(null); setModalType('event'); setModalOpen(true); },
    },
    ...(showRecommendationsTab ? [{
      label: 'Keşif',
      value: recommendationPreviewCount,
      tab: 'recommendations' as Tab,
      icon: Compass,
      accentRgb: '245, 158, 11',
      action: canCreateRecommendations ? 'Keşif ekle' : '',
      actionIcon: PlusCircle,
      onAction: () => { setActiveTab('recommendations'); setRecommendationCreateSignal(prev => prev + 1); },
    }] : []),
    ...(canModerateCommunityContent || streamPreviewItems.length > 0 ? [{
      label: 'Yayın',
      value: liveStreamCount,
      tab: 'streams' as Tab,
      icon: Radio,
      accentRgb: '248, 113, 113',
      action: canModerateCommunityContent ? (streamModalChecking ? 'Kontrol ediliyor' : 'Yayın ekle') : '',
      actionIcon: PlusCircle,
      onAction: openStreamAdd,
    }] : []),
    ...(showInvitesTab ? [{
      label: 'Başvuru',
      value: pendingJoinRequestCount,
      tab: 'invites' as Tab,
      icon: UserCheck,
      accentRgb: '56, 189, 248',
      action: mobileTabletLayout ? 'Davetleri Yönet' : '',
      actionIcon: Users,
      onAction: onOpenInviteApplications ?? (() => setActiveTab('invites')),
    }] : []),
  ];
  const summaryGridTemplate = `repeat(${Math.max(summaryMetrics.length, 1)}, minmax(0, 1fr))`;
  const visibleRulePreviewItems = rulePreviewItems;
  const mobileSummaryTabs = summaryMetrics
    .map(metric => metric.tab)
    .filter((tab): tab is Tab => Boolean(tab));

  const selectMobileTab = (tab: Tab) => {
    setActiveTab(current => current === tab ? null : tab);
  };

  const handleMobileSummaryTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!mobileTabletLayout || !mobileTouchStart || mobileSummaryTabs.length < 2) return;
    const touch = event.changedTouches[0];
    setMobileTouchStart(null);
    if (!touch) return;
    const deltaX = touch.clientX - mobileTouchStart.x;
    const deltaY = touch.clientY - mobileTouchStart.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.12) return;
    const currentIndex = activeTab ? Math.max(0, mobileSummaryTabs.findIndex(tab => tab === activeTab)) : 0;
    const nextIndex = deltaX < 0
      ? Math.min(mobileSummaryTabs.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    setActiveTab(mobileSummaryTabs[nextIndex]);
  };

  return (
    <div
      ref={panelRef}
      className={mobileTabletLayout ? 'flex h-full min-h-0 w-full touch-pan-y flex-col overflow-hidden px-3 pt-0.5' : 'w-full max-w-5xl mx-auto mt-4 mb-[calc(var(--mv-content-bottom-reserve)+0.75rem)] px-4 sm:px-5 pb-8'}
      onTouchStart={mobileTabletLayout ? event => setMobileTouchStart({ x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 }) : undefined}
      onTouchEnd={mobileTabletLayout ? handleMobileSummaryTouchEnd : undefined}
      onTouchCancel={mobileTabletLayout ? () => setMobileTouchStart(null) : undefined}
    >
      <section className={mobileTabletLayout ? 'z-10 mb-2 shrink-0 px-0 py-0.5' : 'mb-3 overflow-hidden rounded-[18px] border border-[rgba(var(--glass-tint),0.052)] bg-[rgba(var(--glass-tint),0.022)] p-3 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.035)] sm:p-3.5'}>
        <div className={mobileTabletLayout ? 'flex min-w-0 flex-col items-center gap-1.5' : 'flex min-w-0 items-start gap-2'}>
          <div className={mobileTabletLayout ? 'hidden' : `min-w-0 shrink-0 self-center p-1 text-left ${useCompactServerHome ? 'w-[132px]' : 'w-[156px]'}`}>
            <span className="block text-[13px] font-semibold leading-tight text-[var(--theme-text)]">
              {welcomeServerName} sunucusuna hoş geldin
            </span>
            <span className="mt-1 block text-[10px] leading-4 text-[var(--theme-secondary-text)]/52">
              {welcomeDescription || 'Sunucu ana sayfası'}
            </span>
          </div>
          <div
            className={mobileTabletLayout ? 'flex w-full min-w-0 touch-pan-y snap-x gap-2 overflow-x-auto pb-1 custom-scrollbar' : 'grid min-w-0 flex-1 gap-2'}
            style={mobileTabletLayout ? undefined : { gridTemplateColumns: summaryGridTemplate }}
          >
              {summaryMetrics.map(metric => {
                const Icon = metric.icon;
                const isActive = metric.tab ? activeTab === metric.tab : false;
                return (
                  <div
                    key={metric.label}
                    style={{
                      '--section-accent': metric.accentRgb,
                    } as React.CSSProperties}
                    className={`group min-w-0 border transition-all duration-200 ${mobileTabletLayout ? 'flex h-10 min-w-[108px] flex-1 snap-start items-center rounded-[13px] px-2 py-0.5' : useCompactServerHome ? 'rounded-[12px] px-1.5 py-1.5' : 'rounded-[14px] px-2 py-2'} ${
                      isActive
                        ? 'border-[rgba(var(--section-accent),0.30)] bg-[rgba(var(--section-accent),0.072)] shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.055)]'
                        : 'border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] hover:border-[rgba(var(--section-accent),0.24)] hover:bg-[rgba(var(--section-accent),0.042)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (metric.tab) {
                          if (mobileTabletLayout) selectMobileTab(metric.tab);
                          else toggleSection(metric.tab);
                        }
                      }}
                      className={`flex h-full w-full items-center justify-between gap-1.5 text-left ${metric.tab ? '' : 'cursor-default'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block font-semibold leading-none transition-colors ${useCompactServerHome ? 'text-[14px]' : 'text-[16px]'} ${isActive ? 'text-[rgb(var(--section-accent))]' : 'text-[var(--theme-text)] group-hover:text-[rgb(var(--section-accent))]'}`}>{metric.value}</span>
                        <span className={`mt-0.5 flex min-w-0 items-center gap-1 truncate font-medium transition-colors ${useCompactServerHome ? 'text-[8.5px]' : 'text-[9.5px]'} ${isActive ? 'text-[rgb(var(--section-accent))]/80' : 'text-[var(--theme-secondary-text)]/55 group-hover:text-[rgb(var(--section-accent))]/72'}`}>
                          {mobileTabletLayout && <Icon size={9.5} className="shrink-0 text-[rgb(var(--section-accent))]/78" />}
                          <span className="truncate">{metric.label}</span>
                        </span>
                      </span>
                      {mobileTabletLayout && metric.action && (
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            metric.onAction();
                          }}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] border border-[rgba(var(--section-accent),0.16)] bg-[rgba(var(--section-accent),0.045)] text-[rgb(var(--section-accent))]"
                          aria-label={metric.action}
                          title={metric.action}
                        >
                          <PlusCircle size={11} strokeWidth={2.35} className="shrink-0 opacity-82" />
                        </span>
                      )}
                    </button>
                    {!mobileTabletLayout && metric.action && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          metric.onAction();
                        }}
                        className={`inline-flex max-w-full items-center justify-center gap-1 border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.01)] font-semibold text-[var(--theme-secondary-text)]/62 transition-colors hover:border-[rgba(var(--section-accent),0.20)] hover:bg-[rgba(var(--section-accent),0.065)] hover:text-[rgb(var(--section-accent))] ${useCompactServerHome ? 'mt-1 h-5 rounded-lg px-1.5 text-[8px]' : 'mt-1.5 h-6 rounded-[10px] px-2 text-[9px]'}`}
                      >
                        <Icon size={useCompactServerHome ? 8 : 10} className="shrink-0 text-[rgb(var(--section-accent))]/78" />
                        <span className="truncate">{metric.action}</span>
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <div className={mobileTabletLayout ? 'mobile-server-home-scrollbar min-h-0 flex-1 overflow-y-auto pb-3' : 'contents'}>

      {!mobileTabletLayout && <section
        className="mb-3 grid gap-3"
        style={{
          gridTemplateColumns: useCompactServerHome
            ? 'repeat(3, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('announcement')}
          className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] text-left transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.18)] hover:bg-[rgba(var(--glass-tint),0.026)] ${useCompactServerHome ? 'min-h-[112px] p-2.5' : 'min-h-[146px] p-3.5'}`}
        >
          <div className={`${useCompactServerHome ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-2`}>
            <span className={`inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>
              <Megaphone size={useCompactServerHome ? 12 : 14} className="shrink-0 text-[var(--theme-accent)]" />
              Öne çıkan duyuru
            </span>
          </div>
          {featuredAnnouncement ? (
            <>
              <div className="flex items-center gap-2">
                {featuredAnnouncement.is_pinned && <Pin size={12} className="shrink-0 text-[var(--theme-accent)]" />}
                <h3 className={`${useCompactServerHome ? 'text-[12px]' : 'text-[15px]'} line-clamp-1 font-semibold text-[var(--theme-text)]`}>{featuredAnnouncement.title}</h3>
              </div>
              {featuredAnnouncement.content && <p className={`${useCompactServerHome ? 'mt-1 line-clamp-2 text-[10px] leading-4' : 'mt-2 line-clamp-2 text-[12px] leading-5'} text-[var(--theme-secondary-text)]/66`}>{featuredAnnouncement.content}</p>}
              <div className="mt-3 text-[10px] text-[var(--theme-secondary-text)]/45">{formatDate(featuredAnnouncement.updated_at || featuredAnnouncement.created_at)}</div>
            </>
          ) : (
            <div className={`${useCompactServerHome ? 'py-2 text-[10px]' : 'py-3 text-[12px]'} text-[var(--theme-secondary-text)]/45`}>Henüz duyuru yok.</div>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('event')}
          className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] text-left transition-colors hover:border-violet-300/18 hover:bg-[rgba(var(--glass-tint),0.026)] ${useCompactServerHome ? 'min-h-[112px] p-2.5' : 'min-h-[146px] p-3.5'}`}
        >
          <div className={`${useCompactServerHome ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-2`}>
            <span className={`inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>
              <Calendar size={useCompactServerHome ? 12 : 14} className="shrink-0 text-violet-300" />
              Yaklaşan etkinlik
            </span>
          </div>
          {upcomingEvent ? (
            <>
              <h3 className={`${useCompactServerHome ? 'text-[12px]' : 'text-[15px]'} line-clamp-1 font-semibold text-[var(--theme-text)]`}>{upcomingEvent.title}</h3>
              {upcomingEvent.event_date && <div className={`${useCompactServerHome ? 'mt-1 text-[10px]' : 'mt-2 text-[12px]'} font-medium text-violet-200`}>{formatEventDate(upcomingEvent.event_date)}</div>}
              {upcomingEvent.content && <p className={`${useCompactServerHome ? 'mt-1 line-clamp-2 text-[10px] leading-4' : 'mt-2 line-clamp-2 text-[12px] leading-5'} text-[var(--theme-secondary-text)]/64`}>{upcomingEvent.content}</p>}
            </>
          ) : (
            <div className={`${useCompactServerHome ? 'py-2 text-[10px]' : 'py-3 text-[12px]'} text-[var(--theme-secondary-text)]/45`}>Planlanmış etkinlik yok.</div>
          )}
        </button>

        <div className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] ${useCompactServerHome ? 'min-h-[112px] p-2.5' : 'min-h-[146px] p-3.5'}`}>
          <div className={`${useCompactServerHome ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-2`}>
            <span className={`inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>
              <Radio size={useCompactServerHome ? 12 : 14} className="shrink-0 text-red-300" />
              Yayınlar
            </span>
          </div>
          {liveStreamItems.length > 0 ? (
            <div className="space-y-2">
              {liveStreamItems.slice(0, 3).map(item => {
                const liveStartedAt = formatLiveStartedAt(item.liveStartedAt);
                const liveDuration = formatLiveDuration(item.liveStartedAt);
                return (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-red-400/16 bg-red-500/[0.025] px-2.5 py-2 transition-colors hover:border-red-300/24 hover:bg-red-500/[0.04]"
                >
                  <div className="flex shrink-0 items-center justify-center">
                    <span className={`flex h-7 w-7 items-center justify-center ${
                      item.platform === 'youtube'
                        ? 'text-[#ff0033]'
                        : item.platform === 'twitch'
                          ? 'text-[#9146ff]'
                          : 'text-[var(--theme-accent)]/85'
                    }`}>
                      {item.platform === 'youtube' ? <Youtube size={19} /> : item.platform === 'twitch' ? <Twitch size={19} /> : <Radio size={18} />}
                    </span>
                  </div>
                  <a
                    href={item.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-[var(--theme-text)]">
                        {item.channelName || item.displayName || 'Yayıncı'}
                      </span>
                      {item.liveStatus && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-[2px] text-[8px] font-black uppercase tracking-[0.04em] text-red-300 ring-1 ring-red-400/15">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.55)]" />
                          Canlı
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--theme-text)]/90">
                      {item.liveTitle || 'Canlı yayın'}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--theme-secondary-text)]/48">
                      {typeof item.viewerCount === 'number' && (
                        <span className="shrink-0">{item.viewerCount.toLocaleString('tr-TR')} izleyici</span>
                      )}
                      {liveStartedAt && (
                        <>
                          {typeof item.viewerCount === 'number' && <span className="shrink-0">·</span>}
                          <span className="shrink-0">{liveStartedAt}</span>
                        </>
                      )}
                      {liveDuration && (
                        <>
                          {(typeof item.viewerCount === 'number' || liveStartedAt) && <span className="shrink-0">·</span>}
                          <span className="truncate">{liveDuration} canlı</span>
                        </>
                      )}
                    </span>
                  </a>
                  {(item.userId === currentUser.id || canModerateCommunityContent) && (
                    <button
                      type="button"
                      onClick={openStreamsSettings}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/42 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-accent)]"
                      title="Yayın ayarlarına git"
                      aria-label="Yayın ayarlarına git"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className={`${useCompactServerHome ? 'py-2 text-[10px]' : 'py-3 text-[12px]'} text-[var(--theme-secondary-text)]/45`}>Henüz canlı yayın yok.</div>
          )}
        </div>
      </section>}

      {(!mobileTabletLayout || !activeTab) && <section
        className="mb-4 grid gap-3"
        style={{
          gridTemplateColumns: useCompactServerHome
            ? 'repeat(3, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <div className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] ${useCompactServerHome ? 'min-h-[156px] p-2.5' : 'min-h-[178px] p-3.5'}`}>
          <div className={`${useCompactServerHome ? 'mb-2 gap-1.5' : 'mb-3 gap-2.5'} flex items-start`}>
            <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.055)] text-[var(--theme-accent)]/85 ${useCompactServerHome ? 'h-6 w-6' : 'h-8 w-8'}`}>
              <Compass size={useCompactServerHome ? 12 : 14} />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>Keşif özeti</span>
              <span className="mt-0.5 block truncate text-[9px] text-[var(--theme-secondary-text)]/50">Son eklenenler</span>
            </span>
          </div>
          {recommendationPreviewItems.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className={useCompactServerHome ? 'space-y-1.5' : 'space-y-2'}>
                {visibleRecommendationPreviewItems.map(item => (
                  <RecommendationPreviewItem
                    key={item.id}
                    item={item}
                    onOpen={() => setActiveTab('recommendations')}
                    compact={useCompactServerHome}
                  />
                ))}
              </div>
              {recommendationPageCount > 1 && (
                <div className="mt-auto flex items-center justify-center gap-1.5 border-t border-[rgba(var(--glass-tint),0.045)] pt-2">
                  <button
                    type="button"
                    onClick={() => setRecommendationPage(page => Math.max(0, page - 1))}
                    disabled={safeRecommendationPage === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/56 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-28"
                    aria-label="Önceki keşif sayfası"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="rounded-full bg-[rgba(var(--glass-tint),0.026)] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-[var(--theme-secondary-text)]/62">
                    {safeRecommendationPage + 1} / {recommendationPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecommendationPage(page => Math.min(recommendationPageCount - 1, page + 1))}
                    disabled={safeRecommendationPage >= recommendationPageCount - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/56 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-28"
                    aria-label="Sonraki keşif sayfası"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('recommendations')}
              className={`flex w-full items-center rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] text-left transition-colors hover:border-[rgba(var(--theme-accent-rgb),0.18)] hover:bg-[rgba(var(--theme-accent-rgb),0.04)] ${useCompactServerHome ? 'gap-2 px-2 py-2' : 'gap-3 px-3 py-3'}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.09)] text-[var(--theme-accent)] ${useCompactServerHome ? 'h-7 w-7' : 'h-9 w-9'}`}>
                <Compass size={useCompactServerHome ? 13 : 16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>Henüz keşif yok</span>
                {!useCompactServerHome && <span className="mt-0.5 block text-[10px] leading-4 text-[var(--theme-secondary-text)]/52">Tam keşif alanı sekmeye tıklayınca yüklenir.</span>}
              </span>
            </button>
          )}
        </div>

        <div className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] ${useCompactServerHome ? 'min-h-[156px] p-2.5' : 'min-h-[178px] p-3.5'}`}>
          <div className={`${useCompactServerHome ? 'mb-2 gap-1.5' : 'mb-3 gap-2.5'} flex items-start`}>
            <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.055)] text-[var(--theme-accent)]/85 ${useCompactServerHome ? 'h-6 w-6' : 'h-8 w-8'}`}>
              <Sparkles size={useCompactServerHome ? 12 : 14} />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>Kaçırdıkların</span>
              <span className="mt-0.5 block truncate text-[9px] text-[var(--theme-secondary-text)]/50">Son hareketler</span>
            </span>
          </div>
          {activityItems.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-2">
                {visibleActivityItems.map(item => {
                  const ActivityIcon = item.icon;
                  return (
                    <div key={item.key} className="group/activity flex w-full items-start gap-1 rounded-xl transition-colors hover:bg-[rgba(var(--glass-tint),0.028)]">
                      <button
                        type="button"
                        onClick={() => { if (item.tab) setActiveTab(item.tab); }}
                        className={`flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-1.5 text-left ${item.tab ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center ${item.tone}`}
                          style={item.iconColor ? { color: item.iconColor } : undefined}
                        >
                          <ActivityIcon size={13} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--theme-secondary-text)]/42">{item.label}</span>
                            <span className="text-[9px] leading-3 text-[var(--theme-secondary-text)]/38">{item.timeLabel || formatDate(item.time)}</span>
                          </span>
                          <span className={`block text-[11px] font-medium leading-4 text-[var(--theme-text)] ${item.wrapTitle ? 'whitespace-normal' : 'truncate'}`}>
                            {item.title}
                          </span>
                        </span>
                      </button>
                      {(canModerateContent || canViewRoomActivity) && (
                        <button
                          type="button"
                          onClick={() => dismissActivityItem(item.key)}
                          className="mr-1 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/0 transition-colors hover:bg-red-500/10 hover:text-red-300 group-hover/activity:text-[var(--theme-secondary-text)]/36"
                          title="Bu hareketi gizle"
                          aria-label="Bu hareketi gizle"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {activityPageCount > 1 && (
                <div className="mt-auto flex items-center justify-center gap-1.5 border-t border-[rgba(var(--glass-tint),0.045)] pt-2">
                  <button
                    type="button"
                    onClick={() => setActivityPage(page => Math.max(0, page - 1))}
                    disabled={safeActivityPage === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/56 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-28"
                    aria-label="Önceki kaçırdıkların sayfası"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="rounded-full bg-[rgba(var(--glass-tint),0.026)] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-[var(--theme-secondary-text)]/62">
                    {safeActivityPage + 1} / {activityPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivityPage(page => Math.min(activityPageCount - 1, page + 1))}
                    disabled={safeActivityPage >= activityPageCount - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/56 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)] disabled:opacity-28"
                    aria-label="Sonraki kaçırdıkların sayfası"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] px-3 py-4 text-center">
              <span className="text-[12px] font-semibold text-[var(--theme-text)]/78">Yeni hareket yok.</span>
              <span className="mt-1 text-[10px] leading-4 text-[var(--theme-secondary-text)]/44">Duyuru, etkinlik, keşif, yayın, üye katılımı ve oda olayları burada görünür.</span>
            </div>
          )}
        </div>

        <div className={`flex min-w-0 flex-col rounded-[18px] border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.018)] ${useCompactServerHome ? 'min-h-[156px] p-2.5' : 'min-h-[178px] p-3.5'}`}>
          <div className={`${useCompactServerHome ? 'mb-2 gap-1.5' : 'mb-3 gap-2.5'} flex items-start`}>
            <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.055)] text-[var(--theme-accent)]/85 ${useCompactServerHome ? 'h-6 w-6' : 'h-8 w-8'}`}>
              <ShieldCheck size={useCompactServerHome ? 12 : 14} />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold text-[var(--theme-text)] ${useCompactServerHome ? 'text-[10px]' : 'text-[12px]'}`}>Kurallar</span>
              <span className="mt-0.5 block truncate text-[9px] text-[var(--theme-secondary-text)]/50">Sunucu düzeni</span>
            </span>
          </div>
          {visibleRulePreviewItems.length > 0 ? (
            <div className={useCompactServerHome ? 'space-y-1.5' : 'space-y-2'}>
              {visibleRulePreviewItems.map((rule, index) => (
                <div key={`${index}-${rule}`} className={`rounded-xl px-1.5 py-1 font-medium text-[var(--theme-text)]/82 ${useCompactServerHome ? 'text-[9px] leading-3' : 'text-[11px] leading-4'}`}>
                  <span className="whitespace-normal break-words">{rule}</span>
                </div>
              ))}
              {allRuleItems.length > visibleRulePreviewItems.length && (
                <button
                  type="button"
                  onClick={() => setRulesModalOpen(true)}
                  className="mt-1 inline-flex rounded-lg px-1.5 py-1 text-[10px] font-semibold text-[var(--theme-accent)]/78 transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.055)] hover:text-[var(--theme-accent)]"
                >
                  Tüm kuralları gör
                </button>
              )}
            </div>
          ) : (
            <div className="mt-auto rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.012)] px-3 py-4 text-center text-[11px] font-medium text-[var(--theme-secondary-text)]/46">
              Henüz sunucu kuralı eklenmemiş.
            </div>
          )}
        </div>
      </section>}

      {streamAddModalOpen && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[520] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-[2px]"
            onClick={() => setStreamAddModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-[720px] overflow-hidden rounded-[24px] border border-[rgba(var(--glass-tint),0.08)] shadow-[0_24px_70px_rgba(0,0,0,0.38)]"
              style={{
                background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.026), rgba(var(--glass-tint),0.008)), var(--theme-bg)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.014)] px-5 py-4">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-[var(--theme-text)]">Yayın ekle</h3>
                  <p className="mt-0.5 text-[11px] leading-5 text-[var(--theme-secondary-text)]/54">
                    API bağlantıları hazır. Sadece kanal adını ve adresini ekle.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStreamAddModalOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]"
                  aria-label="Kapat"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid max-h-[72vh] gap-3 overflow-y-auto p-4 md:grid-cols-2">
                <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
                  <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)]">
                    <Twitch size={15} className="text-[#9146ff]" />
                    Twitch kanalı
                  </h4>
                  <div className="mt-3 space-y-2">
                    <input
                      value={quickTwitchName}
                      onChange={event => setQuickTwitchName(event.target.value)}
                      placeholder="Kanal adı"
                      maxLength={120}
                      className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                    />
                    <input
                      value={quickTwitchUrl}
                      onChange={event => setQuickTwitchUrl(event.target.value)}
                      placeholder="https://www.twitch.tv/kullaniciadi"
                      className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleQuickAddStream('twitch', quickTwitchUrl, quickTwitchName);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleQuickAddStream('twitch', quickTwitchUrl, quickTwitchName)}
                      disabled={streamModalSaving || !quickTwitchUrl.trim()}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.16)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.11)] disabled:cursor-default disabled:opacity-45"
                    >
                      <PlusCircle size={13} />
                      {streamModalSaving ? 'Ekleniyor' : 'Ekle'}
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-[rgba(var(--glass-tint),0.055)] bg-[rgba(var(--glass-tint),0.012)] p-3.5">
                  <h4 className="flex items-center gap-2 text-[12px] font-semibold text-[var(--theme-text)]">
                    <Youtube size={15} className="text-[#ff0033]" />
                    YouTube kanalı
                  </h4>
                  <div className="mt-3 space-y-2">
                    <input
                      value={quickYoutubeName}
                      onChange={event => setQuickYoutubeName(event.target.value)}
                      placeholder="Kanal adı"
                      maxLength={120}
                      className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                    />
                    <input
                      value={quickYoutubeUrl}
                      onChange={event => setQuickYoutubeUrl(event.target.value)}
                      placeholder="https://www.youtube.com/@kanaladi"
                      className="h-9 w-full rounded-xl border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] px-3 text-[12px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/35 focus:border-[rgba(var(--theme-accent-rgb),0.32)]"
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleQuickAddStream('youtube', quickYoutubeUrl, quickYoutubeName);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleQuickAddStream('youtube', quickYoutubeUrl, quickYoutubeName)}
                      disabled={streamModalSaving || !quickYoutubeUrl.trim()}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[rgba(var(--theme-accent-rgb),0.16)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-3 text-[11px] font-semibold text-[var(--theme-accent)] transition-colors hover:bg-[rgba(var(--theme-accent-rgb),0.11)] disabled:cursor-default disabled:opacity-45"
                    >
                      <PlusCircle size={13} />
                      {streamModalSaving ? 'Ekleniyor' : 'Ekle'}
                    </button>
                  </div>
                </section>

                <section className="md:col-span-2 rounded-2xl border border-[rgba(var(--glass-tint),0.05)] bg-[rgba(var(--glass-tint),0.01)] p-3.5">
                  <h4 className="text-[12px] font-semibold text-[var(--theme-text)]">Eklenen yayın önizlemesi</h4>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {streamPreviewItems.length > 0 ? streamPreviewItems.map(item => (
                      <div key={item.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[rgba(var(--glass-tint),0.04)] bg-[rgba(var(--glass-tint),0.014)] px-3 py-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center ${item.platform === 'youtube' ? 'text-[#ff0033]' : item.platform === 'twitch' ? 'text-[#9146ff]' : 'text-[var(--theme-accent)]/85'}`}>
                          {item.platform === 'youtube' ? <Youtube size={18} /> : item.platform === 'twitch' ? <Twitch size={18} /> : <Radio size={18} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-[var(--theme-text)]">{item.channelName || item.displayName || 'Yayıncı'}</span>
                          <span className="block truncate text-[10px] text-[var(--theme-secondary-text)]/46">
                            {item.liveStatus ? 'Canlı' : item.lastLiveEndedAt ? 'Son yayın sona erdi' : 'Canlı yayın yok'}
                          </span>
                        </span>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.05)] px-3 py-4 text-center text-[11px] text-[var(--theme-secondary-text)]/45 md:col-span-2">
                        Henüz yayın bağlantısı yok.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}

      {rulesModalOpen && createPortal(
        <AnimatePresence>
          <RulesModal
            open={rulesModalOpen}
            serverName={welcomeServerName}
            rules={allRuleItems}
            onClose={() => setRulesModalOpen(false)}
          />
        </AnimatePresence>,
        document.body,
      )}

      {/* Empty state */}
      {activeTab && activeTab !== 'invites' && activeTab !== 'recommendations' && activeTab !== 'streams' && filtered.length === 0 && (
        <div className="rounded-[18px] border border-transparent bg-transparent px-4 py-4">
          <div className="flex flex-col items-center justify-center text-center">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(var(--theme-accent-rgb),0.045)] text-[var(--theme-accent)]/70">
              <DetailEmptyIcon size={16} />
            </span>
            <div className="text-[12px] font-semibold text-[var(--theme-text)]/82">{detailEmptyState.title}</div>
            <div className="mt-1 text-[10px] text-[var(--theme-secondary-text)]/44">{detailEmptyState.description}</div>
          </div>
        </div>
      )}
      {/* Cards */}
      <div className="min-h-0 space-y-3">
      {!activeTab ? (
        <div className="rounded-[18px] border border-transparent bg-transparent px-4 py-3">
          <div className="flex items-center justify-center text-center">
            <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--theme-accent-rgb),0.035)] text-[var(--theme-accent)]/66">
              <Volume2 size={16} />
            </span>
            <div className="min-w-0 text-left">
              <div className="text-[11px] font-semibold text-[var(--theme-text)]/72">Sohbete hazır.</div>
              <div className="mt-0.5 text-[10px] text-[var(--theme-secondary-text)]/42">Başlamak için soldaki ses kanallarından birine katıl.</div>
            </div>
          </div>
        </div>
      ) : activeTab === 'recommendations' ? (
        <React.Suspense fallback={<div className="text-center py-12 text-[var(--theme-secondary-text)]/45 text-xs">Keşif yükleniyor...</div>}>
          <RecommendationsTab
            serverId={serverId}
            currentUser={currentUser}
            openCreateSignal={recommendationCreateSignal}
            onCreateSignalHandled={() => setRecommendationCreateSignal(0)}
            canModerateContent={canModerateContent}
          />
        </React.Suspense>
        ) : activeTab === 'streams' ? (
          <div className="space-y-2 rounded-[18px] border border-[rgba(var(--glass-tint),0.045)] bg-[rgba(var(--glass-tint),0.012)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-[var(--theme-text)]">Yayınlar</h3>
                <p className="mt-0.5 text-[10px] text-[var(--theme-secondary-text)]/48">Sunucudaki canlı ve kayıtlı yayın bağlantıları</p>
              </div>
              {canModerateCommunityContent && !mobileTabletLayout && (
                <button
                  type="button"
                  onClick={openStreamAdd}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[11px] border border-red-300/18 bg-red-500/[0.055] px-3 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/[0.08]"
                >
                  <PlusCircle size={12} />
                  Yayın ekle
                </button>
              )}
            </div>
            {streamPreviewItems.length > 0 ? (
              streamPreviewItems.map(item => (
                <a
                  key={item.id}
                  href={item.channelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-red-400/12 bg-red-500/[0.02] px-3 py-2.5 transition-colors hover:border-red-300/22 hover:bg-red-500/[0.04]"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${item.platform === 'youtube' ? 'text-[#ff0033]' : item.platform === 'twitch' ? 'text-[#9146ff]' : 'text-red-300'}`}>
                    {item.platform === 'youtube' ? <Youtube size={20} /> : item.platform === 'twitch' ? <Twitch size={20} /> : <Radio size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-[var(--theme-text)]">{item.channelName || item.displayName || 'Yayıncı'}</span>
                      {item.liveStatus && <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-[2px] text-[8px] font-black uppercase tracking-[0.04em] text-red-300 ring-1 ring-red-400/15">Canlı</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-[var(--theme-secondary-text)]/52">{item.liveTitle || item.lastLiveTitle || item.channelUrl}</span>
                  </span>
                </a>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[rgba(var(--glass-tint),0.05)] px-3 py-4 text-center text-[11px] text-[var(--theme-secondary-text)]/45">
                Henüz yayın bağlantısı yok.
              </div>
            )}
          </div>
        ) : activeTab === 'invites' ? (
          <InviteApplicationsFeed
            items={joinRequestItems}
            error={joinRequestError}
            busyId={joinRequestBusyId}
            onAccept={acceptJoinRequest}
            onReject={rejectJoinRequest}
            onManage={onOpenInviteApplications ?? (() => undefined)}
            showManageButton={!mobileTabletLayout}
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {pinned && (
              <React.Fragment key={pinned.id}>
                {pinned.type === 'event'
                  ? <EventCard item={pinned} isPinned canEdit={canManage && canEditItem(pinned)} onEdit={() => { setEditTarget(pinned); setModalType(pinned.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(pinned)} />
                  : <AnnouncementCard item={pinned} isPinned canEdit={canManage && canEditItem(pinned)} onEdit={() => { setEditTarget(pinned); setModalType(pinned.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(pinned)} />
                }
              </React.Fragment>
            )}
            {rest.map(a => (
              <React.Fragment key={a.id}>
                {a.type === 'event'
                  ? <EventCard item={a} canEdit={canManage && canEditItem(a)} onEdit={() => { setEditTarget(a); setModalType(a.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(a)} />
                  : <AnnouncementCard item={a} canEdit={canManage && canEditItem(a)} onEdit={() => { setEditTarget(a); setModalType(a.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(a)} />
                }
              </React.Fragment>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Modals — portal ile body'ye render (parent transform/overflow kırmasın) */}
      {modalOpen && createPortal(
        <ItemModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
          onSubmit={handleSubmit}
          initial={editTarget}
          initialType={modalType}
          loading={loading}
        />,
        document.body,
      )}
      {!!deleteTarget && createPortal(
        <DeleteConfirm
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={loading}
        />,
        document.body,
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-red-500/90 text-white text-xs font-medium shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
