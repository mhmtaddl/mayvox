import { VoiceChannel } from './types';

export const CHANNELS: VoiceChannel[] = [
  { id: '1', name: 'Sohbet Muhabbet', userCount: 0, members: [], isSystemChannel: true, mode: 'social' },
  { id: '2', name: 'Oyun Takımı', userCount: 0, members: [], isSystemChannel: true, mode: 'gaming' },
  { id: '3', name: 'Yayın Sahnesi', userCount: 0, members: [], isSystemChannel: true, mode: 'broadcast' },
  { id: '4', name: 'Sessiz Alan', userCount: 0, members: [], isSystemChannel: true, mode: 'quiet' },
];
