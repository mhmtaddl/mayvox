import type { Request } from 'express';

export interface AuthRequest extends Request {
  userId: string;
}

export interface Server {
  id: string;
  owner_user_id: string;
  name: string;
  short_name: string;
  slug: string;
  description: string;
  avatar_url: string | null;
  invite_code: string;
  level: number;
  capacity: number;
  is_public: boolean;
  join_policy: 'invite_only' | 'open';
  motto: string;
  plan: string;
  created_at: string;
  updated_at: string;
}

export interface ServerMember {
  id: string;
  server_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'mod' | 'member';
  joined_at: string;
  is_muted: boolean;
  is_notifications_muted: boolean;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  description: string;
  type: 'voice' | 'text';
  position: number;
  is_default: boolean;
  created_at: string;
}

export interface ServerInvite {
  id: string;
  server_id: string;
  code: string;
  created_by_user_id: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ServerBan {
  id: string;
  server_id: string;
  user_id: string;
  reason: string;
  banned_by: string;
  created_at: string;
}

export interface ServerActivity {
  server_id: string;
  member_count: number;
  active_count: number;
  updated_at: string;
}

/** Frontend'e dönen sunucu verisi */
export interface ServerResponse {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  avatarUrl: string | null;
  description: string;
  memberCount: number;
  activeCount: number;
  capacity: number;
  level: number;
  inviteCode: string;
  isPublic: boolean;
  joinPolicy: string;
  motto: string;
  plan: string;
  createdAt: string;
  role?: string;
}

export interface MemberResponse {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  joinedAt: string;
  isMuted: boolean;
}

export interface UserInviteResponse {
  id: string;
  serverId: string;
  serverName: string;
  serverAvatar: string | null;
  invitedBy: string;
  invitedByName: string;
  status: string;
  createdAt: string;
}

export interface SentInviteResponse {
  id: string;
  invitedUserId: string;
  invitedUserName: string;
  status: string;
  createdAt: string;
}

export interface InviteResponse {
  id: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BanResponse {
  userId: string;
  reason: string;
  bannedBy: string;
  createdAt: string;
}
