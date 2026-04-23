import React, { useMemo } from 'react';
import type { InsightsHourCell } from '../../../lib/serverService';

// 7 × 24 CSS grid — pazartesi-pazar (DOW 1-0) × 0-23 saat
// Intensity opacity scale, hover subtle scale + native tooltip.
// Renk disiplini: tek cyan accent (theme-accent). Empty hücre subtle gray.

const DOW_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']; // DOW 0=Pazar
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Pzt'den Pazar'a (TR okunuş)

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

export default function ActivityHeatmap({ peakHours }: Props) {
  const { cellMap, maxSec } = useMemo(() => {
    const m = new Map<string, InsightsHourCell>();
    let max = 0;
    for (const c of peakHours) {
      m.set(`${c.dow}:${c.hour}`, c);
      if (c.totalSec > max) max = c.totalSec;
    }
    return { cellMap: m, maxSec: max };
  }, [peakHours]);

  const totalTracked = peakHours.reduce((s, c) => s + c.totalSec, 0);

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">Aktivite Haritası</h3>
          <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-0.5">Haftalık saatlik yoğunluk</p>
        </div>
        <div className="text-[10.5px] text-[var(--theme-secondary-text)]/55 tabular-nums">
          Toplam: <span className="text-[var(--theme-text)]/80 font-semibold">{formatDuration(totalTracked)}</span>
        </div>
      </div>

      {/* Grid: 1 col label + 24 cols hours */}
      <div className="space-y-1">
        {/* Saat header */}
        <div className="grid items-center gap-0.5" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[8.5px] text-[var(--theme-secondary-text)]/35 tabular-nums"
              style={{ opacity: h % 3 === 0 ? 1 : 0 }}>
              {h}
            </div>
          ))}
        </div>
        {DOW_ORDER.map(dow => (
          <div key={dow} className="grid items-center gap-0.5" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
            <div className="text-[9.5px] font-semibold text-[var(--theme-secondary-text)]/45 tracking-wide">
              {DOW_LABELS[dow]}
            </div>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = cellMap.get(`${dow}:${h}`);
              const intensity = cell && maxSec > 0 ? cell.totalSec / maxSec : 0;
              const hasData = !!cell && cell.totalSec > 0;
              return (
                <div
                  key={h}
                  title={hasData
                    ? `${DOW_LABELS[dow]} ${h}:00 — ${formatDuration(cell!.totalSec)} (${cell!.sessionCount} oturum)`
                    : `${DOW_LABELS[dow]} ${h}:00 — aktivite yok`
                  }
                  className="aspect-square rounded-[3px] cursor-default"
                  style={{
                    background: hasData
                      ? `rgba(var(--theme-accent-rgb), ${0.08 + intensity * 0.72})`
                      : 'rgba(var(--glass-tint), 0.035)',
                    transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease-out',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.18)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[rgba(var(--glass-tint),0.04)]">
        <span className="text-[9.5px] text-[var(--theme-secondary-text)]/40">az</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
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
