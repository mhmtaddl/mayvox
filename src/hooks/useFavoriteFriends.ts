import { useState, useEffect, useCallback, useRef } from 'react';
import { addFavoriteFriend, getFavoriteFriends, removeFavoriteFriend } from '../lib/friendsClient';

/**
 * useFavoriteFriends — personal favorite/starred friends layer.
 * Does not affect other users. Pure client-side pinning.
 */
export function useFavoriteFriends(currentUserId: string | undefined) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchFavorites = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data } = await getFavoriteFriends();

      if (!mountedRef.current) return;
      setFavoriteIds(new Set((data || []).map(r => r.friend_user_id)));
    } catch (e) {
      console.error('fetchFavorites error:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFavorites();
    return () => { mountedRef.current = false; };
  }, [fetchFavorites]);

  const isFavorite = useCallback(
    (friendId: string) => favoriteIds.has(friendId),
    [favoriteIds]
  );

  const addFavorite = useCallback(async (friendId: string): Promise<boolean> => {
    if (!currentUserId || friendId === currentUserId) return false;

    try {
      await addFavoriteFriend(friendId);
    } catch (error) {
      console.error('addFavorite error:', error);
      return false;
    }

    setFavoriteIds(prev => new Set([...prev, friendId]));
    return true;
  }, [currentUserId]);

  const removeFavorite = useCallback(async (friendId: string): Promise<boolean> => {
    if (!currentUserId) return false;

    try {
      await removeFavoriteFriend(friendId);
    } catch (error) {
      console.error('removeFavorite error:', error);
      return false;
    }

    setFavoriteIds(prev => {
      const next = new Set(prev);
      next.delete(friendId);
      return next;
    });
    return true;
  }, [currentUserId]);

  const toggleFavorite = useCallback(async (friendId: string): Promise<boolean> => {
    if (favoriteIds.has(friendId)) return removeFavorite(friendId);
    return addFavorite(friendId);
  }, [favoriteIds, addFavorite, removeFavorite]);

  return { favoriteIds, isFavorite, addFavorite, removeFavorite, toggleFavorite, loading };
}
