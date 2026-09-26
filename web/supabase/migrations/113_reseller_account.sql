-- Reseller account type: view catalog, place orders, chat with admin/manager.
-- Do NOT add reseller to is_admin_or_sub().

do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'reseller' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'reseller';
  end if;
end $$;
commit;

create or replace function public.is_reseller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'reseller'
  );
$$;

create table if not exists public.reseller_orders (
  id           uuid primary key default gen_random_uuid(),
  reseller_id  uuid not null references public.profiles(id) on delete cascade,
  items        jsonb not null default '[]'::jsonb,
  notes        text,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reseller_orders_status_ok check (status in ('pending', 'confirmed', 'cancelled'))
);

create index if not exists reseller_orders_reseller_idx on public.reseller_orders (reseller_id, created_at desc);

create or replace function public.touch_reseller_orders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_reseller_orders_updated_at on public.reseller_orders;
create trigger trg_reseller_orders_updated_at
  before update on public.reseller_orders
  for each row execute function public.touch_reseller_orders_updated_at();

alter table public.reseller_orders enable row level security;

drop policy if exists reseller_orders_select on public.reseller_orders;
create policy reseller_orders_select on public.reseller_orders
  for select using (public.is_admin_or_sub() or reseller_id = auth.uid());

drop policy if exists reseller_orders_insert on public.reseller_orders;
create policy reseller_orders_insert on public.reseller_orders
  for insert with check (public.is_reseller() and reseller_id = auth.uid());

drop policy if exists reseller_orders_update on public.reseller_orders;
create policy reseller_orders_update on public.reseller_orders
  for update using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

create table if not exists public.reseller_chats (
  id           uuid primary key default gen_random_uuid(),
  reseller_id  uuid not null references public.profiles(id) on delete cascade,
  title        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reseller_chats_reseller_idx on public.reseller_chats (reseller_id, updated_at desc);

create or replace function public.touch_reseller_chats_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_reseller_chats_updated_at on public.reseller_chats;
create trigger trg_reseller_chats_updated_at
  before update on public.reseller_chats
  for each row execute function public.touch_reseller_chats_updated_at();

alter table public.reseller_chats enable row level security;

drop policy if exists reseller_chats_select on public.reseller_chats;
create policy reseller_chats_select on public.reseller_chats
  for select using (public.is_admin_or_sub() or reseller_id = auth.uid());

drop policy if exists reseller_chats_insert on public.reseller_chats;
create policy reseller_chats_insert on public.reseller_chats
  for insert with check (public.is_reseller() and reseller_id = auth.uid());

create table if not exists public.reseller_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.reseller_chats(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint reseller_chat_messages_body_not_blank check (length(trim(body)) > 0)
);

create index if not exists reseller_chat_messages_chat_idx
  on public.reseller_chat_messages (chat_id, created_at);

create or replace function public.bump_reseller_chat_from_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.reseller_chats set updated_at = now() where id = new.chat_id;
  return new;
end $$;

drop trigger if exists trg_bump_reseller_chat on public.reseller_chat_messages;
create trigger trg_bump_reseller_chat
  after insert on public.reseller_chat_messages
  for each row execute function public.bump_reseller_chat_from_message();

alter table public.reseller_chat_messages enable row level security;

drop policy if exists reseller_chat_messages_select on public.reseller_chat_messages;
create policy reseller_chat_messages_select on public.reseller_chat_messages
  for select using (
    exists (
      select 1 from public.reseller_chats c
      where c.id = chat_id and (public.is_admin_or_sub() or c.reseller_id = auth.uid())
    )
  );

drop policy if exists reseller_chat_messages_insert on public.reseller_chat_messages;
create policy reseller_chat_messages_insert on public.reseller_chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.reseller_chats c
      where c.id = chat_id and (public.is_admin_or_sub() or c.reseller_id = auth.uid())
    )
  );

do $$
begin
  if exists (select 1 from pg_proc where proname = 'log_activity') then
    execute 'drop trigger if exists trg_log_reseller_orders on public.reseller_orders';
    execute $t$
      create trigger trg_log_reseller_orders
        after insert or update or delete on public.reseller_orders
        for each row execute function public.log_activity()
    $t$;
    execute 'drop trigger if exists trg_log_reseller_chats on public.reseller_chats';
    execute $t$
      create trigger trg_log_reseller_chats
        after insert or update or delete on public.reseller_chats
        for each row execute function public.log_activity()
    $t$;
  end if;
end $$;

comment on table public.reseller_orders is 'Orders placed by reseller accounts.';
comment on table public.reseller_chats is 'Chat threads started by reseller accounts; admin and manager can reply.';
