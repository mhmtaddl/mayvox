/**
 * Notification Intelligence v3 — policy engine decision testleri.
 * policyEngine.ts saf fonksiyon; fatigue + adaptive + mode yolları kapsanır.
 *
 * Not: Frontend modüllerine server-backend testinden doğrudan import sorun olabileceği için
 * saf mantık paritesi burada duplicate ediliyor — invariant CI'da yakalanır.
 */
import { describe, it, expect } from 'vitest';

// ── Types ────────────────────────────────────────────────────────────────
type Tier = 'NONE' | 'PASSIVE' | 'ACTIVE' | 'URGENT';
type Mode = 'NORMAL' | 'FOCUS' | 'VOICE_PRIORITY' | 'QUIET';
type Intent = 'direct_dm' | 'invite' | 'mention' | 'room_relevant' | 'passive_social' | 'system_info' | 'system_warning';

interface Ctx {
  isAppFocused: boolean; isWindowVisible: boolean;
  dmPanelOpen: boolean; activeDmConvKey: string | null; dmAtBottom: boolean;
  activeServerId: string | null; currentUserId: string | null;
  isUserSpeaking: boolean; isInVoiceRoom: boolean; isPttActive: boolean;
  isMuted: boolean; isDeafened: boolean;
  mode: Mode;
}

interface Stats {
  notifLastMinute: number; soundLastMinute: number; urgentLast10Min: number;
  ignoredRateByIntent: Partial<Record<Intent, number>>;
  clickedRateByIntent: Partial<Record<Intent, number>>;
}

interface Decision {
  shouldNotify: boolean; attentionTier: Tier;
  visualMode: 'none' | 'toast-subtle' | 'toast' | 'badge';
  sound: 'none' | 'subtle'; flash: boolean;
  reason: string;
}

// ── Port of policyEngine logic ───────────────────────────────────────────
const RANK: Record<Tier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
const BY_RANK: Tier[] = ['NONE', 'PASSIVE', 'ACTIVE', 'URGENT'];
const BASE: Record<Intent, { base: Tier; ceiling: Tier }> = {
  direct_dm:       { base: 'ACTIVE',  ceiling: 'URGENT' },
  invite:          { base: 'ACTIVE',  ceiling: 'ACTIVE' },
  mention:         { base: 'ACTIVE',  ceiling: 'URGENT' },
  room_relevant:   { base: 'PASSIVE', ceiling: 'ACTIVE' },
  passive_social:  { base: 'PASSIVE', ceiling: 'PASSIVE' },
  system_info:     { base: 'PASSIVE', ceiling: 'ACTIVE' },
  system_warning:  { base: 'ACTIVE',  ceiling: 'URGENT' },
};
const FATIGUE = { NOTIF_HIGH: 5, SOUND_HIGH: 3, URGENT_MAX: 2 } as const;

function down(t: Tier, n = 1): Tier { return BY_RANK[Math.max(0, RANK[t] - n)]; }
function cap(t: Tier, ceil: Tier): Tier { return RANK[t] > RANK[ceil] ? ceil : t; }

function applyMode(t: Tier, mode: Mode, inVoiceActive: boolean, inVoicePassive: boolean): Tier {
  if (mode === 'FOCUS') {
    if (t === 'URGENT') return 'ACTIVE';
    if (t === 'ACTIVE') return 'PASSIVE';
    return t;
  }
  if (mode === 'VOICE_PRIORITY') {
    if (inVoiceActive) return down(t, 2);
    if (inVoicePassive) return down(t, 1);
    return t;
  }
  if (mode === 'QUIET') {
    if (t === 'URGENT' || t === 'ACTIVE') return 'PASSIVE';
    return t;
  }
  return t;
}

function resolveMode(c: Ctx): Mode {
  if (c.mode !== 'NORMAL') return c.mode;
  if (c.isUserSpeaking || c.isInVoiceRoom) return 'VOICE_PRIORITY';
  return 'NORMAL';
}

function modalityFor(t: Tier): { visualMode: Decision['visualMode']; sound: Decision['sound']; flashCandidate: boolean } {
  if (t === 'NONE')    return { visualMode: 'none', sound: 'none', flashCandidate: false };
  if (t === 'PASSIVE') return { visualMode: 'toast-subtle', sound: 'none', flashCandidate: false };
  if (t === 'ACTIVE')  return { visualMode: 'toast', sound: 'subtle', flashCandidate: false };
  return { visualMode: 'toast', sound: 'subtle', flashCandidate: true };
}

