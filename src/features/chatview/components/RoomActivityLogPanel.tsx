import {
  CheckCircle,
  Clock3,
  DoorOpen,
  Flag,
  History,
  Lock,
  Mic,
  MicOff,
  MessageSquare,
  MessageSquareOff,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { RoomActivityItem, RoomActivityType } from '../hooks/useRoomActivityLog';

interface Props {
  activities: RoomActivityItem[];
  onCollapse: () => void;
  onSelectActivity?: (item: RoomActivityItem) => void;
  onClear?: () => void;
  canClear?: boolean;
  clearing?: boolean;
}

function formatRelativeTime(createdAt: number): string {
  const diff = Math.max(0, Date.now() - createdAt);
  if (diff < 45_000) return 'şimdi';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  return `${hours} sa önce`;
}

function ActivityIcon({ type }: { type: RoomActivityType }) {
  const common = { size: 13, strokeWidth: 2.1 };
  if (type === 'join') return <UserPlus {...common} />;
  if (type === 'leave') return <UserMinus {...common} />;
  if (type === 'chat_lock') return <Lock {...common} />;
  if (type === 'chat_unlock') return <MessageSquare {...common} />;
  if (type === 'chat_clear') return <Trash2 {...common} />;
  if (type === 'automod') return <ShieldAlert {...common} />;
  if (type === 'voice_mute') return <MicOff {...common} />;
  if (type === 'voice_unmute') return <Mic {...common} />;
  if (type === 'timeout') return <Clock3 {...common} />;
  if (type === 'timeout_clear') return <CheckCircle {...common} />;
  if (type === 'room_kick') return <DoorOpen {...common} />;
  if (type === 'chat_ban') return <MessageSquareOff {...common} />;
  if (type === 'chat_unban') return <MessageSquare {...common} />;
  if (type === 'message_delete') return <Trash2 {...common} />;
  if (type === 'message_edit') return <PencilLineIcon />;
  if (type === 'message_report') return <Flag {...common} />;
  return <History {...common} />;
}

function activityTone(type: RoomActivityType): { color: string; border: string } {
  if (type === 'join' || type === 'chat_unlock' || type === 'voice_unmute' || type === 'timeout_clear' || type === 'chat_unban') {
    return {
      color: 'rgb(45, 212, 191)',
      border: 'rgba(45, 212, 191, 0.20)',
    };
  }
  if (type === 'chat_lock' || type === 'voice_mute' || type === 'message_report') {
    return {
      color: 'rgb(251, 191, 36)',
      border: 'rgba(251, 191, 36, 0.20)',
    };
  }
  if (type === 'chat_clear' || type === 'automod' || type === 'room_kick' || type === 'chat_ban' || type === 'timeout' || type === 'message_delete' || type === 'message_edit') {
    return {
      color: 'rgb(251, 113, 133)',
      border: 'rgba(251, 113, 133, 0.22)',
    };
  }
  return {
    color: 'rgba(var(--glass-tint), 0.62)',
    border: 'rgba(var(--glass-tint), 0.10)',
  };
}

function PencilLineIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export default function RoomActivityLogPanel({ activities, onCollapse, onSelectActivity, onClear, canClear = false, clearing = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestActivityId = activities[activities.length - 1]?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [activities.length, latestActivityId]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar px-2.5 py-2.5">
        <div className="flex-1" />
        {activities.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center px-3 pb-8 pt-4 text-center">
            <p className="text-[12px] font-semibold text-[var(--theme-text)]/74">Bu odada henüz olay yok</p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--theme-secondary-text)]/52">Katılım ve oda aksiyonları burada görünür.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activities.map(item => {
              const tone = activityTone(item.type);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectActivity?.(item)}
                  disabled={!item.messageId}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-lg border-l px-2.5 py-1.5 text-left transition-[background,opacity] duration-150 ${item.messageId ? 'hover:bg-[rgba(var(--glass-tint),0.045)]' : 'cursor-default'}`}
                  style={{
                    background: item.type === 'message_report' ? 'rgba(251,191,36,0.035)' : 'rgba(var(--glass-tint),0.016)',
                    borderLeftColor: item.type === 'message_report' ? 'rgba(251,191,36,0.48)' : tone.border,
                  }}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center ${item.type === 'message_report' ? 'mv-report-flag-attention' : ''}`}
                    style={{ color: tone.color }}
                  >
                    <ActivityIcon type={item.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-[var(--theme-text)]/88">{item.label}</span>
                    <span className="block text-[9px] text-[var(--theme-secondary-text)]/50">{formatRelativeTime(item.createdAt)}</span>
                  </span>
                  {item.type === 'message_report' && (item.reportCount ?? 1) > 1 && (
                    <span className="shrink-0 rounded-full bg-amber-300/18 px-1.5 py-0.5 text-[9px] font-bold text-amber-200 ring-1 ring-amber-300/25">
                      x{item.reportCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="flex h-[53px] shrink-0 items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(var(--glass-tint), 0.028)', borderTop: '1px solid rgba(var(--glass-tint), 0.045)', boxShadow: 'none', backgroundImage: 'none' }}
      >
        <button
          type="button"
          onClick={onCollapse}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--theme-accent)] opacity-82 transition-[color,opacity,transform] duration-150 hover:opacity-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.22)]"
          aria-label="Son olayları kapat"
        >
          <History size={13} strokeWidth={2.1} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--theme-text)]/82">
          SON OLAYLAR
        </span>
        {canClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearing || activities.length === 0}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--theme-text)]/54 opacity-82 transition-[color,opacity,transform] duration-150 hover:text-[rgb(251,113,133)] hover:opacity-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-28 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.22)]"
            aria-label="Son olayları temizle"
            title="Son olayları temizle"
          >
            <Trash2 size={13} strokeWidth={2.1} />
          </button>
        )}
      </div>
    </aside>
  );
}
