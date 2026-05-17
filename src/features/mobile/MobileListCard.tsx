import React from 'react';
import { ChevronRight } from 'lucide-react';

interface MobileListCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  count?: number;
  onClick?: () => void;
}

export default function MobileListCard({ title, subtitle, icon, count, onClick }: MobileListCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-[13px] px-3 py-1.5 text-left active:scale-[0.995]"
      style={{
        background: 'rgba(var(--glass-tint),0.026)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.026)',
      }}
    >
      {icon && (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--theme-accent)]"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.07)' }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-[var(--theme-text)]/90">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/58">
            {subtitle}
          </span>
        )}
      </span>

      {typeof count === 'number' && (
        <span
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[9.5px] font-bold text-[var(--theme-accent)]"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}
        >
          {count}
        </span>
      )}

      <ChevronRight size={16} className="shrink-0 text-[var(--theme-secondary-text)]/38" aria-hidden="true" />
    </button>
  );
}
