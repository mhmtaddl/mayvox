import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * VoiceControlButton — mic / headphones toggle.
 *
 * ON  (active=true)  → accent renk (temaya göre, orijinal davranış)
 * OFF (active=false) → kırmızı + slashed ikon
 *                      (Kızıl temada kırmızı-üstü-kırmızı olmasın diye nötr gri;
 *                       override CSS ile `[data-theme-pack="crimson"]` altında)
 * override="warning" → admin-muted turuncu
 */
interface Props {
  active: boolean;
  icon: LucideIcon;
  offIcon: LucideIcon;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  override?: 'warning' | null;
  size?: number;
  className?: string;
}

export default function VoiceControlButton({
  active,
  icon: Icon,
  offIcon: OffIcon,
  onClick,
  title,
  disabled,
  override = null,
  size = 16,
  className = '',
}: Props) {
  const base =
    'w-10 h-10 rounded-xl flex items-center justify-center btn-haptic border transition-colors duration-150';

  if (override === 'warning') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-pressed={!active}
        className={`${base} bg-orange-500/20 text-orange-400 border-orange-500/25 ${className}`}
      >
        <OffIcon size={size} strokeWidth={2} />
      </button>
    );
  }

  const activeCls =
    'bg-[var(--theme-accent)]/15 text-[var(--theme-accent)] border-[var(--theme-accent)]/25';
  const inactiveCls =
    'voice-ctrl-off bg-red-500/20 text-red-400 border-red-500/25';

  const CurrentIcon = active ? Icon : OffIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={!active}
      className={`${base} ${active ? activeCls : inactiveCls} ${className}`}
    >
      <CurrentIcon size={size} strokeWidth={2} />
    </button>
  );
}
