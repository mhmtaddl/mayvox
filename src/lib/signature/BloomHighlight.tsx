import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MV_DURATION, MV_EASE } from './motion';

interface Props {
  /** Bloom aktif mi — sadece gerektiği anda render. */
  active: boolean;
  /** Aksan rengi — 'rgb(...)' veya 'rgba(...)' veya 'var(...)'. */
  color?: string;
  /** Opaklık peak (0..1). Default 0.35 — subtle. */
  intensity?: number;
  /** Bloom çapı (px). Default 60. */
  spread?: number;
  /** Kenar yuvarlama — üstüne bindiği kart ile uyumlu. */
  borderRadius?: number | string;
  /** z-index — default layout altına bırakacak şekilde 0. */
  zIndex?: number;
  /** Pointer event'leri absorbe etmesin. */
  className?: string;
}

/**
 * Signature "attention bloom" — soft radial glow + short-lived tint.
 *
 * Hard attention (flash/pulse) yerine:
 *   - appear 160ms
 *   - decay 600ms
 *   - pointer-events: none, absolute layer
 *   - GPU composite (opacity + transform)
 *
 * Kullanım:
 *   <div className="relative">
 *     <BloomHighlight active={isSpeaking} color="var(--theme-accent)" />
 *     ...content...
 *   </div>
 */
export default function BloomHighlight({
  active,
  color = 'var(--theme-accent)',
  intensity = 0.35,
  spread = 60,
  borderRadius = 12,
  zIndex = 0,
  className,
}: Props) {
  return (
    <AnimatePresence>
      {active && (
        <motion.span
          key="bloom"
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${className ?? ''}`}
          style={{
            borderRadius,
            zIndex,
            background: `radial-gradient(circle at 50% 50%, ${resolveColor(color, intensity)} 0%, rgba(0,0,0,0) 70%)`,
            boxShadow: `0 0 ${spread}px ${resolveColor(color, intensity * 0.6)}`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.16, ease: MV_EASE.softOut } }}
          exit={{ opacity: 0, transition: { duration: MV_DURATION.slow, ease: MV_EASE.softOut } }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * color parametresi:
 *   - CSS var → color-mix kullanılabilir ama cross-browser garanti değil,
 *     o yüzden color string'ini rgba'ya dönüştürmüyoruz; CSS var olduğu gibi
 *     kullanılıyor (arka planda blend).
 *   - rgb(x,y,z) formatı → rgba(x,y,z,intensity) üretilir.
 */
function resolveColor(color: string, alpha: number): string {
  const m = color.match(/^rgb\(([^)]+)\)$/);
  if (m) return `rgba(${m[1]}, ${alpha})`;
  // var() veya diğer string'ler → mix olmadan kullan (tarayıcı handle eder)
  return color;
}
