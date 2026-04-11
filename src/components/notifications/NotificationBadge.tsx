import React from 'react';

interface Props {
  count: number;
  /** 'dot' = sadece nokta, 'count' = sayı göster */
  mode?: 'dot' | 'count';
  /** Renk varyantı */
  variant?: 'amber' | 'accent' | 'blue';
  /** Badge boyutu */
  size?: 'sm' | 'md';
  className?: string;
}

const VARIANT_COLORS = {
  amber: 'bg-amber-500 text-white',
  accent: 'bg-[var(--theme-badge-bg)] text-[var(--theme-badge-text)]',
  blue: 'bg-blue-500 text-white',
} as const;

/**
 * Ortak bildirim badge bileşeni.
 * Ayarlar ikonu ve bildirim çanı tarafından kullanılır.
 * count=0 ise hiçbir şey render etmez.
 */
export default function NotificationBadge({ count, mode = 'count', variant = 'accent', size = 'sm', className = '' }: Props) {
  if (count <= 0) return null;

  const colors = VARIANT_COLORS[variant];

  if (mode === 'dot') {
    const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
    return <span className={`${dotSize} ${colors.split(' ')[0]} rounded-full block ${className}`} />;
  }

  const label = count > 9 ? '9+' : String(count);
  const sizeClass = size === 'sm'
    ? 'min-w-[16px] h-[16px] text-[9px] px-1'
    : 'min-w-[18px] h-[18px] text-[10px] px-1.5';

  return (
    <span className={`${sizeClass} ${colors} rounded-full font-bold flex items-center justify-center leading-none ${className}`}>
      {label}
    </span>
  );
}
