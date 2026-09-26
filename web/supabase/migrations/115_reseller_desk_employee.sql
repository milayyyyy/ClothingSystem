-- Employees can view reseller orders and chat, and reply / update order status.
-- Do NOT add employee to is_admin_or_sub().

create or replace function public.is_employee()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'employee'
  );
$$;

create or replace function public.can_work_reseller_desk()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_sub() or public.is_employee();
$$;

grant execute on function public.is_employee() to authenticated;
grant execute on function public.can_work_reseller_desk() to authenticated;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'reseller_orders') then
    execute 'drop policy if exists reseller_orders_select on public.reseller_orders';
    execute $p$
      create policy reseller_orders_select on public.reseller_orders
        for select using (public.can_work_reseller_desk() or reseller_id = auth.uid())
    $p$;
    execute 'drop policy if exists reseller_orders_update on public.reseller_orders';
    execute $p$
      create policy reseller_orders_update on public.reseller_orders
        for update using (public.can_work_reseller_desk())
        with check (public.can_work_reseller_desk())
    $p$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'reseller_chats') then
    execute 'drop policy if exists reseller_chats_select on public.reseller_chats';
    execute $p$
      create policy reseller_chats_select on public.reseller_chats
        for select using (public.can_work_reseller_desk() or reseller_id = auth.uid())
    $p$;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'reseller_chat_messages') then
    execute 'drop policy if exists reseller_chat_messages_select on public.reseller_chat_messages';
    execute $p$
      create policy reseller_chat_messages_select on public.reseller_chat_messages
        for select using (
          exists (
            select 1 from public.reseller_chats c
            where c.id = chat_id
              and (public.can_work_reseller_desk() or c.reseller_id = auth.uid())
          )
        )
    $p$;
    execute 'drop policy if exists reseller_chat_messages_insert on public.reseller_chat_messages';
    execute $p$
      create policy reseller_chat_messages_insert on public.reseller_chat_messages
        for insert with check (
          sender_id = auth.uid()
          and exists (
            select 1 from public.reseller_chats c
            where c.id = chat_id
              and (public.can_work_reseller_desk() or c.reseller_id = auth.uid())
          )
        )
    $p$;
  end if;
end $$;
