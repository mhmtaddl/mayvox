import React, { createContext, useContext } from 'react';

export interface UIContextType {
  toastMsg: string | null;
  setToastMsg: (v: string | null) => void;
  invitationModal: { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string } | null;
  setInvitationModal: (v: { inviterId: string; inviterName: string; inviterAvatar?: string; roomName: string; roomId: string } | null) => void;
  userActionMenu: { userId: string; x: number; y: number } | null;
  setUserActionMenu: (v: { userId: string; x: number; y: number } | null) => void;
  contextMenu: { x: number; y: number; channelId: string } | null;
  setContextMenu: (v: { x: number; y: number; channelId: string } | null) => void;
  isStatusMenuOpen: boolean;
  setIsStatusMenuOpen: (v: boolean) => void;
  statusTimerInput: string;
  setStatusTimerInput: (v: string) => void;
  roomModal: {
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
  };
  setRoomModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    type: 'create' | 'edit';
    channelId?: string;
    name: string;
    maxUsers: number;
    isInviteOnly: boolean;
    isHidden: boolean;
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
}

export const UIContext = createContext<UIContextType | null>(null);

export const useUI = (): UIContextType => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIContext.Provider');
  return ctx;
};
