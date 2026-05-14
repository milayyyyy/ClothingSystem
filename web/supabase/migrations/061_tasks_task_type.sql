-- Migration 061: add task_type column to tasks
-- Options: maintenance, cleaning, stocking, editing, others

alter table public.tasks
  add column if not exists task_type text
    check (task_type in ('maintenance','cleaning','stocking','editing','others'));
