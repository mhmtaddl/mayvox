import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { ChevronLeft, ChevronRight, PhoneCall, PhoneOff } from 'lucide-react';
import AvatarContent from '../../../components/AvatarContent';
import { getChannelIconName } from '../../../lib/channelIcon';
import { getChannelIconColor } from '../../../lib/channelIconColor';
import { channelIconComponents, roomModeIcons } from '../constants';

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
  inline?: boolean;
}

function roomInviteTarget(roomName: string): string {
  const name = roomName.trim() || 'Oda';
  const lower = name.toLocaleLowerCase('tr-TR');
  const lastVowel = [...lower].reverse().find(ch => 'aeıioöuü'.includes(ch));
  const useBack = !lastVowel || 'aıou'.includes(lastVowel);
  const endsWithVowel = /[aeıioöuü]$/.test(lower);
  const suffix = endsWithVowel ? (useBack ? 'ya' : 'ye') : (useBack ? 'a' : 'e');
  return `${name}'${suffix}`;
}

const CARD_W = 360;
const CARD_H = 68;
const RAIL_W = 12;
const RAIL_W_HOVER = 16;
const COLLAPSED_TAB_W = 18;
const COLLAPSED_TAB_W_HOVER = 22;

type ExitReason = 'accept' | 'reject' | 'timeout';

const exitVariants: Variants = {
  accept: {
    opacity: 0,
    scale: 0.97,
    y: -4,
    filter: 'blur(2px)',
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
  reject: {
    opacity: 0,
    x: 18,
    scale: 0.98,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
  timeout: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    filter: 'blur(4px)',
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
  collapsedExit: {
    opacity: 0,
    scale: 0.72,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function InvitationModal({
  data,
  onAccept,
  onDecline,
  onMute,
  isMuted,
  inline: _inline = false,
}: Props) {
  const inviteLine = `${roomInviteTarget(data.roomName)} davet ediyor`;
  const RoomIcon = channelIconComponents[getChannelIconName(data.roomId)] || roomModeIcons.social;
  const roomIconColor = getChannelIconColor(data.roomId);
  const collapsed = isMuted;
  const [railHover, setRailHover] = useState(false);

  const [exitReason, setExitReason] = useState<ExitReason | null>(null);
  const exitReasonRef = useRef<ExitReason | null>(null);
  exitReasonRef.current = exitReason;

  useEffect(() => {
    if (!exitReason || exitReason === 'timeout') return;
    const id = requestAnimationFrame(() => {
      if (exitReason === 'accept') onAccept();
      else onDecline();
    });
    return () => cancelAnimationFrame(id);
  }, [exitReason, onAccept, onDecline]);

  const handleAcceptClick = useCallback(() => {
    if (exitReasonRef.current) return;
    setExitReason('accept');
  }, []);

  const handleDeclineClick = useCallback(() => {
    if (exitReasonRef.current) return;
    setExitReason('reject');
  }, []);

  const resolveExitVariant = (): keyof typeof exitVariants => {
    if (collapsed) return 'collapsedExit';
    return exitReasonRef.current ?? 'timeout';
  };

  const content = (
    <AnimatePresence>
      <motion.div
        key={`${data.inviterId}:${data.roomId}`}
        initial={{ opacity: 0, y: -10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1, width: collapsed ? COLLAPSED_TAB_W : CARD_W }}
        exit={exitVariants[resolveExitVariant()]}
        transition={{
          opacity: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
          scale: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
          width: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        }}
        data-window-control
        className="fixed top-[88px] right-4 sm:right-6 max-w-[calc(100vw-32px)] overflow-hidden"
        style={{
          zIndex: 460,
          right: collapsed ? 6 : undefined,
          width: collapsed ? COLLAPSED_TAB_W : CARD_W,
          height: CARD_H,
          maxHeight: CARD_H,
          pointerEvents: 'auto',
          WebkitAppRegion: 'no-drag',
          borderRadius: collapsed ? 0 : 20,
          border: collapsed ? '0' : '1px solid rgba(255,255,255,0.10)',
          background: collapsed
            ? 'transparent'
            : [
              'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.10), transparent 38%)',
              'linear-gradient(180deg, rgba(var(--glass-tint),0.105), rgba(var(--theme-sidebar-rgb),0.72))',
              'rgba(var(--theme-bg-rgb),0.76)',
            ].join(', '),
          boxShadow: collapsed
            ? 'none'
            : [
              '0 18px 44px -24px rgba(0,0,0,0.72)',
              '0 10px 24px -18px rgba(var(--theme-accent-rgb),0.42)',
              'inset 0 1px 0 rgba(255,255,255,0.08)',
            ].join(', '),
          backdropFilter: collapsed ? 'none' : 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: collapsed ? 'none' : 'blur(24px) saturate(150%)',
          willChange: 'transform, opacity, filter',
        } as React.CSSProperties}
      >
        <CollapseRail
          collapsed={collapsed}
          hover={railHover}
          onClick={onMute}
          onEnter={() => setRailHover(true)}
          onLeave={() => setRailHover(false)}
        />

        <div
          aria-hidden="true"
          className="absolute inset-x-4 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(var(--theme-accent-rgb),0.45), transparent)',
          }}
        />

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              key="invite-card-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex items-center gap-3 p-3"
              style={{ paddingLeft: RAIL_W + 12 }}
            >
              <CallAvatar avatar={data.inviterAvatar} name={data.inviterName} />

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[14px] font-semibold leading-[1.2] text-[var(--theme-text)]"
                  title={data.inviterName}
                >
                  {data.inviterName}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-1.5" title={data.serverName ? `${data.serverName} - ${data.roomName}` : data.roomName}>
                  <RoomIcon size={13} className="shrink-0" style={{ color: roomIconColor }} />
                  <span className="truncate text-[12px] font-medium leading-[1.25] text-[var(--theme-secondary-text)]">
                    {inviteLine}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ActionButton
                  kind="accept"
                  onClick={handleAcceptClick}
                  title="Kabul et"
                  aria-label="Daveti kabul et"
                >
                  <PhoneCall size={16} strokeWidth={1.9} />
                </ActionButton>
                <ActionButton
                  kind="reject"
                  onClick={handleDeclineClick}
                  title="Reddet"
                  aria-label="Daveti reddet"
                >
                  <PhoneOff size={16} strokeWidth={1.9} />
                </ActionButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

function CollapseRail({
  collapsed,
  hover,
  onClick,
  onEnter,
  onLeave,
}: {
  collapsed: boolean;
  hover: boolean;
  onClick: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={collapsed ? 'Davet kartını geri aç' : 'Davet sesini kapat'}
      aria-pressed={collapsed}
      animate={collapsed ? { opacity: [0.82, 1, 0.82] } : { opacity: hover ? 1 : 0.82 }}
      transition={collapsed ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.18, ease: 'easeOut' }}
      className="absolute left-0 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/35"
      style={{
        zIndex: 2,
        width: collapsed ? (hover ? COLLAPSED_TAB_W_HOVER : COLLAPSED_TAB_W) : (hover ? RAIL_W_HOVER : RAIL_W),
        height: collapsed ? 62 : '100%',
        cursor: 'pointer',
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        top: collapsed ? 3 : 0,
        bottom: collapsed ? undefined : 0,
        borderRadius: collapsed ? 999 : undefined,
        borderTopLeftRadius: collapsed ? 999 : 20,
        borderBottomLeftRadius: collapsed ? 999 : 20,
        borderTopRightRadius: collapsed ? 999 : 0,
        borderBottomRightRadius: collapsed ? 999 : 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.58), rgba(255,255,255,0.46))',
        border: '1px solid rgba(255,255,255,0.20)',
        backdropFilter: 'blur(14px) saturate(145%)',
        WebkitBackdropFilter: 'blur(14px) saturate(145%)',
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.36)',
          '0 8px 22px rgba(0,0,0,0.25)',
          hover ? '0 10px 24px rgba(255,255,255,0.16)' : '',
        ].filter(Boolean).join(', '),
        transition: 'width 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 180ms ease, opacity 180ms ease',
      }}
    >
      <span className="flex items-center justify-center leading-none" style={{ color: 'rgba(20,24,34,0.78)' }}>
        {collapsed
          ? <ChevronLeft size={10} strokeWidth={2.35} />
          : <ChevronRight size={10} strokeWidth={2.35} />}
      </span>
    </motion.button>
  );
}

