-- Per-user sticky notes (admin, sub_admin, employee)

create table if not exists public.sticky_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'Note',
  body        text not null default '',
  color       text not null default 'yellow'
    check (color in ('yellow', 'pink', 'blue', 'green', 'purple')),
  pos_x       integer not null default 24,
  pos_y       integer not null default 96,
  width       integer not null default 240,
  height      integer not null default 200,
  z_index     integer not null default 1,
  is_minimized boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sticky_notes_user_id_idx on public.sticky_notes(user_id);

alter table public.sticky_notes enable row level security;

drop policy if exists "users read own sticky notes" on public.sticky_notes;
drop policy if exists "users insert own sticky notes" on public.sticky_notes;
drop policy if exists "users update own sticky notes" on public.sticky_notes;
drop policy if exists "users delete own sticky notes" on public.sticky_notes;

create policy "users read own sticky notes"
  on public.sticky_notes for select
  using (user_id = auth.uid());

create policy "users insert own sticky notes"
  on public.sticky_notes for insert
  with check (user_id = auth.uid());

create policy "users update own sticky notes"
  on public.sticky_notes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own sticky notes"
  on public.sticky_notes for delete
  using (user_id = auth.uid());