function decide(ev: { intent: Intent; subjectId?: string }, c: Ctx, s: Stats): Decision {
  const meta = BASE[ev.intent];
  // Hard suppression
  if (ev.intent === 'direct_dm'
      && c.isAppFocused && c.dmPanelOpen
      && c.activeDmConvKey === ev.subjectId && c.dmAtBottom) {
    return { shouldNotify: false, attentionTier: 'NONE', visualMode: 'none', sound: 'none', flash: false, reason: 'suppress:same-dm-bottom' };
  }
  if (ev.intent === 'invite'
      && c.isAppFocused && !!ev.subjectId && c.activeServerId === ev.subjectId) {
    return { shouldNotify: false, attentionTier: 'NONE', visualMode: 'none', sound: 'none', flash: false, reason: 'suppress:same-server' };
  }

  let tier: Tier = meta.base;
  const ignored = s.ignoredRateByIntent[ev.intent] ?? 0;

  // Scroll-up passive
  if (ev.intent === 'direct_dm' && c.isAppFocused && c.dmPanelOpen
      && c.activeDmConvKey === ev.subjectId && !c.dmAtBottom) {
    tier = 'PASSIVE';
  }

  // Adaptive soften
  if (ignored >= 0.8) tier = down(tier, 1);

  // Fatigue notif
  if (s.notifLastMinute >= FATIGUE.NOTIF_HIGH) tier = down(tier, 1);

  // Ceiling
  tier = cap(tier, meta.ceiling);

  // Mode
  const mode = resolveMode(c);
  tier = applyMode(tier, mode, c.isUserSpeaking, c.isInVoiceRoom && !c.isUserSpeaking);

  // Voice active soften
  if (c.isUserSpeaking && tier === 'ACTIVE') tier = 'PASSIVE';

  if (tier === 'NONE') return { shouldNotify: false, attentionTier: 'NONE', visualMode: 'none', sound: 'none', flash: false, reason: 'none' };

  const m = modalityFor(tier);
  let sound = m.sound;
  let flash = m.flashCandidate;
  if (sound !== 'none' && s.soundLastMinute >= FATIGUE.SOUND_HIGH) sound = 'none';
  if (sound !== 'none' && ignored >= 0.6) sound = 'none';
  if (flash && s.urgentLast10Min >= FATIGUE.URGENT_MAX) flash = false;
  if (flash && (c.isUserSpeaking || c.isInVoiceRoom)) flash = false;

  return { shouldNotify: true, attentionTier: tier, visualMode: m.visualMode, sound, flash, reason: `${ev.intent}:${tier}` };
}

// ── Fixtures ─────────────────────────────────────────────────────────────
const baseCtx: Ctx = {
  isAppFocused: true, isWindowVisible: true,
  dmPanelOpen: false, activeDmConvKey: null, dmAtBottom: true,
  activeServerId: null, currentUserId: 'me',
  isUserSpeaking: false, isInVoiceRoom: false, isPttActive: false,
  isMuted: false, isDeafened: false, mode: 'NORMAL',
};
const zeroStats: Stats = {
  notifLastMinute: 0, soundLastMinute: 0, urgentLast10Min: 0,
  ignoredRateByIntent: {}, clickedRateByIntent: {},
};

// ── Tests ────────────────────────────────────────────────────────────────
describe('Intelligence — DM suppression', () => {
  it('focused + DM panel + same conv + atBottom → NONE', () => {
    const d = decide(
      { intent: 'direct_dm', subjectId: 'dm:a:b' },
      { ...baseCtx, dmPanelOpen: true, activeDmConvKey: 'dm:a:b', dmAtBottom: true },
      zeroStats,
    );
    expect(d.shouldNotify).toBe(false);
  });

  it('focused + same conv + scrolled up → PASSIVE (görsel var, ses yok)', () => {
    const d = decide(
      { intent: 'direct_dm', subjectId: 'dm:a:b' },
      { ...baseCtx, dmPanelOpen: true, activeDmConvKey: 'dm:a:b', dmAtBottom: false },
      zeroStats,
    );
    expect(d.shouldNotify).toBe(true);
    expect(d.attentionTier).toBe('PASSIVE');
    expect(d.sound).toBe('none');
    expect(d.flash).toBe(false);
  });

  it('backgrounded + düşük fatigue → ACTIVE + subtle ses', () => {
    const d = decide(
      { intent: 'direct_dm', subjectId: 'dm:x:y' },
      { ...baseCtx, isAppFocused: false, isWindowVisible: false },
      zeroStats,
    );
    expect(d.attentionTier).toBe('ACTIVE');
    expect(d.sound).toBe('subtle');
  });
});

