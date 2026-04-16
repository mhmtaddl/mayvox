import React, { createContext, useContext } from 'react';
import { useFavoriteFriends } from '../hooks/useFavoriteFriends';

// Tek kaynak: tüm consumer'lar (FriendsSidebarContent, UserProfilePopup, vb.)
// AYNI favoriteIds state'ini paylaşsın. Önceki hook-per-component yaklaşımı
// her tüketiciyi ayrı useState ile ürettiği için bir yerdeki toggle başka
// yerdeki listeyi stale bırakıyordu.

type FavoriteFriendsValue = ReturnType<typeof useFavoriteFriends>;

const FavoriteFriendsContext = createContext<FavoriteFriendsValue | null>(null);

export function FavoriteFriendsProvider({
  currentUserId,
  children,
}: {
  currentUserId: string | undefined;
  children: React.ReactNode;
}) {
  const value = useFavoriteFriends(currentUserId);
  return (
    <FavoriteFriendsContext.Provider value={value}>
      {children}
    </FavoriteFriendsContext.Provider>
  );
}

export function useSharedFavorites(): FavoriteFriendsValue {
  const ctx = useContext(FavoriteFriendsContext);
  if (!ctx) throw new Error('useSharedFavorites must be used within FavoriteFriendsProvider');
  return ctx;
}
