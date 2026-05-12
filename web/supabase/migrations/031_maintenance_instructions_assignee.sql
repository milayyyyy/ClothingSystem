-- Optional task instructions and assigned employee for scheduled maintenance.

alter table public.maintenance_schedules
  add column if not exists instructions text,
  add column if not exists assigned_employee_id uuid references public.profiles(id) on delete set null;

comment on column public.maintenance_schedules.instructions is 'Steps or checklist for the person performing this maintenance.';
comment on column public.maintenance_schedules.assigned_employee_id is 'Employee responsible for this maintenance (profile).';

create index if not exists maintenance_schedules_assigned_employee_id_idx
  on public.maintenance_schedules (assigned_employee_id)
  where assigned_employee_id is not null;
