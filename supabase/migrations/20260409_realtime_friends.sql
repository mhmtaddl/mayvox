-- Enable Realtime for friend_requests and friendships tables
-- Required for postgres_changes subscription to work

alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.friendships;
