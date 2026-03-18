import { VoiceChannel, Theme } from './types';

export const THEMES: Theme[] = [
  {
    id: 'default',
    name: 'Varsayılan',
    bg: '#111621',
    surface: '#0d1117',
    sidebar: '#0f172a',
    text: '#f1f5f9',
    secondaryText: '#94a3b8',
    accent: '#2563eb',
    border: '#1e293b'
  },
  {
    id: 'beige',
    name: 'Bej',
    bg: '#EAD9CE',
    surface: '#F5EBE3',
    sidebar: '#D4BDB0',
    text: '#1A0E09',
    secondaryText: '#5C3D2E',
    accent: '#A0522D',
    border: '#C0A898'
  },
  {
    id: 'olive',
    name: 'Zeytin',
    bg: '#1C1D10',
    surface: '#252618',
    sidebar: '#141508',
    text: '#EDE8C0',
    secondaryText: '#9A9770',
    accent: '#ADBB35',
    border: '#363720'
  },
  {
    id: 'emerald',
    name: 'Zümrüt',
    bg: '#0D1E16',
    surface: '#122419',
    sidebar: '#091610',
    text: '#DCF5E8',
    secondaryText: '#5FAD88',
    accent: '#1ED97A',
    border: '#1A3826'
  },
  {
    id: 'ruby',
    name: 'Yakut',
    bg: '#160A0A',
    surface: '#1E0F0F',
    sidebar: '#110707',
    text: '#FAE8E8',
    secondaryText: '#BE7A7A',
    accent: '#E8445A',
    border: '#3A1515'
  },
  {
    id: 'cylk',
    name: 'CYLK',
    bg: '#18130A',
    surface: '#211A0F',
    sidebar: '#100C06',
    text: '#F0E2B8',
    secondaryText: '#8A7040',
    accent: '#C8A84B',
    border: '#2A200A'
  }
];

export const CHANNELS: VoiceChannel[] = [
  { id: '1', name: 'Sohbet Muhabbet', userCount: 0, members: [], isSystemChannel: true },
  { id: '2', name: 'Takım 1', userCount: 0, members: [], isSystemChannel: true },
  { id: '3', name: 'Takım 2', userCount: 0, members: [], isSystemChannel: true },
  { id: '4', name: 'Takım 3', userCount: 0, members: [], isSystemChannel: true },
];

