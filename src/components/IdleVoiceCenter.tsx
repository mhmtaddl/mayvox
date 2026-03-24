import React from 'react';

// 40 bar — gradient fill, traveling wave, sıfır bloom / shadow
// Her bar kendi gradyanıyla derinlik yaratır — ek glow/leke gereksiz

const N = 40;
const BARS = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1); // 0..1
  // Düzleştirilmiş bell curve: merkez geniş plateau, kenarlar hızlı düşer
  const envelope = Math.pow(Math.sin(t * Math.PI), 0.55);
  // Organik küçük dalgalanma — waveform hissi
  const organic = Math.abs(Math.sin(i * 1.9 + 0.6)) * 0.18;
  const h = Math.round(8 + envelope * 62 + organic * 12);
  return {
    h: Math.max(6, Math.min(80, h)),
    // Sol→sağ gezgin dalga — akıcı, "akan ses" hissi
    delay: parseFloat((i * 0.038).toFixed(2)),
    dur:   parseFloat((1.55 + (i % 7) * 0.07).toFixed(2)),
  };
});

export default function IdleVoiceCenter() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 flex flex-col items-center mb-12"
    >
      <style>{`
        @keyframes idleBarCenter {
          0%, 100% { transform: scaleY(0.08); }
          50%       { transform: scaleY(1); }
        }
      `}</style>

      <div
        className="relative flex items-end"
        style={{ gap: 3, height: 96, padding: '0 2px' }}
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
              animation: `idleBarCenter ${bar.dur}s ${bar.delay}s cubic-bezier(0.45, 0, 0.55, 1) infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
