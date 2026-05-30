import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import RoomNode from './RoomNode';
import type { RoomNodeData, PositionedNode } from './roomNetworkLayout';
import { getPublicDisplayName } from '../../lib/formatName';
import AvatarContent from '../AvatarContent';
import type { CardStyle } from './cardStyles';

interface Props {
  participants: RoomNodeData[];
  cardStyle?: CardStyle;
  leadingAccessory?: React.ReactNode;
  mobilePhoneLayout?: boolean;
}

function calcVisibleCount(containerW: number): number {
  if (containerW <= 0) return 6;
  const gap = 12;
  const minSlot = 92 + gap;
  const row1 = Math.max(1, Math.floor((containerW - 132) / minSlot));
  const row2 = Math.max(1, Math.floor(containerW / minSlot));
  return Math.max(3, row1 + row2);
}

function getPhoneSlotLimit(cardStyle: CardStyle): number {
  if (cardStyle === 'revolt') return 9;
  if (cardStyle === 'linear' || cardStyle === 'apple') return 8;
  return 6;
}

function compareRoomNodes(a: RoomNodeData, b: RoomNodeData): number {
  if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
  const scoreDelta = (b.speakingScore || 0) - (a.speakingScore || 0);
  if (scoreDelta !== 0) return scoreDelta;
  const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return a.name.localeCompare(b.name, 'tr');
}

