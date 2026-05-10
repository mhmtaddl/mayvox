import type { RoomMode } from './roomModeConfig';
import type { CHANNEL_ICON_POOL_OPTIONS, QUICK_CHANNEL_ICON_OPTIONS } from './channelIcon';
import type { CHANNEL_ICON_COLOR_OPTIONS } from './channelIconColor';

type QuickChannelIconName = typeof QUICK_CHANNEL_ICON_OPTIONS[number]['id'];
type PoolChannelIconName = typeof CHANNEL_ICON_POOL_OPTIONS[number]['id'];
type ChannelIconName = QuickChannelIconName | PoolChannelIconName;
type ChannelIconColor = typeof CHANNEL_ICON_COLOR_OPTIONS[number]['value'];

export interface RoomPreset {
  id: 'gaming' | 'meeting' | 'broadcast' | 'quiet-work';
  label: string;
  description: string;
  suggestedName: string;
  mode: RoomMode;
  iconName: ChannelIconName;
  iconColor: ChannelIconColor;
  maxUsers: number;
  isInviteOnly: boolean;
  isHidden: boolean;
  isPersistent: boolean;
}

export const ROOM_PRESETS = [
  {
    id: 'gaming',
    label: 'Gaming',
    description: 'Takım iletişimi için hızlı oyun odası.',
    suggestedName: 'Oyun Odası',
    mode: 'gaming',
    iconName: 'gamepad',
    iconColor: '#34d399',
    maxUsers: 10,
    isInviteOnly: false,
    isHidden: false,
    isPersistent: true,
  },
  {
    id: 'meeting',
    label: 'Toplantı',
    description: 'Davetli, düzenli görüşmeler için.',
    suggestedName: 'Toplantı Odası',
    mode: 'social',
    iconName: 'users',
    iconColor: '#94a3b8',
    maxUsers: 10,
    isInviteOnly: true,
    isHidden: false,
    isPersistent: true,
  },
  {
    id: 'broadcast',
    label: 'Yayın',
    description: 'Konuşmacı odaklı yayın akışı.',
    suggestedName: 'Yayın Odası',
    mode: 'broadcast',
    iconName: 'radio',
    iconColor: '#f43f5e',
    maxUsers: 25,
    isInviteOnly: false,
    isHidden: false,
    isPersistent: true,
  },
  {
    id: 'quiet-work',
    label: 'Sessiz Çalışma',
    description: 'Bas-konuş odaklı sakin çalışma alanı.',
    suggestedName: 'Sessiz Oda',
    mode: 'quiet',
    iconName: 'quiet',
    iconColor: '#a78bfa',
    maxUsers: 6,
    isInviteOnly: true,
    isHidden: false,
    isPersistent: true,
  },
] as const satisfies readonly RoomPreset[];
