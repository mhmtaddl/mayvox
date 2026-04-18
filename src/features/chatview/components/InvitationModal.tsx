import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import {
  PhoneCall, PhoneOff, User as UserIcon,
  ChevronRight, ChevronLeft,
} from 'lucide-react';
import { hasCustomAvatar } from '../../../lib/statusAvatar';

interface InvitationData {
  inviterId: string;
  inviterName: string;
  inviterAvatar?: string;
  roomName: string;
  roomId: string;
  serverName?: string;
  serverAvatar?: string | null;
}

interface Props {
  data: InvitationData;
  onAccept: () => void;
  onDecline: () => void;
  onMute: () => void;
  isMuted: boolean;
}

// ── Geometry ────────────────────────────────────────────────────────────
const BANNER_W = 360;
const BANNER_H = 68;
const RAIL_W = 12;
const RAIL_W_HOVER = 16;
const COLLAPSE_TX = BANNER_W - RAIL_W;

// ── Positioning ─────────────────────────────────────────────────────────
// Topbar altından geçir. Topbar varsa ResizeObserver ile takip et; yoksa fallback.
const TOPBAR_SELECTOR = '[data-topbar-anchor]';
const FALLBACK_TOP = 96;
const GAP_BELOW_TOPBAR = 12;

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Exit reason ─────────────────────────────────────────────────────────
type ExitReason = 'accept' | 'reject' | 'timeout';

/**
 * Exit variants — motion/react için. Reason'a göre ayrı animasyon.
 * `custom` prop ile reason'ı passedown ediyoruz; AnimatePresence unmount'u
 * tetiklediğinde variants.exit(custom) çağrılır.
 */
const EXIT_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

