ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dm_privacy_mode TEXT NOT NULL DEFAULT 'everyone';

UPDATE profiles
   SET dm_privacy_mode = CASE
     WHEN COALESCE(allow_non_friend_dms, true) = false THEN 'friends_only'
     ELSE 'everyone'
   END
 WHERE dm_privacy_mode IS NULL
    OR dm_privacy_mode NOT IN ('everyone', 'mutual_servers', 'friends_only', 'closed');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'profiles_dm_privacy_mode_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_dm_privacy_mode_check
      CHECK (dm_privacy_mode IN ('everyone', 'mutual_servers', 'friends_only', 'closed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_dm_privacy_mode
  ON profiles(dm_privacy_mode);
