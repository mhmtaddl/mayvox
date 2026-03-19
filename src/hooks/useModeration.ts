import type React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  updateUserModeration,
  deleteUser,
  signOut,
} from '../lib/supabase';
import type { User } from '../types';

interface Props {
  currentUser: User;
  allUsers: User[];
  presenceChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setToastMsg: (v: string | null) => void;
  onSelfDelete: () => void; // called when admin deletes own account
}

const isSupabaseUser = (userId: string) => userId.includes('-');

export function useModeration({
  currentUser,
  allUsers,
  presenceChannelRef,
  setAllUsers,
  setToastMsg,
  onSelfDelete,
}: Props) {
  const broadcastModeration = (userId: string, updates: Partial<User>) => {
    presenceChannelRef.current?.send({
      type: 'broadcast',
      event: 'moderation',
      payload: { userId, updates },
    });
  };

  const showError = (msg = 'İşlem başarısız. Yetkiniz olmayabilir.') => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleMuteUser = async (
    userId: string,
    durationMinutes: number,
  ): Promise<void> => {
    const expires = Date.now() + durationMinutes * 60 * 1000;
    const updates = { isMuted: true, muteExpires: expires };
    if (isSupabaseUser(userId)) {
      const { data, error } = await updateUserModeration(userId, {
        is_muted: true,
        mute_expires: expires,
      });
      if (error || (data as any)?.error) { showError(); return; }
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates } : u)),
    );
    broadcastModeration(userId, updates);
  };

  const handleBanUser = async (
    userId: string,
    durationMinutes: number,
  ): Promise<void> => {
    const expires = Date.now() + durationMinutes * 60 * 1000;
    const updates = { isVoiceBanned: true, banExpires: expires };
    if (isSupabaseUser(userId)) {
      const { data, error } = await updateUserModeration(userId, {
        is_voice_banned: true,
        ban_expires: expires,
      });
      if (error || (data as any)?.error) { showError(); return; }
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates } : u)),
    );
    broadcastModeration(userId, updates);
  };

  const handleUnmuteUser = async (userId: string): Promise<void> => {
    const updates = { isMuted: false, muteExpires: undefined };
    if (isSupabaseUser(userId)) {
      const { data, error } = await updateUserModeration(userId, {
        is_muted: false,
        mute_expires: null,
      });
      if (error || (data as any)?.error) { showError(); return; }
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates } : u)),
    );
    broadcastModeration(userId, updates);
  };

  const handleUnbanUser = async (userId: string): Promise<void> => {
    const updates = { isVoiceBanned: false, banExpires: undefined };
    if (isSupabaseUser(userId)) {
      const { data, error } = await updateUserModeration(userId, {
        is_voice_banned: false,
        ban_expires: null,
      });
      if (error || (data as any)?.error) { showError(); return; }
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates } : u)),
    );
    broadcastModeration(userId, updates);
  };

  const handleDeleteUser = async (userId: string): Promise<void> => {
    if (userId === currentUser.id) {
      await signOut();
      onSelfDelete();
      return;
    }
    const { data, error } = await deleteUser(userId);
    if (error || data?.error) {
      alert(data?.error || 'Kullanıcı silinemedi.');
      return;
    }
    setAllUsers(prev => prev.filter(u => u.id !== userId));
    broadcastModeration(userId, { status: 'offline' });
  };

  const handleToggleAdmin = async (userId: string): Promise<void> => {
    if (!currentUser.isPrimaryAdmin) return;
    const targetUser = allUsers.find(u => u.id === userId);
    if (!targetUser) return;
    const newIsAdmin = !targetUser.isAdmin;
    const updates = { isAdmin: newIsAdmin };
    if (isSupabaseUser(userId)) {
      const { data, error } = await updateUserModeration(userId, {
        is_admin: newIsAdmin,
      });
      if (error || (data as any)?.error) { showError(); return; }
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...updates } : u)),
    );
    broadcastModeration(userId, updates);
  };

  return {
    broadcastModeration,
    handleMuteUser,
    handleBanUser,
    handleUnmuteUser,
    handleUnbanUser,
    handleDeleteUser,
    handleToggleAdmin,
  };
}
