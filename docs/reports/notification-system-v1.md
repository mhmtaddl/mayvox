# Notification System v1 → v2 — Implementation Report

> **v2 upgrade (bu tur):** reconnect recovery, cross-window dedupe (BroadcastChannel + LRU),
> priority-aware kuyruk, per-category sound rate, scroll-aware filter, 600ms delayed flash,
> premium dual-tone sound, mini-EQ DM toast, gerçek invite click. Detay aşağıda "v2 upgrade".


## Summary

In-app notification sistemi kuruldu. Push yok, persistence yok, history panel yok — sadece ephemeral top-right toast stack + subtle WebAudio beep + Electron `flashFrame` (fallback: document.title blink). Context-aware filtering zorunlu (kullanıcının zaten baktığı yer için toast üretmez). Mevcut DM + invite realtime akışlarına zero-network-call piggyback.

## Events handled

| Kaynak | Event | Service metodu |
|---|---|---|
| DM | `dm:new_message` (WS) | `notifyDmMessage(msg)` via `useDM.onNewMessage` |
| Invite | `invite:new` (WS) + 60s polling | `notifyInvite(inv)` via `useIncomingInvites.load` diff |

## Filtering logic

**DM suppress edilir:**
- `senderId === currentUserId` (self)
- `isAppFocused && dmPanelOpen && activeDmConvKey === msg.conversationKey` (kullanıcı zaten o konuşmada)

**Invite suppress edilir:**
- `isAppFocused && inv.serverId === activeServerId` (kullanıcı zaten o sunucuda)

**Attention (flashFrame):** yalnızca `!isAppFocused` durumunda tetiklenir. Pencere odağa dönünce focus event otomatik stop eder (Electron native + title-fallback listener).

**Sound:** global 2 sn rate limit; `localStorage('notify:sound') === '0'` ise tamamen sessiz.

## UI behavior

