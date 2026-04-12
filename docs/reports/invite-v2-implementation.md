# Invite V2 — Implementation Report

## Summary

Invite sistemi artık first-class domain object: **hash-based shareable link invite'lar**, lifecycle (active/expired/revoked/exhausted), server+channel scope, transactional acceptance, audit entegrasyonu. Direct user invite v1 ve legacy short-code join akışı değişmedi — v2 ayrı lane olarak geldi. Capability foundation (`invite.create`, `invite.revoke`) kullanıldı — yeni capability eklenmedi.

## Schema changes

### Migration 012 — `012_invite_links.sql`

```sql
CREATE TABLE server_invite_links (
  id UUID PK,
  server_id UUID FK → servers ON DELETE CASCADE,
  channel_id UUID FK → channels ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  scope VARCHAR(20) NOT NULL,  -- 'server' | 'channel'
  token_hash TEXT UNIQUE NOT NULL, -- sha256(hex)
  expires_at TIMESTAMPTZ,
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CHECK (scope='server' AND channel_id IS NULL) OR
      (scope='channel' AND channel_id IS NOT NULL);

INDEX idx_invite_links_server, idx_invite_links_channel
UNIQUE constraint on token_hash
```

Additive — mevcut `server_invites` (v1 short-code) ve `server_user_invites` (v1 direct-user) dokunulmadı.

## New routes / services

### Backend services
- `server-backend/src/services/inviteLinkService.ts` — yeni
  - `generateInviteToken()` — crypto.randomBytes(24) → base64url (~32 char, 192-bit entropy)
  - `hashInviteToken(raw)` — sha256 hex
  - `createInviteLink(serverId, userId, input)` — capability-gated
  - `listInviteLinks(serverId, userId, opts)` — capability-gated
  - `revokeInviteLink(serverId, userId, inviteId)` — capability-gated
  - `previewInviteLink(rawToken)` — safe metadata only, valid/invalid fail-closed
  - `acceptInviteLink(userId, rawToken)` — transactional accept (FOR UPDATE lock), idempotent
  - `computeState(row)` — state machine: active/expired/revoked/exhausted
- `server-backend/src/routes/inviteLinks.ts` — yeni (accept + preview)

### Backend routes
- `POST /servers/:sid/invite-links` — create (capability `invite.create`)
- `GET  /servers/:sid/invite-links?channelId=&includeInactive=` — list
- `DELETE /servers/:sid/invite-links/:iid` — revoke (`invite.revoke`)
- `GET  /invite-links/preview?token=` — public (auth optional), safe preview
- `POST /invite-links/accept` — authenticated, transactional

### Frontend
- `src/lib/serverService.ts` — yeni API'ler: `createInviteLink`, `listInviteLinks`, `revokeInviteLink`, `previewInviteLink`, `acceptInviteLink`
- `src/components/server/JoinServerModal.tsx` — token detection (length+charset heuristic), legacy 8-char code ve v2 token aynı input'tan. Uppercase normalizasyonu sadece legacy length'te (≤10).
- `src/components/server/ChannelAccessModal.tsx` — "Davet Linki Oluştur" bölümü (7 gün / 25 kullanım default), create + copy-to-clipboard + success state.

## Security decisions

**Token handling**
- 192-bit entropy (crypto.randomBytes(24))
- base64url encoding — URL-safe, case-sensitive
- Raw token **yalnızca** `createInviteLink` response'unda döner; bir daha asla görünmez
- DB'ye sadece SHA-256 hex hash saklanır
- Lookup: incoming token → hash → `SELECT ... WHERE token_hash = $1`
- Raw token hiçbir log'a yazılmaz (audit metadata'da bile yok)

**Enumeration protection**
- Tüm accept failure path'leri tek generic mesaj döner: `"Davet bağlantısı geçersiz veya süresi dolmuş"`
- 404/400/410 ayrımı yok — attacker'a revoked vs expired vs exhausted sızdırılmaz
- Ban durumu **ayrı mesaj** (generic error kuralından sapma) — bu bilinçli çünkü ban bilgisi zaten user-visible

