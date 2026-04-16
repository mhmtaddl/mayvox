import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, UserPlus, X } from 'lucide-react';
import { dismiss, handleClick, recordDisplayed, type ToastItem as Toast } from './notificationService';

interface Props {
  toast: Toast;
  ttlMs?: number;
}

export default function ToastItemView({ toast, ttlMs = 5000 }: Props) {
  const [hovered, setHovered] = useState(false);
  const remainingRef = useRef(ttlMs);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lifecycle: gerçekten DOM'a mount olduğunda 'displayed' (queued 'seen'ten ayrı).
  // recordDisplayed içinde idempotent guard var — StrictMode double-mount'ta çift fire etmez.
  useEffect(() => {
    recordDisplayed(toast.id, toast.kind, toast.priority);
  }, [toast.id, toast.kind, toast.priority]);

  useEffect(() => {
    if (hovered) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
      return;
    }
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => dismiss(toast.id, 'timeout'), remainingRef.current);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [hovered, toast.id]);

  const Icon = toast.kind === 'dm' ? MessageCircle : UserPlus;
  const avatar = toast.avatar;
  const hasAvatar = typeof avatar === 'string' && avatar.startsWith('http');
  const accentColor = toast.kind === 'dm' ? 'var(--theme-accent)' : 'rgb(168,85,247)';

  const isSubtle = toast.visualMode === 'toast-subtle';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => handleClick(toast)}
      className="group relative flex items-start gap-3 w-[340px] cursor-pointer rounded-2xl overflow-hidden transition-colors duration-150 hover:bg-[var(--theme-panel-hover)]"
      style={{
        // Solid foreground: theme-bg opak + hafif accent border, glass overkill yok.
        background: 'var(--theme-bg)',
        border: '1px solid var(--theme-border)',
        boxShadow:
          '0 20px 48px -12px rgba(var(--shadow-base),0.50),' +
          ' 0 4px 12px -2px rgba(var(--shadow-base),0.20),' +
          ' inset 0 1px 0 rgba(255,255,255,0.04)',
        opacity: isSubtle ? 0.88 : 1,
      }}
    >
      {/* Sol aksan barı */}
      <div className="w-[3px] self-stretch shrink-0" style={{ background: accentColor }} />

      <div className="flex-1 min-w-0 flex items-start gap-3 pl-2 pr-3 py-3 relative">
        {/* Avatar */}
        <div
          className="shrink-0 w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(var(--theme-accent-rgb), 0.1)' }}
        >
          {hasAvatar
            ? <img src={avatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            : <Icon size={16} className="text-[var(--theme-accent)] opacity-70" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[12.5px] font-semibold text-[var(--theme-text)] truncate tracking-[-0.01em]">
              {toast.title}
            </span>
          </div>
          {toast.body && (
            <p className="text-[11px] text-[var(--theme-secondary-text)]/75 line-clamp-2 break-words leading-snug">
              {toast.body}
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[var(--theme-secondary-text)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-[rgba(var(--glass-tint),0.08)] transition-opacity duration-150"
          aria-label="Kapat"
        >
          <X size={11} />
        </button>
      </div>
    </motion.div>
  );
}
