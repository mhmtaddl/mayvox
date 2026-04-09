-- Fix: eski unique index yanlıştı (friend_user_id, group_id) = PK ile aynı.
-- Doğrusu: aynı owner'a ait tüm gruplarda bir friend sadece 1 kez olabilir.
-- Bunu doğrudan friend_group_members üzerinde enforce edemeyiz (owner_id yok),
-- bu yüzden friend_group_members'a owner_id ekliyoruz.

-- 1. owner_id kolonu ekle
alter table public.friend_group_members
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- 2. Mevcut satırları doldur
update public.friend_group_members fgm
  set owner_id = fg.owner_id
  from public.friend_groups fg
  where fgm.group_id = fg.id
    and fgm.owner_id is null;

-- 3. NOT NULL yap
alter table public.friend_group_members
  alter column owner_id set not null;

-- 4. Eski yanlış index'i kaldır
drop index if exists idx_fgm_one_group_per_friend;

-- 5. Doğru unique constraint: bir owner için bir friend sadece 1 grupta
create unique index idx_fgm_one_friend_per_owner
  on public.friend_group_members (owner_id, friend_user_id);
