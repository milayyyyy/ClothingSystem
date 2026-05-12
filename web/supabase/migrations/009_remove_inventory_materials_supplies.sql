-- Remove legacy materials and supplies inventory rows.
delete from public.inventory
where lower(trim(coalesce(category, ''))) in ('materials', 'supplies');
