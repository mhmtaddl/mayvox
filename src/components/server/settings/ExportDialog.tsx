import React, { useEffect, useMemo, useState } from 'react';
import { Download, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Ortak export dialog — tek takvim (tek gün / aralık) + "Tüm log kaydı".
 * 3 yüzeyden kullanılır: Kayıtlar, Oto-Mod Log indir, Denetim Analiz Dışa aktar.
 *
 * Backdrop: sade opaque (blur YOK — kullanıcı kuralı).
 *
 * Download akışı caller'a delegate edilir:
 *   onDownload(mode, [startKey, endKey]) → caller filtreler + XLSX kurar.
 */

export type ExportMode = 'range' | 'all';
export type DateRange = [string, string]; // YYYY-MM-DD

interface Props {
  title: string;                   // "Log indir" / "Dışa aktar"
  totalCount: number;              // Mevcut toplam item sayısı
  countInRange: (range: DateRange) => number;  // Seçili aralıkta item sayısını hesaplayan callback
  onClose: () => void;
  onDownload: (mode: ExportMode, range: DateRange) => Promise<void>;
  /** Tüm log kaydı için ek açıklama (örn: "Maksimum 200 kayıt — …") */
  allHint?: string;
}

export default function ExportDialog({
  title, totalCount, countInRange, onClose, onDownload, allHint,
}: Props) {
  const today = new Date();
  const todayKey = dateKey(today);
  const [mode, setMode] = useState<ExportMode>('range');
  const [range, setRange] = useState<DateRange>([todayKey, todayKey]);
  const [viewMonth, setViewMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const handleDayClick = (k: string) => {
    if (range[0] === range[1]) {
      if (k === range[0]) return;
      const a = Date.parse(range[0]);
      const b = Date.parse(k);
      if (a < b) setRange([range[0], k]);
      else       setRange([k, range[0]]);
    } else {
      setRange([k, k]);
    }
  };

  const count = useMemo(() => mode === 'all' ? totalCount : countInRange(range), [mode, range, totalCount, countInRange]);

  const rangeLabel = range[0] === range[1]
    ? `Tek tarih · ${fmtDay(range[0])}`
    : `Aralık · ${fmtDay(range[0])} — ${fmtDay(range[1])}`;

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const handleDownload = async () => {
    setBusy(true);
    setErrMsg(null);
    try {
      await onDownload(mode, range);
      onClose();
    } catch (e: any) {
      const m = e instanceof Error ? e.message : String(e);
      console.error('[ExportDialog] download failed:', e);
      setErrMsg(m || 'İndirme başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[700] flex items-center justify-center px-4 pointer-events-none"
    >
      {/* Şeffaf click-catcher — arka planı KARARTMIYOR, sadece dışarı tıklanınca modal kapanır */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onMouseDown={() => !busy && onClose()}
      />
      <div
        className="surface-elevated relative w-full max-w-[400px] rounded-2xl overflow-hidden pointer-events-auto"
        style={{
          animation: 'edModalIn 200ms cubic-bezier(0.2,0.8,0.2,1)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.30)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.08)' }}
        >
          <Download size={14} className="text-[var(--theme-accent)]/85" />
          <h3 className="flex-1 text-[13px] font-bold text-[var(--theme-text)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 transition-colors"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div
            className="inline-flex items-center gap-0.5 rounded-lg p-0.5 w-full"
            style={{
              background: 'rgba(var(--glass-tint),0.04)',
              border: '1px solid rgba(var(--glass-tint),0.08)',
            }}
          >
            {(['range', 'all'] as const).map(m => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="flex-1 h-8 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
                  style={active ? {
                    background: 'rgba(var(--theme-accent-rgb),0.16)',
                    color: 'var(--theme-accent)',
                  } : {
                    color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.72)',
                  }}
                >
                  {m === 'range' ? <><Calendar size={11} /> Takvimden seç</> : 'Tüm log kaydı'}
                </button>
              );
            })}
          </div>

          {mode === 'range' && (
            <div className="space-y-2">
              <InlineCalendar
                viewMonth={viewMonth}
                onViewMonthChange={setViewMonth}
                range={range}
                onDayClick={handleDayClick}
                todayKey={todayKey}
              />
              <div
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px]"
                style={{
                  background: 'rgba(var(--theme-accent-rgb),0.06)',
                  border: '1px solid rgba(var(--theme-accent-rgb),0.16)',
                }}
              >
                <span className="text-[var(--theme-text)]/85">{rangeLabel}</span>
                <span className="text-[var(--theme-accent)] font-bold tabular-nums">{count} kayıt</span>
              </div>
              <div className="text-[10px] text-[var(--theme-secondary-text)]/50 leading-snug">
                Bir tarih → o günü indir · iki tarih → aralığı indir
              </div>
            </div>
          )}

          {mode === 'all' && (
            <div
              className="px-3 py-2 rounded-lg text-[11px] text-[var(--theme-text)]/85 leading-snug"
              style={{
                background: 'rgba(var(--theme-accent-rgb),0.05)',
                border: '1px solid rgba(var(--theme-accent-rgb),0.14)',
              }}
            >
              Toplam <strong className="tabular-nums">{totalCount}</strong> kayıt XLSX olarak indirilecek.
              {allHint && (
                <span className="block mt-0.5 text-[10px] text-[var(--theme-secondary-text)]/60">
                  {allHint}
                </span>
              )}
            </div>
          )}
        </div>

        {errMsg && (
          <div
            className="mx-5 mb-2 px-3 py-2 rounded-lg text-[11px] text-red-300"
            style={{
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            {errMsg}
          </div>
        )}

        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid rgba(var(--glass-tint),0.08)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 rounded-lg text-[11.5px] font-semibold text-[var(--theme-secondary-text)]/80 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-40 transition-colors"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy || count === 0}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-bold transition-all disabled:opacity-40 disabled:pointer-events-none"
            style={{
              background: 'var(--theme-accent)',
              color: 'var(--theme-text-on-accent, #000)',
              boxShadow: '0 2px 10px rgba(var(--theme-accent-rgb),0.28)',
            }}
          >
            {busy
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Download size={11} />}
            XLSX indir ({count})
          </button>
        </div>
      </div>

      <style>{`
        @keyframes edModalIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1);    }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════
// Inline calendar — tek/aralık seçim
// ═══════════════════════════════════════════
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDay(key: string): string {
  const d = new Date(key + 'T00:00:00');
  if (!Number.isFinite(d.getTime())) return key;
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const TR_DAYS = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'];

function InlineCalendar({
  viewMonth, onViewMonthChange, range, onDayClick, todayKey,
}: {
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  range: DateRange;
  onDayClick: (k: string) => void;
  todayKey: string;
}) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    const dd = new Date(year, month - 1, d);
    cells.push({ key: dateKey(dd), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = new Date(year, month, d);
    cells.push({ key: dateKey(dd), day: d, inMonth: true });
  }
  let nd = 1;
  while (cells.length < 42) {
    const dd = new Date(year, month + 1, nd);
    cells.push({ key: dateKey(dd), day: nd, inMonth: false });
    nd++;
  }

  const rangeStart = range[0];
  const rangeEnd = range[1];
  const isInRange = (k: string) => rangeStart === rangeEnd ? k === rangeStart : (k >= rangeStart && k <= rangeEnd);
  const canGoForward = new Date(year, month + 1, 1).getTime() <= Date.now();

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'rgba(var(--glass-tint),0.03)',
        border: '1px solid rgba(var(--glass-tint),0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onViewMonthChange(new Date(year, month - 1, 1))}
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
          aria-label="Önceki ay"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[12px] font-bold text-[var(--theme-text)] tabular-nums">
          {TR_MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => onViewMonthChange(new Date(year, month + 1, 1))}
          disabled={!canGoForward}
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[var(--theme-secondary-text)]/70 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.06)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Sonraki ay"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {TR_DAYS.map(d => (
          <div key={d} className="text-[9px] font-bold uppercase tracking-[0.10em] text-[var(--theme-secondary-text)]/40 text-center py-0.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) => {
          const inRange = isInRange(c.key);
          const isStart = c.key === rangeStart;
          const isEnd = c.key === rangeEnd;
          const isEndpoint = isStart || isEnd;
          const isToday = c.key === todayKey;
          const isFuture = c.key > todayKey;
          return (
            <button
              key={i}
              type="button"
              onClick={() => !isFuture && onDayClick(c.key)}
              disabled={isFuture}
              className="h-8 rounded-md text-[11px] tabular-nums font-semibold transition-colors"
              style={
                isEndpoint && c.inMonth ? {
                  background: 'var(--theme-accent)',
                  color: 'var(--theme-text-on-accent, #000)',
                  boxShadow: '0 1px 6px rgba(var(--theme-accent-rgb),0.30)',
                } : inRange && c.inMonth ? {
                  background: 'rgba(var(--theme-accent-rgb),0.14)',
                  color: 'var(--theme-accent)',
                } : c.inMonth ? {
                  color: isToday ? 'var(--theme-accent)' : 'var(--theme-text)',
                  background: isToday ? 'rgba(var(--theme-accent-rgb),0.06)' : 'transparent',
                  border: isToday ? '1px solid rgba(var(--theme-accent-rgb),0.20)' : '1px solid transparent',
                } : {
                  color: 'rgba(var(--theme-secondary-text-rgb, 123,139,168), 0.30)',
                }
              }
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
