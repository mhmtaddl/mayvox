import React from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, ShieldCheck, Monitor, Smartphone } from 'lucide-react';
import AvatarContent from '../AvatarContent';
import type { PositionedNode } from './roomNetworkLayout';
import { type CardStyle, getCardStyleTokens } from './cardStyles';

interface StaticRoomAvatarProps {
  avatar?: string | null;
  statusText?: string | null;
  firstName?: string | null;
  name?: string | null;
  size: number;
  radius: string;
  border: string;
  shadow: string;
  speaking?: boolean;
  muted?: boolean;
  deafened?: boolean;
}

const StaticRoomAvatar = React.memo(function StaticRoomAvatar({
  avatar,
  statusText,
  firstName,
  name,
  size,
  radius,
  border,
  shadow,
  speaking,
  muted,
  deafened,
}: StaticRoomAvatarProps) {
  return (
    <div className="relative shrink-0" style={{ borderRadius: radius }}>
      <div
        className="relative z-10 overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'rgba(var(--theme-accent-rgb), 0.05)',
          border,
          boxShadow: shadow,
        }}
      >
        <AvatarContent avatar={avatar} statusText={statusText} firstName={name || firstName} name={name} letterClassName="text-[var(--theme-text)] font-semibold opacity-70" />
      </div>
      {speaking && <span className="voice-participant-speaking-ring" />}
      {(muted || deafened) && (
        <span className="voice-participant-muted-badge">
          {deafened ? <HeadphoneOff size={8} /> : <MicOff size={8} />}
        </span>
      )}
    </div>
  );
});

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
  const showSpeaking = isSpeaking && !isMuted && !isDeafened;

  // Dynamic scale — node.scale drives sizing
  const s = isCenter ? 1 : node.scale;
  const defaultAvatarSize = 50;
  const defaultCardW = 106;
  const defaultPadV = 8;
  const defaultPadH = 5;
  const defaultPadB = 7;

  const nodeShellStyle: React.CSSProperties = {
    opacity: (isMuted && isDeafened) ? 0.55 : isMuted ? 0.7 : 1,
    filter: (isMuted && isDeafened) ? 'grayscale(0.5)' : 'none',
    transform: 'none',
    transition: 'opacity 0.2s, filter 0.2s',
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
    <div className={`voice-speaking-bars ${heightClass}`} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span key={i} style={{ animationDelay: `${i * 120}ms` }} />
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
    shadow,
    speaking,
  }: {
    size: number;
    radius?: string;
    border: string;
    shadow: string;
    speaking?: boolean;
  }) => (
    <div className="relative shrink-0" style={{ borderRadius: radius }}>
      <div
        className="relative z-10 overflow-hidden flex items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'rgba(var(--theme-accent-rgb), 0.05)',
          border,
          boxShadow: shadow,
        }}
      >
        <AvatarContent avatar={avatar} statusText={statusText} firstName={name || firstName} name={name} letterClassName="text-[var(--theme-text)] font-semibold opacity-70" />
      </div>
      {speaking && <span className="voice-participant-speaking-ring" />}
      {(isMuted || isDeafened) && (
        <span className="voice-participant-muted-badge">
          {isDeafened ? <HeadphoneOff size={8} /> : <MicOff size={8} />}
        </span>
      )}
    </div>
  );

  const renderStaticAvatar = ({
    size,
    radius = '22%',
    border,
    shadow,
    speaking,
  }: {
    size: number;
    radius?: string;
    border: string;
    shadow: string;
    speaking?: boolean;
  }) => (
    <StaticRoomAvatar
      avatar={avatar}
      statusText={statusText}
      firstName={firstName}
      name={name}
      size={size}
      radius={radius}
      border={border}
      shadow={shadow}
      speaking={speaking}
      muted={isMuted}
      deafened={isDeafened}
    />
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
        width: defaultCardW,
        padding: `${defaultPadV}px ${defaultPadH}px ${defaultPadB}px`,
        background: isSpeaking
          ? 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.082), rgba(var(--glass-tint),0.024))'
          : 'linear-gradient(180deg, rgba(var(--glass-tint),0.042), rgba(var(--glass-tint),0.016))',
        border: isSpeaking ? '1px solid rgba(var(--theme-accent-rgb),0.18)' : '1px solid rgba(var(--glass-tint),0.045)',
        borderRadius: isCenter ? 18 : 16,
        boxShadow: isSpeaking
          ? '0 0 0 1px rgba(var(--theme-accent-rgb),0.035), 0 4px 12px rgba(var(--theme-accent-rgb),0.050), 0 2px 8px rgba(0,0,0,0.08)'
          : '0 1px 5px rgba(0,0,0,0.055), inset 0 1px 0 rgba(var(--glass-tint),0.026)',
        backdropFilter: t.cardBackdrop || 'blur(8px)',
        WebkitBackdropFilter: t.cardBackdrop || 'blur(8px)',
        transition: 'background 0.2s, border 0.2s, box-shadow 0.3s',
      }}
    >
      <div className="relative shrink-0">
        {renderAvatar({
          size: defaultAvatarSize,
          radius: '24%',
          border: showSpeaking ? '2px solid rgba(var(--theme-accent-rgb),0.58)' : '1px solid rgba(var(--glass-tint),0.055)',
          shadow: showSpeaking ? '0 2px 8px rgba(var(--theme-accent-rgb),0.10)' : '0 2px 7px rgba(0,0,0,0.09)',
          speaking: showSpeaking,
        })}
      </div>

      <div className="mt-1.5 min-w-0 w-full">
        <div className="flex items-center justify-center gap-1 min-w-0">
          {renderName('font-medium min-w-0', {
            fontSize: 10.5,
            fontWeight: 550,
            opacity: Math.max(0.84, t.textOpacity),
          })}
          {renderRoleMark(isCenter ? 9 : 8)}
        </div>
        <div className="mt-0.5 flex items-center justify-center gap-1 text-[var(--theme-secondary-text)]" style={{ opacity: Math.min(0.42, t.iconOpacity) }}>
          {renderStatusIcons(7)}
          {showSpeaking && renderSpeakingBars('h-1.5')}
        </div>
      </div>
    </div>
  );

  const renderPill = () => {
    const pillAvatar = 34;
    const pillW = 120;
    return (
      <div
        className="relative flex items-center gap-2"
        style={{
          width: pillW,
          minHeight: 44,
          padding: '5px 6px 5px 5px',
          background: isSpeaking
            ? 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.095), rgba(var(--glass-tint),0.032))'
            : 'linear-gradient(135deg, rgba(var(--glass-tint),0.038), rgba(var(--glass-tint),0.016))',
          border: isSpeaking ? '1px solid rgba(var(--theme-accent-rgb),0.20)' : '1px solid rgba(var(--glass-tint),0.045)',
          borderRadius: 999,
          boxShadow: isSpeaking
            ? '0 0 0 1px rgba(var(--theme-accent-rgb),0.040), 0 4px 14px rgba(var(--theme-accent-rgb),0.065), 0 3px 10px rgba(0,0,0,0.10)'
            : '0 1px 5px rgba(0,0,0,0.07), inset 0 1px 0 rgba(var(--glass-tint),0.032)',
          backdropFilter: 'blur(10px) saturate(1.08)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.08)',
          transition: 'background 0.2s, border 0.2s, box-shadow 0.3s',
        }}
      >
        {renderStaticAvatar({
          size: pillAvatar,
          radius: '999px',
          border: showSpeaking ? '2px solid rgba(var(--theme-accent-rgb),0.58)' : '1px solid rgba(var(--glass-tint),0.10)',
          shadow: showSpeaking ? '0 2px 8px rgba(var(--theme-accent-rgb),0.10)' : '0 2px 8px rgba(0,0,0,0.12)',
          speaking: showSpeaking,
        })}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            {renderName('text-[10px] font-semibold min-w-0')}
            {renderRoleMark(8)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[var(--theme-secondary-text)]" style={{ opacity: showSpeaking ? 0.86 : 0.48 }}>
            {renderStatusIcons(8)}
            {showSpeaking && renderSpeakingBars('h-1.5')}
          </div>
        </div>
      </div>
    );
  };

  const renderMinimal = () => {
    const minimalAvatar = 44;
    const slotW = 76;
    return (
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ width: slotW, padding: '5px 4px 3px' }}
      >
        {renderAvatar({
          size: minimalAvatar,
          radius: '24%',
          border: showSpeaking ? '2px solid rgba(var(--theme-accent-rgb),0.62)' : '1px solid rgba(var(--glass-tint),0.070)',
          shadow: showSpeaking ? '0 2px 8px rgba(var(--theme-accent-rgb),0.12)' : '0 2px 7px rgba(0,0,0,0.11)',
          speaking: showSpeaking,
        })}

        <div
          className="mt-1 flex max-w-full items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            background: showSpeaking ? 'rgba(var(--theme-accent-rgb),0.10)' : 'rgba(15,23,42,0.28)',
            border: showSpeaking ? '1px solid rgba(var(--theme-accent-rgb),0.20)' : '1px solid rgba(148,163,184,0.10)',
            boxShadow: '0 1px 5px rgba(0,0,0,0.065)',
          }}
        >
          {renderName(`${isCenter ? 'text-[10.5px]' : 'text-[10px]'} font-medium max-w-[60px]`, { opacity: showSpeaking ? 1 : 0.78 })}
          {renderRoleMark(isCenter ? 9 : 8)}
          {showSpeaking && renderSpeakingBars('h-2')}
          {(isMuted || isDeafened) && (
            <span className="flex items-center gap-1 text-red-400">
              {renderStatusIcons(8, { minimal: true })}
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
