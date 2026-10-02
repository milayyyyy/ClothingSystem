-- Seen receipts on reseller chat messages. Delivered = saved (created_at).
-- Participants may mark others' messages seen. Do NOT add employee to is_admin_or_sub().

alter table public.reseller_chat_messages
  add column if not exists seen_at timestamptz;

comment on column public.reseller_chat_messages.seen_at is
  'When a participant other than the sender opened the chat and saw this message.';

create or replace function public.reseller_chat_messages_before_update()
returns trigger language plpgsql as $$
begin
  if old.chat_id is distinct from new.chat_id
     or old.sender_id is distinct from new.sender_id
     or old.body is distinct from new.body
     or old.created_at is distinct from new.created_at then
    raise exception 'Chat messages can only be marked seen';
  end if;
  if old.seen_at is not null then
    new.seen_at := old.seen_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reseller_chat_messages_before_update on public.reseller_chat_messages;
create trigger trg_reseller_chat_messages_before_update
  before update on public.reseller_chat_messages
  for each row execute function public.reseller_chat_messages_before_update();

drop policy if exists reseller_chat_messages_update_seen on public.reseller_chat_messages;
create policy reseller_chat_messages_update_seen on public.reseller_chat_messages
  for update
  using (
    sender_id is distinct from auth.uid()
    and exists (
      select 1 from public.reseller_chats c
      where c.id = chat_id
        and (public.can_work_reseller_desk() or c.reseller_id = auth.uid())
    )
  )
  with check (
    sender_id is distinct from auth.uid()
    and exists (
      select 1 from public.reseller_chats c
      where c.id = chat_id
        and (public.can_work_reseller_desk() or c.reseller_id = auth.uid())
    )
  );
