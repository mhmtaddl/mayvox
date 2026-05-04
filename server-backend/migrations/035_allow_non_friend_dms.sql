-- Account privacy: non-friend direct messages are enabled by default; users can opt out.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_non_friend_dms BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE profiles
  ALTER COLUMN allow_non_friend_dms SET DEFAULT true;

UPDATE profiles
   SET allow_non_friend_dms = true
 WHERE allow_non_friend_dms IS DISTINCT FROM true;

-- DM privacy: users can hide read receipts from senders while unread state still clears.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS show_dm_read_receipts BOOLEAN NOT NULL DEFAULT true;
