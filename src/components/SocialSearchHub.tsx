import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, UserPlus, UserMinus, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAllProfiles } from '../lib/backendClient';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useUser } from '../contexts/UserContext';
import { useUI } from '../contexts/UIContext';
import { useConfirm } from '../contexts/ConfirmContext';
import AvatarContent from './AvatarContent';
import { getPublicDisplayName } from '../lib/formatName';

export interface SearchResult {
  id: string;
  name: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  avatar: string;
  allowNonFriendDms?: boolean;
  dmPrivacyMode?: 'everyone' | 'mutual_servers' | 'friends_only' | 'closed';
}

interface Props {
  currentUserId: string;
  variant?: 'center' | 'sidebar';
  onUserClick?: (user: SearchResult, position: { x: number; y: number }) => void;
}

export default function SocialSearchHub({ currentUserId, variant = 'center', onUserClick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getRelationship, sendRequest, acceptRequest, rejectRequest, cancelRequest, removeFriend, currentUser, allUsers } = useUser();
  const { setToastMsg } = useUI();
  const { openConfirm } = useConfirm();

  const isCenter = variant === 'center';
  const presenceById = useMemo(() => new Map(allUsers.map(user => [user.id, user])), [allUsers]);

  const searchUsers = useCallback(async (q: string) => {
    // Normalize: trim, collapse spaces, strip leading @
    const raw = q.trim().replace(/\s+/g, ' ').replace(/^@/, '');
    if (!raw || raw.length < 2) { setResults([]); return; }

    const tokens = raw.toLowerCase().split(' ').filter(Boolean);
    if (tokens.length === 0) { setResults([]); return; }

    setIsSearching(true);
    try {
      const { data } = await getAllProfiles();

      if (!data) { setResults([]); setIsSearching(false); return; }

      // Client-side multi-token filter + ranking
      const scored: (SearchResult & { score: number })[] = [];
      for (const p of data.filter((profile: any) => profile.id !== currentUserId).slice(0, 100)) {
        const fn = (p.first_name || '').toLowerCase();
        const ln = (p.last_name || '').toLowerCase();
        const dn = (p.display_name || '').toLowerCase();
        const un = (p.name || '').toLowerCase();
        const full = `${fn} ${ln}`.trim();
        const combined = `${dn} ${fn} ${ln} ${un}`;

        // All tokens must match somewhere in combined text
        const allMatch = tokens.every(t => combined.includes(t));
        if (!allMatch) continue;

        // Ranking score (higher = better)
        let score = 0;
        const queryLower = raw.toLowerCase();

        // Exact username match
        if (un === queryLower) score += 100;
        if (dn === queryLower) score += 95;
        // Exact full name match
        if (full === queryLower) score += 90;
        // Display name starts with query
        if (dn.startsWith(queryLower)) score += 70;
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
          displayName: p.display_name || undefined,
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          avatar: p.avatar || '',
          dmPrivacyMode: p.dm_privacy_mode || (p.allow_non_friend_dms === false ? 'friends_only' : 'everyone'),
          allowNonFriendDms: p.dm_privacy_mode === 'everyone' || p.dm_privacy_mode === 'mutual_servers' || (!p.dm_privacy_mode && p.allow_non_friend_dms !== false),
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

  useEffect(() => {
    const onFocusSearch = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
      if (!visible) return;
      setIsOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('mayvox:social-search-focus', onFocusSearch);
    return () => window.removeEventListener('mayvox:social-search-focus', onFocusSearch);
  }, []);

  useEscapeKey(() => setIsOpen(false), isOpen);

  const displayName = (r: SearchResult) => getPublicDisplayName(r);

  const getAvatarStatusText = (user: SearchResult) => {
    const presenceUser = presenceById.get(user.id);
    if (!presenceUser) return 'Çevrimdışı';
    if (presenceUser.status !== 'online') return 'Çevrimdışı';
    return presenceUser.statusText && presenceUser.statusText !== 'Aktif'
      ? presenceUser.statusText
      : 'Online';
  };

  const openUserCard = (user: SearchResult, position: { x: number; y: number }) => {
    if (!onUserClick) return;
    onUserClick(user, position);
    setIsOpen(false);
    inputRef.current?.blur();
  };

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
    const iconActionClass = 'group/action w-8 h-8 rounded-lg flex items-center justify-center bg-transparent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--theme-accent-rgb),0.34)]';

    switch (rel) {
      case 'friend':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'remove'); }}
            className={`${iconActionClass} text-red-300/45 hover:text-rose-300`}
            title="Arkadaşı sil"
            aria-label="Arkadaşı sil"
          >
            <UserMinus size={14} className="transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(251,113,133,0.34)]" />
          </button>
        );

      case 'outgoing':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'cancel'); }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer hover:border-[rgba(var(--theme-accent-rgb),0.30)]"
            style={{
              color: 'var(--theme-accent)',
              opacity: 0.7,
              background: 'rgba(var(--theme-accent-rgb), 0.08)',
              border: '1px solid rgba(var(--theme-accent-rgb), 0.15)',
            }}
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
              className={`${iconActionClass} text-emerald-300/55 hover:text-emerald-300`}
              title="Kabul et"
              aria-label="Arkadaşlık isteğini kabul et"
            >
              <Check size={14} strokeWidth={2.5} className="transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(110,231,183,0.30)]" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleReject(user.id); }}
              className={`${iconActionClass} text-red-300/40 hover:text-rose-300`}
              title="Reddet"
              aria-label="Arkadaşlık isteğini reddet"
            >
              <X size={13} className="transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(251,113,133,0.30)]" />
            </button>
          </div>
        );

      default:
        return (
          <button
            onClick={(e) => { e.stopPropagation(); triggerConfirm(user.id, name, 'send'); }}
            className={`${iconActionClass} text-[var(--theme-accent)] opacity-50 hover:opacity-95`}
            title="Arkadaş olarak ekle"
            aria-label="Arkadaş olarak ekle"
          >
            <UserPlus size={14} className="transition-[filter] duration-150 group-hover/action:drop-shadow-[0_0_7px_rgba(var(--theme-accent-rgb),0.34)]" />
          </button>
        );
    }
  };

  const getStatusBadges = (user: SearchResult) => {
    const rel = getRelationship(user.id);
    return (
      <>
        {rel === 'incoming' && (
          <span className="rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide" style={{ color: 'var(--theme-accent)', background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
            İstek geldi
          </span>
        )}
        {rel === 'outgoing' && (
          <span className="rounded-full px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide" style={{ color: 'var(--theme-accent)', background: 'rgba(var(--theme-accent-rgb),0.07)', opacity: 0.78 }}>
            İstek gönderildi
          </span>
        )}
      </>
    );
  };

  return (
    <>
    <div ref={containerRef} className={`relative ${isCenter ? 'w-full max-w-[500px] mx-auto' : 'px-3'}`}>
      {/* Input */}
      <div
        className={`search-input search-input-shell flex items-center gap-2 transition-all duration-150 ${isOpen ? 'is-focused' : ''} ${isCenter ? 'px-4 py-2.5 rounded-xl' : 'px-3 py-[6px] rounded-lg'}`}
      >
        <Search
          size={isCenter ? 15 : 12}
          className="search-icon shrink-0 transition-colors duration-150"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || results.length === 0 || !onUserClick) return;
            const rect = inputRef.current?.getBoundingClientRect();
            openUserCard(results[0], {
              x: rect ? rect.left + rect.width - 16 : window.innerWidth - 280,
              y: rect ? rect.bottom + 8 : 72,
            });
          }}
          placeholder="Kullanıcı ara..."
          className={`search-input-field flex-1 bg-transparent outline-none min-w-0 ${isCenter ? 'text-[13px]' : 'text-[11px]'}`}
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
            className={`search-dropdown absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar ${isCenter ? '' : 'mx-3'}`}
          >
            {isSearching ? (
              <div className="px-4 py-5 text-center">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Aranıyor...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-1.5">
                {results.map(user => {
                  const rel = getRelationship(user.id);
                  const hasStatusBadge = rel === 'incoming' || rel === 'outgoing';
                  return (
                    <div
                      key={user.id}
                      role={onUserClick ? 'button' : undefined}
                      tabIndex={onUserClick ? 0 : undefined}
                      className={`flex items-center gap-3 px-3 py-2 transition-all duration-100 rounded-lg mx-1 group ${onUserClick ? 'cursor-pointer' : ''}`}
                      style={{ background: 'transparent' }}
                      onClick={(e) => openUserCard(user, { x: e.clientX, y: e.clientY })}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && onUserClick) {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          openUserCard(user, { x: rect.right - 20, y: rect.top + 8 });
                        }
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover, rgba(var(--glass-tint),0.05))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Avatar */}
                      <div className="shrink-0 w-9 h-9 overflow-hidden avatar-squircle flex items-center justify-center" style={{ background: 'rgba(var(--theme-accent-rgb), 0.06)' }}>
                        <AvatarContent avatar={user.avatar} statusText={getAvatarStatusText(user)} firstName={user.displayName || user.firstName} name={displayName(user)} letterClassName="text-[10px] font-bold text-[var(--theme-accent)] opacity-70" />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[12px] font-medium leading-snug whitespace-normal"
                          style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}
                          title={displayName(user)}
                        >
                          {displayName(user)}
                        </p>
                        {hasStatusBadge && (
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                            {getStatusBadges(user)}
                          </div>
                        )}
                      </div>
                      {/* Action */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {renderAction(user)}
                      </div>
                    </div>
                  );
                })}
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
