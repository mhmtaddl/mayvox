# Notification Intelligence v3 — Design Blueprint

## Özet

MAYVOX v2.1 bildirim sistemi güvenli-teslimat üzerine kuruluydu. **v3**, bu temelin üstüne **voice-first, context-aware, adaptive attention** katmanını ekler. Mevcut core (dedupe, lifecycle, priority kuyruğu, flashFrame, sound scheduler) **dokunulmadı** — tek değişiklik: `handleDmMessage` ve `handleInvite` artık **saf bir policy engine**'den geçerek modaliteyi (tier, visual mode, sound, flash, groupKey) belirliyor.

Prensip: **calm over loud**. Şüphede daha az bildir, daha az ses, daha az flash.

## Mimari

```
event  →  [PolicyContext]  →  [RecentStats]  →  decide()  →  Decision  →  service side-effects
            ↑                    ↑                                         ↓
     useNotificationContextSync  lifecycle log + fatigue counters    insertToast/sound/flash
```

- **7 yeni dosya** `src/features/notifications/intelligence/` altında
- **Saf fonksiyonlar** → test edilebilir, if-else yangını yok
- **Geriye uyumlu** → yeni sinyaller opsiyonel; verilmezse v2.1 davranışı korunur

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `intelligence/types.ts` | EventIntent, AttentionTier, VisualMode, NotificationMode, PolicyContext, RecentStats, NotificationDecision |
| `intelligence/fatigue.ts` | Rolling window counters (notif 60s, sound 30s, urgent 10min) + thresholds |
| `intelligence/adaptiveMemory.ts` | Intent-başına son 30 olay ignored/clicked oranı (lightweight, explainable) |
| `intelligence/grouping.ts` | Burst grouping key üretimi (`dm:src:<senderId>`, `invite:batch`) |
| `intelligence/modes.ts` | `resolveEffectiveMode` (auto-derive) + `applyModeAdjustment` (tier kısma) |
| `intelligence/policyEngine.ts` | `decide(event, ctx, stats): Decision` — tek karar noktası |
| `intelligence/index.ts` | Barrel export |

## Attention Tiers

