import React, { useEffect, useMemo, useState } from 'react';
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
import { memberDisplayName, timeAgo } from './shared';
import { useUser } from '../../../contexts/UserContext';
import { getStatusAvatar, hasCustomAvatar } from '../../../lib/statusAvatar';
import cevrimdisiPng from '../../../assets/profil/cevrimdisi.png';

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

// Ceza olayları — timeline'da render edilenler.
const PUNISH_ACTIONS: readonly string[] = [
  'member.mute', 'member.timeout', 'member.room_kick',
  'member.chat_ban', 'member.kick', 'member.ban',
  'member.chat_ban.auto',
];

// Karşıt (temizleyici) olaylar — timeline'da GÖRÜNMEZ, yalnızca "aktif" rozetini
// yanlış pozitiflerden korumak için fetch edilir ve tespit için kullanılır.
const CLEAR_ACTIONS: readonly string[] = [
  'member.unmute',
  'member.timeout_clear',
  'member.chat_unban',
];

// Fetch kümesi — PUNISH_ACTIONS + CLEAR_ACTIONS
const AUDIT_ACTIONS: readonly string[] = [...PUNISH_ACTIONS, ...CLEAR_ACTIONS];

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

// "Aktif" durumu için tracker — punish kind → clear action → epoch ms timestamp listesi.
type ClearKind = 'mute' | 'timeout' | 'chat_ban';
interface ClearEvent { kind: ClearKind; at: number }

function clearActionToKind(action: string): ClearKind | null {
  if (action === 'member.unmute')        return 'mute';
  if (action === 'member.timeout_clear') return 'timeout';
  if (action === 'member.chat_unban')    return 'chat_ban';
  return null;
}

// Punish kind → karşı clear kind. Kick/ban/room_kick anlık aksiyon; aktif kavramı yok.
const PUNISH_TO_CLEAR_KIND: Partial<Record<Kind, ClearKind>> = {
  mute: 'mute',
  timeout: 'timeout',
  chat_ban: 'chat_ban',
  auto_chat_ban: 'chat_ban', // Auto chat-ban manuel unban ile kalkar
};

/**
 * Bir ceza olayının HÂLÂ aktif olup olmadığını hesaplar.
 *
 * Kurallar:
 *  - Karşılığı clear action'ı olmayan (kick/ban/room_kick) → false (anlık aksiyon)
 *  - expiresAt varsa ve süresi geçmişse → false
 *  - Bu event'ten SONRA aynı kategoride clear event varsa → false (temizlenmiş)
 *  - Aksi halde → true
 *
 * Böylece: mute + hemen unmute / timeout + clear / chat_ban + chat_unban
 * senaryolarında "aktif" rozeti yanlış pozitif üretmez.
 */
