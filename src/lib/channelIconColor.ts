const CHANNEL_ICON_COLOR_KEY = 'mayvox:channel-icon-color:v1';

export const CHANNEL_ICON_COLOR_OPTIONS = [
  { id: 'sky', label: 'Mavi', value: '#38bdf8' },
  { id: 'emerald', label: 'Yeşil', value: '#34d399' },
  { id: 'rose', label: 'Pembe', value: '#fb7185' },
  { id: 'violet', label: 'Mor', value: '#c4b5fd' },
  { id: 'amber', label: 'Sarı', value: '#fbbf24' },
  { id: 'orange', label: 'Turuncu', value: '#fb923c' },
] as const;

const DEFAULT_ICON_COLORS: Record<string, string> = {
  social: '#38bdf8',
  gaming: '#34d399',
  broadcast: '#fb7185',
  quiet: '#c4b5fd',
};

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHANNEL_ICON_COLOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const store: Record<string, string> = {};
    for (const [channelId, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && isValidIconColor(value)) store[channelId] = value;
    }
    return store;
  } catch {
    return {};
  }
}

function isValidIconColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

export function getDefaultChannelIconColor(mode?: string | null): string {
  return DEFAULT_ICON_COLORS[mode || 'social'] ?? DEFAULT_ICON_COLORS.social;
}

export function getChannelIconColor(channelId: string, mode?: string | null): string {
  return readStore()[channelId] ?? getDefaultChannelIconColor(mode);
}

export function setChannelIconColor(channelId: string, color: string): void {
  if (!isValidIconColor(color)) return;
  const store = readStore();
  store[channelId] = color;
  localStorage.setItem(CHANNEL_ICON_COLOR_KEY, JSON.stringify(store));
}

export function applyLocalChannelIconColors<T extends { id: string; mode?: string | null; iconColor?: string }>(
  channels: T[],
): T[] {
  const store = readStore();
  return channels.map(channel => ({
    ...channel,
    iconColor: channel.iconColor ?? store[channel.id] ?? getDefaultChannelIconColor(channel.mode),
  }));
}