- Top-right portal stack (`position: fixed`, `z-[200]`)
- Max 3 eşzamanlı toast (service seviyesinde cap), newest-first; yenisi geldiğinde en eski düşer
- Auto-dismiss 5 sn; hover → timer durur, leave → kalan süreyle devam
- Click → `registerHandlers({ onDmClick, onInviteClick })` üzerinden navigate:
  - DM: `setDmTargetUserId(recipientId); setDmPanelOpen(true)`
  - Invite: şimdilik no-op placeholder (IncomingInvitesModal mevcut akışı üzerinden zaten bell'den açılıyor)
- Görsel: glass backdrop-blur, sol 3px aksan barı (DM: `--theme-accent`, Invite: mor), avatar/fallback ikon, başlık + 2-satır preview, X hover'da görünür
- Animasyon: slide-in sağdan (200ms ease-out), exit aynı, AnimatePresence `layout`
- Smooth, premium; çok renk yok, cartoon yok

## Realtime additions

**Yeni event yok**. Mevcut WS event akışı (`dm:new_message`, `invite:new`, `invite:removed`) değiştirilmedi — sadece ek consumer olarak notification service var.

## Electron integration

- `electron/preload.cjs` — `electronNotify.flashFrame(bool)` exposed (contextBridge)
- `electron/main.cjs` — `ipcMain.on('notify:flash')` → `BrowserWindow.flashFrame(on)`; update/NSIS bölümlerinden uzak (line ~422)
- Fallback: bridge yoksa `document.title` prefix blink (● 900ms); `focus` event'inde stop
- Redline dosyalarında (useUpdateController, electronUpdater) değişiklik yok

## State layer

- `notificationService.ts` (pub-sub) — bağımsız modül; React ve Redux'tan bağımsız
- `useNotifications()` — tek subscribe, toast array döner
- `useNotificationContextSync({ currentUserId, isAppFocused, dmPanelOpen, activeDmConvKey, activeServerId })` — ChatView'da çağrılır
- Handlers: `registerHandlers({ onDmClick, onInviteClick })` ChatView mount'ta bir kez

## Files added

- `src/features/notifications/notificationService.ts` — core service (subscribe, dispatch, filter, side effects)
- `src/features/notifications/notificationSound.ts` — WebAudio beep + localStorage toggle
- `src/features/notifications/electronAttention.ts` — IPC bridge + title-flash fallback
- `src/features/notifications/useNotifications.ts` — subscribe hook
- `src/features/notifications/useNotificationContextSync.ts` — context registry bridge
- `src/features/notifications/ToastItem.tsx` — hover-pause toast UI
- `src/features/notifications/ToastContainer.tsx` — portal top-right stack
- `server-backend/src/services/__tests__/notificationFilter.test.ts` — 9 filter invariant testi

## Files modified

- `electron/main.cjs` — `ipcMain.on('notify:flash')` handler (line ~422)
- `electron/preload.cjs` — `electronNotify` contextBridge export
- `src/hooks/useDM.ts` — `onNewMessage` içinde `notifyDmMessage(msg)` çağrısı (self-exclude)
- `src/hooks/useIncomingInvites.ts` — ilk yükleme sessiz, sonraki fetch'lerde diff-based invite notification
- `src/components/DMPanel.tsx` — `onActiveConvKeyChange` prop (context sync için)
- `src/views/ChatView.tsx` — ToastContainer mount, context sync hook, click handler registration

## Tests

9 yeni filter invariant testi (vitest). 88/88 pass total. Filter mantığı frontend service ile paralel — mantık kayması CI'da yakalanır.

## Limitations / deferred

- **Invite click navigation**: `onInviteClick` şu an no-op placeholder — IncomingInvitesModal bell üzerinden zaten açılıyor. Toast click → direkt modal açma ileriki pass'te.
- **Notification history panel**: hard-excluded (scope dışı)
- **Mention sistemi**: scope dışı
- **Per-channel mute**: scope dışı
- **Push notifications**: scope dışı (user hard rule)
- **Advanced preferences panel**: şimdilik sadece `localStorage('notify:sound')` flag; settings UI ileride
- **Rich preview (markdown/embed)**: plain text preview, 120 char truncate
- **Group DM**: system-wide hard exclusion
- **Email/SMS**: scope dışı (hard rule)

## Risks / follow-up

- **`useIncomingInvites` diff detection**: ilk WS miss + polling arasındaki race'de aynı invite iki kez tetiklenebilir — `notifiedIdsRef` set ile idempotent
- **WebAudio context**: ilk user interaction olmadan tarayıcı AudioContext suspended olabilir; modern Electron'da otomatik resume ediyor, sessizlik olursa user action sonrası düzelir
- **flashFrame Linux**: bazı WM'lerde çalışmayabilir — fallback title-flash zaten var
- **Toast stack overflow**: MAX_TOASTS=3 cap; yoğun DM burst'te 3 görünür, geri kalan düşer (newest-first)
- **Context sync race**: `updateContext` React render sonrası güncellenir; çok hızlı DM geldiği an DMPanel açılıyorsa 1 frame'lik false-positive toast olabilir — pratikte görünmez
- **Flash stop explicit**: Electron odak alınca auto-stop eder; fallback title-flash `focus` listener ile stop. `useNotificationContextSync` `isAppFocused` olduğunda explicit `flashFrame(false)` çağrısı var (belt + suspenders).

## Future expansion points

- Toast click nav'ı için dedicated handler chain (channel, mention, friend request)
- History panel (tanımlı hook olarak `notificationService.getHistory()`)
- Settings panel: sound toggle, position preference, DND mode
- Mention-aware DM (prefix @ match + daha yüksek priority)
- Per-server mute entegrasyonu

---

## v2 upgrade

### A. Reconnect recovery
- `useIncomingInvites`: zaten mount'ta idempotent; `notifiedIdsRef` Set yeni ID'leri filtreler → reconnect + polling duplicate toast üretmez.
- `useDM`: yeni `subscribeConnectionStatus` hook; ilk `connected` skip, gerçek reconnect'te `dmLoadConversations()` + `dmRequestUnreadTotal()` canonical fetch.
- Per-mesaj replay yok (chat-server persistent queue tutmuyor) — kabul edilen trade-off; dedupe cache reconnect spam'ini zaten önlüyor.

### B. Cross-window dedupe
- `dedupeChannel.ts`: `BroadcastChannel('mayvox:notify')` + in-memory LRU (cap 200, TTL 5 dk).
- Fingerprint: `dm:<messageId>` / `invite:<inviteId>`.
- Service push öncesi `hasSeen(fp)` → erken dön. Yeni fingerprint `markSeen(fp)` ile cache + broadcast.
- Diğer pencerelerden gelen broadcast yalnızca cache'e eklenir, re-dispatch yok.
- BroadcastChannel yoksa sessiz fallback (yalnızca local dedupe).

### C. Premium UX
- **Sound**: `playNotifyBeep` yeniden yazıldı — 880Hz sharp tick + 660Hz soft echo (+80ms delayed), master gain 0.06, exponential envelope, auto-disconnect cleanup.
- **Toast entrance**: spring `{stiffness: 380, damping: 28}` + opacity + x=24 slide, tek seferlik radial glow pulse (accent renkli, 700ms).
- **DM voice DNA**: 3-bar mini equalizer, `scaleY` keyframe döngüsü (1.1s period, 120ms stagger) — subtle, 2px bar + 12px container.
- **Delayed flash**: `requestElectronFlash(true)` → 600ms pending timer. Focus gelirse pending iptal + aktif flash stop. Jittery flash engellendi; `activeFlashOn` state guard ikinci request'te no-op.

### D. Invite click — gerçek navigasyon
- `ChatView.registerHandlers({ onInviteClick })` → `setInvitesModalOpen(true)`. IncomingInvitesModal açılır, kullanıcı accept/decline yapabilir.
- Server switch agresif değil (kullanıcı modal'dan sunucu adını görür).

### E. Smart filter (scroll-aware)
- `NotifContext.dmAtBottom` eklendi (default true).
- Suppress invariant: `focused && panelOpen && sameConv && dmAtBottom`. Kullanıcı yukarıdaysa (scroll-up, okuma değil) → toast atılır.
- `DMPanel.onNearBottomChange` callback → ChatView state → context sync.

### F. Priority
- `Priority = HIGH | MEDIUM | LOW` (rank 2 / 1 / 0).
- DM = HIGH; invite = MEDIUM.
- **Insert policy**:
  - Kuyruk < cap → newest-first prepend.
  - Kuyruk full: victim = en düşük rank (tie: en eski).
  - `incomingRank >= victimRank` → victim at, incoming başa. (`=` durumunda same-rank newest-first korunur.)
  - `incomingRank < victimRank` → incoming DÜŞER (HIGH toast'lar LOW noise ile bloklanmasın).

### G. Per-category rate
- `lastSoundAt: { dm: 0, invite: 0 }` ayrı bucket.
- DM: 1500ms, invite: 3000ms.
- DM spam'i invite ses'ini bloklayamaz; tam tersi de geçerli.

## Files touched in v2

**Modified:**
- `src/features/notifications/notificationService.ts` — priority queue, dedupe, `dmAtBottom` filter, per-category rate, `_testing` export
- `src/features/notifications/notificationSound.ts` — dual-tone + echo + resource cleanup
- `src/features/notifications/electronAttention.ts` — delayed flash + cancellation
- `src/features/notifications/ToastItem.tsx` — spring motion, glow pulse, MiniEq (DM)
- `src/features/notifications/useNotificationContextSync.ts` — `dmAtBottom` field
- `src/hooks/useDM.ts` — reconnect subscription
- `src/components/DMPanel.tsx` — `onNearBottomChange` callback chain
- `src/views/ChatView.tsx` — `dmAtBottom` state, invite click → modal open

**New:**
- `src/features/notifications/dedupeChannel.ts` — BroadcastChannel + LRU
- `server-backend/src/services/__tests__/notificationDedupe.test.ts` — 7 test
- Extended `notificationFilter.test.ts` — 19 test (filter + priority + rate)

## Validation
- Frontend `tsc --noEmit` **EXIT=0**
- Electron (main.cjs + preload.cjs) + chat-server.cjs `node -c` **SYNTAX OK**
- Backend vitest: **106/106 pass** (9 test file)

## Risks / follow-up v2
- **Reconnect storm**: ağ dalgalı → art arda reconnect olursa her seferinde canonical fetch. Mevcut `load(false)` guard `inFlightRef`; riskli değil ama aşırı ağ traffic olursa debounce eklenebilir.
- **BroadcastChannel eski tarayıcı**: Chromium Electron'da her zaman var; fallback sessiz (yalnızca local dedupe). Sorun ihtimali düşük.
- **AudioContext suspended state**: user gesture olmadan Chrome policy suspend edebilir; `ensureCtx` resume çağırıyor; ilk sesin gelmemesi olası. Pratikte ilk login gesture'ı context'i unlock ediyor.
- **EQ animasyonu** her DM toast için 3 motion bar = hafif CPU ama stagger nedeniyle invisible. Battery mode için future kapatma seçeneği.
- **Invite click server-switch**: isteğe bağlı; kullanıcı agresif nav istemezse ideale yakın. Follow-up: modal'da sunucu highlight.
- **Chat-server offline mesaj replay yok**: reconnect sırasında DM'ler tamamen kaybolursa toast tetiklenmez; unread badge senkronize olur, kullanıcı DM panel'den yakalar.
