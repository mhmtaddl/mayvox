import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Headphones, HeadphoneOff } from 'lucide-react';
import type { UserCardProps } from './types';
import { computeSpeakingVisuals } from './types';
import { getPublicDisplayName } from '../../lib/formatName';
import AvatarContent from '../AvatarContent';

// ── Types ──
interface VoiceNetworkProps {
  participants: {
    props: UserCardProps;
    isCenterUser: boolean;
    isSpeaking: boolean;
    intensity: number;
  }[];
}

// ── Radial distribution ──
// Distribute N nodes evenly around a circle, starting from top (270°)
function distributeAngles(count: number, ringIndex: number): number[] {
  const offset = ringIndex === 0 ? 270 : 270 + 360 / (count * 2); // stagger outer ring
  return Array.from({ length: count }, (_, i) => (offset + (360 / count) * i) % 360);
}

function angleToXY(angleDeg: number, radius: number, cx: number, cy: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

// ── Compact circular node for surrounding users ──
function VoiceNode({
  props,
  isSpeaking,
  intensity,
}: {
  props: UserCardProps;
  isSpeaking: boolean;
  intensity: number;
}) {
  const { user, isMe, isPttPressed, isMuted, isDeafened, isVoiceBanned } = props;
  const v = computeSpeakingVisuals(isSpeaking, intensity, isMe, false);
  const micOff = isMe ? isMuted : (!!user.selfMuted || !!user.isMuted);
  const deafened = isMe ? isDeafened : !!user.selfDeafened;
  const avatarSize = 52;

  const glowShadow = isSpeaking
    ? `0 0 ${12 + v.ringGlow}px rgba(var(--theme-accent-rgb), ${0.15 + intensity * 0.2}), 0 0 ${4 + v.ringSpread * 2}px rgba(var(--theme-accent-rgb), ${0.1 + intensity * 0.15})`
    : '0 0 12px rgba(0,0,0,0.15)';

  return (
    <div
      className="flex flex-col items-center gap-1 cursor-pointer select-none"
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      style={{ width: 80 }}
    >
      {/* Avatar circle */}
      <div className="relative">
        <div
          className="rounded-full overflow-hidden flex items-center justify-center"
          style={{
            width: avatarSize,
            height: avatarSize,
            background: 'rgba(var(--theme-accent-rgb), 0.08)',
            border: isSpeaking
              ? `2px solid rgba(var(--theme-accent-rgb), ${0.5 + intensity * 0.3})`
              : '2px solid rgba(var(--glass-tint), 0.08)',
            boxShadow: glowShadow,
            transition: 'border-color 0.3s, box-shadow 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <AvatarContent
            avatar={user.avatar}
            statusText={user.statusText}
            firstName={user.displayName || user.firstName}
            name={getPublicDisplayName(user)}
            letterClassName="text-[var(--theme-text)] font-bold text-sm"
          />
        </div>

        {/* Mic/deafen badges */}
        {(micOff || deafened) && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {micOff && <div className="w-3.5 h-3.5 rounded-full bg-red-500/80 flex items-center justify-center"><MicOff size={8} className="text-white" /></div>}
            {deafened && <div className="w-3.5 h-3.5 rounded-full bg-red-500/80 flex items-center justify-center"><HeadphoneOff size={8} className="text-white" /></div>}
          </div>
        )}

        {/* Speaking pulse ring */}
        {isSpeaking && (
          <motion.div
            className="absolute inset-[-4px] rounded-full pointer-events-none"
            style={{ border: '1.5px solid rgba(var(--theme-accent-rgb), 0.2)' }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Name */}
      <span className="text-[10px] font-medium text-[var(--theme-text)] text-center leading-tight truncate max-w-full opacity-70">
        {getPublicDisplayName(user)}
      </span>
    </div>
  );
}

// ── Center node — richer, larger ──
function CenterNode({
  props,
  isSpeaking,
  intensity,
}: {
  props: UserCardProps;
  isSpeaking: boolean;
  intensity: number;
}) {
  const { user, isMe, isPttPressed, isMuted, isDeafened, isVoiceBanned } = props;
  const v = computeSpeakingVisuals(isSpeaking, intensity, isMe, true);
  const micOff = isMe ? isMuted : (!!user.selfMuted || !!user.isMuted);
  const deafened = isMe ? isDeafened : !!user.selfDeafened;
  const avatarSize = 72;

  const glowShadow = isSpeaking
    ? `0 0 ${20 + v.ringGlow}px rgba(var(--theme-accent-rgb), ${0.2 + intensity * 0.25}), 0 0 ${8 + v.ringSpread * 3}px rgba(var(--theme-accent-rgb), ${0.12 + intensity * 0.18})`
    : '0 0 20px rgba(var(--theme-accent-rgb), 0.06), 0 0 40px rgba(0,0,0,0.1)';

  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer select-none"
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      style={{ width: 100 }}
    >
      {/* Avatar */}
      <div className="relative">
        <motion.div
          animate={{ scale: isSpeaking ? 1.04 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="rounded-full overflow-hidden flex items-center justify-center"
          style={{
            width: avatarSize,
            height: avatarSize,
            background: 'rgba(var(--theme-accent-rgb), 0.1)',
            border: isSpeaking
              ? `2.5px solid rgba(var(--theme-accent-rgb), ${0.6 + intensity * 0.3})`
              : '2.5px solid rgba(var(--theme-accent-rgb), 0.15)',
            boxShadow: glowShadow,
            transition: 'border-color 0.3s, box-shadow 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <AvatarContent
            avatar={user.avatar}
            statusText={user.statusText}
            firstName={user.displayName || user.firstName}
            name={getPublicDisplayName(user)}
            letterClassName="text-[var(--theme-text)] font-bold text-xl"
          />
        </motion.div>

        {/* Badges */}
        {(micOff || deafened) && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {micOff && <div className="w-4 h-4 rounded-full bg-red-500/80 flex items-center justify-center"><MicOff size={9} className="text-white" /></div>}
            {deafened && <div className="w-4 h-4 rounded-full bg-red-500/80 flex items-center justify-center"><HeadphoneOff size={9} className="text-white" /></div>}
          </div>
        )}

        {/* Speaking outer ring */}
        {isSpeaking && (
          <motion.div
            className="absolute inset-[-6px] rounded-full pointer-events-none"
            style={{ border: '2px solid rgba(var(--theme-accent-rgb), 0.15)' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.1, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

      </div>

      {/* Name */}
      <span className="text-[12px] font-semibold text-[var(--theme-text)] text-center leading-tight truncate max-w-full">
        {getPublicDisplayName(user)}
      </span>
    </div>
  );
}

// ── Main component ──
export default function VoiceNetwork({ participants }: VoiceNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const centerUser = participants.find(p => p.isCenterUser);
  const others = participants.filter(p => !p.isCenterUser);

  const cx = size.w / 2;
  const cy = size.h / 2;
  const minDim = Math.min(size.w, size.h);

  // Generous radii
  const innerRadius = Math.max(140, minDim * 0.32);
  const outerRadius = innerRadius * 1.55;

  // Split into rings
  const innerCount = Math.min(others.length, 6);
  const outerCount = Math.max(0, others.length - 6);

  const innerAngles = distributeAngles(innerCount, 0);
  const outerAngles = distributeAngles(outerCount, 1);

  const slots = useMemo(() => {
    return others.map((p, i) => {
      const isInner = i < innerCount;
      const ringAngles = isInner ? innerAngles : outerAngles;
      const ringIndex = isInner ? i : i - innerCount;
      const angle = ringAngles[ringIndex] ?? 0;
      const radius = isInner ? innerRadius : outerRadius;
      const pos = angleToXY(angle, radius, cx, cy);
      return { ...p, pos };
    });
  }, [others.length, cx, cy, innerRadius, outerRadius, innerCount, outerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const centerIsSpeaking = centerUser?.isSpeaking ?? false;
  const centerIntensity = centerUser?.intensity ?? 0;

  return (
    <div ref={containerRef} className="relative flex-1 w-full min-h-[450px]">

      {/* ── SVG: Soft connection network ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        <defs>
          <filter id="vn-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
          <filter id="vn-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>
          <radialGradient id="vn-center-aura">
            <stop offset="0%" stopColor="rgba(var(--theme-accent-rgb), 0.08)" />
            <stop offset="70%" stopColor="rgba(var(--theme-accent-rgb), 0.02)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Center aura */}
        <circle cx={cx} cy={cy} r={innerRadius * 0.55} fill="url(#vn-center-aura)" />

        {/* Connections — soft blurred paths */}
        {slots.map((s, i) => {
          const active = s.isSpeaking || centerIsSpeaking;
          const dx = s.pos.x - cx;
          const dy = s.pos.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Perpendicular bow for organic curve
          const bow = dist * 0.08;
          const nx = -dy / dist;
          const ny = dx / dist;
          const mpx = (cx + s.pos.x) / 2 + nx * bow;
          const mpy = (cy + s.pos.y) / 2 + ny * bow;
          const d = `M ${cx} ${cy} Q ${mpx} ${mpy} ${s.pos.x} ${s.pos.y}`;

          const baseWidth = 4;
          const activeWidth = 6;

          return (
            <g key={`c-${i}`}>
              {/* Soft blurred base connection — always visible */}
              <motion.path
                d={d}
                fill="none"
                stroke="rgba(var(--theme-accent-rgb), 1)"
                strokeWidth={active ? activeWidth : baseWidth}
                strokeLinecap="round"
                filter="url(#vn-blur)"
                animate={{ opacity: active ? 0.12 + s.intensity * 0.1 : 0.035 }}
                transition={{ duration: 0.5 }}
              />

              {/* Active glow layer */}
              {active && (
                <motion.path
                  d={d}
                  fill="none"
                  stroke="rgba(var(--theme-accent-rgb), 1)"
                  strokeWidth={activeWidth + 4}
                  strokeLinecap="round"
                  filter="url(#vn-glow)"
                  animate={{ opacity: [0.04, 0.1, 0.04] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {/* Traveling energy dot */}
              {active && (
                <motion.circle
                  r={3.5}
                  fill="rgba(var(--theme-accent-rgb), 0.7)"
                  filter="url(#vn-blur)"
                  animate={{ offsetDistance: ['0%', '100%'], opacity: [0.8, 0.2, 0.8] }}
                  transition={{
                    duration: s.isSpeaking ? 1.2 : 1.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{
                    offsetPath: `path('${d}')`,
                    offsetRotate: '0deg',
                  } as React.CSSProperties}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Center node ── */}
      {centerUser && (
        <div
          className="absolute z-10"
          style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)' }}
        >
          <CenterNode props={centerUser.props} isSpeaking={centerUser.isSpeaking} intensity={centerUser.intensity} />
        </div>
      )}

      {/* ── Remote nodes ── */}
      <AnimatePresence>
        {slots.map((s) => (
          <motion.div
            key={s.props.user.id}
            className="absolute z-10"
            style={{ transform: 'translate(-50%, -50%)' }}
            initial={{ left: cx, top: cy, opacity: 0, scale: 0.3 }}
            animate={{ left: s.pos.x, top: s.pos.y, opacity: 1, scale: 1 }}
            exit={{ left: cx, top: cy, opacity: 0, scale: 0.3 }}
            transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          >
            <VoiceNode props={s.props} isSpeaking={s.isSpeaking} intensity={s.intensity} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
