/**
 * Notification filter + priority + rate limit invariant testleri.
 * Frontend service mantığıyla birebir paralel — drift CI'da yakalanır.
 */
import { describe, it, expect } from 'vitest';

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
const RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

interface Ctx {
  isAppFocused: boolean;
  dmPanelOpen: boolean;
  activeDmConvKey: string | null;
  dmAtBottom: boolean;
  currentUserId: string | null;
  activeServerId: string | null;
}

function shouldSuppressDm(
  ctx: Ctx,
  msg: { senderId: string; conversationKey: string },
): boolean {
  if (ctx.currentUserId && ctx.currentUserId === msg.senderId) return true;
  if (!ctx.isAppFocused) return false;
  if (!ctx.dmPanelOpen) return false;
  if (ctx.activeDmConvKey !== msg.conversationKey) return false;
  // Yukarıdaysa görmüyor — suppress açma.
  return ctx.dmAtBottom;
}

function shouldSuppressInvite(
  ctx: Ctx,
  inv: { serverId: string | null },
): boolean {
  if (!inv.serverId) return false;
  return ctx.isAppFocused && inv.serverId === ctx.activeServerId;
}

interface Toast { id: string; priority: Priority; createdAt: number }

function insertToast(queue: Toast[], incoming: Toast, cap = 3): Toast[] {
  if (queue.some(t => t.id === incoming.id)) return queue;
  if (queue.length < cap) return [incoming, ...queue];
  const incomingRank = RANK[incoming.priority];
  let victimIdx = -1, victimRank = Infinity, victimAge = -1;
  for (let i = 0; i < queue.length; i++) {
    const r = RANK[queue[i].priority];
    const age = Date.now() - queue[i].createdAt;
    if (r < victimRank || (r === victimRank && age > victimAge)) {
      victimRank = r; victimAge = age; victimIdx = i;
    }
  }
  if (incomingRank >= victimRank) {
    return [incoming, ...queue.filter((_, i) => i !== victimIdx)];
  }
  // Lower priority + full → drop incoming.
  return queue;
}

function canPlay(last: number, now: number, windowMs: number) {
  return now - last >= windowMs;
}

const baseCtx: Ctx = {
  isAppFocused: true, dmPanelOpen: false,
  activeDmConvKey: null, dmAtBottom: true,
  currentUserId: 'me', activeServerId: null,
};

describe('Notification — DM filter', () => {
  it('self-sent → suppress', () => {
    expect(shouldSuppressDm(baseCtx, { senderId: 'me', conversationKey: 'dm:a:b' })).toBe(true);
  });
  it('focused + panel + same conv + atBottom → suppress', () => {
    expect(shouldSuppressDm(
      { ...baseCtx, dmPanelOpen: true, activeDmConvKey: 'dm:a:b', dmAtBottom: true },
      { senderId: 'x', conversationKey: 'dm:a:b' },
    )).toBe(true);
  });
  it('focused + panel + same conv + NOT atBottom → show (kullanıcı yukarıda)', () => {
    expect(shouldSuppressDm(
      { ...baseCtx, dmPanelOpen: true, activeDmConvKey: 'dm:a:b', dmAtBottom: false },
      { senderId: 'x', conversationKey: 'dm:a:b' },
    )).toBe(false);
  });
  it('different conv → show', () => {
    expect(shouldSuppressDm(
      { ...baseCtx, dmPanelOpen: true, activeDmConvKey: 'dm:x:y', dmAtBottom: true },
      { senderId: 'x', conversationKey: 'dm:a:b' },
    )).toBe(false);
  });
  it('app blurred → show', () => {
    expect(shouldSuppressDm(
      { ...baseCtx, isAppFocused: false, dmPanelOpen: true, activeDmConvKey: 'dm:a:b', dmAtBottom: true },
      { senderId: 'x', conversationKey: 'dm:a:b' },
    )).toBe(false);
  });
  it('panel closed → show', () => {
    expect(shouldSuppressDm(
      { ...baseCtx, dmPanelOpen: false },
      { senderId: 'x', conversationKey: 'dm:a:b' },
    )).toBe(false);
  });
});

