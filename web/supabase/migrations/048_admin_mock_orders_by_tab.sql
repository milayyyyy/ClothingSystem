-- Idempotent mock orders for admin tabs: 10 Walk In & Online, 10 Services, 10 Sublimation.
-- Each row is keyed by a unique `notes` marker so re-running this migration does not duplicate.

do $$
declare
  i int;
  note text;
  stages text[] := array['design_layout', 'printing', 'qc_packaging', 'for_pickup', 'completed'];
  subs text[] := array[
    'design_layout',
    'printing',
    'heatpress',
    'cut_sew',
    'reprint_error',
    'quality_control',
    'for_pickup'
  ];
  stg text;
  lk public.order_kind;
  ot text;
  src text;
  sub public.sublimation_stage;
  stage_for_sub text;
  stat public.order_status;
begin
  -- Walk In & Online (local + online; online rows avoid BigSeller heuristics in the UI)
  for i in 1..10 loop
    note := 'seed:admin-mock-wio-' || lpad(i::text, 2, '0');
    if exists (select 1 from public.orders o where o.notes = note) then
      continue;
    end if;
    if i % 2 = 1 then
      lk := 'local';
      ot := 'local';
      src := 'Walk-in counter';
    else
      lk := 'online';
      ot := 'online';
      src := case (i % 3)
        when 0 then 'Shopee'
        when 1 then 'TikTok Shop'
        else 'Instagram DM'
      end;
    end if;
    stg := stages[1 + ((i - 1) % 5)];
    stat := (array['pending', 'printing', 'sewing', 'ready']::public.order_status[])[1 + ((i - 1) % 4)];
    insert into public.orders (
      customer_name,
      customer_phone,
      order_type,
      kind,
      source,
      quantity,
      unit_price,
      down_payment,
      status,
      notes,
      stage,
      sub_stage,
      due_date,
      design_ref
    )
    values (
      'Mock WIO Customer ' || i,
      '+6391700' || lpad(i::text, 4, '0'),
      ot,
      lk,
      src,
      1 + (i % 8),
      (350 + i * 25)::numeric(12, 2),
      (100 + i * 10)::numeric(12, 2),
      stat,
      note,
      stg,
      null,
      current_date + (i * 2),
      case
        when lk = 'local'::public.order_kind then 'Embroidery / names — mock seed'
        else 'Marketplace bundle — mock seed'
      end
    );
  end loop;

  -- Services (embroidery, DTF, vinyl, etc.)
  for i in 1..10 loop
    note := 'seed:admin-mock-svc-' || lpad(i::text, 2, '0');
    if exists (select 1 from public.orders o where o.notes = note) then
      continue;
    end if;
    stg := stages[1 + ((i - 1) % 5)];
    stat := (array['pending', 'printing', 'ready', 'delivered']::public.order_status[])[1 + ((i - 1) % 4)];
    insert into public.orders (
      customer_name,
      customer_phone,
      order_type,
      kind,
      source,
      quantity,
      unit_price,
      down_payment,
      status,
      notes,
      stage,
      sub_stage,
      due_date,
      design_ref
    )
    values (
      'Mock Services Customer ' || i,
      '+6391800' || lpad(i::text, 4, '0'),
      'services',
      'services',
      'In-shop service',
      1 + (i % 12),
      (180 + i * 15)::numeric(12, 2),
      (50 + i * 5)::numeric(12, 2),
      stat,
      note,
      stg,
      null,
      current_date + i + 3,
      case (i % 4)
        when 0 then 'Left chest — 3-color embroidery'
        when 1 then 'DTF gang sheet — A3'
        when 2 then 'Heat-press vinyl numbering set'
        else 'Cap panel — small logo'
      end
    );
  end loop;

  -- Sublimation (full pipeline; `sub_stage` drives the Sublimation tab filters)
  for i in 1..10 loop
    note := 'seed:admin-mock-sub-' || lpad(i::text, 2, '0');
    if exists (select 1 from public.orders o where o.notes = note) then
      continue;
    end if;
    sub := (subs[1 + ((i - 1) % 7)])::public.sublimation_stage;
    stage_for_sub := case sub::text
      when 'quality_control' then 'qc_packaging'
      when 'for_pickup' then 'for_pickup'
      when 'printing' then 'printing'
      when 'heatpress' then 'printing'
      when 'cut_sew' then 'printing'
      when 'reprint_error' then 'printing'
      else 'design_layout'
    end;
    stat := (array['pending', 'printing', 'sewing', 'ready']::public.order_status[])[1 + ((i - 1) % 4)];
    insert into public.orders (
      customer_name,
      customer_phone,
      order_type,
      kind,
      source,
      quantity,
      unit_price,
      down_payment,
      status,
      notes,
      stage,
      sub_stage,
      due_date,
      design_ref
    )
    values (
      'Mock Sublimation Team ' || i,
      '+6391900' || lpad(i::text, 4, '0'),
      'sublimation',
      'sublimation',
      'League / team order',
      6 + (i % 10),
      (420 + i * 30)::numeric(12, 2),
      (200 + i * 20)::numeric(12, 2),
      stat,
      note,
      stage_for_sub,
      sub,
      current_date + i + 7,
      'Full sub jersey set — mock seed #' || i::text
    );
  end loop;
end $$;
