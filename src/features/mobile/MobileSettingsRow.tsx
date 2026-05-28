import React, { useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

interface MobileSettingsRowProps {
  settingId?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: string | number;
  rightSlot?: React.ReactNode;
  onClick?: (settingId?: string) => void;
}

function MobileSettingsRow({
  settingId,
  title,
  subtitle,
  icon,
  badge,
  rightSlot,
  onClick,
}: MobileSettingsRowProps) {
  const handleClick = useCallback(() => {
    onClick?.(settingId);
  }, [onClick, settingId]);

  return (
    <button
      type="button"
      onClick={onClick ? handleClick : undefined}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-[13px] px-3 py-1.5 text-left active:scale-[0.995]"
      style={{
        background: 'rgba(var(--glass-tint),0.024)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.025)',
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
        <span className="block truncate text-[12.5px] font-semibold text-[var(--theme-text)]/90">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--theme-secondary-text)]/56">
            {subtitle}
          </span>
        )}
      </span>

      {badge !== undefined && (
        <span
          className="flex h-5 max-w-[88px] shrink-0 items-center rounded-full px-1.5 text-[9.5px] font-bold text-[var(--theme-accent)]"
          style={{ background: 'rgba(var(--theme-accent-rgb),0.08)' }}
        >
          <span className="truncate">{badge}</span>
        </span>
      )}

      {rightSlot || <ChevronRight size={16} className="shrink-0 text-[var(--theme-secondary-text)]/34" aria-hidden="true" />}
    </button>
  );
}

export default React.memo(MobileSettingsRow);

interface MobileSettingsGroupProps {
  title: string;
  children: React.ReactNode;
}

function MobileSettingsGroup({ title, children }: MobileSettingsGroupProps) {
  return (
    <section className="mb-2">
      <h3 className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--theme-secondary-text)]/64">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

const MemoMobileSettingsGroup = React.memo(MobileSettingsGroup);
export { MemoMobileSettingsGroup as MobileSettingsGroup };
