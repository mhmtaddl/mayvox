import { describe, it, expect } from 'vitest';
import { canonicalPair, interpretFriendshipResult } from '../dmFriendshipLogic';

describe('DM friendship — canonicalPair', () => {
  it('a < b → (a,b)', () => {
    expect(canonicalPair('alice', 'bob')).toEqual({ low: 'alice', high: 'bob' });
  });

  it('b < a → swap to (b,a)', () => {
    expect(canonicalPair('bob', 'alice')).toEqual({ low: 'alice', high: 'bob' });
  });

  it('simetrik: (a,b) ve (b,a) aynı sonucu döner', () => {
    expect(canonicalPair('u1', 'u2')).toEqual(canonicalPair('u2', 'u1'));
  });

  it('aynı ID → null (self-DM yok)', () => {
    expect(canonicalPair('alice', 'alice')).toBeNull();
  });

  it('boş string → null', () => {
    expect(canonicalPair('', 'bob')).toBeNull();
    expect(canonicalPair('alice', '')).toBeNull();
    expect(canonicalPair('   ', 'bob')).toBeNull();
  });

  it('string olmayan girdi → null (fail-closed)', () => {
    expect(canonicalPair(null, 'bob')).toBeNull();
    expect(canonicalPair('alice', undefined)).toBeNull();
    expect(canonicalPair(42, 'bob')).toBeNull();
    expect(canonicalPair({ id: 'x' }, 'bob')).toBeNull();
  });
});

describe('DM friendship — interpretFriendshipResult', () => {
  const pair = { low: 'alice', high: 'bob' };

  it('eşleşen satır → true', () => {
    expect(interpretFriendshipResult({ user_low_id: 'alice', user_high_id: 'bob' }, pair)).toBe(true);
  });

  it('null data → false', () => {
    expect(interpretFriendshipResult(null, pair)).toBe(false);
  });

  it('undefined data → false', () => {
    expect(interpretFriendshipResult(undefined, pair)).toBe(false);
  });

  it('boş array → false', () => {
    expect(interpretFriendshipResult([], pair)).toBe(false);
  });

  it('array tek satır eşleşirse → true', () => {
    expect(interpretFriendshipResult([{ user_low_id: 'alice', user_high_id: 'bob' }], pair)).toBe(true);
  });

  it('low ID uyumsuz → false (zehirlenmiş/yanlış satır)', () => {
    expect(interpretFriendshipResult({ user_low_id: 'eve', user_high_id: 'bob' }, pair)).toBe(false);
  });

  it('high ID uyumsuz → false', () => {
    expect(interpretFriendshipResult({ user_low_id: 'alice', user_high_id: 'mallory' }, pair)).toBe(false);
  });

  it('boş object → false', () => {
    expect(interpretFriendshipResult({} as any, pair)).toBe(false);
  });

  it('string data (schema bozuk) → false', () => {
    expect(interpretFriendshipResult('ok' as any, pair)).toBe(false);
  });
});
