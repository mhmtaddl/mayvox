import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Headphones, HeadphoneOff, ShieldCheck, Monitor, Smartphone } from 'lucide-react';
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
    avatar, name, firstName, statusText, isSpeaking, isMuted, isDeafened,
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

  const nodeShellStyle: React.CSSProperties = {
    opacity: (isMuted && isDeafened) ? 0.55 : isMuted ? 0.7 : 1,
    filter: (isMuted && isDeafened) ? 'grayscale(0.5)' : 'none',
    transform: isSpeaking ? 'translateY(-2px)' : 'none',
    transition: 'opacity 0.2s, filter 0.2s, transform 0.2s',
  };

  const renderRoleMark = (size: number) => {
    if (isAdmin) {
      return <ShieldCheck size={size} className="text-[var(--theme-accent)] shrink-0" strokeWidth={2.5} />;
    }
    if (!isModerator) return null;
    return (
      <svg viewBox="0 0 16 16" fill="rgb(167,139,250)" className="shrink-0" style={{ width: size, height: size }}>
        <path d="M2 11L3.5 4L8 7L12.5 4L14 11H2Z"/><rect x="2" y="12" width="12" height="1.5" rx="0.5"/>
      </svg>
    );
  };

  const renderSpeakingBars = (heightClass: string) => (
    <div className={`flex items-end gap-[1.5px] ${heightClass} !opacity-100`}>
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
  );

  const renderStatusIcons = (iconSize: number, opts?: { minimal?: boolean }) => (
    <>
      {!opts?.minimal && (platform === 'mobile'
        ? <Smartphone size={iconSize} />
        : platform === 'desktop'
          ? <Monitor size={iconSize} />
          : null)}
      {isDeafened
        ? <HeadphoneOff size={iconSize} className="text-red-400 !opacity-100" />
        : !opts?.minimal && <Headphones size={iconSize} />}
      {isMuted
        ? <MicOff size={iconSize} className="text-red-400 !opacity-100" />
        : !opts?.minimal && <Mic size={iconSize} />}
    </>
  );

  const renderAvatar = ({
    size,
    radius = '22%',
    border,
    speakingBorder,
    shadow,
    speakingShadow,
    pulseRadius = '24%',
  }: {
    size: number;
    radius?: string;
    border: string;
    speakingBorder: string;
    shadow: string;
    speakingShadow?: string;
    pulseRadius?: string;
  }) => (
    <div className="relative shrink-0">
      <motion.div
        animate={{ scale: isSpeaking ? 1.035 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'rgba(var(--theme-accent-rgb), 0.05)',
          border: isSpeaking ? speakingBorder : border,
          boxShadow: isSpeaking ? (speakingShadow ?? shadow) : shadow,
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      >
        <AvatarContent avatar={avatar} statusText={statusText} firstName={name || firstName} name={name} letterClassName="text-[var(--theme-text)] font-semibold opacity-70" />
      </motion.div>
      {isSpeaking && (
        <motion.div
          className="absolute inset-[-4px] pointer-events-none"
          style={{ borderRadius: pulseRadius, border: '1px solid rgba(var(--theme-accent-rgb), 0.18)' }}
          animate={{ opacity: [0.55, 0.16, 0.55], scale: [1, 1.045, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );

  const renderName = (className: string, style?: React.CSSProperties) => (
    <span className={`text-[var(--theme-text)] truncate leading-tight ${className}`} style={style}>
      {name || 'Kullanıcı'}
    </span>
  );

  const renderDefault = () => (
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
      <div className="relative" style={{ marginBottom: isCenter ? 10 : 6 }}>
        {renderAvatar({
          size: avatarSize,
          border: t.avatarBorder,
          speakingBorder: t.avatarBorderSpeaking,
          shadow: t.avatarShadow,
          speakingShadow: `0 0 0 2px rgba(var(--theme-accent-rgb),0.16), ${t.avatarShadow}`,
        })}
      </div>

      <div className="flex items-center gap-1 max-w-full">
        {renderName('font-medium', {
          fontSize: isCenter ? 13 : Math.round(10 + (13 - 10) * (s - 0.6) / 0.4),
          fontWeight: isCenter ? 600 : 500,
          opacity: isCenter ? 1 : t.textOpacity,
        })}
        {renderRoleMark(isCenter ? 12 : 9)}
      </div>

      <div className={`${isCenter ? 'mt-1.5 gap-2' : 'mt-1 gap-1.5'} flex items-center text-[var(--theme-secondary-text)]`} style={{ opacity: t.iconOpacity }}>
        {renderStatusIcons(isCenter ? 10 : 9)}
        {isSpeaking && renderSpeakingBars(isCenter ? 'h-2.5' : 'h-2')}
      </div>
    </div>
  );

  const renderPill = () => {
    const pillAvatar = isCenter ? 46 : Math.round(34 + (42 - 34) * (s - 0.6) / 0.4);
    const pillW = isCenter ? 164 : Math.max(132, Math.min(164, Math.round(132 + (164 - 132) * (s - 0.6) / 0.4)));
    return (
      <div
        className="relative flex items-center gap-2"
        style={{
          width: pillW,
          minHeight: isCenter ? 62 : 50,
          padding: isCenter ? '8px 12px 8px 9px' : '7px 10px 7px 8px',
          background: isSpeaking
            ? 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.13), rgba(var(--glass-tint),0.045))'
            : 'linear-gradient(135deg, rgba(var(--glass-tint),0.060), rgba(var(--glass-tint),0.025))',
          border: isSpeaking ? '1px solid rgba(var(--theme-accent-rgb),0.32)' : '1px solid rgba(var(--glass-tint),0.080)',
          borderRadius: 999,
          boxShadow: isSpeaking
            ? '0 0 0 1px rgba(var(--theme-accent-rgb),0.08), 0 8px 24px rgba(var(--theme-accent-rgb),0.10), 0 6px 18px rgba(0,0,0,0.16)'
            : '0 3px 10px rgba(0,0,0,0.10), inset 0 1px 0 rgba(var(--glass-tint),0.045)',
          backdropFilter: 'blur(10px) saturate(1.08)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.08)',
          transition: 'background 0.2s, border 0.2s, box-shadow 0.3s',
        }}
      >
        {renderAvatar({
          size: pillAvatar,
          radius: '999px',
          border: '1px solid rgba(var(--glass-tint),0.10)',
          speakingBorder: '2px solid rgba(var(--theme-accent-rgb),0.46)',
          shadow: '0 2px 8px rgba(0,0,0,0.12)',
          speakingShadow: '0 0 0 3px rgba(var(--theme-accent-rgb),0.12), 0 0 18px rgba(var(--theme-accent-rgb),0.16)',
          pulseRadius: '999px',
        })}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            {renderName(`${isCenter ? 'text-[12px]' : 'text-[11px]'} font-semibold min-w-0`)}
            {renderRoleMark(isCenter ? 11 : 9)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[var(--theme-secondary-text)]" style={{ opacity: isSpeaking ? 0.8 : 0.48 }}>
            {renderStatusIcons(isCenter ? 10 : 9)}
            {isSpeaking && renderSpeakingBars('h-2')}
          </div>
        </div>
      </div>
    );
  };

  const renderMinimal = () => {
    const minimalAvatar = isCenter ? 78 : Math.round(50 + (66 - 50) * (s - 0.6) / 0.4);
    const slotW = isCenter ? 136 : Math.round(104 + (128 - 104) * (s - 0.6) / 0.4);
    return (
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ width: slotW, padding: isCenter ? '8px 8px 6px' : '6px 6px 4px' }}
      >
        {renderAvatar({
          size: minimalAvatar,
          radius: '999px',
          border: '1px solid rgba(var(--glass-tint),0.08)',
          speakingBorder: '2px solid rgba(var(--theme-accent-rgb),0.50)',
          shadow: '0 4px 14px rgba(0,0,0,0.18)',
          speakingShadow: '0 0 0 5px rgba(var(--theme-accent-rgb),0.11), 0 0 28px rgba(var(--theme-accent-rgb),0.22), 0 6px 20px rgba(0,0,0,0.20)',
          pulseRadius: '999px',
        })}

        <div
          className="mt-1.5 flex max-w-full items-center gap-1 rounded-full px-2 py-1"
          style={{
            background: 'rgba(var(--theme-bg-rgb),0.56)',
            border: '1px solid rgba(var(--glass-tint),0.06)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {renderName(`${isCenter ? 'text-[11px]' : 'text-[10px]'} font-semibold max-w-[88px]`)}
          {renderRoleMark(isCenter ? 10 : 8)}
          {(isMuted || isDeafened) && (
            <span className="flex items-center gap-1 text-red-400">
              {renderStatusIcons(isCenter ? 9 : 8, { minimal: true })}
            </span>
          )}
        </div>
      </div>
    );
  };

  const content = cardStyle === 'revolt'
    ? renderPill()
    : cardStyle === 'linear'
      ? renderMinimal()
      : renderDefault();

  return (
    <div
      className="cursor-pointer select-none group"
      data-keep-action-menu
      style={nodeShellStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {content}
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
    a.name === b.name &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.isAdmin === b.isAdmin &&
    a.isModerator === b.isModerator &&
    a.platform === b.platform
  );
}

export default React.memo(RoomNode, arePropsEqual);
