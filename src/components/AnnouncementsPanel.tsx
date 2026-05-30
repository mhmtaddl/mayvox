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
import type { ModalData } from './announcements/AnnouncementModals';
import AvatarContent from './AvatarContent';

const RecommendationsTab = React.lazy(() => import('./recommendations/RecommendationsTab'));
const AnnouncementItemModal = React.lazy(() => import('./announcements/AnnouncementModals').then(module => ({ default: module.ItemModal })));
const AnnouncementDeleteConfirm = React.lazy(() => import('./announcements/AnnouncementModals').then(module => ({ default: module.DeleteConfirm })));
const AnnouncementRulesModal = React.lazy(() => import('./announcements/AnnouncementExtraModals').then(module => ({ default: module.RulesModal })));
const StreamAddModal = React.lazy(() => import('./announcements/AnnouncementExtraModals').then(module => ({ default: module.StreamAddModal })));

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
          <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[rgba(var(--glass-tint),0.055)] ring-1 ring-[rgba(var(--glass-tint),0.10)]">
            <AvatarContent
              avatar={item.createdByAvatar}
              statusText="Çevrimdışı"
              firstName={authorName}
              name={authorName}
              imgClassName="h-full w-full object-cover"
              letterClassName="text-[8px] font-semibold text-[var(--theme-text)]/70"
            />
          </span>
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
  mobilePhoneLayout?: boolean;
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
  mobilePhoneLayout = false,
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
    const candidates = channels
      .filter(channel => channel.id)
      .slice(0, mobileTabletLayout ? 8 : 16);
    const eventLimit = mobileTabletLayout ? 40 : 75;
    const loadRoomActivity = () => {
      void Promise.allSettled(
        candidates.map(async channel => {
          const events = await listRoomActivityEvents(serverId, channel.id, eventLimit);
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
    };
    const delay = mobileTabletLayout ? 650 : 0;
    const timeoutId = window.setTimeout(loadRoomActivity, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canViewRoomActivity, channels, mobileTabletLayout, serverId]);

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
  const { announcementItems, eventItems } = useMemo(() => {
    const nextAnnouncementItems: Announcement[] = [];
    const nextEventItems: Announcement[] = [];
    for (const item of announcements) {
      if (item.type === 'announcement') nextAnnouncementItems.push(item);
      else if (item.type === 'event') nextEventItems.push(item);
    }
    const sortByRecentUpdate = (a: Announcement, b: Announcement) =>
      timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at);
    nextAnnouncementItems.sort(sortByRecentUpdate);
    nextEventItems.sort(sortByRecentUpdate);
    return {
      announcementItems: nextAnnouncementItems,
      eventItems: nextEventItems,
    };
  }, [announcements]);

  const filtered = !activeTab || activeTab === 'invites' || activeTab === 'recommendations'
    ? []
    : activeTab === 'announcement'
      ? announcementItems
      : activeTab === 'event'
        ? eventItems
        : announcements.filter(a => a.type === activeTab);

  const pinned = filtered.find(a => a.is_pinned);
  const rest = filtered.filter(a => a !== pinned);

  const announcementCount = announcementItems.length;
  const eventCount = eventItems.length;
  const recommendationPreviewCount = String(recommendationPreviewItems.length);
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
    const pinnedAnnouncement = announcementItems.find(a => a.is_pinned) ?? null;
    const now = Date.now();
    const upcoming = eventItems
      .filter(a => timeValue(a.event_date) >= now - 60_000)
      .sort((a, b) => timeValue(a.event_date) - timeValue(b.event_date));
    const latestRecommendation = [...recommendationPreviewItems]
      .sort((a, b) => timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt))[0] ?? null;
    let latestMember: ServerMember | null = null;
    let latestMemberTime = 0;
    for (const member of serverMembers) {
      const joinedAt = timeValue(member.joinedAt);
      if (joinedAt > latestMemberTime) {
        latestMember = member;
        latestMemberTime = joinedAt;
      }
    }
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
    announcementItems,
    canViewRoomActivity,
    dismissedActivityKeys,
    eventItems,
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
      actionLabel: 'Ekle',
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
      actionLabel: 'Oluştur',
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
      actionLabel: 'Ekle',
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
      actionLabel: streamModalChecking ? 'Kontrol' : 'Ekle',
      actionIcon: PlusCircle,
      onAction: openStreamAdd,
    }] : []),
    ...(showInvitesTab ? [{
      label: 'Başvuru',
      value: pendingJoinRequestCount,
      tab: 'invites' as Tab,
      icon: UserCheck,
      accentRgb: '56, 189, 248',
      action: mobileTabletLayout ? 'Davetleri Yönet' : 'Başvurular',
      actionLabel: 'Başvurular',
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
      className={mobileTabletLayout ? 'flex h-full min-h-0 w-full touch-pan-y flex-col overflow-hidden px-3 pt-0' : 'w-full max-w-5xl mx-auto mt-4 mb-[calc(var(--mv-content-bottom-reserve)+0.75rem)] px-4 sm:px-5 pb-8'}
      onTouchStart={mobileTabletLayout ? event => setMobileTouchStart({ x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 }) : undefined}
      onTouchEnd={mobileTabletLayout ? handleMobileSummaryTouchEnd : undefined}
      onTouchCancel={mobileTabletLayout ? () => setMobileTouchStart(null) : undefined}
    >
      <section className={mobileTabletLayout ? 'z-10 mb-2 shrink-0 px-0 pb-0.5 pt-0' : 'mb-3 overflow-hidden rounded-[18px] border border-[rgba(var(--glass-tint),0.052)] bg-[rgba(var(--glass-tint),0.022)] p-3 shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.035)] sm:p-3.5'}>
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
            className={mobileTabletLayout ? `mx-auto flex w-full min-w-0 touch-pan-y snap-x justify-center overflow-x-auto pb-1 custom-scrollbar ${mobilePhoneLayout ? 'gap-1 px-0.5' : 'gap-1.5'}` : 'grid min-w-0 flex-1 gap-2'}
            style={mobileTabletLayout ? undefined : { gridTemplateColumns: summaryGridTemplate }}
          >
              {summaryMetrics.map(metric => {
                const Icon = metric.icon;
                const ActionIcon = metric.actionIcon;
                const isActive = metric.tab ? activeTab === metric.tab : false;
                const mobileActionLabel = metric.actionLabel;
                return (
                  <div
                    key={metric.label}
                    style={{
                      '--section-accent': metric.accentRgb,
                    } as React.CSSProperties}
                    className={`group min-w-0 border transition-all duration-200 ${mobileTabletLayout ? `flex ${mobilePhoneLayout ? 'h-[62px] min-w-[62px] flex-1 basis-0 px-1' : 'h-[60px] min-w-0 flex-1 basis-0 px-1.5'} snap-start items-stretch rounded-[12px] py-1` : useCompactServerHome ? 'rounded-[12px] px-1.5 py-1.5' : 'rounded-[14px] px-2 py-2'} ${
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
                      className={`flex w-full text-left ${mobileTabletLayout ? 'h-full flex-col items-stretch justify-between gap-0.5' : 'items-start justify-between gap-2'} ${metric.tab ? '' : 'cursor-default'}`}
                    >
                      {mobileTabletLayout ? (
                        <>
                          <span className={`flex w-full min-w-0 items-center justify-center gap-0.5 truncate text-center font-black leading-none transition-colors ${mobilePhoneLayout ? 'text-[8px]' : 'text-[9px]'} ${isActive ? 'text-[rgb(var(--section-accent))]' : 'text-[var(--theme-text)] group-hover:text-[rgb(var(--section-accent))]'}`}>
                            <Icon size={mobilePhoneLayout ? 8.5 : 9.5} className="shrink-0 text-[rgb(var(--section-accent))]/82" />
                            <span className="min-w-0 truncate">{metric.label}</span>
                          </span>
                          <span className={`w-full text-center font-black leading-none tabular-nums text-[rgb(var(--section-accent))] ${mobilePhoneLayout ? 'text-[11px]' : 'text-[12px]'}`}>
                            {metric.value}
                          </span>
                          {metric.action ? (
                            <span
                              onClick={(event) => {
                                event.stopPropagation();
                                metric.onAction();
                              }}
                              className={`mx-auto inline-flex max-w-full shrink-0 items-center justify-center gap-0.5 rounded-[7px] border border-[rgba(var(--section-accent),0.16)] bg-[rgba(var(--section-accent),0.045)] px-1 font-black leading-none text-[rgb(var(--section-accent))] ${mobilePhoneLayout ? 'h-4 text-[7px]' : 'h-5 text-[8px]'}`}
                              aria-label={metric.action}
                              title={metric.action}
                            >
                              <PlusCircle size={mobilePhoneLayout ? 7.5 : 8.5} strokeWidth={2.5} className="shrink-0 opacity-82" />
                              <span className="truncate">{mobileActionLabel}</span>
                            </span>
                          ) : (
                            <span className="h-5" aria-hidden="true" />
                          )}
                        </>
                      ) : (
                        <span className={`min-w-0 ${mobilePhoneLayout ? 'flex-none' : 'flex-1'}`}>
                          <span className={`block font-semibold leading-none transition-colors ${mobilePhoneLayout ? 'text-[11px]' : useCompactServerHome ? 'text-[14px]' : 'text-[16px]'} ${isActive ? 'text-[rgb(var(--section-accent))]' : 'text-[var(--theme-text)] group-hover:text-[rgb(var(--section-accent))]'}`}>{metric.value}</span>
                          <span className={`mt-0.5 flex min-w-0 items-center gap-1 truncate font-medium transition-colors ${mobilePhoneLayout ? 'justify-center text-[7.5px]' : useCompactServerHome ? 'text-[8.5px]' : 'text-[9.5px]'} ${isActive ? 'text-[rgb(var(--section-accent))]/80' : 'text-[var(--theme-secondary-text)]/55 group-hover:text-[rgb(var(--section-accent))]/72'}`}>
                            <span className="truncate">{metric.label}</span>
                          </span>
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
                        className={`inline-flex max-w-full items-center justify-center gap-1.5 border border-[rgba(var(--section-accent),0.16)] bg-[rgba(var(--section-accent),0.045)] font-semibold text-[rgb(var(--section-accent))] shadow-[inset_0_1px_0_rgba(var(--glass-tint),0.035)] transition-colors hover:border-[rgba(var(--section-accent),0.28)] hover:bg-[rgba(var(--section-accent),0.085)] ${useCompactServerHome ? 'mt-1.5 h-6 rounded-[9px] px-2 text-[9px]' : 'mt-2 h-7 rounded-[10px] px-2.5 text-[10px]'}`}
                      >
                        <ActionIcon size={useCompactServerHome ? 10 : 12} strokeWidth={2.25} className="shrink-0 opacity-85" />
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
          gridTemplateColumns: mobilePhoneLayout
            ? '1fr'
            : useCompactServerHome
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
          gridTemplateColumns: mobilePhoneLayout
            ? '1fr'
            : useCompactServerHome
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
        <React.Suspense fallback={null}>
          <AnimatePresence>
            <StreamAddModal
              saving={streamModalSaving}
              streamPreviewItems={streamPreviewItems}
              quickTwitchName={quickTwitchName}
              quickTwitchUrl={quickTwitchUrl}
              quickYoutubeName={quickYoutubeName}
              quickYoutubeUrl={quickYoutubeUrl}
              onClose={() => setStreamAddModalOpen(false)}
              onQuickTwitchNameChange={setQuickTwitchName}
              onQuickTwitchUrlChange={setQuickTwitchUrl}
              onQuickYoutubeNameChange={setQuickYoutubeName}
              onQuickYoutubeUrlChange={setQuickYoutubeUrl}
              onAdd={(platform, channelUrl, channelName) => void handleQuickAddStream(platform, channelUrl, channelName)}
            />
          </AnimatePresence>
        </React.Suspense>,
        document.body,
      )}

      {rulesModalOpen && createPortal(
        <React.Suspense fallback={null}>
          <AnimatePresence>
            <AnnouncementRulesModal
              open={rulesModalOpen}
              serverName={welcomeServerName}
              rules={allRuleItems}
              onClose={() => setRulesModalOpen(false)}
            />
          </AnimatePresence>
        </React.Suspense>,
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
        <React.Suspense fallback={null}>
          <AnnouncementItemModal
            open={modalOpen}
            onClose={() => { setModalOpen(false); setEditTarget(null); }}
            onSubmit={handleSubmit}
            initial={editTarget}
            initialType={modalType}
            loading={loading}
          />
        </React.Suspense>,
        document.body,
      )}
      {!!deleteTarget && createPortal(
        <React.Suspense fallback={null}>
          <AnnouncementDeleteConfirm
            open={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            loading={loading}
          />
        </React.Suspense>,
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
