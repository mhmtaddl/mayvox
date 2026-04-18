import React, { createContext, useContext } from 'react';
import { AppView, User, VoiceChannel, InviteRequest } from '../types';
import { supabase } from '../lib/supabase';
import type { ResetRequest } from '../components/PasswordResetPanel';

export interface AppStateContextType {
  // View
  view: AppView;
  setView: (v: AppView) => void;

  // Audio control
  isMuted: boolean;
  setIsMuted: (v: boolean) => void;
  isDeafened: boolean;
  setIsDeafened: (v: boolean) => void;

  // Generated code
  generatedCode: string | null;
  setGeneratedCode: (v: string | null) => void;
  timeLeft: number;
  setTimeLeft: (v: number) => void;

  // Login flow state
  loginNick: string;
  setLoginNick: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  loginError: string | null;
  setLoginError: (v: string | null) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;

  // Refs
  livekitRoomRef: React.MutableRefObject<import('livekit-client').Room | null>;
  presenceChannelRef: React.MutableRefObject<ReturnType<typeof supabase.channel> | null>;
  /** Idle auto-leave countdown state — banner consume eder. */
  countdownRef: React.MutableRefObject<{
    active: boolean;
    timeoutId: ReturnType<typeof setTimeout> | null;
    disconnectAt: number;
    sessionEpoch: number;
  }>;
  /** React state kopyası: countdown aktif mi — conditional render için. */
  countdownActive: boolean;
  /** Banner'daki "Buradayım" butonu için — activity reset + countdown cancel. */
  dismissIdleCountdown: () => void;

  // Handlers
  handleCopyCode: () => void;
  handleUpdateUserVolume: (userId: string, volume: number) => void;
  handleUserActionClick: (e: React.MouseEvent, userId: string) => void;
  handleInviteUser: (userId: string, serverContext?: { name?: string; avatar?: string | null }) => void;
  handleCancelInvite: (userId: string) => void;
  handleKickUser: (userId: string) => void;
  handleMoveUser: (userName: string, targetChannelId: string) => void;
  handleSaveRoom: () => Promise<void>;
  handleDeleteRoom: (id: string) => Promise<void>;
  handleRenameRoom: (id: string, newName: string) => Promise<void>;
  handleReorderChannels: (orderedIds: string[]) => Promise<void>;
  handleSetPassword: (id: string, password: string, repeat: string) => Promise<void>;
  handleRemovePassword: (id: string) => Promise<void>;
  handleJoinChannel: (id: string, isInvited?: boolean) => Promise<void>;
  handleVerifyPassword: () => Promise<void>;
  handleContextMenu: (e: React.MouseEvent, channelId: string) => void;
  handleMuteUser: (userId: string, durationMinutes: number) => Promise<void>;
  handleBanUser: (userId: string, durationMinutes: number) => Promise<void>;
  handleUnmuteUser: (userId: string) => Promise<void>;
  handleUnbanUser: (userId: string) => Promise<void>;
  handleDeleteUser: (userId: string) => void;
  handleToggleAdmin: (userId: string) => Promise<void>;
  handleToggleModerator: (userId: string) => Promise<void>;
  handleSetServerCreationPlan: (userId: string, newPlan: 'none' | 'free' | 'pro' | 'ultra') => Promise<void>;
  handleGenerateCode: () => Promise<void>;
  handleLogin: (nick: string, password: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleRegister: (code: string, nick: string, password: string, repeatPwd: string) => Promise<void>;
  handleCompleteRegistration: () => Promise<void>;
  disconnectFromLiveKit: () => Promise<void>;
  formatTime: (seconds: number) => string;
  broadcastModeration: (userId: string, updates: Partial<User>) => void;
  handleToggleSpeaker: (userId: string) => Promise<void>;
  /** Mevcut kullanıcı broadcast odada dinleyici mi */
  isBroadcastListener: boolean;
  appVersion: string;
  showReleaseNotes: boolean;
  setShowReleaseNotes: (v: boolean) => void;

  // Şifre sıfırlama
  passwordResetRequests: ResetRequest[];
  handleApproveReset: (req: ResetRequest) => Promise<void>;
  handleDismissReset: (userId: string) => Promise<void>;
  handleAdminManualReset: (userId: string, userName: string, userEmail: string) => Promise<void>;

  // Davet talebi yönetimi (admin)
  inviteRequests: InviteRequest[];
  handleSendInviteCode: (req: InviteRequest) => Promise<{ code?: string; error?: string }>;
  handleRejectInvite: (req: InviteRequest) => Promise<void>;

  // Davet cooldown: ret sonrası 60sn bekleme (key = hedef userId, value = expiresAt timestamp)
  inviteCooldowns: Record<string, number>;
  // Davet gönderen tarafta durum göstergesi
  inviteStatuses: Record<string, 'pending' | 'accepted' | 'rejected'>;

}

export const AppStateContext = createContext<AppStateContextType | null>(null);

export const useAppState = (): AppStateContextType => {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateContext.Provider');
  }
  return ctx;
};
