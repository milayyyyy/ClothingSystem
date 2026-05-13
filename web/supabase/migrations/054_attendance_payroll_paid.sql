-- Mark attendance rows settled in payroll so new clock-ins stay "unpaid" until next pay.

alter table public.attendance
  add column if not exists payroll_paid boolean not null default false;

create index if not exists attendance_user_payroll_paid_idx
  on public.attendance (user_id, payroll_paid)
  where payroll_paid = false;

comment on column public.attendance.payroll_paid is 'When true, this shift was included in a payroll payout; salary preview ignores it so new hours accrue as unpaid.';
