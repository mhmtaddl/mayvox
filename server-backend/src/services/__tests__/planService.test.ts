import { describe, it, expect } from 'vitest';
import { PLAN_CONFIG, normalizePlan, getPlanLimits } from '../planService';

/**
 * Yeni canonical (2026-04-19):
 *   free : 100 members · 4 sys + 0 extraPersistent = 4 total rooms
 *   pro  : 300 members · 4 sys + 2 extraPersistent = 6 total rooms
 *   ultra: 1500 members · 4 sys + 6 extraPersistent = 10 total rooms
 */

describe('planService — plan limits (canonical spec)', () => {
  it('free plan limits', () => {
    const l = PLAN_CONFIG.free;
    expect(l.maxMembers).toBe(100);
    expect(l.systemRooms).toBe(4);
    expect(l.extraPersistentRooms).toBe(0);
    expect(l.maxNonPersistentRooms).toBe(0);
    expect(l.maxTotalRooms).toBe(4);
    expect(l.systemRoomCapacity).toBe(15);
    expect(l.persistentRoomCapacity).toBe(20);
    expect(l.maxInviteLinksPerDay).toBe(20);
  });

  it('pro plan limits', () => {
    const l = PLAN_CONFIG.pro;
    expect(l.maxMembers).toBe(300);
    expect(l.systemRooms).toBe(4);
    expect(l.extraPersistentRooms).toBe(2);
    expect(l.maxTotalRooms).toBe(6);
    expect(l.systemRoomCapacity).toBe(25);
    expect(l.persistentRoomCapacity).toBe(35);
    expect(l.maxInviteLinksPerDay).toBe(100);
  });

  it('ultra plan limits', () => {
    const l = PLAN_CONFIG.ultra;
    expect(l.maxMembers).toBe(1500);
    expect(l.systemRooms).toBe(4);
    expect(l.extraPersistentRooms).toBe(6);
    expect(l.maxTotalRooms).toBe(10);
    expect(l.systemRoomCapacity).toBe(50);
    expect(l.persistentRoomCapacity).toBe(80);
    expect(l.maxInviteLinksPerDay).toBe(500);
  });

  it('maxTotalRooms = systemRooms + extraPersistentRooms + maxNonPersistentRooms', () => {
    for (const plan of ['free', 'pro', 'ultra'] as const) {
      const l = PLAN_CONFIG[plan];
      expect(l.maxTotalRooms).toBe(l.systemRooms + l.extraPersistentRooms + l.maxNonPersistentRooms);
    }
  });
});

describe('planService — normalizePlan', () => {
  it('null/undefined → free', () => {
    expect(normalizePlan(null)).toBe('free');
    expect(normalizePlan(undefined)).toBe('free');
  });

  it('unknown string → free', () => {
    expect(normalizePlan('banana')).toBe('free');
    expect(normalizePlan('')).toBe('free');
  });

  it('free/pro/ultra passthrough', () => {
    expect(normalizePlan('free')).toBe('free');
    expect(normalizePlan('pro')).toBe('pro');
    expect(normalizePlan('ultra')).toBe('ultra');
  });
});

describe('planService — getPlanLimits', () => {
  it('free için free config', () => {
    expect(getPlanLimits('free')).toEqual(PLAN_CONFIG.free);
  });
  it('pro için pro config', () => {
    expect(getPlanLimits('pro')).toEqual(PLAN_CONFIG.pro);
  });
  it('ultra için ultra config', () => {
    expect(getPlanLimits('ultra')).toEqual(PLAN_CONFIG.ultra);
  });
});

describe('planService — monotonic tier ladder', () => {
  it('ultra > pro > free in every scalar limit', () => {
    expect(PLAN_CONFIG.pro.maxMembers).toBeGreaterThan(PLAN_CONFIG.free.maxMembers);
    expect(PLAN_CONFIG.ultra.maxMembers).toBeGreaterThan(PLAN_CONFIG.pro.maxMembers);
    expect(PLAN_CONFIG.pro.extraPersistentRooms).toBeGreaterThan(PLAN_CONFIG.free.extraPersistentRooms);
    expect(PLAN_CONFIG.ultra.extraPersistentRooms).toBeGreaterThan(PLAN_CONFIG.pro.extraPersistentRooms);
    expect(PLAN_CONFIG.pro.systemRoomCapacity).toBeGreaterThan(PLAN_CONFIG.free.systemRoomCapacity);
    expect(PLAN_CONFIG.ultra.systemRoomCapacity).toBeGreaterThan(PLAN_CONFIG.pro.systemRoomCapacity);
    expect(PLAN_CONFIG.pro.persistentRoomCapacity).toBeGreaterThan(PLAN_CONFIG.free.persistentRoomCapacity);
    expect(PLAN_CONFIG.ultra.persistentRoomCapacity).toBeGreaterThan(PLAN_CONFIG.pro.persistentRoomCapacity);
  });

  it('systemRooms sabit 4, tüm planlarda', () => {
    expect(PLAN_CONFIG.free.systemRooms).toBe(4);
    expect(PLAN_CONFIG.pro.systemRooms).toBe(4);
    expect(PLAN_CONFIG.ultra.systemRooms).toBe(4);
  });
});

describe('planService — Math.min(capacity, maxMembers) semantic', () => {
  it('capacity daha küçükse capacity uygulanır', () => {
    const plan = getPlanLimits('pro');
    const serverCapacity = 100;
    expect(Math.min(serverCapacity, plan.maxMembers)).toBe(100);
  });

  it('maxMembers daha küçükse maxMembers uygulanır', () => {
    const plan = getPlanLimits('free'); // 100
    const serverCapacity = 240;
    expect(Math.min(serverCapacity, plan.maxMembers)).toBe(100);
  });
});
