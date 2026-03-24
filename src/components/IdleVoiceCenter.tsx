import React from 'react';

// 40 bar — merkez vurgulu gradient, opacity animasyonu, organik dalga hareketi
// Sıfır shadow / bloom / glow — temizlik korunuyor

const N = 40;

const BARS = Array.from({ length: N }, (_, i) => {
  const t = i / (N - 1);

  // Güçlü merkez: 0.65 kuvveti ile zirvede belirgin, kenarlarda dik düşüş
  const envelope = Math.pow(Math.sin(t * Math.PI), 0.65);

  // İki frekanslı organik varyasyon:
  // slowWave: ~9-10 barı bir grup gibi hareket ettirir (komşu bar koheransı)
  // fineNoise: ince waveform dokusu
  const slowWave  = Math.sin(i * 0.65 + 0.3) * 0.10;
  const fineNoise = Math.abs(Math.sin(i * 2.10 + 0.8)) * 0.06;
  const h = Math.round(8 + envelope * 66 + (slowWave + fineNoise) * 14);

  // Merkez barlar daha parlak gradient alır
  const gradLow  = parseFloat((0.18 + envelope * 0.08).toFixed(2)); // 0.18 → 0.26
  const gradHigh = parseFloat((0.80 + envelope * 0.18).toFixed(2)); // 0.80 → 0.98

  return {
    h: Math.max(6, Math.min(78, h)),
    gradLow,
    gradHigh,
    // Sol→sağ gezgin dalga
    delay: parseFloat((i * 0.040).toFixed(2)),
    // Sin tabanlı süre — % modulo yerine smooth geçiş, 1.50–1.90s aralığı
    dur: parseFloat((1.70 + Math.sin(i * 0.40) * 0.20).toFixed(2)),
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
          0%, 100% { transform: scaleY(0.08); opacity: 0.55; }
          50%       { transform: scaleY(1);    opacity: 1; }
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
              background: `linear-gradient(to top, rgba(var(--theme-accent-rgb), ${bar.gradLow}), rgba(var(--theme-accent-rgb), ${bar.gradHigh}))`,
              transformOrigin: 'bottom',
              // backwards: delay süresi boyunca 0% keyframe'i (collapsed) uygula
              animation: `idleBarCenter ${bar.dur}s ${bar.delay}s cubic-bezier(0.45, 0, 0.55, 1) infinite backwards`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
