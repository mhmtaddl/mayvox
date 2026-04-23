import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface DeviceBadgeProps {
  platform?: 'mobile' | 'desktop';
  /** Badge pixel size (icon container) */
  size?: number;
  /** Additional CSS classes on the outer wrapper */
  className?: string;
}

/**
 * Cihaz tipi rozeti — avatarın köşesine absolute olarak yerleştirilir.
 * Sade: sadece ikon, arka plan dairesi/ring yok. Avatar üstünde okunabilirlik
 * için hafif drop-shadow + accent renk; tema renklerine uyumlu.
 */
const DeviceBadge: React.FC<DeviceBadgeProps> = ({
  platform,
  size = 14,
  className = '',
}) => {
  if (!platform) return null;

  const Icon = platform === 'mobile' ? Smartphone : Monitor;
  const iconSize = Math.round(size * 0.75);

  return (
    <div
      className={`z-10 flex items-center justify-center pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      title={platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
    >
      <Icon
        size={iconSize}
        className="text-[var(--theme-accent)]"
        strokeWidth={2.5}
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))' }}
      />
    </div>
  );
};

export default React.memo(DeviceBadge);
