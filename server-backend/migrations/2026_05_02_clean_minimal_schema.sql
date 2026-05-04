-- MAYVOX clean minimal schema for self-hosted Supabase/Postgres.
-- Goal: stabilize the current backend and remaining Supabase-client screens.
-- Safe rules: no DROP TABLE, no data deletion, idempotent creates/indexes/seeds.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration tracker used by server-backend/src/migrate.ts
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Auth/profile foundation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  display_name TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  age INT NOT NULL DEFAULT 18,
  avatar TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_primary_admin BOOLEAN NOT NULL DEFAULT false,
  is_moderator BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  mute_expires BIGINT,
  is_voice_banned BOOLEAN NOT NULL DEFAULT false,
  ban_expires BIGINT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  password_reset_requested BOOLEAN NOT NULL DEFAULT false,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ,
  total_usage_minutes INT NOT NULL DEFAULT 0,
  show_last_seen BOOLEAN NOT NULL DEFAULT true,
  last_seen_visibility TEXT NOT NULL DEFAULT 'everyone',
  online_visibility TEXT NOT NULL DEFAULT 'everyone',
  last_seen_except_ids UUID[] NOT NULL DEFAULT '{}',
  allow_non_friend_dms BOOLEAN NOT NULL DEFAULT true,
  show_dm_read_receipts BOOLEAN NOT NULL DEFAULT true,
  server_creation_plan TEXT NOT NULL DEFAULT 'none',
  server_creation_plan_source TEXT,
  server_creation_plan_start TIMESTAMPTZ,
  server_creation_plan_end TIMESTAMPTZ,
  user_level TEXT,
  user_level_source TEXT,
  user_level_start_at TIMESTAMPTZ,
  user_level_end_at TIMESTAMPTZ,
  avatar_border_color TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS age INT NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS avatar TEXT,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_primary_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mute_expires BIGINT,
  ADD COLUMN IF NOT EXISTS is_voice_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_expires BIGINT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_version TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_usage_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_seen_visibility TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS online_visibility TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS last_seen_except_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allow_non_friend_dms BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_dm_read_receipts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS server_creation_plan TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS server_creation_plan_source TEXT,
  ADD COLUMN IF NOT EXISTS server_creation_plan_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS server_creation_plan_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_level TEXT,
  ADD COLUMN IF NOT EXISTS user_level_source TEXT,
  ADD COLUMN IF NOT EXISTS user_level_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_level_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_border_color TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name_lower ON profiles (LOWER(name)) WHERE name IS NOT NULL AND name <> '';
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_role_system ON profiles(role) WHERE role = 'system_admin';
CREATE INDEX IF NOT EXISTS idx_profiles_server_creation_plan_active ON profiles(server_creation_plan) WHERE server_creation_plan IS NOT NULL AND server_creation_plan <> 'none';

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE app_users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_profile_id ON app_users(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower ON app_users(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower ON app_users(LOWER(username)) WHERE username IS NOT NULL;

-- Optional self-host Supabase Auth mapping: do not require auth.users, but backfill if present.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE app_users au
       SET auth_user_id = u.id
      FROM auth.users u
     WHERE au.auth_user_id IS NULL
       AND LOWER(au.email) = LOWER(u.email);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_key TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'web',
  app_version TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  disconnect_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id) WHERE disconnected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_stale ON user_sessions(last_heartbeat_at) WHERE disconnected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- ---------------------------------------------------------------------------
-- Server/domain tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name VARCHAR(2) NOT NULL,
  slug VARCHAR(24) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  invite_code VARCHAR(12) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  capacity INT NOT NULL DEFAULT 100,
  is_public BOOLEAN NOT NULL DEFAULT true,
  join_policy VARCHAR(20) NOT NULL DEFAULT 'invite_only',
  motto VARCHAR(15) NOT NULL DEFAULT '',
  plan VARCHAR(10) NOT NULL DEFAULT 'free',
  is_banned BOOLEAN NOT NULL DEFAULT false,
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  banned_by TEXT,
  moderation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS short_name VARCHAR(2),
  ADD COLUMN IF NOT EXISTS slug VARCHAR(24),
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS join_policy VARCHAR(20) NOT NULL DEFAULT 'invite_only',
  ADD COLUMN IF NOT EXISTS motto VARCHAR(15) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_by TEXT,
  ADD COLUMN IF NOT EXISTS moderation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_invite_code ON servers(invite_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_slug ON servers(slug);
CREATE UNIQUE INDEX IF NOT EXISTS servers_name_unique_idx ON servers(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_servers_is_public ON servers(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_servers_owner_plan ON servers(owner_user_id, plan);
CREATE INDEX IF NOT EXISTS idx_servers_is_banned ON servers(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_servers_banned_by ON servers(banned_by) WHERE banned_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_notifications_muted BOOLEAN NOT NULL DEFAULT false,
  voice_muted_by TEXT,
  voice_muted_at TIMESTAMPTZ,
  voice_mute_expires_at TIMESTAMPTZ,
  timeout_until TIMESTAMPTZ,
  timeout_set_by TEXT,
  timeout_set_at TIMESTAMPTZ,
  chat_banned_by TEXT,
  chat_banned_at TIMESTAMPTZ,
  chat_ban_expires_at TIMESTAMPTZ,
  UNIQUE(server_id, user_id)
);

ALTER TABLE server_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_notifications_muted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_muted_by TEXT,
  ADD COLUMN IF NOT EXISTS voice_muted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voice_mute_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_set_by TEXT,
  ADD COLUMN IF NOT EXISTS timeout_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chat_banned_by TEXT,
  ADD COLUMN IF NOT EXISTS chat_banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chat_ban_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_server ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_members_voice_mute_expires ON server_members(voice_mute_expires_at) WHERE voice_mute_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_timeout_until ON server_members(timeout_until) WHERE timeout_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_chat_ban_expires ON server_members(chat_ban_expires_at) WHERE chat_ban_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type VARCHAR(10) NOT NULL DEFAULT 'voice',
  position INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_persistent BOOLEAN NOT NULL DEFAULT true,
  owner_id TEXT,
  max_users INT,
  is_invite_only BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  mode VARCHAR(20),
  icon_name VARCHAR(32),
  icon_color VARCHAR(16),
  password_hash TEXT,
  password TEXT,
  speaker_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS server_id UUID,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'voice',
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_persistent BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_id TEXT,
  ADD COLUMN IF NOT EXISTS max_users INT,
  ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(32),
  ADD COLUMN IF NOT EXISTS icon_color VARCHAR(16),
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS speaker_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_channels_server_position ON channels(server_id, position);
CREATE INDEX IF NOT EXISTS idx_channels_server_persistent ON channels(server_id, is_persistent);
CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);

CREATE TABLE IF NOT EXISTS server_activity (
  server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  member_count INT NOT NULL DEFAULT 0,
  active_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS server_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bans_server ON server_bans(server_id);
CREATE INDEX IF NOT EXISTS idx_bans_user ON server_bans(user_id);

CREATE TABLE IF NOT EXISTS server_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  code VARCHAR(12) NOT NULL,
  created_by_user_id TEXT NOT NULL,
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code ON server_invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_server ON server_invites(server_id);

CREATE TABLE IF NOT EXISTS server_user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_invites_invited ON server_user_invites(invited_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_user_invites_server ON server_user_invites(server_id);

CREATE TABLE IF NOT EXISTS server_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'server',
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_links_token_hash ON server_invite_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_invite_links_server ON server_invite_links(server_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_channel ON server_invite_links(channel_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_server_created ON server_invite_links(server_id, created_at DESC);

CREATE TABLE IF NOT EXISTS server_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_join_requests_pending ON server_join_requests(server_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_join_requests_server_status ON server_join_requests(server_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS server_plans (
  server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_server_plans_plan ON server_plans(plan);

CREATE TABLE IF NOT EXISTS server_plan_limits (
  plan TEXT PRIMARY KEY,
  max_members INT NOT NULL,
  system_rooms INT NOT NULL,
  extra_persistent_rooms INT NOT NULL,
  max_non_persistent_rooms INT NOT NULL,
  max_total_rooms INT NOT NULL,
  system_room_capacity INT NOT NULL,
  persistent_room_capacity INT NOT NULL,
  non_persistent_room_capacity INT NOT NULL,
  max_invite_links_per_day INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO server_plan_limits
  (plan, max_members, system_rooms, extra_persistent_rooms, max_non_persistent_rooms, max_total_rooms,
   system_room_capacity, persistent_room_capacity, non_persistent_room_capacity, max_invite_links_per_day)
VALUES
  ('free', 100, 4, 0, 2, 6, 15, 20, 20, 20),
  ('pro', 300, 4, 2, 3, 9, 25, 30, 35, 100),
  ('ultra', 1000, 4, 6, 10, 20, 35, 45, 60, 500)
ON CONFLICT (plan) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Authorization roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);

CREATE TABLE IF NOT EXISTS role_capabilities (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  PRIMARY KEY(role_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_role_capabilities_capability ON role_capabilities(capability);

CREATE TABLE IF NOT EXISTS member_roles (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(server_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_member_roles_user ON member_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON member_roles(role_id);

CREATE TABLE IF NOT EXISTS channel_access (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_access_user ON channel_access(user_id);

-- ---------------------------------------------------------------------------
-- Audit/moderation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(30),
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_server_time ON audit_log(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

CREATE TABLE IF NOT EXISTS system_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_admin_time ON system_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_target ON system_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_action ON system_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_system_audit_created ON system_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_stats (
  id BIGSERIAL PRIMARY KEY,
  server_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'flood',
  user_id TEXT,
  channel_id TEXT,
  trigger_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modstats_server_time ON moderation_stats(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modstats_server_user_time ON moderation_stats(server_id, user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Voice activity / insights
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  server_id UUID NOT NULL,
  room_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_sec INT GENERATED ALWAYS AS (
    CASE
      WHEN left_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (left_at - joined_at))::INT)
    END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_vs_user_server_time ON voice_sessions(user_id, server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_server_time ON voice_sessions(server_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_active ON voice_sessions(room_id, user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vs_server_user_time ON voice_sessions(server_id, user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS co_presence (
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  server_id UUID NOT NULL,
  total_sec BIGINT NOT NULL DEFAULT 0,
  last_overlap_at TIMESTAMPTZ,
  PRIMARY KEY(user_a, user_b, server_id),
  CHECK(user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_cp_server_total ON co_presence(server_id, total_sec DESC);
CREATE INDEX IF NOT EXISTS idx_cp_server_last_overlap ON co_presence(server_id, last_overlap_at DESC);

-- Create activity_heatmap as MV only when no relation with that name exists.
-- If production already has a table named activity_heatmap, leave it untouched.
DO $$
BEGIN
  IF to_regclass('public.activity_heatmap') IS NULL THEN
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW activity_heatmap AS
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
      GROUP BY server_id, dow, hour
    $mv$;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_unique ON activity_heatmap(server_id, dow, hour);

-- ---------------------------------------------------------------------------
-- Remaining frontend Supabase-client tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  user_low_id UUID NOT NULL,
  user_high_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_low_id, user_high_id),
  CHECK(user_low_id <> user_high_id),
  CHECK(user_low_id < user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_low ON friendships(user_low_id);
CREATE INDEX IF NOT EXISTS idx_friendships_high ON friendships(user_high_id);

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fr_unique_pending ON friend_requests(LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_fr_receiver ON friend_requests(receiver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_fr_sender ON friend_requests(sender_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friend_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fg_owner ON friend_groups(owner_id);

CREATE TABLE IF NOT EXISTS friend_group_members (
  group_id UUID NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  friend_user_id UUID NOT NULL,
  PRIMARY KEY(group_id, friend_user_id)
);

CREATE INDEX IF NOT EXISTS idx_fgm_friend ON friend_group_members(friend_user_id);

CREATE TABLE IF NOT EXISTS friend_favorites (
  owner_id UUID NOT NULL,
  friend_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, friend_user_id),
  CHECK(owner_id <> friend_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ff_owner ON friend_favorites(owner_id);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID,
  author_name TEXT NOT NULL DEFAULT '',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority TEXT NOT NULL DEFAULT 'normal',
  type TEXT NOT NULL DEFAULT 'announcement',
  event_date TEXT,
  participation_time TEXT,
  participation_requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_author ON announcements(author_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by UUID,
  expires_at BIGINT,
  used BOOLEAN NOT NULL DEFAULT false,
  email TEXT,
  used_by_email TEXT,
  used_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_email ON invite_codes(email);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);

CREATE TABLE IF NOT EXISTS invite_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  code TEXT,
  expires_at BIGINT,
  rejection_count INT NOT NULL DEFAULT 0,
  blocked_until BIGINT,
  permanently_blocked BOOLEAN NOT NULL DEFAULT false,
  last_send_error TEXT,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_requests_email ON invite_requests(email);
CREATE INDEX IF NOT EXISTS idx_invite_requests_status ON invite_requests(status);
CREATE INDEX IF NOT EXISTS idx_invite_requests_created ON invite_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS invite_email_bans (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme TEXT,
  notifications_enabled BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_avatar TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_messages_channel_time ON room_messages(channel_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_room_messages_sender ON room_messages(sender_id);

-- ---------------------------------------------------------------------------
-- System role/capability seed
-- ---------------------------------------------------------------------------
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

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
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
) AS c(cap)
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
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
) AS c(cap)
WHERE r.is_system = true AND r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
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
) AS c(cap)
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.moderation.update'),
  ('invite.create'), ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban'),
  ('role.assign.lower'), ('insights.view')
) AS c(cap)
WHERE r.is_system = true AND r.name = 'super_mod'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('server.moderation.update'),
  ('invite.revoke'),
  ('member.move'), ('member.kick'), ('member.mute'), ('member.timeout'),
  ('member.room_kick'), ('member.chat_ban')
) AS c(cap)
WHERE r.is_system = true AND r.name = 'mod'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join'), ('invite.create')
) AS c(cap)
WHERE r.is_system = true AND r.name = 'super_member'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c.cap
FROM roles r
CROSS JOIN (VALUES
  ('server.view'), ('server.join')
) AS c(cap)
WHERE r.is_system = true AND r.name = 'member'
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.server_members') IS NOT NULL THEN
    INSERT INTO member_roles (server_id, user_id, role_id)
    SELECT sm.server_id, sm.user_id, r.id
    FROM server_members sm
    JOIN roles r
      ON r.server_id = sm.server_id
     AND r.is_system = true
     AND r.name = CASE sm.role WHEN 'moderator' THEN 'mod' ELSE sm.role END
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Backend uses service credentials/direct Postgres. Disable RLS on app public tables
-- so missing/old policies do not break minimum viable operation. auth schema untouched.
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE servers DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_bans DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_user_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_invite_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_join_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_plan_limits DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_capabilities DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE channel_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE co_presence DISABLE ROW LEVEL SECURITY;
ALTER TABLE friendships DISABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE friend_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE friend_group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE friend_favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE invite_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE invite_email_bans DISABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages DISABLE ROW LEVEL SECURITY;
