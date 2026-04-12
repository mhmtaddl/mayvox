/**
 * MAYVOX Signature Motion — tüm UI için tek motion dili.
 *
 * Prensip: calm + intentional. Aşırı yok, cartoonish yok, duration capped.
 * framer-motion ile uyumlu; zaten projede kullanılıyor — yeni dependency yok.
 *
 * Kullanım:
 *   <motion.div transition={MV_MOTION.spring.soft} />
 *   <motion.button {...MV_PRESS} />
 */

// Spring presetleri — stiffness / damping / mass sabitleri
export const MV_SPRING = {
  /** Entrance default — soft + hafif spring */
  soft:   { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.9 },
  /** Hızlı + kararlı — button press gibi micro haptic */
  crisp:  { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.7 },
  /** Panel / modal girişi — biraz daha lüks */
  gentle: { type: 'spring' as const, stiffness: 220, damping: 26, mass: 1.0 },
};

// Duration tiers — sabit sayılar, ölçülebilir
export const MV_DURATION = {
  fast:   0.14,   // exit, dismiss, micro feedback
  normal: 0.22,   // hover, small transitions
  slow:   0.42,   // panel / modal open
} as const;

// Cubic-bezier easing'ler — soft-out + soft-in-out
export const MV_EASE = {
  softOut:   [0.25, 1, 0.5, 1] as const,
  softInOut: [0.45, 0, 0.25, 1] as const,
  sharpOut:  [0.2, 0.9, 0.2, 1] as const,
};

// Micro scale değerleri — aşırı hiçbir zaman
export const MV_SCALE = {
  hover: 1.015,   // max 1.02 kuralı
  press: 0.985,   // max 0.97–0.99
} as const;

// Standart entrance/exit helper'ları (JSX spread için)
export const MV_ENTRANCE = {
  initial:    { opacity: 0, y: 6, scale: 0.98 },
  animate:    { opacity: 1, y: 0, scale: 1 },
  exit:       { opacity: 0, y: 4, scale: 0.98, transition: { duration: MV_DURATION.fast, ease: MV_EASE.softOut } },
  transition: MV_SPRING.soft,
};

export const MV_MOTION = {
  spring: MV_SPRING,
  duration: MV_DURATION,
  ease: MV_EASE,
  scale: MV_SCALE,
};