| Tier | Visual | Sound | Flash | Kullanım |
|---|---|---|---|---|
| `NONE` | yok | yok | yok | Kullanıcı zaten bakıyor / suppress |
| `PASSIVE` | subtle toast (dim, EQ yok) | yok | yok | "Bildirim aldın ama rahatsız etmiyorum" |
| `ACTIVE` | normal toast + glow pulse + EQ | subtle ping | yok | Standart DM/invite |
| `URGENT` | normal toast | subtle | evet (fatigue gate'li) | Rare; system_warning + düşük urgent-density |

## Event intent taxonomy

| Intent | Base | Ceiling | Priority | Tipik kaynak |
|---|---|---|---|---|
| `direct_dm` | ACTIVE | URGENT | HIGH | useDM onNewMessage |
| `invite` | ACTIVE | ACTIVE | MEDIUM | useIncomingInvites diff |
| `mention` | ACTIVE | URGENT | HIGH | future |
| `room_relevant` | PASSIVE | ACTIVE | MEDIUM | future |
| `passive_social` | PASSIVE | PASSIVE | LOW | future |
| `system_info` | PASSIVE | ACTIVE | LOW | future |
| `system_warning` | ACTIVE | URGENT | HIGH | future |

## Interaction state machine

`deriveInteractionState(ctx)` → `FOCUSED_READING | FOCUSED_TYPING | IN_VOICE_PASSIVE | IN_VOICE_ACTIVE | BACKGROUNDED | IDLE | OVERLOADED`

- `isUserSpeaking` → `IN_VOICE_ACTIVE`
- `isInVoiceRoom && !isUserSpeaking` → `IN_VOICE_PASSIVE`
- `!isAppFocused || !isWindowVisible` → `BACKGROUNDED`
- `notifCount() >= 5` overlay → `OVERLOADED`

## Modlar

| Mode | Etki |
|---|---|
| `NORMAL` | Default; pass-through |
| `FOCUS` | URGENT→ACTIVE, ACTIVE→PASSIVE; kullanıcı explicit seçer |
| `VOICE_PRIORITY` | `isUserSpeaking` iken 2 step down; `isInVoiceRoom` passive iken 1 step down. **Auto-derived** — kullanıcı voice'ta olduğu an devreye girer |
| `QUIET` | URGENT ve ACTIVE → PASSIVE cap; tüm flash kapalı |

## Default policy akışı (pseudocode)

```
decide(event, ctx, stats):
  if same-context (DM bottom / same server focused) → NONE
  tier = INTENT_BASE[event.intent].base
  if scrolled-up-same-dm → tier = PASSIVE
  if ignoredRate >= 0.8 → tier--           ← adaptive soften
  if notifLastMinute >= 5 → tier--         ← fatigue
  tier = cap(tier, intent.ceiling)
  tier = applyModeAdjustment(tier, effectiveMode, interaction)
  if isUserSpeaking && tier == ACTIVE → PASSIVE   ← voice-first last-mile
  modality = modalityFor(tier)
  if sound && (soundFatigue || ignoredRate >= 0.6) → sound = none
  if flash && (urgentSaturated || inVoice) → flash = false
  return { tier, visualMode, sound, flash, groupKey, reason }
```

## Fatigue thresholds

| Sinyal | Window | Threshold |
|---|---|---|
| Notif count | 60 sn | 5+ → tier--  |
| Sound count | 30 sn | 3+ → sound muted |
| Urgent flash | 10 dk | 2+ → flash suppressed |

## Adaptive memory

- Intent başına **son 30** olay (`clicked`/`ignored`) ring buffer.
- **≥8 sample** şart — erken yanlış karar yok.
- `ignoredRate ≥ 0.8` → tier downgrade.
- `ignoredRate ≥ 0.6` → sound mute (tier aynı).
- Lifecycle log entegrasyonu: `recordLifecycle` terminal tiplerinde otomatik `recordOutcome` çağırır.

## Grouping

- **DM aynı gönderici**: `dm:src:<senderId>` — aktif toast varsa **update + count++** + timer reset. UI başlık: `Ali · 3 mesaj`.
- **Invite burst**: `invite:batch` — tek toast, count artar. Başlık: `3 yeni davet`.
- Service tarafında tek yerde merge; engine sadece key üretir.

## Integration points

- `notificationService.handleDmMessage` → `decide({ intent: 'direct_dm', ... })` → `dispatchDecision(base, decision)`
- `notificationService.handleInvite` → `decide({ intent: 'invite', ... })`
- `dispatchDecision` → grouping check → `insertToast` veya in-place update → `applySideEffects`
- `applySideEffects` → tier-gated sound + flash; per-category rate limit yerinde duruyor
- `ToastItem.visualMode === 'toast-subtle'` → dim border, no EQ, no glow pulse, opacity 0.88
- `useNotificationContextSync` → v3 alanları opsiyonel (isInVoiceRoom, isPttActive, isMuted, isDeafened, mode)
- `ChatView` → mevcut state'lerden `isInVoiceRoom` (activeChannel), `isPttActive`, `isMuted`, `isDeafened` bağlandı

## Default policy matrix (örnekler)

| Durum | DM | Invite |
|---|---|---|
| Focused + same DM + bottom | NONE | — |
| Focused + same DM + scrolled up | PASSIVE (sessiz toast) | — |
| Focused + same server | — | NONE |
| Backgrounded + low fatigue | ACTIVE + subtle ping | ACTIVE + subtle ping |
| Backgrounded + notif ≥ 5 | PASSIVE | PASSIVE |
| Backgrounded + sound ≥ 3 | ACTIVE (ses yok) | ACTIVE (ses yok) |
| isUserSpeaking + ANY | PASSIVE (ACTIVE'den düşer) | NONE (2 step down) |
| isInVoiceRoom passive + DM | PASSIVE | PASSIVE |
| FOCUS mode + DM | PASSIVE | PASSIVE |
| QUIET mode + system_warning | PASSIVE (flash kapalı) | PASSIVE |
| DM ignored rate ≥ 0.8 | 1 tier düşer | 1 tier düşer |

## Extension points

- **Yeni EventIntent ekleme**: `types.ts` union genişlet + `INTENT_BASE` kayıt ekle → engine otomatik destekler.
- **Custom policy override**: `decide` aynı imzayla sarılabilir; adaptorlar yazılabilir.
- **User settings UI**: mode'u `useNotificationContextSync({ mode })` ile aktarmak yeterli — architecture hazır.
- **Telemetry sink**: lifecycle log + `Decision.reason` artık her karar için explainable; future analytics hook'a bağlanır.

## Tests

`server-backend/src/services/__tests__/notificationIntelligence.test.ts` — 15 case:
- DM suppression (bottom / scrolled up / backgrounded)
- Voice-first (speaking → NONE; voice passive → PASSIVE; voice → no flash)
- Fatigue (notif/sound/urgent downgrades)
- Adaptive (ignored ≥ 0.8 tier down; ≥ 0.6 sound mute)
- Modes (FOCUS, QUIET semantics)
- Same-context suppression (invite + same server)

**Total: 139/139 test pass** (106 mevcut + 15 intelligence + 18 hardening).

## Validation
- Frontend `tsc --noEmit` → **EXIT=0**
- Backend vitest → **139/139 pass** (11 test file)

## Explicitly deferred

- `isUserSpeaking` sinyalinin `speakingLevels[me]` eşiğinden türetilmesi (ChatView wire)
- User-facing mode selector UI (settings panel)
- Mention intent implementasyonu (backend event stream mevcut değil)
- Grouping UX polish — active stack içinde group count animasyonu
- Per-source adaptive memory (sadece sender bazlı ignore oranı)
- Notification priority tuning ML (out of scope — heuristic only)
- Telemetry export (lifecycle + Decision.reason hazır ama sink yok)

## Risks / follow-up

- **Voice speaking detection**: `speakingLevels` pek çok kullanıcıyı içerir; `currentUser.id` eşiğini periyodik polling ile `updateContext({ isUserSpeaking })` yapmak gerek — follow-up ticket.
- **Overloaded state**: yalnızca `notifCount ≥ 5` — future: typing, scroll activity, CPU idle derivation.
- **Adaptive cold start**: ilk 8 sample'a kadar no-op — kullanıcı erken ignore ederse geç öğrenir; kabul edilen trade-off.
- **Groupkey merge görsel**: mevcut basit "X mesaj" başlık update; gelecekte stacked avatar / inline count badge polish.
- **Mode persistence**: localStorage'a henüz bağlı değil — settings panel geldiğinde wire.
