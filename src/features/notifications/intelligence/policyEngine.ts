/**
 * Notification Intelligence Engine v3 — policy decision.
 *
 * Saf fonksiyon: (event, ctx, stats) -> Decision.
 * if-else yangını yok; intent tabanlı küçük bloklar + mode adjuster + fatigue gate.
 *
 * Prensip: calm over loud. Yetersiz kanıt varsa DAHA AZ bildir, daha az ses, daha az flash.
 */

import type {
  NotificationEvent, PolicyContext, RecentStats,
  NotificationDecision, AttentionTier, EventIntent, Priority,
} from './types';
import { applyModeAdjustment, resolveEffectiveMode } from './modes';
import { groupKeyFor } from './grouping';
import { FATIGUE } from './fatigue';

/**
 * Over-suppression koruması — her intent için minimum tier tabanı.
 *
 * Neden: Fatigue + overloaded + adaptive soften birleşince bir DM
 * sessizce kaybolabilir. Kritik sinyaller için taban belirlenir.
 *
 * ÖNEMLİ: Bu taban YALNIZCA "soft downgrade"lara karşı koruma sağlar.
 * Hard suppression (same-DM-bottom, same-server) step-1'de early-return
 * eder ve bu tabanın etkisinden muaftır — kullanıcı zaten bakıyor.
 */
const MIN_TIER_FLOOR: Partial<Record<EventIntent, AttentionTier>> = {
  direct_dm: 'PASSIVE',
  // invite: kasten boş — yoğunlukta NONE'a düşebilir (same-server + low-priority senaryo)
  // future: mention → 'PASSIVE', system_warning → 'PASSIVE'
};

function applyMinimumFloor(tier: AttentionTier, intent: EventIntent): AttentionTier {
  const floor = MIN_TIER_FLOOR[intent];
  if (!floor) return tier;
  const rank: Record<AttentionTier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
  return rank[tier] < rank[floor] ? floor : tier;
}

// ── Intent taxonomy → base tier (mode+fatigue ile ayarlanır) ─────────────
const INTENT_BASE: Record<EventIntent, { base: AttentionTier; ceiling: AttentionTier; priority: Priority }> = {
  direct_dm:       { base: 'ACTIVE',  ceiling: 'URGENT',  priority: 'HIGH' },
  invite:          { base: 'ACTIVE',  ceiling: 'ACTIVE',  priority: 'MEDIUM' },
  mention:         { base: 'ACTIVE',  ceiling: 'URGENT',  priority: 'HIGH' },
  room_relevant:   { base: 'PASSIVE', ceiling: 'ACTIVE',  priority: 'MEDIUM' },
  passive_social:  { base: 'PASSIVE', ceiling: 'PASSIVE', priority: 'LOW' },
  system_info:     { base: 'PASSIVE', ceiling: 'ACTIVE',  priority: 'LOW' },
  system_warning:  { base: 'ACTIVE',  ceiling: 'URGENT',  priority: 'HIGH' },
};

// ── Helpers ───────────────────────────────────────────────────────────────

function sameDmActivelyViewing(ctx: PolicyContext, convKey?: string): boolean {
  return ctx.isAppFocused && ctx.dmPanelOpen &&
         ctx.activeDmConvKey === convKey && ctx.dmAtBottom;
}

function sameServerViewing(ctx: PolicyContext, serverId?: string): boolean {
  return ctx.isAppFocused && !!serverId && ctx.activeServerId === serverId;
}

function clampByCeiling(tier: AttentionTier, ceiling: AttentionTier): AttentionTier {
  const rank: Record<AttentionTier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
  const by: AttentionTier[] = ['NONE', 'PASSIVE', 'ACTIVE', 'URGENT'];
  return by[Math.min(rank[tier], rank[ceiling])];
}

function tierDown(tier: AttentionTier, steps = 1): AttentionTier {
  const rank: Record<AttentionTier, number> = { NONE: 0, PASSIVE: 1, ACTIVE: 2, URGENT: 3 };
  const by: AttentionTier[] = ['NONE', 'PASSIVE', 'ACTIVE', 'URGENT'];
  return by[Math.max(0, rank[tier] - steps)];
}

// ── Tier → modality mapping ──────────────────────────────────────────────

function modalityFor(tier: AttentionTier): { visualMode: NotificationDecision['visualMode']; sound: NotificationDecision['sound']; flashCandidate: boolean } {
  switch (tier) {
    case 'NONE':    return { visualMode: 'none', sound: 'none', flashCandidate: false };
    case 'PASSIVE': return { visualMode: 'toast-subtle', sound: 'none', flashCandidate: false };
    case 'ACTIVE':  return { visualMode: 'toast', sound: 'subtle', flashCandidate: false };
    case 'URGENT':  return { visualMode: 'toast', sound: 'subtle', flashCandidate: true };
  }
}

// ── Main decide ───────────────────────────────────────────────────────────

