import React from 'react';
import type { CardScale } from './types';

interface OwnVoiceEqualizerProps {
  volumeLevel: number;
  scale: CardScale;
}

const BAR_COUNT = 6;

function OwnVoiceEqualizerInner({ volumeLevel, scale }: OwnVoiceEqualizerProps) {
  const sizeClass = scale === 1 ? 'h-2 w-8' : scale === 2 ? 'h-2.5 w-10' : 'h-3 w-12';

  return (
    <div className={`flex items-end gap-0.5 ${sizeClass}`}>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const idx = i + 1;
        const isActive = volumeLevel > idx * 15;
        return (
          <div
            key={idx}
            className={`w-[2px] rounded-full transition-all duration-75 ${isActive ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]/25'}`}
            style={{ height: isActive ? `${Math.max(20, Math.min(100, volumeLevel - idx * 5))}%` : '20%' }}
          />
        );
      })}
    </div>
  );
}

const OwnVoiceEqualizer = React.memo(OwnVoiceEqualizerInner);
export default OwnVoiceEqualizer;
