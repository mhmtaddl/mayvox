import React from 'react';
import { Coffee, Gamepad2, Radio, VolumeX } from 'lucide-react';
import { isCapacitor } from '../../lib/platform';

/** Room mode → lucide icon mapping (tek kaynak, tüm chatview component'leri kullanır) */
export const roomModeIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  social: Coffee,
  gaming: Gamepad2,
  broadcast: Radio,
  quiet: VolumeX,
};

/** Capacitor (Android telefon/tablet) → her zaman mobil layout */
export const FORCE_MOBILE = isCapacitor();
