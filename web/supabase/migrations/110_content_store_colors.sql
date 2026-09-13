-- Migration 110: Color belongs to content stores, not types.
-- Calendar chips use store.color so each brand is visually distinct.

alter table public.content_stores
  add column if not exists color text not null default '#64748B';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_stores_color_hex'
  ) then
    alter table public.content_stores
      add constraint content_stores_color_hex check (color ~* '^#[0-9a-f]{6}$');
  end if;
end $$;

update public.content_stores as s
set color = v.color
from (values
  ('Likha. Apparel',   '#8B5CF6'),
  ('Mensahe. Apparel', '#3B82F6'),
  ('Padayon. Apparel', '#F59E0B'),
  ('Drips. Apparel',   '#10B981')
) as v(name, color)
where lower(trim(s.name)) = lower(v.name)
  and s.color = '#64748B';

comment on column public.content_stores.color is
  'Hex color shown on Content Planner calendar chips for this store.';
