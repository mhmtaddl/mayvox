import React, { useState } from 'react';
import AvatarContent from '../../AvatarContent';
import type { InsightsPair } from '../../../lib/serverService';

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h} sa ${rem} dk` : `${h} sa`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'az önce';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

interface Props {
  pairs: InsightsPair[];
}

export default function SocialPairsCard({ pairs }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div className="mb-4">
        <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">Sosyal Eşleşmeler</h3>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-0.5">
          Birlikte en çok vakit geçiren kullanıcılar
        </p>
      </div>

      {pairs.length === 0 ? (
        <div className="py-8 text-center text-[11px] text-[var(--theme-secondary-text)]/50">
          Henüz birlikte geçirilen süre yok
        </div>
      ) : (
        <div className="space-y-2">
          {pairs.slice(0, 10).map((p, idx) => {
            const nameA = p.userA.name || 'Bilinmeyen';
            const nameB = p.userB.name || 'Bilinmeyen';
            const isHover = hoverIdx === idx;
            return (
              <div
                key={`${p.userA.id}:${p.userB.id}`}
                className="relative flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{
                  background: isHover ? 'rgba(var(--glass-tint), 0.04)' : 'transparent',
                  transition: 'background 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {/* Rank */}
                <span className="w-5 text-[10.5px] font-bold tabular-nums text-[var(--theme-secondary-text)]/40 shrink-0 text-right">
                  {idx + 1}
                </span>

                {/* Avatar stack */}
                <div className="flex shrink-0 relative" style={{ width: 52, height: 32 }}>
                  <div className="absolute left-0 top-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ background: 'rgba(var(--glass-tint), 0.08)', border: '2px solid var(--theme-bg, #0a0e18)', zIndex: 2 }}
                  >
                    <AvatarContent avatar={p.userA.avatar} statusText="cevrimdisi" name={nameA} alt={nameA} />
                  </div>
                  <div className="absolute left-5 top-0 w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
                    style={{ background: 'rgba(var(--glass-tint), 0.08)', border: '2px solid var(--theme-bg, #0a0e18)', zIndex: 1 }}
                  >
                    <AvatarContent avatar={p.userB.avatar} statusText="cevrimdisi" name={nameB} alt={nameB} />
                  </div>
                </div>

                {/* Names */}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--theme-text)]/85 truncate">
                    <span>{nameA}</span>
                    <span className="text-[var(--theme-secondary-text)]/40 mx-1.5">·</span>
                    <span>{nameB}</span>
                  </div>
                  <div className="text-[9.5px] text-[var(--theme-secondary-text)]/40 tabular-nums mt-0.5">
                    {relativeTime(p.lastOverlapAt)}
                  </div>
                </div>

                {/* Total time */}
                <span className="text-[11px] font-semibold tabular-nums text-[var(--theme-text)]/65 shrink-0">
                  {formatDuration(p.totalSec)}
                </span>

                {/* Hover tooltip — sade, premium */}
                {isHover && (
                  <div className="absolute right-2 top-full mt-1.5 z-10 pointer-events-none"
                    style={{
                      background: 'rgba(12, 16, 24, 0.92)',
                      border: '1px solid rgba(var(--glass-tint), 0.12)',
                      borderRadius: 10,
                      padding: '8px 10px',
                      backdropFilter: 'blur(8px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      fontSize: 10.5,
                      lineHeight: 1.5,
                      animation: 'insightsTooltipFade 160ms cubic-bezier(0.22, 1, 0.36, 1) both',
                    }}
                  >
                    <div className="text-[var(--theme-secondary-text)]/55">Toplam süre</div>
                    <div className="font-semibold text-[var(--theme-text)]/90 tabular-nums mb-1">{formatDuration(p.totalSec)}</div>
                    <div className="text-[var(--theme-secondary-text)]/55">Son birlikte</div>
                    <div className="font-semibold text-[var(--theme-text)]/90 tabular-nums">
                      {p.lastOverlapAt
                        ? new Date(p.lastOverlapAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes insightsTooltipFade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
