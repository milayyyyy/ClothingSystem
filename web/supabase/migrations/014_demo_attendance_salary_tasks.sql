-- =========================================================================
-- Migration 014: demo attendance, salary payouts, and tasks (idempotent).
-- Picks an anchor profile: first non-admin/non-sub_admin, else any profile.
-- Safe to re-run; skips when anchor user is missing or rows already exist.
-- =========================================================================

do $$
declare
  uid uuid;
  tid uuid;
  ps date;
  pe date;
begin
  select p.id into uid
  from public.profiles p
  where p.role::text not in ('admin', 'sub_admin')
  order by p.created_at
  limit 1;

  if uid is null then
    select p.id into uid from public.profiles p order by p.created_at limit 1;
  end if;

  if uid is null then
    raise notice '014_demo_attendance_salary_tasks: no profiles row; skip seed';
    return;
  end if;

  -- Attendance: a few recent shifts ----------------------------------------
  if not exists (
    select 1 from public.attendance a
    where a.user_id = uid and a.notes like 'Demo seed: attendance%'
  ) then
    insert into public.attendance (user_id, time_in, time_out, notes) values
      (uid, now() - interval '4 days' + interval '8 hours',  now() - interval '4 days' + interval '17 hours', 'Demo seed: attendance 1'),
      (uid, now() - interval '3 days' + interval '8 hours',  now() - interval '3 days' + interval '16 hours 30 minutes', 'Demo seed: attendance 2'),
      (uid, now() - interval '2 days' + interval '8 hours 30 minutes', now() - interval '2 days' + interval '17 hours', 'Demo seed: attendance 3'),
      (uid, now() - interval '1 day' + interval '8 hours', null, 'Demo seed: attendance open (no clock-out yet)');
  end if;

  -- Salaries: two biweekly-style rows for current and previous month -------
  ps := date_trunc('month', current_date::timestamp)::date;
  pe := (date_trunc('month', current_date::timestamp) + interval '13 days')::date;
  if not exists (
    select 1 from public.salaries s
    where s.user_id = uid and s.period_start = ps and s.period_end = pe
  ) then
    insert into public.salaries (
      user_id, period_start, period_end, days_worked, gross_pay, deductions, net_pay, paid, paid_at
    ) values (
      uid, ps, pe, 10, 12500.00, 500.00, 12000.00, true, now() - interval '2 days'
    );
  end if;

  ps := date_trunc('month', (current_date - interval '1 month')::timestamp)::date;
  pe := (date_trunc('month', (current_date - interval '1 month')::timestamp) + interval '13 days')::date;
  if not exists (
    select 1 from public.salaries s
    where s.user_id = uid and s.period_start = ps and s.period_end = pe
  ) then
    insert into public.salaries (
      user_id, period_start, period_end, days_worked, gross_pay, deductions, net_pay, paid, paid_at
    ) values (
      uid, ps, pe, 9, 11250.00, 450.00, 10800.00, true, now() - interval '20 days'
    );
  end if;

  -- Tasks: new demo rows + assignees ---------------------------------------
  if not exists (select 1 from public.tasks where title = 'Demo: Weekly — machine maintenance checklist') then
    insert into public.tasks (title, description, due_date, priority, status, repeat_interval_days)
    values (
      'Demo: Weekly — machine maintenance checklist',
      'Demo recurring ops task (every 7 days).',
      current_date + 1,
      'normal',
      'open',
      7
    )
    returning id into tid;
    insert into public.task_assignees (task_id, user_id) values (tid, uid);
  else
    select t.id into tid from public.tasks t where t.title = 'Demo: Weekly — machine maintenance checklist';
    if not exists (select 1 from public.task_assignees ta where ta.task_id = tid and ta.user_id = uid) then
      insert into public.task_assignees (task_id, user_id) values (tid, uid);
    end if;
  end if;

  if not exists (select 1 from public.tasks where title = 'Demo: Label — new hoodie SKU stickers') then
    insert into public.tasks (title, description, due_date, priority, status, repeat_interval_days)
    values (
      'Demo: Label — new hoodie SKU stickers',
      'Print and apply size labels to receiving cartons.',
      current_date,
      'high',
      'in_progress',
      null
    )
    returning id into tid;
    insert into public.task_assignees (task_id, user_id) values (tid, uid);
  else
    select t.id into tid from public.tasks t where t.title = 'Demo: Label — new hoodie SKU stickers';
    if not exists (select 1 from public.task_assignees ta where ta.task_id = tid and ta.user_id = uid) then
      insert into public.task_assignees (task_id, user_id) values (tid, uid);
    end if;
  end if;

  if not exists (select 1 from public.tasks where title = 'Demo: Done — safety signage posted (sample)') then
    insert into public.tasks (title, description, due_date, priority, status, repeat_interval_days, completed_at)
    values (
      'Demo: Done — safety signage posted (sample)',
      'Completed task for filters and history UI.',
      current_date - 3,
      'low',
      'done',
      null,
      now() - interval '2 days'
    )
    returning id into tid;
    insert into public.task_assignees (task_id, user_id) values (tid, uid);
  else
    select t.id into tid from public.tasks t where t.title = 'Demo: Done — safety signage posted (sample)';
    if not exists (select 1 from public.task_assignees ta where ta.task_id = tid and ta.user_id = uid) then
      insert into public.task_assignees (task_id, user_id) values (tid, uid);
    end if;
  end if;

  -- Backfill assignees for migration 011 demo tasks (employee portal) -----
  insert into public.task_assignees (task_id, user_id)
  select t.id, uid
  from public.tasks t
  where t.title in (
    'Demo: Receiving — count fabric rolls',
    'Demo: Shopee — reply to 3 inquiries'
  )
  and not exists (
    select 1 from public.task_assignees ta
    where ta.task_id = t.id and ta.user_id = uid
  );
end $$;
