import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle, AtSign, Bell, CheckCircle2, Download, Info,
  MessageCircle, ShieldAlert, UserPlus, WifiOff, X,
} from 'lucide-react';
import {
  dismiss, handleClick, recordDisplayed,
  type ToastItem as Toast,
} from './notificationService';

interface Props {
  toast: Toast;
  ttlMs?: number;
}

/**
 * Accent fallback — servis bugün 'dm' | 'invite' üretiyor, ancak Faz 5'te emitter
 * yeni type'ları ('system', 'success', ...) dispatch edecek. O zamana kadar her
 * bilinmeyen kind default cyan'a düşer. Genişletme: yeni case ekle, typecheck temiz.
 */
type ToastAccent = {
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
};

function resolveAccent(kind: string): ToastAccent {
  switch (kind) {
    case 'dm':         return { color: 'var(--theme-accent)', icon: MessageCircle };
    case 'invite':     return { color: 'rgb(168,85,247)',      icon: UserPlus };      // purple
    case 'system':     return { color: 'rgb(96,165,250)',      icon: Info };          // sky-400
    case 'success':    return { color: 'rgb(52,211,153)',      icon: CheckCircle2 };  // emerald-400
    case 'error':      return { color: 'rgb(248,113,113)',     icon: AlertCircle };   // red-400
    case 'role':       return { color: 'rgb(251,146,60)',      icon: ShieldAlert };   // orange-400
    case 'update':     return { color: 'rgb(129,140,248)',     icon: Download };      // indigo-400
    case 'connection': return { color: 'rgb(251,146,60)',      icon: WifiOff };       // orange-400
    case 'mention':    return { color: 'rgb(250,204,21)',      icon: AtSign };        // yellow-400
    case 'action':
    default:           return { color: 'var(--theme-accent)',  icon: Bell };
  }
}

const PULSE_DURATION_MS = 180;

export default function ToastItemView({ toast, ttlMs = 5000 }: Props) {
  const [hovered, setHovered] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const remainingRef = useRef(ttlMs);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRevisionRef = useRef<number>(toast.revision ?? 1);

  useEffect(() => {
    recordDisplayed(toast.id, toast.kind, toast.priority);
  }, [toast.id, toast.kind, toast.priority]);

  // Hover pause: timer + progress bar (CSS animationPlayState) senkron.
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

  // Faz 3: grouping update (revision++) → 180ms subtle pulse. Toast yeniden
  // mount olmaz (id stabil); scale + accent shadow geçici boost ile "yeni bilgi
  // geldi" micro-feedback'i verir.
  useEffect(() => {
    const cur = toast.revision ?? 1;
    if (cur > prevRevisionRef.current) {
      prevRevisionRef.current = cur;
      setIsPulsing(true);
      const t = setTimeout(() => setIsPulsing(false), PULSE_DURATION_MS);
      return () => clearTimeout(t);
    }
    prevRevisionRef.current = cur;
  }, [toast.revision]);

  const { color: accent, icon: Icon } = resolveAccent(toast.kind);
  const avatar = toast.avatar;
  const hasAvatar = typeof avatar === 'string' && avatar.startsWith('http');
  const isSubtle = toast.visualMode === 'toast-subtle';
  const count = toast.groupCount ?? 1;
  const showBadge = count > 1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: hovered ? 1.012 : (isPulsing ? 1.02 : 1),
      }}
      exit={{ opacity: 0, x: 36, scale: 0.98, transition: { duration: 0.20, ease: [0.32, 0, 0.67, 0] } }}
      transition={{
        // Pulse: kısa duration ease (snap-in hissi)
        // Hover/idle: spring (mevcut Faz 2 davranışı)
        scale: isPulsing
          ? { duration: PULSE_DURATION_MS / 1000, ease: [0.16, 1, 0.3, 1] }
          : { type: 'spring', stiffness: 380, damping: 30, mass: 0.6 },
        default: { type: 'spring', stiffness: 380, damping: 30, mass: 0.6 },
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => handleClick(toast)}
      className="group relative flex items-stretch w-[320px] cursor-pointer rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(14px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.35)',
        boxShadow: isPulsing
          // Pulse: accent glow biraz daha belirgin — kısa süre, neon değil.
          ? `0 10px 26px -12px rgba(0,0,0,0.40), 0 0 0 1px ${accent}28, 0 0 32px -8px ${accent}44`
          : hovered
            ? `0 10px 26px -14px rgba(0,0,0,0.38), 0 0 0 1px ${accent}14, 0 0 28px -12px ${accent}26`
            : '0 8px 22px -14px rgba(0,0,0,0.32), 0 1px 2px 0 rgba(0,0,0,0.12)',
        opacity: isSubtle ? 0.9 : 1,
        transition: 'box-shadow 220ms ease-out',
      }}
    >
      {/* Sol aksan — 2px + kısık glow (neon değil) */}
      <div
        className="w-[2px] shrink-0"
        style={{
          background: accent,
          boxShadow: `0 0 4px 0 ${accent}55, 0 0 10px 0 ${accent}1a`,
        }}
      />

      {/* İçerik */}
      <div className="flex-1 min-w-0 flex items-start gap-3 pl-3 pr-3 py-3 relative">
        {/* Icon + badge wrapper — badge icon kutusunun sağ üstünden çıkıntı yapar */}
        <div className="shrink-0 relative">
          <div
            className="w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center"
            style={{
              background: hasAvatar
                ? 'transparent'
                : `linear-gradient(135deg, ${accent}1a, ${accent}08)`,
              border: hasAvatar ? '1px solid rgba(255,255,255,0.05)' : `1px solid ${accent}1f`,
            }}
          >
            {hasAvatar
              ? <img src={avatar!} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <Icon size={16} style={{ color: accent }} />
            }
          </div>

          {/* Faz 3: grouped count badge — groupCount > 1 ise görünür, 99+ cap */}
          {showBadge && (
            <div
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold leading-none tabular-nums pointer-events-none"
              style={{
                background: accent,
                color: '#fff',
                boxShadow: `0 1px 4px ${accent}55`,
                border: '1.5px solid rgba(0,0,0,0.35)',
              }}
              aria-label={`${count} yeni`}
            >
              {count > 99 ? '99+' : count}
            </div>
          )}
        </div>

        {/* Metin */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[12.5px] font-semibold text-[var(--theme-text)] truncate tracking-[-0.01em]">
              {toast.title}
            </span>
          </div>
          {toast.body && (
            <p className="text-[11px] text-[var(--theme-secondary-text)]/80 line-clamp-2 break-words leading-snug">
              {toast.body}
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
          className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[var(--theme-secondary-text)] opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-white/5 transition-opacity duration-150"
          aria-label="Kapat"
        >
          <X size={11} />
        </button>
      </div>

      {/* Alt progress — 1.5px ince, yatay opacity fade (premium hissi), CSS keyframe
          hover pause ile senkron. İlk 140ms opacity fade-in (tam dolu blok olarak
          patlamasın); ardından scaleX 1→0 ttl boyunca. Trailing edge soluklaştığı
          için "düz blok" yok. */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1.5px] pointer-events-none"
        style={{
          background: `linear-gradient(to right, ${accent}e0 0%, ${accent}99 55%, ${accent}33 100%)`,
          transformOrigin: 'left center',
          animation: `toast-progress-fadein 140ms ease-out forwards, toast-progress ${ttlMs}ms linear forwards`,
          animationPlayState: hovered ? 'paused' : 'running',
          willChange: 'transform, opacity',
        }}
      />
    </motion.div>
  );
}
