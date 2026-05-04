/**
 * Notification Service v2 — in-app only.
 *
 * Sorumluluk:
 *   1. Olay alır (DM, invite)
 *   2. Fingerprint ile dedupe (cross-window + aynı-context tekrar)
 *   3. Context-aware filter (zaten bakıyor, scroll-aşağıda mı, aktif sunucu mu)
 *   4. Priority-aware kuyruk (HIGH DM > MEDIUM invite > LOW)
 *   5. Per-category rate limit (sound için)
 *   6. Side-effects: ses (dual-tone), attention (delayed 600ms flash)
 */

import type { DmMessage } from '../../lib/dmService';
import { safePublicName } from '../../lib/formatName';
import { playNotifyBeep } from './notificationSound';
import { playMessageReceive, playNotification } from '../../lib/audio/SoundManager';
import { shouldSuppressSettingsSoundInChatRoom } from '../../lib/soundRoomPreference';
import { requestElectronFlash } from './electronAttention';
import { hasSeen, markSeen } from './dedupeChannel';
import {
  decide as decideNotification,
  recordNotif as fatigueRecordNotif,
  recordSound as fatigueRecordSound,
  recordUrgent as fatigueRecordUrgent,
  notifCount, soundCount, urgentCount,
  recordOutcome as adaptiveRecordOutcome,
  snapshotRates,
} from './intelligence';
import type {
  NotificationMode, VisualMode, AttentionTier, InteractionState,
  PolicyContext, NotificationDecision,
} from './intelligence';

// ── Types ────────────────────────────────────────────────────────────────

export type ToastKind = 'dm' | 'invite';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface ToastItem {
  id: string;
  kind: ToastKind;
  priority: Priority;
  avatar?: string | null;
  title: string;
  body?: string;
  createdAt: number;
  data: Record<string, unknown>;
  /** v3: attention tier (UI subtle mode için). Default ACTIVE (eski davranış). */
  attentionTier?: AttentionTier;
  /** v3: toast görsel modu. 'toast-subtle' = dimmer + no EQ. Default 'toast'. */
  visualMode?: VisualMode;
  /** v3: burst grouping key; aynı groupKey'li toast update + timer-reset. */
  groupKey?: string;
  /** v3: grouping sayacı (internal). */
  groupCount?: number;
  /** v3.1: grouping update'inde artan revizyon; UI subtle pulse için. */
  revision?: number;
  /** Faz 3: ilk dispatch'teki base title (ör. sender adı). Grouping update'te
   *  format helper'ı orijinal title'dan dinamik yeniden üretebilsin diye saklanır. */
  originalTitle?: string;
}

export interface NotifContext {
  isAppFocused: boolean;
  /** v3: window visible (document.visibilityState). Default = isAppFocused. */
  isWindowVisible: boolean;
  dmPanelOpen: boolean;
  activeDmConvKey: string | null;
  /** Kullanıcı aktif DM thread'inde tabanda mı? false ise yukarıda — mesajı görmüyor, suppress açık. */
  dmAtBottom: boolean;
  activeServerId: string | null;
  currentUserId: string | null;

  // v3 voice-first signals (optional — default false; v2.1 davranışı korunur)
  isUserSpeaking: boolean;
  isInVoiceRoom: boolean;
  isPttActive: boolean;
  isMuted: boolean;
  isDeafened: boolean;

  // v3 mode (default NORMAL)
  mode: NotificationMode;
}

export interface NotifHandlers {
  onDmClick?: (recipientId: string, conversationKey: string) => void;
  onInviteClick?: (inviteId: string, serverId: string | null) => void;
  onJoinRequestClick?: (serverId: string) => void;
  /** Başvuru kabul edildi → sunucuyu aç (switch) */
  onJoinRequestAcceptedClick?: (serverId: string) => void;
}

export interface InviteNotif {
  id: string;
  serverId: string | null;
  serverName?: string | null;
  inviterId?: string | null;
  inviterName?: string | null;
  inviterAvatar?: string | null;
}

// ── Lifecycle ────────────────────────────────────────────────────────────

export type LifecycleType = 'seen' | 'displayed' | 'clicked' | 'ignored';
/** Standart 'ignored' reason'ları — analytics + debug için daraltılmış sözlük. */
export type IgnoredReason = 'timeout' | 'dismiss' | 'evicted' | 'clearAll';
export interface LifecycleEvent {
  toastId: string;
  kind: ToastKind;
  priority: Priority;
  type: LifecycleType;
  at: number;
  /** `ignored` için IgnoredReason; diğerleri için opsiyonel. */
  reason?: IgnoredReason | string;
}

