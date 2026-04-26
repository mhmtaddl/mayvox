const CHANNEL_ICON_KEY = 'mayvox:channel-icon:v1';

export const QUICK_CHANNEL_ICON_OPTIONS = [
  { id: 'coffee', label: 'Genel' },
  { id: 'gamepad', label: 'Oyun' },
  { id: 'radio', label: 'Yayın' },
  { id: 'quiet', label: 'Sessiz' },
  { id: 'users', label: 'İki kişi' },
  { id: 'party', label: 'Konfeti' },
] as const;

export const CHANNEL_ICON_POOL_OPTIONS = [
  { id: 'message', label: 'Sohbet' },
  { id: 'crosshair', label: 'Battle' },
  { id: 'target', label: 'Nişan' },
  { id: 'swords', label: 'Kapışma' },
  { id: 'shield', label: 'Takım' },
  { id: 'bomb', label: 'Bomba' },
  { id: 'trophy', label: 'Kupa' },
  { id: 'userPlus', label: 'Duo' },
  { id: 'music', label: 'Müzik' },
  { id: 'headphones', label: 'Dinle' },
  { id: 'monitor', label: 'Ekran' },
  { id: 'zap', label: 'Hızlı' },
  { id: 'crown', label: 'Lider' },
  { id: 'flame', label: 'Ateş' },
  { id: 'rocket', label: 'Roket' },
  { id: 'tank', label: 'Tank' },
  { id: 'radar', label: 'Radar' },
  { id: 'gem', label: 'Premium' },
  { id: 'bot', label: 'Bot' },
  { id: 'cpu', label: 'Teknoloji' },
] as const;

const DEFAULT_ICONS: Record<string, string> = {
  social: 'coffee',
  gaming: 'gamepad',
  broadcast: 'radio',
  quiet: 'quiet',
};

const VALID_ICON_IDS: Set<string> = new Set([
  ...QUICK_CHANNEL_ICON_OPTIONS.map(option => option.id),
  ...CHANNEL_ICON_POOL_OPTIONS.map(option => option.id),
]);

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHANNEL_ICON_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const store: Record<string, string> = {};
    for (const [channelId, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && VALID_ICON_IDS.has(value)) store[channelId] = value;
    }
    return store;
  } catch {
    return {};
  }
}

export function getDefaultChannelIconName(mode?: string | null): string {
  return DEFAULT_ICONS[mode || 'social'] ?? DEFAULT_ICONS.social;
}

export function getChannelIconName(channelId: string, mode?: string | null): string {
  return readStore()[channelId] ?? getDefaultChannelIconName(mode);
}

export function setChannelIconName(channelId: string, iconName: string): void {
  if (!VALID_ICON_IDS.has(iconName)) return;
  const store = readStore();
  store[channelId] = iconName;
  localStorage.setItem(CHANNEL_ICON_KEY, JSON.stringify(store));
}

export function applyLocalChannelIcons<T extends { id: string; mode?: string | null; iconName?: string }>(
  channels: T[],
): T[] {
  const store = readStore();
  return channels.map(channel => ({
    ...channel,
    iconName: channel.iconName ?? store[channel.id] ?? getDefaultChannelIconName(channel.mode),
  }));
}
