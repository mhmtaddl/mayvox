import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export interface FriendGroup {
  id: string;
  name: string;
  sortOrder: number;
}

/**
 * useFriendGroups — personal friend group organization.
 * Groups are per-user, only affect rendering.
 */
export function useFriendGroups(currentUserId: string | undefined) {
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  // groupId → Set<friendUserId>
  const [memberMap, setMemberMap] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchGroups = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('friend_groups')
        .select('id, name, sort_order')
        .eq('owner_id', currentUserId)
        .order('sort_order');

      if (!mountedRef.current) return;
      setGroups((data || []).map(g => ({ id: g.id, name: g.name, sortOrder: g.sort_order })));
    } catch (e) {
      console.error('fetchGroups error:', e);
    }
  }, [currentUserId]);

  const fetchMembers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      // Get all group IDs for this user first
      const { data: grps } = await supabase
        .from('friend_groups')
        .select('id')
        .eq('owner_id', currentUserId);

      if (!grps || grps.length === 0) {
        if (mountedRef.current) setMemberMap(new Map());
        return;
      }

      const groupIds = grps.map(g => g.id);
      const { data } = await supabase
        .from('friend_group_members')
        .select('group_id, friend_user_id')
        .in('group_id', groupIds);

      if (!mountedRef.current) return;
      const m = new Map<string, Set<string>>();
      for (const row of data || []) {
        if (!m.has(row.group_id)) m.set(row.group_id, new Set());
        m.get(row.group_id)!.add(row.friend_user_id);
      }
      setMemberMap(m);
    } catch (e) {
      console.error('fetchMembers error:', e);
    }
  }, [currentUserId]);

  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      await Promise.all([fetchGroups(), fetchMembers()]);
      if (mountedRef.current) setLoading(false);
    };
    load();
    return () => { mountedRef.current = false; };
  }, [fetchGroups, fetchMembers]);

  // Reverse lookup: friendUserId → groupId
  const friendToGroup = useMemo(() => {
    const m = new Map<string, string>();
    for (const [groupId, members] of memberMap) {
      for (const friendId of members) {
        m.set(friendId, groupId);
      }
    }
    return m;
  }, [memberMap]);

  const getGroupForFriend = useCallback(
    (friendId: string) => friendToGroup.get(friendId) || null,
    [friendToGroup]
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const createGroup = useCallback(async (name: string): Promise<FriendGroup | null> => {
    if (!currentUserId) return null;
    const maxOrder = groups.reduce((max, g) => Math.max(max, g.sortOrder), -1);
    const { data, error } = await supabase
      .from('friend_groups')
      .insert({ owner_id: currentUserId, name, sort_order: maxOrder + 1 })
      .select('id, name, sort_order')
      .single();

    if (error || !data) {
      console.error('createGroup error:', error);
      return null;
    }
    const newGroup = { id: data.id, name: data.name, sortOrder: data.sort_order };
    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  }, [currentUserId, groups]);

  const renameGroup = useCallback(async (groupId: string, newName: string): Promise<boolean> => {
    const { error } = await supabase
      .from('friend_groups')
      .update({ name: newName })
      .eq('id', groupId);

    if (error) {
      console.error('renameGroup error:', error);
      return false;
    }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
    return true;
  }, []);

  const deleteGroup = useCallback(async (groupId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('friend_groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('deleteGroup error:', error);
      return false;
    }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setMemberMap(prev => {
      const next = new Map(prev);
      next.delete(groupId);
      return next;
    });
    return true;
  }, []);

  const assignToGroup = useCallback(async (friendId: string, groupId: string): Promise<boolean> => {
    if (!currentUserId) return false;

    // Atomik: eski kaydı sil + yeni ekle (owner_id unique index korur)
    const currentGroupId = friendToGroup.get(friendId);
    if (currentGroupId) {
      await supabase
        .from('friend_group_members')
        .delete()
        .eq('owner_id', currentUserId)
        .eq('friend_user_id', friendId);
    }

    const { error } = await supabase
      .from('friend_group_members')
      .insert({ group_id: groupId, friend_user_id: friendId, owner_id: currentUserId });

    if (error) {
      // Unique violation = zaten bu grupta (race condition koruması)
      if (error.code === '23505') return true;
      console.error('assignToGroup error:', error);
      return false;
    }

    setMemberMap(prev => {
      const next = new Map<string, Set<string>>(prev);
      // Remove from old group
      if (currentGroupId && next.has(currentGroupId)) {
        const old = new Set<string>(next.get(currentGroupId)!);
        old.delete(friendId);
        next.set(currentGroupId, old);
      }
      // Add to new group
      if (!next.has(groupId)) next.set(groupId, new Set<string>());
      const s = new Set<string>(next.get(groupId)!);
      s.add(friendId);
      next.set(groupId, s);
      return next;
    });
    return true;
  }, [currentUserId, friendToGroup]);

  const removeFromGroup = useCallback(async (friendId: string): Promise<boolean> => {
    if (!currentUserId) return false;
    const groupId = friendToGroup.get(friendId);
    if (!groupId) return true;

    const { error } = await supabase
      .from('friend_group_members')
      .delete()
      .eq('owner_id', currentUserId)
      .eq('friend_user_id', friendId);

    if (error) {
      console.error('removeFromGroup error:', error);
      return false;
    }

    setMemberMap(prev => {
      const next = new Map<string, Set<string>>(prev);
      if (next.has(groupId)) {
        const s = new Set<string>(next.get(groupId)!);
        s.delete(friendId);
        next.set(groupId, s);
      }
      return next;
    });
    return true;
  }, [currentUserId, friendToGroup]);

  return {
    groups,
    memberMap,
    loading,
    getGroupForFriend,
    createGroup,
    renameGroup,
    deleteGroup,
    assignToGroup,
    removeFromGroup,
  };
}
