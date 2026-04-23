import React, { useState, memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import type { InsightsGroup } from '../../../lib/serverService';

// 2/3/4/5+ kişilik voice-room grup süreleri.
// Avatar stack (max AVATAR_MAX_VISIBLE görünür, fazlası "+N" badge).

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
  groups: InsightsGroup[];
}

const COLLAPSED_LIMIT = 5;
const AVATAR_MAX_VISIBLE = 4;

function SocialGroupsCardInner({ groups }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const visibleGroups = expanded ? groups : groups.slice(0, COLLAPSED_LIMIT);
  const canExpand = groups.length > COLLAPSED_LIMIT;

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div className="mb-4">
        <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">
          Sosyal Gruplar <span className="text-[var(--theme-secondary-text)]/45 font-normal">(Top {Math.min(groups.length, COLLAPSED_LIMIT)})</span>
        </h3>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-0.5">
          Aynı odada birlikte vakit geçiren gruplar
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-[12px] font-medium text-[var(--theme-text)]/70 mb-1">Henüz birlikte geçirilen süre yok</div>
          <div className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-relaxed">
            Birlikte odalarda vakit geçirdikçe burada görünecek
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map((g, idx) => {
            const isHover = hoverIdx === idx;
            const size = g.members.length;
            const visibleMembers = g.members.slice(0, AVATAR_MAX_VISIBLE);
            const hiddenCount = Math.max(0, size - AVATAR_MAX_VISIBLE);
            const names = g.members.map(m => m.name || 'Bilinmeyen');
            const stackWidth = visibleMembers.length * 22 + (hiddenCount > 0 ? 22 : 14);

            return (
              <div
                key={`grp-${idx}-${g.members.map(m => m.id).join(',')}`}
                className="relative flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{
                  background: isHover ? 'rgba(var(--glass-tint), 0.05)' : 'transparent',
                  transform: isHover ? 'translateY(-1px)' : 'translateY(0)',
                  boxShadow: isHover ? '0 4px 16px rgba(var(--theme-accent-rgb), 0.08), 0 0 0 1px rgba(var(--theme-accent-rgb), 0.08)' : 'none',
                  transition: 'transform 180ms ease-out, background 180ms ease-out, box-shadow 180ms ease-out',
                  willChange: 'transform',
                }}
              >
                {/* Rank */}
                <span className="w-5 text-[10.5px] font-bold tabular-nums text-[var(--theme-secondary-text)]/45 shrink-0 text-right">
                  {idx + 1}
                </span>

                {/* Avatar stack */}
                <div className="flex shrink-0 items-center relative" style={{ width: stackWidth, height: 36 }}>
                  {visibleMembers.map((m, i) => (
                    <div
                      key={m.id}
                      className="absolute top-0 w-9 h-9 rounded-full overflow-hidden flex items-center justify-center"
                      style={{
                        left: i * 22,
                        zIndex: visibleMembers.length - i,
                        background: 'rgba(var(--glass-tint), 0.08)',
                        border: '2px solid var(--theme-bg, #0a0e18)',
                      }}
                    >
                      <AvatarContent avatar={m.avatar} statusText="Çevrimdışı" name={m.name || 'Bilinmeyen'} alt={m.name || ''} />
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <div
                      className="absolute top-0 w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        left: AVATAR_MAX_VISIBLE * 22,
                        zIndex: 0,
                        background: 'rgba(var(--theme-accent-rgb), 0.14)',
                        color: 'rgba(var(--theme-accent-rgb), 1)',
                        border: '2px solid var(--theme-bg, #0a0e18)',
                      }}
                    >
                      +{hiddenCount}
                    </div>
                  )}
                </div>

                {/* Names + size badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-[var(--theme-text)]/90 truncate tracking-tight flex-1 min-w-0">
                      {names.join(', ')}
                    </span>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md tabular-nums shrink-0"
                      style={{
                        background: 'rgba(var(--theme-accent-rgb), 0.14)',
                        color: 'rgba(var(--theme-accent-rgb), 1)',
                      }}
                    >
                      {size}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--theme-secondary-text)]/55 tabular-nums mt-0.5">
                    {relativeTime(g.lastTogetherAt)}
                  </div>
                </div>

                {/* Total time */}
                <span className="text-[11px] font-semibold tabular-nums text-[var(--theme-text)]/75 shrink-0">
                  {formatDuration(g.totalSec)}
                </span>

                {/* Hover tooltip */}
                {isHover && (
                  <div className="absolute right-2 top-full mt-1.5 z-10 pointer-events-none"
                    style={{
                      background: 'rgba(12, 16, 24, 0.94)',
                      border: '1px solid rgba(var(--glass-tint), 0.14)',
                      borderRadius: 10,
                      padding: '9px 11px',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                      fontSize: 10.5,
                      lineHeight: 1.5,
                      minWidth: 180,
                      animation: 'insightsTooltipFade 160ms ease-out both',
                    }}
                  >
                    <div className="text-[var(--theme-secondary-text)]/60 text-[9.5px] uppercase tracking-wider mb-0.5">Toplam süre</div>
                    <div className="font-semibold text-[var(--theme-text)]/95 tabular-nums mb-1.5">
                      {formatDuration(g.totalSec)} birlikte
                    </div>
                    <div className="text-[var(--theme-secondary-text)]/60 text-[9.5px] uppercase tracking-wider mb-0.5">Son birlikte</div>
                    <div className="font-semibold text-[var(--theme-text)]/95 tabular-nums mb-1.5">
                      {g.lastTogetherAt ? relativeTime(g.lastTogetherAt) : '—'}
                    </div>
                    <div className="text-[var(--theme-secondary-text)]/60 text-[9.5px] uppercase tracking-wider mb-0.5">Grup boyutu</div>
                    <div className="font-semibold text-[var(--theme-text)]/95 tabular-nums">
                      {size} kişi
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canExpand && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold"
          style={{
            color: 'var(--theme-secondary-text)',
            background: 'rgba(var(--glass-tint), 0.03)',
            border: '1px solid rgba(var(--glass-tint), 0.06)',
            transition: 'all 180ms ease-out',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(var(--glass-tint), 0.06)';
            e.currentTarget.style.color = 'var(--theme-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(var(--glass-tint), 0.03)';
            e.currentTarget.style.color = 'var(--theme-secondary-text)';
          }}
        >
          {expanded ? <><ChevronUp size={12} /> Azalt</> : <><ChevronDown size={12} /> Tümünü Gör ({groups.length})</>}
        </button>
      )}

      <style>{`@keyframes insightsTooltipFade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

export default memo(SocialGroupsCardInner);
