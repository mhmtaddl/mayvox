import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, UserPlus, UserMinus, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useConfirm } from '../contexts/ConfirmContext';
import AvatarContent from './AvatarContent';

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

  const { getRelationship, sendRequest, acceptRequest, rejectRequest, cancelRequest, removeFriend } = useUser();
  const { setToastMsg } = useUI();
  const { openConfirm } = useConfirm();

  const isCenter = variant === 'center';

  const searchUsers = useCallback(async (q: string) => {
    // Normalize: trim, collapse spaces, strip leading @
    const raw = q.trim().replace(/\s+/g, ' ').replace(/^@/, '');
    if (!raw || raw.length < 2) { setResults([]); return; }

    const tokens = raw.toLowerCase().split(' ').filter(Boolean);
    if (tokens.length === 0) { setResults([]); return; }

    setIsSearching(true);
    try {
      // Fetch broad candidates using first token (catches most relevant results)
      const first = tokens[0];
      const orClauses = tokens.length > 1
        ? tokens.slice(0, 3).flatMap(t => [
            `first_name.ilike.%${t}%`,
            `last_name.ilike.%${t}%`,
            `name.ilike.%${t}%`,
          ]).join(',')
        : `first_name.ilike.%${first}%,last_name.ilike.%${first}%,name.ilike.%${first}%`;

      const { data } = await supabase
        .from('profiles')
        .select('id, name, first_name, last_name, avatar')
        .or(orClauses)
        .neq('id', currentUserId)
        .limit(30); // fetch more, filter+rank client-side

      if (!data) { setResults([]); setIsSearching(false); return; }

      // Client-side multi-token filter + ranking
      const scored: (SearchResult & { score: number })[] = [];
      for (const p of data) {
        const fn = (p.first_name || '').toLowerCase();
        const ln = (p.last_name || '').toLowerCase();
        const un = (p.name || '').toLowerCase();
        const full = `${fn} ${ln}`.trim();
        const combined = `${fn} ${ln} ${un}`;

        // All tokens must match somewhere in combined text
        const allMatch = tokens.every(t => combined.includes(t));
        if (!allMatch) continue;

        // Ranking score (higher = better)
        let score = 0;
        const queryLower = raw.toLowerCase();

        // Exact username match
        if (un === queryLower) score += 100;
        // Exact full name match
        if (full === queryLower) score += 90;
        // Username starts with query
        if (un.startsWith(queryLower)) score += 60;
        // Full name starts with query
        if (full.startsWith(queryLower)) score += 50;
        // First name starts with first token
        if (fn.startsWith(tokens[0])) score += 30;
        // Last name starts with a token
        if (tokens.some(t => ln.startsWith(t))) score += 20;
        // Username contains query
        if (un.includes(queryLower)) score += 10;

        scored.push({
          id: p.id,
          name: p.name || '',
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          avatar: p.avatar || '',
          score,
        });
      }

      // Sort by score descending, then alphabetically
      scored.sort((a, b) => b.score - a.score || a.firstName.localeCompare(b.firstName));
      setResults(scored.slice(0, 8));
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

  useEscapeKey(() => setIsOpen(false), isOpen);

  const displayName = (r: SearchResult) => `${r.firstName} ${r.lastName}`.trim() || r.name || 'Kullanıcı';
  const initials = (r: SearchResult) => `${(r.firstName || r.name || '?')[0]}${(r.lastName || '')[0] || ''}`.toUpperCase();

  const triggerConfirm = (userId: string, userName: string, action: 'send' | 'remove' | 'cancel') => {
    openConfirm({
      title: action === 'send' ? 'Arkadaş isteği gönder' : action === 'cancel' ? 'İsteği iptal et' : 'Arkadaşı sil',
      description: action === 'send' ? `${userName} kişisine arkadaşlık isteği gönderilsin mi?`
        : action === 'cancel' ? `${userName} kişisine gönderilen istek iptal edilsin mi?`
        : `${userName} kişisini arkadaşlarından silmek istiyor musun?`,
      confirmText: action === 'send' ? 'Ekle' : action === 'cancel' ? 'İptal et' : 'Sil',
      cancelText: 'İptal',
      danger: action === 'remove',
      onConfirm: async () => {
        if (action === 'send') {
          const ok = await sendRequest(userId);
          setToastMsg(ok ? 'Arkadaşlık isteği gönderildi' : 'İstek gönderilemedi');
        } else if (action === 'remove') {
          const ok = await removeFriend(userId);
          setToastMsg(ok ? `${userName} arkadaşlarından kaldırıldı` : 'İşlem başarısız');
        } else {
          const ok = await cancelRequest(userId);
          setToastMsg(ok ? 'İstek iptal edildi' : 'İşlem başarısız');
        }
      },
    });
  };

  const handleAccept = async (userId: string, userName: string) => {
    const ok = await acceptRequest(userId);
    setToastMsg(ok ? `${userName} artık arkadaşın` : 'İşlem başarısız');
  };

  const handleReject = async (userId: string) => {
    const ok = await rejectRequest(userId);
    setToastMsg(ok ? 'İstek reddedildi' : 'İşlem başarısız');
  };

  const renderAction = (user: SearchResult) => {
    const rel = getRelationship(user.id);
    const name = displayName(user);

    switch (rel) {
      case 'friend':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'remove'); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Arkadaşı sil"
          >
            <UserMinus size={13} />
          </button>
        );

      case 'outgoing':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'cancel'); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-blue-400/60 bg-blue-500/8 border border-blue-400/15 hover:border-blue-400/30 transition-all cursor-pointer"
            title="İsteği iptal et"
          >
            <Clock size={10} />
            Bekliyor
          </button>
        );

      case 'incoming':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleAccept(user.id, name); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
              title="Kabul et"
            >
              <Check size={14} strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleReject(user.id); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Reddet"
            >
              <X size={13} />
            </button>
          </div>
        );

      default:
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'send'); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--theme-accent)] opacity-50 hover:opacity-90 hover:bg-[rgba(var(--theme-accent-rgb),0.08)] transition-all"
            title="Arkadaş isteği gönder"
          >
            <UserPlus size={13} />
          </button>
        );
    }
  };

  const getStatusBadge = (userId: string) => {
    const rel = getRelationship(userId);
    if (rel === 'friend') return <span className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-wide">Arkadaş</span>;
    if (rel === 'incoming') return <span className="text-[8px] font-bold text-blue-400/60 uppercase tracking-wide">İstek geldi</span>;
    if (rel === 'outgoing') return <span className="text-[8px] font-bold text-blue-400/40 uppercase tracking-wide">İstek gönderildi</span>;
    return null;
  };

  return (
    <>
    <div ref={containerRef} className={`relative ${isCenter ? 'w-full max-w-[500px] mx-auto' : 'px-3'}`}>
      {/* Input */}
      <div
        className={`flex items-center gap-2 transition-all duration-150 ${isCenter ? 'px-4 py-2.5 rounded-xl' : 'px-3 py-[6px] rounded-lg'}`}
        style={{
          // Near-opaque tema-uyumlu surface — %96 alpha ile bg neredeyse sızmaz
          background: 'linear-gradient(180deg, rgba(var(--theme-bg-rgb), 0.96), rgba(var(--theme-bg-rgb), 0.98))',
          border: isOpen
            ? '1px solid rgba(var(--theme-accent-rgb), 0.35)'
            : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isOpen
            ? '0 0 0 2px rgba(var(--theme-accent-rgb),0.15), inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.32)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.32)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        } as React.CSSProperties}
      >
        <Search
          size={isCenter ? 15 : 12}
          className="shrink-0 transition-colors duration-150"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results.length > 0) { /* ileride profil aç */ } }}
          placeholder="Kullanıcı ara..."
          className={`flex-1 bg-transparent outline-none min-w-0 placeholder:text-[var(--text-muted)] ${isCenter ? 'text-[13px]' : 'text-[11px]'}`}
          style={{
            color: 'var(--text-primary)',
          } as React.CSSProperties}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
            className="transition-colors duration-150"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
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
              background: 'linear-gradient(180deg, rgba(var(--theme-bg-rgb), 0.97), rgba(var(--theme-bg-rgb), 0.99))',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {isSearching ? (
              <div className="px-4 py-5 text-center">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Aranıyor...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-1.5">
                {results.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-3 py-2 transition-all duration-100 cursor-pointer rounded-lg mx-1 group"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover, rgba(var(--glass-tint),0.05))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div className="shrink-0 w-9 h-9 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
                      <AvatarContent avatar={user.avatar} statusText={(user as any).statusText} firstName={user.firstName} name={user.name} letterClassName="text-[10px] font-bold text-[var(--theme-accent)] opacity-70" />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{displayName(user)}</p>
                      <div className="flex items-center gap-1.5">
                        {user.name && <p className="text-[9px] truncate" style={{ color: 'var(--text-tertiary)' }}>@{user.name}</p>}
                        {getStatusBadge(user.id)}
                      </div>
                    </div>
                    {/* Action */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {renderAction(user)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-center">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Kullanıcı bulunamadı</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    </>
  );
}
