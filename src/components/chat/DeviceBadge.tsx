import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface DeviceBadgeProps {
  platform?: 'mobile' | 'desktop';
  /** Badge pixel size (icon container) */
  size?: number;
  /** Additional CSS classes on the outer wrapper */
  className?: string;
  /** Border color to match the parent background — defaults to --theme-sidebar */
  borderColor?: string;
}

/**
 * Cihaz tipi rozeti — avatarın köşesine absolute olarak yerleştirilir.
 * Tema renklerine uyumludur, hardcoded renk kullanmaz.
 */
const DeviceBadge: React.FC<DeviceBadgeProps> = ({
  platform,
  size = 14,
  className = '',
  borderColor,
}) => {
  // Platform bilinmiyorsa rozet gösterme
  if (!platform) return null;

  const iconSize = Math.round(size * 0.57);

  return (
    <div
      className={`z-10 flex items-center justify-center rounded-full bg-[var(--theme-bg)] pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 2px ${borderColor || 'var(--theme-sidebar)'}`,
      }}
      title={platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
    >
      {platform === 'mobile' ? (
        <Smartphone
          size={iconSize}
          className="text-[var(--theme-accent)]"
          strokeWidth={2.5}
        />
      ) : (
        <Monitor
          size={iconSize}
          className="text-[var(--theme-accent)]"
          strokeWidth={2.5}
        />
      )}
    </div>
  );
};

export default React.memo(DeviceBadge);
