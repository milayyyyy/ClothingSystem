-- Weekday mock attendance for every profile with role employee (current calendar month, not future days).
-- Idempotent per user per day: skips if a row already exists with notes like 'Mock seed: employee attendance%'.

do $$
declare
  r record;
  day_date date;
  month_start date := date_trunc('month', current_date)::date;
  month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  cap date := least(month_end, current_date);
  dow int;
begin
  for r in select p.id from public.profiles p where p.role::text = 'employee'
  loop
    day_date := month_start;
    while day_date <= cap loop
      dow := extract(dow from day_date)::int;
      if dow not in (0, 6) then
        if not exists (
          select 1
          from public.attendance a
          where a.user_id = r.id
            and (a.time_in::date) = day_date
            and a.notes like 'Mock seed: employee attendance%'
        ) then
          insert into public.attendance (user_id, time_in, time_out, notes)
          values (
            r.id,
            (day_date::timestamp + interval '8 hours')::timestamptz,
            (day_date::timestamp + interval '17 hours')::timestamptz,
            'Mock seed: employee attendance'
          );
        end if;
      end if;
      day_date := day_date + 1;
    end loop;
  end loop;
end $$;
