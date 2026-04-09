import React, { createContext, useContext } from 'react';
import { User } from '../types';
import type { FriendRequest } from '../hooks/useFriends';

export interface UserContextType {
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  allUsers: User[];
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  getAvatarText: (user: User) => string;
  getStatusColor: (statusText: string) => string;
  getEffectiveStatus: () => string;
  /** Friends v2 */
  friendIds: Set<string>;
  isFriend: (otherId: string) => boolean;
  getRelationship: (otherId: string) => 'friend' | 'incoming' | 'outgoing' | null;
  sendRequest: (otherId: string) => Promise<boolean>;
  acceptRequest: (otherId: string) => Promise<boolean>;
  rejectRequest: (otherId: string) => Promise<boolean>;
  cancelRequest: (otherId: string) => Promise<boolean>;
  removeFriend: (otherId: string) => Promise<boolean>;
  incomingRequests: FriendRequest[];
  friendsLoading: boolean;
}

export const UserContext = createContext<UserContextType | null>(null);

export const useUser = (): UserContextType => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserContext.Provider');
  return ctx;
};
