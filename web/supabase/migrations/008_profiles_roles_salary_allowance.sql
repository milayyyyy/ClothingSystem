-- Job roles (employee portal, same access pattern as employee)
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'sales' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'sales';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'artist' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'artist';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'sewer' and enumtypid = 'user_role'::regtype) then
    alter type user_role add value 'sewer';
  end if;
end $$;

-- Pay frequency for base salary_rate
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'weekly' and enumtypid = 'salary_type'::regtype) then
    alter type salary_type add value 'weekly';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'biweekly' and enumtypid = 'salary_type'::regtype) then
    alter type salary_type add value 'biweekly';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'every_3_weeks' and enumtypid = 'salary_type'::regtype) then
    alter type salary_type add value 'every_3_weeks';
  end if;
end $$;

do $$ begin
  create type allowance_basis as enum ('none', 'per_day', 'per_week', 'every_n_weeks', 'monthly');
exception when duplicate_object then null;
end $$;

alter table public.profiles add column if not exists allowance_amount numeric(12,2) default 0;
alter table public.profiles add column if not exists allowance_basis allowance_basis default 'none';
alter table public.profiles add column if not exists allowance_weeks_n integer;

comment on column public.profiles.allowance_weeks_n is 'When allowance_basis is every_n_weeks: pay allowance every N weeks (e.g. 2 or 3).';