const MAX_LIFECYCLE = 500;
const lifecycleLog: LifecycleEvent[] = [];
const clickedIds = new Set<string>();        // click tekillik guard
const terminalIds = new Set<string>();       // clicked || ignored (çift-sayımı engeller)
const displayedIds = new Set<string>();      // 'displayed' tekillik guard (UI mount bir kez)

function recordLifecycle(e: LifecycleEvent) {
  lifecycleLog.push(e);
  if (lifecycleLog.length > MAX_LIFECYCLE) lifecycleLog.shift();
  // v3: Adaptive memory — terminal outcome'ları intent'a bağla.
  // ToastKind → EventIntent haritalaması: dm → 'direct_dm', invite → 'invite'.
  if (e.type === 'clicked' || e.type === 'ignored') {
    const intent = e.kind === 'dm' ? 'direct_dm' : 'invite';
    adaptiveRecordOutcome(intent, e.type === 'clicked' ? 'clicked' : 'ignored');
  }
}

export function getLifecycleEvents(): LifecycleEvent[] {
  return lifecycleLog.slice();
}

/**
 * UI gerçekten toast'ı mount ettiğinde çağrılır — 'seen' (queued) ile
 * 'displayed' (rendered) ayrımı analytics için netleşir.
 * Idempotent: aynı toastId için tekrar çağırılırsa no-op.
 */
export function recordDisplayed(toastId: string, kind: ToastKind, priority: Priority) {
  if (displayedIds.has(toastId)) return;
  displayedIds.add(toastId);
  recordLifecycle({ toastId, kind, priority, type: 'displayed', at: Date.now() });
}

// ── State ────────────────────────────────────────────────────────────────

const MAX_TOASTS = 3;
const SOUND_RATE_MS: Record<ToastKind, number> = { dm: 1500, invite: 3000 };

let ctx: NotifContext = {
  isAppFocused: true,
  isWindowVisible: true,
  dmPanelOpen: false,
  activeDmConvKey: null,
  dmAtBottom: true,
  activeServerId: null,
  currentUserId: null,
  isUserSpeaking: false,
  isInVoiceRoom: false,
  isPttActive: false,
  isMuted: false,
  isDeafened: false,
  mode: 'NORMAL',
};

let handlers: NotifHandlers = {};
let toasts: ToastItem[] = [];
const listeners = new Set<(t: ToastItem[]) => void>();
const lastSoundAt: Record<ToastKind, number> = { dm: 0, invite: 0 };
let nextSeq = 1;

function emit() {
  const snapshot = [...toasts];
  listeners.forEach(l => l(snapshot));
}

// ── Queue insert: priority-aware replacement ─────────────────────────────
function markSeenLifecycle(t: ToastItem) {
  recordLifecycle({ toastId: t.id, kind: t.kind, priority: t.priority, type: 'seen', at: Date.now() });
}

function insertToast(t: ToastItem) {
  // Aynı id varsa güncelle, yeniden ekleme — 'seen' tekilliği korur.
  const idx = toasts.findIndex(x => x.id === t.id);
  if (idx !== -1) {
    toasts[idx] = t;
    emit();
    return;
  }

  if (toasts.length < MAX_TOASTS) {
    toasts = [t, ...toasts];
    markSeenLifecycle(t);
    emit();
    return;
  }

  // Kuyruk dolu: en düşük priority + en eski olan adayı bul.
  // Eğer incoming priority >= adayın priority'si DEĞİLSE incoming'i ata.
  const incomingRank = PRIORITY_RANK[t.priority];
  let victimIdx = -1;
  let victimRank = Infinity;
  let victimAge = -1;
  for (let i = 0; i < toasts.length; i++) {
    const r = PRIORITY_RANK[toasts[i].priority];
    const age = Date.now() - toasts[i].createdAt;
    if (r < victimRank || (r === victimRank && age > victimAge)) {
      victimRank = r;
      victimAge = age;
      victimIdx = i;
    }
  }

  if (incomingRank >= victimRank) {
    // >: daha yüksek priority → düşük'ü at.
    // =: aynı priority → newest-first (oldest same-rank düşer).
    const victim = toasts[victimIdx];
    toasts = [t, ...toasts.filter((_, i) => i !== victimIdx)];
    markSeenLifecycle(t);
    // Victim çıktı: eğer kullanıcı görmeden düştüyse 'ignored' say (terminal değilse).
    if (victim && !terminalIds.has(victim.id)) {
      recordLifecycle({
        toastId: victim.id, kind: victim.kind, priority: victim.priority,
        type: 'ignored', at: Date.now(), reason: 'evicted',
      });
      terminalIds.add(victim.id);
    }
    emit();
    return;
  }

  // Incoming daha düşük priority + kuyruk yüksek priority dolu → incoming düşer.
  // (HIGH toast'ları LOW/MEDIUM noise ile bloklanmasın.)
  // Queue'ya girmediği için 'seen' kaydı yok; gözlemlenebilmesi için debug trace.
  emit();
}

