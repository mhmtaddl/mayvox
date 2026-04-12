# MayVox — Yapılacaklar (next-phase roadmap)

✅ tamamlandı · 🟡 kısmen · ❌ yok

**Çerçeve (ürün omurgası — 3 eksen):** her yeni özellik şu soruyla girmeli → *identity mi, access mi, commercial policy mi?* Auth ayrı, membership/role ayrı, billing/plan ayrı, invite lifecycle ayrı. 4 modül olarak kalır, karıştırılmaz.

**Öncelik (revize):** #1 Capability → #2 Invite → #3 Monetization. Monetization enforcement layer'dır; capability + invite + audit log foundation **üzerine** kurulur.

---

## 1. Capability foundation (Sprint 1 — KRİTİK)

### Veri modeli
| # | Konu | Durum |
|---|---|---|
| 1.1 | `roles` tablosu | ❌ |
| 1.2 | `role_capabilities` tablosu | ❌ |
| 1.3 | `member_roles` tablosu (user ↔ role ↔ serverId) | ❌ |
| 1.4 | `server_members` + mevcut role kolonu (owner/admin/mod/member) | ✅ |

### Capability set (merkezi)
| # | Konu | Durum |
|---|---|---|
| 1.5 | `CAPABILITIES` const (server.*, channel.*, invite.*, member.*, role.manage) | ❌ |

### Resolver + pipeline
| # | Konu | Durum |
|---|---|---|
| 1.6 | `getServerAccessContext(userId, serverId)` tek entry point | ❌ |
| 1.7 | Resolver akışı: membership → roles → capabilities → plan → flags | ❌ |
| 1.8 | Backend pipeline standardı: `assertAuthenticated → assertCapability → assertPlanAllows → mutate → emit` | ❌ |
| 1.9 | Frontend: `if (currentUser.isAdmin)` → `if (ctx.capabilities.has(...))` refactor | ❌ |
| 1.10 | Context'i tek endpoint'ten çek (`GET /servers/:id/access-context`) | ❌ |