export default function RoomNetworkVisualization({ participants, cardStyle = 'current', leadingAccessory, mobilePhoneLayout = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowPopupRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState(12);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowPopupPosition, setOverflowPopupPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const nextVisible = calcVisibleCount(el.getBoundingClientRect().width);
      setMaxVisible(prev => prev === nextVisible ? prev : nextVisible);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (overflowRef.current?.contains(target) || overflowPopupRef.current?.contains(target)) return;
      setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  useEffect(() => {
    if (!overflowOpen) return;
    const updatePosition = () => {
      const trigger = overflowRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popupWidth = 148;
      const left = Math.min(
        window.innerWidth - popupWidth / 2 - 10,
        Math.max(popupWidth / 2 + 10, rect.left + rect.width / 2),
      );
      setOverflowPopupPosition({ top: rect.bottom + 8, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [overflowOpen]);

  const { self, sortedRemotes } = useMemo(() => {
    const selfNode = participants.find(p => p.isSelf);
    const remotes = participants.filter(p => !p.isSelf).sort(compareRoomNodes);
    return { self: selfNode, sortedRemotes: remotes };
  }, [participants]);

  const phoneTotalLimit = getPhoneSlotLimit(cardStyle);
  const totalParticipants = participants.length;
  const phoneHasOverflow = mobilePhoneLayout && totalParticipants >= phoneTotalLimit;
  const phoneRemoteSlots = Math.max(0, phoneTotalLimit - (self ? 2 : 1));
  const hasOverflow = phoneHasOverflow || (!mobilePhoneLayout && sortedRemotes.length > maxVisible);
  const visibleSlots = mobilePhoneLayout
    ? (hasOverflow ? phoneRemoteSlots : sortedRemotes.length)
    : (hasOverflow ? maxVisible - 1 : sortedRemotes.length);
  const visibleRemotes = sortedRemotes.slice(0, visibleSlots);
  const hiddenRemotes = sortedRemotes.slice(visibleSlots);

  const remoteScale = Math.max(0.62, Math.min(1.0, 1.0 - (visibleRemotes.length - 1) * 0.045));

  const ordered: PositionedNode[] = [];
  if (self) ordered.push({ ...self, x: 0, y: 0, ring: 0, scale: 1 });
  visibleRemotes.forEach(p => ordered.push({ ...p, x: 0, y: 0, ring: 1, scale: remoteScale }));
  const overflowLabel = `+${hiddenRemotes.length} Kişi`;

  const renderOverflowGlyph = (size: number, fontSize: number, compact = false, showGroupMarks = true) => (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: compact ? '24%' : cardStyle === 'revolt' ? '999px' : '24%',
        background: 'rgba(var(--theme-accent-rgb), 0.07)',
        border: '1px solid rgba(var(--glass-tint), 0.055)',
        boxShadow: '0 2px 7px rgba(0,0,0,0.09)',
      }}
    >
      {showGroupMarks && (
        <>
          <span
            className="absolute rounded-full border border-[rgba(var(--theme-accent-rgb),0.42)] bg-[rgba(var(--theme-bg-rgb),0.88)]"
            style={{ width: size * 0.45, height: size * 0.45, left: size * 0.18, top: size * 0.2 }}
          />
          <span
            className="absolute rounded-full border border-[rgba(var(--theme-accent-rgb),0.34)] bg-[rgba(var(--theme-bg-rgb),0.78)]"
            style={{ width: size * 0.38, height: size * 0.38, right: size * 0.16, top: size * 0.28 }}
          />
        </>
      )}
      <span
        className="relative z-10 font-bold text-[var(--theme-accent)]"
        style={{ fontSize }}
      >
        +{hiddenRemotes.length}
      </span>
    </div>
  );

  const renderOverflowButton = () => {
    const common: React.CSSProperties = {
      background: overflowOpen
        ? 'linear-gradient(180deg, rgba(var(--theme-accent-rgb),0.070), rgba(var(--glass-tint),0.024))'
        : 'linear-gradient(180deg, rgba(var(--glass-tint),0.042), rgba(var(--glass-tint),0.016))',
      border: overflowOpen ? '1px solid rgba(var(--theme-accent-rgb),0.18)' : '1px solid rgba(var(--glass-tint),0.045)',
      boxShadow: overflowOpen
        ? '0 0 0 1px rgba(var(--theme-accent-rgb),0.035), 0 4px 12px rgba(var(--theme-accent-rgb),0.050), 0 2px 8px rgba(0,0,0,0.08)'
        : '0 1px 5px rgba(0,0,0,0.055), inset 0 1px 0 rgba(var(--glass-tint),0.026)',
      transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
    };

    if (cardStyle === 'revolt') {
      return (
        <button
          onClick={() => setOverflowOpen(p => !p)}
          className="relative flex items-center justify-center cursor-pointer select-none"
          style={{
            ...common,
            width: 104,
            height: 44,
            padding: '5px 8px',
            borderRadius: 999,
            backdropFilter: 'blur(10px) saturate(1.08)',
            WebkitBackdropFilter: 'blur(10px) saturate(1.08)',
          }}
        >
          <span className="truncate text-center text-[10px] font-semibold text-[var(--theme-text)]">
            {overflowLabel}
          </span>
        </button>
      );
    }

    if (cardStyle === 'linear' || cardStyle === 'apple') {
      return (
        <button
          onClick={() => setOverflowOpen(p => !p)}
          className="relative flex flex-col items-center justify-center cursor-pointer select-none"
          style={{ width: 76, padding: '5px 4px 3px' }}
        >
          {renderOverflowGlyph(44, 13, true, false)}
          <div
            className="mt-1 flex max-w-full items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: overflowOpen ? 'rgba(var(--theme-accent-rgb),0.10)' : 'rgba(15,23,42,0.28)',
              border: overflowOpen ? '1px solid rgba(var(--theme-accent-rgb),0.20)' : '1px solid rgba(148,163,184,0.10)',
              boxShadow: '0 1px 5px rgba(0,0,0,0.065)',
            }}
          >
            <span className="max-w-[60px] truncate text-[10px] font-medium text-[var(--theme-text)] opacity-80">
              {overflowLabel}
            </span>
          </div>
        </button>
      );
    }

    return (
      <button
        onClick={() => setOverflowOpen(p => !p)}
        className="relative flex items-center justify-center cursor-pointer select-none"
        style={{
          ...common,
          width: 106,
          height: 92,
          padding: '8px 5px 7px',
          borderRadius: 16,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <span className="truncate text-[13px] font-bold text-[var(--theme-accent)] opacity-95">
          {overflowLabel}
        </span>
      </button>
    );
  };

  const overflowPopup = overflowOpen && hasOverflow && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={overflowPopupRef}
        className="dm-glass-panel dm-mobile-solid-panel fixed z-[220] max-h-64 overflow-y-auto custom-scrollbar rounded-2xl px-1.5 py-2"
        style={{
          top: overflowPopupPosition.top,
          left: overflowPopupPosition.left,
          width: 'max-content',
          minWidth: 132,
          maxWidth: 148,
          transform: 'translateX(-50%)',
        }}
      >
        {hiddenRemotes.map(user => (
          <div
            key={user.id}
            className="flex w-fit max-w-[136px] items-center gap-1.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-[rgba(var(--glass-tint),0.055)] transition-colors"
            onClick={(e) => { user.onClick?.(e); setOverflowOpen(false); }}
          >
            <div className="shrink-0 overflow-hidden flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: '22%', background: 'rgba(var(--theme-accent-rgb), 0.06)', border: '1px solid rgba(var(--glass-tint), 0.06)' }}>
              <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.displayName || user.firstName} name={getPublicDisplayName(user)} letterClassName="text-[var(--theme-text)] font-semibold text-[9px]" />
            </div>
            <span className="min-w-0 max-w-[68px] text-[11px] font-medium text-[var(--theme-text)] truncate leading-tight">{getPublicDisplayName(user)}</span>
            {user.isMuted && <span className="text-[8px] text-red-400 font-bold shrink-0">MUTE</span>}
          </div>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} className="voice-participant-strip flex flex-wrap justify-center items-start content-center gap-x-2 gap-y-2 pt-1.5 pb-1 overflow-hidden">
      {leadingAccessory && (
        <div className="shrink-0">
          {leadingAccessory}
        </div>
      )}
      <AnimatePresence>
        {ordered.map(node => (
          <motion.div
            key={node.id}
            layout
            layoutId={`room-${node.id}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <RoomNode node={node} isCenter={node.isSelf} cardStyle={cardStyle} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* "+N" overflow */}
      {hasOverflow && (
        <div className="relative" ref={overflowRef}>
          {renderOverflowButton()}
        </div>
      )}
      {overflowPopup}
    </div>
  );
}
