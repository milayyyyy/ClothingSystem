insert into public.expense_categories (name, sort_order)
select 'Commission', coalesce((select max(sort_order) from public.expense_categories), 0) + 1
where not exists (
  select 1 from public.expense_categories where lower(trim(name)) = 'commission'
);
