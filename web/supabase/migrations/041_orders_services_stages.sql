-- Local/online orders: replace legacy `stage` values with Services pipeline keys.

update public.orders
   set stage = 'design_layout'
 where coalesce(stage, '') in ('', 'preparing')
   and kind in ('local', 'online');

update public.orders
   set stage = 'qc_packaging'
 where stage = 'packing_qc'
   and kind in ('local', 'online');

update public.orders
   set stage = 'completed'
 where stage in ('shipped', 'complete')
   and kind in ('local', 'online');

update public.orders
   set stage = 'design_layout'
 where stage is null
   and kind in ('local', 'online');
