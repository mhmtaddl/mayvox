-- Friend system uses MAYVox profile ids, not auth.users ids.
-- Older Supabase-era schemas could leave these foreign keys pointing to auth.users,
-- which makes /auth/friends/requests fail with FK violations for valid profiles.

ALTER TABLE IF EXISTS friend_requests
  DROP CONSTRAINT IF EXISTS friend_requests_sender_id_fkey,
  DROP CONSTRAINT IF EXISTS friend_requests_receiver_id_fkey;

ALTER TABLE IF EXISTS friendships
  DROP CONSTRAINT IF EXISTS friendships_user_low_id_fkey,
  DROP CONSTRAINT IF EXISTS friendships_user_high_id_fkey;

ALTER TABLE IF EXISTS friend_requests
  ADD CONSTRAINT friend_requests_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT friend_requests_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS friendships
  ADD CONSTRAINT friendships_user_low_id_fkey
    FOREIGN KEY (user_low_id) REFERENCES profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT friendships_user_high_id_fkey
    FOREIGN KEY (user_high_id) REFERENCES profiles(id) ON DELETE CASCADE;
