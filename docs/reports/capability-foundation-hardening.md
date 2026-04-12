# Capability Foundation — Hardening Pass Report

Önceki turda (`capability-foundation-implementation.md`) kurulan foundation'ın üzerine yeni feature inşa etmeden önce 6 alanda sertleştirme yapıldı.

## A. Executive summary — ne sertleştirildi

1. **Resolver N+1 giderildi:** roles + capabilities tek JOIN sorgusu (3 query → 2 query)
2. **Merkezi flag derivation:** `computeFlags(capabilities, limits, channelCount)` tek fonksiyon; capabilities[] raw truth, flags UX convenience — duplike mantık yok
3. **In-process cache:** 5 sn TTL, `userId:serverId` keyli Map; mutation path'lerinde `invalidateAccessContext` ile invalide ediliyor
4. **Capability ↔ DB drift koruması:** startup'ta `validateCapabilitySync()` — kodda tanımlı ama seed edilmemiş ya da DB'de var ama kodda yok olan capability'leri tespit eder; `CAPABILITY_SYNC_STRICT=1` iken process exit, aksi hâlde warn
5. **Audit log transaction consistency:** `logAction` opsiyonel `client?: PoolClient` kabul eder — transactional path'te (channel reorder) mutation ile aynı txn içinde yazılır; diğer path'lerde `await` (fire-and-forget `void` kaldırıldı)
6. **Frontend legacy fallback azaltıldı:** LeftSidebar'daki `currentUser.isAdmin` global platform-admin fallback'i `serverAdminFallback = activeServerRole === 'owner' || 'admin'` server-specific check ile değiştirildi; `canMoveMembers` flag'i user drag için ilk kez kullanılıyor

---

## B. Changed files

### Backend
- `server-backend/src/services/accessContextService.ts` — **büyük refactor**: single-query JOIN role+cap, `computeFlags` export, `invalidateAccessContext(userId, serverId)` + `invalidateAccessContextForServer(serverId)`, in-process cache with TTL + GC
- `server-backend/src/services/capabilitySyncService.ts` — **yeni**: `validateCapabilitySync`, `assertCapabilitySyncOnStartup(strict)`
- `server-backend/src/services/auditLogService.ts` — `logAction(entry, client?)` imzası; txn client aktarılırsa hata yukarı, yoksa warn
- `server-backend/src/services/channelService.ts` — `invalidateAccessContextForServer` çağrıları (create/delete); reorder audit transaction içine alındı; `void logAction` → `await logAction`
- `server-backend/src/services/channelAccessService.ts` — `void logAction` → `await logAction`
- `server-backend/src/services/managementService.ts` — `invalidateAccessContext(userId, serverId)` çağrıları (kick, changeRole, acceptInvite), `invalidateAccessContextForServer` (updateServer); `void logAction` → `await logAction`
- `server-backend/src/index.ts` — startup'ta `assertCapabilitySyncOnStartup(strict)` çağrısı + `CAPABILITY_SYNC_STRICT` env

### Frontend
- `src/features/chatview/components/LeftSidebar.tsx` — `serverAdminFallback` tanımı, `canMoveMembers` flag kullanımı, `currentUser.isAdmin` fallback'leri server-scoped check'lere dönüştürüldü

### Tests
- `server-backend/src/services/__tests__/computeFlags.test.ts` — **yeni**, 6 test (capability/limit/count kombinasyonları)
- `server-backend/src/services/__tests__/capabilitySync.test.ts` — **yeni**, 3 test (code const iç tutarlılık)

### Docs
- `docs/reports/capability-foundation-hardening.md` — bu rapor

---

## C. Validation notes

```bash
# Backend typecheck
cd server-backend && npx tsc --noEmit   # EXIT=0

# Backend tests
npx vitest run                           # 25 passed / 25 (3 test dosyası)

# Frontend typecheck
cd .. && npx tsc --noEmit                # EXIT=0
```

### Cache behavior — invalidation kontratı

Cache key: `userId:serverId` · TTL: 5 sn · GC: 60 sn'de bir expired entry temizleme.

