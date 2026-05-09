import React from 'react';

type EmptyStateSize = 'xs' | 'sm' | 'md';
type EmptyStateTone = 'neutral' | 'accent';

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: EmptyStateSize;
  tone?: EmptyStateTone;
  className?: string;
};

const sizeClass: Record<EmptyStateSize, { wrap: string; icon: string; title: string; desc: string; max: string }> = {
  xs: {
    wrap: 'py-5 px-3 gap-2',
    icon: 'h-9 w-9 rounded-xl',
    title: 'text-[11.5px]',
    desc: 'text-[10px]',
    max: 'max-w-[210px]',
  },
  sm: {
    wrap: 'py-8 px-5 gap-2.5',
    icon: 'h-10 w-10 rounded-xl',
    title: 'text-[12.5px]',
    desc: 'text-[10.5px]',
    max: 'max-w-[250px]',
  },
  md: {
    wrap: 'py-10 px-6 gap-3',
    icon: 'h-12 w-12 rounded-2xl',
    title: 'text-[13px]',
    desc: 'text-[11px]',
    max: 'max-w-xs',
  },
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'sm',
  tone = 'neutral',
  className = '',
}: Props) {
  const s = sizeClass[size];
  const accent = tone === 'accent';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${s.wrap} ${className}`}>
      {icon && (
        <div
          className={`inline-flex shrink-0 items-center justify-center border ${s.icon}`}
          style={{
            background: accent
              ? 'linear-gradient(135deg, rgba(var(--theme-accent-rgb),0.12), rgba(var(--theme-accent-rgb),0.035))'
              : 'rgba(var(--glass-tint),0.045)',
            borderColor: accent
              ? 'rgba(var(--theme-accent-rgb),0.16)'
              : 'rgba(var(--glass-tint),0.075)',
            color: accent ? 'var(--theme-accent)' : 'var(--theme-secondary-text)',
          }}
        >
          <span className={accent ? 'opacity-75' : 'opacity-45'}>{icon}</span>
        </div>
      )}

      <div className={`flex flex-col items-center ${s.max}`}>
        <p className={`font-semibold leading-tight tracking-tight text-[var(--theme-text)]/82 ${s.title}`}>
          {title}
        </p>
        {description && (
          <p className={`mt-1 leading-snug text-[var(--theme-secondary-text)]/48 ${s.desc}`}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-2 inline-flex items-center justify-center">{action}</div>}
    </div>
  );
}
