import React from 'react';
import type { CardScale } from './types';

interface MiniEqualizerProps {
  speakingLevel: number;
  scale: CardScale;
}

const BAR_MULTIPLIERS = [0.65, 1.0, 0.55] as const;

function MiniEqualizerInner({ speakingLevel, scale }: MiniEqualizerProps) {
  const sizeClass = scale === 1 ? 'h-2' : scale === 2 ? 'h-2.5' : 'h-3';
  const lvl = speakingLevel * 100;

  return (
    <div className={`flex items-end gap-[2px] ${sizeClass}`}>
      {BAR_MULTIPLIERS.map((mult, j) => {
        const h = lvl > 4 ? Math.max(25, Math.min(100, lvl * mult)) : 25;
        return (
          <div
            key={j}
            className="w-[2px] rounded-full bg-[var(--theme-accent)] transition-all duration-200"
            style={{ height: `${h}%`, transformOrigin: 'bottom' }}
          />
        );
      })}
    </div>
  );
}

const MiniEqualizer = React.memo(MiniEqualizerInner);
export default MiniEqualizer;
