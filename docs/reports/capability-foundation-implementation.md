# Capability Foundation — Implementation Report

## Summary

Server authorization artık inline `role === 'admin'` kontrolleriyle değil, canonical bir **capability resolver** üzerinden yapılıyor. Bu, monetization enforcement, invite lifecycle expansion, admin power tools ve permission-aware UI için gerekli temeli kuruyor.

- 3 yeni tablo (`roles`, `role_capabilities`, `member_roles`) — additive migration, mevcut `server_members.role` korunuyor
- 14 capability string constant (tek kaynak: `server-backend/src/capabilities.ts` + frontend kopyası)
- 4 sistem rolü (`owner`, `admin`, `moderator`, `member`) — her sunucuda otomatik seed
- `getServerAccessContext(userId, serverId)` — tüm authorization kararlarının canonical entry point'i
- Kritik backend endpoint'leri (channel CRUD/reorder, channel access grant/revoke, invite create/revoke, member kick, changeRole, updateServer) resolver'a taşındı
- Her kritik action `audit_log` tablosuna yazılıyor
- Frontend `ChannelContext.accessContext` üzerinden capability flag'leri okuyor
- 16 unit test ile foundation koruma altında

## Why

Önceki pattern:
```ts
if (role === 'admin') ...
if (currentUser.isAdmin) ...
if (member.role === 'owner' || member.role === 'admin') ...
```

Sorunlar:
- Plan enforcement eklemek istenirse `if (role === 'admin' && plan === 'pro' && ...)` çirkinleşir
- Her backend endpoint ayrı ayrı rol check yapıyor — ortak değişiklik elle 15 yerde
- Frontend `isAdmin` global; server-specific rol mantığı yoktu
- Custom rol / premium tier / channel-level override → hepsi ayrı yama gerektirirdi

Yeni pattern:
```ts
const ctx = await getServerAccessContext(userId, serverId);
assertCapability(ctx, CAPABILITIES.CHANNEL_CREATE);
assertPlanAllows(ctx, 'channel.create');
```

## Schema changes

### Migration 010 — `010_role_foundation.sql`

```sql
CREATE TABLE roles (
  id UUID PK, server_id UUID FK, name TEXT, priority INT,
  is_system BOOLEAN, created_at TIMESTAMPTZ,
  UNIQUE(server_id, name)
);
CREATE TABLE role_capabilities (
  role_id UUID FK, capability TEXT,
  PRIMARY KEY (role_id, capability)
);
CREATE TABLE member_roles (
  server_id UUID FK, user_id TEXT, role_id UUID FK,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (server_id, user_id, role_id)
);
```

**Backfill:** tüm mevcut sunucular için 4 sistem rolü + capability'leri + her `server_members` satırı için `member_roles` entry. `ON CONFLICT DO NOTHING` — idempotent. Legacy `mod` rolü `moderator` sistem rolüne maplendi.

### Migration 011 — `011_audit_log.sql`

```sql
CREATE TABLE audit_log (
  id UUID PK, server_id UUID FK, actor_id TEXT,
  action VARCHAR(60), resource_type VARCHAR(30), resource_id TEXT,
  metadata JSONB, created_at TIMESTAMPTZ
);
```

Indexes: `(server_id, created_at DESC)`, `(actor_id, created_at DESC)`, `(action)`.

## New files

### Backend
- `server-backend/migrations/010_role_foundation.sql`
- `server-backend/migrations/011_audit_log.sql`
- `server-backend/src/capabilities.ts` — `CAPABILITIES` const, `SYSTEM_ROLE_CAPS`, `SYSTEM_ROLE_PRIORITY`, `LEGACY_ROLE_MAP`
- `server-backend/src/services/accessContextService.ts` — `getServerAccessContext`, `hasCapability`, `assertServerMember`, `assertCapability`, `assertPlanAllows`, `legacyCapabilitiesFor`
- `server-backend/src/services/roleSeedService.ts` — `seedSystemRolesForServer`, `assignSystemRoleToMember` (server create + join + invite-accept için)
- `server-backend/src/services/auditLogService.ts` — `logAction(entry)` (fire-and-forget)
- `server-backend/src/services/__tests__/accessContext.test.ts` — 16 test
- `server-backend/vitest.config.ts`

