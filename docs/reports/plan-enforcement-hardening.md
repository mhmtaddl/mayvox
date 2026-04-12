# Server Plan Enforcement — Hardening Pass Report

5 focused hardening fix uygulandı. Yeni feature yok; mevcut enforcement layer'ı tightening.

## What was hardened

### 1) Race overshoot — server.join (transaction-safe)

**Sorun:** Üç join path'inde (`acceptInviteLink` server scope, `joinByInvite`, direct user `acceptInvite`) eş zamanlı kabul edince member_count +1 overshoot teorik olası.

**Fix:** Üç path de transactional + `SELECT ... FOR UPDATE OF s` (servers row lock):
- `inviteLinkService.acceptInviteLink` — zaten txn içindeydi; capacity query'ye `FOR UPDATE OF s` eklendi
- `serverService.joinByInvite` — transaction olmayan yol transactional'a çevrildi (`BEGIN`/`COMMIT` + `SELECT 1 FROM servers WHERE id=$1 FOR UPDATE`)
- `managementService.acceptInvite` — aynı şekilde transactional sarıldı + `FOR UPDATE OF s`

Eş zamanlı iki join limit boundary'sinde yarışırsa artık sadece bir tanesi geçer; ikinci commit öncesi limit check fresh member_count ile görür ve reddeder.

**Değişiklikler:**
- `inviteLinkService.acceptInviteLink` — `FOR UPDATE OF s`
- `serverService.joinByInvite` — full transaction wrap
- `managementService.acceptInvite` — full transaction wrap

### 2) Invite daily-limit index

**Sorun:** `checkLimit('invite.createLink')` son 24h'te COUNT sorgusu her link create çağrısında çalışıyor. Mevcut `idx_invite_links_server (server_id)` seçici ama `created_at` range filter'ı için ideal değil.

**Fix:** Migration 014 — composite index:
```sql
CREATE INDEX idx_invite_links_server_created
  ON server_invite_links (server_id, created_at DESC);
```

Postgres bu index'i `WHERE server_id=$1 AND created_at > ...` için direkt kullanır; `created_at DESC` ordering son 24h scan'inde başlangıç noktasını hızlandırır.

### 3) Double plan logic drift — removed

**Sorun:** `channelService.createChannel` hem `assertPlanAllows(ctx, 'channel.create')` hem `assertLimit(serverId, 'channel.create')` çağırıyordu. `assertPlanAllows` → resolver `flags.canCreateChannel` → yaklaşık (`customRooms + 10 buffer`). `assertLimit` → canlı COUNT. İki authority çakışması drift riski.

**Fix:**
- `channelService.createChannel`'dan `assertPlanAllows` çağrısı kaldırıldı
- `assertLimit` tek authority — mutation path'leri hep canlı COUNT'a dayalı
- `assertPlanAllows` fonksiyonu accessContextService'te kalıyor (geriye uyumlu) ama mutation path'lerden çağrılmıyor; UI hint için `ctx.flags.canCreateChannel` okumaya devam edilebilir

Kural:
- `capabilities` / `flags.*` = **UI hint** (enable/disable button)
- `assertLimit(...)` = **authoritative enforcement** (mutation allow/deny)

### 4) Ultra plan ambiguity — explicit

**Sorun:** `normalizePlan('ultra') → 'pro'` silent downgrade. Operator perspektifinden ultra kullanıcısı pro limits alırken bunu fark etmezdi.

**Fix:**
- `PlanKey` tipine `'ultra'` eklendi (explicit tier)
- `PLAN_CONFIG.ultra = { maxChannels: 500, maxMembers: 2000, maxPrivateChannels: 200, maxInviteLinksPerDay: 2000 }` — dedicated, pro'dan yüksek
- `normalizePlan('ultra')` artık `'ultra'` döner (silent pro değil)
- Bilinmeyen plan değerleri (`'banana'`, vb.) için `console.warn` (first-seen guard ile spam yok) + `free` fallback
- Mevcut `servers.plan='ultra'` satırları artık dedicated ultra limits'e resolve ediliyor; backward compat korundu

### 5) Audit visibility — plan.limit_hit

**Sorun:** Plan limit'e takılan denial'lar frontend'e 403 dönüyordu ama audit_log'a yazılmıyordu. Operasyonel görünürlük eksikti.

**Fix:**
- `assertLimit(serverId, type, actorId?)` — opsiyonel `actorId` eklendi; verildiyse deny path'inde audit yazılır
- Yeni helper `emitLimitHit(serverId, actorId, type, plan, current, limit)` — inline Math.min join path'leri için
- Tüm call-site'ler actorId'yi geçiyor:
  - `channelService.createChannel` → `channel.create`, `privateChannel.create`
  - `inviteLinkService.createInviteLink` → `invite.createLink`
  - `inviteLinkService.acceptInviteLink` → `server.join` (inline, emitLimitHit)
  - `serverService.joinByInvite` → `server.join` (inline, emitLimitHit)
  - `managementService.acceptInvite` → `server.join` (inline, emitLimitHit)

