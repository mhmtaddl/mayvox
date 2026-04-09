-- Friend favorites: personal pinning layer
create table if not exists public.friend_favorites (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_user_id),
  constraint ff_no_self check (owner_id <> friend_user_id)
);

create index if not exists idx_ff_owner on public.friend_favorites (owner_id);

-- RLS
alter table public.friend_favorites enable row level security;

create policy "Users manage own favorites"
  on public.friend_favorites for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
