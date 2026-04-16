import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Headphones, HeadphoneOff, ShieldCheck, Monitor, Smartphone } from 'lucide-react';
import { formatFullName } from '../../lib/formatName';
import AvatarContent from '../AvatarContent';
import type { PositionedNode } from './roomNetworkLayout';
import { type CardStyle, getCardStyleTokens } from './cardStyles';

interface Props {
  node: PositionedNode;
  isCenter: boolean;
  cardStyle?: CardStyle;
}

function RoomNode({ node, isCenter, cardStyle = 'current' }: Props) {
  const {
    avatar, firstName, lastName, statusText, isSpeaking, isMuted, isDeafened,
    platform, isAdmin, isModerator,
    onClick, onDoubleClick, onContextMenu,
  } = node;

  const t = getCardStyleTokens(cardStyle);

  // Dynamic scale — node.scale drives sizing
  const s = isCenter ? 1 : node.scale;
  const avatarSize = isCenter ? 80 : Math.round(48 + (80 - 48) * (s - 0.6) / 0.4);
  const cardW = isCenter ? 156 : Math.round(108 + (156 - 108) * (s - 0.6) / 0.4);
  const padV = isCenter ? 18 : Math.round(10 + (18 - 10) * (s - 0.6) / 0.4);
  const padH = isCenter ? 16 : Math.round(8 + (16 - 8) * (s - 0.6) / 0.4);
  const padB = isCenter ? 14 : Math.round(8 + (14 - 8) * (s - 0.6) / 0.4);

  return (
    <div
      className="cursor-pointer select-none group"
      data-keep-action-menu
      style={{
        opacity: (isMuted && isDeafened) ? 0.55 : isMuted ? 0.7 : 1,
        filter: (isMuted && isDeafened) ? 'grayscale(0.5)' : 'none',
        transform: isSpeaking ? 'translateY(-2px)' : 'none',
        transition: 'opacity 0.2s, filter 0.2s, transform 0.2s',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="relative flex flex-col items-center"
        style={{
          width: cardW,
          padding: `${padV}px ${padH}px ${padB}px`,
          background: isSpeaking ? t.cardBgSpeaking : t.cardBg,
          border: isSpeaking ? t.cardBorderSpeaking : t.cardBorder,
          borderRadius: isCenter ? t.cardRadius + 4 : t.cardRadius,
          boxShadow: isSpeaking ? t.cardShadowSpeaking : t.cardShadow,
          backdropFilter: t.cardBackdrop,
          WebkitBackdropFilter: t.cardBackdrop,
          transition: 'background 0.2s, border 0.2s, box-shadow 0.3s',
        }}
      >
        {/* Avatar */}
        <div className="relative" style={{ marginBottom: isCenter ? 10 : 6 }}>
          <motion.div
            animate={{ scale: isSpeaking ? 1.03 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="overflow-hidden flex items-center justify-center"
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: '22%',
              background: 'rgba(var(--theme-accent-rgb), 0.05)',
              border: isSpeaking ? t.avatarBorderSpeaking : t.avatarBorder,
              boxShadow: t.avatarShadow,
              transition: 'border-color 0.3s',
            }}
          >
            <AvatarContent avatar={avatar} statusText={statusText} firstName={firstName} letterClassName="text-[var(--theme-text)] font-semibold opacity-70" />
          </motion.div>

          {/* Speaking pulse */}
          {isSpeaking && (
            <motion.div
              className="absolute inset-[-3px] pointer-events-none"
              style={{ borderRadius: '24%', border: '1px solid rgba(var(--theme-accent-rgb), 0.15)' }}
              animate={{ opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

        </div>

        {/* Name + role */}
        <div className="flex items-center gap-1 max-w-full">
          <span
            className="text-[var(--theme-text)] truncate leading-tight font-medium"
            style={{
              fontSize: isCenter ? 13 : Math.round(10 + (13 - 10) * (s - 0.6) / 0.4),
              fontWeight: isCenter ? 600 : 500,
              opacity: isCenter ? 1 : t.textOpacity,
            }}
          >
            {formatFullName(firstName, lastName)}
          </span>
          {isAdmin && (
            <ShieldCheck size={isCenter ? 12 : 9} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />
          )}
          {!isAdmin && isModerator && (
            <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className={`${isCenter ? 'w-3 h-3' : 'w-2 h-2'} shrink-0`}>
              <path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/>
            </svg>
          )}
        </div>

        {/* Status row */}
        <div className={`${isCenter ? 'mt-1.5 gap-2' : 'mt-1 gap-1.5'} flex items-center text-[var(--theme-secondary-text)]`} style={{ opacity: t.iconOpacity }}>
          {platform === 'mobile'
            ? <Smartphone size={isCenter ? 10 : 9} />
            : platform === 'desktop'
              ? <Monitor size={isCenter ? 10 : 9} />
              : null}
          {isDeafened
            ? <HeadphoneOff size={isCenter ? 10 : 9} className="text-red-400 !opacity-100" />
            : <Headphones size={isCenter ? 10 : 9} />}
          {isMuted
            ? <MicOff size={isCenter ? 10 : 9} className="text-red-400 !opacity-100" />
            : <Mic size={isCenter ? 10 : 9} />}
          {isSpeaking && (
            <div className={`flex items-end gap-[1.5px] ${isCenter ? 'h-2.5' : 'h-2'} !opacity-100`}>
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="w-[1.5px] rounded-full bg-[var(--theme-accent)]"
                  animate={{ height: ['25%', '85%', '25%'] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                  style={{ height: '25%' }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function arePropsEqual(prev: Props, next: Props) {
  if (prev.isCenter !== next.isCenter) return false;
  if (prev.cardStyle !== next.cardStyle) return false;
  const a = prev.node;
  const b = next.node;
  return (
    a.id === b.id &&
    a.isSpeaking === b.isSpeaking &&
    a.isMuted === b.isMuted &&
    a.isDeafened === b.isDeafened &&
    a.x === b.x &&
    a.y === b.y &&
    a.scale === b.scale &&
    a.avatar === b.avatar &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.isAdmin === b.isAdmin &&
    a.isModerator === b.isModerator &&
    a.platform === b.platform
  );
}

export default React.memo(RoomNode, arePropsEqual);
