import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, MicOff, Clock, DoorOpen, UserX, Ban, RotateCcw } from 'lucide-react';
import {
  type ServerMember,
  type AuditLogItem,
  getAuditLog,
  resetMemberModerationHistory,
} from '../../../lib/serverService';

interface Props {
  serverId: string;
  member: ServerMember;
  anchorRect: DOMRect;
  onClose: () => void;
  /** Moderator toast için parent bildirim — yoksa sessiz. */
  onToast?: (msg: string) => void;
}

interface CountRow {
  key: 'mute' | 'timeout' | 'room_kick' | 'kick' | 'ban';
  label: string;
  icon: React.ReactNode;
  color: string;
  actions: readonly string[];
}

// Renk paleti — mute=turuncu, timeout=mor (yeni tasarım kuralı).
const ROWS: readonly CountRow[] = [
  { key: 'mute',      label: 'Sustur',       icon: <MicOff size={12} />,   color: '#fb923c', actions: ['member.mute'] },
  { key: 'timeout',   label: 'Zaman aşımı',  icon: <Clock size={12} />,    color: '#a78bfa', actions: ['member.timeout'] },
  { key: 'room_kick', label: 'Odadan çıkar', icon: <DoorOpen size={12} />, color: '#fb923c', actions: ['member.room_kick'] },
  { key: 'kick',      label: 'Sunucudan at', icon: <UserX size={12} />,    color: '#f87171', actions: ['member.kick'] },
  { key: 'ban',       label: 'Yasakla',      icon: <Ban size={12} />,      color: '#ef4444', actions: ['member.ban'] },
];

const POPOVER_WIDTH = 280;
// Sabit yükseklik — içerik load olsa da olmasa da popover aynı boyutta kalır.
// Header (26) + 5 satır × 40 + padding (20) ≈ 246. İlk render ve yüklenmiş render aynı
// boyuta sahip olduğu için re-measure / zıplama OLMAZ. Loading state de bu alan içinde görünür.
const POPOVER_HEIGHT = 246;
const MARGIN = 8;

/**
 * Moderasyon geçmişi popover — audit log'dan client-side filter + count.
 * Tasarım: mesaj penceresi/DM panel ile aynı yüzey (popup-surface class'ı),
 * tema değişiminde CSS variable'lar otomatik uyum sağlar.
 * Collision: 4 kenar için flip — alt, üst, sol, sağ viewport sınırına çarparsa
 * popover karşı tarafa kayar; hiçbir kısım kırpılmaz.
 */
export default function ModerationHistoryPopover({ serverId, member, anchorRect, onClose, onToast }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<CountRow['key'], number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fetchNonce, setFetchNonce] = useState(0);

  // Konumu SENKRON hesapla — ilk render'dan önce final değerle başlar, zıplamaz.
  // Sabit POPOVER_WIDTH + POPOVER_HEIGHT kullanılır; içerik load durumuna bağlı değil.
  // counts değişince re-measure YAPMIYORUZ — popover aynı boyutta kalıyor.
  const pos = React.useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = POPOVER_WIDTH;
    const h = POPOVER_HEIGHT;

    let top = anchorRect.bottom + 6;
    let left = anchorRect.right - w;

    if (top + h > vh - MARGIN) top = anchorRect.top - h - 6;
    if (top < MARGIN) top = MARGIN;
    if (left < MARGIN) left = Math.min(anchorRect.left, vw - w - MARGIN);
    if (left + w > vw - MARGIN) left = vw - w - MARGIN;

    return { top, left };
  }, [anchorRect]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);
    setErr(null);
    (async () => {
      try {
        const results = await Promise.all(
          ROWS.map(r => getAuditLog(serverId, { action: r.actions[0], limit: 200 }).catch(() => [] as AuditLogItem[]))
        );
        if (cancelled) return;
        const out = {} as Record<CountRow['key'], number>;
        ROWS.forEach((r, i) => {
          out[r.key] = results[i].filter(log => log.resourceId === member.userId).length;
        });
        setCounts(out);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Geçmiş yüklenemedi');
      }
    })();
    return () => { cancelled = true; };
  }, [serverId, member.userId, fetchNonce]);

  const handleReset = async () => {
    if (resetting) return;
    // İki aşamalı confirm — yanlışlıkla tıklanmasın.
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setResetting(true);
    try {
      await resetMemberModerationHistory(serverId, member.userId);
      setFetchNonce(n => n + 1); // Re-fetch → sayılar 0
      onToast?.('Ceza geçmişi sıfırlandı');
    } catch (e: unknown) {
      onToast?.(e instanceof Error ? e.message : 'Sıfırlama başarısız');
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const popover = (
    <div
      ref={ref}
      className="popup-surface"
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        height: POPOVER_HEIGHT,
        zIndex: 600,
        padding: 10,
        animation: 'modHistoryIn 140ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <div
        className="flex items-center gap-2 px-2 pb-2 mb-1 border-b"
        style={{ borderColor: 'rgba(var(--glass-tint), 0.08)' }}
      >
        <History size={12} className="text-[var(--theme-secondary-text)]" />
        <span className="flex-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--theme-secondary-text)]">
          Ceza Geçmişi
        </span>
        {/* Reset ikonu — iki aşamalı confirm: ilk tık uyarı rengi, ikinci tık gerçekten siler. */}
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className={`shrink-0 w-6 h-6 rounded-md inline-flex items-center justify-center transition-colors ${
            confirmReset
              ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
              : 'text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.08)]'
          } ${resetting ? 'opacity-50 cursor-wait' : ''}`}
          title={confirmReset ? 'Onaylamak için tekrar tıkla' : 'Ceza geçmişini sıfırla'}
          aria-label="Ceza geçmişini sıfırla"
        >
          <RotateCcw size={12} strokeWidth={2.2} />
        </button>
      </div>

      {err && (
        <div className="px-3 py-2 text-[11px] text-red-400">{err}</div>
      )}

      {!counts && !err && (
        <div className="px-3 py-4 text-[11px] text-[var(--theme-secondary-text)]/70 text-center">Yükleniyor...</div>
      )}

      {counts && ROWS.map(r => (
        <div
          key={r.key}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg"
        >
          <span
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md"
            style={{
              background: `${r.color}1f`,
              color: r.color,
              border: `1px solid ${r.color}40`,
            }}
          >
            {r.icon}
          </span>
          <span className="flex-1 text-[12px] text-[var(--theme-text)]/85">{r.label}</span>
          <span
            className="shrink-0 text-[12px] font-bold tabular-nums"
            style={{ color: counts[r.key] > 0 ? r.color : 'rgba(var(--glass-tint), 0.5)' }}
          >
            {counts[r.key]}
          </span>
        </div>
      ))}

      <style>{`
        @keyframes modHistoryIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(popover, document.body);
}
