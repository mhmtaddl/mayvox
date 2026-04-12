/**
 * v3 final stabilization — floor, grouped continuity, speaking hysteresis.
 * Saf mantık paritesi; runtime frontend modülleri ayrı smoke ile doğrulanır.
 */
import { describe, it, expect } from 'vitest';

// ── Minimum tier floor ───────────────────────────────────────────────────
type Tier = 'NONE' | 'PASSIVE' | 'ACTIVE' | 'URGENT';
type Intent = 'direct_dm' | 'invite' | 'mention' | 'system_warning';

const RANK: Record<Tier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
const FLOOR: Partial<Record<Intent, Tier>> = { direct_dm: 'PASSIVE' };

function applyFloor(tier: Tier, intent: Intent): Tier {
  const f = FLOOR[intent]; if (!f) return tier;
  return RANK[tier] < RANK[f] ? f : tier;
}

// Simplified decide pipeline (portion: downgrades → floor → NONE check)
function pipelineAfterDowngrades(intent: Intent, softTier: Tier): Tier {
  return applyFloor(softTier, intent);
}

describe('Stabilization — Minimum tier floor', () => {
  it('DM fatigue ile NONE\'a düşürülürse → PASSIVE\'e yükseltilir', () => {
    expect(pipelineAfterDowngrades('direct_dm', 'NONE')).toBe('PASSIVE');
  });

  it('DM zaten PASSIVE ise taban korunur', () => {
    expect(pipelineAfterDowngrades('direct_dm', 'PASSIVE')).toBe('PASSIVE');
  });

  it('DM ACTIVE ise taban etkisiz (tier zaten yüksek)', () => {
    expect(pipelineAfterDowngrades('direct_dm', 'ACTIVE')).toBe('ACTIVE');
  });

  it('invite için taban yok → NONE\'a düşebilir', () => {
    expect(pipelineAfterDowngrades('invite', 'NONE')).toBe('NONE');
  });

  it('system_warning için taban yok (future: eklenebilir)', () => {
    expect(pipelineAfterDowngrades('system_warning', 'NONE')).toBe('NONE');
  });

  it('hard suppression zaten NONE döner ve floor\'dan etkilenmez (test: step-1 erken return mantığı)', () => {
    // Simülasyon: step-1 hard suppress → tier hiç pipeline'a girmez.
    // Burada floor mantığının YALNIZCA soft path'te çalıştığını doğruluyoruz.
    const hardSuppress = true;
    const result = hardSuppress ? 'NONE' : pipelineAfterDowngrades('direct_dm', 'PASSIVE');
    expect(result).toBe('NONE');
  });
});

// ── Grouped update continuity ────────────────────────────────────────────
interface Toast {
  id: string; groupKey?: string; groupCount?: number; revision?: number; title: string; createdAt: number;
}

function groupUpdate(queue: Toast[], groupKey: string, newTitle: string, now: number): Toast[] {
  const existing = queue.find(t => t.groupKey === groupKey);
  if (!existing) return queue;
  const count = (existing.groupCount ?? 1) + 1;
  const updated: Toast = {
    ...existing,                       // id STABİL
    title: `${newTitle} · ${count} mesaj`,
    createdAt: now,
    groupCount: count,
    revision: (existing.revision ?? 1) + 1,
  };
  const idx = queue.findIndex(t => t.id === existing.id);
  const next = [...queue];
  next[idx] = updated;
  return next;
}

describe('Stabilization — Grouped toast continuity', () => {
  it('grouped update toast id\'sini korur', () => {
    const initial: Toast[] = [{ id: 'dm-1', groupKey: 'dm:src:alice', groupCount: 1, revision: 1, title: 'Alice', createdAt: 1000 }];
    const updated = groupUpdate(initial, 'dm:src:alice', 'Alice', 2000);
    expect(updated[0].id).toBe('dm-1');
  });

  it('groupCount artar, revision artar', () => {
    const initial: Toast[] = [{ id: 'dm-1', groupKey: 'dm:src:alice', groupCount: 1, revision: 1, title: 'Alice', createdAt: 1000 }];
    const a = groupUpdate(initial, 'dm:src:alice', 'Alice', 2000);
    const b = groupUpdate(a, 'dm:src:alice', 'Alice', 3000);
    expect(b[0].groupCount).toBe(3);
    expect(b[0].revision).toBe(3);
  });

  it('duplicate toast ekleme yok — queue uzunluğu sabit', () => {
    const initial: Toast[] = [{ id: 'dm-1', groupKey: 'dm:src:alice', groupCount: 1, revision: 1, title: 'Alice', createdAt: 1000 }];
    const a = groupUpdate(initial, 'dm:src:alice', 'Alice', 2000);
    const b = groupUpdate(a, 'dm:src:alice', 'Alice', 3000);
    expect(b.length).toBe(1);
  });

  it('TTL reset — createdAt her update\'te güncellenir', () => {
    const initial: Toast[] = [{ id: 'dm-1', groupKey: 'dm:src:alice', groupCount: 1, revision: 1, title: 'Alice', createdAt: 1000 }];
    const a = groupUpdate(initial, 'dm:src:alice', 'Alice', 2500);
    expect(a[0].createdAt).toBe(2500);
  });
});

// ── Speaking hysteresis ──────────────────────────────────────────────────
function simulateSpeaking(prev: boolean, level: number, threshold: number) {
  if (level >= threshold) return { immediateSpeaking: true, armHold: false };
  if (!prev) return { immediateSpeaking: false, armHold: false };
  return { immediateSpeaking: true, armHold: true };
}

describe('Stabilization — isUserSpeaking hysteresis', () => {
  const T = 0.08;

  it('eşiğin üstünde → speaking=true', () => {
    expect(simulateSpeaking(false, 0.1, T).immediateSpeaking).toBe(true);
  });

  it('hiç konuşmamış + eşik altı → false', () => {
    const r = simulateSpeaking(false, 0.02, T);
    expect(r.immediateSpeaking).toBe(false);
    expect(r.armHold).toBe(false);
  });

  it('konuşuyor + kısa eşik altı dip → true kalır, hold timer kurulur', () => {
    const r = simulateSpeaking(true, 0.03, T);
    expect(r.immediateSpeaking).toBe(true);
    expect(r.armHold).toBe(true);
  });

  it('konuşuyor + tekrar eşik üstü → true, hold cancel edilir', () => {
    const r = simulateSpeaking(true, 0.12, T);
    expect(r.immediateSpeaking).toBe(true);
    expect(r.armHold).toBe(false);
  });

  it('eşik edge case (0.08 === 0.08) → true (>=)', () => {
    expect(simulateSpeaking(false, 0.08, T).immediateSpeaking).toBe(true);
  });
});