describe('Intelligence — Voice-first', () => {
  it('actively speaking + invite → VOICE_PRIORITY auto mode; tier down', () => {
    const d = decide(
      { intent: 'invite' },
      { ...baseCtx, isUserSpeaking: true, isInVoiceRoom: true },
      zeroStats,
    );
    // base ACTIVE → VOICE_PRIORITY speaking → 2 step down → NONE
    expect(d.attentionTier).toBe('NONE');
    expect(d.shouldNotify).toBe(false);
  });

  it('in voice passive + DM → ACTIVE değil, PASSIVE seviyede', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isInVoiceRoom: true, isUserSpeaking: false },
      zeroStats,
    );
    // VOICE_PRIORITY auto → passive → 1 step down → PASSIVE
    expect(d.attentionTier).toBe('PASSIVE');
    expect(d.sound).toBe('none');
    expect(d.flash).toBe(false);
  });

  it('voice room → flash hiçbir zaman tetiklenmez', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isAppFocused: false, isInVoiceRoom: true },
      zeroStats,
    );
    expect(d.flash).toBe(false);
  });
});

describe('Intelligence — Fatigue', () => {
  it('notif fatigue yüksek → ACTIVE → PASSIVE', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isAppFocused: false },
      { ...zeroStats, notifLastMinute: 6 },
    );
    expect(d.attentionTier).toBe('PASSIVE');
  });

  it('sound fatigue yüksek → ACTIVE kalır ama ses kapanır', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isAppFocused: false },
      { ...zeroStats, soundLastMinute: 3 },
    );
    expect(d.attentionTier).toBe('ACTIVE');
    expect(d.sound).toBe('none');
  });

  it('urgent saturated → flash bastırılır', () => {
    const d = decide(
      { intent: 'system_warning' },
      { ...baseCtx, isAppFocused: false },
      { ...zeroStats, urgentLast10Min: 2 },
    );
    expect(d.flash).toBe(false);
  });
});

describe('Intelligence — Adaptive memory', () => {
  it('invite ignored rate ≥ 0.8 → PASSIVE + ses yok', () => {
    const d = decide(
      { intent: 'invite' },
      { ...baseCtx, isAppFocused: false },
      { ...zeroStats, ignoredRateByIntent: { invite: 0.85 } },
    );
    expect(d.attentionTier).toBe('PASSIVE');
    expect(d.sound).toBe('none');
  });

  it('DM ignored 0.65 — tier aynı, ses kapanır (mid threshold)', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isAppFocused: false },
      { ...zeroStats, ignoredRateByIntent: { direct_dm: 0.65 } },
    );
    expect(d.attentionTier).toBe('ACTIVE');
    expect(d.sound).toBe('none');
  });
});

describe('Intelligence — Modes', () => {
  it('FOCUS: ACTIVE → PASSIVE', () => {
    const d = decide(
      { intent: 'direct_dm' },
      { ...baseCtx, isAppFocused: false, mode: 'FOCUS' },
      zeroStats,
    );
    expect(d.attentionTier).toBe('PASSIVE');
  });

  it('QUIET: URGENT → PASSIVE', () => {
    const d = decide(
      { intent: 'system_warning' },
      { ...baseCtx, isAppFocused: false, mode: 'QUIET' },
      zeroStats,
    );
    expect(d.attentionTier).toBe('PASSIVE');
    expect(d.flash).toBe(false);
  });
});

describe('Intelligence — Same-context suppression', () => {
  it('invite + same server + focused → NONE', () => {
    const d = decide(
      { intent: 'invite', subjectId: 'srv1' },
      { ...baseCtx, activeServerId: 'srv1' },
      zeroStats,
    );
    expect(d.shouldNotify).toBe(false);
  });

  it('invite + different server → ACTIVE', () => {
    const d = decide(
      { intent: 'invite', subjectId: 'srv1' },
      { ...baseCtx, activeServerId: 'srv2' },
      zeroStats,
    );
    expect(d.attentionTier).toBe('ACTIVE');
  });
});