### Audit log (Sprint 1'e çekildi)
| # | Konu | Durum |
|---|---|---|
| 1.11 | Audit log foundation (channel/role/member/invite/moderation DB'ye) | ❌ |
| 1.12 | Audit log consumer (UI sonra — support/abuse/admin tools temel) | ❌ |

### Test suite (Sprint 1'e çekildi — şart)
| # | Konu | Durum |
|---|---|---|
| 1.13 | Unit test: permission resolver (tüm capability branch'ları) | ❌ |
| 1.14 | Unit test: channel access (hidden/invite-only/grant/owner/admin) | ❌ |
| 1.15 | Unit test: invite validation (token/expire/use-limit) | ❌ |

---

## 2. Invite lifecycle genişleme (Sprint 2 — Growth engine)

| # | Konu | Durum |
|---|---|---|
| 2.1 | User invite (belirli kullanıcıya) | ✅ |
| 2.2 | Realtime delivery (WS bridge + polling + reconnect) | ✅ |
| 2.3 | Shareable link invite (token-based) | ❌ |
| 2.4 | Expiring invite (`expires_at`) | ❌ |
| 2.5 | Limited-use invite (`max_uses` / `used_count`) | ❌ |
| 2.6 | Revocable invite (`revoked_at`) | ❌ |
| 2.7 | Scoped invite (server / private channel / temporary guest) | ❌ |
| 2.8 | Token hash storage (raw token plain YASAK — SHA-256) | ❌ |
| 2.9 | Invite'ı domain object olarak tablo tasarımı | ❌ |
| 2.10 | Invite audit (create/revoke/use — §1.11'e bağlı) | ❌ |

---

## 3. Monetization (Sprint 3 — Capability + Invite üzerine)

| # | Konu | Durum |
|---|---|---|
| 3.1 | Server Pro SKU (sahibine satılır: max member/channel, invite analytics, branding, advanced moderation) | ❌ |
| 3.2 | User Plus SKU (profile flair, advanced presence, themes, enhanced audio, priority queue, premium badge) | ❌ |
| 3.3 | Power admin tools (moderation history, invite audit, scheduled access) | ❌ |
| 3.4 | `assertPlanAllows` resolver entegrasyonu (§1.8) | ❌ |
| 3.5 | Upgrade CTA akışı (disabled + tooltip reason + upgrade butonu) | ❌ |
| 3.6 | Stripe/Iyzico entegrasyonu | ❌ |
| 3.7 | Checkout flow | ❌ |
| 3.8 | Webhook → entitlement sync | ❌ |
| 3.9 | Plan downgrade/upgrade state machine | ❌ |
| 3.10 | `servers.plan` kolonu + `planConfig.ts` limitler | 🟡 |
| 3.11 | User premium/entitlement (server plan ≠ user plan) | ❌ |

---

## 4. Mimari / veri altyapı

| # | Konu | Durum |
|---|---|---|
| 4.1 | Feature flag / plan flag layer (`server_features`, `user_entitlements`) | ❌ |
| 4.2 | Policy resolver (capability + plan + state tek karar — §1.6 ile birleşik) | ❌ |
| 4.3 | Scope model modülarizasyonu (global / server / channel) | ❌ |

---

## 5. UX polish (power UX)

| # | Konu | Durum |
|---|---|---|
| 5.1 | Permission-aware UI (hide + tooltip reason + upgrade CTA) | 🟡 |
| 5.2 | Deterministic action state machine (idle → pending → committed → failed → reverted) | 🟡 |
| 5.3 | Moderation surface (admin panel, quick actions, recent actions feed) | ❌ |
| 5.4 | Empty/loading/error design contract | ❌ |

---

## 6. Bugüne kadar tamamlanan çekirdek

| # | Konu | Durum |
|---|---|---|
| 6.1 | Voice infra (LiveKit + token server + presence) | ✅ |
| 6.2 | Server sistemi (CRUD + plan + discover + join/leave) | ✅ |
| 6.3 | Channel CRUD (create/update/delete/rename) | ✅ |
| 6.4 | Channel reorder (drag+drop, bulk unnest, optimistic concurrency token) | ✅ |
| 6.5 | Channel private access (hidden + invite-only + `channel_access` grant + backend filter) | ✅ |
| 6.6 | Token server enforcement (access-check proxy, roomName===channelId, fail-closed 503) | ✅ |
| 6.7 | Per-user token rate limit (12/60s) | ✅ |
| 6.8 | Presence serverId isolation | ✅ |
| 6.9 | DM sistemi v1 (SQLite) | ✅ |
| 6.10 | User invite realtime (WS bridge + polling fallback + reconnect refresh) | ✅ |
| 6.11 | Search UX (viewport-safe, Enter/arrows, autofocus, clear X) | ✅ |
| 6.12 | Splash + MAYVOX branding | ✅ |
| 6.13 | Bildirim merkezi (bell + badge + order) | ✅ |
| 6.14 | Auto-update sistemi (GitHub Releases, NSIS) | ✅ |
| 6.15 | Theme sistemi (6 tema + 8 arka plan) | ✅ |
| 6.16 | Avatar standardize (squircle) | ✅ |
| 6.17 | Strict TypeScript (position required, ApiError, no `any`) | ✅ |
| 6.18 | Nginx + env hardening + deploy rehberi | ✅ |

---

## 7. Yapılmaması gerekenler (şu an)

| # | Konu | Durum |
|---|---|---|
| 7.1 | Detaylı channel-level ACL editor (erken) | ❌ kapsam dışı |
| 7.2 | Distributed rate limiter / Redis | ❌ kapsam dışı |
| 7.3 | Mikroservisleşme | ❌ kapsam dışı |
| 7.4 | "Discord'daki her şey" | ❌ kapsam dışı |
| 7.5 | Realtime her şey (bazıları event + fallback kalmalı) | ❌ kapsam dışı |

---

## 8. Teknik borç / ekstra

### Test / Kod sağlığı
| # | Konu | Durum |
|---|---|---|
| 8.1 | Unit test (resolver + access + invite) — Sprint 1 içinde (§1.13-1.15) | ❌ |
| 8.2 | i18n readiness (hardcoded Türkçe) | ❌ |
| 8.3 | Error boundary coverage (route-bazlı) | ❌ |
| 8.4 | Logger abstraction (3 servis farklı format) | 🟡 |
| 8.5 | Structured event bus (invite + status + notification ortak pattern) | 🟡 |

### Observability
| # | Konu | Durum |
|---|---|---|
| 8.6 | Backend metrics endpoint (Prometheus) | ❌ |
| 8.7 | Error tracking (Sentry) | ❌ |
| 8.8 | Performance monitoring (LiveKit health dashboard) | ❌ |
| 8.9 | Access-denied log + dashboard | 🟡 |

### Güvenlik
| # | Konu | Durum |
|---|---|---|
| 8.10 | Token server enforcement | ✅ |
| 8.11 | `/internal/*` loopback + nginx deny | ✅ |
| 8.12 | CSRF review (REST Bearer, minimal risk ama audit) | ❌ |
| 8.13 | Backend input sanitization audit | ❌ |
| 8.14 | Supabase RLS policy review (profiles + friend_requests) | ❌ |
| 8.15 | Password/secret rotation planı | ❌ |

### Operational
| # | Konu | Durum |
|---|---|---|
| 8.16 | Arctic White light theme CSS kontrol | ❌ |
| 8.17 | Mobil test | ❌ |
| 8.18 | Database backup politikası | ❌ |
| 8.19 | Migration rollback strategy dokümante | ❌ |

---

## 9. Sprint sırası (REVİZE)

| Sprint | Kapsam | Süre |
|---|---|---|
| **1** | Capability foundation + basic audit log + unit tests (permission resolver + channel access + invite validation) | 2 hafta |
| **2** | Invite lifecycle expansion (link/expire/use-limit/revoke + token hash + invite audit) | 1 hafta |
| **3** | Plan/entitlement + Monetization MVP (Server Pro + User Plus + checkout + webhook) — enforcement layer ✓ | 2-3 hafta |
| **4** | Admin power surface (moderation panel, invite audit UI, role mgmt, action history) | 1-2 hafta |
| **Ara işler** | Arctic White + Mobil test | 1-2 gün |

### Sıralama mantığı
- **Monetization enforcement katmanı** → capability + invite lifecycle + audit log foundation **üzerine** kurulur
- **Audit log Sprint 1'de** → moderation + support + abuse tracking + premium admin tools hepsinin temeli
- **Invite growth engine** → doğru yapılmazsa private network hissi ve user acquisition çöker
- **Test suite Sprint 1'de** → capability resolver'ın tek hatalı branch'ı ürünü deliklerle dolu çıkarır

---

## 10. Pozisyonlama

**"Premium-feeling, controlled-access, community-first voice platform"** — premium **kontrol + güven + akıcılık** üzerinden satılacak.

| Teknik karşılık | Durum |
|---|---|
| Private access gerçekten private | ✅ |
| Davet sistemi güçlü (user invite ✅ + link/expire ❌) | 🟡 |
| Yönetim araçları temiz | ❌ |
| Premium hissi operasyonel kalite | ❌ |
| Server owner kontrol hissi yüksek | 🟡 |

---

## 11. Tek cümle karar

**Sıradaki iş monetization UI değil — `getServerAccessContext` resolver + `roles`/`role_capabilities`/`member_roles` foundation (§1.1-1.10) + audit log (§1.11) + unit tests (§1.13-1.15).**

Bu temel kurulursa private access genişlemesi, invite büyümesi, premium enforcement, admin tooling — hepsi yama değil doğal sonuç olur.
