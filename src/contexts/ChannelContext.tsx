import React, { createContext, useContext } from 'react';
import { VoiceChannel, User } from '../types';

export interface ChannelContextType {
  channels: VoiceChannel[];
  setChannels: React.Dispatch<React.SetStateAction<VoiceChannel[]>>;
  activeChannel: string | null;
  setActiveChannel: React.Dispatch<React.SetStateAction<string | null>>;
  currentChannel: VoiceChannel | undefined;
  channelMembers: User[];
}

export const ChannelContext = createContext<ChannelContextType | null>(null);

export const useChannel = (): ChannelContextType => {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannel must be used within ChannelContext.Provider');
  return ctx;
};
