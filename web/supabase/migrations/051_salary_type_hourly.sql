-- Hourly pay frequency (profiles.salary_type); used with attendance time_in/time_out.

do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'hourly' and enumtypid = 'salary_type'::regtype) then
    alter type public.salary_type add value 'hourly';
  end if;
end $$;
