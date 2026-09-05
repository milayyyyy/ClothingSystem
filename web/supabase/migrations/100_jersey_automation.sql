-- Migration 100: Jersey Automation — CMYK PDF template management and batch generation

-- Template sets (one per jersey design)
create table if not exists public.jersey_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Per-size configuration within a template set
create table if not exists public.jersey_template_sizes (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.jersey_templates(id) on delete cascade,
  size            text not null,   -- XS | S | M | L | XL | 2XL | 3XL
  pdf_path        text,            -- path inside the jersey-templates storage bucket
  -- SURNAME text placement (PDF points; origin bottom-left)
  name_x          numeric not null default 100,
  name_y          numeric not null default 120,
  name_font_size  numeric not null default 28,
  name_cmyk_c     numeric not null default 0   check (name_cmyk_c   between 0 and 100),
  name_cmyk_m     numeric not null default 0   check (name_cmyk_m   between 0 and 100),
  name_cmyk_y     numeric not null default 0   check (name_cmyk_y   between 0 and 100),
  name_cmyk_k     numeric not null default 100 check (name_cmyk_k   between 0 and 100),
  -- JERSEY NUMBER text placement
  number_x        numeric not null default 100,
  number_y        numeric not null default 220,
  number_font_size numeric not null default 60,
  number_cmyk_c   numeric not null default 0   check (number_cmyk_c between 0 and 100),
  number_cmyk_m   numeric not null default 0   check (number_cmyk_m between 0 and 100),
  number_cmyk_y   numeric not null default 0   check (number_cmyk_y between 0 and 100),
  number_cmyk_k   numeric not null default 100 check (number_cmyk_k between 0 and 100),
  unique (template_id, size),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jersey_template_sizes_tpl_idx on public.jersey_template_sizes (template_id);

-- RLS
alter table public.jersey_templates       enable row level security;
alter table public.jersey_template_sizes  enable row level security;

drop policy if exists jersey_templates_select on public.jersey_templates;
create policy jersey_templates_select on public.jersey_templates
  for select using (public.is_admin_or_sub());

drop policy if exists jersey_templates_write on public.jersey_templates;
create policy jersey_templates_write on public.jersey_templates
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

drop policy if exists jersey_template_sizes_select on public.jersey_template_sizes;
create policy jersey_template_sizes_select on public.jersey_template_sizes
  for select using (public.is_admin_or_sub());

drop policy if exists jersey_template_sizes_write on public.jersey_template_sizes;
create policy jersey_template_sizes_write on public.jersey_template_sizes
  for all using (public.is_admin_or_sub()) with check (public.is_admin_or_sub());

-- Storage bucket for master CMYK PDF templates
insert into storage.buckets (id, name, public)
select 'jersey-templates', 'jersey-templates', false
where not exists (select 1 from storage.buckets where id = 'jersey-templates');

drop policy if exists jersey_templates_storage_select on storage.objects;
create policy jersey_templates_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'jersey-templates' and public.is_admin_or_sub());

drop policy if exists jersey_templates_storage_insert on storage.objects;
create policy jersey_templates_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'jersey-templates' and public.is_admin_or_sub());

drop policy if exists jersey_templates_storage_update on storage.objects;
create policy jersey_templates_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'jersey-templates' and public.is_admin_or_sub());

drop policy if exists jersey_templates_storage_delete on storage.objects;
create policy jersey_templates_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'jersey-templates' and public.is_admin_or_sub());
