# Server Plan Enforcement — Implementation Report

## Summary

Plan enforcement **foundation layer** kuruldu. Capability sisteminden orthogonal: `capability = yapabilir mi?`, `plan = ne kadar?`. Billing/pricing UI yok; sadece backend hard-limit katmanı. Mevcut `planConfig.ts` ve `servers.plan` kolonu **dokunulmadı** — yeni sistem parallel çalışıyor, resolution order ile eski kayıtlar otomatik respect ediliyor.

## Schema change

### Migration 013 — `013_server_plans.sql`

```sql
CREATE TABLE server_plans (
  server_id  UUID PK REFERENCES servers(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_server_plans_plan ON server_plans(plan);
```

Additive. Backfill yok; resolution order (server_plans.plan → servers.plan → 'free') eksik satırları handle ediyor.

## Plan config (fixed, hardcoded — NOT DB-driven yet)

```ts
PLAN_CONFIG = {
  free: { maxChannels: 10,  maxMembers: 50,  maxPrivateChannels: 3,  maxInviteLinksPerDay: 20 },
  pro:  { maxChannels: 100, maxMembers: 500, maxPrivateChannels: 50, maxInviteLinksPerDay: 500 },
}
```

Legacy `ultra` plan → `pro` olarak normalize (V1 mapping; dedicated tier sonraki faz).

## New service: `planService.ts`

API:
- `getServerPlan(serverId): Promise<PlanKey>` — resolution: `server_plans.plan → servers.plan → 'free'`
- `normalizePlan(raw): PlanKey` — bilinmeyen/null → `free`, `ultra` → `pro`
- `getPlanLimits(plan): PlanLimitSet` — config lookup
- `checkLimit(serverId, type): Promise<LimitCheck>` — canlı COUNT, `{ allowed, limit, current, reason }`
- `assertLimit(serverId, type): Promise<void>` — fail (throw AppError 403) on limit

LimitType: `'channel.create' | 'privateChannel.create' | 'invite.createLink' | 'server.join'`

`incrementUsage` yok — spec uyarınca canlı COUNT yeterli.

## Enforcement points (surgical injections)

