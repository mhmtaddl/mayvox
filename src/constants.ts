import { VoiceChannel } from './types';

export const CHANNELS: VoiceChannel[] = [
  { id: '1', name: 'Genel', userCount: 0, members: [], isSystemChannel: true, mode: 'social', position: 0 },
  { id: '2', name: 'Oyun', userCount: 0, members: [], isSystemChannel: true, mode: 'gaming', position: 1 },
  { id: '3', name: 'Yayın', userCount: 0, members: [], isSystemChannel: true, mode: 'broadcast', position: 2 },
  { id: '4', name: 'Sessiz', userCount: 0, members: [], isSystemChannel: true, mode: 'quiet', position: 3 },
];