| Mutation | Invalidation scope |
|---|---|
| `kickMember(targetUserId)` | `invalidateAccessContext(targetUserId, serverId)` |
| `changeRole(targetUserId)` | aynı (target'ın capability seti değişir) |
| `acceptInvite` (yeni member) | `invalidateAccessContext(userId, serverId)` |
| `updateServer` (plan vb.) | `invalidateAccessContextForServer(serverId)` — tüm member'ların `flags` limit etkisi |
| `createChannel` / `deleteChannel` | `invalidateAccessContextForServer(serverId)` — `channel_count` flag hesabı |
| `grantChannelAccess` / `revokeChannelAccess` | no-op (capability etkilemiyor; per-channel grant ayrı katman) |

**Stale pencere** max 5 sn: role değişse, victim'ın cache'i hemen silinir; diğer client'lar 5 sn içinde doğal olarak expire olur. Redis yok, single-instance.

### Capability sync validator — kontratı

```
DB.distinct(role_capabilities.capability) vs ALL_CAPABILITIES
 └─ DB'de var, kodda yok → unknownInDb[]        (kod güncellenmemiş)
 └─ kodda var, hiç seed yok → unseededInCode[]  (migration/seed eksik)
 └─ boş ise ✓ senkron
```

- Default (dev/stage): warn log
- `CAPABILITY_SYNC_STRICT=1` (prod): `process.exit(1)` — startup abort
- Hata (DB unreachable): warn + `ok=false`; startup yine de devam eder (strict değilse)

---

## D. Compatibility notes

- **API shape'ler değişmedi** — GET `/servers/:id/access-context` aynı response; flag hesabı resolver iç refactor'u
- **Legacy `server_members.role` fallback korunuyor** — `legacyCapabilitiesFor` + `invalidateAccessContext` birlikte çalışıyor
- **Frontend `currentUser.isAdmin`** global platform-admin için hâlâ kullanılır (PlatformAdminPanel, vb.); server-level surface'lerde (LeftSidebar) `activeServerRole` / resolver flag'lerine geçildi
- **Cache soft-fail** — cache subsistemi hata alırsa resolver yine DB'ye gidip response üretir; cache optional path
- **Validator soft-fail** (non-strict) — drift varsa servis başlar, sadece log uyarır; prod için strict env zorunlu tavsiye

---

## E. Remaining intentional debt

- `banMember`, `unbanMember`, `listBans`, `listMembers`, `listSentInvites`, `listInvites` hâlâ legacy `requireRole` helper'ı kullanıyor — kapsam dışı; sonraki iterasyon
- Frontend fallback tamamen kaldırılmadı — `serverAdminFallback` hâlâ `activeServerRole` bazlı bir defansif geçiş; access context tamamen yüklenene kadar mantıklı. Tamamen kaldırmak UI flash riski yaratır
- Audit log için yalnızca **reorder** tam transactional — çoğu tek-query mutation için "mutation OK, audit fail" edge case'i hâlâ teorik olarak açık (çözüm: outbox pattern — bu round kapsam dışı)
- Cache single-instance — multi-instance'a geçilirse ya pub/sub ile invalidation broadcast, ya Redis backed cache gerek
- `canCreateChannel` plan limiti yaklaşık (`+10 buffer`) — sistem kanalları ayrıştırması yok; fine-grained sayım sonraki sprint
- Audit log retention politikası yok — tablo zamanla şişer, cleanup job gelecek

---

## F. Risks

- **Cache invalidation eksikliği** — yeni eklenen mutation path'i `invalidateAccessContext(*)` çağırmayı unutursa 5 sn stale yetki. Mitigasyon: TTL sınırlı + yeni mutation code review list'i
- **Validator false negative** — DB'de eski capability temizlenmediyse unknown olarak görünüp alarm verir ama operasyonu bloklamaz (non-strict); strict prod'da operasyonel disiplin gerektirir
- **Audit within transaction lock** — reorder sırasında audit insert'i de aynı transaction'da; audit tablosu locked row'lar üretmez (append-only INSERT) ama teorik olarak blocking katkısı küçük
- **Test kapsama** — 25 unit test iç tutarlılık + pure function; resolver DB yoluna integration test yok. Mevcut kapsam foundation için yeterli, invite/plan genişlemesinde test sprint'i büyümeli
