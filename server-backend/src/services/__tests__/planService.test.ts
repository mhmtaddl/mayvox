import { describe, it, expect } from 'vitest';
import { PLAN_CONFIG, normalizePlan, getPlanLimits } from '../planService';

describe('planService — plan resolution', () => {
  it('free plan limits — spec sayıları', () => {
    const l = PLAN_CONFIG.free;
    expect(l.maxChannels).toBe(10);
    expect(l.maxMembers).toBe(50);
    expect(l.maxPrivateChannels).toBe(3);
    expect(l.maxInviteLinksPerDay).toBe(20);
  });

  it('pro plan limits — spec sayıları', () => {
    const l = PLAN_CONFIG.pro;
    expect(l.maxChannels).toBe(100);
    expect(l.maxMembers).toBe(500);
    expect(l.maxPrivateChannels).toBe(50);
    expect(l.maxInviteLinksPerDay).toBe(500);
  });
});

describe('planService — normalizePlan', () => {
  it('null/undefined → free', () => {
    expect(normalizePlan(null)).toBe('free');
    expect(normalizePlan(undefined)).toBe('free');
  });

  it('unknown string → free (warn bir kez)', () => {
    expect(normalizePlan('banana')).toBe('free');
    expect(normalizePlan('')).toBe('free');
  });

  it('free → free', () => {
    expect(normalizePlan('free')).toBe('free');
  });

  it('pro → pro', () => {
    expect(normalizePlan('pro')).toBe('pro');
  });

  it('ultra → ultra (explicit tier, silent downgrade kalktı)', () => {
    expect(normalizePlan('ultra')).toBe('ultra');
  });
});

describe('planService — getPlanLimits', () => {
  it('free için free config döner', () => {
    expect(getPlanLimits('free')).toEqual(PLAN_CONFIG.free);
  });

  it('pro için pro config döner', () => {
    expect(getPlanLimits('pro')).toEqual(PLAN_CONFIG.pro);
  });

  it('ultra için ultra config döner (dedicated tier)', () => {
    expect(getPlanLimits('ultra')).toEqual(PLAN_CONFIG.ultra);
  });
});

describe('planService — ultra tier explicit', () => {
  it('ultra limits pro limits\'ten büyük', () => {
    expect(PLAN_CONFIG.ultra.maxChannels).toBeGreaterThan(PLAN_CONFIG.pro.maxChannels);
    expect(PLAN_CONFIG.ultra.maxMembers).toBeGreaterThan(PLAN_CONFIG.pro.maxMembers);
    expect(PLAN_CONFIG.ultra.maxPrivateChannels).toBeGreaterThan(PLAN_CONFIG.pro.maxPrivateChannels);
    expect(PLAN_CONFIG.ultra.maxInviteLinksPerDay).toBeGreaterThan(PLAN_CONFIG.pro.maxInviteLinksPerDay);
  });

  it('ultra değerleri explicit spec: 500/2000/200/2000', () => {
    expect(PLAN_CONFIG.ultra).toEqual({
      maxChannels: 500,
      maxMembers: 2000,
      maxPrivateChannels: 200,
      maxInviteLinksPerDay: 2000,
    });
  });
});

describe('planService — Math.min(capacity, maxMembers) semantic', () => {
  it('capacity daha küçükse capacity uygulanır', () => {
    const plan = getPlanLimits('pro'); // maxMembers=500
    const serverCapacity = 100;
    const effective = Math.min(serverCapacity, plan.maxMembers);
    expect(effective).toBe(100);
  });

  it('maxMembers daha küçükse maxMembers uygulanır (free plan büyük sunucuda)', () => {
    const plan = getPlanLimits('free'); // maxMembers=50
    const serverCapacity = 240;
    const effective = Math.min(serverCapacity, plan.maxMembers);
    expect(effective).toBe(50);
  });
});
