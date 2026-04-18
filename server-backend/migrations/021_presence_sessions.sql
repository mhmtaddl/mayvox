-- ============================================================================
-- 021_presence_sessions.sql
-- Backend-driven presence system: user_sessions table + profiles privacy columns.
-- Safe to re-run (idempotent).
-- ============================================================================

-- 1) profiles: privacy kolonları (default 'everyone' → mevcut davranışı bozmaz)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (last_seen_visibility IN ('everyone','contacts','contacts_except','nobody')),
  ADD COLUMN IF NOT EXISTS online_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (online_visibility IN ('everyone','contacts','contacts_except','nobody')),
  ADD COLUMN IF NOT EXISTS last_seen_except_ids uuid[] NOT NULL DEFAULT '{}';

-- 2) Mevcut show_last_seen değerini yeni enum'a map'le
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'show_last_seen'
  ) THEN
    UPDATE profiles
      SET last_seen_visibility = 'nobody'
      WHERE show_last_seen = false AND last_seen_visibility = 'everyone';
  END IF;
END $$;

-- 3) user_sessions: her WS connection = 1 row, session_key unique
CREATE TABLE IF NOT EXISTS user_sessions (
  session_key        text PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_id          text NOT NULL,
  platform           text NOT NULL CHECK (platform IN ('desktop','mobile','web')),
  app_version        text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at  timestamptz NOT NULL DEFAULT now(),
  disconnected_at    timestamptz,
  disconnect_reason  text
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id) WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_stale
  ON user_sessions (last_heartbeat_at) WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions (user_id);

-- 4) Orphan session'ları kapat (migration re-run güvenliği)
UPDATE user_sessions
   SET disconnected_at = now(),
       disconnect_reason = COALESCE(disconnect_reason, 'migration_boot')
 WHERE disconnected_at IS NULL;

COMMENT ON TABLE user_sessions IS
  'Presence sessions. Her aktif WebSocket = 1 row. disconnected_at IS NULL = aktif.';
