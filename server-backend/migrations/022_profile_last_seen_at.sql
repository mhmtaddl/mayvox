-- ============================================================================
-- 022_profile_last_seen_at.sql
-- profiles.last_seen_at column (was missing — old client-side heartbeat code
-- wrote to non-existent column and silently swallowed the 42703 error).
-- Backend presence system now writes this on last WebSocket session close.
-- Server NOW() authoritative; client timestamps never written.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN profiles.last_seen_at IS
  'Son WebSocket session kapandığında chat-server tarafından yazılır (server NOW()).';
