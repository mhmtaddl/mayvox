import React, { createContext, useContext } from 'react';
import { VoiceChannel, User } from '../types';

export interface ChannelContextType {
  channels: VoiceChannel[];
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  activeChannel: string | null;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  /** Şu an aktif sunucu ID — presence payload'ına ve server-level filtrelere beslenir. */
  activeServerId: string;
  setActiveServerId: React.Dispatch<React.SetStateAction<string>>;
  /** Kanal sırası için optimistic concurrency token (max updated_at). Reorder'da gönderilir. */
  channelOrderTokenRef: React.MutableRefObject<string | null>;
  isConnecting: boolean;
  currentChannel: VoiceChannel | undefined;
  channelMembers: User[];
}

export const ChannelContext = createContext<ChannelContextType | null>(null);

export const useChannel = (): ChannelContextType => {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannel must be used within ChannelContext.Provider');
  return ctx;
};
