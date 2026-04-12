/**
 * MAYVOX Signature Experience — v4 shared module barrel.
 *
 * Katmanlar:
 *   - motion.ts              → spring + duration + easing + scale presets
 *   - interactionFeedback.ts → MV_PRESS, MV_PRESS_SOFT, MV_PRESS_ELEVATE
 *   - BloomHighlight.tsx     → soft radial attention bloom
 *   - sound.ts               → opt-in UI signature sounds (notification ≠ bu)
 *   - signature.css          → idle-aware motion gate + breath + pressable
 *
 * Kullanım mottosu: "feel, don't see". Her componenta zorla değil, opt-in.
 */

export * from './motion';
export * from './interactionFeedback';
export { default as BloomHighlight } from './BloomHighlight';
export {
  playSignature,
  setSignatureSoundEnabled,
  isSignatureSoundEnabled,
  setSignatureMasterGain,
  disposeSignatureSound,
  type SignatureSound,
} from './sound';
