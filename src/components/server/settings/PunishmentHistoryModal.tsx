import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Shield, Search, History,
  MicOff, Clock, DoorOpen, MessageSquareOff, UserX, Ban, Zap,
  ChevronLeft, ChevronRight, RotateCcw,
} from 'lucide-react';
import {
  type ServerMember,
  type AuditLogItem,
  getAuditLog,
  resetMemberModerationHistory,
} from '../../../lib/serverService';
import { memberDisplayName, memberInitials, timeAgo } from './shared';

interface Props {
  serverId: string;
  member: ServerMember;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

// ── Audit log action → iç kind eşlemesi ──
type Kind =
  | 'mute' | 'timeout' | 'room_kick'
  | 'chat_ban' | 'kick' | 'ban'
  | 'auto_chat_ban';

interface KindDef {
  label: string;         // Rozet metni
  color: string;         // Dot/glow rengi (hex)
  rgb: string;           // rgba için
  icon: React.ReactNode;
  description: string;   // Kartın gövdesindeki açıklama
}

const KIND_DEF: Record<Kind, KindDef> = {
  mute:          { label: 'sustur',       color: '#fb923c', rgb: '251,146,60',  icon: <MicOff size={11} />,          description: 'Sesli sohbette susturuldu' },
  timeout:       { label: 'timeout',      color: '#a78bfa', rgb: '167,139,250', icon: <Clock size={11} />,           description: 'Zaman aşımı uygulandı' },
  room_kick:     { label: 'odadan',       color: '#fb923c', rgb: '251,146,60',  icon: <DoorOpen size={11} />,        description: 'Sesli odadan çıkarıldı' },
  chat_ban:      { label: 'yazma engeli', color: '#f472b6', rgb: '244,114,182', icon: <MessageSquareOff size={11} />, description: 'Yazma engeli uygulandı' },
  kick:          { label: 'kick',         color: '#f87171', rgb: '248,113,113', icon: <UserX size={11} />,           description: 'Sunucudan atıldı' },
  ban:           { label: 'ban',          color: '#ef4444', rgb: '239,68,68',   icon: <Ban size={11} />,             description: 'Sunucudan yasaklandı' },
  auto_chat_ban: { label: 'auto',         color: '#fbbf24', rgb: '251,191,36',  icon: <Zap size={11} />,             description: 'Otomatik yazma engeli uygulandı' },
};

const AUDIT_ACTIONS: readonly string[] = [
  'member.mute', 'member.timeout', 'member.room_kick',
  'member.chat_ban', 'member.kick', 'member.ban',
  'member.chat_ban.auto',
];

function actionToKind(action: string): Kind | null {
  if (action === 'member.chat_ban.auto') return 'auto_chat_ban';
  if (action === 'member.mute')         return 'mute';
  if (action === 'member.timeout')      return 'timeout';
  if (action === 'member.room_kick')    return 'room_kick';
  if (action === 'member.chat_ban')     return 'chat_ban';
  if (action === 'member.kick')         return 'kick';
  if (action === 'member.ban')          return 'ban';
  return null;
}

// ── Kart verisi (UI render için) ──
interface PunishEvent {
  id: string;
  kind: Kind;
  actorId: string;
  actorName: string;
  isAuto: boolean;
  createdAt: string;
  expiresAt: string | null;
  durationSeconds: number | null;
  reason: string | null;
  channel: string | null;
}

function meta<T>(m: Record<string, unknown> | null, key: string): T | null {
  if (!m) return null;
  const v = m[key];
  return (v === null || v === undefined) ? null : (v as T);
}

function toPunishEvent(a: AuditLogItem): PunishEvent | null {
  const kind = actionToKind(a.action);
  if (!kind) return null;
  const m = a.metadata;
  const expiresAt =
    meta<string>(m, 'expiresAt') ??
    meta<string>(m, 'until') ??
    null;
  const durationSeconds =
    meta<number>(m, 'durationSeconds') ??
    (meta<number>(m, 'durationMinutes') !== null ? (meta<number>(m, 'durationMinutes') as number) * 60 : null);
  const reason = meta<string>(m, 'reason');
  const channel = meta<string>(m, 'channelName') ?? meta<string>(m, 'channel');
  const isAuto = kind === 'auto_chat_ban' || a.actorId === 'system:auto-mod';
  return {
    id: a.id,
    kind,
    actorId: a.actorId,
    actorName: isAuto ? 'sistem' : (a.actorName || 'moderator'),
    isAuto,
    createdAt: a.createdAt,
    expiresAt,
    durationSeconds,
    reason,
    channel: channel ?? null,
  };
}

// ── Süre formatlayıcı (saniyeden okunur metin) ──
function formatDurationShort(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}sa ${mm}dk` : `${h} sa`;
  const d = Math.floor(h / 24);
  return `${d} gün`;
}

// ── Countdown (aktif cezanın kalan süresi) ──
function formatRemaining(expiresIso: string, nowMs: number): string {
  const exp = Date.parse(expiresIso);
  if (!Number.isFinite(exp)) return '';
  const diff = Math.max(0, Math.floor((exp - nowMs) / 1000));
  if (diff === 0) return 'bitti';
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}sa ${mm}dk`;
  }
  if (m === 0) return `${s}sn`;
  return `${m}dk ${s}sn`;
}

function absoluteTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Filter chip tanımları ──
interface ChipDef {
  key: string;
  label: string;
  match: (k: Kind) => boolean;
}
const FILTERS: readonly ChipDef[] = [
  { key: 'all',     label: 'Tümü',       match: ()   => true },
  { key: 'mute',    label: 'Sustur',     match: (k)  => k === 'mute' || k === 'timeout' },
  { key: 'ban',     label: 'Yazma engeli', match: (k) => k === 'chat_ban' || k === 'auto_chat_ban' },
  { key: 'kick',    label: 'Atıldı',     match: (k)  => k === 'room_kick' || k === 'kick' || k === 'ban' },
  { key: 'auto',    label: 'Auto Ceza',  match: (k)  => k === 'auto_chat_ban' },
];

const PAGE_SIZE = 15;

export default function PunishmentHistoryModal({ serverId, member, onClose, onToast }: Props) {
  const [events, setEvents] = useState<PunishEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fetchNonce, setFetchNonce] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  // 1s tick — aktif ceza countdown canlı aksın
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Esc + backdrop click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Audit log fetch (paralel, action başına)
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setErr(null);
    (async () => {
      try {
        const results = await Promise.all(
          AUDIT_ACTIONS.map(a => getAuditLog(serverId, { action: a, limit: 200 }).catch(() => [] as AuditLogItem[]))
        );
        if (cancelled) return;
        const merged: PunishEvent[] = [];
        for (const rs of results) {
          for (const log of rs) {
            if (log.resourceId !== member.userId) continue;
            const ev = toPunishEvent(log);
            if (ev) merged.push(ev);
          }
        }
        merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setEvents(merged);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Geçmiş yüklenemedi');
      }
    })();
    return () => { cancelled = true; };
  }, [serverId, member.userId, fetchNonce]);

  // Son 24 saatteki ihlal sayısı
  const violations24h = useMemo(() => {
    if (!events) return 0;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.filter(ev => Date.parse(ev.createdAt) >= cutoff).length;
  }, [events]);

  // Filter + search
  const filtered = useMemo(() => {
    if (!events) return [];
    const chip = FILTERS.find(f => f.key === filter) ?? FILTERS[0];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return events.filter(ev => {
      if (!chip.match(ev.kind)) return false;
      if (!q) return true;
      const hay = [
        KIND_DEF[ev.kind].label,
        KIND_DEF[ev.kind].description,
        ev.channel ?? '',
        ev.actorName,
        ev.reason ?? '',
      ].join(' ').toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [events, filter, search]);

  // Pagination
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Filter/search değişince sayfa 0'a dön
  useEffect(() => { setPage(0); }, [filter, search]);

  const displayName = memberDisplayName(member);
  const initials = memberInitials(member);

  const handleReset = async () => {
    if (resetting) return;
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setResetting(true);
    try {
      await resetMemberModerationHistory(serverId, member.userId);
      setFetchNonce(n => n + 1);
      onToast?.('Ceza geçmişi sıfırlandı');
    } catch (e: unknown) {
      onToast?.(e instanceof Error ? e.message : 'Sıfırlama başarısız');
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const body = (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.40)', animation: 'phmBackdropIn 160ms ease-out' }}
      onMouseDown={onClose}
    >
      <div
        className="surface-elevated relative w-full max-w-[720px] rounded-2xl overflow-hidden"
        style={{ animation: 'phmModalIn 220ms cubic-bezier(0.2,0.8,0.2,1)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.08)' }}
        >
          <HeaderAvatar src={member.avatar} initials={initials} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]/65">
              <History size={12} />
              Ceza Geçmişi
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 min-w-0">
              <span className="text-[15px] font-semibold text-[var(--theme-text)] truncate">{displayName}</span>
              <span className="text-[11.5px] text-[var(--theme-secondary-text)]/60 shrink-0">
                {events === null ? 'yükleniyor…' : `son 24 saatte ${violations24h} ihlal`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || events === null || events.length === 0}
            className={`shrink-0 w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${
              confirmReset
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)]'
            } disabled:opacity-30 disabled:pointer-events-none`}
            title={confirmReset ? 'Onaylamak için tekrar tıkla' : 'Ceza geçmişini sıfırla'}
            aria-label="Sıfırla"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg inline-flex items-center justify-center text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
            title="Kapat"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid rgba(var(--glass-tint), 0.06)' }}>
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/45" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ceza türü veya kanal ara…"
              className="w-full h-9 pl-9 pr-3 rounded-lg text-[12.5px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 outline-none transition-colors"
              style={{
                background: 'rgba(var(--glass-tint), 0.04)',
                border: '1px solid rgba(var(--glass-tint), 0.08)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(var(--theme-accent-rgb), 0.35)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(var(--glass-tint), 0.08)'; }}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="phmChip px-2.5 h-7 rounded-full text-[11px] font-semibold transition-all"
                  style={active ? {
                    background: 'rgba(var(--theme-accent-rgb), 0.14)',
                    color: 'var(--theme-accent)',
                    border: '1px solid rgba(var(--theme-accent-rgb), 0.30)',
                  } : {
                    background: 'transparent',
                    color: 'var(--theme-secondary-text)',
                    border: '1px solid rgba(var(--glass-tint), 0.08)',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Timeline list ── */}
        <div
          className="px-5 py-3 custom-scrollbar"
          style={{ maxHeight: 420, minHeight: 220, overflowY: 'auto' }}
        >
          {events === null && !err && (
            <div className="h-[220px] flex items-center justify-center text-[12px] text-[var(--theme-secondary-text)]/65">
              Yükleniyor…
            </div>
          )}
          {err && (
            <div className="h-[220px] flex items-center justify-center text-[12.5px] text-red-400">{err}</div>
          )}
          {events !== null && !err && filtered.length === 0 && (
            <EmptyState hasAny={events.length > 0} hasQuery={!!search.trim() || filter !== 'all'} />
          )}
          {events !== null && !err && paged.length > 0 && (
            <ul className="relative" style={{ paddingLeft: 22 }}>
              <div
                aria-hidden="true"
                className="absolute top-2 bottom-2 w-px"
                style={{
                  left: 9,
                  background: 'linear-gradient(to bottom, rgba(var(--glass-tint),0.04), rgba(var(--glass-tint),0.10), rgba(var(--glass-tint),0.04))',
                }}
              />
              {paged.map(ev => (
                <TimelineItem key={ev.id} ev={ev} nowMs={nowMs} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Pagination footer ── */}
        {events !== null && !err && filtered.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-3 text-[11.5px]"
            style={{ borderTop: '1px solid rgba(var(--glass-tint), 0.08)' }}
          >
            <span className="text-[var(--theme-secondary-text)]/60 tabular-nums">
              {filtered.length} kayıt · sayfa {safePage + 1}/{pageCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={13} /> Önceki
              </button>
              {pageCountButtons(pageCount, safePage).map((p, i) =>
                p === '…' ? (
                  <span key={`ell-${i}`} className="px-1 text-[var(--theme-secondary-text)]/45">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    className="w-7 h-7 rounded-md text-[11px] font-semibold tabular-nums transition-colors"
                    style={p === safePage ? {
                      background: 'rgba(var(--theme-accent-rgb), 0.14)',
                      color: 'var(--theme-accent)',
                      border: '1px solid rgba(var(--theme-accent-rgb), 0.28)',
                    } : {
                      background: 'transparent',
                      color: 'var(--theme-secondary-text)',
                      border: '1px solid rgba(var(--glass-tint), 0.06)',
                    }}
                  >
                    {(p as number) + 1}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="h-7 px-2 rounded-md inline-flex items-center gap-1 text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                Sonraki <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes phmBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes phmModalIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1);    }
        }
        @keyframes phmItemIn {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .phmChip { transition: background 140ms ease, border-color 140ms ease, transform 140ms ease; }
        .phmChip:hover { transform: translateY(-0.5px); }
        .phmItem { transition: background 150ms ease, border-color 150ms ease; }
        .phmItem:hover { background: rgba(var(--glass-tint), 0.035); }
        .phmDot { transition: transform 160ms cubic-bezier(0.2,0.8,0.2,1); }
        .phmItem:hover .phmDot { transform: scale(1.15); }
      `}</style>
    </div>
  );

  return createPortal(body, document.body);
}

// ── Pagination: küçük yardımcı — ilk/son + kaydırılmış 3 sayfa ──
function pageCountButtons(total: number, current: number): Array<number | '…'> {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i);
  const arr: Array<number | '…'> = [];
  const add = (n: number) => { if (!arr.includes(n)) arr.push(n); };
  add(0);
  if (current - 1 > 1) arr.push('…');
  if (current - 1 > 0) add(current - 1);
  add(current);
  if (current + 1 < total - 1) add(current + 1);
  if (current + 1 < total - 2) arr.push('…');
  add(total - 1);
  return arr;
}

// ── Tek timeline item ──
const TimelineItem: React.FC<{ ev: PunishEvent; nowMs: number }> = ({ ev, nowMs }) => {
  const def = KIND_DEF[ev.kind];
  const isActive = !!ev.expiresAt && Date.parse(ev.expiresAt) > nowMs;
  const durationText = ev.durationSeconds ? formatDurationShort(ev.durationSeconds) : null;
  const remaining = isActive && ev.expiresAt ? formatRemaining(ev.expiresAt, nowMs) : null;

  return (
    <li
      className="phmItem relative rounded-xl py-3 pr-3 pl-3 my-1.5"
      style={{
        background: isActive ? 'rgba(251,191,36,0.05)' : 'rgba(var(--glass-tint), 0.02)',
        border: `1px solid ${isActive ? 'rgba(251,191,36,0.24)' : 'rgba(var(--glass-tint), 0.06)'}`,
        animation: 'phmItemIn 220ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      {/* Dot */}
      <span
        aria-hidden="true"
        className="phmDot absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
        style={{
          left: -16,
          background: def.color,
          boxShadow: `0 0 0 3px var(--theme-bg), 0 0 6px ${def.color}99`,
        }}
      />

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
              style={{
                background: `rgba(${def.rgb}, 0.12)`,
                color: def.color,
                border: `1px solid rgba(${def.rgb}, 0.24)`,
              }}
            >
              <span className="inline-flex">{def.icon}</span>
              {def.label}
            </span>
            {ev.channel && (
              <span className="text-[11.5px] text-[var(--theme-secondary-text)]/70 truncate">
                #{ev.channel}
              </span>
            )}
            {isActive && (
              <span
                className="ml-auto px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider shrink-0"
                style={{
                  background: 'rgba(251,191,36,0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.28)',
                }}
              >
                aktif
              </span>
            )}
          </div>

          <div className="mt-1 text-[12.5px] text-[var(--theme-text)]/85 leading-snug">
            {ev.kind === 'auto_chat_ban' && ev.reason
              ? autoReasonText(ev.reason)
              : def.description}
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-[var(--theme-secondary-text)]/55">
            {durationText && <span>{durationText} süre</span>}
            {durationText && <span className="opacity-40">·</span>}
            <span>{ev.isAuto ? 'sistem tarafından' : `${ev.actorName} tarafından`}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div
            className="text-[10.5px] tabular-nums text-[var(--theme-secondary-text)]/65"
            title={absoluteTimestamp(ev.createdAt)}
          >
            {timeAgo(ev.createdAt)}
          </div>
          {remaining && (
            <div className="mt-1 text-[11.5px] font-semibold tabular-nums" style={{ color: '#fbbf24' }}>
              {remaining} kaldı
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

function autoReasonText(reason: string): string {
  if (reason === 'flood_threshold') return 'Flood nedeniyle otomatik yazma engeli uygulandı';
  if (reason === 'profanity_threshold') return 'Küfür filtresi ihlali nedeniyle otomatik ceza';
  if (reason === 'spam_threshold') return 'Spam ihlali nedeniyle otomatik ceza';
  return 'Otomatik yazma engeli uygulandı';
}

// ── Header avatar (bozuk URL → initial fallback) ──
function HeaderAvatar({ src, initials }: { src: string | null; initials: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  return (
    <div
      className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
      style={{
        background: showImg ? 'transparent' : 'rgba(var(--glass-tint), 0.06)',
        border: '1px solid rgba(var(--glass-tint), 0.10)',
        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint), 0.05)',
      }}
    >
      {showImg ? (
        <img
          src={src!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-[13px] font-bold text-[var(--theme-text)]/90">{initials}</span>
      )}
    </div>
  );
}

// ── Empty state ──
function EmptyState({ hasAny, hasQuery }: { hasAny: boolean; hasQuery: boolean }) {
  const filtered = hasAny && hasQuery;
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
      <div
        className="w-12 h-12 rounded-2xl inline-flex items-center justify-center mb-3"
        style={{
          background: 'rgba(var(--glass-tint), 0.04)',
          border: '1px solid rgba(var(--glass-tint), 0.08)',
        }}
      >
        <Shield size={20} className="text-[var(--theme-secondary-text)]/55" />
      </div>
      <div className="text-[13.5px] font-semibold text-[var(--theme-text)]/90">
        {filtered ? 'Sonuç bulunamadı' : 'Ceza geçmişi bulunmuyor'}
      </div>
      <div className="mt-1 text-[11.5px] text-[var(--theme-secondary-text)]/55 max-w-[320px]">
        {filtered
          ? 'Bu filtrelerle eşleşen kayıt yok.'
          : 'Bu kullanıcı için henüz moderasyon kaydı oluşmadı.'}
      </div>
    </div>
  );
}
