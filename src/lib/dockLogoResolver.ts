import logoTr from '../assets/dock-logo-mv_tr.png';
import logoYes from '../assets/dock-logo-mv_yes.png';
import logoK from '../assets/dock-logo-mv_k.png';
import logoGir from '../assets/dock-logo-mv_gir.png';
import logoSar from '../assets/dock-logo-mv_sar.png';
import logoCok from '../assets/dock-logo-mv_cok.png';

import type { ThemeKey } from '../themes';

const PALETTE_LOGO: Record<ThemeKey, string> = {
  cyanViolet:       logoTr,
  emeraldCyan:      logoYes,
  violetPink:       logoK,
  espressoSunlight: logoGir,
  blueYellow:       logoSar,
  midnightBlueBird: logoCok,
};

/**
 * Aktif renk paletine göre dock logo varyantını döndürür.
 * Deterministik, birebir eşleşme.
 */
export function resolveDockLogo(paletteKey: ThemeKey): string {
  return PALETTE_LOGO[paletteKey] ?? logoTr;
}
