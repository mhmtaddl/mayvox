import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, UserPlus, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';

interface SearchResult {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar: string;
}

interface Props {
  currentUserId: string;
  variant?: 'center' | 'sidebar';
}

export default function SocialSearchHub({ currentUserId, variant = 'center' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCenter = variant === 'center';

  const searchUsers = useCallback(async (q: string) => {
    const t = q.trim();
    if (!t || t.length < 2) { setResults([]); return; }
    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, first_name, last_name, avatar')
        .or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,name.ilike.%${t}%`)
        .neq('id', currentUserId)
        .limit(8);
      if (data) setResults(data.map(p => ({ id: p.id, name: p.name || '', firstName: p.first_name || '', lastName: p.last_name || '', avatar: p.avatar || '' })));
    } catch {}
    setIsSearching(false);
  }, [currentUserId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => searchUsers(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchUsers]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const displayName = (r: SearchResult) => `${r.firstName} ${r.lastName}`.trim() || r.name || 'Kullanıcı';
  const initials = (r: SearchResult) => `${(r.firstName || r.name || '?')[0]}${(r.lastName || '')[0] || ''}`.toUpperCase();

  return (
    <div ref={containerRef} className={`relative ${isCenter ? 'w-full max-w-[500px] mx-auto' : 'px-3'}`}>
      {/* Input */}
      <div
        className={`flex items-center gap-2 transition-all duration-150 ${isCenter ? 'px-4 py-2.5 rounded-xl' : 'px-3 py-[6px] rounded-lg'}`}
        style={{
          background: isOpen ? 'rgba(var(--glass-tint), 0.05)' : 'rgba(var(--glass-tint), 0.025)',
          border: isOpen ? '1px solid rgba(var(--theme-accent-rgb), 0.12)' : '1px solid rgba(var(--glass-tint), 0.04)',
          boxShadow: isOpen ? '0 2px 12px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        <Search size={isCenter ? 15 : 12} className="text-[var(--theme-secondary-text)] opacity-35 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results.length > 0) { /* ileride profil aç */ } }}
          placeholder={isCenter ? 'Kullanıcı ara, davet et...' : 'Kullanıcı ara...'}
          className={`flex-1 bg-transparent text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/25 outline-none min-w-0 ${isCenter ? 'text-[13px]' : 'text-[11px]'}`}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }} className="text-[var(--theme-secondary-text)] opacity-25 hover:opacity-50 transition-opacity">
            <X size={isCenter ? 14 : 11} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && query.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar ${isCenter ? '' : 'mx-3'}`}
            style={{
              background: 'rgba(var(--theme-bg-rgb), 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.08)',
              boxShadow: '0 10px 32px rgba(0,0,0,0.3)',
            }}
          >
            {isSearching ? (
              <div className="px-4 py-5 text-center">
                <p className="text-[10px] text-[var(--theme-text)] opacity-25">Aranıyor...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-1.5">
                {results.map(user => (
                  <div key={user.id} className="flex items-center gap-3 px-3 py-2 transition-all duration-100 hover:bg-[rgba(var(--glass-tint),0.04)] cursor-pointer group">
                    {/* Avatar */}
                    <div className="shrink-0 w-9 h-9 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
                      {user.avatar?.startsWith('http') ? (
                        <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-[10px] font-bold text-[var(--theme-accent)] opacity-70">{initials(user)}</span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--theme-text)] truncate leading-tight">{displayName(user)}</p>
                      {user.name && <p className="text-[9px] text-[var(--theme-secondary-text)] opacity-40 truncate">@{user.name}</p>}
                    </div>
                    {/* Aksiyonlar */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] opacity-50 hover:opacity-90 hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all" title="Arkadaş ekle">
                        <UserPlus size={13} />
                      </button>
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] opacity-50 hover:opacity-90 hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all" title="Davet et">
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-center">
                <p className="text-[10px] text-[var(--theme-text)] opacity-25">Kullanıcı bulunamadı</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
