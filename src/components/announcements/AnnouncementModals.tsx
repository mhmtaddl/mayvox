import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Calendar, Clock, Megaphone, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { Announcement, AnnouncementPriority, AnnouncementType } from '../../types';

const inputCls = 'w-full h-8 rounded-xl px-3 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/35 focus:outline-none transition-all border border-[rgba(var(--glass-tint),0.07)] bg-[rgba(var(--shadow-base),0.13)] focus:border-[rgba(var(--theme-accent-rgb),0.34)] focus:shadow-[0_0_0_3px_rgba(var(--theme-accent-rgb),0.07),inset_0_1px_0_rgba(var(--glass-tint),0.045)]';
const labelCls = 'block text-[10px] font-medium text-[var(--theme-secondary-text)]/72 mb-1';
const modalPanelCls = 'rounded-2xl border border-[rgba(var(--glass-tint),0.065)] bg-[var(--theme-panel)]';
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export interface ModalData {
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

function CalendarPicker({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const today = new Date();
  const selected = value ? new Date(value + 'T00:00') : null;
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay() || 7;
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
        {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map(d => <span key={d} className="text-[9px] font-bold text-[var(--theme-secondary-text)]/50 py-1">{d}</span>)}
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
              key={day}
              type="button"
              disabled={isPast}
              onClick={() => { onChange(dateStr); onClose(); }}
              className={`w-8 h-8 rounded-lg text-[11px] font-semibold transition-all ${
                isSel ? 'bg-[var(--theme-accent)] text-white' :
                  isToday ? 'text-[var(--theme-accent)] border border-[var(--theme-accent)]/30' :
                    isPast ? 'text-[var(--theme-secondary-text)]/20 cursor-default' :
                      'text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)]'
              }`}
            >
              {day}
            </button>
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
  const apply = () => { onChange(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`); onClose(); };

  return (
    <div className="p-4 rounded-xl border w-[200px]" style={{ background: 'var(--theme-popover-bg, var(--popover-bg, var(--surface-elevated)))', borderColor: 'var(--popover-border)', boxShadow: 'none', color: 'var(--popover-text)' }} onClick={e => e.stopPropagation()}>
      <p className="text-[10px] font-bold text-[var(--theme-secondary-text)]/70 uppercase tracking-wider mb-3 text-center">Saat Seç</p>
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex flex-col items-center">
          <button type="button" onClick={() => setHour(p => (p + 1) % 24)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9650;</button>
          <span className="text-2xl font-bold text-[var(--theme-text)] tabular-nums w-10 text-center">{String(hour).padStart(2, '0')}</span>
          <button type="button" onClick={() => setHour(p => (p - 1 + 24) % 24)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9660;</button>
        </div>
        <span className="text-2xl font-bold text-[var(--theme-text)]/40">:</span>
        <div className="flex flex-col items-center">
          <button type="button" onClick={() => setMinute(p => (p + 5) % 60)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9650;</button>
          <span className="text-2xl font-bold text-[var(--theme-text)] tabular-nums w-10 text-center">{String(minute).padStart(2, '0')}</span>
          <button type="button" onClick={() => setMinute(p => (p - 5 + 60) % 60)} className="w-10 h-7 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)] hover:bg-[rgba(var(--glass-tint),0.06)] text-xs">&#9660;</button>
        </div>
      </div>
      <button type="button" onClick={apply} className="w-full py-1.5 rounded-lg btn-primary text-xs font-bold active:scale-[0.97]">Tamam</button>
    </div>
  );
}

export const ItemModal = ({ open, onClose, onSubmit, initial, initialType, loading }: ModalProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [type, setType] = useState<AnnouncementType>('announcement');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
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
        setEventDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        setEventTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } else {
        setEventDate('');
        setEventTime('');
      }
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[520] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-[1.5px]" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-[760px] max-h-[92vh] overflow-y-auto rounded-[24px] border border-[var(--theme-border)]/18 p-3"
        style={{ background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.018), rgba(var(--glass-tint),0.006)), var(--theme-bg)', color: 'var(--theme-text)', boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(var(--theme-accent-rgb),0.13)] bg-[rgba(var(--theme-accent-rgb),0.07)] px-2.5 py-1 text-[10px] font-semibold text-[var(--theme-accent)]">
              {isEvent ? <Calendar size={12} /> : <Megaphone size={12} />}
              {isEvent ? 'Etkinlik' : 'Duyuru'}
            </div>
            <p className="truncate text-[12px] text-[var(--theme-secondary-text)]/68">
              {initial ? (isEvent ? 'Etkinlik bilgilerini güncelle.' : 'Duyuru içeriğini güncelle.') : (isEvent ? 'Sunucu için yeni bir etkinlik paylaş.' : 'Sunucu için yeni bir duyuru paylaş.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.045)] hover:text-[var(--theme-text)]">
            <X size={16} />
          </button>
        </div>

        <div className={`${modalPanelCls} p-3 space-y-3`}>
          <div>
            <label className={labelCls}>{isEvent ? 'Etkinlik Adı' : 'Başlık'}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className={inputCls} placeholder={isEvent ? 'Etkinlik adı...' : 'Duyuru başlığı...'} />
          </div>
          <div>
            <label className={labelCls}>{isEvent ? 'Açıklama' : 'İçerik'}</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={3} className={`${inputCls} h-[74px] resize-none py-2 leading-5`} placeholder={isEvent ? 'Etkinlik açıklaması...' : 'Duyuru içeriği...'} />
          </div>

          {isEvent && (
            <>
              <div className="relative">
                <label className={labelCls}>Etkinlik Tarihi</label>
                <div className="relative">
                  <input type="text" readOnly value={eventDate ? new Date(eventDate + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} placeholder="Tarih seç..." onClick={() => { setShowCalendar(p => !p); setShowTimePicker(false); setShowPartTimePicker(false); }} className={`${inputCls} text-xs cursor-pointer pr-8`} />
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
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className={labelCls}>Etkinlik Saati</label>
                  <div className="relative">
                    <input type="text" readOnly value={eventTime || ''} placeholder="Saat seç..." onClick={() => { setShowTimePicker(p => !p); setShowCalendar(false); setShowPartTimePicker(false); }} className={`${inputCls} text-xs cursor-pointer pr-8`} />
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
                    <input type="text" readOnly value={participationTime || ''} placeholder="Saat seç..." onClick={() => { setShowPartTimePicker(p => !p); setShowCalendar(false); setShowTimePicker(false); }} className={`${inputCls} text-xs cursor-pointer pr-8`} />
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
              <div>
                <label className={labelCls}>Katılım Şartları</label>
                <input type="text" value={participationReqs} onChange={e => setParticipationReqs(e.target.value)} maxLength={200} className={inputCls} placeholder="ör: Mikrofon zorunlu, min. 1 haftalık üye" />
              </div>
            </>
          )}

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

          <label className="flex items-center gap-2.5 cursor-pointer">
            <button type="button" role="switch" aria-checked={isPinned} onClick={() => setIsPinned(!isPinned)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${isPinned ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isPinned ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </button>
            <span className="text-xs text-[var(--theme-secondary-text)]">Sabitle (öne çıkar)</span>
          </label>
        </div>

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

export const DeleteConfirm = ({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) => {
  if (!open) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
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
          <button type="button" onClick={onClose} disabled={loading} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/55 transition-colors hover:bg-[rgba(var(--glass-tint),0.05)] hover:text-[var(--theme-text)] disabled:opacity-45" title="Kapat">
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
