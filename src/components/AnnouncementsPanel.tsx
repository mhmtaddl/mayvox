import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Pin, Megaphone, Plus, Edit2, Trash2, X, AlertTriangle, AlertCircle,
  Calendar, Clock, Users, ChevronDown, UserCheck, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Announcement, AnnouncementPriority, AnnouncementType } from '../types';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../lib/backendClient';
import { subscribeRealtimeEvents } from '../lib/chatService';
import { getPublicDisplayName } from '../lib/formatName';
import { useJoinRequests } from '../hooks/useJoinRequests';
import type { JoinRequestListItem } from '../lib/serverService';

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

// ── Shared input classes ────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:outline-none transition-colors' + ' ' + 'border border-[rgba(var(--glass-tint),0.06)] bg-[rgba(var(--shadow-base),0.15)] focus:border-[rgba(var(--theme-accent-rgb),0.4)] focus:shadow-[inset_0_1px_3px_rgba(var(--shadow-base),0.1),0_0_0_3px_rgba(var(--theme-accent-rgb),0.08)]';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-[var(--theme-secondary-text)]/80 mb-1.5';

// ── Add menu ────────────────────────────────────────────────────────────────

const AddMenu = ({ onSelect }: { onSelect: (type: AnnouncementType) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Ekle"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-[var(--theme-accent)] bg-[var(--theme-accent)]/8 hover:bg-[var(--theme-accent)]/15 border border-[var(--theme-accent)]/15 transition-all"
      >
        <Plus size={12} />
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            className="absolute right-0 top-full mt-1.5 z-30 min-w-[160px] rounded-lg border border-[var(--theme-border)]/40 bg-[var(--theme-surface)] shadow-xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => { onSelect('announcement'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/8 transition-colors"
            >
              <Megaphone size={13} className="text-[var(--theme-accent)]" />
              Duyuru Ekle
            </button>
            <button
              type="button"
              onClick={() => { onSelect('event'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-[var(--theme-text)] hover:bg-[var(--theme-accent)]/8 transition-colors"
            >
              <Calendar size={13} className="text-violet-400" />
              Etkinlik Ekle
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
    <div className="p-3 rounded-xl border w-[260px]" style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', boxShadow: 'var(--popover-shadow)', color: 'var(--popover-text)' }} onClick={e => e.stopPropagation()}>
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
    <div className="p-4 rounded-xl border w-[200px]" style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', boxShadow: 'var(--popover-shadow)', color: 'var(--popover-text)' }} onClick={e => e.stopPropagation()}>
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
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-md rounded-2xl border max-h-[85vh] flex flex-col overflow-hidden"
        style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', color: 'var(--popover-text)', boxShadow: 'var(--popover-shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb), 0.3), transparent)` }} />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ background: 'rgba(var(--glass-tint),0.02)', borderBottom: '1px solid rgba(var(--glass-tint),0.04)' }}>
          <div className="flex items-center gap-2.5">
            {isEvent
              ? <Calendar size={15} className="text-violet-400" />
              : <Megaphone size={15} className="text-[var(--theme-accent)]" />
            }
            <h3 className="text-sm font-semibold text-[var(--theme-text)]">
              {initial
                ? (isEvent ? 'Etkinliği Düzenle' : 'Duyuruyu Düzenle')
                : (isEvent ? 'Yeni Etkinlik' : 'Yeni Duyuru')
              }
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className={labelCls}>{isEvent ? 'Etkinlik Adı' : 'Başlık'}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className={inputCls} placeholder={isEvent ? 'Etkinlik adı...' : 'Duyuru başlığı...'} />
          </div>

          <div>
            <label className={labelCls}>{isEvent ? 'Açıklama' : 'İçerik'}</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={3} className={`${inputCls} resize-none`} placeholder={isEvent ? 'Etkinlik açıklaması...' : 'Duyuru içeriği...'} />
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
                    <div className="fixed inset-0 z-[250]" onClick={() => setShowCalendar(false)} />
                    <div className="fixed z-[251]" style={{ top: calBtnRef.current.getBoundingClientRect().top - 8, left: calBtnRef.current.getBoundingClientRect().left, transform: 'translateY(-100%)' }}>
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
                      <div className="fixed inset-0 z-[250]" onClick={() => setShowTimePicker(false)} />
                      <div className="fixed z-[251]" style={{ top: timeBtnRef.current.getBoundingClientRect().top - 8, left: timeBtnRef.current.getBoundingClientRect().right - 200, transform: 'translateY(-100%)' }}>
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
                      <div className="fixed inset-0 z-[250]" onClick={() => setShowPartTimePicker(false)} />
                      <div className="fixed z-[251]" style={{ top: partTimeBtnRef.current.getBoundingClientRect().top - 8, left: partTimeBtnRef.current.getBoundingClientRect().right - 200, transform: 'translateY(-100%)' }}>
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
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    priority === p
                      ? p === 'normal'
                        ? 'border-[var(--theme-accent)]/50 bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]'
                        : p === 'important'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                          : 'border-red-500/50 bg-red-500/10 text-red-400'
                      : 'border-[var(--theme-border)]/30 text-[var(--theme-secondary-text)] hover:border-[var(--theme-border)]/60'
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
        <div className="flex justify-end gap-2.5 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(var(--glass-tint),0.04)' }}>
          <button type="button" onClick={onClose} className="px-4 py-1.5 btn-cancel text-xs active:scale-[0.97]">
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
            className="px-4 py-1.5 rounded-lg text-xs font-bold btn-primary active:scale-[0.97] disabled:opacity-40"
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
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-sm rounded-2xl border p-5"
        style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', color: 'var(--popover-text)', boxShadow: 'var(--popover-shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[var(--theme-text)] mb-4">Bu öğeyi silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-semibold rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors active:scale-[0.97]">İptal</button>
          <button type="button" disabled={loading} onClick={onConfirm} className="px-4 py-1.5 text-xs font-bold rounded-lg text-red-400 hover:bg-red-500/10 transition-colors active:scale-[0.97] disabled:opacity-40">
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
        ? 'bg-gradient-to-br from-[var(--theme-surface)] to-[var(--surface-elevated)] p-5'
        : 'bg-[var(--theme-surface)]/50 hover:bg-[var(--theme-surface)]/80 p-4'
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
        ? 'bg-gradient-to-br from-violet-500/5 via-[var(--theme-surface)] to-[var(--surface-elevated)] p-5'
        : 'bg-[var(--theme-surface)]/50 hover:bg-[var(--theme-surface)]/80 p-4'
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
}: {
  items: JoinRequestListItem[] | null;
  error: string;
  busyId: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onManage: () => void;
}) {
  const pendingItems = (items ?? []).filter(it => it.status === 'pending');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--theme-text)]">Bekleyen Davetler</div>
          <div className="text-[10px] text-[var(--theme-secondary-text)]/50">Sunucuya katılma başvuruları</div>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="shrink-0 h-7 px-3 rounded-lg text-[10px] font-semibold text-[var(--theme-accent)] transition-colors"
          style={{
            background: 'rgba(var(--theme-accent-rgb), 0.10)',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.18)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--theme-accent-rgb), 0.10)'; }}
        >
          Davetleri Yönet
        </button>
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
        <div className="text-center py-10 text-[var(--theme-secondary-text)]/40 text-xs">Yükleniyor...</div>
      ) : pendingItems.length === 0 ? (
        <div className="text-center py-10 text-[var(--theme-secondary-text)]/40 text-xs">
          Bekleyen davet veya başvuru yok.
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

type CombinedFeedItem =
  | { kind: 'announcement'; item: Announcement; createdAt: string }
  | { kind: 'event'; item: Announcement; createdAt: string }
  | { kind: 'invite'; item: JoinRequestListItem; createdAt: string };

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  currentUser: User;
  serverId?: string;
  canViewInviteApplications?: boolean;
  onOpenInviteApplications?: () => void;
}

type Tab = 'all' | 'announcement' | 'event' | 'invites';

export default function AnnouncementsPanel({
  currentUser,
  serverId,
  canViewInviteApplications = false,
  onOpenInviteApplications,
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<AnnouncementType>('announcement');
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [toast, setToast] = useState<string | null>(null);

  const canManage = currentUser.isAdmin || currentUser.isModerator;
  const isAdmin = currentUser.isAdmin;
  const showInvitesTab = !!serverId && canViewInviteApplications;
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
    if (activeTab === 'invites' && !showInvitesTab) setActiveTab('all');
  }, [activeTab, showInvitesTab]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ── Fetch ──
  const fetchAnnouncements = useCallback(async () => {
    const { data } = await getAnnouncements();
    if (data) setAnnouncements(data as Announcement[]);
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

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

  const canEditItem = (a: Announcement) => isAdmin || a.author_id === currentUser.id;

  // ── Filter ──
  const filtered = activeTab === 'all'
    ? announcements
    : activeTab === 'invites'
      ? []
    : announcements.filter(a => a.type === activeTab);

  const pinned = filtered.find(a => a.is_pinned);
  const rest = filtered.filter(a => a !== pinned);
  const combinedItems: CombinedFeedItem[] = activeTab === 'all'
    ? [
        ...announcements.map(a => ({
          kind: a.type === 'event' ? 'event' as const : 'announcement' as const,
          item: a,
          createdAt: a.created_at,
        })),
        ...(showInvitesTab
          ? pendingJoinRequests.map(it => ({
              kind: 'invite' as const,
              item: it,
              createdAt: it.createdAt,
            }))
          : []),
      ].sort((a, b) => {
        const bt = new Date(b.createdAt).getTime();
        const at = new Date(a.createdAt).getTime();
        return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
      })
    : [];

  const announcementCount = announcements.filter(a => a.type === 'announcement').length;
  const eventCount = announcements.filter(a => a.type === 'event').length;

  if (announcements.length === 0 && !canManage && !showInvitesTab) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-8 px-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[var(--theme-panel)]/60 rounded-lg p-0.5 border border-[var(--theme-border)]/20">
          {([
            { id: 'all' as Tab, label: 'Tümü', count: announcements.length },
            { id: 'announcement' as Tab, label: 'Duyurular', count: announcementCount },
            { id: 'event' as Tab, label: 'Etkinlikler', count: eventCount },
            ...(showInvitesTab ? [{
              id: 'invites' as Tab,
              label: 'Davetler',
              count: pendingJoinRequestCount,
              icon: <UserCheck size={11} />,
            }] : []),
          ]).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[var(--theme-surface)] text-[var(--theme-text)] shadow-sm'
                  : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-secondary-text)]'
              }`}
            >
              {'icon' in tab && tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? 'bg-[rgba(var(--theme-accent-rgb),0.16)] text-[var(--theme-accent)]'
                    : 'bg-[var(--theme-border)]/20 text-[var(--theme-secondary-text)]/50'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {canManage && (
          <AddMenu onSelect={(type) => { setEditTarget(null); setModalType(type); setModalOpen(true); }} />
        )}
      </div>

      {/* Empty state */}
      {activeTab !== 'invites' && (activeTab === 'all' ? combinedItems.length === 0 : filtered.length === 0) && (
        <div className="text-center py-12 text-[var(--theme-secondary-text)]/40 text-xs">
          {canManage
            ? (activeTab === 'event' ? 'Henüz etkinlik yok. İlk etkinliği siz ekleyin.' : activeTab === 'announcement' ? 'Henüz duyuru yok. İlk duyuruyu siz ekleyin.' : 'Henüz içerik yok.')
            : 'Henüz içerik yok.'
          }
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {activeTab === 'invites' ? (
          <InviteApplicationsFeed
            items={joinRequestItems}
            error={joinRequestError}
            busyId={joinRequestBusyId}
            onAccept={acceptJoinRequest}
            onReject={rejectJoinRequest}
            onManage={onOpenInviteApplications ?? (() => undefined)}
          />
        ) : activeTab === 'all' ? (
          <AnimatePresence mode="popLayout">
            {combinedItems.map(entry => {
              if (entry.kind === 'invite') {
                const it = entry.item;
                const hasAvatar = typeof it.userAvatar === 'string' && it.userAvatar.startsWith('http');
                const busy = joinRequestBusyId !== null;
                return (
                  <motion.div
                    key={`invite-${it.id}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)]/30 bg-[var(--theme-surface)]/50 hover:bg-[var(--theme-surface)]/80 p-4 transition-colors"
                  >
                    <div
                      className="shrink-0 w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center"
                      style={{ background: 'rgba(var(--glass-tint), 0.055)' }}
                    >
                      {hasAvatar
                        ? <img src={it.userAvatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        : <span className="text-[10px] font-bold text-[var(--theme-secondary-text)]/70">{(it.userName[0] ?? '?').toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--theme-text)] truncate">{it.userName}</div>
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-[0.08em]"
                          style={{
                            background: 'rgba(var(--glass-tint), 0.045)',
                            color: 'rgba(var(--theme-accent-rgb), 0.72)',
                            border: '1px solid rgba(var(--glass-tint), 0.08)',
                          }}
                        >
                          Davet
                        </span>
                      </div>
                      <div className="text-[9px] text-[var(--theme-secondary-text)]/55 flex items-center gap-1.5">
                        <Clock size={9} />
                        <span>{formatDate(it.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => rejectJoinRequest(it.id)}
                        disabled={busy}
                        title="Reddet"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-red-300/80 disabled:opacity-35 transition-all duration-[120ms] ease-out hover:scale-[1.05] disabled:hover:scale-100"
                        style={{
                          background: 'rgba(239, 68, 68, 0.055)',
                          border: '1px solid rgba(248, 113, 113, 0.12)',
                          boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)',
                        }}
                        onMouseEnter={(e) => {
                          if (busy) return;
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.10)';
                          e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.20)';
                          e.currentTarget.style.boxShadow = '0 4px 10px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(var(--glass-tint), 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.055)';
                          e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.12)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)';
                        }}
                      >
                        <X size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => acceptJoinRequest(it.id)}
                        disabled={busy}
                        title="Kabul Et"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-300/85 disabled:opacity-35 transition-all duration-[120ms] ease-out hover:scale-[1.05] disabled:hover:scale-100"
                        style={{
                          background: 'rgba(16, 185, 129, 0.06)',
                          border: '1px solid rgba(52, 211, 153, 0.13)',
                          boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)',
                        }}
                        onMouseEnter={(e) => {
                          if (busy) return;
                          e.currentTarget.style.background = 'rgba(16, 185, 129, 0.11)';
                          e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.22)';
                          e.currentTarget.style.boxShadow = '0 4px 10px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(var(--glass-tint), 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(16, 185, 129, 0.06)';
                          e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.13)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--glass-tint), 0.06)';
                        }}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              }

              const a = entry.item;
              return (
                <React.Fragment key={`${entry.kind}-${a.id}`}>
                  {entry.kind === 'event'
                    ? <EventCard item={a} canEdit={canManage && canEditItem(a)} onEdit={() => { setEditTarget(a); setModalType(a.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(a)} />
                    : <AnnouncementCard item={a} canEdit={canManage && canEditItem(a)} onEdit={() => { setEditTarget(a); setModalType(a.type); setModalOpen(true); }} onDelete={() => setDeleteTarget(a)} />
                  }
                </React.Fragment>
              );
            })}
          </AnimatePresence>
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
  );
}