// ── Public API ───────────────────────────────────────────────────────────

export function subscribe(l: (t: ToastItem[]) => void): () => void {
  listeners.add(l);
  l([...toasts]);
  return () => { listeners.delete(l); };
}

export function dismiss(id: string, reason: IgnoredReason = 'dismiss') {
  const victim = toasts.find(t => t.id === id);
  toasts = toasts.filter(t => t.id !== id);
  // Lifecycle: click ETMEDEN dismiss → 'ignored' (tekillik guard).
  if (victim && !terminalIds.has(victim.id)) {
    recordLifecycle({
      toastId: victim.id, kind: victim.kind, priority: victim.priority,
      type: 'ignored', at: Date.now(), reason,
    });
    terminalIds.add(victim.id);
  }
  emit();
}

export function clearAll() {
  // Aktif olanları 'ignored' olarak işle.
  const now = Date.now();
  for (const t of toasts) {
    if (!terminalIds.has(t.id)) {
      recordLifecycle({ toastId: t.id, kind: t.kind, priority: t.priority, type: 'ignored', at: now, reason: 'clearAll' });
      terminalIds.add(t.id);
    }
  }
  toasts = [];
  emit();
}

export function updateContext(partial: Partial<NotifContext>) {
  ctx = { ...ctx, ...partial };
}

export function registerHandlers(h: NotifHandlers) {
  handlers = { ...handlers, ...h };
}

// ── Filters ──────────────────────────────────────────────────────────────

/**
 * v2.1 geriye uyum — _testing üzerinden harici test ediliyor.
 * Aktif DM thread'inde olsa bile, kullanıcı YUKARIDA kaydırılmışsa yeni mesajı görmüyor.
 */
function isActivelyViewingDm(conversationKey: string): boolean {
  if (!ctx.isAppFocused) return false;
  if (!ctx.dmPanelOpen) return false;
  if (ctx.activeDmConvKey !== conversationKey) return false;
  return ctx.dmAtBottom;
}

function isSelf(userId: string): boolean {
  return !!ctx.currentUserId && ctx.currentUserId === userId;
}

// ── v3: Context snapshot + interaction state derivation ─────────────────

function deriveInteractionState(): InteractionState {
  if (ctx.isUserSpeaking) return 'IN_VOICE_ACTIVE';
  if (ctx.isInVoiceRoom) return 'IN_VOICE_PASSIVE';
  if (!ctx.isAppFocused || !ctx.isWindowVisible) return 'BACKGROUNDED';
  // notif burst → overloaded
  if (notifCount() >= 5) return 'OVERLOADED';
  if (ctx.dmPanelOpen) return 'FOCUSED_READING';
  return 'FOCUSED_READING';
}

function buildPolicyContext(): PolicyContext {
  return {
    isAppFocused: ctx.isAppFocused,
    isWindowVisible: ctx.isWindowVisible,
    dmPanelOpen: ctx.dmPanelOpen,
    activeDmConvKey: ctx.activeDmConvKey,
    dmAtBottom: ctx.dmAtBottom,
    activeServerId: ctx.activeServerId,
    currentUserId: ctx.currentUserId,
    isUserSpeaking: ctx.isUserSpeaking,
    isInVoiceRoom: ctx.isInVoiceRoom,
    isPttActive: ctx.isPttActive,
    isMuted: ctx.isMuted,
    isDeafened: ctx.isDeafened,
    mode: ctx.mode,
    interaction: deriveInteractionState(),
  };
}

function buildStats() {
  const rates = snapshotRates();
  return {
    notifLastMinute: notifCount(),
    soundLastMinute: soundCount(),
    urgentLast10Min: urgentCount(),
    ignoredRateByIntent: rates.ignored,
    clickedRateByIntent: rates.clicked,
    sampleCountByIntent: rates.counts,
  };
}

