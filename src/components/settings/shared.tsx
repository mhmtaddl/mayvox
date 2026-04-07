import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ── Shared CSS classes ──
export const inputCls = 'w-full bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] rounded-xl px-4 py-2.5 text-[13px] focus:border-[var(--theme-accent)]/40 focus:ring-1 focus:ring-[var(--theme-accent)]/8 outline-none transition-all duration-150 text-[var(--theme-input-text)] placeholder:text-[var(--theme-input-placeholder)]';

export const labelCls = 'text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]';

export const cardCls = 'bg-[var(--theme-surface-card)] backdrop-blur-xl border border-[var(--theme-surface-card-border)] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.15)]';

// ── Toggle switch ──
export const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(); }}
    className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-all duration-180 focus:outline-none cursor-pointer ${
      checked
        ? 'bg-[var(--theme-accent)]'
        : 'bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.06)]'
    }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full shadow-sm transition-transform duration-180 ${
      checked ? 'translate-x-[21px] bg-white' : 'translate-x-[3px] bg-[rgba(255,255,255,0.5)]'
    }`} />
  </button>
);

// ── Section label (non-accordion) ──
export const SLabel = ({ icon, children, badge }: { icon: React.ReactNode; children: React.ReactNode; badge?: React.ReactNode }) => (
  <div className="flex items-center gap-2.5 mb-5">
    <span className="text-[var(--theme-accent)] opacity-60">{icon}</span>
    <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">{children}</span>
    {badge}
    <div className="flex-1 h-px bg-[rgba(255,255,255,0.04)] ml-2" />
  </div>
);

// ── Accordion section wrapper ──
export const AccordionSection = ({
  icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section className="group/section">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 mb-4 w-full cursor-pointer py-1 -mx-1 px-1 rounded-lg hover:bg-[rgba(255,255,255,0.02)] transition-colors duration-150"
      >
        <span className="text-[var(--theme-accent)] opacity-60">{icon}</span>
        <span className="text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">{title}</span>
        {badge}
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.04)] ml-2" />
        <ChevronDown
          size={13}
          className={`text-[var(--theme-secondary-text)] opacity-40 transition-transform duration-180 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </section>
  );
};
