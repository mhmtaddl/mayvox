import React, { useMemo, useState, memo } from 'react';
import type { InsightsHourCell } from '../../../lib/serverService';

// İki mod:
//   'summary' (default): günlük toplam — 7 bar (Pzt-Pazar). Okunması kolay, göz yormaz.
//   'detail': mevcut 7×24 grid, hover tooltip ile saat-gün bazlı detay.

const DOW_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']; // DOW 0=Pazar (PG convention)
const DOW_FULL_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Pzt→Pazar (TR okunuş)

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h} sa ${rem} dk` : `${h} sa`;
}

interface Props {
  peakHours: InsightsHourCell[];
}

function ActivityHeatmapInner({ peakHours }: Props) {
  const [mode, setMode] = useState<'summary' | 'detail'>('detail');

  // Hücre index + günlük toplam
  const { cellMap, maxSec, dailyTotals, totalTracked } = useMemo(() => {
    const m = new Map<string, InsightsHourCell>();
    const daily = new Map<number, number>();
    let max = 0;
    let total = 0;
    for (const c of peakHours) {
      m.set(`${c.dow}:${c.hour}`, c);
      if (c.totalSec > max) max = c.totalSec;
      daily.set(c.dow, (daily.get(c.dow) || 0) + c.totalSec);
      total += c.totalSec;
    }
    return { cellMap: m, maxSec: max, dailyTotals: daily, totalTracked: total };
  }, [peakHours]);

  const maxDaily = useMemo(() => {
    let max = 0;
    dailyTotals.forEach(v => { if (v > max) max = v; });
    return max;
  }, [dailyTotals]);

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">Aktivite Haritası</h3>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/60 mt-0.5 tabular-nums">
            Toplam süre: <span className="text-[var(--theme-text)]/80 font-semibold">{formatDuration(totalTracked)}</span>
            <span className="mx-1.5 opacity-40">·</span>
            {mode === 'summary' ? 'günlük dağılım' : 'saatlik yoğunluk'}
          </p>
        </div>
        {/* Mode toggle: Özet / Detay */}
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ background: 'rgba(var(--glass-tint), 0.04)', border: '1px solid rgba(var(--glass-tint), 0.08)' }}
        >
          {(['summary', 'detail'] as const).map(m => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-2.5 py-1 rounded-md text-[10.5px] font-semibold tracking-wide"
                style={{
                  color: active ? 'var(--theme-text)' : 'var(--theme-secondary-text)',
                  background: active ? 'rgba(var(--theme-accent-rgb), 0.12)' : 'transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(var(--theme-accent-rgb), 0.22)' : 'none',
                  transition: 'all 180ms ease-out',
                }}
              >
                {m === 'summary' ? 'Özet' : 'Detay'}
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'summary' ? <SummaryView dailyTotals={dailyTotals} maxDaily={maxDaily} /> : <DetailGrid cellMap={cellMap} maxSec={maxSec} />}
    </div>
  );
}

export default memo(ActivityHeatmapInner);

// ── Summary view: 7 günün toplam süresi — horizontal bar ──
function SummaryView({ dailyTotals, maxDaily }: { dailyTotals: Map<number, number>; maxDaily: number }) {
  return (
    <div className="space-y-1.5">
      {DOW_ORDER.map(dow => {
        const sec = dailyTotals.get(dow) || 0;
        const pct = maxDaily > 0 ? (sec / maxDaily) * 100 : 0;
        const hasData = sec > 0;
        return (
          <div key={dow} className="flex items-center gap-3">
            <span className="w-8 text-[10.5px] font-semibold text-[var(--theme-secondary-text)]/55 tracking-wide shrink-0">
              {DOW_LABELS[dow]}
            </span>
            <div className="flex-1 relative h-[10px] rounded-md overflow-hidden"
              style={{ background: 'rgba(var(--glass-tint), 0.05)' }}
            >
              <div className="absolute inset-y-0 left-0 rounded-md"
                title={hasData ? `${DOW_FULL_LABELS[dow]} — ${formatDuration(sec)}` : `${DOW_FULL_LABELS[dow]} — aktivite yok`}
                style={{
                  width: hasData ? `${Math.max(3, pct)}%` : '0%',
                  background: 'linear-gradient(90deg, rgba(130, 180, 230, 0.55), rgba(var(--theme-accent-rgb), 0.92))',
                  transition: 'width 420ms ease-out',
                }}
              />
            </div>
            <span className="w-20 text-right text-[10.5px] font-semibold tabular-nums text-[var(--theme-text)]/70 shrink-0">
              {hasData ? formatDuration(sec) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail grid: 7×24 hücre ──
function DetailGrid({ cellMap, maxSec }: { cellMap: Map<string, InsightsHourCell>; maxSec: number }) {
  return (
    <div className="space-y-1">
      {/* Saat header */}
      <div className="grid items-center gap-0.5" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-[8.5px] text-[var(--theme-secondary-text)]/40 tabular-nums"
            style={{ opacity: h % 3 === 0 ? 1 : 0 }}>
            {h}
          </div>
        ))}
      </div>
      {DOW_ORDER.map(dow => (
        <div key={dow} className="grid items-center gap-0.5" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
          <div className="text-[9.5px] font-semibold text-[var(--theme-secondary-text)]/50 tracking-wide">
            {DOW_LABELS[dow]}
          </div>
          {Array.from({ length: 24 }, (_, h) => {
            const cell = cellMap.get(`${dow}:${h}`);
            const intensity = cell && maxSec > 0 ? cell.totalSec / maxSec : 0;
            const hasData = !!cell && cell.totalSec > 0;
            const alpha = hasData ? 0.15 + intensity * 0.75 : 0;
            return (
              <div
                key={h}
                title={hasData
                  ? `${DOW_FULL_LABELS[dow]} · ${String(h).padStart(2, '0')}:00\nToplam: ${formatDuration(cell!.totalSec)} (${cell!.sessionCount} oturum)`
                  : `${DOW_FULL_LABELS[dow]} · ${String(h).padStart(2, '0')}:00 — aktivite yok`
                }
                className="rounded-[3px] cursor-default"
                style={{
                  height: 18,
                  background: hasData ? `rgba(var(--theme-accent-rgb), ${alpha})` : 'rgba(var(--glass-tint), 0.05)',
                  transition: 'transform 140ms ease-out, box-shadow 140ms ease-out',
                  willChange: 'transform',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  if (hasData) e.currentTarget.style.boxShadow = '0 0 8px rgba(var(--theme-accent-rgb), 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[rgba(var(--glass-tint),0.04)]">
        <span className="text-[9.5px] text-[var(--theme-secondary-text)]/40">az</span>
        <div className="flex gap-0.5">
          {[0.15, 0.33, 0.52, 0.71, 0.9].map(i => (
            <div key={i} className="w-3 h-3 rounded-[2px]"
              style={{ background: `rgba(var(--theme-accent-rgb), ${i})` }}
            />
          ))}
        </div>
        <span className="text-[9.5px] text-[var(--theme-secondary-text)]/40">çok</span>
      </div>
    </div>
  );
}
