-- Add "services" order kind (embroidery, DTF, vinyl, numbering, etc.).

do $$
begin
  if exists (select 1 from pg_type where typname = 'order_kind') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'order_kind' and e.enumlabel = 'services'
    ) then
      alter type order_kind add value 'services';
    end if;
  end if;
end $$;
