import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, UserPlus, X } from 'lucide-react';
import { dismiss, handleClick, recordDisplayed, type ToastItem as Toast } from './notificationService';
import { MV_SPRING } from '../../lib/signature';

interface Props {
  toast: Toast;
  ttlMs?: number;
}

// Mini 3-bar EQ — DM toast voice-first kimliği.
// Branded burst: ~2 döngü (2.2s) sonra sessiz rest state'e yerleşir.
// Sonsuz animasyon yok — CPU/GPU ekonomisi + calm UI.
function MiniEq({ color }: { color: string }) {
  const [burstDone, setBurstDone] = useState(false);
  const BAR_COUNT = 3;
  const REST_SCALES = [0.25, 0.35, 0.25]; // sabit minimal siluet (görsel olarak canlı ama hareketsiz)

  if (burstDone) {
    return (
      <div className="flex items-end gap-[2px] h-3 ml-1" aria-hidden="true">
        {REST_SCALES.map((s, i) => (
          <span
            key={i}
            className="w-[2px] h-full rounded-full block"
            style={{
              background: color,
              transformOrigin: 'bottom center',
              transform: `scaleY(${s})`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[2px] h-3 ml-1" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[2px] h-full rounded-full block"
          style={{ background: color, transformOrigin: 'bottom center' }}
          initial={{ scaleY: 0.3 }}
          animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.3] }}
          transition={{
            duration: 1.1,
            repeat: 1, // 2 toplam iterasyon ≈ 2.2s burst
            ease: 'easeInOut',
            delay: i * 0.12,
            repeatType: 'loop',
          }}
          onAnimationComplete={() => {
            // Son bar'dan tetikle — staggered delay nedeniyle en son tamamlanan.
            if (i === BAR_COUNT - 1) setBurstDone(true);
          }}
        />
      ))}
    </div>
  );
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
  const accentGlow = toast.kind === 'dm'
    ? 'rgba(var(--theme-accent-rgb), 0.32)'
    : 'rgba(168,85,247,0.32)';

  // v3: subtle visual mode → dimmer + no EQ + no glow pulse.
  const isSubtle = toast.visualMode === 'toast-subtle';

  // v3.1: Grouped update pulse — revision bump'ta tek-sefer subtle ring.
  // Entrance animation'a dokunmadan sadece bu ek katmanı çalıştırır.
  const [justUpdated, setJustUpdated] = useState(false);
  useEffect(() => {
    if (!toast.revision || toast.revision <= 1) return;
    setJustUpdated(true);
    const t = setTimeout(() => setJustUpdated(false), 380);
    return () => clearTimeout(t);
  }, [toast.revision]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } }}
      transition={MV_SPRING.soft}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => handleClick(toast)}
      className="group relative flex items-start gap-3 w-[340px] cursor-pointer rounded-2xl overflow-hidden backdrop-blur-xl"
      style={{
        background: 'var(--theme-surface-card, rgba(18,20,28,0.94))',
        border: `1px solid rgba(var(--theme-accent-rgb), ${isSubtle ? 0.1 : 0.18})`,
        boxShadow: isSubtle
          ? '0 8px 24px rgba(var(--shadow-base),0.30)'
          : '0 14px 38px rgba(var(--shadow-base),0.45), 0 2px 8px rgba(var(--shadow-base),0.18)',
        opacity: isSubtle ? 0.88 : 1,
      }}
    >
      {/* Arrival glow pulse — sadece ACTIVE/URGENT toast için (subtle'da sessiz). */}
      {!isSubtle && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0.9, boxShadow: `0 0 0 0 ${accentGlow}` }}
          animate={{ opacity: 0, boxShadow: `0 0 0 14px rgba(0,0,0,0)` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      )}

      {/* Grouped update pulse — revision bump'ta subtle inner ring. */}
      {justUpdated && (
        <motion.span
          key={`rev-${toast.revision}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0.55, boxShadow: `inset 0 0 0 0 ${accentGlow}` }}
          animate={{ opacity: 0, boxShadow: `inset 0 0 0 3px rgba(0,0,0,0)` }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
        />
      )}

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
            <span className="text-[12px] font-semibold text-[var(--theme-text)] truncate">
              {toast.title}
            </span>
            {toast.kind === 'dm' && !isSubtle && <MiniEq color={accentColor} />}
          </div>
          {toast.body && (
            <p className="text-[11px] text-[var(--theme-secondary-text)] opacity-70 line-clamp-2 break-words leading-snug">
              {toast.body}
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[var(--theme-secondary-text)] opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-[rgba(var(--glass-tint),0.08)] transition-all duration-150"
          aria-label="Kapat"
        >
          <X size={11} />
        </button>
      </div>
    </motion.div>
  );
}