**Race conditions**
- Accept içinde `SELECT ... FOR UPDATE` row-level lock
- used_count artışı ve insert aynı transaction
- Duplicate membership/grant idempotent (ON CONFLICT DO NOTHING), `alreadyApplied=true` işareti döner

**Capacity / ban checks**
- Server scope: capacity kontrol + ban kontrol transaction içinde
- Channel scope: önce server membership kontrolü (üye değilse reddedilir), sonra grant

**Input validation**
- `maxUses`: 1..1000
- `expiresInHours`: >0, max 365 gün
- Token input: 28-40 char, URL'den son segment extract
- Scope/channel_id constraint DB CHECK ile de korunuyor

**Transaction audit**
- `invite.accept` audit satırı aynı transaction içinde — mutation ile ACID atomic

## Compatibility notes

**Ne değişmedi (backward compat):**
- `server_invites` tablosu ve 8-char `code` join flow (`joinByInvite`)
- `server_user_invites` tablosu ve realtime direct-user invite akışı
- Mevcut `managementService.createInvite/deleteInvite/sendUserInvite/cancelUserInvite` — v1 akışı aynı
- Frontend'te `getMyInvites`, `acceptServerInvite`, `declineServerInvite` ve `IncomingInvitesModal` — v1 davetler çalışmaya devam ediyor
- `joinServer(code)` API v1 için varlığını koruyor

**Ne unifikasyon edildi:**
- `JoinServerModal` tek input hem v1 hem v2'yi kabul ediyor — token length heuristic ile akışı seçiyor

**Ne kasıtlı olarak ayrı kaldı:**
- Direct user invite (v1 `server_user_invites`) — v2'ye migrate edilmedi; farklı semantic (targeted, realtime push, not shareable)
- Short-code join (v1 `server_invites`) — legacy eski client'lar için korunuyor; ileride v2'ye yönlendirilip deprecate edilebilir

## What stayed intentionally separate

- `server_invites` (v1 short-code) — join-by-code akışı eski. Kullanıcılar yeni link invite'a otomatik geçiyor; v1 tablosu "read-only backward compat" olarak kalacak
- `server_user_invites` (v1 direct-user) — realtime bridge entegrasyonu ile ayrı domain; link invite'a dönüştürmek yanlış olurdu (scope farklı)
- `managementService.createInvite/deleteInvite` — v1 short-code CRUD; v2 link CRUD ile çakışmaz
- **İleride unification önerisi:** `createInvite(v1)` → `createInviteLink(v2, scope='server')` redirect'i, short-code tablosu frozen. Ama bu round kapsam dışı; deprecation path ayrı sprint.

## Audit integration

Her v2 action audit_log'a yazılır:
- `invite.create` — scope, channelId, expiresAt, maxUses metadata
- `invite.revoke` — inviteId
- `invite.accept` — scope, channelId, alreadyApplied metadata (transactional)

`audit_log` tablosu capability foundation hardening pass'inde kuruldu; schema değişmedi.

## Capability integration

Reuse-only:
- `invite.create` → create + list
- `invite.revoke` → revoke

Accept endpoint capability-gated değil (herkesin daveti kabul etme hakkı var); sadece authenticated.

SYSTEM_ROLE_CAPS değişmedi — mevcut owner/admin zaten `invite.create`'e sahip, moderator `invite.revoke`'a sahip. Member accept edebilir (auth yeterli).

## Follow-up recommendations

