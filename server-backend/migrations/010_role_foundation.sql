-- ── Capability foundation: roles, role_capabilities, member_roles ──
-- Additive: mevcut server_members.role kolonu korunur (backward compat).
-- Bu tablolar resolver'ın canonical kaynağıdır. server_members.role "baseRole"
-- olarak legacy kodla uyumlu kalmaya devam eder.

CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  priority    INT  NOT NULL DEFAULT 0,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capabilities_capability ON role_capabilities(capability);

CREATE TABLE IF NOT EXISTS member_roles (
  server_id  UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_member_roles_user ON member_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON member_roles(role_id);

-- ── Backfill: mevcut sunucular için sistem rollerini seed et ──
-- İsimler İngilizce (DB-level identifier), UI label'ları ayrı ele alınır.
-- priority: owner 100, admin 80, moderator 60, member 20

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'owner', 100, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'admin', 80, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'moderator', 60, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, 'member', 20, true FROM servers s
ON CONFLICT (server_id, name) DO NOTHING;

-- ── Sistem rollerine capability'leri bağla ──

-- owner: full set (14)
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),('server.manage'),
  ('channel.create'),('channel.update'),('channel.delete'),('channel.reorder'),
  ('channel.view_private'),('channel.join_private'),
  ('invite.create'),('invite.revoke'),
  ('member.move'),('member.kick'),
  ('role.manage')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- admin: owner minus role.manage
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),('server.manage'),
  ('channel.create'),('channel.update'),('channel.delete'),('channel.reorder'),
  ('channel.view_private'),('channel.join_private'),
  ('invite.create'),('invite.revoke'),
  ('member.move'),('member.kick')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- moderator: members + invite revoke + kick/move
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join'),
  ('invite.revoke'),
  ('member.move'),('member.kick')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'moderator'
ON CONFLICT DO NOTHING;

-- member: minimal
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('server.view'),('server.join')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'member'
ON CONFLICT DO NOTHING;

-- ── Backfill: mevcut server_members → member_roles (legacy role → system role map) ──
-- server_members.role: 'owner' | 'admin' | 'mod' | 'member'
-- Sistem rol adları: 'owner' | 'admin' | 'moderator' | 'member'

INSERT INTO member_roles (server_id, user_id, role_id)
SELECT sm.server_id, sm.user_id, r.id
FROM server_members sm
JOIN roles r
  ON r.server_id = sm.server_id
 AND r.is_system = true
 AND r.name = CASE sm.role
              WHEN 'mod' THEN 'moderator'
              ELSE sm.role
              END
ON CONFLICT DO NOTHING;
