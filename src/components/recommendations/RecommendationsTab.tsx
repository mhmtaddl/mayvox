import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, BookmarkPlus, Brain, Clapperboard, Compass, Gamepad2, MessageCircle, Search, Sparkles, Tv, UserRound, X } from 'lucide-react';
import type { User } from '../../types';
import {
  createServerRecommendation,
  deleteServerRecommendation,
  getRecommendationCreatorProfile,
  getRecommendationWatchlist,
  getServerRecommendations,
  hideServerRecommendation,
  restoreServerRecommendation,
  updateServerRecommendation,
} from '../../lib/serverService';
import { subscribeRealtimeEvents } from '../../lib/chatService';
import type { RecommendationCategory, RecommendationCreatorProfile, RecommendationItem, RecommendationPayload } from './recommendationTypes';
import { CATEGORY_LABELS, RECOMMENDATION_CATEGORIES } from './recommendationTypes';
import RecommendationCard from './RecommendationCard';
import RecommendationConfirmDialog from './RecommendationConfirmDialog';
import RecommendationCreateModal from './RecommendationCreateModal';

interface Props {
  serverId?: string;
  currentUser: User;
  openCreateSignal?: number;
  onCreateSignalHandled?: () => void;
  canModerateContent?: boolean;
}

const RECOMMENDATIONS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_RECOMMENDATIONS_ENABLED === 'true';

type ConfirmState = { variant: 'hide' | 'delete'; item: RecommendationItem } | null;

function recommendationErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/endpoint bulunamadı|not found|404/i.test(message)) {
    return 'Keşif altyapısı bu backend sürümünde aktif değil. Backend güncellenince öneri ekleme çalışacak.';
  }
  return message || 'Öneri işlemi tamamlanamadı';
}

function scoreText(score: number): string {
  return score ? score.toFixed(1) : '-';
}

function categoryIcon(category: RecommendationCategory) {
  if (category === 'film') return Clapperboard;
  if (category === 'series') return Tv;
  return Gamepad2;
}

