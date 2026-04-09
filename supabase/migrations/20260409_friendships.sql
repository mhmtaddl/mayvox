-- Friendships table: symmetric friendship model
-- user_low_id < user_high_id to prevent duplicates
create table if not exists public.friendships (
  user_low_id  uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  constraint friendships_no_self check (user_low_id <> user_high_id),
  constraint friendships_ordered check (user_low_id < user_high_id)
);

-- Index for fast "get my friends" queries
create index if not exists idx_friendships_low  on public.friendships (user_low_id);
create index if not exists idx_friendships_high on public.friendships (user_high_id);

-- RLS: users can only see/manage their own friendships
alter table public.friendships enable row level security;

create policy "Users can view own friendships"
  on public.friendships for select
  using (auth.uid() = user_low_id or auth.uid() = user_high_id);

create policy "Users can insert own friendships"
  on public.friendships for insert
  with check (auth.uid() = user_low_id or auth.uid() = user_high_id);

create policy "Users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = user_low_id or auth.uid() = user_high_id);
