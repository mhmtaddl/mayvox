# Admin Panel / Moderation Surface — Implementation Report

## Summary

ServerSettings modalına 4 yeni sekme eklendi: **Özet, Roller, Linkler (Invite V2), Denetim**. Mevcut Genel/Üyeler/Davetler/Yasaklar sekmeleri dokunulmadı. Panel tamamen mevcut capability foundation + audit log + invite V2 + plan enforcement primitiflerinin üzerine kuruldu — yeni authorization modeli yok. Her sekme `accessContext.flags.*` ile capability-gated; tab sadece uygun yetki varsa render edilir.

## Schema changes

Yok. Mevcut `audit_log` (migration 011) ve `server_plans` (013) kullanılıyor.

**Minor:** `managementService.banMember` ve `unbanMember` artık audit yazıyor (`member.ban`, `member.unban`) — daha önce kaçırılmıştı.

## New backend endpoints

| Endpoint | Method | Capability | Response |
|---|---|---|---|
| `/servers/:id/audit-log?limit&action` | GET | `SERVER_MANAGE` | `AuditLogItem[]` (actor isim enrichment + limit ≤50) |
| `/servers/:id/roles` | GET | `SERVER_MANAGE` | `ServerRoleSummary[]` (DB'den roles + role_capabilities + member count) |
| `/servers/:id/overview` | GET | `SERVER_MANAGE` | `ServerOverview` (plan + 5 count + limits, tek aggregate SQL) |

## Reused endpoints

- `/servers/:id/invite-links` (V2 GET/POST/DELETE) — InviteLinksTab
- `/servers/:id/members` — MembersTab (mevcut)
- `/servers/:id/bans` — BansTab (mevcut)
- `/servers/:id/members/invite*` — InvitesTab (mevcut, user invite V1)
- `/servers/:id/invites` — legacy short-code CRUD (mevcut)
- `/servers/:id/access-context` — ServerSettings capability gates için

## Capability decisions

Mevcut capability set kullanıldı — **yeni cap eklenmedi**. Her tab şu şekilde gate'lendi:

| Tab | Gate | Underlying cap |
|---|---|---|
| Genel | her zaman (member+ görür, edit capability içinde handle) | — |
| Özet | `canManageServer` | `server.manage` |
| Üyeler | `canKickMembers` | `member.kick` |
| Roller | `canManageServer` | `server.manage` |
| Davetler (user V1) | `canCreateInvite \|\| canRevokeInvite` | `invite.create` / `invite.revoke` |
| Linkler (V2) | aynı | aynı |
| Yasaklar | `canKickMembers` | `member.kick` |
| Denetim | `canManageServer` | `server.manage` |

**Backend servis-level enforcement** aynı capability'lere bağlı; frontend hide yetkili değil, sadece UX. Yetkisiz kullanıcı URL/tab bypass etse bile backend 403 döner.

## UI modules added

**Yeni component'ler** (`src/components/server/settings/`):
- `OverviewTab.tsx` — plan badge + 4 metric card (üyeler, kanallar, özel kanallar, 24s davet) + progress bar (>80% amber, 100% red)
- `RolesTab.tsx` — 4 sistem rolü kartı + capability rozet listesi (14 capability human-label mapping) + üye sayısı
- `InviteLinksTab.tsx` — V2 link listesi + state badge (active/expired/revoked/exhausted) + inline create (7 gün / 25 kullanım) + copy + revoke + "Geçmişi göster" toggle
- `AuditTab.tsx` — reverse-chronological feed + group filter (channel/invite/role/member/plan) + refresh + relative time format + resource label description

**Modified:**
- `src/components/server/ServerSettings.tsx` — tab enum genişletildi, dinamik tabs array (capability-aware filter), 4 yeni content branch
- `src/lib/serverService.ts` — `getAuditLog`, `getServerRoles`, `getServerOverview` + tipleri

**Backend:**
- `server-backend/src/services/auditLogService.ts` — `listAuditLog` eklendi (SERVER_MANAGE + actor enrichment)
- `server-backend/src/services/roleListService.ts` — yeni
- `server-backend/src/services/serverOverviewService.ts` — yeni (tek aggregate SQL, 4 COUNT)
- `server-backend/src/services/managementService.ts` — ban/unban audit eklendi
- `server-backend/src/routes/servers.ts` — 3 yeni GET route

## Performance

- Audit listing `LIMIT 50` + newest-first; mevcut `idx_audit_server_time` index seçici
- Overview tek query — 4 subquery aggregate + 1 plan lookup; N+1 yok
- Role listing tek JOIN query + groupby in-memory; 4 sistem rolü × ~14 capability = ~56 satır maksimum
- Actor enrichment: `IN ($1)` batch Supabase — N+1 yok

## Audit visibility coverage

Şu action'lar denetim feed'inde görünür:
- `channel.create`, `channel.update`, `channel.delete`, `channel.reorder`
- `channel.access.grant`, `channel.access.revoke`
- `invite.create`, `invite.revoke`, `invite.accept`
- `role.change`
- `member.kick`, **`member.ban`**, **`member.unban`** (yeni eklendi)
- `plan.limit_hit`

Bilinmeyen/yeni action'lar için `ACTION_META` fallback action string'i olduğu gibi gösterir.

## Compatibility notes

- Mevcut tab'lar (Genel, Üyeler, Davetler, Yasaklar) dokunulmadı — zaten çalışanlar aynı
- `accessContext` zaten App.tsx'te fetch ediliyor; ServerSettings ekstra fetch yapmıyor (sameServerCtx guard ile aktif server eşleşmesi kontrol edilir; yoksa legacy role fallback)
- API shape'leri yeni; mevcut endpoint'ler aynı
- Backend additive — migrations yok

## Deferred intentionally

- Custom role editor (role-capability matrix UI)
- Yeni capability tanımı (model değişmedi)
- Ban appeals / complex moderation workflows
- Audit log pagination beyond 50 (offset/cursor)
- Denetim feed realtime push (polling yeterli şu an)
- Member drill-down (activity, channel access, invite history)
- Role assignment inline (sadece member action menu üzerinden — mevcut)
- Invite analytics dashboard (usage grafikleri)
- Export (CSV/JSON audit)
- Plan upgrade UI (billing yok)

## Risks / follow-up

- **Actor enrichment miss:** audit log `actor_id` Supabase profiles'ta yoksa ilk 8 karakter gösterilir — UX pürüz. Supabase veritabanı ile tutarsızlık durumunda izolasyon gerekir
- **Overview 5s cache yok:** her sekme açılışında tekrar COUNT çalışır; yoğun kullanımda minor IO. TTL eklenebilir
- **Roles tab edit yok:** sadece görüntüleme; rol atama hâlâ Üyeler sekmesindeki action menu üzerinden. UX ileride unifiye edilebilir
- **Invite link create default 7 gün/25:** UI'da config yok. İleri modal ile expire/uses seçimi verilebilir
- **Tab overflow:** 8 sekmeye çıktı; küçük ekranda yatay scroll aktif (`overflow-x-auto`) — mobile için ayrı polish gerekebilir
- **Audit retention:** hâlâ retention policy yok; tablo büyüdükçe listing performansı yavaşlar (yıllık cleanup job önerilir)

## Validation

- Backend `npx tsc --noEmit` → **EXIT=0**
- Frontend `npx tsc --noEmit` → **EXIT=0**
- `npx vitest run` → **45 passed / 45** (regresyon yok; admin panel integration test kapsam dışı — DB dependent)
