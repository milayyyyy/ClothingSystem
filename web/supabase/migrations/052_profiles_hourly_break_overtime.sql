-- Hourly-only pay settings: unpaid break per day (minutes), overtime rate (₱/hr beyond 9 paid hours/day).

alter table public.profiles add column if not exists break_minutes integer not null default 0;
alter table public.profiles add column if not exists overtime_hourly_rate numeric(12,2) not null default 0;

comment on column public.profiles.break_minutes is 'Hourly: unpaid break minutes subtracted once per calendar day from total clocked hours that day; remaining hours are paid time before OT split.';
comment on column public.profiles.overtime_hourly_rate is 'Hourly: pesos per hour for paid hours beyond 9 per day. If 0, overtime hours bill at regular salary_rate.';