| Path | Limit | Uygulama |
|---|---|---|
| `channelService.createChannel` | `channel.create` | `assertLimit` mutation ÖNCESİ |
| `channelService.createChannel` (private) | `privateChannel.create` | `isHidden \|\| isInviteOnly` ise ayrıca assert |
| `inviteLinkService.createInviteLink` | `invite.createLink` | mutation öncesi (son 24 saat COUNT) |
| `inviteLinkService.acceptInviteLink` (server scope) | `server.join` | `Math.min(server.capacity, plan.maxMembers)` inline replace (mevcut capacity check'i genişletti) |
| `serverService.joinByInvite` | `server.join` | aynı pattern |
| `managementService.acceptInvite` (direct user invite) | `server.join` | aynı pattern |

**Pattern seçimi:**
- Channel + invite create: `assertLimit` kullandı (COUNT + limit + throw)
- Server.join noktaları: `Math.min(capacity, maxMembers)` inline (mevcut capacity query'yi bozmadan minimal değişim)

## Decisions

- **Parallel system:** `planConfig.ts` ve `servers.plan` kolonu dokunulmadı. `server_plans` yeni birincil kaynak, eski ikinci katman fallback. Eski kod olduğu gibi çalışmaya devam eder
- **Resolution order:** DB'den tek query ile `LEFT JOIN server_plans` — eski/yeni plan değerini aynı satırda getirir
- **Math.min semantic:** `server.capacity` (legacy kolon) ve `plan.maxMembers` (yeni config) — **hangisi kısıtlayıcıysa o uygulanır**. Plan küçültülürse mevcut kapasite de küçülür; spec'e uygun
- **Live counting:** COUNT her check'te tekrar; cache yok. Pratik yeterli; race window edge-case (aşağıda risk)
- **Ultra → pro mapping:** legacy `ultra` plan satırları pro limits'e mapleniyor (geriye uyumlu; ileride ayrı tier eklenirse PLAN_CONFIG'e entry)
- **Capability orthogonality:** `assertCapability` permission, `assertLimit` constraint. İki ayrı helper; asla karışmaz
- **Error semantic:** her limit tipi Türkçe kullanıcı mesajı ile 403; detaylı metadata `LimitCheck.reason` log'a gidiyor

## Compatibility

- Mevcut endpoint shape'leri aynı
- Mevcut `planConfig.ts` içindeki `PLANS` ve `getPlanLimits` (eski shape) API'sini kullanan kodlar etkilenmedi (accessContextService hâlâ legacy `customRooms`/`capacity` şemasıyla çalışıyor)
- Frontend değişmedi — spec'e göre UI ayrı faz
- Eski `servers.plan` kolonu var olmaya devam; yeni createServer flow'u bunu doldurmaya devam ediyor
- Migration 013 idempotent (IF NOT EXISTS)

## Tests

`server-backend/src/services/__tests__/planService.test.ts` — **11 test:**
- free/pro plan config numaraları spec ile uyumlu
- normalizePlan: null/unknown/free/pro/ultra mapping
- getPlanLimits lookup
- Math.min semantic (capacity ≤ maxMembers + maxMembers ≤ capacity)

Tüm suite: **42/42 passed**.

Runtime enforcement path'leri (channel.create, invite.createLink, server.join) DB-integrated; unit test kapsam dışı. Integration test sprint gelecek fazda.

## Deferred intentionally

- Billing / Stripe / checkout
- Subscription UI / pricing page
- Admin panel (plan upgrade/downgrade action)
- DB-driven plan config (PLAN_CONFIG TS'de hardcoded)
- Usage analytics dashboard
- Per-user entitlement (server plan ≠ user plan)
- Dynamic tier editor
- Plan change event emission / webhooks
- Ultra tier dedicated config (şimdi pro ile aynı)

## Risks / follow-up

### Concurrency / race windows
- Channel + invite create: check → mutation arasında başka request INSERT ederse teorik olarak +1 overshoot mümkün. Pratikte volume düşük (aynı admin aynı anda iki kanal oluşturmaz). Mitigasyon gerekirse `SELECT pg_advisory_lock(hashtext('server:plan:'||serverId))` veya `SELECT FOR UPDATE` servers row üzerinde
- Invite daily 24h pencere: clock skew veya timezone drift teorik +1 etkileyebilir (önemsiz)
- Server.join: zaten transaction içinde (acceptInviteLink / joinByInvite), capacity okuma + INSERT aynı commit'te; + `FOR UPDATE` mevcut invite row'da var. Server row FOR UPDATE yok — iki kullanıcı ayrı invite ile aynı anda kabul ederse tek overshoot mümkün. Kabul edilebilir, billing-critical olduğunda sertleştirilir

### İzleme
- Rate-limit reached cases audit_log'a yazılmıyor — frontend'te kullanıcı 403 görüyor, backend log'unda görünür değil. Sonraki fazda `plan.limit.reached` audit event eklenmeli
- LimitCheck.reason metadata şu an sadece error path'inde user mesaja dönüyor; detaylı log gerekli olabilir

### Next steps
1. Admin panel: plan görüntüleme + manuel upgrade/downgrade
2. Stripe webhook → `server_plans` update flow
3. UX: limit yaklaşıldığında progress bar + upgrade CTA
4. Plan change audit + realtime broadcast
5. User entitlement katmanı (plan'ı user-level kapasitelerle genişletme)
6. `ultra` tier dedicated config

## Validation

- Backend `npx tsc --noEmit` → **EXIT=0**
- Frontend `npx tsc --noEmit` → **EXIT=0** (frontend dokunulmadı)
- `npx vitest run` → **42 passed / 42** (11 yeni plan test)
- Migration 013 additive + FK CASCADE validated
