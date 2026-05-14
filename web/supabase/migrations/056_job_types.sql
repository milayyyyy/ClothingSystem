-- Job types for Services orders (e.g. DTF, Embroidery, Vinyl, Numbering).

create table if not exists public.job_types (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now()
);

alter table public.job_types enable row level security;

-- Admins and sub-admins can manage job types; authenticated users can read them.
create policy "admin_full_job_types" on public.job_types
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

create policy "authenticated_read_job_types" on public.job_types
  for select using (auth.role() = 'authenticated');

-- Attach job_type_id to orders (nullable; only services orders use it).
alter table public.orders
  add column if not exists job_type_id uuid references public.job_types(id) on delete set null;

-- Seed common job types.
insert into public.job_types (name, sort_order) values
  ('DTF Print',  1),
  ('Embroidery', 2),
  ('Vinyl',      3),
  ('Numbering',  4),
  ('Heat Press', 5)
on conflict do nothing;
