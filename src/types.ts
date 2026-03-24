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
  isVoiceBanned?: boolean;
  muteExpires?: number;
  banExpires?: number;
  joinedAt?: number;
  password?: string;
  mustChangePassword?: boolean;
  passwordResetRequested?: boolean;
  appVersion?: string;
  lastSeenAt?: string;
  totalUsageMinutes?: number;
  onlineSince?: number;
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

export interface Theme {
  id: string;
  name: string;
  bg: string;
  surface: string;
  sidebar: string;
  text: string;
  secondaryText: string;
  accent: string;
  border: string;
}
