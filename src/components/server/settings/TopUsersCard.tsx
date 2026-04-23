import React, { useState, memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  const maxSec = users.reduce((m, u) => Math.max(m, u.totalSec), 0);
  const visibleUsers = expanded ? users : users.slice(0, COLLAPSED_LIMIT);
  const canExpand = users.length > COLLAPSED_LIMIT;

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
        <div className="space-y-1">
          {visibleUsers.map((u, idx) => {
            const pct = maxSec > 0 ? (u.totalSec / maxSec) * 100 : 0;
            const displayName = u.displayName || 'Bilinmeyen';
            return (
              <div
                key={u.userId}
                className="flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg user-row"
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
                {/* Rank */}
                <span className="w-5 text-[10.5px] font-bold tabular-nums text-[var(--theme-secondary-text)]/45 shrink-0 text-right">
                  {idx + 1}
                </span>

                {/* Avatar — 8→10 (+8px) */}
                <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.10)' }}
                >
                  <AvatarContent avatar={u.avatarUrl} statusText="Çevrimdışı" name={displayName} alt={displayName} />
                </div>

                {/* Name + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-medium text-[var(--theme-text)]/90 truncate">{displayName}</span>
                    <span className="text-[10.5px] font-semibold tabular-nums text-[var(--theme-text)]/75 shrink-0">
                      {formatDuration(u.totalSec)}
                    </span>
                  </div>
                  {/* Bar — 3px → 5px, soft blue-cyan gradient */}
                  <div className="relative h-[5px] rounded-full overflow-hidden"
                    style={{ background: 'rgba(var(--glass-tint), 0.05)' }}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, rgba(130, 180, 230, 0.55), rgba(var(--theme-accent-rgb), 0.92))',
                        transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </div>
                  <div className="mt-1">
                    <span className="text-[9.5px] text-[var(--theme-secondary-text)]/55 tabular-nums">
                      {u.sessionCount} oturum · ~{u.avgSessionMin} dk/oturum
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
