import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Search, Settings, X } from 'lucide-react';
import type { MobileShellView } from './MobileAppShell';
import { resolveAvatarUrls } from '../../lib/statusAvatar';
import { getAllProfiles } from '../../lib/backendClient';
import { getPublicDisplayName } from '../../lib/formatName';
import type { SearchResult } from '../../components/SocialSearchHub';
import AvatarContent from '../../components/AvatarContent';

interface MobileTopBarProps {
  phoneLayout?: boolean;
  activeServerName?: string;
  activeServerAvatarUrl?: string | null;
  activeServerShortName?: string;
  activeServerMotto?: string;
  activeChannelName?: string;
  currentView?: MobileShellView;
  onOpenChannels?: () => void;
  onOpenSettings?: () => void;
  currentUserId?: string;
  onSearchUserClick?: (user: SearchResult, position: { x: number; y: number }) => void;
}

const MOBILE_SEARCH_EVENT = 'mayvox:mobile-search-change';
const PROFILE_SEARCH_CACHE_TTL_MS = 60_000;
let mobileProfileSearchCache: { at: number; entries: ProfileSearchEntry[] } | null = null;
let mobileProfileSearchPromise: Promise<ProfileSearchEntry[]> | null = null;

type ProfileSearchEntry = SearchResult & {
  firstNameLower: string;
  lastNameLower: string;
  displayNameLower: string;
  usernameLower: string;
  fullNameLower: string;
  searchableText: string;
};

function normalizeProfileSearchEntry(profile: any): ProfileSearchEntry {
  const firstNameLower = (profile.first_name || '').toLocaleLowerCase('tr-TR');
  const lastNameLower = (profile.last_name || '').toLocaleLowerCase('tr-TR');
  const displayNameLower = (profile.display_name || '').toLocaleLowerCase('tr-TR');
  const usernameLower = (profile.name || '').toLocaleLowerCase('tr-TR');
  const fullNameLower = `${firstNameLower} ${lastNameLower}`.trim();
  return {
    id: profile.id,
    name: profile.name || '',
    displayName: profile.display_name || undefined,
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    avatar: profile.avatar || '',
    dmPrivacyMode: profile.dm_privacy_mode || (profile.allow_non_friend_dms === false ? 'friends_only' : 'everyone'),
    allowNonFriendDms: profile.dm_privacy_mode === 'everyone' || profile.dm_privacy_mode === 'mutual_servers' || (!profile.dm_privacy_mode && profile.allow_non_friend_dms !== false),
    firstNameLower,
    lastNameLower,
    displayNameLower,
    usernameLower,
    fullNameLower,
    searchableText: `${displayNameLower} ${firstNameLower} ${lastNameLower} ${usernameLower}`,
  };
}

async function getProfileSearchEntries(): Promise<ProfileSearchEntry[]> {
  const now = Date.now();
  if (mobileProfileSearchCache && now - mobileProfileSearchCache.at < PROFILE_SEARCH_CACHE_TTL_MS) {
    return mobileProfileSearchCache.entries;
  }
  if (!mobileProfileSearchPromise) {
    mobileProfileSearchPromise = getAllProfiles()
      .then(({ data }) => {
        const entries = (data ?? []).map(normalizeProfileSearchEntry);
        mobileProfileSearchCache = { at: Date.now(), entries };
        return entries;
      })
      .finally(() => {
        mobileProfileSearchPromise = null;
      });
  }
  return mobileProfileSearchPromise;
}

const SEARCH_PLACEHOLDER: Record<MobileShellView, string> = {
  home: 'Arkadas ara',
  room: 'Sohbette ara',
  discover: 'Topluluk ara',
  social: 'DM veya arkadas ara',
  notifications: 'Bildirimlerde ara',
  settings: 'Ayarlarda ara',
  profile: 'Profilde ara',
};

