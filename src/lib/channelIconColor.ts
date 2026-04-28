const CHANNEL_ICON_COLOR_KEY = 'mayvox:channel-icon-color:v1';

export const CHANNEL_ICON_COLOR_OPTIONS = [
  { id: 'blue', label: 'Blue', value: '#38bdf8' },
  { id: 'emerald', label: 'Emerald', value: '#34d399' },
  { id: 'amber', label: 'Amber', value: '#f59e0b' },
  { id: 'crimson', label: 'Crimson', value: '#f43f5e' },
  { id: 'graphite', label: 'Graphite', value: '#94a3b8' },
  { id: 'aurora', label: 'Aurora', value: '#a78bfa' },
] as const;

const DEFAULT_ICON_COLORS: Record<string, string> = {
  social: '#38bdf8',
  gaming: '#34d399',
  broadcast: '#f43f5e',
  quiet: '#a78bfa',
};

const VALID_ICON_COLORS = new Set(CHANNEL_ICON_COLOR_OPTIONS.map(option => option.value.toLowerCase()));

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
  return VALID_ICON_COLORS.has(color.toLowerCase());
}

export function getDefaultChannelIconColor(mode?: string | null): string {
  return DEFAULT_ICON_COLORS[mode || 'social'] ?? DEFAULT_ICON_COLORS.social;
}

export function normalizeChannelIconColor(color: string | undefined | null, mode?: string | null): string {
  return color && isValidIconColor(color) ? color : getDefaultChannelIconColor(mode);
}

export function getChannelIconColor(channelId: string, mode?: string | null): string {
  return normalizeChannelIconColor(readStore()[channelId], mode);
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
    iconColor: normalizeChannelIconColor(channel.iconColor ?? store[channel.id], channel.mode),
  }));
}
