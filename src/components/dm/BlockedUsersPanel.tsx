import React, { useEffect, useRef } from 'react';
import { UserX, X } from 'lucide-react';
import { motion } from 'motion/react';

export default function BlockedUsersPanel({
  onClose,
  blockedUsers,
  onUnblockUser,
  solidSurface = false,
}: {
  onClose: () => void;
  blockedUsers: Array<{ id: string; name: string }>;
  onUnblockUser: (userId: string) => void;
  solidSurface?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 18 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      onClick={e => e.stopPropagation()}
      className={`absolute inset-y-0 right-0 z-30 flex w-[272px] max-w-[86%] flex-col overflow-hidden border-l border-[rgba(var(--glass-tint),0.10)] ${solidSurface ? 'dm-mobile-solid-panel dm-mobile-side-panel' : ''}`}
      style={{
        background:
          'linear-gradient(180deg, rgba(var(--glass-tint),0.055), rgba(var(--glass-tint),0.024)), rgba(var(--theme-bg-rgb),0.995)',
        boxShadow: '-18px 0 34px -24px rgba(var(--shadow-base),0.72), inset 1px 0 0 rgba(255,255,255,0.035)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 px-3.5" style={{ borderBottom: '1px solid rgba(var(--glass-tint),0.08)' }}>
        <div className="min-w-0">
          <div className="mv-font-title truncate text-[13px] font-bold text-[var(--theme-text)]">Engellenenler</div>
          <div className="mv-font-caption truncate text-[10px] font-medium text-[var(--theme-secondary-text)]/55">{blockedUsers.length} kullanıcı</div>
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--theme-secondary-text)]/60 transition-colors hover:text-[var(--theme-text)]" title="Engellenenleri kapat" aria-label="Engellenenleri kapat">
          <X size={14} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
        {blockedUsers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-[11px] text-[var(--theme-secondary-text)]/45">
            <UserX size={13} />
            <span>Engellenen kullanıcı yok.</span>
          </div>
        ) : (
          <div className="space-y-1">
            {blockedUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-[rgba(var(--glass-tint),0.04)] px-2 py-1.5">
                <span className="min-w-0 truncate text-[11px] font-medium text-[var(--theme-text)]/82">{user.name}</span>
                <button
                  type="button"
                  onClick={() => onUnblockUser(user.id)}
                  className="shrink-0 rounded-[8px] px-2 py-1 text-[10px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10"
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