const exitVariants: Variants = {
  // Accept: hafif küçül + aşağı drift + ince blur. Sakin tamamlanma.
  accept: {
    opacity: 0,
    scale: 0.96,
    y: 6,
    filter: 'blur(2px)',
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
  // Reject: sağa flick + fade. Hızlı dismiss hissi.
  reject: {
    opacity: 0,
    x: 14,
    scale: 0.99,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  },
  // Timeout: "sönme" — blur büyür, opacity düşer, scale hafif küçülür.
  // En premium exit; kullanıcı aksiyon almadı, sistem sakin kapatır.
  timeout: {
    opacity: 0,
    scale: 0.97,
    filter: 'blur(6px)',
    transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  },
  // Collapsed state'te exit: rail'in kendisi shrink + fade.
  // x position collapsed'da 348 — orada kalır; sadece opacity + scale değişir.
  collapsedExit: {
    opacity: 0,
    scale: 0.72,
    x: COLLAPSE_TX,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function InvitationModal({
  data, onAccept, onDecline, onMute, isMuted,
}: Props) {
  const locationLine = data.serverName
    ? `${data.serverName} • ${data.roomName}`
    : data.roomName;

  // ── Elapsed timer ─────────────────────────────────────────────────────
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Positioning (topbar-anchored) ─────────────────────────────────────
  const [topPx, setTopPx] = useState(FALLBACK_TOP);
  useEffect(() => {
    const anchor = document.querySelector<HTMLElement>(TOPBAR_SELECTOR);
    if (!anchor) {
      setTopPx(FALLBACK_TOP);
      return;
    }
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      // rect.bottom viewport-relative; fixed positioning ile aynı frame → doğrudan kullan.
      setTopPx(Math.max(8, Math.round(rect.bottom + GAP_BELOW_TOPBAR)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    window.addEventListener('resize', update);
    // Sidebar collapse/expand gibi geometry değişimlerini yakalamak için.
    const mo = new MutationObserver(update);
    mo.observe(anchor, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // ── Collapse/expand ──────────────────────────────────────────────────
  const collapsed = isMuted;
  const [railHover, setRailHover] = useState(false);

  // ── Exit reason & staged unmount ──────────────────────────────────────
  // Internal state: accept/reject seçildiğinde reason set edilir, bir sonraki
  // frame'de parent callback'i çağrılır. Böylece component re-render olup
  // exitVariants için doğru custom value'yu taşır, sonra parent unmount eder.
  const [exitReason, setExitReason] = useState<ExitReason | null>(null);
  const exitReasonRef = useRef<ExitReason | null>(null);
  exitReasonRef.current = exitReason;

  useEffect(() => {
    if (!exitReason || exitReason === 'timeout') return;
    // State committed → parent callback'ini bir sonraki frame'de çağır.
    // Bu sıra önemli: AnimatePresence exit prop'unu unmount anında okur.
    const id = requestAnimationFrame(() => {
      if (exitReason === 'accept') onAccept();
      else if (exitReason === 'reject') onDecline();
    });
    return () => cancelAnimationFrame(id);
  }, [exitReason, onAccept, onDecline]);

  const handleAcceptClick = useCallback(() => {
    if (exitReasonRef.current) return; // idempotent
    setExitReason('accept');
  }, []);

  const handleDeclineClick = useCallback(() => {
    if (exitReasonRef.current) return;
    setExitReason('reject');
  }, []);

  // AnimatePresence custom resolver — collapsed state ise rail-exit variant'ı kullan,
  // değilse reason'a göre (reason null ise timeout — parent-driven unmount).
  const resolveExitVariant = (): keyof typeof exitVariants => {
    if (collapsed) return 'collapsedExit';
    return exitReasonRef.current ?? 'timeout';
  };

  const acceptRef = useRef<HTMLButtonElement>(null);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="incoming-call-banner"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, x: collapsed ? COLLAPSE_TX : 0 }}
        exit={exitVariants[resolveExitVariant()]}
        transition={{
          opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
          y:       { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
          x:       { duration: 0.34, ease: [0.22, 1, 0.36, 1] }, // collapse slide
        }}
        style={{
          position: 'fixed',
          top: topPx,
          right: 24,
          zIndex: 400,
          pointerEvents: 'auto',
          width: BANNER_W,
          height: BANNER_H,
          background:
            'var(--surface-base, linear-gradient(180deg, rgba(32,32,38,0.86) 0%, rgba(20,20,24,0.86) 100%))',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: 22,
          boxShadow: [
            '0 18px 44px -12px rgba(0,0,0,0.55)',
            '0 6px 16px -4px rgba(0,0,0,0.30)',
            '0 1px 2px rgba(0,0,0,0.15)',
            'inset 0 1px 0 rgba(255,255,255,0.05)',
          ].join(', '),
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          willChange: 'transform, opacity, filter',
        }}
      >
        <CollapseRail
          collapsed={collapsed}
          hover={railHover}
          onEnter={() => setRailHover(true)}
          onLeave={() => setRailHover(false)}
          onClick={onMute}
        />

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              key="banner-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.22, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-0 right-0 bottom-0 flex items-center gap-3"
              style={{
                left: RAIL_W,
                paddingLeft: 8,
                paddingRight: 12,
                zIndex: 1,
              }}
            >
              <CallAvatar avatar={data.inviterAvatar} name={data.inviterName} />

              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <p
                  className="text-[14px] font-semibold truncate leading-[1.15]"
                  style={{
                    color: 'var(--text-primary, rgba(255,255,255,0.96))',
                    letterSpacing: '-0.015em',
                  }}
                  title={data.inviterName}
                >
                  {data.inviterName}
                </p>
                <p
                  className="text-[12px] font-medium truncate leading-[1.3] mt-[2px]"
                  style={{ color: 'var(--text-secondary, rgba(255,255,255,0.58))' }}
                  title={locationLine}
                >
                  {locationLine}
                </p>
              </div>

              <span
                className="text-[11.5px] font-medium tabular-nums shrink-0 select-none"
                style={{
                  color: 'var(--text-secondary, rgba(255,255,255,0.52))',
                  letterSpacing: '0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-label="Çalma süresi"
              >
                {formatDuration(elapsedSec)}
              </span>

              <ActionButton
                onClick={handleDeclineClick}
                kind="reject"
                size={32}
                title="Reddet"
                aria-label="Daveti reddet"
              >
                <PhoneOff size={14} strokeWidth={1.75} />
              </ActionButton>
              <ActionButton
                ref={acceptRef}
                onClick={handleAcceptClick}
                kind="accept"
                size={36}
                title="Kabul et"
                aria-label="Daveti kabul et"
              >
                <PhoneCall size={15} strokeWidth={1.75} />
              </ActionButton>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── CollapseRail ───────────────────────────────────────────────────────
interface RailProps {
  collapsed: boolean;
  hover: boolean;
  onClick: () => void;
  onEnter: () => void;
  onLeave: () => void;
}

function CollapseRail({ collapsed, hover, onClick, onEnter, onLeave }: RailProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={collapsed ? 'Çağrı bandını geri aç' : 'Çağrı bandını küçült'}
      aria-pressed={collapsed}
      animate={
        collapsed
          ? { opacity: [0.82, 1, 0.82] }
          : { opacity: hover ? 0.98 : 0.65 }
      }
      transition={
        collapsed
          ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.18, ease: 'easeOut' }
      }
      className="absolute left-0 top-0 bottom-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        zIndex: 2,
        cursor: 'pointer',
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        width: hover ? RAIL_W_HOVER : RAIL_W,
        borderTopLeftRadius: 22,
        borderBottomLeftRadius: 22,
        background: collapsed
          ? 'linear-gradient(180deg, color-mix(in srgb, var(--danger, #E55B54) 62%, transparent) 0%, color-mix(in srgb, var(--danger, #E55B54) 36%, transparent) 100%)'
          : 'linear-gradient(180deg, var(--accent, #7c8cf4) 0%, color-mix(in srgb, var(--accent, #7c8cf4) 60%, transparent) 100%)',
        boxShadow: [
          'inset 1px 0 0 rgba(255,255,255,0.08)',
          'inset -1px 0 2px rgba(0,0,0,0.22)',
          hover ? '2px 0 10px -2px color-mix(in srgb, var(--accent, #7c8cf4) 35%, transparent)' : '',
        ].filter(Boolean).join(', '),
        transition:
          'width 180ms cubic-bezier(0.22,1,0.36,1), ' +
          'box-shadow 220ms cubic-bezier(0.4,0,0.2,1), ' +
          'background 280ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <span
        style={{
          color: 'rgba(255,255,255,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
        }}
      >
        {collapsed
          ? <ChevronLeft size={10} strokeWidth={2.25} />
          : <ChevronRight size={10} strokeWidth={2.25} />}
      </span>
    </motion.button>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────
function CallAvatar({ avatar, name }: { avatar?: string; name: string }) {
  const hasImg = hasCustomAvatar(avatar);
  return (
    <div
      className="relative w-10 h-10 shrink-0 overflow-hidden flex items-center justify-center"
      style={{
        borderRadius: 13,
        background: hasImg
          ? 'transparent'
          : 'linear-gradient(135deg, var(--surface-1, rgba(255,255,255,0.06)) 0%, var(--surface-base, rgba(255,255,255,0.02)) 100%)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.20)',
      }}
    >
      {hasImg ? (
        <img
          src={avatar!}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <UserIcon
          size={19}
          strokeWidth={1.5}
          style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
        />
      )}
    </div>
  );
}

// ── ActionButton ───────────────────────────────────────────────────────
type ButtonKind = 'accept' | 'reject';

interface ActionButtonProps {
  kind: ButtonKind;
  size: number;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  'aria-label': string;
}

const BUTTON_PALETTE: Record<ButtonKind, {
  bg: string; border: string; color: string;
  hoverBg: string; hoverBorder: string; hoverColor: string;
  shadow: string; hoverShadow: string;
}> = {
  accept: {
    bg: 'linear-gradient(180deg, color-mix(in srgb, var(--success, #30D158) 22%, transparent) 0%, color-mix(in srgb, var(--success, #30D158) 12%, transparent) 100%)',
    border: 'color-mix(in srgb, var(--success, #30D158) 40%, transparent)',
    color: 'var(--success, #30D158)',
    hoverBg: 'linear-gradient(180deg, var(--success, #30D158) 0%, color-mix(in srgb, var(--success, #30D158) 82%, black) 100%)',
    hoverBorder: 'color-mix(in srgb, var(--success, #30D158) 60%, transparent)',
    hoverColor: '#ffffff',
    shadow: '0 3px 10px -2px color-mix(in srgb, var(--success, #30D158) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.12)',
    hoverShadow: '0 6px 16px -4px color-mix(in srgb, var(--success, #30D158) 48%, transparent), inset 0 1px 0 rgba(255,255,255,0.22)',
  },
  reject: {
    bg: 'linear-gradient(180deg, color-mix(in srgb, var(--danger, #E55B54) 18%, transparent) 0%, color-mix(in srgb, var(--danger, #E55B54) 10%, transparent) 100%)',
    border: 'color-mix(in srgb, var(--danger, #E55B54) 36%, transparent)',
    color: 'var(--danger, #E55B54)',
    hoverBg: 'linear-gradient(180deg, var(--danger, #E55B54) 0%, color-mix(in srgb, var(--danger, #E55B54) 82%, black) 100%)',
    hoverBorder: 'color-mix(in srgb, var(--danger, #E55B54) 55%, transparent)',
    hoverColor: '#ffffff',
    shadow: '0 3px 10px -2px color-mix(in srgb, var(--danger, #E55B54) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)',
    hoverShadow: '0 5px 14px -4px color-mix(in srgb, var(--danger, #E55B54) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.18)',
  },
};

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ kind, size, onClick, children, title, ...aria }, ref) {
    const p = BUTTON_PALETTE[kind];
    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={onClick}
        title={title}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96, y: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.6 }}
        className="relative shrink-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          background: p.bg,
          border: `1px solid ${p.border}`,
          color: p.color,
          boxShadow: p.shadow,
          transition:
            'background 220ms cubic-bezier(0.4,0,0.2,1), ' +
            'border-color 220ms cubic-bezier(0.4,0,0.2,1), ' +
            'color 180ms cubic-bezier(0.4,0,0.2,1), ' +
            'box-shadow 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.background = p.hoverBg;
          b.style.borderColor = p.hoverBorder;
          b.style.color = p.hoverColor;
          b.style.boxShadow = p.hoverShadow;
        }}
        onMouseLeave={(e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.background = p.bg;
          b.style.borderColor = p.border;
          b.style.color = p.color;
          b.style.boxShadow = p.shadow;
        }}
        aria-label={aria['aria-label']}
      >
        {children}
      </motion.button>
    );
  }
);
