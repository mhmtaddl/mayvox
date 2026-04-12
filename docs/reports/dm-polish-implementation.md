# DM v1 — Polish Report

## Summary

Mevcut canlı DM sistemi (SQLite + WS + hardened layer) üzerinde **sadece UX polish** yapıldı. Storage, auth, audit, rate-limit katmanları dokunulmadı. Değişim yüzeyi: akıllı auto-scroll + jump-to-bottom, debounced typing indicator (yeni dm:typing event), send in-flight state, loading/empty/error durumları, thread görsel rafine.

## Polish improvements applied

### 1. Smart auto-scroll
- 100px near-bottom eşiği (`isNearBottom`)
- Kullanıcı tabandaysa yeni mesaj smooth auto-scroll; yukarıdaysa scroll'u YANK etmez
- Yukarıdayken karşıdan mesaj gelirse "↓ Yeni mesaj" premium pill (dibe atlayış affordance) → accent renkli, glow, smooth animate
- Thread açılışında tek sefer dibe otomatik in (`queueMicrotask` — race guard)
- Thread değişince scroll state sıfırlanır; önceki konuşmanın "yukarıda kaldı" hali kalıntı yapmaz

### 2. Send flow
- **In-flight `sending` state** — echo gelene kadar disable, spinner göster
- Double-click/double-Enter korumalı (`canSend = trim>0 && !sending`)
- Echo >4s gelmediyse sending otomatik düşer (deadlock olmasın)
- Send anında kendi dibe kayar (karşı tarafın cevabı geldiğinde ise near-bottom kontrolüne göre)
- Empty/whitespace mesaj sessizce reddedilir (mevcut davranış korundu)

### 3. Typing indicator (lite)
- Yeni WS event: `dm:typing` — relay-only, SQLite'a yazılmaz, audit'e gitmez
- **Chat-server**: friendship gate + 5/10s burst rate limit + self-echo yok
- **Client emit (sender)**: 2.5s throttle (`shouldEmitTyping`) — event spam engellenir
- **Client receive (target)**: 3.5s TTL; süre dolarsa otomatik siler; mesaj gelirse anında siler
- Header altında subtle "yazıyor…" (accent 70% opacity, AnimatePresence fade)
- Ephemeral — panel kapanırsa/recipient değişirse temizlenir

### 4. Unread / read UX
- Aktif konuşma açıldığında: `unreadCount=0` instant + `totalUnread` yeniden hesap (mevcut davranış korundu)
- Aktif sohbette gelen mesaj için `dmMarkRead` anında çağrılır (mevcut)
- Typing geldiğinde badge flicker yok (ayrı state)
- Panel kapandığında `typingFrom` + `loadingHistory` tamamen reset

