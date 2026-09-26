-- Share sticky notes with selected accounts. Recipients can read them in Notes.
-- Helpers are security definer so RLS on notes and shares does not recurse.

create table if not exists public.sticky_note_shares (
  note_id     uuid not null references public.sticky_notes(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (note_id, shared_with)
);

create index if not exists sticky_note_shares_shared_with_idx
  on public.sticky_note_shares (shared_with);

create or replace function public.sticky_note_owned_by_me(p_note_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sticky_notes
    where id = p_note_id and user_id = auth.uid()
  );
$$;

create or replace function public.sticky_note_shared_with_me(p_note_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sticky_note_shares
    where note_id = p_note_id and shared_with = auth.uid()
  );
$$;

-- Accounts that can use Notes (everyone except reseller). Used for the share picker.
create or replace function public.list_note_accounts()
returns table (id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.role::text
  from public.profiles p
  where p.role::text is distinct from 'reseller'
  order by coalesce(nullif(trim(p.full_name), ''), p.email);
$$;

grant execute on function public.sticky_note_owned_by_me(uuid) to authenticated;
grant execute on function public.sticky_note_shared_with_me(uuid) to authenticated;
grant execute on function public.list_note_accounts() to authenticated;
grant select, insert, delete on public.sticky_note_shares to authenticated;

drop policy if exists "users read own sticky notes" on public.sticky_notes;
drop policy if exists sticky_notes_select on public.sticky_notes;
create policy sticky_notes_select on public.sticky_notes
  for select using (
    user_id = auth.uid()
    or public.sticky_note_shared_with_me(id)
  );

alter table public.sticky_note_shares enable row level security;

drop policy if exists sticky_note_shares_select on public.sticky_note_shares;
create policy sticky_note_shares_select on public.sticky_note_shares
  for select using (
    shared_with = auth.uid()
    or public.sticky_note_owned_by_me(note_id)
  );

drop policy if exists sticky_note_shares_insert on public.sticky_note_shares;
create policy sticky_note_shares_insert on public.sticky_note_shares
  for insert with check (
    public.sticky_note_owned_by_me(note_id)
    and shared_with is distinct from auth.uid()
  );

drop policy if exists sticky_note_shares_delete on public.sticky_note_shares;
create policy sticky_note_shares_delete on public.sticky_note_shares
  for delete using (public.sticky_note_owned_by_me(note_id));

comment on table public.sticky_note_shares is
  'Accounts chosen by a note owner who can see that note in their Notes panel.';