export default function MobileTopBar({
  phoneLayout = false,
  activeServerName,
  activeServerAvatarUrl,
  activeServerShortName,
  activeServerMotto,
  activeChannelName,
  currentView = 'home',
  onOpenChannels,
  onOpenSettings,
  currentUserId,
  onSearchUserClick,
}: MobileTopBarProps) {
  const [serverAvatarFailed, setServerAvatarFailed] = useState(false);
  const [serverAvatarIndex, setServerAvatarIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [, startSearchTransition] = useTransition();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOpenedSearchUserRef = useRef<{ id: string; at: number } | null>(null);
  const searchRequestIdRef = useRef(0);
  const serverAvatarUrls = useMemo(() => resolveAvatarUrls(activeServerAvatarUrl), [activeServerAvatarUrl]);
  const activeServerAvatarSrc = serverAvatarUrls[serverAvatarIndex] || '';
  const showServerAvatar = !!activeServerAvatarSrc && !serverAvatarFailed;
  const serverInitial = (activeServerShortName || activeServerName || 'M').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'M';
  const placeholder = SEARCH_PLACEHOLDER[currentView];

  useEffect(() => {
    setServerAvatarFailed(false);
    setServerAvatarIndex(0);
  }, [activeServerAvatarUrl]);

  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
    window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT, { detail: { view: currentView, query: '' } }));
  }, [currentView]);

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    setSearchOpen(query.trim().length >= 2);
    window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT, { detail: { view: currentView, query } }));
  };

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
    setIsSearching(false);
    window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT, { detail: { view: currentView, query: '' } }));
  }, [currentView]);

  const searchUsers = useCallback(async (value: string) => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    const raw = value.trim().replace(/\s+/g, ' ').replace(/^@/, '');
    if (!currentUserId || raw.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const tokens = raw.toLocaleLowerCase('tr-TR').split(' ').filter(Boolean);
    if (tokens.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const entries = await getProfileSearchEntries();
      if (requestId !== searchRequestIdRef.current) return;
      const queryLower = raw.toLocaleLowerCase('tr-TR');
      const scored: (ProfileSearchEntry & { score: number })[] = [];

      for (const profile of entries) {
        if (profile.id === currentUserId) continue;
        if (!tokens.every(token => profile.searchableText.includes(token))) continue;

        let score = 0;
        if (profile.usernameLower === queryLower) score += 100;
        if (profile.displayNameLower === queryLower) score += 95;
        if (profile.fullNameLower === queryLower) score += 90;
        if (profile.displayNameLower.startsWith(queryLower)) score += 70;
        if (profile.usernameLower.startsWith(queryLower)) score += 60;
        if (profile.fullNameLower.startsWith(queryLower)) score += 50;
        if (profile.firstNameLower.startsWith(tokens[0])) score += 30;
        if (tokens.some(token => profile.lastNameLower.startsWith(token))) score += 20;
        if (profile.usernameLower.includes(queryLower)) score += 10;

        scored.push({ ...profile, score });
      }

      scored.sort((a, b) => b.score - a.score || getPublicDisplayName(a).localeCompare(getPublicDisplayName(b), 'tr'));
      if (requestId === searchRequestIdRef.current) {
        startSearchTransition(() => setSearchResults(scored.slice(0, 7)));
      }
    } catch {
      if (requestId === searchRequestIdRef.current) {
        startSearchTransition(() => setSearchResults([]));
      }
    } finally {
      if (requestId === searchRequestIdRef.current) setIsSearching(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (deferredSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => searchUsers(deferredSearchQuery), 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [deferredSearchQuery, searchUsers]);

  useEffect(() => {
    if (!searchQuery && !searchOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (searchWrapRef.current?.contains(event.target as Node)) return;
      clearSearch();
    };
    const handleBack = (event: Event) => {
      if (!searchQuery && !searchOpen) return;
      event.stopImmediatePropagation();
      clearSearch();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('mayvox:android-back', handleBack);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('mayvox:android-back', handleBack);
    };
  }, [clearSearch, searchOpen, searchQuery]);

  const openSearchUser = (user: SearchResult) => {
    const now = Date.now();
    const lastOpened = lastOpenedSearchUserRef.current;
    if (lastOpened?.id === user.id && now - lastOpened.at < 350) return;
    lastOpenedSearchUserRef.current = { id: user.id, at: now };
    const rect = searchWrapRef.current?.getBoundingClientRect();
    onSearchUserClick?.(user, {
      x: rect ? rect.left + rect.width - 18 : window.innerWidth - 300,
      y: rect ? rect.bottom + 8 : 74,
    });
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
    window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT, { detail: { view: currentView, query: '' } }));
  };

  return (
    <header className={`shrink-0 ${phoneLayout ? 'px-2 pt-[calc(env(safe-area-inset-top)+5px)] pb-1' : 'px-3 pt-[calc(env(safe-area-inset-top)+6px)] pb-1'}`}>
      <div className={`mx-auto grid min-h-11 w-full max-w-[1180px] items-center ${phoneLayout ? 'grid-cols-[minmax(0,1fr)_minmax(128px,0.78fr)] gap-2' : 'grid-cols-[clamp(168px,15vw,190px)_minmax(0,1fr)_clamp(168px,15vw,190px)] gap-3 sm:px-2'}`}>
        <button
          type="button"
          onClick={onOpenChannels}
          className={`flex h-11 min-w-0 items-center gap-1.5 rounded-[13px] px-0 text-left transition-colors active:scale-[0.99] ${phoneLayout ? 'pr-1' : ''}`}
          aria-label="Kanal panelini aç"
        >
          <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] font-black text-[var(--theme-accent)] ${phoneLayout ? 'h-9 w-9 text-[12px]' : 'h-8 w-8 text-[11px]'}`} style={{ background: 'rgba(var(--theme-accent-rgb),0.09)' }}>
            {showServerAvatar ? (
              <img
                src={activeServerAvatarSrc}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => {
                  if (serverAvatarIndex + 1 < serverAvatarUrls.length) {
                    setServerAvatarIndex(index => index + 1);
                    return;
                  }
                  setServerAvatarFailed(true);
                }}
              />
            ) : (
              serverInitial
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-black text-[var(--theme-text)]/90 ${phoneLayout ? 'text-[12.5px]' : 'text-[12px]'}`}>{activeServerName || 'MAYVox'}</span>
            <span className="block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--theme-secondary-text)]/42">{activeChannelName || activeServerMotto || 'voice & chat'}</span>
          </span>
        </button>
        {!phoneLayout && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-8 w-7 shrink-0 items-center justify-center text-[var(--theme-secondary-text)]/58 transition-colors hover:text-[var(--theme-accent)] active:scale-[0.98]"
            aria-label="Sunucu ayarlari"
          >
            <Settings size={14} />
          </button>
        )}

        {!phoneLayout && <div aria-hidden="true" />}

        <div
          ref={searchWrapRef}
          className={`relative flex w-full min-w-0 items-center gap-1.5 rounded-[10px] text-left active:scale-[0.995] ${phoneLayout ? 'h-9 px-2' : 'h-8 px-2.5'}`}
          style={{
            background: 'rgba(var(--theme-bg-rgb),0.44)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--glass-tint),0.045)',
          }}
        >
          <Search size={14} className="shrink-0 text-[var(--theme-secondary-text)]/62" />
          <input
            value={searchQuery}
            onChange={event => updateSearchQuery(event.target.value)}
            onFocus={() => setSearchOpen(searchQuery.trim().length >= 2)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || searchResults.length === 0) return;
              openSearchUser(searchResults[0]);
            }}
            className="h-full min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent p-0 text-[11px] font-semibold text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-secondary-text)]/62"
            placeholder={placeholder}
            type="text"
            aria-label={placeholder}
            autoComplete="off"
            spellCheck={false}
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
              backgroundColor: 'transparent',
              boxShadow: 'none',
              WebkitBoxShadow: 'none',
              colorScheme: 'dark',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-transparent text-[var(--theme-secondary-text)]/45"
              aria-label="Aramayi temizle"
            >
              <X size={12} />
            </button>
          )}
        {searchOpen && (
          <div
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-[10px] border border-[rgba(var(--glass-tint),0.045)] py-1 shadow-[0_14px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            style={{ background: 'rgba(var(--theme-bg-rgb),0.44)' }}
          >
            {isSearching ? (
              <div className="px-3 py-2 text-[10px] font-semibold text-[var(--theme-secondary-text)]/48">Aranıyor...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map(user => {
                const displayName = getPublicDisplayName(user);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onPointerDown={event => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerUp={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      openSearchUser(user);
                    }}
                    onClick={() => openSearchUser(user)}
                    className="flex w-full min-w-0 items-center gap-2 bg-transparent px-2.5 py-1.5 text-left transition-colors hover:bg-[rgba(var(--glass-tint),0.035)]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[rgba(var(--theme-accent-rgb),0.08)] text-[10px] font-black text-[var(--theme-accent)]">
                      <AvatarContent
                        avatar={user.avatar}
                        statusText="Çevrimdışı"
                        firstName={user.displayName || user.firstName}
                        name={displayName}
                        imgClassName="h-full w-full object-cover"
                        letterClassName="text-[10px] font-black text-[var(--theme-accent)]"
                        alt=""
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold text-[var(--theme-text)]/88">{displayName}</span>
                      <span className="block truncate text-[9px] font-medium text-[var(--theme-secondary-text)]/48">@{user.name || user.id}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-[10px] font-semibold text-[var(--theme-secondary-text)]/48">Kullanıcı bulunamadı</div>
            )}
          </div>
        )}
        </div>

      </div>
    </header>
  );
}