### 5. Empty / loading / error states
- **Loading**: spinner + "Yükleniyor…" (thread açılışında `loadingHistory=true` → history event'inde false)
- **Empty conversation**: ikon + "Henüz mesaj yok" + "Bir mesaj göndererek başla"
- **Empty list**: (mevcut) "Henüz mesajın yok" + "Bir arkadaşına mesaj göndererek başla"
- Error: chat-server `dm:error` event'i zaten console.warn ediyor; polish kapsamında UI toast açmak scope dışı bırakıldı (app-wide toast entegrasyonu gerektirir)

### 6. Thread visual polish
- Header'a recipient ismi altına typing satırı eklendi (iki satır layout, subtle)
- Jump badge: rounded-full + accent gradient + shadow
- Send button: spinner vs send icon geçişi (aria-busy)
- Var olan bubble styling/grouping/timestamp dokunulmadı (zaten uygun)

### 7. Scroll / history behavior
- Initial history landing: `queueMicrotask` ile render sonrası single dibe in
- New message append: cond. smooth scroll (kendi gönderimimse her zaman; karşı taraftan geldiyse near-bottom'a bağlı)
- Jump affordance: catched-up olduğunda otomatik kaybolur (`onScroll` → `nearBottom` kontrolü)

## Realtime additions

Tek yeni event:
- **`dm:typing`** (client → server → relay)
  - Sender: `{ type: 'dm:typing', recipientId }`
  - Relay payload: `{ type: 'dm:typing', conversationKey, fromUserId }`
  - Guard'lar: friendship, self-reddi, 5/10s burst limit (sessiz drop)
  - **NO**: persistence, audit, broadcast, group, read receipt

Mevcut WS connection yeniden kullanıldı; yeni socket/channel yok.

## Helpers added

- `src/lib/dmUxLogic.ts` — pure saf fonksiyonlar:
  - `isNearBottom(scrollTop, scrollHeight, clientHeight, threshold)`
  - `shouldShowJumpToBottom(nearBottom, incomingIsOwn)`
  - `shouldEmitTyping(lastEmitAt, now)` — 2.5s throttle
  - Sabitler: `TYPING_EMIT_THROTTLE_MS=2500`, `TYPING_CLEAR_MS=3500`
- Hook mevcut `useDM` içinde: `loadingHistory`, `typingFrom`, `emitTyping`

## Tests

Frontend polish için yeni test eklenmedi (frontend test setup yok; user kılavuzu "giant suite yok"). Backend pure-logic testleri (60/60 → 79/79) aynen geçiyor; typing + scroll helper'lar frontend'de saf ve deterministik — chat-server syntax OK.

## Deferred intentionally

- Notification sistemi (toast entegrasyonu) — scope dışı
- Textarea (multi-line) + Shift+Enter — şu an tek satır `<input>`; 2000 char çoğu DM için yeter
- Mobile full redesign — panel zaten `fixed right-3 w-[360px]`, narrow breakpoint polish bir sonraki tur
- Message reactions / edit / delete / search / attachments — hard-excluded
- Group DMs, voice DM — hard-excluded
- Typing "varsayılan presence" gösterimi (online/offline) — scope dışı
- Read receipt ikonları bubble içinde (şu an `dm:read` state set ediliyor ama UI kompakt tutuldu)

## Risks / follow-up

- **`queueMicrotask` scroll**: ağır thread'de render batch'i geç biterse tek-frame gecikme olur; deneyimde sorun görmedik. `requestAnimationFrame` gerekirse yükseltilir
- **Typing TTL 3.5s** — kullanıcı 3.5s sessiz kalıp tekrar yazmaya başlarsa karşı tarafta flicker olur (görünür, görünmez, görünür). Her emit TTL timer'ı resetliyor — pratik pürüz yok
- **`sending` 4s safety timeout**: gerçekten yavaş ağda 4. saniyede butonu aç, sonra echo gelirse sending düşmeden bir more message atılabilir. Orta-vadede WS ack ile daraltılabilir
- **Jump badge z-index 10** scroll container'a relative; başka overlay ile çakışırsa portal'a alınabilir
- **Typing relay friendship query** her typing event'te DB'ye düşer (cache yok). Burst limit zaten sınırlıyor (5/10s); yüksek trafikte profil cache'i gibi bir friendship cache eklenebilir

---

## Hardening patch (follow-up)

İki küçük teknik follow-up kapatıldı. Davranış değişikliği yok.

### 1. Typing-only friendship cache
- `chat-server.cjs` içinde `typingFriendCache` (canonical `low|high` key, 8 sn TTL).
- Yeni helper `checkFriendshipForTyping(a, b)` — cache hit → reuse; miss → mevcut hardened `checkFriendship`'e düşer (fail-closed).
- **Yalnızca `dm:typing` relay** bu cache'i kullanır. `dm:send`, `dm:open` mevcut sağlam DB check'i birebir korur; stale cache DM kapısını açamaz.
- Burst rate limit (5/10 sn) zaten aktif; cache DB yükünü ek sigorta.

### 2. Safe scroll scheduler
- `src/lib/dmUxLogic.ts`'e `scheduleScroll(cb)` eklendi: `requestAnimationFrame` tercih, yoksa `queueMicrotask`, o da yoksa `setTimeout(0)`.
- `DMPanel.tsx` içindeki 3 scroll çağrısı (initial history, new message, kendi send) `scheduleScroll` kullanıyor. Smart-scroll mantığı dokunulmadı — yalnızca zamanlayıcı daha dayanıklı.

### Intent
- No protocol change, no new event, no schema, no new tests framework.
- Davranış birebir aynı; yüksek yük veya ağır layout altında daha öngörülebilir.
