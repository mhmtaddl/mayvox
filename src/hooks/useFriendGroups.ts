import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  assignFriendGroup,
  createFriendGroup,
  deleteFriendGroup,
  getFriendGroups,
  removeFriendGroupAssignment,
  renameFriendGroup,
} from '../lib/friendsClient';

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
      const data = await getFriendGroups();

      if (!mountedRef.current) return;
      setGroups((data.groups || []).map(g => ({ id: g.id, name: g.name, sortOrder: g.sort_order })));
    } catch (e) {
      console.error('fetchGroups error:', e);
    }
  }, [currentUserId]);

  const fetchMembers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const state = await getFriendGroups();
      if (!state.groups || state.groups.length === 0) {
        if (mountedRef.current) setMemberMap(new Map());
        return;
      }

      if (!mountedRef.current) return;
      const m = new Map<string, Set<string>>();
      for (const row of state.members || []) {
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
    let data;
    try {
      const res = await createFriendGroup(name, maxOrder + 1);
      data = res.data;
    } catch (error) {
      console.error('createGroup error:', error);
      return null;
    }
    const newGroup = { id: data.id, name: data.name, sortOrder: data.sort_order };
    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  }, [currentUserId, groups]);

  const renameGroup = useCallback(async (groupId: string, newName: string): Promise<boolean> => {
    try {
      await renameFriendGroup(groupId, newName);
    } catch (error) {
      console.error('renameGroup error:', error);
      return false;
    }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
    return true;
  }, []);

  const deleteGroup = useCallback(async (groupId: string): Promise<boolean> => {
    try {
      await deleteFriendGroup(groupId);
    } catch (error) {
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
    try {
      await assignFriendGroup(friendId, groupId);
    } catch (error) {
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

    try {
      await removeFriendGroupAssignment(friendId);
    } catch (error) {
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