// ── Event handlers ───────────────────────────────────────────────────────

export function handleDmMessage(msg: DmMessage) {
  if (isSelf(msg.senderId)) return;

  const fp = `dm:${msg.id}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'direct_dm', sourceId: msg.senderId, subjectId: msg.conversationKey, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );

  if (!decision.shouldNotify) return;

  const preview = msg.text.length > 120 ? msg.text.slice(0, 120) + '…' : msg.text;
  dispatchDecision({
    id: `dm-${msg.id}`,
    kind: 'dm',
    priority: decision.effectivePriority,
    avatar: msg.senderAvatar ?? null,
    title: safePublicName(msg.senderName) || 'Yeni mesaj',
    body: preview,
    createdAt: Date.now(),
    data: { recipientId: msg.senderId, conversationKey: msg.conversationKey },
  }, decision);
}

export interface JoinRequestNotif {
  requestId?: string;
  serverId: string;
  serverName?: string | null;
  serverAvatar?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
}

export function handleJoinRequest(req: JoinRequestNotif) {
  const fp = `joinreq:${req.serverId}:${req.requestId ?? req.requesterId ?? Date.now()}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  // Policy engine'ı 'invite' kind üzerinden tüketir (mimari değişmez).
  const decision = decideNotification(
    { intent: 'invite', sourceId: req.requesterId ?? undefined, subjectId: req.serverId, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );
  if (!decision.shouldNotify) return;

  const title = req.serverName || 'Katılma başvurusu';
  const body = req.requesterName
    ? `${req.requesterName} sunucuna katılmak istiyor`
    : 'Yeni katılma başvurusu';

  dispatchDecision({
    id: `joinreq-${req.serverId}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: req.serverAvatar ?? null,
    title,
    body,
    createdAt: Date.now(),
    data: { intent: 'joinRequest', serverId: req.serverId, inviteId: req.requestId ?? '' },
  }, decision);
}

export interface JoinRequestResultNotif {
  serverId: string;
  serverName?: string | null;
  serverAvatar?: string | null;
}

export function handleJoinRequestAccepted(r: JoinRequestResultNotif) {
  const fp = `joinreq-accepted:${r.serverId}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'invite', sourceId: undefined, subjectId: r.serverId, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );
  if (!decision.shouldNotify) return;

  dispatchDecision({
    id: `joinreq-acc-${r.serverId}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: r.serverAvatar ?? null,
    title: r.serverName || 'Başvurun kabul edildi',
    body: r.serverName ? `${r.serverName} sunucusuna katıldın` : 'Başvurun kabul edildi — sunucuya katıldın',
    createdAt: Date.now(),
    data: { intent: 'joinRequestAccepted', serverId: r.serverId },
  }, decision);
}

export function handleJoinRequestRejected(r: JoinRequestResultNotif) {
  const fp = `joinreq-rejected:${r.serverId}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'invite', sourceId: undefined, subjectId: r.serverId, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );
  if (!decision.shouldNotify) return;

  dispatchDecision({
    id: `joinreq-rej-${r.serverId}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: r.serverAvatar ?? null,
    title: r.serverName || 'Başvurun reddedildi',
    body: r.serverName ? `${r.serverName} sunucusu başvurunu reddetti` : 'Başvurun reddedildi',
    createdAt: Date.now(),
    data: { intent: 'joinRequestRejected', serverId: r.serverId },
  }, decision);
}

// ── Server restriction notifications ──
// Top-right toast'a düşer; bell tarafına ayrıca pushInformational yapılır (caller).
export interface ServerRestrictionNotif {
  serverId: string;
  serverName: string | null;
  serverAvatar: string | null;
  reason?: string | null;
}

export function handleServerRestricted(p: ServerRestrictionNotif) {
  const fp = `srv-restricted:${p.serverId}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'invite', sourceId: undefined, subjectId: p.serverId, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );
  if (!decision.shouldNotify) return;

  dispatchDecision({
    id: `srv-restricted-${p.serverId}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: p.serverAvatar ?? null,
    title: p.serverName || 'Sunucu kısıtlandı',
    body: p.serverName
      ? `${p.serverName} geçici olarak kısıtlandı — odalara erişim kapatıldı`
      : 'Sunucu geçici olarak kısıtlandı — odalara erişim kapatıldı',
    createdAt: Date.now(),
    data: { intent: 'serverRestricted', serverId: p.serverId },
  }, decision);
}

export function handleServerUnrestricted(p: ServerRestrictionNotif) {
  const fp = `srv-unrestricted:${p.serverId}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'invite', sourceId: undefined, subjectId: p.serverId, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );
  if (!decision.shouldNotify) return;

  dispatchDecision({
    id: `srv-unrestricted-${p.serverId}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: p.serverAvatar ?? null,
    title: p.serverName || 'Sunucu tekrar aktif',
    body: p.serverName
      ? `${p.serverName} tekrar aktif — odalara ve sesli kanallara erişim açıldı`
      : 'Sunucu tekrar aktif — odalara erişim açıldı',
    createdAt: Date.now(),
    data: { intent: 'serverUnrestricted', serverId: p.serverId },
  }, decision);
}

export function handleInvite(inv: InviteNotif) {
  const fp = `invite:${inv.id}`;
  if (hasSeen(fp)) return;
  markSeen(fp);

  const decision = decideNotification(
    { intent: 'invite', sourceId: inv.inviterId ?? undefined, subjectId: inv.serverId ?? undefined, createdAt: Date.now() },
    buildPolicyContext(),
    buildStats(),
  );

  if (!decision.shouldNotify) return;

  const title = inv.serverName || 'Sunucu daveti';
  const body = inv.inviterName ? `${inv.inviterName} seni davet etti` : 'Yeni davet geldi';

  dispatchDecision({
    id: `inv-${inv.id}-${nextSeq++}`,
    kind: 'invite',
    priority: decision.effectivePriority,
    avatar: inv.inviterAvatar ?? null,
    title,
    body,
    createdAt: Date.now(),
    data: { inviteId: inv.id, serverId: inv.serverId },
  }, decision);
}

/**
 * Faz 3: Grouped toast title formatı — kind + data.intent bazlı tutarlı şablon.
 *  - DM          → "Sender · N mesaj"
 *  - joinRequest → "N katılma başvurusu"
 *  - invite / diğer → "N yeni davet"
 *
 * `baseTitle` = ilk dispatch'teki orijinal title (sender adı vs). ToastItem.originalTitle
 * alanı bu değeri kalıcı tutar; grouping update'inde "Ad · X mesaj" → "Ad · Y mesaj"
 * şeklinde format yeniden üretilir, sender adı kaybolmaz.
 */
function groupedTitle(
  kind: ToastKind,
  data: Record<string, unknown>,
  count: number,
  baseTitle: string,
): string {
  if (kind === 'dm') return `${baseTitle} · ${count} mesaj`;
  if (data.intent === 'joinRequest') return `${count} katılma başvurusu`;
  return `${count} yeni davet`;
}

/**
 * Decision'ı uygular: groupKey ile bundle, insertToast, rate-limited sound, flash.
 */
function dispatchDecision(base: Omit<ToastItem, 'attentionTier' | 'visualMode' | 'groupKey' | 'groupCount'>, d: NotificationDecision) {
  const kind = base.kind;

  // Faz 3 defensive guard: critical priority ASLA grouping'e girmez.
  // (emit.ts resolveChannels zaten critical → toast:false dönüyor, yani bu
  // katmana critical ulaşmamalı. Yine de future-proof — service'e doğrudan
  // critical event girerse grouping bypass edilmeli.)
  const priorityStr = base.priority as string;
  const isCriticalBypass = priorityStr === 'CRITICAL' || priorityStr === 'critical';

  // Grouping: aynı groupKey'li aktif toast varsa — yeni toast basma, mevcut toast'ı güncelle.
  // Toast id KORUNUR (React key stabil, entrance animasyonu yeniden tetiklenmez);
  // sadece değişen alanlar + revision++ — UI bunu subtle pulse ile gösterir.
  if (d.groupKey && !isCriticalBypass) {
    const existing = toasts.find(t => t.groupKey === d.groupKey);
    if (existing) {
      const count = (existing.groupCount ?? 1) + 1;
      const original = existing.originalTitle ?? existing.title;
      const updated: ToastItem = {
        ...existing,               // id + kind + priority + data STABİL kalır
        avatar: base.avatar ?? existing.avatar,
        title: groupedTitle(kind, existing.data, count, original),
        body: base.body ?? existing.body,
        createdAt: Date.now(),     // TTL reset
        groupCount: count,
        originalTitle: original,
        attentionTier: d.attentionTier,
        visualMode: d.visualMode,
        revision: (existing.revision ?? 1) + 1,
      };
      const idx = toasts.findIndex(t => t.id === existing.id);
      if (idx !== -1) toasts[idx] = updated;
      emit();
      applySideEffects(kind, d);
      return;
    }
  }

  insertToast({
    ...base,
    attentionTier: d.attentionTier,
    visualMode: d.visualMode,
    groupKey: isCriticalBypass ? undefined : d.groupKey,
    groupCount: 1,
    revision: 1,
    originalTitle: base.title,
  });
  fatigueRecordNotif();
  applySideEffects(kind, d);
}

function applySideEffects(kind: ToastKind, d: NotificationDecision) {
  // Sound — kind-bazlı rate limit + decision gate.
  // Mp3 (SoundManager) ilk yol; per-category enable gate'i playMessageReceive /
  // playNotification içinde uygulanır. Asset yüklenemezse oscillator beep fallback.
  // playNotifyBeep'in kendi 'notify:sound' check'i = aynı message-enabled key
  // olduğu için DM kapalıysa fallback de sessiz kalır (tutarlı davranış).
  if (d.sound === 'subtle') {
    if (kind !== 'dm' && shouldSuppressSettingsSoundInChatRoom()) return;
    const now = Date.now();
    if (now - lastSoundAt[kind] >= SOUND_RATE_MS[kind]) {
      lastSoundAt[kind] = now;
      fatigueRecordSound();
      const mp3Played = kind === 'dm' ? playMessageReceive() : playNotification();
      if (!mp3Played) playNotifyBeep();
    }
  }
  // Flash — sadece URGENT + fatigue clear; engine zaten gate ediyor.
  if (d.flash && !ctx.isAppFocused) {
    fatigueRecordUrgent();
    requestElectronFlash(true);
  }
}

// ── Click ─────────────────────────────────────────────────────────────────

export function handleClick(toast: ToastItem) {
  // Lifecycle tekillik: aynı toast'a iki kez click fire etmez; dismiss 'ignored' kaydetmez.
  const alreadyClicked = clickedIds.has(toast.id);
  if (!alreadyClicked && !terminalIds.has(toast.id)) {
    recordLifecycle({
      toastId: toast.id, kind: toast.kind, priority: toast.priority,
      type: 'clicked', at: Date.now(),
    });
    clickedIds.add(toast.id);
    terminalIds.add(toast.id);
  }
  try {
    if (toast.kind === 'dm') {
      const recipientId = String(toast.data.recipientId ?? '');
      const convKey = String(toast.data.conversationKey ?? '');
      if (recipientId) handlers.onDmClick?.(recipientId, convKey);
    } else if (toast.data.intent === 'joinRequest') {
      const serverId = toast.data.serverId ? String(toast.data.serverId) : '';
      if (serverId) handlers.onJoinRequestClick?.(serverId);
    } else if (toast.data.intent === 'joinRequestAccepted') {
      const serverId = toast.data.serverId ? String(toast.data.serverId) : '';
      if (serverId) handlers.onJoinRequestAcceptedClick?.(serverId);
    } else if (toast.data.intent === 'joinRequestRejected') {
      /* no-op: bilgilendirme, aksiyon yok */
    } else {
      const inviteId = String(toast.data.inviteId ?? '');
      const serverId = toast.data.serverId ? String(toast.data.serverId) : null;
      handlers.onInviteClick?.(inviteId, serverId);
    }
  } catch (err) {
    console.warn('[notify] click handler error', err);
  }
  // dismiss: terminal artık clicked; 'ignored' kaydı fire etmez.
  toasts = toasts.filter(t => t.id !== toast.id);
  emit();
}

// ── (v2.1 `triggerSideEffects` v3'te `applySideEffects` ile değiştirildi.) ──

// ── Priority-aware queue helpers (exported for tests) ────────────────────

export const _testing = {
  getToasts: () => [...toasts],
  getContext: () => ({ ...ctx }),
  getLifecycle: () => lifecycleLog.slice(),
  reset() {
    toasts = [];
    ctx = {
      isAppFocused: true, isWindowVisible: true,
      dmPanelOpen: false, dmAtBottom: true,
      activeDmConvKey: null, activeServerId: null, currentUserId: null,
      isUserSpeaking: false, isInVoiceRoom: false, isPttActive: false,
      isMuted: false, isDeafened: false, mode: 'NORMAL',
    };
    handlers = {};
    lastSoundAt.dm = 0;
    lastSoundAt.invite = 0;
    lifecycleLog.length = 0;
    clickedIds.clear();
    terminalIds.clear();
    displayedIds.clear();
    emit();
  },
  insertToast,
  isActivelyViewingDm,
};
