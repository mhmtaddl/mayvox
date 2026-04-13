-- ── Global System Admin (MayVox) ──
-- Separate privilege tier from per-server admin roles.
-- Source of truth: profiles.role. Audit: system_audit_log.

-- profiles.role (tek kaynak: "user" | "server_admin" | "system_admin")
-- Not: is_admin / is_primary_admin legacy flag'leri korunur, ama SYSTEM admin yetkisi SADECE role='system_admin' üstünden geçer.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','server_admin','system_admin'));

-- Mevcut primary admin'leri system_admin'e yükselt (backfill, tek seferlik).
UPDATE profiles
   SET role = 'system_admin'
 WHERE is_primary_admin = true
   AND role = 'user';

CREATE INDEX IF NOT EXISTS idx_profiles_role_system
  ON profiles (role)
  WHERE role = 'system_admin';

-- servers.is_banned — global admin tarafından banlanmış sunucu bayrağı.
-- Banlı sunucuya erişim reddedilir; UI'de de "Erişim engellendi" gösterilir.
ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_servers_is_banned
  ON servers (is_banned)
  WHERE is_banned = true;

-- system_audit_log — per-server audit_log'tan AYRI, sadece global admin aksiyonları için.
CREATE TABLE IF NOT EXISTS system_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  TEXT NOT NULL,
  action         VARCHAR(80) NOT NULL,          -- prefix: "system_admin_action."
  target_type    VARCHAR(30) NOT NULL,          -- "server" | "profile" | ...
  target_id      TEXT NOT NULL,
  metadata       JSONB,                          -- before/after snapshots, reason, etc.
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_admin_time  ON system_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_target      ON system_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_action      ON system_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_system_audit_created     ON system_audit_log(created_at DESC);
