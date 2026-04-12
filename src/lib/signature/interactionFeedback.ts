/**
 * Micro-haptic visual feedback — framer-motion props preset.
 *
 * Kullanım:
 *   <motion.button {...MV_PRESS}>Send</motion.button>
 *   <motion.div {...MV_PRESS_SOFT} />
 *
 * "Hover = feel, click = confirm" prensibi.
 * GPU transform only — reflow yok, repaint minimum.
 */

import { MV_SPRING, MV_SCALE } from './motion';

/** Standart pressable — buttonlar için. */
export const MV_PRESS = {
  whileHover: { scale: MV_SCALE.hover },
  whileTap: { scale: MV_SCALE.press },
  transition: MV_SPRING.crisp,
};

/** Daha yumuşak — nav iconları, küçük clickable öğeler. */
export const MV_PRESS_SOFT = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: MV_SPRING.soft,
};

/** Pressable helper — hover'da shadow elevate (depth cue). */
export const MV_PRESS_ELEVATE = {
  whileHover: { scale: MV_SCALE.hover, y: -1 },
  whileTap: { scale: MV_SCALE.press, y: 0 },
  transition: MV_SPRING.crisp,
};

/**
 * Idle-aware motion gate helper — `window.window-inactive` CSS sınıfı zaten
 * `useWindowActivity` tarafından set ediliyor. Bu fonksiyon component
 * içinden okunarak "uygulama inactive'ken animasyonu basitleştir" kararı
 * alınabilir.
 */
export function isWindowInactive(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('window-inactive');
}
