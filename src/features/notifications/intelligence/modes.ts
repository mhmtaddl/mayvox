/**
 * Notification mode resolver + mode-based tier adjustments.
 *
 * Mode = user-selected veya auto-derived; policy engine tier'a dönüştürür.
 */

import type { AttentionTier, NotificationMode, PolicyContext, InteractionState } from './types';

const RANK: Record<AttentionTier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
const BY_RANK: AttentionTier[] = ['NONE', 'PASSIVE', 'ACTIVE', 'URGENT'];

function downgrade(tier: AttentionTier, steps = 1, floor: AttentionTier = 'NONE'): AttentionTier {
  const next = Math.max(RANK[floor], RANK[tier] - steps);
  return BY_RANK[next];
}

function cap(tier: AttentionTier, ceiling: AttentionTier): AttentionTier {
  return RANK[tier] > RANK[ceiling] ? ceiling : tier;
}

/**
 * Kullanıcı explicit mode seçmediyse context'ten türet.
 *   - isUserSpeaking → VOICE_PRIORITY
 *   - isInVoiceRoom → VOICE_PRIORITY
 *   - aksi halde NORMAL (kullanıcı FOCUS/QUIET'i explicit seçer)
 */
export function resolveEffectiveMode(ctx: PolicyContext): NotificationMode {
  if (ctx.mode === 'QUIET' || ctx.mode === 'FOCUS' || ctx.mode === 'VOICE_PRIORITY') return ctx.mode;
  if (ctx.isUserSpeaking || ctx.isInVoiceRoom) return 'VOICE_PRIORITY';
  return 'NORMAL';
}

/** Mode'a göre tier'ı kıs — calm over loud. */
export function applyModeAdjustment(
  tier: AttentionTier,
  mode: NotificationMode,
  interaction: InteractionState,
): AttentionTier {
  switch (mode) {
    case 'NORMAL':
      return tier;

    case 'FOCUS':
      // FOCUS: yalnız ACTIVE'e kadar; URGENT sadece system_warning gibi zorunlu durumlarda.
      // Burada kaba kural: URGENT → ACTIVE; ACTIVE → PASSIVE; PASSIVE aynı kalır.
      if (tier === 'URGENT') return 'ACTIVE';
      if (tier === 'ACTIVE') return 'PASSIVE';
      return tier;

    case 'VOICE_PRIORITY':
      // IN_VOICE_ACTIVE (konuşuyor) → agresif downgrade.
      if (interaction === 'IN_VOICE_ACTIVE') return downgrade(tier, 2);
      if (interaction === 'IN_VOICE_PASSIVE') return downgrade(tier, 1);
      return tier;

    case 'QUIET':
      // Hiçbir şey ACTIVE'i aşmaz; URGENT de PASSIVE'e düşer.
      if (tier === 'URGENT') return 'PASSIVE';
      if (tier === 'ACTIVE') return 'PASSIVE';
      return tier;
  }
}

export { cap as capTier, downgrade as downgradeTier };
