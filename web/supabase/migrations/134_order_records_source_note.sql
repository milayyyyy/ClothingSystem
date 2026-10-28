-- Allow daily order records that are paste-in notes (not stock-usage sheets).

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.order_records'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%source%'
  limit 1;
  if cname is not null then
    execute format('alter table public.order_records drop constraint %I', cname);
  end if;
end $$;

alter table public.order_records
  add constraint order_records_source_check
  check (source in ('manual', 'pos', 'note'));

comment on column public.order_records.source is 'manual = usage sheets; pos = POS sale; note = pasted Daily order note';
