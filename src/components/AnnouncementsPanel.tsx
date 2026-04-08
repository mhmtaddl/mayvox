import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Pin, Megaphone, Plus, Edit2, Trash2, X, AlertTriangle, AlertCircle,
  Calendar, Clock, Users, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Announcement, AnnouncementPriority, AnnouncementType } from '../types';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  supabase,
} from '../lib/supabase';

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

const inputCls = 'w-full rounded-lg border border-[var(--theme-border)]/40 bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:outline-none focus:border-[var(--theme-accent)]/50 transition-colors';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-[var(--theme-secondary-text)] mb-1.5';

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

const ItemModal = ({ open, onClose, onSubmit, initial, initialType, loading }: ModalProps) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [type, setType] = useState<AnnouncementType>('announcement');
  const [eventDate, setEventDate] = useState('');
  const [participationTime, setParticipationTime] = useState('');
  const [participationReqs, setParticipationReqs] = useState('');

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setContent(initial.content);
      setPriority(initial.priority);
      setIsPinned(initial.is_pinned);
      setType(initial.type);
      setEventDate(initial.event_date ? new Date(initial.event_date).toISOString().slice(0, 16) : '');
      setParticipationTime(initial.participation_time || '');
      setParticipationReqs(initial.participation_requirements || '');
    } else {
      setTitle('');
      setContent('');
      setPriority('normal');
      setIsPinned(false);
      setType(initialType);
      setEventDate('');
      setParticipationTime('');
      setParticipationReqs('');
    }
  }, [initial, initialType, open]);

  if (!open) return null;

  const isEvent = type === 'event';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-[var(--theme-border)]/50 bg-[var(--theme-surface)] shadow-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--theme-border)]/30 shrink-0">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Etkinlik Tarihi</label>
                  <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} className={`${inputCls} text-xs`} />
                </div>
                <div>
                  <label className={labelCls}>Katılım Saati</label>
                  <input type="text" value={participationTime} onChange={e => setParticipationTime(e.target.value)} maxLength={50} className={inputCls} placeholder="ör: 20:00 - 22:00" />
                </div>
              </div>
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
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--theme-border)]/30 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)]/20 transition-colors">
            İptal
          </button>
          <button
            type="button"
            disabled={!title.trim() || loading}
            onClick={() => onSubmit({
              title: title.trim(),
              content: content.trim(),
              priority,
              is_pinned: isPinned,
              type,
              event_date: isEvent && eventDate ? new Date(eventDate).toISOString() : null,
              participation_time: isEvent ? participationTime.trim() || null : null,
              participation_requirements: isEvent ? participationReqs.trim() || null : null,
            })}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 ${
              isEvent ? 'bg-violet-500' : 'bg-[var(--theme-accent)]'
            }`}
          >
            {loading ? 'Kaydediliyor...' : initial ? 'Güncelle' : 'Yayınla'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Delete confirm ──────────────────────────────────────────────────────────

const DeleteConfirm = ({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-[var(--theme-border)]/50 bg-[var(--theme-surface)] shadow-2xl p-5"
      >
        <p className="text-sm text-[var(--theme-text)] mb-4">Bu öğeyi silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--theme-secondary-text)] hover:bg-[var(--theme-border)]/20 transition-colors">İptal</button>
          <button type="button" disabled={loading} onClick={onConfirm} className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-40">
            {loading ? 'Siliniyor...' : 'Sil'}
          </button>
        </div>
      </motion.div>
    </div>
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
        ? 'bg-gradient-to-br from-[var(--theme-surface)] to-[var(--theme-bg)] p-5'
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
        ? 'bg-gradient-to-br from-violet-500/5 via-[var(--theme-surface)] to-[var(--theme-bg)] p-5'
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

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  currentUser: User;
}

type Tab = 'all' | 'announcement' | 'event';

export default function AnnouncementsPanel({ currentUser }: Props) {
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ── Fetch ──
  const fetchAnnouncements = useCallback(async () => {
    const { data } = await getAnnouncements();
    if (data) setAnnouncements(data as Announcement[]);
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase
      .channel('announcements-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAnnouncements();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAnnouncements]);

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
          author_name: currentUser.name,
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
    : announcements.filter(a => a.type === activeTab);

  const pinned = filtered.find(a => a.is_pinned);
  const rest = filtered.filter(a => a !== pinned);

  const announcementCount = announcements.filter(a => a.type === 'announcement').length;
  const eventCount = announcements.filter(a => a.type === 'event').length;

  if (announcements.length === 0 && !canManage) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-8 px-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[var(--theme-bg)]/60 rounded-lg p-0.5 border border-[var(--theme-border)]/20">
          {([
            { id: 'all' as Tab, label: 'Tümü', count: announcements.length },
            { id: 'announcement' as Tab, label: 'Duyurular', count: announcementCount },
            { id: 'event' as Tab, label: 'Etkinlikler', count: eventCount },
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
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id
                    ? 'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)]'
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
      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--theme-secondary-text)]/40 text-xs">
          {canManage
            ? (activeTab === 'event' ? 'Henüz etkinlik yok. İlk etkinliği siz ekleyin.' : activeTab === 'announcement' ? 'Henüz duyuru yok. İlk duyuruyu siz ekleyin.' : 'Henüz içerik yok.')
            : 'Henüz içerik yok.'
          }
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
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
      </div>

      {/* Modals */}
      <ItemModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSubmit={handleSubmit}
        initial={editTarget}
        initialType={modalType}
        loading={loading}
      />
      <DeleteConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={loading}
      />

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
