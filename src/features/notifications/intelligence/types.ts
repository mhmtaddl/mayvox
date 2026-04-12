/**
 * Notification Intelligence v3 — central type definitions.
 *
 * Pure types + enum-like union literals; no runtime coupling.
 * Policy engine → saf fonksiyon, bu tipleri tüketir ve üretir.
 */

import type { Priority } from '../notificationService';
export type { Priority };

// ── Event intent taxonomy ─────────────────────────────────────────────────
export type EventIntent =
  | 'direct_dm'
  | 'invite'
  | 'mention'          // future: @mention in room
  | 'room_relevant'    // future: activity in followed room
  | 'passive_social'   // future: friend added / presence change
  | 'system_info'
  | 'system_warning';

// ── Attention tiers ───────────────────────────────────────────────────────
export type AttentionTier = 'NONE' | 'PASSIVE' | 'ACTIVE' | 'URGENT';

// ── Visual / audio / physical modalities ─────────────────────────────────
export type VisualMode = 'none' | 'badge' | 'toast-subtle' | 'toast';
export type SoundLevel = 'none' | 'subtle';

// ── Interaction state (derived) ──────────────────────────────────────────
export type InteractionState =
  | 'FOCUSED_READING'
  | 'FOCUSED_TYPING'
  | 'IN_VOICE_PASSIVE'
  | 'IN_VOICE_ACTIVE'
  | 'BACKGROUNDED'
  | 'IDLE'
  | 'OVERLOADED';

// ── Notification modes (user or auto-derived) ────────────────────────────
export type NotificationMode = 'NORMAL' | 'FOCUS' | 'VOICE_PRIORITY' | 'QUIET';

// ── Raw event passed to policy engine ────────────────────────────────────
export interface NotificationEvent {
  intent: EventIntent;
  sourceId?: string;             // sender/inviter id — grouping + adaptive memory
  subjectId?: string;            // conversationKey / serverId — context matching
  /** Override hint from caller — engine yine de mode/fatigue ile düşürebilir. */
  hintedPriority?: Priority;
  createdAt?: number;
}

// ── Context snapshot (aggregated from UI + voice) ────────────────────────
export interface PolicyContext {
  // Existing v2.1 signals
  isAppFocused: boolean;
  isWindowVisible: boolean;
  dmPanelOpen: boolean;
  activeDmConvKey: string | null;
  dmAtBottom: boolean;
  activeServerId: string | null;
  currentUserId: string | null;

  // v3 voice-first signals (optional — default false)
  isUserSpeaking: boolean;
  isInVoiceRoom: boolean;
  isPttActive: boolean;
  isMuted: boolean;
  isDeafened: boolean;

  // v3 mode (default NORMAL)
  mode: NotificationMode;

  // Derived
  interaction: InteractionState;
}

// ── Recent activity stats (fatigue + adaptive input) ─────────────────────
export interface RecentStats {
  notifLastMinute: number;
  soundLastMinute: number;
  urgentLast10Min: number;
  ignoredRateByIntent: Partial<Record<EventIntent, number>>; // 0..1
  clickedRateByIntent: Partial<Record<EventIntent, number>>; // 0..1
}

// ── Policy decision (engine output) ──────────────────────────────────────
export interface NotificationDecision {
  shouldNotify: boolean;
  attentionTier: AttentionTier;
  visualMode: VisualMode;
  sound: SoundLevel;
  flash: boolean;
  /** Burst grouping — aynı key'li aktif toast varsa service update/reset timer. */
  groupKey?: string;
  /** Derived priority that service feeds into insertToast(). */
  effectivePriority: Priority;
  /** Insan-okur sebep — debug + test + future analytics. */
  reason: string;
}
