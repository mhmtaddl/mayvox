import React from 'react';

// 30 bar — gradient fill, sol→sağ gezgin dalga, sıfır bloom / shadow

const N = 30;
const BARS = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1);
  const envelope = Math.sin(t * Math.PI);
  const mid      = Math.sin(t * Math.PI * 2.5);
  const fine     = Math.abs(Math.sin(i * 1.4 + 0.6)) * 0.22;
  const h = Math.round(22 + envelope * 28 + mid * 12 + fine * 10);
  return {
    h: Math.max(14, Math.min(72, h)),
    delay: parseFloat((i * 0.055).toFixed(2)),
    dur:   parseFloat((1.35 + (i % 5) * 0.06).toFixed(2)),
  };
});

export default function IdleVoiceWave() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 flex flex-col items-center mb-12"
    >
      <style>{`
        @keyframes idleBarWave {
          0%, 100% { transform: scaleY(0.10); }
          50%       { transform: scaleY(1); }
        }
      `}</style>

      <div
        className="relative flex items-end"
        style={{ gap: 4, height: 96, padding: '0 2px' }}
      >
        {BARS.map((bar, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: bar.h,
              borderRadius: 3,
              background: `linear-gradient(to top, rgba(var(--theme-accent-rgb), 0.22), rgba(var(--theme-accent-rgb), 0.88))`,
              transformOrigin: 'bottom',
              animation: `idleBarWave ${bar.dur}s ${bar.delay}s cubic-bezier(0.45, 0, 0.55, 1) infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
