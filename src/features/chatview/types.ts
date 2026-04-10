export type { ChatMessage } from '../../lib/chatService';

export interface RoomModalState {
  isOpen: boolean;
  type: 'create' | 'edit';
  channelId?: string;
  name: string;
  maxUsers: number;
  isInviteOnly: boolean;
  isHidden: boolean;
  mode: string;
}
