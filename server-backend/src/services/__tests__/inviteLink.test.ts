import { describe, it, expect } from 'vitest';
import { generateInviteToken, hashInviteToken } from '../inviteLinkService';

describe('Invite V2 — token generation + hashing', () => {
  it('her token unique', () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateInviteToken());
    expect(set.size).toBe(200);
  });

  it('token yeterli entropi uzunluğunda (≥28 karakter)', () => {
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(28);
  });

  it('token base64url alfabesine uygun', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hash deterministik: aynı input → aynı hash', () => {
    const h1 = hashInviteToken('aaa');
    const h2 = hashInviteToken('aaa');
    expect(h1).toBe(h2);
  });

  it('hash sha256 hex (64 karakter)', () => {
    const h = hashInviteToken('something');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('farklı token → farklı hash', () => {
    const a = hashInviteToken(generateInviteToken());
    const b = hashInviteToken(generateInviteToken());
    expect(a).not.toBe(b);
  });
});

// State machine — computeState fonksiyonu module-private ama davranışı integration
// test olmadan doğrulamak zor. Input validation ve token format kontrolü yeterli
// smoke test olarak; state/accept flow'u integration test gerektirir (DB açık).