export default function RecommendationsTab({ serverId, currentUser, openCreateSignal = 0, onCreateSignalHandled, canModerateContent = false }: Props) {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<RecommendationItem[]>([]);
  const [listMode, setListMode] = useState<'discover' | 'watchlist'>('discover');
  const [category, setCategory] = useState<RecommendationCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecommendationItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<RecommendationCreatorProfile | null>(null);
  const [profilePosition, setProfilePosition] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const canModerate = canModerateContent;

  useEffect(() => {
    if (!serverId || !RECOMMENDATIONS_ENABLED || openCreateSignal <= 0) return;
    setEditingItem(null);
    setModalOpen(true);
    onCreateSignalHandled?.();
  }, [onCreateSignalHandled, openCreateSignal, serverId]);

  const fetchItems = useCallback(async () => {
    if (!serverId || !RECOMMENDATIONS_ENABLED) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getServerRecommendations(serverId, {
        category,
        q: query,
        limit: 60,
        includeHidden: canModerate,
      });
      setItems(next);
      const nextWatchlist = await getRecommendationWatchlist(serverId);
      setWatchlistItems(nextWatchlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öneriler alınamadı');
    } finally {
      setLoading(false);
    }
  }, [canModerate, category, query, serverId]);

  useEffect(() => {
    const t = window.setTimeout(() => { void fetchItems(); }, query ? 220 : 0);
    return () => window.clearTimeout(t);
  }, [fetchItems, query]);

  const itemMatchesCurrentFilters = useCallback((item: RecommendationItem) => {
    if (category !== 'all' && item.category !== category) return false;
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    const haystack = [
      item.title,
      item.description || '',
      ...item.tags,
    ].join(' ').toLocaleLowerCase('tr-TR');
    return haystack.includes(q);
  }, [category, query]);

  useEffect(() => {
    if (!serverId || !RECOMMENDATIONS_ENABLED) return undefined;
    return subscribeRealtimeEvents(event => {
      if (!event.type.startsWith('recommendation:')) return;
      const payload = event.payload as { serverId?: string; item?: RecommendationItem; itemId?: string };
      if (payload.serverId !== serverId) return;

      if (
        event.type === 'recommendation:item_created' ||
        event.type === 'recommendation:item_updated' ||
        event.type === 'recommendation:rating_updated' ||
        event.type === 'recommendation:comment_updated' ||
        event.type === 'recommendation:comment_deleted'
      ) {
        const item = payload.item;
        if (!item || (item.status !== 'active' && !canModerate)) return;
        setItems(prev => {
          const rest = prev.filter(existing => existing.id !== item.id);
          return itemMatchesCurrentFilters(item) ? [item, ...rest] : rest;
        });
        return;
      }

      if (event.type === 'recommendation:item_hidden') {
        const item = payload.item;
        if (canModerate && item && itemMatchesCurrentFilters(item)) {
          setItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
          return;
        }
        const itemId = payload.itemId || payload.item?.id;
        if (!itemId) return;
        setItems(prev => prev.filter(existing => existing.id !== itemId));
        return;
      }

      if (event.type === 'recommendation:item_deleted') {
        const itemId = payload.itemId || payload.item?.id;
        if (!itemId) return;
        setItems(prev => prev.filter(item => item.id !== itemId));
      }
    });
  }, [canModerate, itemMatchesCurrentFilters, serverId]);

  const counts = useMemo(() => {
    const map = new Map<RecommendationCategory, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);
  const totalCount = items.length;
  const visibleItems = listMode === 'watchlist' ? watchlistItems : items;

  const handleCreate = async (payload: RecommendationPayload) => {
    if (!serverId) return;
    setSaving(true);
    setError(null);
    try {
      const item = await createServerRecommendation(serverId, payload);
      setItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
      setModalOpen(false);
    } catch (err) {
      setError(recommendationErrorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (payload: RecommendationPayload) => {
    if (!serverId || !editingItem) return;
    setSaving(true);
    setError(null);
    try {
      const item = await updateServerRecommendation(serverId, editingItem.id, payload);
      setItems(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
      setEditingItem(null);
    } catch (err) {
      setError(recommendationErrorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RecommendationItem) => {
    setConfirmState({ variant: 'delete', item });
  };

  const handleHide = async (item: RecommendationItem) => {
    setConfirmState({ variant: 'hide', item });
  };

  const handleRestore = async (item: RecommendationItem) => {
    if (!serverId) return;
    setError(null);
    try {
      const restored = await restoreServerRecommendation(serverId, item.id);
      setItems(prev => [restored, ...prev.filter(x => x.id !== restored.id)]);
    } catch (err) {
      setError(recommendationErrorMessage(err));
    }
  };

  const handleConfirmAction = async () => {
    if (!serverId || !confirmState) return;
    const { variant, item } = confirmState;
    setConfirmBusy(true);
    setError(null);
    try {
      if (variant === 'delete') {
        await deleteServerRecommendation(serverId, item.id);
        setItems(prev => prev.filter(x => x.id !== item.id));
      } else {
        const hiddenItem = await hideServerRecommendation(serverId, item.id);
        setItems(prev => canModerate
          ? [hiddenItem, ...prev.filter(x => x.id !== hiddenItem.id)]
          : prev.filter(x => x.id !== item.id));
      }
      setConfirmState(null);
    } catch (err) {
      setError(recommendationErrorMessage(err));
    } finally {
      setConfirmBusy(false);
    }
  };

  const canDelete = (item: RecommendationItem) => canModerate || item.createdBy === currentUser.id;
  const canHide = (item: RecommendationItem) => canModerate && item.status !== 'deleted';
  const canEdit = (item: RecommendationItem) => canModerate || item.createdBy === currentUser.id;
  const handleItemChange = (next: RecommendationItem) => {
    setItems(prev => prev.map(item => item.id === next.id ? next : item));
    setWatchlistItems(prev => {
      const rest = prev.filter(item => item.id !== next.id);
      return next.myWatchlisted ? [next, ...rest] : rest;
    });
  };

  if (!RECOMMENDATIONS_ENABLED) {
    return null;
  }

  if (!serverId) {
    return (
      <div className="text-center py-12 text-[var(--theme-secondary-text)]/45 text-xs">
        Keşif önerileri için bir sunucu seç.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--theme-border)]/20 bg-[var(--theme-panel)]/45 p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-secondary-text)]/40" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Film, dizi, oyun veya etiket ara"
              className="w-full rounded-xl border border-[var(--theme-border)]/20 bg-[rgba(var(--shadow-base),0.12)] pl-9 pr-3 py-2 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:outline-none focus:border-[rgba(var(--theme-accent-rgb),0.35)]"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => { setListMode('discover'); setCategory('all'); }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${listMode === 'discover' && category === 'all' ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}
            >
              Tümü
              {totalCount > 0 && <span className="ml-1 opacity-60">{totalCount}</span>}
            </button>
            {RECOMMENDATION_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setListMode('discover'); setCategory(cat.id); }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${listMode === 'discover' && category === cat.id ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}
              >
                {cat.label}
                {(counts.get(cat.id) ?? 0) > 0 && <span className="ml-1 opacity-60">{counts.get(cat.id)}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setListMode('watchlist')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${listMode === 'watchlist' ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60 hover:bg-[rgba(var(--glass-tint),0.04)] hover:text-[var(--theme-text)]'}`}
          >
            <BookmarkPlus size={12} />
            İzleme listem
            {watchlistItems.length > 0 && <span className="opacity-70">{watchlistItems.length}</span>}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {loading && visibleItems.length === 0 ? (
        <div className="text-center py-12 text-[var(--theme-secondary-text)]/45 text-xs">Öneriler yükleniyor...</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--theme-border)]/25 bg-[var(--theme-surface)]/25 py-12 px-5 text-center">
          <Compass size={24} className="mx-auto text-[var(--theme-secondary-text)]/35 mb-3" />
          <div className="text-[13px] font-medium text-[var(--theme-text)]">{listMode === 'watchlist' ? 'İzleme listen boş' : 'Henüz keşif önerisi yok'}</div>
          <div className="mt-1 text-[11px] text-[var(--theme-secondary-text)]/55">{listMode === 'watchlist' ? 'İzleme listeme ekle ikonuyla önerileri burada toplayabilirsin.' : 'Sunucu için ilk film, dizi veya oyun önerisini ekle.'}</div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[900px] space-y-3">
            {visibleItems.map(item => (
              <RecommendationCard
                key={item.id}
                serverId={serverId}
                item={item}
                currentUser={currentUser}
                canDelete={canDelete(item)}
                canHide={canHide(item)}
                canEdit={canEdit(item)}
                onEdit={() => setEditingItem(item)}
                onItemChange={handleItemChange}
                onHide={() => void handleHide(item)}
                onRestore={() => void handleRestore(item)}
                onDelete={() => void handleDelete(item)}
                onOpenCreatorProfile={async (userId, position) => {
                  if (!serverId) return;
                  setProfilePosition(position);
                  setProfileOpen(true);
                  setProfileLoading(true);
                  setCreatorProfile(null);
                  try {
                    const profile = await getRecommendationCreatorProfile(serverId, userId);
                    setCreatorProfile(profile);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Kullanıcı kartı alınamadı');
                    setProfileOpen(false);
                  } finally {
                    setProfileLoading(false);
                  }
                }}
              />
            ))}
        </div>
      )}

      <RecommendationCreateModal
        open={modalOpen}
        loading={saving}
        serverId={serverId}
        currentUser={currentUser}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
      <RecommendationCreateModal
        open={!!editingItem}
        loading={saving}
        serverId={serverId}
        mode="edit"
        initialItem={editingItem}
        currentUser={currentUser}
        onClose={() => setEditingItem(null)}
        onSubmit={handleUpdate}
      />
      <RecommendationConfirmDialog
        open={!!confirmState}
        variant={confirmState?.variant || 'hide'}
        busy={confirmBusy}
        title={confirmState?.item.title}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
        onConfirm={() => void handleConfirmAction()}
      />
      {profileOpen && (
        <>
        <div className="fixed inset-0 z-[85]" onMouseDown={() => setProfileOpen(false)} />
          <div
            className="surface-floating fixed z-[86] w-[260px] overflow-hidden rounded-[18px] p-3.5 group/card transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-[2px]"
            style={{
              top: Math.min(Math.max(12, profilePosition.y - 28), window.innerHeight - 272),
              left: Math.min(Math.max(12, profilePosition.x + 8), window.innerWidth - 304),
              borderRadius: 18,
              backdropFilter: 'blur(14px) saturate(125%)',
              WebkitBackdropFilter: 'blur(14px) saturate(125%)',
            }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(ellipse_at_35%_-10%,rgba(var(--theme-accent-rgb),0.09),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/[0.10]" />
            <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-transparent group-hover/card:ring-[rgba(var(--theme-accent-rgb),0.22)] transition-[box-shadow] duration-200" />
            <div className="relative">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[rgba(var(--theme-accent-rgb),0.06)] text-[var(--theme-secondary-text)]/70 shadow-[inset_0_0_0_1px_rgba(var(--glass-tint),0.18),inset_0_1px_0_rgba(255,255,255,0.05),0_4px_10px_-2px_rgba(0,0,0,0.22)]">
                  {creatorProfile?.userAvatar ? <img src={creatorProfile.userAvatar} alt="" className="h-full w-full rounded-xl object-cover" /> : <UserRound size={16} />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--theme-text)]">{creatorProfile?.userName || (profileLoading ? 'Yükleniyor...' : 'Bir üye')}</div>
                  {creatorProfile && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span title="Keşif skoru" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--theme-accent)]">
                        <Sparkles size={12} />
                        {scoreText(creatorProfile.discoveryScore)}
                      </span>
                      <span title="Bilgi doluluğu" className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-200">
                        <Brain size={12} />
                        %{creatorProfile.informationScore}
                      </span>
                      <span title="Puanlama" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--theme-secondary-text)]/68">
                        <BookOpenCheck size={12} className="text-[var(--theme-accent)]/75" />
                        {creatorProfile.ratedRecommendationCount}
                      </span>
                      <span title="Yorum" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--theme-secondary-text)]/68">
                        <MessageCircle size={12} className="text-amber-200/80" />
                        {creatorProfile.commentCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setProfileOpen(false)} className="text-[var(--theme-secondary-text)]/50 hover:text-[var(--theme-text)]">
                <X size={16} />
              </button>
            </div>
            {creatorProfile && (
              <>
                <div className="mt-2.5 flex items-center justify-center gap-4 border-t border-[rgba(var(--glass-tint),0.06)] pt-2.5">
                  {creatorProfile.byCategory.map(row => (
                    <div key={row.category} title={CATEGORY_LABELS[row.category]} className="inline-flex items-center gap-1.5">
                      {React.createElement(categoryIcon(row.category), {
                        size: 16,
                        className:
                          row.category === 'film' ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.35)]'
                          : row.category === 'series' ? 'text-violet-300 drop-shadow-[0_0_8px_rgba(196,181,253,0.35)]'
                          : 'text-emerald-300 drop-shadow-[0_0_8px_rgba(110,231,183,0.35)]',
                      })}
                      <span className="text-[11px] font-semibold text-[var(--theme-text)]">{scoreText(row.averageRating)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
