-- Richer activity log: field-level diffs on update, structured payload for add/delete.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rolev user_role;
  pid text;
  summ text;
  payload jsonb;
  changes jsonb := '[]'::jsonb;
  k text;
  oldj jsonb;
  newj jsonb;
  change_count int;
  skip_fields text[] := array['updated_at', 'created_at'];
begin
  if uid is null then
    return coalesce(new, old);
  end if;

  select role into rolev from public.profiles where id = uid;

  oldj := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  newj := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
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