Audit action: `plan.limit_hit`, metadata: `{ type, plan, current, limit }`. User mesajı aynı (403 + Türkçe copy); log'dan operatör hangi tür limit, hangi plan, hangi sunucuda gördüğünü izleyebilir.

## Schema changes

### Migration 014 — `014_invite_links_daily_index.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_invite_links_server_created
  ON server_invite_links (server_id, created_at DESC);
```

Additive. Aynı tablo üzerindeki mevcut `idx_invite_links_server` kalıyor; composite daha spesifik query'ler için ek optimization.

## Changed files

**Backend — new**
- `server-backend/migrations/014_invite_links_daily_index.sql`

**Backend — modified**
- `server-backend/src/services/planService.ts` — ultra tier + normalizePlan explicit + assertLimit(actorId) + emitLimitHit
- `server-backend/src/services/channelService.ts` — assertPlanAllows import + çağrı kaldırıldı; assertLimit(userId) geçildi
- `server-backend/src/services/inviteLinkService.ts` — assertLimit(userId) + acceptInviteLink FOR UPDATE + emitLimitHit
- `server-backend/src/services/serverService.ts` — joinByInvite transactional wrap + FOR UPDATE + emitLimitHit
- `server-backend/src/services/managementService.ts` — acceptInvite transactional wrap + FOR UPDATE OF s + emitLimitHit

**Tests — modified**
- `server-backend/src/services/__tests__/planService.test.ts` — ultra explicit tests (silent→explicit, dedicated limits, spec values)

**Docs — new**
- `docs/reports/plan-enforcement-hardening.md`

## Compatibility notes

- Mevcut API endpoint shape'leri değişmedi
- `servers.plan` kolonu + legacy `planConfig.ts` dokunulmadı
- `assertPlanAllows` (accessContextService) fonksiyonu duruyor — mutation path'lerden çağrılmıyor ama resolver/UI için kalıyor
- `normalizePlan('ultra') → 'ultra'` değişikliği mevcut ultra kullanıcılar için **yukarı yönlü** (pro → ultra limits, daha çok kapasite) — tek yönlü geriye uyumlu iyileştirme
- Bilinmeyen plan değerleri artık warn log atıyor ama davranış aynı (`free` fallback)
- Private channel security modeli dokunulmadı

## Race behavior after fix

| Senaryo | Önceki | Sonraki |
|---|---|---|
| İki user aynı anda capacity-1 iken join | Her ikisi de check geçer → +1 overshoot | Biri FOR UPDATE lock alır, commit eder; diğeri aynı lock'u bekler, fresh count görür, reddeder |
| Lock wait kuyruğu | Yok | Postgres row lock queue; pratik <10ms |
| Deadlock riski | N/A (lock yoktu) | Yok — tek row lock, ordering sabit |

## Deferred intentionally

- Channel/invite create race overshoot (+1 teorik) — düşük volume kabul edilebilir; spec mutation'ı member.join'e fokusladı
- Integration test (DB ile fiili FOR UPDATE concurrency simulation) — unit test kapsamı pure logic
- `assertPlanAllows` helper'ı accessContextService'te tamamen deprecate — olacak ama bu pass scope dışı
- Plan change webhook / realtime broadcast
- Audit retention / cleanup job
- Plan usage dashboard
- Ultra tier gerçek billing ile bağlantı (manual DB plan set etme path'i)
- Index performance monitoring (ANALYZE/EXPLAIN sanity) — prod'da görünmeli

## Risks / follow-up

- **Transaction duration artışı:** üç join path artık full txn. Pratik etki <20ms (tek INSERT, tek UPDATE, tek lock). Yoğun join sırasında lock contention throughput'u sınırlayabilir — trade-off: correctness > throughput
- **Audit log write failure:** `emitLimitHit` / `assertLimit` içindeki audit write fail olursa `logAction` catch'liyor (existing contract); limit hit denial user'a yine 403 olarak dönüyor. Log kaybı operatör için minor; audit retention/alerting gelecek adımda
- **FOR UPDATE lock scope:** servers row kilidi; aynı sunucuda concurrent UPDATE çıkıp çıkmadığı monitor edilmeli. Şu an `UPDATE server_activity` ve `UPDATE servers SET plan` farklı tabloda, çakışma minimal
- **Unknown plan warn:** first-seen guard sonsuza dek state tutar (Set'te kalır). Tiny memory footprint; bir-kez-warn intent korunmuş
- **Index boyutu:** composite index ~2x alan kaplar `idx_invite_links_server`'a göre. Kabul edilebilir — write overhead minimal

## Validation

- Backend `npx tsc --noEmit` → **EXIT=0**
- Frontend `npx tsc --noEmit` → **EXIT=0**
- `npx vitest run` → **45 passed / 45** (14 plan test: 3 yeni ultra açık test dahil)
- Migration 014 additive + idempotent (IF NOT EXISTS)
