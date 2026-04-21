import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'warn' | 'danger';
  pending?: boolean; // "yakında" rozeti + disabled
  separatorBefore?: boolean; // öncesinde ayraç çiz
  /** Bu item kendi popover'ını (role picker, timeout picker) açacaksa `false`. Default: true.
   *  Sebep: React 18 auto-batching. Handler setPopover({kind:'x'}) ve onClose setPopover(null)
   *  aynı tick'te çalışırsa son olan (null) kazanır → sub-popover hiç açılmaz. */
  closesMenu?: boolean;
}

interface Props {
  items: ActionItem[];
  anchorRect: DOMRect;
  onClose: () => void;
}

/**
 * Portal'lı kebab/action menü.
 * Fixed positioning anchor rect'e göre — scroll'da/resize'da da otomatik kapanır.
 * Outside click + Escape + scroll ile kapanır.
 */
export default function ActionMenu({ items, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right: number | 'auto' }>({
    top: anchorRect.bottom + 6,
    left: anchorRect.right - 220, // 220 = min-width
    right: 'auto',
  });

  // İlk render sonrası gerçek genişliği ölç, viewport'a sığdır
  useLayoutEffect(() => {
    if (!ref.current) return;
    const menu = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.right - menu.width;
    // sağa taşarsa
    if (left + menu.width > vw - 8) left = vw - menu.width - 8;
    // sola taşarsa
    if (left < 8) left = 8;
    // alta taşarsa üste aç
    if (top + menu.height > vh - 8) top = anchorRect.top - menu.height - 6;
    setPos({ top, left, right: 'auto' });
  }, [anchorRect]);

  // Outside click + ESC + scroll
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  const toneClass = (tone?: ActionItem['tone'], disabled?: boolean) => {
    if (disabled) return 'text-[#7b8ba8]/45 cursor-not-allowed';
    switch (tone) {
      case 'danger': return 'text-red-400 hover:bg-red-500/10 hover:text-red-300';
      case 'warn': return 'text-orange-400 hover:bg-orange-500/10 hover:text-orange-300';
      default: return 'text-[var(--theme-text)]/85 hover:bg-[rgba(var(--glass-tint),0.06)] hover:text-[var(--theme-text)]';
    }
  };

  const menu = (
    <div
      ref={ref}
      className="popup-surface"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: 220,
        zIndex: 600,
        padding: '6px',
        animation: 'actionMenuIn 140ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        const disabled = !!item.disabled || !!item.pending;
        return (
          <React.Fragment key={item.id}>
            {item.separatorBefore && idx > 0 && (
              <div className="my-1 mx-1 h-px" style={{ background: 'rgba(var(--glass-tint),0.08)' }} />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                item.onClick();
                // Sub-popover açan item'lar için onClose çağırma — item'ın kendi
                // setPopover({kind:'...'})'i popover.kind değiştirince zaten ActionMenu unmount olur.
                if (item.closesMenu !== false) onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12.5px] font-medium tracking-tight transition-colors duration-150 ${toneClass(item.tone, disabled)}`}
            >
              {item.icon && (
                <span className="shrink-0 inline-flex items-center justify-center w-4">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 text-left">{item.label}</span>
              {item.pending && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(251,191,36,0.12)',
                    color: 'rgba(251,191,36,0.9)',
                    border: '1px solid rgba(251,191,36,0.22)',
                  }}
                >
                  yakında
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
      <style>{`
        @keyframes actionMenuIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(menu, document.body);
}
