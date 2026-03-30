import React from 'react';
import {
  Mic,
  Headphones,
  PhoneCall,
  Recycle,
  ShieldCheck,
  Shield,
} from 'lucide-react';
import type { UserCardProps } from './types';
import { computeSpeakingVisuals } from './types';
import OwnVoiceEqualizer from './OwnVoiceEqualizer';
import MiniEqualizer from './MiniEqualizer';
import { formatFullName } from '../../lib/formatName';

// ─── Refined transition curves ────────────────────────────────────
// Property-specific transitions — no "all", no "filter"
const CARD_TRANSITION = [
  'background 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  'border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
  'opacity 0.4s ease',
].join(', ');

const AVATAR_TRANSITION = 'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)';

// ─── Static idle styles (no animation) ────────────────────────────
const IDLE_AVATAR_STYLE: React.CSSProperties = {
  boxShadow: '0 0 0 1px rgba(var(--theme-accent-rgb), 0.05), 0 0 6px rgba(var(--theme-accent-rgb), 0.03)',
};

const IDLE_CARD_STYLE: React.CSSProperties = {
  border: '1px solid transparent',
  borderColor: 'rgba(var(--theme-accent-rgb), 0.08)',
};

function UserCardInner({
  user,
  isMe,
  isOwner,
  isSpeakingActive,
  isDominant,
  intensity,
  scale: s,
  adminBorderEffect,
  isPttPressed,
  isMuted,
  isDeafened,
  isVoiceBanned,
  volumeLevel,
  speakingLevel,
  statusTimer,
  effectiveStatus,
  onClick,
  onDoubleClick,
}: UserCardProps) {
  const hasRole = isOwner || !!user.isAdmin || !!user.isModerator;
  const v = computeSpeakingVisuals(isSpeakingActive, intensity, isMe, isDominant);

  // Map 5 card scales → 3 equalizer sizes (small/medium/large)
  const scaleStep = s.dense ? 1 : s.icon === 13 ? 2 : 3;

  // ─── 1) Dominant speaker: subtle translateY ───────────────────
  const dominantLift = isDominant ? -3 : 0;

  // ─── Card styles ──────────────────────────────────────────────
  const cardBackground = isSpeakingActive
    ? `linear-gradient(135deg, rgba(var(--theme-accent-rgb), ${v.surfaceAlpha}) 0%, rgba(var(--theme-accent-rgb), ${v.surfaceAlpha * 0.35}) 100%)`
    : `linear-gradient(135deg, rgba(var(--theme-accent-rgb), ${v.surfaceAlpha}) 0%, rgba(var(--theme-accent-rgb), ${v.surfaceAlpha * 0.4}) 100%)`;

  const cardShadow = isSpeakingActive
    ? `0 0 ${v.glowSpread}px rgba(var(--theme-accent-rgb), ${v.glowAlpha}), 0 0 4px rgba(var(--theme-accent-rgb), ${v.glowAlpha * 0.4}), inset 0 1px 0 rgba(var(--theme-accent-rgb), 0.05)`
    : '0 1px 3px rgba(var(--shadow-base),0.08), inset 0 1px 0 rgba(var(--glass-tint),0.03)';

  // ─── 2) Avatar shadow: reactive when speaking, static when idle ─
  const avatarShadow = isSpeakingActive
    ? `0 0 0 ${v.ringSpread}px rgba(var(--theme-accent-rgb), ${0.4 + intensity * 0.25}), 0 0 ${v.ringGlow}px rgba(var(--theme-accent-rgb), ${0.12 + intensity * 0.22})`
    : undefined;

  const avatarStyle: React.CSSProperties = isSpeakingActive
    ? { transition: AVATAR_TRANSITION, boxShadow: avatarShadow }
    : IDLE_AVATAR_STYLE;

  // ─── Role badge size (scales with card) ────────────────────────
  const badgeSize = s.dense ? 'w-3.5 h-3.5' : s.icon === 13 ? 'w-4 h-4' : 'w-[18px] h-[18px]';
  const badgeIconSize = s.dense ? 8 : s.icon === 13 ? 9 : 10;

  // Age font size
  const ageFontSize = s.dense ? 'text-[9px]' : s.icon === 13 ? 'text-[10px]' : 'text-[11px]';

  // Status text for current user or remote
  const userStatusText = isMe ? effectiveStatus : (user.statusText || 'Aktif');

  // Status dot color
  const statusDotColor =
    userStatusText === 'Aktif'
      ? 'bg-emerald-400'
      : userStatusText === 'Telefonda'
        ? 'bg-red-400'
        : userStatusText === 'AFK'
          ? 'bg-violet-400'
          : 'bg-orange-400';

  // Own voice active state
  const isOwnVoiceActive = isMe && isPttPressed && !isMuted && !isVoiceBanned;

  // ─── Dominant vs non-dominant: opacity shift (no filter:saturate) ─
  const isNonDominantSpeaker = isSpeakingActive && !isDominant;
  const cardOpacity = isNonDominantSpeaker ? 0.88 : 1;
  // Dominant: name gets bolder + slightly wider tracking for focus lock
  const nameFontWeight = isDominant ? 700 : 600;
  const nameLetterSpacing = isDominant ? '0.01em' : '0em';

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`rounded-xl ${s.padding} flex items-center ${s.gap} relative group cursor-pointer ${
        isSpeakingActive ? '' : 'hover:scale-[1.008]'
      }`}
      style={isSpeakingActive ? {
        contain: 'layout paint',
        transition: CARD_TRANSITION,
        transform: `translateY(${dominantLift}px)`,
        opacity: cardOpacity,
        background: cardBackground,
        border: '1px solid transparent',
        borderColor: `rgba(var(--theme-accent-rgb), ${v.borderAlpha})`,
        boxShadow: cardShadow,
      } : {
        contain: 'layout paint',
        background: cardBackground,
        boxShadow: cardShadow,
        ...IDLE_CARD_STYLE,
      }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={`${s.avatar} rounded-lg bg-[var(--theme-accent)]/8 flex items-center justify-center text-[var(--theme-text)] font-bold overflow-hidden`}
          style={avatarStyle}
        >
          {user.avatar && user.avatar.startsWith('http') ? (
            <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            user.avatar
          )}
        </div>
        {user.isAdmin && adminBorderEffect && !isSpeakingActive && (
          <div className="absolute inset-[-2px] rounded-lg ring-[1.5px] ring-[var(--theme-accent)]/25 animate-pulse pointer-events-none" />
        )}

        {/* ─── 4) Refined role badges ──────────────────────────── */}
        {hasRole && (
          <div className={`absolute -bottom-0.5 -right-0.5 ${badgeSize} rounded flex items-center justify-center`}
            style={{
              background: user.isAdmin
                ? 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.25), rgba(var(--theme-accent-rgb), 0.12))'
                : user.isModerator
                  ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(139, 92, 246, 0.10))'
                  : 'linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.18), rgba(var(--theme-accent-rgb), 0.08))',
              border: user.isAdmin
                ? '1px solid rgba(var(--theme-accent-rgb), 0.3)'
                : user.isModerator
                  ? '1px solid rgba(139, 92, 246, 0.25)'
                  : '1px solid rgba(var(--theme-accent-rgb), 0.2)',
            }}
          >
            {user.isAdmin ? (
              <ShieldCheck size={badgeIconSize} className="text-[var(--theme-accent)]" strokeWidth={2.5} />
            ) : user.isModerator ? (
              <Shield size={badgeIconSize} className="text-violet-400" strokeWidth={2.5} />
            ) : (
              <Shield size={badgeIconSize} className="text-[var(--theme-accent)]/70" strokeWidth={2} />
            )}
          </div>
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span
            className={`${s.name} truncate text-[var(--theme-text)]`}
            style={{
              fontWeight: nameFontWeight,
              letterSpacing: nameLetterSpacing,
              transition: 'font-weight 0.3s ease, letter-spacing 0.3s ease',
            }}
          >
            {formatFullName(user.firstName, user.lastName)}
          </span>
          <span className={`${ageFontSize} font-medium shrink-0`} style={{ color: 'rgba(var(--theme-accent-rgb), 0.4)' }}>
            {user.age}
          </span>

          {/* ─── 4) Refined inline role indicators ──────────── */}
          {user.isAdmin && (
            <span
              className={`shrink-0 ${s.dense ? 'text-[7px] px-1' : s.icon === 13 ? 'text-[7px] px-1.5' : 'text-[8px] px-1.5'} font-bold py-px rounded leading-none tracking-wide`}
              style={{
                background: 'rgba(var(--theme-accent-rgb), 0.1)',
                color: 'var(--theme-accent)',
                border: '1px solid rgba(var(--theme-accent-rgb), 0.15)',
              }}
            >
              ADMIN
            </span>
          )}
          {!user.isAdmin && user.isModerator && (
            <span
              className={`shrink-0 ${s.dense ? 'text-[7px] px-1' : s.icon === 13 ? 'text-[7px] px-1.5' : 'text-[8px] px-1.5'} font-bold py-px rounded leading-none tracking-wide`}
              style={{
                background: 'rgba(139, 92, 246, 0.08)',
                color: 'rgb(167, 139, 250)',
                border: '1px solid rgba(139, 92, 246, 0.15)',
              }}
            >
              MOD
            </span>
          )}
          {isMe && (
            <span
              className={`shrink-0 ${s.dense ? 'text-[5px] px-1' : s.icon === 13 ? 'text-[6px] px-1' : 'text-[7px] px-1.5'} font-extrabold py-px rounded leading-none tracking-widest`}
              style={{
                background: 'rgba(var(--theme-accent-rgb), 0.06)',
                color: 'rgba(var(--theme-accent-rgb), 0.55)',
                border: '1px solid rgba(var(--theme-accent-rgb), 0.1)',
                boxShadow: '0 0 5px rgba(var(--theme-accent-rgb), 0.08)',
              }}
            >
              SEN
            </span>
          )}
        </div>

        <div className={s.dense ? '' : 'mt-0.5'}>
          {isOwnVoiceActive ? (
            <OwnVoiceEqualizer volumeLevel={volumeLevel} scale={scaleStep as 1 | 2 | 3} />
          ) : user.isSpeaking ? (
            <MiniEqualizer speakingLevel={speakingLevel} scale={scaleStep as 1 | 2 | 3} />
          ) : (
            <div className="flex items-center gap-1.5">
              <div className={`${s.dense ? 'w-1.5 h-1.5' : 'w-[5px] h-[5px]'} rounded-full shrink-0 ${statusDotColor}`} />
              <p className={`${s.status} font-medium truncate text-[var(--theme-secondary-text)]/60`}>
                {userStatusText}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: audio + status icons */}
      <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity duration-200">
        {user.statusText === 'Telefonda' && <PhoneCall size={s.dense ? 9 : s.icon === 13 ? 10 : 11} className="text-red-500 !opacity-100" />}
        {user.statusText === 'Hemen Geleceğim' && <Recycle size={s.dense ? 9 : s.icon === 13 ? 10 : 11} className="text-orange-500 !opacity-100" />}
        {isMe && statusTimer !== null && statusTimer > 0 && (
          <span className={`${s.dense ? 'text-[7px]' : s.icon === 13 ? 'text-[8px]' : 'text-[9px]'} text-yellow-500 font-bold tabular-nums !opacity-100`}>
            {Math.floor(statusTimer / 60)}:{(statusTimer % 60).toString().padStart(2, '0')}
          </span>
        )}
        <div className={`flex items-center ${s.dense ? 'gap-0.5' : 'gap-1'} ml-0.5`}>
          <Headphones size={s.icon} className={(isMe ? isDeafened : !!user.selfDeafened) ? 'text-red-500 !opacity-100' : 'text-[var(--theme-secondary-text)]'} />
          <Mic size={s.icon} className={(isMe ? isMuted : (!!user.selfMuted || !!user.isMuted)) ? 'text-red-500 !opacity-100' : 'text-[var(--theme-secondary-text)]'} />
        </div>
      </div>
    </div>
  );
}

