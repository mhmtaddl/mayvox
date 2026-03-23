import React from 'react';

// 30 bar — sol→sağ dalga hareketi + organik yükseklik profili
// Minimal Barlar'dan farkı: merkez-dışı ripple yerine gezgin dalga (traveling wave)

const N = 30;
const BARS = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1); // 0..1
  // Organik yükseklik: üç farklı frekans üst üste bindirilmiş
  const envelope = Math.sin(t * Math.PI);          // kenar solması
  const mid      = Math.sin(t * Math.PI * 2.5);    // orta dalgalanma
  const fine     = Math.abs(Math.sin(i * 1.4 + 0.6)); // ince düzensizlik
  const h = Math.round(22 + envelope * 28 + mid * 12 + fine * 10);
  return {
    h: Math.max(14, Math.min(72, h)),
    // Kenarlarda hafif, ortada parlak
    a: parseFloat((0.35 + envelope * 0.45).toFixed(2)),
    // Sol→sağ doğrusal gecikme — gezgin dalga etkisi
    delay: parseFloat((i * 0.055).toFixed(2)),
    dur:   parseFloat((1.35 + (i % 5) * 0.06).toFixed(2)),
  };
});

// Sadece orta 6 bar için hafif glow
const GLOW_RANGE = new Set([12, 13, 14, 15, 16, 17]);

export default function IdleVoiceWave() {
  return (
    <div
      aria-hidden="true"
      className="relative z-10 flex flex-col items-center mb-10"
    >
      <style>{`
        @keyframes idleBarWave {
          0%, 100% { transform: scaleY(0.10); }
          50%       { transform: scaleY(1); }
        }
      `}</style>

      {/* Geniş yatay bloom — dalga genişliğiyle uyumlu */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 320,
          height: 80,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse at center bottom, rgba(var(--theme-accent-rgb), 0.14) 0%, transparent 72%)',
          borderRadius: '50%',
        }}
      />

      {/* Barlar */}
      <div
        className="relative flex items-end"
        style={{ gap: 4, height: 100, padding: '0 2px' }}
      >
        {BARS.map((bar, i) => {
          const shadow = GLOW_RANGE.has(i)
            ? `0 0 7px rgba(var(--theme-accent-rgb), 0.40), 0 0 2px rgba(var(--theme-accent-rgb), 0.65)`
            : 'none';
          return (
            <div
              key={i}
              style={{
                width: 3,
                height: bar.h,
                borderRadius: 3,
                background: `rgba(var(--theme-accent-rgb), ${bar.a})`,
                transformOrigin: 'bottom',
                animation: `idleBarWave ${bar.dur}s ${bar.delay}s cubic-bezier(0.45, 0, 0.55, 1) infinite`,
                boxShadow: shadow,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
