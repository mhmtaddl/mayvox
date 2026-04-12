import { VoiceChannel } from './types';

export const CHANNELS: VoiceChannel[] = [
  { id: '1', name: 'Sohbet Muhabbet', userCount: 0, members: [], isSystemChannel: true, mode: 'social', position: 0 },
  { id: '2', name: 'Oyun Takımı', userCount: 0, members: [], isSystemChannel: true, mode: 'gaming', position: 1 },
  { id: '3', name: 'Yayın Sahnesi', userCount: 0, members: [], isSystemChannel: true, mode: 'broadcast', position: 2 },
  { id: '4', name: 'Sessiz Alan', userCount: 0, members: [], isSystemChannel: true, mode: 'quiet', position: 3 },
];
