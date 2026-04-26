import React, { createContext, useContext } from 'react';

// Ayarlar sayfasına deep-link intent'i — bildirim tıklamasından gelen
// navigasyon talebi (örn: davet talepleri listesine direkt iniş)
export type SettingsTarget = 'invite_requests' | 'app' | 'account' | null;

export interface UIContextType {
  toastMsg: string | null;
  setToastMsg: (v: string | null) => void;
  invitationModal: { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string; serverName?: string; serverAvatar?: string | null } | null;
  setInvitationModal: (v: { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string; serverName?: string; serverAvatar?: string | null } | null) => void;
  userActionMenu: { userId: string; x: number; y: number } | null;
  setUserActionMenu: (v: { userId: string; x: number; y: number } | null) => void;
  contextMenu: { x: number; y: number; channelId: string } | null;
  setContextMenu: (v: { x: number; y: number; channelId: string } | null) => void;
  roomModal: {
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
    mode: string;
    iconColor?: string;
    iconName?: string;
  };
  setRoomModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
    mode: string;
    iconColor?: string;
    iconName?: string;
  }>>;
  passwordModal: { type: 'set' | 'enter'; channelId: string } | null;
  setPasswordModal: (v: { type: 'set' | 'enter'; channelId: string } | null) => void;
  passwordInput: string;
  setPasswordInput: (v: string) => void;
  passwordRepeatInput: string;
  setPasswordRepeatInput: (v: string) => void;
  passwordError: boolean;
  setPasswordError: (v: boolean) => void;
  userVolumes: Record<string, number>;
  setUserVolumes: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  settingsTarget: SettingsTarget;
  setSettingsTarget: (v: SettingsTarget) => void;
}

export const UIContext = createContext<UIContextType | null>(null);

export const useUI = (): UIContextType => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIContext.Provider');
  return ctx;
};
