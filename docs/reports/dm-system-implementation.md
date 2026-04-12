# DM v1 — Hardening Report

## Summary

DM v1 önceki oturumlarda (chat-server.cjs SQLite + WS + DMPanel) tamamen kurulmuş, Hetzner'da canlı. Bu tur **yeniden yazmak değil**, mevcut sistemi sertleştirmek için yapıldı. PostgreSQL'e taşıma, paralel sistem veya protokol değişikliği yok. Değişim yüzeyi dar: chat-server audit bridge + enrichment, server-backend'de yeni internal route, friendship fail-closed mantığı ve testleri.

## Schema changes

**Yok.** Mevcut SQLite tabloları (`dm_conversations`, `dm_messages`, `dm_conversation_hidden`) dokunulmadı. PostgreSQL migration yok.

## API surface

**Yeni backend route (internal-only):**

| Endpoint | Method | Erişim | Amaç |
|---|---|---|---|
| `/internal/audit` | POST | loopback + `x-internal-secret` + `action` whitelist (`dm.*`) | chat-server'dan audit köprüsü |

Public DM API değişikliği **yok**. Tüm DM akışı hâlâ chat-server WS üzerinden:
- `dm:conversations`, `dm:open`, `dm:send`, `dm:mark_read`, `dm:unread_total`, `dm:hide_conversation`.

**WS payload değişikliği:**
- `dm:conversations` artık `recipientName` + `recipientAvatar` içerir (chat-server tarafında profil batch fetch + 60s TTL cache). Frontend zaten opsiyonel field bekliyordu; fallback akışı kırılmadı.

## Realtime approach

Mevcut yaklaşım aynen korundu:
- Client ↔ chat-server WebSocket (SQLite persistence).
- Server-backend → chat-server tek yönlü HTTP push (`/internal/notify-user`) — önceki durum.
- **Yeni ters yön:** chat-server → server-backend HTTP push (`/internal/audit`) — fire-and-forget, 1.5s timeout, DM akışını bloklamıyor.
- Shared secret: `INTERNAL_NOTIFY_SECRET` (env) — her iki yönde de aynı; yeni secret yok.
- Defense-in-depth: her iki endpoint hem loopback filtresi hem shared-secret kontrolü uygular.

## Auth / privacy decisions

- DM'ye yalnızca arkadaş olan iki kullanıcı erişebilir (unchanged).
- `checkFriendship` artık **fail-closed**: geçersiz/empty/self-pair → `false`; Supabase error → `false`; row schema uyumsuzsa (zehirlenmiş/drift) → `false`. Schema verification `user_low_id` + `user_high_id` karşılaştırmasıyla yapılır.
- `dm.message.send` audit metadata'sı yalnızca `{ conversationKey, recipientId, textLength, conversationCreated }` içerir — **mesaj gövdesi audit'e ASLA yazılmaz**.
- `dm.conversation.create` audit'i yalnızca ilk INSERT'te atılır (SQLite `changes > 0` kontrolü).
- Internal audit endpoint `action` alanını `dm.*` prefix'iyle kısıtlar — chat-server shared-secret'a sahipse bile başka action'a audit yazamaz (capability genişlemesin).

## Read / unread model

Değişmedi:
- Message-id yerine `read_at` kolonu (per-message) + `receiver_id + read_at IS NULL` index.
- Unread sayımı `COUNT(*)` subquery ile `dm:conversations` response'unda gelir.
- Karşı tarafa `dm:read` event'i anlık push.

## Anti-abuse decisions

- **Rate limit (zaten vardı, dokunulmadı):** 8 mesaj / 10 sn / user sliding window (`userDmLimits`). Aşıldığında `dm:error` ile generic mesaj.
- **Body length:** 2000 char hard limit; trim sonrası boş mesaj reddedilir.
- **Friendship gate:** her `dm:send` / `dm:open` çağrısında yeniden doğrulanır (cache yok — arkadaşlıktan çıkılırsa anlık etkili).
- **Self-DM yok:** canonical pair logic'i aynı ID'yi reddeder.
- **Audit best-effort:** audit bridge timeout/5xx verse bile DM teslimatı devam eder; operator log'dan tespit eder (mutation değil, monitoring amaçlı).
- **Internal audit whitelist:** `action` prefix'i `dm.` dışındakiler 400 döner — shared-secret kaçaksa bile yetki genişlemesi yok.

## Tests

`server-backend/src/services/__tests__/dmFriendship.test.ts` (15 test):

**`canonicalPair`:**
- a<b ve b<a simetrisi
- self-ID (same user) → null
- empty/whitespace → null
- non-string (null/undefined/number/object) → null

**`interpretFriendshipResult`:**
- eşleşen satır → true
- null/undefined/boş array → false
- array tek satır → true
- low/high uyumsuzluğu (zehirlenmiş satır) → false
- boş/string data → false

Total: **60/60 test pass** (45 mevcut + 15 yeni).

Typecheck: backend `tsc --noEmit` **EXIT=0**; frontend `tsc --noEmit` **EXIT=0**.

## Intentionally deferred

- SQLite → PostgreSQL DM migration
- REST history endpoint (chat-server WS yeterli)
- Group DM, attachments, reactions, typing indicator, edit/delete history, forwarding, pinning, encryption, voice/video DM
- Admin DM moderation panel (privacy-first; audit metadata yeterli)
- DM panel mobile uyumu + sağ panel resize (UX kuyruğunda)
- Unread scroll davranışı polish

## Risks / follow-up

- **Profile cache 60s TTL:** arkadaş ismini/avatarını değiştirirse DM listing 60 sn geç güncellenir. Acceptable trade-off.
- **Audit bridge tek yönlü loopback varsayıyor:** chat-server + server-backend ayrı host'ta çalışırsa loopback filtresi `/internal/audit`'i bloklar → nginx/internal network adresi eklenmeli. Şu an aynı Hetzner host'unda, sorun yok.
- **Supabase `friendships` tablosu tek kaynak:** RLS/replication gecikmesi oluşursa DM'de yanlış pozitif ret olabilir — fail-closed yaklaşımıyla güvenli ama kullanıcıya "arkadaş değilsin" hatası geçici çıkar.
- **Friendship testleri mantık düzeyinde:** gerçek Supabase query testi yok (integration tier). Chat-server `checkFriendship` aynı invariant'ı uygular ama unit test edilmedi (cjs script, export yok).
- **Audit bridge başarısızlığı sessiz:** DM sürer, audit kaybolur. Operator için prod'da `[audit]` warn log izlenmeli.
