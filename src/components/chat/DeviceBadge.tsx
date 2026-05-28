import React from 'react';

interface DeviceBadgeProps {
  platform?: 'mobile' | 'desktop';
  /** Badge pixel size (icon container) */
  size?: number;
  /** Additional CSS classes on the outer wrapper */
  className?: string;
}

/**
 * Cihaz tipi rozeti — avatarın köşesine absolute olarak yerleştirilir.
 * Dolu gövdeli, içinde ekran detayı olan sade ikon. Avatar üstünde okunabilirlik
 * için hafif drop-shadow + accent renk; ekstra daire/ring yok.
 */
const DeviceBadge: React.FC<DeviceBadgeProps> = ({
  platform,
  size = 14,
  className = '',
}) => {
  if (!platform) return null;

  const iconSize = Math.round(size * 0.86);
  const innerFill = 'rgba(var(--shadow-base),0.72)';
  const detailFill = 'rgba(var(--glass-tint),0.72)';
  const accentSoft = 'rgba(var(--theme-accent-rgb),0.42)';

  return (
    <div
      className={`z-10 flex items-center justify-center pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      title={platform === 'mobile' ? 'Mobil' : 'Masaüstü'}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="text-[var(--theme-accent)]"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.58))' }}
      >
        {platform === 'mobile' ? (
          <>
            <rect x="6.5" y="2.25" width="11" height="19.5" rx="3.1" fill="currentColor" />
            <rect x="8.2" y="5.4" width="7.6" height="11.8" rx="1.4" fill={innerFill} />
            <rect x="9.4" y="7" width="5.2" height="1.1" rx="0.55" fill={detailFill} />
            <rect x="9.4" y="9.2" width="3.6" height="1" rx="0.5" fill={accentSoft} />
            <rect x="9.4" y="11.3" width="4.8" height="1" rx="0.5" fill={detailFill} opacity="0.72" />
            <circle cx="12" cy="19" r="0.9" fill={innerFill} opacity="0.92" />
          </>
        ) : (
          <>
            <rect x="3.1" y="4.2" width="17.8" height="12.2" rx="2.8" fill="currentColor" />
            <rect x="5.2" y="6.3" width="13.6" height="7.8" rx="1.35" fill={innerFill} />
            <rect x="6.6" y="7.7" width="5.8" height="1.05" rx="0.52" fill={detailFill} />
            <rect x="6.6" y="10" width="4.2" height="1" rx="0.5" fill={accentSoft} />
            <rect x="12" y="10" width="5.2" height="1" rx="0.5" fill={detailFill} opacity="0.72" />
            <path d="M10.4 16.25h3.2l.5 2h2.35c.55 0 1 .45 1 1v.55H6.55v-.55c0-.55.45-1 1-1H9.9l.5-2Z" fill="currentColor" opacity="0.96" />
          </>
        )}
      </svg>
    </div>
  );
};

export default React.memo(DeviceBadge);