export function decide(event: NotificationEvent, ctx: PolicyContext, stats: RecentStats): NotificationDecision {
  const meta = INTENT_BASE[event.intent];
  const reasons: string[] = [];
  let tier: AttentionTier = meta.base;

  // 1) Hard context suppression — kullanıcı zaten bakıyor.
  if (event.intent === 'direct_dm' && sameDmActivelyViewing(ctx, event.subjectId)) {
    return {
      shouldNotify: false, attentionTier: 'NONE', visualMode: 'none',
      sound: 'none', flash: false,
      effectivePriority: meta.priority,
      reason: 'suppress:same-dm-focused-bottom',
    };
  }
  if (event.intent === 'invite' && sameServerViewing(ctx, event.subjectId)) {
    return {
      shouldNotify: false, attentionTier: 'NONE', visualMode: 'none',
      sound: 'none', flash: false,
      effectivePriority: meta.priority,
      reason: 'suppress:same-server-focused',
    };
  }

  // 2) Scroll-aware soften: aynı DM açık ama kullanıcı yukarıda → PASSIVE (sessiz görünür).
  if (event.intent === 'direct_dm' &&
      ctx.isAppFocused && ctx.dmPanelOpen &&
      ctx.activeDmConvKey === event.subjectId && !ctx.dmAtBottom) {
    tier = 'PASSIVE';
    reasons.push('scrolled-up-passive');
  }

  // 3) Backgrounded boost — default ACTIVE yeterli; yüksek priority intent için URGENT adayı yok,
  //    sadece fatigue düşükse bırak.
  if (!ctx.isAppFocused || !ctx.isWindowVisible) {
    reasons.push('backgrounded');
    // direct_dm zaten ACTIVE; burada agresif boost yok — calm-first.
  }

  // 4) Adaptive softening — ignored rate yüksek intent'leri düşür.
  const ignoredRate = stats.ignoredRateByIntent[event.intent] ?? 0;
  if (ignoredRate >= 0.8) {
    tier = tierDown(tier, 1);
    reasons.push(`adaptive-soften(ign=${ignoredRate.toFixed(2)})`);
  } else if (ignoredRate >= 0.6) {
    // Orta ignore → sound'ı kaldır (tier'ı değiştirmeden).
    reasons.push(`adaptive-mute-soft(ign=${ignoredRate.toFixed(2)})`);
  }

  // 5) Fatigue gate — yakın zamanda çok notif/ses varsa düşür.
  if (stats.notifLastMinute >= FATIGUE.NOTIF_HIGH) {
    tier = tierDown(tier, 1);
    reasons.push('fatigue:notif');
  }

  // 6) Apply ceiling.
  tier = clampByCeiling(tier, meta.ceiling);

  // 7) Mode adjustment (NORMAL / FOCUS / VOICE_PRIORITY / QUIET).
  const effectiveMode = resolveEffectiveMode(ctx);
  const beforeMode = tier;
  tier = applyModeAdjustment(tier, effectiveMode, ctx.interaction);
  if (tier !== beforeMode) reasons.push(`mode:${effectiveMode}->${tier}`);

  // 8) Voice-first override — aktif konuşuyorsa ACTIVE dahi PASSIVE'e in.
  if (ctx.isUserSpeaking && tier === 'ACTIVE') {
    tier = 'PASSIVE';
    reasons.push('voice-active-soften');
  }

  // 8.5) Minimum tier floor — soft downgrade'ler DM'yi yok edemez.
  //      Hard suppression (step 1) zaten erken return etti; buraya ulaşan
  //      her yol fatigue/adaptive/mode kaynaklıdır ve tabana tabi.
  const beforeFloor = tier;
  tier = applyMinimumFloor(tier, event.intent);
  if (tier !== beforeFloor) reasons.push(`floor:${beforeFloor}->${tier}`);

  // 9) NONE ise burada kes.
  if (tier === 'NONE') {
    return {
      shouldNotify: false, attentionTier: 'NONE', visualMode: 'none',
      sound: 'none', flash: false,
      effectivePriority: meta.priority,
      groupKey: groupKeyFor(event.intent, event.sourceId, event.subjectId),
      reason: `none:${reasons.join(',') || 'mode-suppressed'}`,
    };
  }

  // 10) Modality + fatigue gates for sound/flash.
  const modality = modalityFor(tier);
  let sound: NotificationDecision['sound'] = modality.sound;
  let flash = modality.flashCandidate;

  if (sound !== 'none' && stats.soundLastMinute >= FATIGUE.SOUND_HIGH) {
    sound = 'none';
    reasons.push('fatigue:sound-muted');
  }
  if (sound !== 'none' && ignoredRate >= 0.6) {
    sound = 'none';
    reasons.push('adaptive-mute');
  }

  if (flash && stats.urgentLast10Min >= FATIGUE.URGENT_MAX) {
    flash = false;
    reasons.push('fatigue:urgent-saturated');
  }
  if (flash && (ctx.isUserSpeaking || ctx.isInVoiceRoom)) {
    // Voice flow'u bozma — flash en son çare.
    flash = false;
    reasons.push('voice-no-flash');
  }

  return {
    shouldNotify: true,
    attentionTier: tier,
    visualMode: modality.visualMode,
    sound,
    flash,
    effectivePriority: meta.priority,
    groupKey: groupKeyFor(event.intent, event.sourceId, event.subjectId),
    reason: reasons.length === 0 ? `${event.intent}:${tier}` : reasons.join(','),
  };
}
