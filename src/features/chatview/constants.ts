import React from 'react';
import {
  Bomb,
  Coffee,
  Crosshair,
  Crown,
  Bot,
  Cpu,
  Flame,
  Gamepad2,
  Gem,
  Headphones,
  MessageCircle,
  Monitor,
  Music,
  PartyPopper,
  Radio,
  Radar,
  Rocket,
  Shield,
  Swords,
  Target,
  Trophy,
  UserRoundPlus,
  Users,
  VolumeX,
  Zap,
} from 'lucide-react';
import { isCapacitor } from '../../lib/platform';

type IconComponent = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;

export function TankIcon({ size = 24, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  const common = {
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  return React.createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', className, style, 'aria-hidden': true },
    React.createElement('path', { d: 'M5.8 9.2h8.2c.8 0 1.5.2 2 .8l1.1 1h4.2', ...common }),
    React.createElement('path', { d: 'M5 9.4l1.7-2.3h6.7l2 2.3', ...common }),
    React.createElement('path', { d: 'M3.8 11.6h12.5c2.4 0 4.2 1.5 4.2 3.5v.1c0 1.3-1 2.3-2.4 2.3H4.9c-1.9 0-3.4-1.3-3.4-3s1-2.9 2.3-2.9Z', ...common }),
    React.createElement('path', { d: 'M5.1 15.1h12.3', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
    React.createElement('path', { d: 'M6 17.5h10.4', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', opacity: 0.45 }),
  );
}

/** Room mode → lucide icon mapping (tek kaynak, tüm chatview component'leri kullanır) */
export const roomModeIcons: Record<string, IconComponent> = {
  social: Coffee,
  gaming: Gamepad2,
  broadcast: Radio,
  quiet: VolumeX,
};

export const roomModeIconClass: Record<string, string> = {
  social: 'text-sky-400',
  gaming: 'text-emerald-400',
  broadcast: 'text-rose-400',
  quiet: 'text-violet-300',
};

export const channelIconComponents: Record<string, IconComponent> = {
  coffee: Coffee,
  gamepad: Gamepad2,
  radio: Radio,
  quiet: VolumeX,
  users: Users,
  party: PartyPopper,
  message: MessageCircle,
  crosshair: Crosshair,
  target: Target,
  swords: Swords,
  shield: Shield,
  bomb: Bomb,
  trophy: Trophy,
  userPlus: UserRoundPlus,
  music: Music,
  headphones: Headphones,
  monitor: Monitor,
  zap: Zap,
  crown: Crown,
  flame: Flame,
  rocket: Rocket,
  tank: TankIcon,
  radar: Radar,
  gem: Gem,
  bot: Bot,
  cpu: Cpu,
};

/** Capacitor (Android telefon/tablet) → her zaman mobil layout */
export const FORCE_MOBILE = isCapacitor();
