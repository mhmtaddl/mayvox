import React, { useMemo, useState } from 'react';

export interface MobileContextTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface MobileContextTabsProps {
  tabs?: MobileContextTab[];
  activeKey?: string;
  onChange?: (key: string) => void;
}

const DEFAULT_SERVER_HOME_TABS: MobileContextTab[] = [
  { key: 'home', label: 'Ana' },
  { key: 'announcements', label: 'Duyurular' },
  { key: 'events', label: 'Etkinlikler' },
  { key: 'discover', label: 'Kesif' },
  { key: 'rules', label: 'Kurallar' },
  { key: 'activity', label: 'Hareketler' },
];

export default function MobileContextTabs({ tabs, activeKey, onChange }: MobileContextTabsProps) {
  const items = tabs && tabs.length > 0 ? tabs : DEFAULT_SERVER_HOME_TABS;
  const [localActive, setLocalActive] = useState(items[0]?.key ?? '');
  const selected = activeKey ?? localActive;

  const renderedTabs = useMemo(() => items, [items]);

  return (
    <nav className="shrink-0 overflow-x-auto px-3 pb-1.5 custom-scrollbar" aria-label="Mobil sekmeler">
      <div
        className="mx-auto flex min-w-max max-w-[1180px] items-center justify-center gap-8 border-b border-[rgba(var(--glass-tint),0.045)] sm:min-w-0 sm:px-2"
      >
        {renderedTabs.map(tab => {
          const active = selected === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setLocalActive(tab.key);
                onChange?.(tab.key);
              }}
              className={`relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 px-0 text-[11px] font-bold transition-colors active:scale-[0.98] ${
                active
                  ? 'text-[var(--theme-text)]'
                  : 'text-[var(--theme-secondary-text)]/64'
              }`}
              aria-pressed={active}
            >
              {tab.icon && <span className={active ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/58'} aria-hidden="true">{tab.icon}</span>}
              <span className="leading-none">{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black"
                  style={{
                    background: active ? 'rgba(var(--theme-accent-rgb),0.16)' : 'rgba(var(--glass-tint),0.04)',
                    color: active ? 'var(--theme-accent)' : 'rgba(var(--glass-tint),0.62)',
                  }}
                >
                  {tab.count}
                </span>
              )}
              {active && (
                <span
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                  style={{ background: 'rgba(var(--theme-accent-rgb),0.82)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
