import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ── Shared CSS classes ──
export const inputCls = 'w-full bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-xl px-3.5 py-2.5 text-sm focus:border-[var(--theme-accent)] focus:ring-2 focus:ring-[var(--theme-accent)]/10 outline-none transition-all text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40';
export const labelCls = 'text-[10px] font-bold text-[var(--theme-secondary-text)]/80 uppercase tracking-[0.1em]';
export const cardCls = 'bg-[var(--theme-sidebar)]/40 border border-[var(--theme-border)] rounded-2xl overflow-hidden shadow-sm';

// ── Toggle switch ──
export const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(); }}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
      checked ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border)]'
    }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

// ── Section label (non-accordion) ──
export const SLabel = ({ icon, children, badge }: { icon: React.ReactNode; children: React.ReactNode; badge?: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-5">
    <span className="text-[var(--theme-accent)]/70">{icon}</span>
    <span className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">{children}</span>
    {badge}
    <div className="flex-1 h-px bg-[var(--theme-border)]/60 ml-1" />
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
    <section>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 mb-3 w-full group cursor-pointer"
      >
        <span className="text-[var(--theme-accent)]/70">{icon}</span>
        <span className="text-[10px] font-bold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]">{title}</span>
        {badge}
        <div className="flex-1 h-px bg-[var(--theme-border)]/60 ml-1" />
        <ChevronDown
          size={14}
          className={`text-[var(--theme-secondary-text)]/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
