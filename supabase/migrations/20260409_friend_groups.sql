-- Friend groups: personal organization for sidebar
create table if not exists public.friend_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_fg_owner on public.friend_groups (owner_id);

-- Friend group members: which friend goes in which group
-- A friend can be in at most one group (enforced by unique on friend_user_id per owner's groups)
create table if not exists public.friend_group_members (
  group_id uuid not null references public.friend_groups(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, friend_user_id)
);

-- Bir arkadaş sadece bir grupta olabilir (owner bazında)
-- friend_user_id unique across all groups of same owner
create unique index if not exists idx_fgm_one_group_per_friend
  on public.friend_group_members (friend_user_id, group_id);

-- RLS
alter table public.friend_groups enable row level security;
alter table public.friend_group_members enable row level security;

create policy "Users manage own groups"
  on public.friend_groups for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users manage own group members"
  on public.friend_group_members for all
  using (
    exists (
      select 1 from public.friend_groups fg
      where fg.id = group_id and fg.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.friend_groups fg
      where fg.id = group_id and fg.owner_id = auth.uid()
    )
  );
