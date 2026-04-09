import React from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, ShieldCheck, Monitor, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import type { UserCardProps } from './types';
import { computeSpeakingVisuals } from './types';
import { formatFullName } from '../../lib/formatName';

// ── Spring presets ──
const LAYOUT_SPRING = { type: 'spring' as const, stiffness: 250, damping: 26 };
const SCALE_SPRING = { type: 'spring' as const, stiffness: 350, damping: 22 };

// ── Avatar sizes ──
const AVATAR_IDLE = 80;
const AVATAR_SPEAKING = 88;
const AVATAR_DOMINANT = 96;

// ── Card widths ──
const CARD_W_IDLE = 140;
const CARD_W_DOMINANT = 156;

function VoiceAvatarInner({
  user,
  isMe,
  isSpeakingActive,
  isDominant,
  intensity,
  isPttPressed,
  isMuted,
  isDeafened,
  isVoiceBanned,
  onClick,
  onDoubleClick,
  onContextMenu,
}: UserCardProps) {
  const v = computeSpeakingVisuals(isSpeakingActive, intensity, isMe, isDominant);
  const isOwnVoiceActive = isMe && isPttPressed && !isMuted && !isVoiceBanned;
  const isSpeakingAny = isOwnVoiceActive || (user.isSpeaking && !(isMe ? isMuted : (!!user.selfMuted || !!user.isMuted)));

  const avatarSize = isDominant ? AVATAR_DOMINANT : isSpeakingActive ? AVATAR_SPEAKING : AVATAR_IDLE;
  const scaleVal = isDominant ? 1.04 : isSpeakingActive ? 1.01 : 1;
  const cardWidth = isDominant ? CARD_W_DOMINANT : CARD_W_IDLE;

  // Mic/headphone state
  const micOff = isMe ? isMuted : (!!user.selfMuted || !!user.isMuted);
  const deafened = isMe ? isDeafened : !!user.selfDeafened;

  // PTT-armed: PTT basılı ama speaking henüz aktif değil
  const isPttArmed = isOwnVoiceActive && !isSpeakingActive;

  // Glow
  const glowShadow = isSpeakingActive
    ? `0 0 0 ${2 + v.ringSpread}px rgba(var(--theme-accent-rgb), ${0.2 + intensity * 0.2}), 0 0 ${v.ringGlow * 1.2}px rgba(var(--theme-accent-rgb), ${0.06 + intensity * 0.12})`
    : isPttArmed
      ? '0 0 0 2px rgba(var(--theme-accent-rgb), 0.15), 0 0 8px rgba(var(--theme-accent-rgb), 0.06)'
      : 'none';

  // Card background
  const cardBg = isSpeakingActive
    ? `rgba(var(--theme-accent-rgb), ${0.06 + intensity * 0.06})`
    : isMe
      ? 'rgba(var(--glass-tint), 0.04)'
      : 'rgba(var(--glass-tint), 0.025)';

  const cardBorder = isSpeakingActive
    ? `rgba(var(--theme-accent-rgb), ${0.15 + intensity * 0.2})`
    : isMe
      ? 'rgba(var(--glass-tint), 0.06)'
      : 'rgba(var(--glass-tint), 0.04)';

  // Opacity hierarchy — muted users dimmer
  const nodeOpacity = (micOff && deafened) ? 0.55 : micOff ? 0.7 : isDominant ? 1 : isSpeakingActive ? 0.95 : 0.82;

  // Moderator crown SVG
  const modCrown = (
    <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="w-2.5 h-2.5 shrink-0">
      <path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/>
      <rect x="2" y="12" width="12" height="1.5" rx="0.5"/>
    </svg>
  );

  return (
    <motion.div
      layout
      layoutId={`voice-${user.id}`}
      transition={LAYOUT_SPRING}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      animate={{
        opacity: nodeOpacity,
        y: isSpeakingActive ? -2 : 0,
        filter: micOff && deafened ? 'grayscale(0.5)' : 'grayscale(0)',
      }}
      className="flex flex-col items-center cursor-pointer group select-none rounded-2xl p-3 pt-4 pb-2.5"
      style={{
        width: cardWidth,
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        boxShadow: isSpeakingActive
          ? `0 4px 20px rgba(var(--theme-accent-rgb), ${0.06 + intensity * 0.08})`
          : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'background 0.3s ease, border-color 0.3s ease, box-shadow 0.4s ease, width 0.3s ease',
      }}
    >
      {/* ── Avatar ── */}
      <div className="relative mb-2.5">
        <motion.div
          animate={{ scale: scaleVal }}
          transition={SCALE_SPRING}
          className="rounded-full overflow-hidden flex items-center justify-center"
          style={{
            width: avatarSize,
            height: avatarSize,
            background: 'rgba(var(--theme-accent-rgb), 0.08)',
            border: isSpeakingActive
              ? `2.5px solid rgba(var(--theme-accent-rgb), ${0.5 + intensity * 0.3})`
              : isPttArmed
                ? '2px solid rgba(var(--theme-accent-rgb), 0.25)'
                : isMe
                  ? '2px solid rgba(var(--theme-accent-rgb), 0.12)'
                  : '2px solid rgba(var(--glass-tint), 0.06)',
            boxShadow: glowShadow,
            transition: 'border-color 0.3s ease, box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s ease, height 0.3s ease',
          }}
        >
          {user.avatar?.startsWith('http') ? (
            <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-[var(--theme-text)] font-bold" style={{ fontSize: avatarSize * 0.28 }}>
              {user.avatar}
            </span>
          )}
        </motion.div>

        {/* Speaking outer pulse ring */}
        {isSpeakingActive && (
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-[-5px] rounded-full pointer-events-none"
            style={{ border: '2px solid rgba(var(--theme-accent-rgb), 0.2)' }}
          />
        )}
      </div>

      {/* ── Name + role row ── */}
      <div className="flex items-center gap-1 max-w-full mb-1">
        <span
          className="text-[12px] text-center leading-tight truncate text-[var(--theme-text)]"
          style={{
            fontWeight: isDominant ? 700 : isSpeakingActive ? 600 : 500,
            transition: 'font-weight 0.3s ease',
          }}
        >
          {formatFullName(user.firstName, user.lastName)}
        </span>
        {/* Role icon — immediately right of name */}
        {user.isAdmin && (
          <ShieldCheck size={11} className="text-[var(--theme-accent)] shrink-0 opacity-70" strokeWidth={2.5} />
        )}
        {!user.isAdmin && user.isModerator && modCrown}
      </div>

      {/* ── Metadata row: device → headphone → mic → equalizer ── */}
      <div className="flex items-center gap-1.5 h-4 opacity-60 group-hover:opacity-90 transition-opacity">
        {/* 1. Device/platform */}
        {user.platform === 'mobile' ? (
          <Smartphone size={11} className="text-[var(--theme-secondary-text)] shrink-0" strokeWidth={2} />
        ) : user.platform === 'desktop' ? (
          <Monitor size={11} className="text-[var(--theme-secondary-text)] shrink-0" strokeWidth={2} />
        ) : null}

        {/* 2. Headphone — smooth transition */}
        <span className="shrink-0 transition-all duration-150" style={{ transform: deafened ? 'scale(1.1)' : 'scale(1)' }}>
          {deafened ? (
            <HeadphoneOff size={11} className="text-red-400" />
          ) : (
            <Headphones size={11} className="text-[var(--theme-secondary-text)]" />
          )}
        </span>

        {/* 3. Microphone — smooth transition */}
        <span className="shrink-0 transition-all duration-150" style={{ transform: micOff ? 'scale(1.1)' : 'scale(1)' }}>
          {micOff ? (
            <MicOff size={11} className="text-red-400" />
          ) : (
            <Mic size={11} className="text-[var(--theme-secondary-text)]" />
          )}
        </span>

        {/* 4. Speaking equalizer */}
        {isSpeakingAny && (
          <div className="flex items-center gap-[2px] h-3 ml-0.5">
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                animate={{ scaleY: [0.25, 1, 0.25] }}
                transition={{
                  duration: isOwnVoiceActive ? 0.4 : 0.55,
                  repeat: Infinity,
                  delay: i * 0.08,
                  ease: 'easeInOut',
                }}
                className="w-[2.5px] h-full rounded-full origin-center"
                style={{ background: `rgba(var(--theme-accent-rgb), ${isOwnVoiceActive ? 0.9 : 0.6})` }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Memo comparator ──
function arePropsEqual(prev: UserCardProps, next: UserCardProps): boolean {
  if (prev.isSpeakingActive !== next.isSpeakingActive) return false;
  if (prev.isDominant !== next.isDominant) return false;
  if (prev.isMe !== next.isMe) return false;
  if (next.isSpeakingActive && Math.abs(prev.intensity - next.intensity) > 0.05) return false;
  if (prev.isMuted !== next.isMuted) return false;
  if (prev.isDeafened !== next.isDeafened) return false;
  if (prev.isVoiceBanned !== next.isVoiceBanned) return false;
  if (prev.isPttPressed !== next.isPttPressed) return false;
  const pu = prev.user, nu = next.user;
  if (pu.id !== nu.id) return false;
  if (pu.isSpeaking !== nu.isSpeaking) return false;
  if (pu.selfMuted !== nu.selfMuted) return false;
  if (pu.selfDeafened !== nu.selfDeafened) return false;
  if (pu.isMuted !== nu.isMuted) return false;
  if (pu.isAdmin !== nu.isAdmin) return false;
  if (pu.isModerator !== nu.isModerator) return false;
  if (pu.avatar !== nu.avatar) return false;
  if (pu.firstName !== nu.firstName) return false;
  if (pu.lastName !== nu.lastName) return false;
  if (pu.platform !== nu.platform) return false;
  return true;
}

const VoiceAvatar = React.memo(VoiceAvatarInner, arePropsEqual);
export default VoiceAvatar;
