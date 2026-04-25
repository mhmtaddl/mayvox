import React, { useState, useEffect, memo } from 'react';
import { ChevronDown, ChevronUp, Crown } from 'lucide-react';
import AvatarContent from '../../AvatarContent';
import type { InsightsUser } from '../../../lib/serverService';

// Avatar fallback her zaman durum PNG (CLAUDE.md kuralı):
// hasCustomAvatar false → statusText='cevrimdisi' → cevrimdisi.png fallback.

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} sn`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h} sa ${rem} dk` : `${h} sa`;
}

interface Props {
  users: InsightsUser[];
}

const COLLAPSED_LIMIT = 5;

function TopUsersCardInner({ users }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const maxSec = users.reduce((m, u) => Math.max(m, u.totalSec), 0);
  const visibleUsers = expanded ? users : users.slice(0, COLLAPSED_LIMIT);
  const canExpand = users.length > COLLAPSED_LIMIT;

  // Bar fill animation mount'ta — 0% → gerçek değer
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5 flex flex-col"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(var(--glass-tint),0.02), 0 8px 24px rgba(0,0,0,0.12)',
        minHeight: '100%',
      }}
    >
      <div className="mb-4">
        <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">
          En Aktif Kullanıcılar <span className="text-[var(--theme-secondary-text)]/45 font-normal">(Top {Math.min(users.length, COLLAPSED_LIMIT)})</span>
        </h3>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-0.5">
          Ses odalarında geçirilen toplam süre
        </p>
      </div>

      {users.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-[12px] font-medium text-[var(--theme-text)]/70 mb-1">Henüz aktivite verisi yok</div>
          <div className="text-[10.5px] text-[var(--theme-secondary-text)]/50 leading-relaxed">
            Kullanıcılar ses odalarında vakit geçirdikçe burada sıralanacak
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleUsers.map((u, idx) => {
            const pct = maxSec > 0 ? (u.totalSec / maxSec) * 100 : 0;
            const displayName = u.displayName || 'Bilinmeyen';
            const isFirst = idx === 0;
            return (
              <div
                key={u.userId}
                className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg user-row"
                style={{
                  transition: 'transform 180ms ease-out, background 180ms ease-out, box-shadow 180ms ease-out',
                  willChange: 'transform',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.background = 'rgba(var(--glass-tint), 0.045)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Rank — #1 için Crown, diğerleri sayı */}
                <span className="w-5 shrink-0 text-right flex items-center justify-end">
                  {isFirst ? (
                    <Crown size={11} className="text-[var(--theme-accent)]" strokeWidth={2.5} />
                  ) : (
                    <span className="text-[10.5px] font-bold tabular-nums text-[var(--theme-secondary-text)]/45">
                      {idx + 1}
                    </span>
                  )}
                </span>

                {/* Avatar — #1 için halka glow */}
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(var(--glass-tint), 0.06)',
                    border: isFirst
                      ? '1px solid rgba(var(--theme-accent-rgb), 0.35)'
                      : '1px solid rgba(var(--glass-tint), 0.10)',
                    boxShadow: isFirst ? '0 0 12px rgba(var(--theme-accent-rgb), 0.22)' : 'none',
                  }}
                >
                  <AvatarContent avatar={u.avatarUrl} statusText="Çevrimdışı" name={displayName} alt={displayName} />
                </div>

                {/* Name + bar with overlay duration */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`text-[12px] truncate tracking-tight ${isFirst ? 'font-semibold text-[var(--theme-text)]' : 'font-medium text-[var(--theme-text)]/90'}`}>
                      {displayName}
                    </span>
                    <span className="text-[9.5px] text-[var(--theme-secondary-text)]/55 tabular-nums shrink-0">
                      {u.sessionCount} oturum · ~{u.avgSessionMin} dk
                    </span>
                  </div>
                  {/* Bar + sağ overlay duration (glyph) */}
                  <div className="relative h-[10px] rounded-full overflow-hidden"
                    style={{ background: 'rgba(var(--glass-tint), 0.05)' }}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: mounted ? `${pct}%` : '0%',
                        background: isFirst
                          ? 'linear-gradient(90deg, rgba(var(--theme-accent-rgb), 0.45), rgba(var(--theme-accent-rgb), 1))'
                          : 'linear-gradient(90deg, rgba(var(--theme-accent-rgb), 0.30), rgba(var(--theme-accent-rgb), 0.85))',
                        transition: 'width 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                        boxShadow: isFirst ? 'inset 0 0 6px rgba(var(--theme-accent-rgb), 0.22)' : 'none',
                      }}
                    />
                    {/* Duration overlay — bar içinde sağ, bar rengine göre contrast */}
                    <span
                      className="absolute inset-y-0 right-2 flex items-center text-[9.5px] font-bold tabular-nums"
                      style={{
                        color: pct >= 78 ? 'var(--theme-text-on-accent, #fff)' : 'var(--theme-text)',
                        textShadow: pct >= 78 ? '0 0 4px rgba(0,0,0,0.5)' : 'none',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {formatDuration(u.totalSec)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tümünü Gör / Azalt butonu — COLLAPSED_LIMIT üzerinde varsa */}
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
          {expanded ? <><ChevronUp size={12} /> Azalt</> : <><ChevronDown size={12} /> Tümünü Gör ({users.length})</>}
        </button>
      )}
    </div>
  );
}

export default memo(TopUsersCardInner);
