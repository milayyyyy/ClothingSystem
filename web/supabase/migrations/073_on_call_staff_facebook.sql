alter table public.on_call_staff
  add column if not exists facebook_account text;

comment on column public.on_call_staff.facebook_account is
  'Facebook profile URL or username for this on-call contact.';
