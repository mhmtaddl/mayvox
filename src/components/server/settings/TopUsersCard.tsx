import React from 'react';
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

export default function TopUsersCard({ users }: Props) {
  const maxSec = users.reduce((m, u) => Math.max(m, u.totalSec), 0);

  return (
    <div className="relative overflow-hidden rounded-[18px] p-5"
      style={{
        background: 'rgba(var(--glass-tint), 0.03)',
        border: '1px solid rgba(var(--glass-tint), 0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div className="mb-4">
        <h3 className="text-[12.5px] font-semibold text-[var(--theme-text)]/90 tracking-wide">En Aktif Kullanıcılar</h3>
        <p className="text-[10.5px] text-[var(--theme-secondary-text)]/50 mt-0.5">
          Ses odalarında geçirilen toplam süre
        </p>
      </div>

      {users.length === 0 ? (
        <div className="py-8 text-center text-[11px] text-[var(--theme-secondary-text)]/50">
          Henüz aktivite verisi yok
        </div>
      ) : (
        <div className="space-y-2">
          {users.slice(0, 10).map((u, idx) => {
            const pct = maxSec > 0 ? (u.totalSec / maxSec) * 100 : 0;
            const displayName = u.displayName || 'Bilinmeyen';
            return (
              <div key={u.userId} className="flex items-center gap-3 group">
                {/* Rank */}
                <span className="w-5 text-[10.5px] font-bold tabular-nums text-[var(--theme-secondary-text)]/40 shrink-0 text-right">
                  {idx + 1}
                </span>

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(var(--glass-tint), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.10)' }}
                >
                  <AvatarContent avatar={u.avatarUrl} statusText="cevrimdisi" name={displayName} alt={displayName} />
                </div>

                {/* Name + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-medium text-[var(--theme-text)]/85 truncate">{displayName}</span>
                    <span className="text-[10.5px] font-semibold tabular-nums text-[var(--theme-text)]/65 shrink-0">
                      {formatDuration(u.totalSec)}
                    </span>
                  </div>
                  <div className="relative h-[3px] rounded-full overflow-hidden"
                    style={{ background: 'rgba(var(--glass-tint), 0.04)' }}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, rgba(var(--theme-accent-rgb), 0.5), rgba(var(--theme-accent-rgb), 0.9))',
                        transition: 'width 400ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9.5px] text-[var(--theme-secondary-text)]/40 tabular-nums">
                      {u.sessionCount} oturum · ~{u.avgSessionMin} dk/oturum
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