// ─── Custom memo comparator: skip re-render for irrelevant changes ───
function arePropsEqual(prev: UserCardProps, next: UserCardProps): boolean {
  // Visual state changes → must re-render
  if (prev.isSpeakingActive !== next.isSpeakingActive) return false;
  if (prev.isDominant !== next.isDominant) return false;
  if (prev.isMe !== next.isMe) return false;
  if (prev.isOwner !== next.isOwner) return false;

  // Speaking users: check intensity with threshold to skip micro-changes
  if (next.isSpeakingActive) {
    if (Math.abs(prev.intensity - next.intensity) > 0.05) return false;
    if (next.isMe && Math.abs(prev.volumeLevel - next.volumeLevel) > 3) return false;
    if (!next.isMe && Math.abs(prev.speakingLevel - next.speakingLevel) > 0.02) return false;
  }

  // Non-speaking: volumeLevel/speakingLevel changes are irrelevant
  if (prev.isMuted !== next.isMuted) return false;
  if (prev.isDeafened !== next.isDeafened) return false;
  if (prev.isVoiceBanned !== next.isVoiceBanned) return false;
  if (prev.statusTimer !== next.statusTimer) return false;
  if (prev.effectiveStatus !== next.effectiveStatus) return false;
  if (prev.isPttPressed !== next.isPttPressed) return false;
  if (prev.adminBorderEffect !== next.adminBorderEffect) return false;
  if (prev.scale !== next.scale) return false;

  // User object: compare visual-relevant fields instead of reference
  const pu = prev.user;
  const nu = next.user;
  if (pu.id !== nu.id) return false;
  if (pu.isSpeaking !== nu.isSpeaking) return false;
  if (pu.selfMuted !== nu.selfMuted) return false;
  if (pu.selfDeafened !== nu.selfDeafened) return false;
  if (pu.isMuted !== nu.isMuted) return false;
  if (pu.isAdmin !== nu.isAdmin) return false;
  if (pu.isModerator !== nu.isModerator) return false;
  if (pu.statusText !== nu.statusText) return false;
  if (pu.avatar !== nu.avatar) return false;
  if (pu.firstName !== nu.firstName) return false;
  if (pu.lastName !== nu.lastName) return false;
  if (pu.age !== nu.age) return false;

  return true; // equal → skip re-render
}

const UserCard = React.memo(UserCardInner, arePropsEqual);
export default UserCard;
