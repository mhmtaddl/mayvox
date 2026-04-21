import React, { useEffect, useRef, useState } from 'react';

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
  // Count artınca (0→n veya n→n+1) tek seferlik pop — key değişince span yeniden mount olur,
  // CSS animation sıfırdan tetiklenir. Azalma/eşit durumlarda re-trigger yok.
  const [pulseKey, setPulseKey] = useState(0);
  const prevCountRef = useRef(count);
  useEffect(() => {
    if (count > prevCountRef.current && count > 0) setPulseKey(k => k + 1);
    prevCountRef.current = count;
  }, [count]);

  if (count <= 0) return null;

  const colors = VARIANT_COLORS[variant];

  if (mode === 'dot') {
    const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
    return <span key={pulseKey} className={`${dotSize} ${colors.split(' ')[0]} rounded-full block badge-pop ${className}`} />;
  }

  const label = count > 99 ? '99+' : String(count);
  const sizeClass = size === 'sm'
    ? 'min-w-[16px] h-[16px] text-[9px] px-1'
    : 'min-w-[18px] h-[18px] text-[10px] px-1.5';

  return (
    <span key={pulseKey} className={`${sizeClass} ${colors} rounded-full font-bold flex items-center justify-center leading-none badge-pop ${className}`}>
      {label}
    </span>
  );
}
