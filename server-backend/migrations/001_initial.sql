-- MAYVOX Server System — Initial Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Sunucular ──
CREATE TABLE servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  short_name    VARCHAR(2) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  invite_code   VARCHAR(8) NOT NULL UNIQUE,
  level         INT NOT NULL DEFAULT 1,
  capacity      INT NOT NULL DEFAULT 50,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_servers_invite_code ON servers(invite_code);
CREATE INDEX idx_servers_is_public ON servers(is_public) WHERE is_public = true;
CREATE INDEX idx_servers_owner ON servers(owner_user_id);

-- ── Sunucu üyeleri ──
CREATE TABLE server_members (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id              UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id                TEXT NOT NULL,
  role                   VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_muted               BOOLEAN NOT NULL DEFAULT false,
  is_notifications_muted BOOLEAN NOT NULL DEFAULT false,

  UNIQUE(server_id, user_id)
);

CREATE INDEX idx_members_user ON server_members(user_id);
CREATE INDEX idx_members_server ON server_members(server_id);

-- ── Kanallar ──
CREATE TABLE channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        VARCHAR(10) NOT NULL DEFAULT 'voice',
  position    INT NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_server ON channels(server_id);

-- ── Davetler ──
CREATE TABLE server_invites (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id          UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  code               VARCHAR(12) NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  max_uses           INT,
  used_count         INT NOT NULL DEFAULT 0,
  expires_at         TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_code ON server_invites(code);
CREATE INDEX idx_invites_server ON server_invites(server_id);

-- ── Sunucu aktivite istatistikleri ──
CREATE TABLE server_activity (
  server_id    UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  member_count INT NOT NULL DEFAULT 0,
  active_count INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
