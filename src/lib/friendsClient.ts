import { authHeader, getAuthToken } from './authClient';

const SERVER_API_URL = String(import.meta.env.VITE_SERVER_API_URL || '').replace(/\/$/, '');

async function friendsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  if (!SERVER_API_URL || !token) throw new Error('Oturum bulunamadı');
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    ...init,
    headers: {
      ...authHeader(),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'İşlem başarısız');
  return body as T;
}

export interface FriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface FriendGroupRow {
  id: string;
  name: string;
  sort_order: number;
}

export async function getFriendState() {
  return friendsFetch<{
    friends: Array<{ user_low_id: string; user_high_id: string }>;
    requests: FriendRequestRow[];
  }>('/auth/friends');
}

export async function sendFriendRequest(receiverId: string) {
  return friendsFetch<{ data: FriendRequestRow | null; error: null }>('/auth/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ receiverId }),
  });
}

export async function updateFriendRequest(requestId: string, status: 'accepted' | 'rejected') {
  return friendsFetch<{ data: FriendRequestRow | null; error: null }>(`/auth/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function removeFriendship(otherId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>(`/auth/friends/${encodeURIComponent(otherId)}`, {
    method: 'DELETE',
  });
}

export async function getFavoriteFriends() {
  return friendsFetch<{ data: Array<{ friend_user_id: string }>; error: null }>('/auth/friends/favorites');
}

export async function addFavoriteFriend(friendId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>('/auth/friends/favorites', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  });
}

export async function removeFavoriteFriend(friendId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>(`/auth/friends/favorites/${encodeURIComponent(friendId)}`, {
    method: 'DELETE',
  });
}

export async function getFriendGroups() {
  return friendsFetch<{
    groups: FriendGroupRow[];
    members: Array<{ group_id: string; friend_user_id: string }>;
  }>('/auth/friends/groups');
}

export async function createFriendGroup(name: string, sortOrder: number) {
  return friendsFetch<{ data: FriendGroupRow; error: null }>('/auth/friends/groups', {
    method: 'POST',
    body: JSON.stringify({ name, sortOrder }),
  });
}

export async function renameFriendGroup(groupId: string, name: string) {
  return friendsFetch<{ data: FriendGroupRow; error: null }>(`/auth/friends/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteFriendGroup(groupId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>(`/auth/friends/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
  });
}

export async function assignFriendGroup(friendId: string, groupId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>('/auth/friends/groups/members', {
    method: 'PUT',
    body: JSON.stringify({ friendId, groupId }),
  });
}

export async function removeFriendGroupAssignment(friendId: string) {
  return friendsFetch<{ data: { ok: boolean }; error: null }>(`/auth/friends/groups/members/${encodeURIComponent(friendId)}`, {
    method: 'DELETE',
  });
}
