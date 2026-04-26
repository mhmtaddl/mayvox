import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import RoomNode from './RoomNode';
import type { RoomNodeData, PositionedNode } from './roomNetworkLayout';
import { getPublicDisplayName } from '../../lib/formatName';
import AvatarContent from '../AvatarContent';
import type { CardStyle } from './cardStyles';

interface Props {
  participants: RoomNodeData[];
  cardStyle?: CardStyle;
}

function calcVisibleCount(containerW: number): number {
  if (containerW <= 0) return 6;
  const gap = 16;
  const minSlot = 108 + gap;
  const row1 = Math.max(1, Math.floor((containerW - 156) / minSlot));
  const row2 = Math.max(1, Math.floor(containerW / minSlot));
  return Math.max(3, row1 + row2);
}

export default function RoomNetworkVisualization({ participants, cardStyle = 'current' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState(12);
  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMaxVisible(calcVisibleCount(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  const self = participants.find(p => p.isSelf);
  const remotes = participants.filter(p => !p.isSelf);

  const sortedRemotes = useMemo(() => {
    return [...remotes].sort((a, b) => {
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      if (a.isMuted !== b.isMuted) return a.isMuted ? 1 : -1;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [remotes]);

  const hasOverflow = sortedRemotes.length > maxVisible;
  const visibleSlots = hasOverflow ? maxVisible - 1 : sortedRemotes.length;
  const visibleRemotes = sortedRemotes.slice(0, visibleSlots);
  const hiddenRemotes = sortedRemotes.slice(visibleSlots);

  const remoteScale = Math.max(0.6, Math.min(1.0, 1.0 - (visibleRemotes.length - 1) * 0.05));

  const ordered: PositionedNode[] = [];
  if (self) ordered.push({ ...self, x: 0, y: 0, ring: 0, scale: 1 });
  visibleRemotes.forEach(p => ordered.push({ ...p, x: 0, y: 0, ring: 1, scale: remoteScale }));

  return (
    <div ref={containerRef} className="flex flex-wrap justify-center items-start content-center gap-4 py-4 overflow-hidden">
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
          <button
            onClick={() => setOverflowOpen(p => !p)}
            className="flex flex-col items-center justify-center cursor-pointer select-none"
            style={{
              width: 108,
              padding: '10px 8px 8px',
              background: overflowOpen ? 'rgba(var(--glass-tint), 0.04)' : 'rgba(var(--glass-tint), 0.025)',
              border: overflowOpen ? '1px solid rgba(var(--glass-tint), 0.08)' : '1px solid rgba(var(--glass-tint), 0.05)',
              borderRadius: 16,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: '22%', background: 'rgba(var(--theme-accent-rgb), 0.08)', border: '1px solid rgba(var(--glass-tint), 0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              <span className="text-[var(--theme-accent)] font-bold text-[16px]">+{hiddenRemotes.length}</span>
            </div>
            <span className="mt-1.5 text-[10px] font-medium text-[var(--theme-secondary-text)] opacity-60">diğerleri</span>
          </button>

          <AnimatePresence>
            {overflowOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 max-h-64 overflow-y-auto custom-scrollbar py-2 px-1 popup-surface"
              >
                {hiddenRemotes.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-[rgba(var(--glass-tint),0.04)] transition-colors"
                    onClick={(e) => { user.onClick?.(e); setOverflowOpen(false); }}
                  >
                    <div className="shrink-0 overflow-hidden flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: '22%', background: 'rgba(var(--theme-accent-rgb), 0.06)', border: user.isSpeaking ? '1.5px solid rgba(var(--theme-accent-rgb), 0.3)' : '1px solid rgba(var(--glass-tint), 0.06)' }}>
                    <AvatarContent avatar={user.avatar} statusText={user.statusText} firstName={user.displayName || user.firstName} name={getPublicDisplayName(user)} letterClassName="text-[var(--theme-text)] font-semibold text-[9px]" />
                    </div>
                    <span className="flex-1 min-w-0 text-[11px] font-medium text-[var(--theme-text)] truncate leading-tight">{getPublicDisplayName(user)}</span>
                    {user.isMuted && <span className="text-[8px] text-red-400 font-bold shrink-0">MUTE</span>}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
