-- Permanent staff vs on-call technicians / sewers / staff.
do $$ begin
  create type public.employment_category as enum ('permanent', 'on_call');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists employment_category public.employment_category not null default 'permanent';

comment on column public.profiles.employment_category is
  'permanent = regular staff; on_call = on-call technicians, sewers, and similar.';

update public.profiles
set employment_category = 'permanent'
where employment_category is null;
