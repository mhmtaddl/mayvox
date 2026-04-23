-- ══════════════════════════════════════════════════════════════════════════
-- Migration 030 — 7-rol genişletme (super_admin, super_mod, super_member)
--
-- Bu migration ADDITIVE ve NON-DESTRUCTIVE'dir:
--   • Yeni roller ve yeni capability'ler eklenir
--   • Mevcut 4 rol ve atamaları aynen korunur
--   • server_members.role kolonuna CHECK constraint EKLENMEZ (eskiden yok;
--     uygulama-seviyesi enforcement + roleHierarchy.isKnownRole yeterli)
--   • member_roles tablosunda toplu mutate YOK (mevcut üyelerin rolü değişmez)
--
-- Uygulama: psql ile tek tek (migrations 018-022 _migrations tablosunda eksik;
-- `npm run migrate` tehlikeli — bkz. project_current_work Known Issues).
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Legacy rename: 'moderator' → 'mod' (roles.name wire format'la hizalanır) ──
-- Migration 010 sistem rol adını 'moderator' olarak kaydediyordu, wire format 'mod' idi.
-- Artık 1-1 aynı. member_roles.role_id UUID olarak stabil — rename transparent.
-- NOT EXISTS: çift satır kazası güvencesi (hem 'mod' hem 'moderator' varsa skip).

UPDATE roles
SET name = 'mod'
WHERE is_system = true
  AND name = 'moderator'
  AND NOT EXISTS (
    SELECT 1 FROM roles r2
    WHERE r2.server_id = roles.server_id
      AND r2.name = 'mod'
      AND r2.is_system = true
  );

-- ── 1. Mevcut sunuculara 3 yeni sistem rolünü ekle ──
-- Priority değerleri: super_admin=90, super_mod=70, super_member=30
-- (mevcutlar: owner=100, admin=80, moderator=60, member=20)

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'super_admin', 90, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'super_mod', 70, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'super_member', 30, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

-- ── 2. Yeni capability'leri uygun rollere bağla ──
-- Yeni 3 cap: role.manage.lower, role.assign.lower, role.permissions.edit.lower
-- Not: atomic cap tek başına yetmiyor; canManageRole(actor, target) hiyerarşi
-- guard'ı ile beraber çalışır. DB seviyesinde cap = "bu kapıyı geçme bileti".

-- super_admin: full set eksi role.manage (owner'a özel)
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),('server.manage'),('server.moderation.update'),
  ('channel.create'),('channel.update'),('channel.delete'),('channel.reorder'),
  ('channel.view_private'),('channel.join_private'),
  ('invite.create'),('invite.revoke'),
  ('member.move'),('member.kick'),('member.mute'),('member.timeout'),
  ('member.room_kick'),('member.chat_ban'),
  ('role.manage.lower'),('role.assign.lower'),('role.permissions.edit.lower')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- super_mod: moderasyon + davet oluşturma/iptal + alt-rol atama
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),('server.moderation.update'),
  ('invite.create'),('invite.revoke'),
  ('member.move'),('member.kick'),('member.mute'),('member.timeout'),
  ('member.room_kick'),('member.chat_ban'),
  ('role.assign.lower')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'super_mod'
ON CONFLICT DO NOTHING;

-- super_member: member + davet oluşturma (trust-level upgrade)
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),
  ('invite.create')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'super_member'
ON CONFLICT DO NOTHING;

-- ── 3. Mevcut rollerin capability setlerini eksik satırlara göre doldur ──
-- Migration 010 yalnızca 14 cap kapsıyordu; 023-024 sonrası gelen caps
-- (member.mute, member.timeout, member.room_kick, member.chat_ban,
-- server.moderation.update) eski sunuculara retro-grant edilmeli. Önceki
-- migration'larda bu backfill yapıldıysa ON CONFLICT sessiz geçer.
-- Yeni cap role.manage.lower / role.assign.lower / role.permissions.edit.lower
-- burada admin'e de grant edilir (admin üst bandla uyumlu).

-- owner: tüm yeni caps (idempotent)
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.moderation.update'),
  ('member.mute'),('member.timeout'),('member.room_kick'),('member.chat_ban'),
  ('role.manage.lower'),('role.assign.lower'),('role.permissions.edit.lower')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- admin: moderation caps + alt-rol yönetimi (full role.manage hariç)
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.moderation.update'),
  ('member.mute'),('member.timeout'),('member.room_kick'),('member.chat_ban'),
  ('role.manage.lower'),('role.assign.lower'),('role.permissions.edit.lower')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- mod: mute/timeout/room_kick/chat_ban + moderation.update
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.moderation.update'),
  ('member.mute'),('member.timeout'),('member.room_kick'),('member.chat_ban')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'mod'
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION SORGULARI (BU MIGRATION'DA ÇALIŞTIRILMAZ — REFERANS)
-- Uygulamadan sonra psql'de manuel çalıştırmak için:
--
--   -- A) Her sunucuda 7 sistem rolü var mı?
--   SELECT s.id, s.name,
--     COUNT(*) FILTER (WHERE r.is_system = true) AS system_role_count,
--     ARRAY_AGG(r.name ORDER BY r.priority DESC) FILTER (WHERE r.is_system = true) AS roles
--   FROM servers s
--   LEFT JOIN roles r ON r.server_id = s.id
--   GROUP BY s.id, s.name
--   HAVING COUNT(*) FILTER (WHERE r.is_system = true) <> 7;
--   -- Beklenen: 0 satır (her sunucuda tam 7 sistem rolü)
--
--   -- B) Eksik sistem rolü tespit (hangi sunucuda ne yok?)
--   WITH expected(name) AS (VALUES
--     ('owner'),('super_admin'),('admin'),('super_mod'),
--     ('mod'),('super_member'),('member')
--   )
--   SELECT s.id, s.name AS server_name, e.name AS missing_role
--   FROM servers s
--   CROSS JOIN expected e
--   LEFT JOIN roles r
--     ON r.server_id = s.id AND r.name = e.name AND r.is_system = true
--   WHERE r.id IS NULL;
--   -- Beklenen: 0 satır
--
--   -- C) Duplicate sistem rolü (UNIQUE constraint koruyor ama sağlamasını ver)
--   SELECT server_id, name, COUNT(*)
--   FROM roles
--   WHERE is_system = true
--   GROUP BY server_id, name
--   HAVING COUNT(*) > 1;
--   -- Beklenen: 0 satır
--
--   -- D) Tanınmayan role string kullanan member kaydı var mı?
--   --    (wire format: owner/super_admin/admin/super_mod/mod/super_member/member)
--   SELECT role, COUNT(*) AS member_count
--   FROM server_members
--   WHERE role NOT IN (
--     'owner','super_admin','admin','super_mod','mod','super_member','member'
--   )
--   GROUP BY role;
--   -- Beklenen: 0 satır (bozuk veri yok)
--
--   -- E) Yeni cap'ler seed edildi mi?
--   SELECT r.name AS role, rc.capability
--   FROM roles r
--   JOIN role_capabilities rc ON rc.role_id = r.id
--   WHERE r.is_system = true
--     AND rc.capability IN (
--       'role.manage.lower','role.assign.lower','role.permissions.edit.lower'
--     )
--   ORDER BY r.server_id, r.priority DESC, rc.capability;
--
-- ══════════════════════════════════════════════════════════════════════════
