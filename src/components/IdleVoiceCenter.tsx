import React from 'react';

// 17 bar — bell-curve yükseklik + merkeze artan alpha + glow
// CSS only, 60fps — tema rengine tam uyum via --theme-accent-rgb

const HEIGHTS = [10, 18, 28, 40, 52, 62, 70, 76, 80, 76, 70, 62, 52, 40, 28, 18, 10] as const;
const ALPHAS  = [0.11, 0.22, 0.35, 0.50, 0.62, 0.74, 0.85, 0.93, 0.98, 0.93, 0.85, 0.74, 0.62, 0.50, 0.35, 0.22, 0.11] as const;

// Stagger: merkez (i=8) delay=0, dışa doğru ripple
const BARS = HEIGHTS.map((h, i) => ({
  h,
  a: ALPHAS[i],
  delay: parseFloat((Math.abs(i - 8) * 0.075).toFixed(2)),
  dur:   parseFloat((1.20 + (i % 5) * 0.12).toFixed(2)),
}));

// Orta 5 bar güçlü glow, sonraki 4 bar hafif glow
const STRONG_GLOW = new Set([6, 7, 8, 9, 10]);
const SOFT_GLOW   = new Set([5, 11]);

export default function IdleVoiceCenter() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 flex flex-col items-center mb-10"
    >
      <style>{`
        @keyframes idleBarCenter {
          0%, 100% { transform: scaleY(0.12); }
          50%       { transform: scaleY(1); }
        }
      `}</style>

      {/* Statik radial bloom — arkada, animasyonsuz */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 260,
          height: 110,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse at center bottom, rgba(var(--theme-accent-rgb), 0.20) 0%, transparent 68%)',
          borderRadius: '50%',
        }}
      />

      {/* Barlar */}
      <div
        className="relative flex items-end"
        style={{ gap: 5, height: 100, padding: '0 2px' }}
      >
        {BARS.map((bar, i) => {
          let shadow = 'none';
          if (STRONG_GLOW.has(i)) {
            shadow = `0 0 10px rgba(var(--theme-accent-rgb), 0.55), 0 0 3px rgba(var(--theme-accent-rgb), 0.80)`;
          } else if (SOFT_GLOW.has(i)) {
            shadow = `0 0 6px rgba(var(--theme-accent-rgb), 0.30)`;
          }
          return (
            <div
              key={i}
              style={{
                width: 4,
                height: bar.h,
                borderRadius: 4,
                background: `rgba(var(--theme-accent-rgb), ${bar.a})`,
                transformOrigin: 'bottom',
                animation: `idleBarCenter ${bar.dur}s ${bar.delay}s cubic-bezier(0.45, 0, 0.55, 1) infinite`,
                boxShadow: shadow,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
