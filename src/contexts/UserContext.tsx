import React, { createContext, useContext } from 'react';
import { User } from '../types';

export interface UserContextType {
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  allUsers: User[];
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  getAvatarText: (user: User) => string;
  getStatusColor: (statusText: string) => string;
  getEffectiveStatus: () => string;
}

export const UserContext = createContext<UserContextType | null>(null);

export const useUser = (): UserContextType => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserContext.Provider');
  return ctx;
};
