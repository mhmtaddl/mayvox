import React from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, { container: string; text: string; radius: string }> = {
  xs: { container: 'w-5 h-5', text: 'text-[7px]', radius: 'rounded-[6px]' },
  sm: { container: 'w-7 h-7', text: 'text-[9px]', radius: 'rounded-[8px]' },
  md: { container: 'w-9 h-9', text: 'text-[10px]', radius: 'rounded-[10px]' },
  lg: { container: 'w-10 h-10', text: 'text-[11px]', radius: 'rounded-[12px]' },
  xl: { container: 'w-14 h-14', text: 'text-[16px]', radius: 'rounded-[14px]' },
};

interface Props {
  src?: string | null;
  fallback?: string;
  size?: AvatarSize;
  className?: string;
  style?: React.CSSProperties;
}

export default function Avatar({ src, fallback = '?', size = 'md', className = '', style }: Props) {
  const s = SIZE_MAP[size];
  const [imgError, setImgError] = React.useState(false);
  const showImg = !!src && !imgError;

  return (
    <div
      className={`${s.container} ${s.radius} overflow-hidden flex items-center justify-center shrink-0 ${className}`}
      style={{ background: showImg ? 'none' : 'rgba(var(--theme-accent-rgb), 0.08)', ...style }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          className={`${s.container} object-cover`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={`${s.text} font-bold text-[var(--theme-accent)] opacity-70`}>
          {fallback.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}
