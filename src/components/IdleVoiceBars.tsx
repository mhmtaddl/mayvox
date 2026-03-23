import React from 'react';

// Arka plan atmosfer barları — çok düşük opacity, sadece derinlik hissi verir
// Asıl odak noktası: IdleVoiceCenter komponenti
const N = 32;
const BARS = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1);
  const bell = Math.sin(t * Math.PI);
  const noise = Math.abs(Math.sin(i * 1.9 + 0.8));
  return {
    maxH: Math.round(14 + bell * 50 + noise * 14),
    delay: parseFloat(((i * 0.13) % 1.7).toFixed(2)),
    dur: parseFloat((0.8 + (i % 6) * 0.11).toFixed(2)),
  };
});

export default function IdleVoiceBars() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
      style={{ opacity: 0.06, filter: 'blur(1px)' }}
    >
      <style>{`
        @keyframes idleBarBg {
          0%, 100% { transform: scaleY(0.08); }
          50%       { transform: scaleY(1); }
        }
      `}</style>
      <div className="flex items-center" style={{ gap: 5, width: '85%', maxWidth: 500 }}>
        {BARS.map((bar, i) => (
          <div
            key={i}
            style={{
              flex: '1 0 auto',
              maxWidth: 8,
              height: bar.maxH,
              borderRadius: 3,
              background: 'var(--theme-accent)',
              transformOrigin: 'center',
              animation: `idleBarBg ${bar.dur}s ${bar.delay}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
