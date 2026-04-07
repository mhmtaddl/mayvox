import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Plus, Volume2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Channel {
  id: string;
  name: string;
  userCount?: number;
}

interface Props {
  channels: Channel[];
  activeChannel: string | null;
  onJoinChannel: (id: string) => void;
  onCreateRoom: () => void;
}

export default function ChannelQuickSearch({ channels, activeChannel, onJoinChannel, onCreateRoom }: Props) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? channels.filter(c => c.name.toLowerCase().includes(query.toLowerCase().trim()))
    : [];

  // Outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsOpen(false); setQuery(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSelect = (channelId: string) => {
    onJoinChannel(channelId);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      handleSelect(filtered[0].id);
    }
  };

  return (
    <div ref={containerRef} className="relative px-4 mb-3">
      <div className="flex items-center gap-1.5">
        {/* Search input */}
        <div
          className="flex-1 flex items-center gap-2 px-3 py-[6px] rounded-lg transition-all duration-150"
          style={{
            background: 'rgba(var(--glass-tint), 0.03)',
            border: isOpen ? '1px solid rgba(var(--theme-accent-rgb), 0.15)' : '1px solid rgba(var(--glass-tint), 0.05)',
          }}
        >
          <Search size={13} className="text-[var(--theme-secondary-text)] opacity-40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Kanal ara..."
            className="flex-1 bg-transparent text-[11px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
          />
          {query && (
            <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-[var(--theme-secondary-text)] opacity-30 hover:opacity-60 transition-opacity">
              <X size={12} />
            </button>
          )}
        </div>

        {/* + Oda oluştur */}
        <button
          onClick={onCreateRoom}
          className="shrink-0 w-[30px] h-[30px] rounded-lg flex items-center justify-center transition-all duration-150 hover:-translate-y-0.5"
          style={{
            background: 'rgba(var(--theme-accent-rgb), 0.08)',
            border: '1px solid rgba(var(--theme-accent-rgb), 0.1)',
          }}
          title="Oda Oluştur"
        >
          <Plus size={14} className="text-[var(--theme-accent)]" />
        </button>
      </div>

      {/* Dropdown sonuçlar */}
      <AnimatePresence>
        {isOpen && query.trim() && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-4 right-4 top-full mt-1 z-50 rounded-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar"
            style={{
              background: 'rgba(var(--theme-bg-rgb), 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            {filtered.length > 0 ? (
              <div className="py-1">
                {filtered.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => handleSelect(ch.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-100 ${
                      activeChannel === ch.id
                        ? 'bg-[rgba(var(--theme-accent-rgb),0.08)] text-[var(--theme-accent)]'
                        : 'text-[var(--theme-text)] opacity-75 hover:opacity-100 hover:bg-[rgba(var(--glass-tint),0.04)]'
                    }`}
                  >
                    <Volume2 size={13} className="shrink-0 opacity-50" />
                    <span className="text-[11px] font-medium truncate flex-1">{ch.name}</span>
                    {(ch.userCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-[9px] font-bold opacity-40 shrink-0">
                        <Users size={9} />
                        {ch.userCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-center">
                <p className="text-[10px] text-[var(--theme-text)] opacity-40">Kanal bulunamadı</p>
                <button
                  onClick={() => { onCreateRoom(); setIsOpen(false); setQuery(''); }}
                  className="mt-2 text-[10px] font-medium text-[var(--theme-accent)] opacity-70 hover:opacity-100 transition-opacity"
                >
                  + Yeni oda oluştur
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
