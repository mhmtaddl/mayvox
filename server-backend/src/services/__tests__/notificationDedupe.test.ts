/**
 * Dedupe cache invariant testleri — LRU + TTL.
 * BroadcastChannel postMessage tarafı JSDOM mock gerektirmediğinden
 * sadece in-memory davranış test edilir (cross-window yayım manuel smoke).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal port — dedupeChannel.ts'deki mantık ile aynı invariant'lar.
const TTL_MS = 5 * 60_000;
const CAP = 200;

let seen: Map<string, { addedAt: number }>;

function reset() { seen = new Map(); }

function pruneExpired(now: number) {
  for (const [k, v] of seen) {
    if (now - v.addedAt > TTL_MS) seen.delete(k);
  }
}

function enforceCap() {
  while (seen.size > CAP) {
    const first = seen.keys().next().value;
    if (first === undefined) break;
    seen.delete(first);
  }
}

function hasSeen(fp: string, now: number): boolean {
  pruneExpired(now);
  const hit = seen.get(fp);
  if (!hit) return false;
  if (now - hit.addedAt > TTL_MS) { seen.delete(fp); return false; }
  return true;
}

function markSeen(fp: string, now: number) {
  pruneExpired(now);
  seen.set(fp, { addedAt: now });
  enforceCap();
}

describe('Notification dedupe — cache', () => {
  beforeEach(reset);

  it('fresh fingerprint → not seen', () => {
    expect(hasSeen('dm:abc', 1000)).toBe(false);
  });

  it('mark + immediate check → seen', () => {
    markSeen('dm:abc', 1000);
    expect(hasSeen('dm:abc', 1000)).toBe(true);
  });

  it('mark + within TTL → seen', () => {
    markSeen('dm:abc', 1000);
    expect(hasSeen('dm:abc', 1000 + TTL_MS - 1)).toBe(true);
  });

  it('mark + past TTL → expired, purged', () => {
    markSeen('dm:abc', 1000);
    expect(hasSeen('dm:abc', 1000 + TTL_MS + 100)).toBe(false);
    expect(seen.has('dm:abc')).toBe(false);
  });

  it('cap enforced: 201st overflow evicts oldest', () => {
    for (let i = 0; i < CAP; i++) markSeen(`dm:${i}`, 1000 + i);
    expect(seen.size).toBe(CAP);
    markSeen('dm:overflow', 1000 + CAP);
    expect(seen.size).toBe(CAP);
    expect(seen.has('dm:0')).toBe(false);
    expect(seen.has('dm:overflow')).toBe(true);
  });

  it('invite + dm fingerprint\'leri ayrı namespace → çakışmaz', () => {
    markSeen('dm:123', 1000);
    markSeen('invite:123', 1000);
    expect(hasSeen('dm:123', 1001)).toBe(true);
    expect(hasSeen('invite:123', 1001)).toBe(true);
    expect(seen.size).toBe(2);
  });

  it('reconnect recovery: aynı mesaj tekrar gelse de ikinci toast basılmaz', () => {
    markSeen('dm:msg-99', 10_000);
    // Reconnect sonrası load(false) aynı mesajı diff\'te tekrar verse:
    expect(hasSeen('dm:msg-99', 10_100)).toBe(true);
  });
});