1. **v1 short-code deprecation path** — `createInvite`'i `createInviteLink(scope='server')` alias'ına çevir, `server_invites` table read-only
2. **List UI** — admin surface (ServerSettings) için `listInviteLinks` kullanarak yönetim paneli; şu an sadece create flow var
3. **Preview UX** — accept öncesi modal'da sunucu/kanal adını göster (preview API hazır, UI eklenmeli)
4. **Rate limit** — accept endpoint'i için per-user limiter (brute-force guard) — şu an token entropi güçlü ama defense-in-depth için
5. **Invite telemetry** — `invite.accept` audit + `used_count` grafik/dashboard
6. **Link format** — frontend "copy link" şu an raw token kopyalıyor; ileride deep-link URL format (`mayvox://invite/{token}` veya `https://cylksohbet.org/invite/{token}`)
7. **Expiry reminder** — sahip için "davet süresi bitiyor" UI bildirimi

## Risks / deferred items

**Risks**
- `max_uses` race: `FOR UPDATE` lock çözüyor ama DB'de connection pool limitini aşan concurrent accept'lerde throughput düşebilir (practice edge case)
- Token enumeration: 192-bit entropi pratik olarak immune, ama eğer gelecekte token length kısaltılırsa düşünmek lazım
- Audit log: accept içi audit transaction'da; audit tablosu write-locked olsa accept da bekler (tolerate edilebilir)
- Frontend clipboard API permissions — edge case'lerde copy button çalışmayabilir, token ekranda zaten görünür (select-all fallback)

**Deferred intentionally**
- Full admin invite management UI (list/revoke panel with table)
- Deep-link URL scheme (raw token yeterli bu fazda)
- Invite analytics dashboard
- Temporary guest session scope
- v1 short-code deprecation migration
- Per-user invite rate limit
- Preview modal (backend hazır, UI defer)

## Validation

- Backend `npx tsc --noEmit` → **EXIT=0**
- Frontend `npx tsc --noEmit` → **EXIT=0**
- `npx vitest run` → **31 passed / 31** (6 invite-specific, 25 foundation)
- Migration 012 additive + CHECK constraint validated

---

## Hardening patch (3 focused iyileştirmeler)

İlk implementasyon sonrası uygulanan cerrahi hardening'ler — scope dışına çıkılmadı, refactor yok.

### 1) Accept rate limit

Dosya: `server-backend/src/routes/inviteLinks.ts`

- **5 istek / 30 sn** per-user (fallback: IP) sliding window
- Success ve failure her ikisini sayar — brute-force token probing guard
- In-memory `Map<key, {count, resetAt}>` pattern (chat-server `userTokenLimits` ile tutarlı)
- 5 dk'da bir expired entry GC (`setInterval().unref()`)
- Limit aşıldığında **429** + `[invite-accept] rate-limited key=...` log
- Sadece `POST /invite-links/accept` için — preview/create/list/revoke etkilenmez

### 2) Idempotent accept

Dosya: `server-backend/src/services/inviteLinkService.ts`

- `server_members` INSERT → `ON CONFLICT (server_id, user_id) DO NOTHING`
- Eğer satır zaten eklenmişse (paralel request race): `rowCount === 0` → `alreadyApplied = true`
- Aksi hâlde: `server_activity.member_count` artır + sistem rolüne bağla
- `channel_access` INSERT zaten `ON CONFLICT DO NOTHING` kullanıyordu (önceki implementasyon)
- Duplicate key error asla fırlamaz; response tutarlı olarak `{ alreadyApplied: bool }`
- Transaction semantiği korundu — FOR UPDATE lock + atomic audit hâlâ aktif

### 3) Pagination guard

Dosya: `server-backend/src/services/inviteLinkService.ts`

- `listInviteLinks`: `ORDER BY created_at DESC LIMIT 50` (önceki 100'den 50'ye düşürüldü, order zaten vardı)
- Sunucu başına büyük invite geçmişi için bound — server-side memory güvencesi

### Breaking changes

**Yok.** API shape aynı, endpoint path aynı, response type aynı. Race durumunda mutation sayısı azalabilir (idempotent) — bu davranış iyileşmesi, breaking değil.

### Test sonucu

`npx vitest run` → **31 passed / 31** (hardening öncesi ile aynı, regresyon yok).
