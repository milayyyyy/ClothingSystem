-- Allow salary payouts for on-call staff (no login profile) and optional profile link.

alter table public.salaries
  alter column user_id drop not null;

alter table public.salaries
  add column if not exists on_call_staff_id uuid references public.on_call_staff(id) on delete cascade;

create index if not exists salaries_on_call_staff_id_idx on public.salaries (on_call_staff_id);

alter table public.salaries
  drop constraint if exists salaries_payee_one_of;

alter table public.salaries
  add constraint salaries_payee_one_of check (
    not (user_id is not null and on_call_staff_id is not null)
  );

comment on column public.salaries.on_call_staff_id is
  'On-call worker payout when user_id is null (directory contact, no app account).';
