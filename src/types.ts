export type UserStatus = 'online' | 'busy' | 'away' | 'offline';

export interface User {
  id: string;
  name: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  status: UserStatus;
  statusText?: string;
  avatar: string;
  isMuted?: boolean;       // admin tarafından susturulma
  selfMuted?: boolean;    // kullanıcının kendi mikrofon kapatması
  selfDeafened?: boolean; // kullanıcının kendi hoparlör kapatması
  isSpeaking?: boolean;
  lastSeen?: string;
  isAdmin?: boolean;
  isPrimaryAdmin?: boolean;
  isModerator?: boolean;
  isVoiceBanned?: boolean;
  muteExpires?: number;
  banExpires?: number;
  joinedAt?: number;
  password?: string;
  mustChangePassword?: boolean;
  passwordResetRequested?: boolean;
  appVersion?: string;
  platform?: 'mobile' | 'desktop';
  lastSeenAt?: string;
  totalUsageMinutes?: number;
  onlineSince?: number;
  showLastSeen?: boolean;
  /** Auto-presence durumu: active/idle/deafened — otomatik tespit edilir */
  autoStatus?: 'active' | 'idle' | 'deafened';
}

export interface VoiceChannel {
  id: string;
  name: string;
  userCount: number;
  members?: string[]; // Array of user names
  isSystemChannel?: boolean; // If true, it won't be auto-deleted
  password?: string; // 4-digit numeric password
  deletionTimer?: number; // Seconds remaining until deletion
  maxUsers?: number;
  isInviteOnly?: boolean;
  isHidden?: boolean;
  ownerId?: string;
  /** Oda modu: social/gaming/broadcast/quiet — undefined = social (fallback) */
  mode?: string;
  /** Broadcast odada konuşmacı kullanıcı ID'leri — yoksa ownerId varsayılan konuşmacı */
  speakerIds?: string[];
}

export type AppView = 'loading' | 'login-selection' | 'login-code' | 'login-password' | 'register-details' | 'chat' | 'settings';

export interface InviteRequest {
  id: string;
  email: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'rejected' | 'expired' | 'used';
  expiresAt: number;
  rejectionCount: number;
  blockedUntil?: number | null;
  permanentlyBlocked?: boolean;
  createdAt: string;
  lastSendError?: string;
  sentCode?: string;
}

// Legacy Theme type — replaced by AppTheme from themes.ts
// Kept as re-export for backward compatibility
export type { AppTheme as Theme, ThemeKey } from './themes';

export type AnnouncementPriority = 'normal' | 'important' | 'critical';
export type AnnouncementType = 'announcement' | 'event';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  is_pinned: boolean;
  priority: AnnouncementPriority;
  type: AnnouncementType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  event_date?: string | null;
  participation_time?: string | null;
  participation_requirements?: string | null;
}
