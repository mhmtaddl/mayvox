import React, { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';

interface Server {
  id: string;
  name: string;
  avatar?: string;
}

const MOCK_SERVERS: Server[] = [
  { id: 'home', name: 'Çaylaklar', avatar: '🏠' },
];

export default function ServerSwitcher() {
  const [activeServer, setActiveServer] = useState('home');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  return (
    <div className="flex items-center gap-1.5 ml-3">
      {MOCK_SERVERS.map(server => (
        <button
          key={server.id}
          onClick={() => setActiveServer(server.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
            activeServer === server.id
              ? 'bg-[var(--theme-accent)]/12 text-[var(--theme-accent)] border border-[var(--theme-accent)]/20'
              : 'text-[var(--theme-secondary-text)] hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'
          }`}
        >
          <span>{server.avatar}</span>
          <span>{server.name}</span>
        </button>
      ))}

      {/* Add button */}
      <button
        className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/8 transition-all"
        title="Sunucu ekle"
      >
        <Plus size={12} />
      </button>

      {/* Overflow */}
      <div className="relative" ref={overflowRef}>
        <button
          onClick={() => setOverflowOpen(!overflowOpen)}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[var(--theme-secondary-text)]/40 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)] transition-all"
        >
          <MoreHorizontal size={12} />
        </button>
        {overflowOpen && (
          <div
            className="absolute top-full left-0 mt-1 w-48 rounded-xl p-1.5 z-50"
            style={{
              background: 'var(--popover-bg)',
              border: '1px solid var(--popover-border)',
              boxShadow: 'var(--popover-shadow)',
              color: 'var(--popover-text)',
            }}
          >
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--popover-text-secondary)' }}>
              Sunucular
            </p>
            {MOCK_SERVERS.map(server => (
              <button
                key={server.id}
                onClick={() => { setActiveServer(server.id); setOverflowOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-[rgba(var(--glass-tint),0.06)] transition-colors"
              >
                {server.avatar} {server.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
