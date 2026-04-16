import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, UserPlus, Send, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useEscapeKey } from '../hooks/useEscapeKey';
import AvatarContent from './AvatarContent';

interface SearchResult {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar: string;
  status?: string;
}

interface Props {
  currentUserId: string;
}

export default function UserSearch({ currentUserId }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Supabase'den kullanıcı ara
  const searchUsers = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) { setResults([]); return; }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, first_name, last_name, avatar, status')
        .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,name.ilike.%${trimmed}%`)
        .neq('id', currentUserId)
        .limit(10);

      if (!error && data) {
        setResults(data.map(p => ({
          id: p.id,
          name: p.name || '',
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          avatar: p.avatar || '',
          status: p.status || undefined,
        })));
      }
    } catch {
      // sessiz hata
    }
    setIsSearching(false);
  }, [currentUserId]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => searchUsers(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchUsers]);

  // Outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEscapeKey(() => setIsOpen(false), isOpen);

  const displayName = (r: SearchResult) => {
    const full = `${r.firstName} ${r.lastName}`.trim();
    return full || r.name || 'Kullanıcı';
  };

  const initials = (r: SearchResult) => {
    const fn = r.firstName || r.name || '?';
    const ln = r.lastName || '';
    return `${fn[0] || ''}${ln[0] || ''}`.toUpperCase();
  };

  return (
    <div ref={containerRef} className="relative px-4 mb-3">
      {/* Search input */}
      <div
        className="flex items-center gap-2 px-3 py-[7px] rounded-lg transition-all duration-150"
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
          placeholder="Kullanıcı ara..."
          className="flex-1 bg-transparent text-[11px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/30 outline-none min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} className="text-[var(--theme-secondary-text)] opacity-30 hover:opacity-60 transition-opacity">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown sonuçlar */}
      <AnimatePresence>
        {isOpen && query.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-4 right-4 top-full mt-1.5 z-50 rounded-xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar"
            style={{
              background: 'rgba(var(--theme-bg-rgb), 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
            }}
          >
            {isSearching ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-[var(--theme-text)] opacity-30">Aranıyor...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-1">
                {results.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2.5 px-3 py-2 transition-all duration-100 hover:bg-[rgba(var(--glass-tint),0.04)] cursor-pointer"
                  >
                    {/* Avatar */}
                    <div className="shrink-0 w-8 h-8 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.08)' }}>
                      <AvatarContent avatar={user.avatar} statusText={(user as any).statusText} firstName={user.firstName} name={user.name} letterClassName="text-[9px] font-bold text-[var(--theme-accent)]" />
                    </div>

                    {/* İsim + kullanıcı adı */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--theme-text)] truncate leading-tight">{displayName(user)}</p>
                      {user.name && <p className="text-[9px] text-[var(--theme-secondary-text)] opacity-50 truncate">@{user.name}</p>}
                    </div>

                    {/* Aksiyonlar — ileride aktif olacak */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] opacity-40 hover:opacity-80 hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all"
                        title="Arkadaş ekle"
                      >
                        <UserPlus size={12} />
                      </button>
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] opacity-40 hover:opacity-80 hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all"
                        title="Davet et"
                      >
                        <Send size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-[var(--theme-text)] opacity-30">Kullanıcı bulunamadı</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