function computeIsActive(ev: PunishEvent, clears: ClearEvent[], nowMs: number): boolean {
  const clearKind = PUNISH_TO_CLEAR_KIND[ev.kind];
  if (!clearKind) return false;
  if (ev.expiresAt && Date.parse(ev.expiresAt) <= nowMs) return false;
  const eventAt = Date.parse(ev.createdAt);
  if (!Number.isFinite(eventAt)) return false;
  const cleared = clears.some(c => c.kind === clearKind && c.at > eventAt);
  return !cleared;
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
  // Clear event'leri ayrı tut — timeline'da render ETMEZ, yalnız isActive hesabında kullanılır.
  const [clears, setClears] = useState<ClearEvent[]>([]);
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

  // Audit log fetch (paralel, action başına). Punish + clear action'ları aynı
  // fetch kümesinden gelir; ayrıştırılır — punishler timeline'a, clear'lar "aktif" hesabına.
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setClears([]);
    setErr(null);
    (async () => {
      try {
        const results = await Promise.all(
          AUDIT_ACTIONS.map(a => getAuditLog(serverId, { action: a, limit: 200 }).catch(() => [] as AuditLogItem[]))
        );
        if (cancelled) return;
        const merged: PunishEvent[] = [];
        const clearList: ClearEvent[] = [];
        for (const rs of results) {
          for (const log of rs) {
            if (log.resourceId !== member.userId) continue;
            // Önce clear mı diye kontrol et — clear ise punish event'e DÖNÜŞTÜRME.
            const ck = clearActionToKind(log.action);
            if (ck) {
              const at = Date.parse(log.createdAt);
              if (Number.isFinite(at)) clearList.push({ kind: ck, at });
              continue;
            }
            const ev = toPunishEvent(log);
            if (ev) merged.push(ev);
          }
        }
        merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setEvents(merged);
        setClears(clearList);
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
  // Avatar fallback için: kullanıcının anlık durum PNG'sini UserContext.allUsers'tan çöz.
  const { allUsers } = useUser();
  const memberStatusText = allUsers.find(u => u.id === member.userId)?.statusText ?? null;
  const memberStatusPng = getStatusAvatar(memberStatusText) ?? cevrimdisiPng;

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
      className="phmOverlay fixed inset-0 z-[700] flex items-center justify-center px-4"
      style={{
        // Arka plan katmanı YOK — uygulamanın geri kalanı blur/dim'lenmesin.
        // fixed inset-0 yalnızca modal'ı merkezlemek ve click-outside-close için
        // kullanılır; görsel olarak şeffaf.
        background: 'transparent',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
      onMouseDown={onClose}
    >
      <div
        className="phmModal relative w-full max-w-[720px] rounded-[22px] overflow-hidden"
        style={{
          // Opak tema arkaplan + subtle accent tint — okunabilirlik tam, arka plan görünmez
          background: 'linear-gradient(180deg, rgba(var(--theme-accent-rgb), 0.04), transparent 45%), var(--theme-bg, #0a0e18)',
          boxShadow:
            '0 24px 72px rgba(0,0,0,0.6), ' +
            'inset 0 1px 0 rgba(255,255,255,0.06), ' +
            '0 0 0 1px rgba(var(--glass-tint), 0.10)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.05)' }}
        >
          <HeaderAvatar src={member.avatar} statusPng={memberStatusPng} displayName={displayName} />

          <div className="flex-1 min-w-0">
            <div
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-[#e8ecf4]/45"
              style={{ letterSpacing: '0.14em' }}
            >
              <History size={11} strokeWidth={2} />
              Ceza Geçmişi
            </div>
            <div className="mt-1 flex items-baseline gap-2 min-w-0">
              <span
                className="text-[14.5px] font-medium text-[#e8ecf4]/92 truncate"
                style={{ letterSpacing: '-0.005em' }}
              >
                {displayName}
              </span>
              <span className="text-[11px] text-[#e8ecf4]/40 shrink-0">
                {events === null ? 'yükleniyor' : `son 24 saatte ${violations24h} ihlal`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || events === null || events.length === 0}
            className={`phmIconBtn shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center ${
              confirmReset ? 'is-danger-confirm' : ''
            } disabled:opacity-25 disabled:pointer-events-none`}
            title={confirmReset ? 'Onaylamak için tekrar tıkla' : 'Ceza geçmişini sıfırla'}
            aria-label="Sıfırla"
          >
            <RotateCcw size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="phmIconBtn shrink-0 w-9 h-9 rounded-xl inline-flex items-center justify-center"
            title="Kapat"
            aria-label="Kapat"
          >
            <X size={15} strokeWidth={1.9} />
          </button>
        </div>

        {/* ── Filter Bar ── */}
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
        >
          <div className="phmSearch relative flex-1 min-w-0">
            <Search
              size={13}
              strokeWidth={2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#e8ecf4]/35 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ceza türü veya kanal ara"
              className="w-full h-10 pl-9 pr-3 rounded-full text-[12px] text-[#e8ecf4]/90 placeholder:text-[#e8ecf4]/35 outline-none"
              style={{
                background: 'rgba(255,255,255,0.028)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.045)',
              }}
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className="phmChip px-3.5 h-[34px] rounded-full text-[11px] font-medium"
                  style={active ? {
                    background: 'rgba(96,165,250,0.10)',
                    color: '#93c5fd',
                    boxShadow:
                      'inset 0 0 0 1px rgba(96,165,250,0.22), ' +
                      '0 0 16px rgba(96,165,250,0.10)',
                  } : {
                    background: 'transparent',
                    color: 'rgba(232,236,244,0.50)',
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
          className="px-5 py-4 phmScroll"
          style={{ maxHeight: 420, minHeight: 220, overflowY: 'auto' }}
        >
          {events === null && !err && (
            <div className="h-[220px] flex items-center justify-center text-[12px] text-[#e8ecf4]/45">
              Yükleniyor
            </div>
          )}
          {err && (
            <div className="h-[220px] flex items-center justify-center text-[12.5px] text-red-400/80">{err}</div>
          )}
          {events !== null && !err && filtered.length === 0 && (
            <EmptyState hasAny={events.length > 0} hasQuery={!!search.trim() || filter !== 'all'} />
          )}
          {events !== null && !err && paged.length > 0 && (
            <ul className="space-y-1.5">
              {paged.map(ev => (
                <TimelineItem key={ev.id} ev={ev} nowMs={nowMs} clears={clears} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Pagination footer ── */}
        {events !== null && !err && filtered.length > 0 && (
          <div
            className="flex items-center justify-between px-5 py-3 text-[11px]"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          >
            <span className="text-[#e8ecf4]/40 tabular-nums">
              {filtered.length} kayıt · sayfa {safePage + 1}/{pageCount}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="phmIconBtn h-8 px-2.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-25 disabled:pointer-events-none"
              >
                <ChevronLeft size={13} strokeWidth={2} /> Önceki
              </button>
              {pageCountButtons(pageCount, safePage).map((p, i) =>
                p === '…' ? (
                  <span key={`ell-${i}`} className="px-1 text-[#e8ecf4]/35">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    className="phmPageNum w-8 h-8 rounded-lg text-[11px] font-medium tabular-nums"
                    style={p === safePage ? {
                      background: 'rgba(96,165,250,0.10)',
                      color: '#93c5fd',
                      boxShadow: 'inset 0 0 0 1px rgba(96,165,250,0.22)',
                    } : {
                      background: 'transparent',
                      color: 'rgba(232,236,244,0.55)',
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
                className="phmIconBtn h-8 px-2.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-25 disabled:pointer-events-none"
              >
                Sonraki <ChevronRight size={13} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* Apple easing token */
        .phmOverlay, .phmModal, .phmItem, .phmChip, .phmIconBtn, .phmSearch input, .phmPageNum {
          --phm-ease: cubic-bezier(0.22, 1, 0.36, 1);
        }

        @keyframes phmBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes phmModalIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);    }
        }
        @keyframes phmItemIn {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0);   }
        }

        .phmOverlay {
          animation: phmBackdropIn 200ms var(--phm-ease);
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .phmModal {
          animation: phmModalIn 220ms var(--phm-ease);
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* Filter pills */
        .phmChip {
          transition:
            background 200ms var(--phm-ease) 40ms,
            color 200ms var(--phm-ease) 40ms,
            box-shadow 220ms var(--phm-ease);
        }
        .phmChip:hover {
          color: rgba(232,236,244,0.90) !important;
          background: rgba(255,255,255,0.04) !important;
        }
        .phmChip:active { transform: scale(0.97); }
        .phmChip:focus-visible {
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(96,165,250,0.32),
            0 0 0 4px rgba(96,165,250,0.08);
        }

        /* Search — focus ring */
        .phmSearch input {
          transition: background 200ms var(--phm-ease), box-shadow 220ms var(--phm-ease);
        }
        .phmSearch input:focus {
          background: rgba(255,255,255,0.045) !important;
          box-shadow:
            inset 0 0 0 1px rgba(96,165,250,0.28),
            0 0 0 4px rgba(96,165,250,0.08) !important;
        }

        /* Icon buttons (close/reset/page nav) */
        .phmIconBtn {
          color: rgba(232,236,244,0.55);
          transition:
            background 180ms var(--phm-ease) 40ms,
            color 180ms var(--phm-ease) 40ms;
        }
        .phmIconBtn:hover {
          color: rgba(232,236,244,0.95);
          background: rgba(255,255,255,0.04);
        }
        .phmIconBtn:active { transform: scale(0.96); }
        .phmIconBtn.is-danger-confirm {
          color: rgba(248,113,113,0.90);
          background: rgba(248,113,113,0.08);
        }
        .phmIconBtn.is-danger-confirm:hover {
          background: rgba(248,113,113,0.14);
        }

        .phmPageNum {
          transition:
            background 180ms var(--phm-ease) 40ms,
            color 180ms var(--phm-ease) 40ms,
            box-shadow 200ms var(--phm-ease);
        }
        .phmPageNum:hover {
          background: rgba(255,255,255,0.04) !important;
          color: rgba(232,236,244,0.90) !important;
        }

        /* List item — row background + hover fade */
        .phmItem {
          animation: phmItemIn 240ms var(--phm-ease);
          transition: background 200ms var(--phm-ease) 50ms, box-shadow 220ms var(--phm-ease);
        }
        .phmItem:not(.is-active):hover {
          background: rgba(255,255,255,0.035) !important;
        }

        /* Scrollbar — thin, muted */
        .phmScroll::-webkit-scrollbar { width: 7px; height: 7px; }
        .phmScroll::-webkit-scrollbar-track { background: var(--scrollbar-track, transparent); }
        .phmScroll::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb, rgba(255,255,255,0.20));
          border-radius: 999px;
        }
        .phmScroll::-webkit-scrollbar-thumb:hover {
          background: var(--scrollbar-thumb-hover, rgba(255,255,255,0.32));
        }
        .phmScroll {
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb, rgba(255,255,255,0.20)) var(--scrollbar-track, transparent);
        }
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
const TimelineItem: React.FC<{ ev: PunishEvent; nowMs: number; clears: ClearEvent[] }> = ({ ev, nowMs, clears }) => {
  const def = KIND_DEF[ev.kind];
  // Yeni doğruluk kuralı: expiresAt + karşıt clear event kontrolü birlikte.
  // Ayrıntı: computeIsActive tanımı yukarıda.
  const isActive = computeIsActive(ev, clears, nowMs);
  const durationText = ev.durationSeconds ? formatDurationShort(ev.durationSeconds) : null;
  const remaining = isActive && ev.expiresAt ? formatRemaining(ev.expiresAt, nowMs) : null;

  return (
    <li
      className={`phmItem relative rounded-[13px] px-3.5 py-3 ${isActive ? 'is-active' : ''}`}
      style={isActive ? {
        background: 'rgba(251,191,36,0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.18)',
      } : {
        background: 'rgba(255,255,255,0.02)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.035)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium shrink-0"
              style={{
                background: `rgba(${def.rgb}, 0.10)`,
                color: `rgba(${def.rgb}, 0.92)`,
                boxShadow: `inset 0 0 0 1px rgba(${def.rgb}, 0.18)`,
              }}
            >
              <span className="inline-flex opacity-85">{def.icon}</span>
              {def.label}
            </span>
            {ev.channel && (
              <span className="text-[11px] text-[#e8ecf4]/55 truncate">
                #{ev.channel}
              </span>
            )}
            {isActive && (
              <span
                className="ml-auto px-2 py-0.5 rounded-full text-[9.5px] font-medium uppercase shrink-0"
                style={{
                  background: 'rgba(251,191,36,0.08)',
                  color: 'rgba(251,191,36,0.88)',
                  boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.22)',
                  letterSpacing: '0.10em',
                }}
              >
                aktif
              </span>
            )}
          </div>

          <div
            className="mt-1.5 text-[12.5px] font-medium text-[#e8ecf4]/88 leading-snug"
            style={{ letterSpacing: '-0.005em' }}
          >
            {ev.kind === 'auto_chat_ban' && ev.reason
              ? autoReasonText(ev.reason)
              : def.description}
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-[#e8ecf4]/40 leading-relaxed">
            {durationText && <span>{durationText} süre</span>}
            {durationText && <span className="opacity-50">·</span>}
            <span>{ev.isAuto ? 'sistem tarafından' : `${ev.actorName} tarafından`}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div
            className="text-[10.5px] tabular-nums text-[#e8ecf4]/35"
            title={absoluteTimestamp(ev.createdAt)}
          >
            {timeAgo(ev.createdAt)}
          </div>
          {remaining && (
            <div className="mt-1 text-[11px] font-medium tabular-nums" style={{ color: 'rgba(251,191,36,0.88)' }}>
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

// ── Header avatar — kural: kullanıcı avatar yüklememişse varsayılan durum PNG'si göster (initial YASAK) ──
function HeaderAvatar({ src, statusPng, displayName }: { src: string | null; statusPng: string; displayName: string }) {
  const [failed, setFailed] = useState(false);
  const useCustom = hasCustomAvatar(src) && !failed;
  const finalSrc = useCustom ? src! : statusPng;
  return (
    <div
      className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.05), ' +
          '0 2px 8px rgba(0,0,0,0.18)',
      }}
      aria-label={displayName}
    >
      <img
        src={finalSrc}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
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
          background: 'rgba(255,255,255,0.03)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        <Shield size={18} className="text-[#e8ecf4]/45" strokeWidth={1.9} />
      </div>
      <div className="text-[13px] font-medium text-[#e8ecf4]/90" style={{ letterSpacing: '-0.005em' }}>
        {filtered ? 'Sonuç bulunamadı' : 'Ceza geçmişi bulunmuyor'}
      </div>
      <div className="mt-1 text-[11.5px] text-[#e8ecf4]/45 max-w-[320px] leading-relaxed">
        {filtered
          ? 'Bu filtrelerle eşleşen kayıt yok.'
          : 'Bu kullanıcı için henüz moderasyon kaydı oluşmadı.'}
      </div>
    </div>
  );
}
