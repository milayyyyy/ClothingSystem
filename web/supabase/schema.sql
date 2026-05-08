-- =========================================================================
-- PRINTING SHOP - Supabase schema with Row Level Security
-- Run this in the Supabase SQL editor.
-- =========================================================================

-- Enums ------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'printing', 'sewing', 'ready', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type salary_type as enum ('daily', 'monthly', 'per_order');
exception when duplicate_object then null; end $$;

-- Profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'employee',
  phone text,
  position text,
  salary_type salary_type default 'daily',
  salary_rate numeric(12,2) default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'employee')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is current user admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Inventory --------------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  quantity numeric(12,2) default 0,
  unit text default 'pcs',
  min_level numeric(12,2) default 0,
  unit_cost numeric(12,2) default 0,
  supplier text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Orders -----------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no serial unique,
  customer_name text not null,
  customer_phone text,
  order_type text default 'sublimation',
  quantity int default 1,
  unit_price numeric(12,2) default 0,
  total numeric(12,2) generated always as (quantity * unit_price) stored,
  down_payment numeric(12,2) default 0,
  status order_status default 'pending',
  due_date date,
  notes text,
  design_ref text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Attendance -------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  time_in timestamptz not null default now(),
  time_out timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- Expenses ---------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text,
  amount numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Salary payouts ---------------------------------------------------------
create table if not exists public.salaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  days_worked int default 0,
  gross_pay numeric(12,2) default 0,
  deductions numeric(12,2) default 0,
  net_pay numeric(12,2) default 0,
  paid boolean default false,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY -----------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.inventory enable row level security;
alter table public.orders    enable row level security;
alter table public.attendance enable row level security;
alter table public.expenses  enable row level security;
alter table public.salaries  enable row level security;

-- profiles policies
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- inventory policies
drop policy if exists inventory_select_authed on public.inventory;
create policy inventory_select_authed on public.inventory
  for select using (auth.role() = 'authenticated');

drop policy if exists inventory_admin_write on public.inventory;
create policy inventory_admin_write on public.inventory
  for all using (public.is_admin()) with check (public.is_admin());

-- orders policies
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (public.is_admin() or assigned_to = auth.uid());

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_employee_status on public.orders;
create policy orders_employee_status on public.orders
  for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- attendance policies
drop policy if exists attendance_self on public.attendance;
create policy attendance_self on public.attendance
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- expenses policies (admin only)
drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses
  for all using (public.is_admin()) with check (public.is_admin());

-- salaries policies
drop policy if exists salaries_select on public.salaries;
create policy salaries_select on public.salaries
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists salaries_admin_write on public.salaries;
create policy salaries_admin_write on public.salaries
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed: promote dripsprinting@gmail.com to admin once that auth user exists.
-- (Create the auth user first via Supabase Dashboard > Authentication > Users.)
update public.profiles
   set role = 'admin', full_name = 'Drips Printing Admin'
 where email = 'dripsprinting@gmail.com';

-- Seed inventory ---------------------------------------------------------
insert into public.inventory (name, category, quantity, unit, min_level, unit_cost, supplier) values
  ('Sublimation fabric',     'Materials', 120, 'meters', 50,  180, 'TexMart'),
  ('Polyester jersey cloth', 'Materials',  80, 'meters', 40,  220, 'TexMart'),
  ('Sublimation ink CMYK',   'Materials',  18, 'liters', 10,  950, 'InkPro'),
  ('Transfer paper rolls',   'Materials',  25, 'rolls',  15,  650, 'PaperHub'),
  ('Sewing thread',          'Supplies',  140, 'spools', 60,   45, 'ThreadCo'),
  ('Zippers',                'Supplies',  300, 'pcs',   100,    8, 'TrimWorld'),
  ('Teflon sheets',          'Supplies',   12, 'pcs',     6,  320, 'PressMart'),
  ('Packaging bags',         'Supplies',  450, 'pcs',   200,    3, 'PackPro')
on conflict do nothing;
