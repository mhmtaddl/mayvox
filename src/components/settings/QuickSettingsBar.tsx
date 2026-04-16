import React, { useRef, useState, useEffect } from 'react';
import { Eye, Palette, MoreHorizontal } from 'lucide-react';
import { Toggle } from './shared';
import { useSettings } from '../../contexts/SettingsCtx';

export default function QuickSettingsBar() {
  const {
    showLastSeen, setShowLastSeen,
    currentTheme,
  } = useSettings();

  // Overflow menu for narrow widths
  const barRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowItems, setOverflowItems] = useState<number[]>([]);

  // Check overflow on resize
  useEffect(() => {
    const check = () => {
      if (!barRef.current) return;
      const bar = barRef.current;
      const items: HTMLElement[] = Array.from(bar.querySelectorAll('[data-quick-item]'));
      const barRight = bar.getBoundingClientRect().right - 48;
      const hidden: number[] = [];
      items.forEach((item, i) => {
        item.style.display = '';
        const rect = item.getBoundingClientRect();
        if (rect.right > barRight) {
          hidden.push(i);
          item.style.display = 'none';
        }
      });
      setOverflowItems(hidden);
    };
    check();
    const ro = new ResizeObserver(check);
    if (barRef.current) ro.observe(barRef.current);
    return () => ro.disconnect();
  }, []);

  const items = [
    {
      key: 'lastSeen',
      content: (
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          <Eye size={13} className="text-[var(--theme-accent)] opacity-70 shrink-0" />
          <span className="text-[10px] font-semibold text-[var(--theme-text)] truncate">Son Görülme</span>
          <Toggle
            checked={showLastSeen}
            onChange={() => setShowLastSeen(!showLastSeen)}
          />
        </div>
      ),
    },
    {
      key: 'theme',
      content: (
        <div className="flex items-center gap-1 md:gap-1.5 min-w-0 cursor-default" title="Aktif tema">
          <Palette size={13} className="text-[var(--theme-accent)] opacity-70 shrink-0" />
          <span className="text-[10px] font-semibold text-[var(--theme-text)] truncate">{currentTheme.name}</span>
        </div>
      ),
    },
  ];

  return (
    <div
      ref={barRef}
      className="flex flex-wrap items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-2.5 rounded-xl bg-[var(--theme-surface-card)] border border-[var(--theme-surface-card-border)] shadow-sm"
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          data-quick-item
          className="flex items-center shrink min-w-0"
        >
          {i > 0 && <div className="w-px h-4 bg-[var(--theme-border)]/30 mr-2 md:mr-3 hidden xl:block" />}
          {item.content}
        </div>
      ))}

      {overflowItems.length > 0 && (
        <div className="ml-auto relative shrink-0">
          <button
            onClick={() => setShowOverflow(!showOverflow)}
            className="w-7 h-7 rounded-lg bg-[var(--theme-border)]/20 flex items-center justify-center text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          {showOverflow && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--theme-surface-card)] border border-[var(--theme-surface-card-border)] rounded-xl shadow-lg p-3 z-50 space-y-2 min-w-[160px]">
              {overflowItems.map(idx => (
                <div key={items[idx].key}>{items[idx].content}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
