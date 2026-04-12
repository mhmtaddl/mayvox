import { describe, it, expect } from 'vitest';
import {
  checkRateLimit,
  isDuplicateSend,
  parseConvKey,
  otherParticipantOrNull,
} from '../dmRateLogic';

describe('DM rate limit — checkRateLimit (8 msg / 10 s)', () => {
  const MAX = 8, WIN = 10_000;

  it('boş bucket → izin ver, count=1', () => {
    const r = checkRateLimit(undefined, 1000, MAX, WIN);
    expect(r.exceeded).toBe(false);
    expect(r.next.count).toBe(1);
    expect(r.next.resetAt).toBe(11_000);
  });

  it('8. mesaja kadar geçer', () => {
    let b: any = undefined;
    const t0 = 1000;
    for (let i = 1; i <= 8; i++) {
      const r = checkRateLimit(b, t0 + i * 100, MAX, WIN);
      expect(r.exceeded).toBe(false);
      b = r.next;
    }
    expect(b.count).toBe(8);
  });

  it('9. mesaj window içinde → exceeded', () => {
    let b: any = undefined;
    for (let i = 1; i <= 9; i++) {
      const r = checkRateLimit(b, 1000 + i * 100, MAX, WIN);
      b = r.next;
      if (i < 9) expect(r.exceeded).toBe(false);
      else expect(r.exceeded).toBe(true);
    }
  });

  it('window dolunca reset → yeniden izin', () => {
    let b: any = undefined;
    for (let i = 0; i < 9; i++) b = checkRateLimit(b, 1000, MAX, WIN).next;
    // Window sonrası
    const r = checkRateLimit(b, 12_000, MAX, WIN);
    expect(r.exceeded).toBe(false);
    expect(r.next.count).toBe(1);
  });
});

describe('DM duplicate-send guard (~500ms)', () => {
  it('ilk mesaj → duplicate değil', () => {
    expect(isDuplicateSend(undefined, 'merhaba', 1000)).toBe(false);
  });

  it('aynı text + 200ms → duplicate', () => {
    expect(isDuplicateSend({ text: 'merhaba', at: 1000 }, 'merhaba', 1200)).toBe(true);
  });

  it('aynı text + 499ms → duplicate', () => {
    expect(isDuplicateSend({ text: 'x', at: 1000 }, 'x', 1499)).toBe(true);
  });

  it('aynı text + 501ms → OK', () => {
    expect(isDuplicateSend({ text: 'x', at: 1000 }, 'x', 1501)).toBe(false);
  });

  it('farklı text, kısa süre → OK', () => {
    expect(isDuplicateSend({ text: 'a', at: 1000 }, 'b', 1100)).toBe(false);
  });
});

describe('DM convKey — parseConvKey', () => {
  it('canonical format → parsed', () => {
    expect(parseConvKey('dm:alice:bob')).toEqual({ low: 'alice', high: 'bob' });
  });

  it('non-canonical order → null (schema check)', () => {
    expect(parseConvKey('dm:bob:alice')).toBeNull();
  });

  it('hatalı format → null', () => {
    expect(parseConvKey('alice:bob')).toBeNull();
    expect(parseConvKey('dm:alice')).toBeNull();
    expect(parseConvKey('dm::bob')).toBeNull();
    expect(parseConvKey('')).toBeNull();
  });

  it('self-pair → null', () => {
    expect(parseConvKey('dm:alice:alice')).toBeNull();
  });

  it('non-string → null', () => {
    expect(parseConvKey(null)).toBeNull();
    expect(parseConvKey(123)).toBeNull();
    expect(parseConvKey({})).toBeNull();
  });
});

describe('DM convKey — otherParticipantOrNull (membership)', () => {
  it('user low → returns high', () => {
    expect(otherParticipantOrNull('dm:alice:bob', 'alice')).toBe('bob');
  });

  it('user high → returns low', () => {
    expect(otherParticipantOrNull('dm:alice:bob', 'bob')).toBe('alice');
  });

  it('user pair dışında → null (spoof reddi)', () => {
    expect(otherParticipantOrNull('dm:alice:bob', 'mallory')).toBeNull();
  });

  it('bozuk convKey → null', () => {
    expect(otherParticipantOrNull('not-a-key', 'alice')).toBeNull();
  });

  it('empty userId → null', () => {
    expect(otherParticipantOrNull('dm:alice:bob', '')).toBeNull();
  });
});
