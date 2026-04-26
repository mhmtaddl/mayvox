const CHANNEL_ORDER_KEY = 'mayvox:channel-order:v1';

type ChannelOrderStore = Record<string, string[]>;

function readStore(): ChannelOrderStore {
  try {
    const raw = localStorage.getItem(CHANNEL_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChannelOrderStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setLocalChannelOrder(serverId: string, orderedIds: string[]) {
  const store = readStore();
  store[serverId] = orderedIds;
  localStorage.setItem(CHANNEL_ORDER_KEY, JSON.stringify(store));
}

export function applyLocalChannelOrder<T extends { id: string; position?: number }>(
  serverId: string,
  channels: T[],
): T[] {
  if (channels.every(channel => typeof channel.position === 'number')) {
    return [...channels].sort((a, b) => {
      if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0);
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  const order = readStore()[serverId];
  if (!order?.length) return channels;

  const indexById = new Map(order.map((id, index) => [id, index] as const));
  return [...channels]
    .sort((a, b) => {
      const ai = indexById.get(a.id);
      const bi = indexById.get(b.id);
      if (ai !== undefined || bi !== undefined) return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER);
      return (a.position ?? 0) - (b.position ?? 0);
    })
    .map((channel, index) => ({ ...channel, position: index }));
}