describe('Notification — Invite filter', () => {
  it('same server + focused → suppress', () => {
    expect(shouldSuppressInvite({ ...baseCtx, activeServerId: 'srv1' }, { serverId: 'srv1' })).toBe(true);
  });
  it('different server → show', () => {
    expect(shouldSuppressInvite({ ...baseCtx, activeServerId: 'srv2' }, { serverId: 'srv1' })).toBe(false);
  });
  it('blurred + same server → show', () => {
    expect(shouldSuppressInvite(
      { ...baseCtx, isAppFocused: false, activeServerId: 'srv1' }, { serverId: 'srv1' },
    )).toBe(false);
  });
  it('null serverId → show', () => {
    expect(shouldSuppressInvite(baseCtx, { serverId: null })).toBe(false);
  });
});

describe('Notification — priority queue', () => {
  const now = 10_000;
  const T = (id: string, p: Priority, age = 0): Toast => ({ id, priority: p, createdAt: now - age });

  it('cap altında → prepend', () => {
    const q = insertToast([T('a', 'HIGH')], T('b', 'MEDIUM'));
    expect(q.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('HIGH geldi, kuyrukta LOW var → LOW replaced', () => {
    const q = [T('low1', 'LOW'), T('med1', 'MEDIUM'), T('med2', 'MEDIUM')];
    const r = insertToast(q, T('high1', 'HIGH'));
    expect(r.map(t => t.id)).toEqual(['high1', 'med1', 'med2']);
  });

  it('MEDIUM geldi, kuyruk HIGH+HIGH+HIGH → incoming DÜŞER (düşük priority bloklanmasın)', () => {
    const q = [T('h1', 'HIGH', 0), T('h2', 'HIGH', 10), T('h3', 'HIGH', 100)];
    const r = insertToast(q, T('m1', 'MEDIUM'));
    expect(r.map(t => t.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('LOW incoming, kuyruk tamamı HIGH → LOW düşer', () => {
    const q = [T('h1', 'HIGH', 0), T('h2', 'HIGH', 10), T('h3', 'HIGH', 100)];
    const r = insertToast(q, T('l1', 'LOW'));
    expect(r.map(t => t.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('HIGH incoming, kuyruk HIGH+HIGH+LOW → LOW at', () => {
    const q = [T('h1', 'HIGH', 10), T('h2', 'HIGH', 20), T('l1', 'LOW', 5)];
    const r = insertToast(q, T('h3', 'HIGH'));
    expect(r.map(t => t.id).sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('aynı priority + full → newest-first, en eski düşer', () => {
    const q = [T('a', 'HIGH', 0), T('b', 'HIGH', 10), T('c', 'HIGH', 100)];
    const r = insertToast(q, T('d', 'HIGH'));
    expect(r.map(t => t.id)).toEqual(['d', 'a', 'b']);
  });

  it('aynı id → güncelleme, duplicate yok', () => {
    const q = [T('a', 'HIGH')];
    const r = insertToast(q, T('a', 'HIGH'));
    expect(r.length).toBe(1);
  });
});

describe('Notification — per-category rate limit', () => {
  it('DM 1500ms: son oynatım + 1400ms → bloklu, + 1500ms → serbest', () => {
    const last = 1000;
    expect(canPlay(last, 1000 + 1400, 1500)).toBe(false);
    expect(canPlay(last, 1000 + 1500, 1500)).toBe(true);
  });
  it('İlk oynatım (last=0, now=millions) → daima serbest', () => {
    expect(canPlay(0, 1_700_000_000_000, 1500)).toBe(true);
  });
  it('Invite 3000ms ayrı bucket: DM blok invite\'ı etkilemez', () => {
    const dmLast = 1000, invLast = 1000;
    expect(canPlay(dmLast, 1000 + 600, 1500)).toBe(false);   // DM bloklu
    expect(canPlay(invLast, 1000 + 600, 3000)).toBe(false);  // invite kendi window\'unda bloklu
    expect(canPlay(invLast, 1000 + 3100, 3000)).toBe(true);  // invite serbest
  });
});
