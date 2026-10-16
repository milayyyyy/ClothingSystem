-- Existing services orders used the table default (teams). They still open in
-- services layout in the UI; persist that so the new sheet-format toggle is accurate.
-- `kind` is enum order_kind — do not coalesce it to '' (invalid enum value).
update public.orders
set teams_sheet_format = 'services'
where teams_sheet_format = 'teams'
  and (
    kind = 'services'::public.order_kind
    or lower(trim(coalesce(order_type, ''))) = 'services'
  );
