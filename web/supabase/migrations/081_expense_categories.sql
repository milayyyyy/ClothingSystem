-- Expense category labels (dropdown, filters, imports).

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists expense_categories_name_lower_uidx
  on public.expense_categories (lower(trim(name)));

create index if not exists expense_categories_sort_idx on public.expense_categories (sort_order, name);

comment on table public.expense_categories is
  'Labels for expenses.category; manage under Admin → Expenses.';

insert into public.expense_categories (name, sort_order) values
  ('Materials', 0),
  ('Fabrics', 1),
  ('Salary', 2),
  ('Employee Expenses', 3),
  ('Marketing', 4),
  ('Utilities', 5),
  ('Maintenance', 6),
  ('Logistics', 7),
  ('Supplies', 8),
  ('Equipment', 9),
  ('Rent', 10),
  ('Other', 11),
  ('Machines', 12),
  ('Miscellaneous', 13),
  ('TELA', 14),
  ('ADVERTISEMENT', 15),
  ('Content Shoot Expenses', 16),
  ('Employee Food', 17),
  ('Heat Transfer Vinyl', 18),
  ('Parcel Pouch', 19),
  ('Vellum Board', 20),
  ('Vinyl Stickers', 21),
  ('Ziplock', 22);

alter table public.expense_categories enable row level security;

drop policy if exists expense_categories_select on public.expense_categories;
create policy expense_categories_select on public.expense_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists expense_categories_write on public.expense_categories;
create policy expense_categories_write on public.expense_categories
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());
