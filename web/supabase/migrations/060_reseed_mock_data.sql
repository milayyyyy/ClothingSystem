-- ============================================================
-- 060_reseed_mock_data.sql
-- Clears all mock/test data and seeds fresh orders + attendance
-- Run manually in Supabase SQL editor when needed.
-- ============================================================

-- ── 1. Clear existing data ───────────────────────────────────
DELETE FROM public.sublimation_team_players;
DELETE FROM public.sublimation_teams;
DELETE FROM public.orders;
DELETE FROM public.attendance;
DELETE FROM public.salaries;
DELETE FROM public.expenses WHERE description ILIKE '%mock%' OR description ILIKE '%demo%' OR description ILIKE '%sample%';

-- Reset order_no sequence so it starts clean
ALTER SEQUENCE IF EXISTS public.orders_order_no_seq RESTART WITH 1;

-- ── 2. Fresh mock orders ─────────────────────────────────────
-- Walk-in & Online (kind = local / online)
INSERT INTO public.orders
  (customer_name, customer_phone, kind, order_type, stage, status, notes, total, down_payment, due_date, created_at, updated_at)
VALUES
  ('Juan dela Cruz',   '09171234001', 'local',  'walkin',     'for_payment',  'pending',   'Full sublimation jersey set for Barangay Uno FC', 2800, 1500, CURRENT_DATE + 7,  NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),
  ('Maria Santos',     '09181234002', 'local',  'walkin',     'completed',    'delivered', 'Custom polo shirts x10, logo on left chest',       3200, 3200, CURRENT_DATE - 2,  NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days'),
  ('Pedro Reyes',      '09191234003', 'local',  'walkin',     'printing',     'pending',   'Dry-fit jersey 12 pcs green & white',              1560, 800,  CURRENT_DATE + 5,  NOW() - INTERVAL '8 days',  NOW() - INTERVAL '8 days'),
  ('Ana Gonzales',     '09171234004', 'local',  'walkin',     'completed',    'delivered', '5 customized tumblers with name print',            750,  750,  CURRENT_DATE - 4,  NOW() - INTERVAL '15 days', NOW() - INTERVAL '4 days'),
  ('Ricardo Villanueva','09181234005','local',  'walkin',     'for_payment',  'pending',   'Basketball jersey set 15 pcs, DLSU colorway',      4500, 2000, CURRENT_DATE + 10, NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days'),
  ('Lorna Bautista',   '09191234006', 'local',  'walkin',     'completed',    'delivered', 'Event shirt with back print, 30 pcs',              4200, 4200, CURRENT_DATE - 1,  NOW() - INTERVAL '20 days', NOW() - INTERVAL '1 day'),
  ('Carlo Mendoza',    '09171234007', 'online', 'online',     'completed',    'delivered', 'Online order - volleyball jersey set',             2200, 2200, CURRENT_DATE - 3,  NOW() - INTERVAL '14 days', NOW() - INTERVAL '3 days'),
  ('Grace Florendo',   '09181234008', 'online', 'online',     'qc_packaging', 'pending',   'Custom hoodie x3 white minimalist design',         1650, 825,  CURRENT_DATE + 4,  NOW() - INTERVAL '6 days',  NOW() - INTERVAL '6 days'),
  ('Kevin Macaraeg',   '09191234009', 'online', 'online',     'printing',     'pending',   'Football jersey 20 pcs red and yellow',            3400, 1700, CURRENT_DATE + 8,  NOW() - INTERVAL '4 days',  NOW() - INTERVAL '4 days'),
  ('Mylene Ocampo',    '09171234010', 'local',  'walkin',     'completed',    'delivered', 'Personalized jersey - name and number only',       480,  480,  CURRENT_DATE - 6,  NOW() - INTERVAL '18 days', NOW() - INTERVAL '6 days');

-- Services orders
INSERT INTO public.orders
  (customer_name, customer_phone, kind, order_type, stage, status, notes, total, down_payment, due_date, created_at, updated_at)
VALUES
  ('Barangay Masaya Sports',   '09181235001', 'services', 'services', 'completed', 'delivered', 'Jersey repair & numbering for 20 pcs', 1200, 1200, CURRENT_DATE - 5,  NOW() - INTERVAL '22 days', NOW() - INTERVAL '5 days'),
  ('FitLife Gym Inc.',         '09191235002', 'services', 'services', 'in_progress','pending',  'Embroidery of gym logo on 50 polo shirts', 3500, 1750, CURRENT_DATE + 6, NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days'),
  ('Sunshine Elementary PTA',  '09171235003', 'services', 'services', 'completed', 'delivered', 'School event shirt printing 100 pcs',  8000, 8000, CURRENT_DATE - 8,  NOW() - INTERVAL '25 days', NOW() - INTERVAL '8 days'),
  ('Metro Basketball League',  '09181235004', 'services', 'services', 'for_payment','pending',  'League jersey numbering 48 jerseys',   2400, 0,    CURRENT_DATE + 3,  NOW() - INTERVAL '2 days',  NOW() - INTERVAL '2 days'),
  ('Pinoy Runners Club',       '09191235005', 'services', 'services', 'completed', 'delivered', 'Race bib printing and lace tag x200',  4000, 4000, CURRENT_DATE - 3,  NOW() - INTERVAL '12 days', NOW() - INTERVAL '3 days');

-- Sublimation orders
INSERT INTO public.orders
  (customer_name, customer_phone, kind, order_type, stage, status, notes, total, down_payment, due_date, created_at, updated_at)
VALUES
  ('Team Thunderbolts',    '09171236001', 'sublimation', 'sublimation', 'completed',    'delivered', 'Full sublimation football jersey 22 pcs, blue/gold',            6600, 6600, CURRENT_DATE - 4,  NOW() - INTERVAL '30 days', NOW() - INTERVAL '4 days'),
  ('Red Warriors FC',      '09181236002', 'sublimation', 'sublimation', 'for_payment',  'pending',   'Sublimation basketball set home & away 15 pcs each',           9000, 4500, CURRENT_DATE + 12, NOW() - INTERVAL '7 days',  NOW() - INTERVAL '7 days'),
  ('Eagles Volleyball Club','09191236003', 'sublimation', 'sublimation', 'design_layout','pending',  'Sublimation volleyball jersey 14 pcs, black & red',             4200, 2100, CURRENT_DATE + 9,  NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days'),
  ('City Champions Team',  '09171236004', 'sublimation', 'sublimation', 'completed',    'delivered', 'Sublimation cycling kit jersey + shorts 10 sets',               8500, 8500, CURRENT_DATE - 7,  NOW() - INTERVAL '35 days', NOW() - INTERVAL '7 days'),
  ('United Futsal Team',   '09181236005', 'sublimation', 'sublimation', 'printing',     'pending',   'Sublimation futsal jersey 16 pcs lime green/black',             4800, 2400, CURRENT_DATE + 6,  NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days'),
  ('Davao Ballers',        '09191236006', 'sublimation', 'sublimation', 'completed',    'delivered', 'Full sublimation jersey + shorts 18 pcs, maroon/white',         7200, 7200, CURRENT_DATE - 2,  NOW() - INTERVAL '28 days', NOW() - INTERVAL '2 days');

-- BigSeller (online, source = bigseller)
INSERT INTO public.orders
  (customer_name, customer_phone, kind, order_type, source, stage, status,
   external_order_no, waybill_no, sku_code, total, down_payment, notes, created_at, updated_at)
VALUES
  ('BS-Buyer Aling Nena',   NULL, 'online', 'online', 'BigSeller - Shopee',   'completed', 'delivered', '2405-SHP-000101', 'JT00SHPAA001', 'BSZG0B010001', 332.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '10 days', NOW() - INTERVAL '3 days'),
  ('BS-Buyer Kuya Jun',     NULL, 'online', 'online', 'BigSeller - Shopee',   'completed', 'delivered', '2405-SHP-000102', 'JT00SHPAA002', 'BSZG0B010002', 332.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '10 days', NOW() - INTERVAL '3 days'),
  ('BS-Buyer Ate Claire',   NULL, 'online', 'online', 'BigSeller - TikTok',   'completed', 'delivered', '2405-TTK-000201', 'JT00TTKBB001', 'BSZG0B010003', 182.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '2 days'),
  ('BS-Buyer Mang Tony',    NULL, 'online', 'online', 'BigSeller - TikTok',   'completed', 'delivered', '2405-TTK-000202', 'JT00TTKBB002', 'BSZG0B010004', 299.40, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '8 days',  NOW() - INTERVAL '2 days'),
  ('BS-Buyer Inday Rose',   NULL, 'online', 'online', 'BigSeller - Shopee',   'design_layout', 'pending','2405-SHP-000103', 'JT00SHPAA003', 'BSZG0B010005', 332.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days'),
  ('BS-Buyer Manong Fred',  NULL, 'online', 'online', 'BigSeller - Shopee',   'design_layout', 'pending','2405-SHP-000104', 'JT00SHPAA004', 'BSZG0B010006', 332.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '5 days',  NOW() - INTERVAL '5 days'),
  ('BS-Buyer Lena Cruz',    NULL, 'online', 'online', 'BigSeller - Lazada',   'qc_packaging',  'pending','2405-LZD-000301', 'JT00LZDCC001', 'BSZG0B010007', 415.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days'),
  ('BS-Buyer Dodong Ramos', NULL, 'online', 'online', 'BigSeller - Lazada',   'qc_packaging',  'pending','2405-LZD-000302', 'JT00LZDCC002', 'BSZG0B010008', 415.00, 0, 'Imported from BigSeller PDF', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days');

-- ── 3. Fresh mock attendance ──────────────────────────────────
-- Generate attendance records for the past 14 working days
-- for every non-admin profile in the system.
DO $$
DECLARE
  emp RECORD;
  d   DATE;
  day_offset INT;
  t_in  TIMESTAMPTZ;
  t_out TIMESTAMPTZ;
  -- Randomise minutes slightly per employee+day
  in_min  INT;
  out_min INT;
BEGIN
  FOR emp IN
    SELECT id FROM public.profiles WHERE role IN ('employee', 'sub_admin')
  LOOP
    FOR day_offset IN 0..13 LOOP
      d := CURRENT_DATE - day_offset;
      -- Skip weekends (0=Sun, 6=Sat)
      IF EXTRACT(DOW FROM d) IN (0, 6) THEN CONTINUE; END IF;

      -- Small random minute variation (0–15 mins late, 0–10 early leave)
      in_min  := (RANDOM() * 15)::INT;
      out_min := (RANDOM() * 10)::INT;

      t_in  := (d + TIME '08:00') + (in_min  || ' minutes')::INTERVAL;
      t_out := (d + TIME '17:00') - (out_min || ' minutes')::INTERVAL;

      INSERT INTO public.attendance (user_id, time_in, time_out, created_at)
      VALUES (emp.id, t_in, t_out, t_in)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
