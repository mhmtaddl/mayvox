-- MAYVOX Hetzner repair migration: missing core backend tables/views
-- Safe/additive: creates only missing relations and indexes. No drops, no data rewrites.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- servers
-- Used by server listing/search/join/admin/plan/moderation/access queries.
-- Mirrors the current shape expected after migrations 001..025.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      TEXT NOT NULL,
  name               TEXT NOT NULL,
  short_name         VARCHAR(2) NOT NULL,
  slug               VARCHAR(24) NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  avatar_url         TEXT,
  invite_code        VARCHAR(8) NOT NULL,
  level              INT NOT NULL DEFAULT 1,
  capacity           INT NOT NULL DEFAULT 100,
  is_public          BOOLEAN NOT NULL DEFAULT true,
  join_policy        VARCHAR(20) NOT NULL DEFAULT 'invite_only',
  motto              VARCHAR(15) NOT NULL DEFAULT '',
  plan               VARCHAR(10) NOT NULL DEFAULT 'free',
  is_banned          BOOLEAN NOT NULL DEFAULT false,
  banned_at          TIMESTAMPTZ,
  banned_reason      TEXT,
  banned_by          TEXT,
  moderation_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_invite_code ON servers(invite_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_slug ON servers(slug);
CREATE UNIQUE INDEX IF NOT EXISTS servers_name_unique_idx ON servers (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_servers_is_public ON servers(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_servers_owner_user_id ON servers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_servers_owner_plan ON servers(owner_user_id, plan);
CREATE INDEX IF NOT EXISTS idx_servers_is_banned ON servers(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_servers_banned_by ON servers(banned_by) WHERE banned_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Role support tables
-- role_capabilities is directly missing; roles/member_roles are required by
-- current access-context and role-list queries.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  priority    INT NOT NULL DEFAULT 0,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capabilities_capability
  ON role_capabilities(capability);

CREATE TABLE IF NOT EXISTS member_roles (
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_member_roles_user ON member_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON member_roles(role_id);

-- Seed system roles for any existing servers.
INSERT INTO roles (server_id, name, priority, is_system)
SELECT s.id, v.name, v.priority, true
FROM servers s
CROSS JOIN (VALUES
  ('owner', 100),
  ('super_admin', 90),
  ('admin', 80),
  ('super_mod', 70),
  ('mod', 60),
  ('super_member', 30),
  ('member', 20)
) AS v(name, priority)
ON CONFLICT (server_id, name) DO NOTHING;

-- Seed capabilities for system roles. This follows current backend capability names.
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.manage'), ('server.moderation.update'),
  ('channel.create'), ('channel.update'), ('channel.delete'), ('channel.reorder'),
  ('channel.view_private'), ('channel.join_private'),
  ('invite.create'), ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban'),
  ('role.manage'), ('role.manage.lower'), ('role.assign.lower'), ('role.permissions.edit.lower'),
  ('insights.view')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.moderation.update'),
  ('channel.create'), ('channel.update'), ('channel.reorder'),
  ('channel.view_private'), ('channel.join_private'),
  ('invite.create'), ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban'),
  ('role.manage.lower'), ('role.assign.lower'),
  ('insights.view')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.manage'), ('server.moderation.update'),
  ('channel.create'), ('channel.update'), ('channel.delete'), ('channel.reorder'),
  ('channel.view_private'), ('channel.join_private'),
  ('invite.create'), ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban'),
  ('role.manage.lower'), ('role.assign.lower'), ('role.permissions.edit.lower'),
  ('insights.view')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.moderation.update'),
  ('invite.create'), ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban'),
  ('role.assign.lower'), ('insights.view')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'super_mod'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.moderation.update'),
  ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'mod'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('invite.create')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'super_member'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, caps.capability
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join')
) AS caps(capability)
WHERE r.is_system = true AND r.name = 'member'
ON CONFLICT DO NOTHING;

-- If server_members already exists, backfill member_roles from legacy role values.
DO $$
BEGIN
  IF to_regclass('public.server_members') IS NOT NULL THEN
    INSERT INTO member_roles (server_id, user_id, role_id)
    SELECT sm.server_id, sm.user_id, r.id
    FROM server_members sm
    JOIN roles r
      ON r.server_id = sm.server_id
     AND r.is_system = true
     AND r.name = CASE sm.role
       WHEN 'moderator' THEN 'mod'
       ELSE sm.role
     END
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- voice_sessions
-- Used by LiveKit webhook tracking, insights, orphan reconciliation and heatmap.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL,
  server_id     UUID NOT NULL,
  room_id       UUID NOT NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at       TIMESTAMPTZ,
  duration_sec  INT GENERATED ALWAYS AS (
    CASE
      WHEN left_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (left_at - joined_at))::INT)
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_vs_user_server_time
  ON voice_sessions(user_id, server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_server_time
  ON voice_sessions(server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_active
  ON voice_sessions(room_id, user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vs_server_user_time
  ON voice_sessions(server_id, user_id, joined_at DESC);

-- Supporting insights table used by voiceActivityService.closeSession/getInsights.
CREATE TABLE IF NOT EXISTS co_presence (
  user_a           UUID NOT NULL,
  user_b           UUID NOT NULL,
  server_id        UUID NOT NULL,
  total_sec        BIGINT NOT NULL DEFAULT 0,
  last_overlap_at  TIMESTAMPTZ,
  PRIMARY KEY (user_a, user_b, server_id),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_cp_server_total
  ON co_presence(server_id, total_sec DESC);
CREATE INDEX IF NOT EXISTS idx_cp_server_last_overlap
  ON co_presence(server_id, last_overlap_at DESC);

-- ---------------------------------------------------------------------------
-- activity_heatmap
-- Materialized view queried by getInsights and refreshed by startup/endpoint.
-- Includes unique_users required by current frontend tooltip.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS activity_heatmap AS
SELECT
  server_id,
  EXTRACT(DOW FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS dow,
  EXTRACT(HOUR FROM joined_at AT TIME ZONE 'Europe/Istanbul')::INT AS hour,
  SUM(duration_sec)::BIGINT AS total_sec,
  COUNT(*)::INT AS session_count,
  COUNT(DISTINCT user_id)::INT AS unique_users
FROM voice_sessions
WHERE left_at IS NOT NULL
  AND joined_at > now() - INTERVAL '90 days'
GROUP BY server_id, dow, hour;

CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_unique
  ON activity_heatmap(server_id, dow, hour);
