-- Friend requests table for v2 request-based friendship system
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fr_no_self_request check (sender_id <> receiver_id),
  constraint fr_valid_status check (status in ('pending', 'accepted', 'rejected'))
);

-- Prevent duplicate pending requests between same pair (either direction)
create unique index if not exists idx_fr_unique_pending
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

-- Fast lookup: my incoming / outgoing requests
create index if not exists idx_fr_receiver on public.friend_requests (receiver_id) where status = 'pending';
create index if not exists idx_fr_sender   on public.friend_requests (sender_id)   where status = 'pending';

-- RLS
alter table public.friend_requests enable row level security;

create policy "Users can view own requests"
  on public.friend_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can insert own requests"
  on public.friend_requests for insert
  with check (auth.uid() = sender_id);

create policy "Users can update requests they received"
  on public.friend_requests for update
  using (auth.uid() = receiver_id or auth.uid() = sender_id);
