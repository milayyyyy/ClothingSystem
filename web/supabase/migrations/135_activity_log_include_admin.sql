-- Activity log must record and display admin actions, not only manager/employee.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  rolev user_role;
  pid text;
  summ text;
  payload jsonb;
  changes jsonb := '[]'::jsonb;
  k text;
  oldj jsonb;
  newj jsonb;
  change_count int;
  skip_fields text[] := array['updated_at', 'created_at', 'bigseller_password'];
begin
  uid := auth.uid();
  if uid is null then
    begin
      uid := (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    exception when others then
      uid := null;
    end;
  end if;

  -- Still log when we know who acted. Never skip admin / manager / employee.
  if uid is null then
    return coalesce(new, old);
  end if;

  select role into rolev from public.profiles where id = uid;

  oldj := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  newj := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  if oldj is not null then
    oldj := oldj - 'bigseller_password';
  end if;
  if newj is not null then
    newj := newj - 'bigseller_password';
  end if;
  pid := coalesce(newj->>'id', oldj->>'id');

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(newj) loop
      if k = any (skip_fields) then
        continue;
      end if;
      if (oldj -> k) is distinct from (newj -> k) then
        changes :=
          changes
          || jsonb_build_array(
            jsonb_build_object(
              'field', k,
              'from', oldj -> k,
              'to', newj -> k
            )
          );
      end if;
    end loop;

    change_count := coalesce(jsonb_array_length(changes), 0);
    summ :=
      tg_table_name
      || ': edited '
      || change_count::text
      || case when change_count = 1 then ' field' else ' fields' end;

    payload := jsonb_build_object(
      'version', 2,
      'op', tg_op,
      'table', tg_table_name,
      'entity_id', pid,
      'changes', changes,
      'before', oldj,
      'after', newj
    );
  elsif tg_op = 'INSERT' then
    summ := tg_table_name || ': added';
    payload := jsonb_build_object(
      'version', 2,
      'op', tg_op,
      'table', tg_table_name,
      'entity_id', pid,
      'record', newj
    );
  else
    summ := tg_table_name || ': deleted';
    payload := jsonb_build_object(
      'version', 2,
      'op', tg_op,
      'table', tg_table_name,
      'entity_id', pid,
      'record', oldj
    );
  end if;

  insert into public.activity_logs (actor_id, actor_role, action, entity, entity_id, summary, payload)
  values (uid, rolev, tg_op, tg_table_name, pid, summ, payload);

  return coalesce(new, old);
end;
$$;

drop policy if exists activity_select on public.activity_logs;
create policy activity_select on public.activity_logs
  for select
  using (public.is_admin_or_sub());

comment on function public.log_activity() is
  'Logs INSERT/UPDATE/DELETE for every signed-in user, including admin.';
