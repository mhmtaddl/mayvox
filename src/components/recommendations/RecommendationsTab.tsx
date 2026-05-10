import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Search } from 'lucide-react';
import type { User } from '../../types';
import {
  createServerRecommendation,
  deleteServerRecommendation,
  getServerRecommendations,
  hideServerRecommendation,
  updateServerRecommendation,
} from '../../lib/serverService';
import { subscribeRealtimeEvents } from '../../lib/chatService';
import type { RecommendationCategory, RecommendationItem, RecommendationPayload } from './recommendationTypes';
import { RECOMMENDATION_CATEGORIES } from './recommendationTypes';
import RecommendationCard from './RecommendationCard';
import RecommendationConfirmDialog from './RecommendationConfirmDialog';
import RecommendationCreateModal from './RecommendationCreateModal';

interface Props {
  serverId?: string;
  currentUser: User;
  openCreateSignal?: number;
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

export default function RecommendationsTab({ serverId, currentUser, openCreateSignal = 0 }: Props) {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [category, setCategory] = useState<RecommendationCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecommendationItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canModerate = !!(currentUser.isAdmin || currentUser.isPrimaryAdmin || currentUser.isModerator);

  useEffect(() => {
    if (!serverId || !RECOMMENDATIONS_ENABLED || openCreateSignal <= 0) return;
    setEditingItem(null);
    setModalOpen(true);
  }, [openCreateSignal, serverId]);

  const fetchItems = useCallback(async () => {
    if (!serverId || !RECOMMENDATIONS_ENABLED) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getServerRecommendations(serverId, {
        category,
        q: query,
        limit: 60,
      });
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Öneriler alınamadı');
    } finally {
      setLoading(false);
    }
  }, [category, query, serverId]);

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
        if (!item || item.status !== 'active') return;
        setItems(prev => {
          const rest = prev.filter(existing => existing.id !== item.id);
          return itemMatchesCurrentFilters(item) ? [item, ...rest] : rest;
        });
        return;
      }

      if (event.type === 'recommendation:item_hidden' || event.type === 'recommendation:item_deleted') {
        const itemId = payload.itemId || payload.item?.id;
        if (!itemId) return;
        setItems(prev => prev.filter(item => item.id !== itemId));
      }
    });
  }, [itemMatchesCurrentFilters, serverId]);

  const counts = useMemo(() => {
    const map = new Map<RecommendationCategory, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);

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
      const item = await updateServerRecommendation(serverId, editingItem.id, { ...payload, category: editingItem.category });
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

  const handleConfirmAction = async () => {
    if (!serverId || !confirmState) return;
    const { variant, item } = confirmState;
    setConfirmBusy(true);
    setError(null);
    try {
      if (variant === 'delete') {
        await deleteServerRecommendation(serverId, item.id);
      } else {
        await hideServerRecommendation(serverId, item.id);
      }
      setItems(prev => prev.filter(x => x.id !== item.id));
      setConfirmState(null);
    } catch (err) {
      setError(recommendationErrorMessage(err));
    } finally {
      setConfirmBusy(false);
    }
  };

  const canDelete = (item: RecommendationItem) => canModerate || item.createdBy === currentUser.id;
  const canHide = (item: RecommendationItem) => canModerate && item.status === 'active';
  const canEdit = (item: RecommendationItem) => canModerate || item.createdBy === currentUser.id;
  const handleItemChange = (next: RecommendationItem) => {
    setItems(prev => prev.map(item => item.id === next.id ? next : item));
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
              placeholder="Film, oyun, kitap veya etiket ara"
              className="w-full rounded-xl border border-[var(--theme-border)]/20 bg-[rgba(var(--shadow-base),0.12)] pl-9 pr-3 py-2 text-[12px] text-[var(--theme-text)] placeholder:text-[var(--theme-secondary-text)]/40 focus:outline-none focus:border-[rgba(var(--theme-accent-rgb),0.35)]"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${category === 'all' ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}
          >
            Tümü
          </button>
          {RECOMMENDATION_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${category === cat.id ? 'bg-[rgba(var(--theme-accent-rgb),0.14)] text-[var(--theme-accent)]' : 'text-[var(--theme-secondary-text)]/60 hover:text-[var(--theme-text)] hover:bg-[rgba(var(--glass-tint),0.04)]'}`}
            >
              {cat.label}
              {(counts.get(cat.id) ?? 0) > 0 && <span className="ml-1 opacity-60">{counts.get(cat.id)}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center py-12 text-[var(--theme-secondary-text)]/45 text-xs">Öneriler yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--theme-border)]/25 bg-[var(--theme-surface)]/25 py-12 px-5 text-center">
          <Compass size={24} className="mx-auto text-[var(--theme-secondary-text)]/35 mb-3" />
          <div className="text-[13px] font-medium text-[var(--theme-text)]">Henüz keşif önerisi yok</div>
          <div className="mt-1 text-[11px] text-[var(--theme-secondary-text)]/55">Sunucu için ilk film, oyun, kitap veya donanım önerisini ekle.</div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[900px] space-y-3">
            {items.map(item => (
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
                onDelete={() => void handleDelete(item)}
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
    </div>
  );
}