### Frontend
- `src/lib/capabilities.ts` — backend ile senkron kopya

## Modified files

### Backend
- `server-backend/src/services/serverService.ts`
  - `createServer`: sistem rolleri seed + owner assignment
  - `joinByInvite`: member sistem rolüne bağla
- `server-backend/src/services/managementService.ts`
  - `updateServer` → `SERVER_MANAGE`
  - `kickMember` → `MEMBER_KICK` + hierarchy preserved (baseRole üzerinden)
  - `changeRole` → `ROLE_MANAGE` + member_roles senkronu
  - `sendUserInvite` / `createInvite` → `INVITE_CREATE`
  - `cancelUserInvite` / `deleteInvite` → `INVITE_REVOKE`
  - `acceptInvite`: member sistem rolüne bağla
  - Her kritik action → audit log
  - Not: `banMember`, `unbanMember`, `listMembers`, `listSentInvites`, `listInvites`, `listBans` hâlâ legacy `requireRole` helper'ı kullanıyor (read/non-primary ops)
- `server-backend/src/services/channelService.ts`
  - `createChannel` → `CHANNEL_CREATE` + `assertPlanAllows('channel.create')`
  - `updateChannel` → `CHANNEL_UPDATE`
  - `deleteChannel` → `CHANNEL_DELETE`
  - `reorderChannels` → `CHANNEL_REORDER`
  - Eski `requireManageRole` helper kaldırıldı
  - Her action → audit log
- `server-backend/src/services/channelAccessService.ts`
  - `listChannelAccess` / `grantChannelAccess` / `revokeChannelAccess` → `CHANNEL_UPDATE`
  - `evaluateChannelAccess` + `filterVisibleChannels` **dokunulmadı** (private access authoritative decision layer)
  - grant/revoke → audit log
- `server-backend/src/routes/servers.ts`
  - `GET /servers/:id/access-context` endpoint eklendi
- `server-backend/package.json` — test script + vitest devDep
- `server-backend/tsconfig.json` — `__tests__` exclude

### Frontend
- `src/lib/serverService.ts` — `ServerAccessContext` tipi, `getServerAccessContext`, `hasCapability`
- `src/contexts/ChannelContext.tsx` — `accessContext: ServerAccessContext | null`
- `src/App.tsx` — fetch context on server switch + context value'ya ekle
- `src/features/chatview/components/LeftSidebar.tsx`
  - `canCreateChannel`, `canReorderChannels`, `canManageServer` flag'leri
  - "Oda Oluştur" butonu capability-gated
  - Drag reorder capability-gated (legacy fallback korunuyor)
  - Settings button capability OR legacy role check

## API contract

### Backend — added

```
GET /servers/:id/access-context
→ 200 ServerAccessContext {
  userId, serverId,
  membership: { exists, isOwner, baseRole },
  roles: Array<{ id, name, priority }>,
  capabilities: string[],
  plan: { type },
  limits: { maxChannels?, maxMembers? },
  flags: { canCreateChannel, canUpdateChannel, canDeleteChannel,
           canReorderChannels, canManageServer, canCreateInvite,
           canRevokeInvite, canJoinPrivateChannel, canViewPrivateChannel,
           canMoveMembers, canKickMembers, canManageRoles }
}
```

### Backend — unchanged externally

Mevcut endpoint'lerin response shape'leri değişmedi. Sadece internal auth check mekanizması değişti.

## Migrated authorization paths

| Endpoint | Eski check | Yeni capability |
|---|---|---|
| POST /servers/:id/channels | `requireManageRole` | `CHANNEL_CREATE` + `assertPlanAllows` |
| PATCH /servers/:id/channels/:id | `requireManageRole` | `CHANNEL_UPDATE` |
| DELETE /servers/:id/channels/:id | `requireManageRole` | `CHANNEL_DELETE` |
| PATCH /servers/:id/channels/reorder | `requireManageRole` | `CHANNEL_REORDER` |
| GET /servers/:id/channels/:cid/access | inline MANAGE_ROLES | `CHANNEL_UPDATE` |
| POST /servers/:id/channels/:cid/access | inline MANAGE_ROLES | `CHANNEL_UPDATE` |
| DELETE /servers/:id/channels/:cid/access/:uid | inline MANAGE_ROLES | `CHANNEL_UPDATE` |
| PATCH /servers/:id | `requireRole('admin')` | `SERVER_MANAGE` |
| POST /servers/:id/members/:uid/kick | `requireRole('mod')` | `MEMBER_KICK` |
| PATCH /servers/:id/members/:uid/role | `requireRole('owner')` | `ROLE_MANAGE` |
| POST /servers/:id/members/invite | `requireRole('admin')` | `INVITE_CREATE` |
| DELETE /servers/:id/members/invites/:id | `requireRole('admin')` | `INVITE_REVOKE` |
| POST /servers/:id/invites | `requireRole('admin')` | `INVITE_CREATE` |
| DELETE /servers/:id/invites/:id | `requireRole('admin')` | `INVITE_REVOKE` |