function CallAvatar({ avatar, name }: { avatar?: string; name: string }) {
  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.20), rgba(var(--glass-tint),0.06))',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 18px -14px rgba(var(--theme-accent-rgb),0.62)',
      }}
    >
      <AvatarContent
        avatar={avatar}
        name={name}
        firstName={name}
        imgClassName="h-full w-full object-cover"
        letterClassName="text-[13px] font-bold text-[var(--theme-accent)]"
      />
    </div>
  );
}

type ButtonKind = 'accept' | 'reject';

interface ActionButtonProps {
  kind: ButtonKind;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  'aria-label': string;
}

const BUTTON_PALETTE: Record<ButtonKind, {
  bg: string;
  border: string;
  color: string;
  hoverBg: string;
  hoverBorder: string;
  shadow: string;
}> = {
  accept: {
    bg: 'color-mix(in srgb, var(--success, #30D158) 14%, transparent)',
    border: 'color-mix(in srgb, var(--success, #30D158) 30%, transparent)',
    color: 'var(--success, #30D158)',
    hoverBg: 'color-mix(in srgb, var(--success, #30D158) 22%, transparent)',
    hoverBorder: 'color-mix(in srgb, var(--success, #30D158) 46%, transparent)',
    shadow: '0 8px 18px -14px color-mix(in srgb, var(--success, #30D158) 70%, transparent)',
  },
  reject: {
    bg: 'color-mix(in srgb, var(--danger, #E55B54) 12%, transparent)',
    border: 'color-mix(in srgb, var(--danger, #E55B54) 28%, transparent)',
    color: 'var(--danger, #E55B54)',
    hoverBg: 'color-mix(in srgb, var(--danger, #E55B54) 20%, transparent)',
    hoverBorder: 'color-mix(in srgb, var(--danger, #E55B54) 44%, transparent)',
    shadow: '0 8px 18px -14px color-mix(in srgb, var(--danger, #E55B54) 68%, transparent)',
  },
};

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ kind, onClick, children, title, ...aria }, ref) {
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
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          background: p.bg,
          border: `1px solid ${p.border}`,
          color: p.color,
          boxShadow: p.shadow,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = p.hoverBg;
          e.currentTarget.style.borderColor = p.hoverBorder;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = p.bg;
          e.currentTarget.style.borderColor = p.border;
        }}
        aria-label={aria['aria-label']}
      >
        {children}
      </motion.button>
    );
  },
);
