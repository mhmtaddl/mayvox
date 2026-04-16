import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ── Shared CSS classes ──
// surface-input class'ı bg/border/shadow/focus/placeholder'ı merkezi yönetir (index.css).
// Burada sadece layout (padding/radius/font) kalıyor.
export const inputCls = 'surface-input w-full rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-[12px] md:text-[13px]';

export const labelCls = 'text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.12em]';

// Unified surface — Messages panel referanslı gradient + hairline + soft shadow.
// `.surface-card` bg/border/shadow'u merkezi token'lardan alır.
export const cardCls = 'surface-card rounded-2xl overflow-hidden';

// ── Toggle switch ──
export const Toggle = ({ checked, onChange, tooltip }: { checked: boolean; onChange: () => void; tooltip?: string }) => (
  <div className="flex items-center gap-2 shrink-0" title={tooltip}>
    <span className={`text-[10px] font-bold tracking-wide select-none transition-colors duration-150 ${
      checked ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/40'
    }`}>
      {checked ? 'ON' : 'OFF'}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(); }}
      className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-all duration-200 focus:outline-none cursor-pointer active:scale-95 ${
        checked
          ? 'bg-[var(--theme-accent)] shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.25)]'
          : 'bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.06)]'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-all duration-200 cubic-bezier(0.34,1.56,0.64,1) ${
        checked ? 'translate-x-[21px] bg-white scale-100' : 'translate-x-[3px] bg-[rgba(255,255,255,0.5)] scale-100'
      }`} />
    </button>
  </div>
);

// ── Card section wrapper (replaces AccordionSection for 2-col layout) ──
export const CardSection = ({
  icon,
  title,
  badge,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <section className={cardCls}>
    {/* Header satırı — title boşsa hiç render etme (outer DomainTitle zaten var).
        subtitle tek başına anlamlı olmadığı için o da gizli. Padding üst tarafta
        header yokken artsın diye children wrapper'da pt büyür. */}
    {(title || subtitle || badge) && (
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 md:gap-2.5 md:px-5 md:pt-4 md:pb-3">
        {title && <span className="text-[var(--theme-accent)] opacity-60">{icon}</span>}
        {title && <span className="text-[9px] md:text-[10px] font-semibold text-[var(--theme-secondary-text)] uppercase tracking-[0.14em]">{title}</span>}
        {badge}
        <div className="flex-1" />
        {subtitle && <span className="text-[8px] md:text-[9px] text-[var(--theme-secondary-text)]/50">{subtitle}</span>}
      </div>
    )}
    <div className={`px-3.5 md:px-5 pb-3 md:pb-4 ${(title || subtitle || badge) ? '' : 'pt-3.5 md:pt-4'}`}>
      {children}
    </div>
  </section>
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