## Compatibility notes

- `server_members.role` kolonu **korunuyor** — `baseRole` olarak resolver'a giriyor, legacy query'ler bozulmadı
- Legacy client'lar (eski frontend) için access-context fetch isteğe bağlı; eski endpoint'ler aynı şekilde çalışıyor
- `evaluateChannelAccess` private access kararı için authoritative layer olarak bırakıldı — resolver bunu ezmez; capability sadece "genel olarak private kanal join/view yetkisi var mı" sorusunu cevaplar, specific channel grant'ı ayrı
- Backfill edilmemiş kullanıcılar için `legacyCapabilitiesFor(baseRole)` fallback — migration uygulanmamış eski sunucularda sistem çalışmaya devam eder
- Owner her zaman full capability set'ine sahip (defense-in-depth: `isOwner` ise tüm cap'ler eklenir)
- Frontend legacy `currentUser.isAdmin` checkleri fallback olarak tutuldu (access context henüz yüklenmemiş an için)

## Risks / follow-up

### Bilinen sınırlar
- `canCreateChannel` flag'i plan limitini yaklaşık kontrol ediyor (`channel_count < customRooms + 10`); fine-grained sistem kanalı sayım ayrımı gelecek iterasyonda
- Frontend fallback (`currentUser.isAdmin` fallback in UI gates) tamamen kaldırılmadı — capability yüklenmeden UI'nın flash yapmaması için gerekli; ileride daha sıkı gate ile değiştirilebilir
- `listMembers`, `banMember`, `unbanMember`, `listBans`, `listInvites`, `listSentInvites` hâlâ legacy `requireRole` kullanıyor — bunlar read-mostly veya bu turda kapsam dışı; sonraki sprint'te migrate edilecek
- Mobil tarafı test edilmedi (zaten yol haritasında)

### Güvenlik
- Capability string'leri DB'de plain text — şema çakışması olursa hatalı grant riski var; `CAPABILITIES` const + migration sync disiplini kritik
- `audit_log` UI'ı yok; tarihsel log temizliği/retention politikası eklenmedi
- `evaluateChannelAccess` auth katmanı değişmediği için private channel token enforcement (token server) etkilenmiyor — halen canlı

### Bir sonraki faz
1. Invite lifecycle expansion (link/expire/use-limit/revoke) artık capability'lerle doğal entegrasyon
2. Plan enforcement: `assertPlanAllows` içine Pro/Ultra spesifik feature check'leri eklenebilir
3. Admin UI: `GET /servers/:id/access-context` üzerinden capability flag'lerini kullanarak moderation panel, invite audit view, role mgmt
4. Custom role editor (gelecekte): data model zaten destekliyor — sadece UI
5. Channel-level permission override (if needed): role_capabilities üzerine channel_role_overrides tablosu eklenebilir

## Deferred intentionally

- Billing / checkout / Stripe — kapsam dışı
- Redis veya distributed cache — gerekmiyor, tek instance
- Full custom role UI — model var, UI ertelendi
- Channel-level ACL matrix editor — erken
- `banMember`/`listBans`/`listMembers` capability migration — sonraki sprint'e
- Per-user entitlement sistemi (server plan ≠ user plan) — ayrı foundation
- Admin moderation panel UI — ayrı sprint

## Verification

- Backend `npx tsc --noEmit` → EXIT=0
- Frontend `npx tsc --noEmit` → EXIT=0
- `npx vitest run` → 16 passed, 0 failed
