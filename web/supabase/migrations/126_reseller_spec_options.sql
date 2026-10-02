-- Customizable reseller product specification option lists.
-- Stored in app_settings. Do NOT add employee to is_admin_or_sub().

insert into public.app_settings (key, value)
values ('reseller_spec_options', '{"fields":[]}')
on conflict (key) do nothing;

comment on table public.app_settings is
  'Global key-value settings. reseller_spec_options holds custom specification dropdowns.';
