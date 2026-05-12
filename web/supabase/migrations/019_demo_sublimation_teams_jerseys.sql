-- =========================================================================
-- Migration 019: rich mock teams & jersey lines for demo sublimation order
-- Replaces any prior demo roster for that order once (idempotent marker team).
-- Depends: 011 (demo order), 015 (tables), 017 (jersey_checklist), 018 (design_image_urls).
-- =========================================================================

do $$
declare
  oid uuid;
  tid1 uuid;
  tid2 uuid;
begin
  select o.id into oid
  from public.orders o
  where o.customer_name = 'Demo — Juana dela Cruz'
    and (o.kind = 'sublimation'::order_kind or lower(coalesce(o.order_type, '')) like 'sublim%')
  limit 1;

  if oid is null then
    return;
  end if;

  if exists (
    select 1 from public.sublimation_teams t
    where t.order_id = oid and t.name = 'Demo — Northside Varsity'
  ) then
    return;
  end if;

  delete from public.sublimation_teams where order_id = oid;

  insert into public.sublimation_teams (order_id, name, sort_order, design_image_urls)
  values (
    oid,
    'Demo — Northside Varsity',
    0,
    array[
      'https://placehold.co/96x96/png?text=Front',
      'https://placehold.co/96x96/png?text=Back'
    ]::text[]
  )
  returning id into tid1;

  insert into public.sublimation_team_players (
    team_id, surname, jersey_number, jersey_types, jersey_checklist,
    design_approved, design_image_url, sort_order
  ) values
    (
      tid1,
      'Reyes',
      '7',
      array[]::text[],
      '[{"id":"seed-ns-1a","name":"Game jersey","size":"L","checked":true},{"id":"seed-ns-1b","name":"Shorts","size":"L","checked":true},{"id":"seed-ns-1c","name":"Warm-up jacket","size":"","checked":false}]'::jsonb,
      false,
      null,
      0
    ),
    (
      tid1,
      'Torres',
      '23',
      array[]::text[],
      '[{"id":"seed-ns-2a","name":"Game jersey","size":"XL","checked":true},{"id":"seed-ns-2b","name":"Compression sleeve","size":"M","checked":false}]'::jsonb,
      false,
      null,
      1
    ),
    (
      tid1,
      'Ng',
      '11',
      array[]::text[],
      '[{"id":"seed-ns-3a","name":"Game jersey","size":"M","checked":true},{"id":"seed-ns-3b","name":"Practice tee","size":"M","checked":true}]'::jsonb,
      false,
      null,
      2
    );

  insert into public.sublimation_teams (order_id, name, sort_order, design_image_urls)
  values (
    oid,
    'Demo — Eastside Juniors',
    1,
    array['https://placehold.co/96x96/png?text=Logo+ref']::text[]
  )
  returning id into tid2;

  insert into public.sublimation_team_players (
    team_id, surname, jersey_number, jersey_types, jersey_checklist,
    design_approved, design_image_url, sort_order
  ) values
    (
      tid2,
      'Santos',
      '4',
      array[]::text[],
      '[{"id":"seed-ej-1a","name":"Youth jersey set","size":"YS","checked":true},{"id":"seed-ej-1b","name":"Socks","size":"","checked":false}]'::jsonb,
      false,
      null,
      0
    ),
    (
      tid2,
      'Lim',
      '15',
      array[]::text[],
      '[{"id":"seed-ej-2a","name":"Youth jersey set","size":"YM","checked":true}]'::jsonb,
      false,
      null,
      1
    );
end $$;
