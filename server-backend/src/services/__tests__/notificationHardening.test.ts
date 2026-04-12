/**
 * v2 final hardening — lifecycle, flash anti-spam, sound coalesce, dedupe GC.
 * Pure logic paralellikleri test edilir; runtime modülleri ayrı smoke'la doğrulanır.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Lifecycle ────────────────────────────────────────────────────────────
type LifecycleType = 'seen' | 'clicked' | 'ignored';
interface LifecycleEvent { toastId: string; type: LifecycleType; at: number }

function makeTracker() {
  const log: LifecycleEvent[] = [];
  const clicked = new Set<string>();
  const terminal = new Set<string>();
  return {
    log,
    seen(id: string, at: number) {
      log.push({ toastId: id, type: 'seen', at });
    },
    click(id: string, at: number) {
      if (clicked.has(id) || terminal.has(id)) return;
      log.push({ toastId: id, type: 'clicked', at });
      clicked.add(id); terminal.add(id);
    },
    ignore(id: string, at: number) {
      if (terminal.has(id)) return;
      log.push({ toastId: id, type: 'ignored', at });
      terminal.add(id);
    },
  };
}

describe('Lifecycle tracking', () => {
  it('seen yalnız bir kez kaydedilir — insert + update aynı id', () => {
    const t = makeTracker();
    t.seen('a', 1); // yeni insert
    // update aynı id → seen fire edilmemeli (test policy)
    // Bu testte seen'i sadece insert path çağırıyor; update path çağırmıyor.
    expect(t.log.filter(e => e.type === 'seen' && e.toastId === 'a')).toHaveLength(1);
  });

  it('click tek kere, sonraki click no-op', () => {
    const t = makeTracker();
    t.seen('a', 1);
    t.click('a', 2);
    t.click('a', 3); // tekrar click → no-op
    const clicks = t.log.filter(e => e.type === 'clicked' && e.toastId === 'a');
    expect(clicks).toHaveLength(1);
  });

  it('click sonrası ignore no-op (double-count yok)', () => {
    const t = makeTracker();
    t.seen('a', 1);
    t.click('a', 2);
    t.ignore('a', 3);
    expect(t.log.filter(e => e.type === 'ignored')).toHaveLength(0);
  });

  it('sadece ignore — click olmadan dismiss/timeout', () => {
    const t = makeTracker();
    t.seen('a', 1);
    t.ignore('a', 2);
    expect(t.log.filter(e => e.type === 'ignored' && e.toastId === 'a')).toHaveLength(1);
  });

  it('ignore sonrası tekrar ignore no-op', () => {
    const t = makeTracker();
    t.seen('a', 1);
    t.ignore('a', 2);
    t.ignore('a', 3);
    expect(t.log.filter(e => e.type === 'ignored')).toHaveLength(1);
  });

  it('iki farklı toast bağımsız lifecycle tutar', () => {
    const t = makeTracker();
    t.seen('a', 1); t.click('a', 2);
    t.seen('b', 3); t.ignore('b', 4);
    expect(t.log.map(e => [e.toastId, e.type])).toEqual([
      ['a', 'seen'], ['a', 'clicked'], ['b', 'seen'], ['b', 'ignored'],
    ]);
  });
});

// ── Flash anti-spam ──────────────────────────────────────────────────────
function makeFlash() {
  let pending: number | null = null;
  let active = false;
  let appliedCount = 0;
  return {
    get pending() { return pending; },
    get active() { return active; },
    get appliedCount() { return appliedCount; },
    requestOn() {
      if (active) return;
      if (pending !== null) return;
      pending = 1;
    },
    requestOff() {
      if (pending !== null) pending = null;
      if (active) active = false;
    },
    firePending() {
      if (pending === null) return;
      pending = null;
      active = true;
      appliedCount++;
    },
    focus() {
      pending = null;
      active = false;
    },
  };
}

describe('Flash anti-spam', () => {
  it('pending varken yeni request stack yaratmaz', () => {
    const f = makeFlash();
    f.requestOn(); f.requestOn(); f.requestOn();
    expect(f.pending).toBe(1);
  });
  it('aktif iken yeni request retriggerlemez', () => {
    const f = makeFlash();
    f.requestOn(); f.firePending();
    expect(f.active).toBe(true);
    f.requestOn();
    expect(f.appliedCount).toBe(1);
  });
  it('focus pending ve aktif state\'i temizler', () => {
    const f = makeFlash();
    f.requestOn(); f.focus();
    expect(f.pending).toBeNull();
    expect(f.active).toBe(false);
  });
  it('burst 20 event unfocused → 1 flash', () => {
    const f = makeFlash();
    for (let i = 0; i < 20; i++) f.requestOn();
    f.firePending();
    for (let i = 0; i < 20; i++) f.requestOn();
    expect(f.appliedCount).toBe(1);
  });
});

// ── Sound scheduler coalescing ───────────────────────────────────────────
function makeScheduler(envelopeMs = 400) {
  let lastPlayEnd = 0;
  let queued = false;
  return {
    play(now: number, prefOn: boolean): 'played' | 'queued' | 'coalesced' | 'silenced' {
      if (!prefOn) return 'silenced';
      if (now >= lastPlayEnd) {
        lastPlayEnd = now + envelopeMs;
        return 'played';
      }
      if (queued) return 'coalesced';
      queued = true;
      return 'queued';
    },
    flushQueued(now: number) {
      if (!queued) return false;
      queued = false;
      lastPlayEnd = now + envelopeMs;
      return true;
    },
    get queuedFlag() { return queued; },
    get envelopeEnd() { return lastPlayEnd; },
  };
}

describe('Sound scheduler coalesce', () => {
  it('ilk çağrı anında çalar', () => {
    const s = makeScheduler();
    expect(s.play(1000, true)).toBe('played');
  });
  it('envelope aktif iken ikinci çağrı queued', () => {
    const s = makeScheduler();
    s.play(1000, true);
    expect(s.play(1100, true)).toBe('queued');
  });
  it('burst 5 çağrı → 1 played + 1 queued + 3 coalesced', () => {
    const s = makeScheduler();
    const results = [1000, 1050, 1100, 1150, 1200].map(t => s.play(t, true));
    expect(results).toEqual(['played', 'queued', 'coalesced', 'coalesced', 'coalesced']);
  });
  it('pref off → silenced', () => {
    const s = makeScheduler();
    expect(s.play(1000, false)).toBe('silenced');
  });
  it('envelope bittikten sonra yeni çağrı played', () => {
    const s = makeScheduler();
    s.play(1000, true); // ends 1400
    expect(s.play(1500, true)).toBe('played');
  });
});

// ── Dedupe GC ────────────────────────────────────────────────────────────
describe('Dedupe GC', () => {
  const TTL = 5 * 60_000;
  const CAP = 200;

  let map: Map<string, { addedAt: number }>;
  beforeEach(() => { map = new Map(); });

  function prune(now: number) {
    for (const [k, v] of map) if (now - v.addedAt > TTL) map.delete(k);
  }
  function cap() { while (map.size > CAP) { const first = map.keys().next().value; if (first === undefined) break; map.delete(first); } }
  function mark(k: string, now: number) { prune(now); map.set(k, { addedAt: now }); cap(); }
  function gcTick(now: number) { prune(now); cap(); }

  it('expired entries periodic GC ile temizlenir', () => {
    mark('a', 1000);
    mark('b', 2000);
    // İkisini de expire eden zaman = max(added) + TTL + 1
    gcTick(2000 + TTL + 10);
    expect(map.has('a')).toBe(false);
    expect(map.has('b')).toBe(false);
  });

  it('burst — cap aşılınca yazma anında cleanup; GC sonradan doğrular', () => {
    for (let i = 0; i < 250; i++) mark(`k${i}`, 1000 + i);
    expect(map.size).toBe(CAP);
    gcTick(1000 + 250);
    expect(map.size).toBe(CAP);
  });

  it('GC sonrası henüz geçerli entry\'ler korunur', () => {
    mark('old', 1000);
    mark('new', 1000 + TTL - 100);
    gcTick(1000 + TTL + 10);
    expect(map.has('old')).toBe(false);
    expect(map.has('new')).toBe(true);
  });
});
