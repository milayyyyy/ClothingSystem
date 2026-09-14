-- Deleting a salary expense (or its finance transaction via expense cascade)
-- must also drop the payroll row so Recorded payroll and My Salary stay in sync.
-- Previously ON DELETE SET NULL left an orphan salary after the expense was gone.

do $$
declare
  fk_name text;
begin
  select c.conname into fk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'salaries'
    and c.contype = 'f'
    and pg_get_constraintdef(c.oid) ilike '%expense_id%expenses%';
  if fk_name is not null then
    execute format('alter table public.salaries drop constraint %I', fk_name);
  end if;
end $$;

alter table public.salaries
  add constraint salaries_expense_id_fkey
  foreign key (expense_id) references public.expenses(id) on delete cascade;

comment on column public.salaries.expense_id is
  'Salary expense row paired with this payout; deleting the expense also deletes this payroll row.';
