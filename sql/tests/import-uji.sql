-- ============================================================
-- IMPORT BOOKING DARI EXCEL - 2024
-- Dibuat otomatis oleh tools/siapkan-import-excel.py
-- Jalankan di D1 Console, database: your-home-checkin
--
-- 4 booking | total Rp 2.171.758
-- Tanggal pemasukan = tanggal check-in.
-- Penanda data: created_by = 'import-excel-2024' (aman dijalankan ulang).
-- ============================================================

-- 1) Booking - satu INSERT per baris (D1 membatasi jumlah cabang UNION ALL)
INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at) VALUES ('BKE20240101-0001', 'SUD-07', '', 'SUD-07', 'Dwicky Zen', 'Airbnb', 'Checked-out', '2024-01-01', '2024-01-02', 1, 393447, 0, 0, 0, 0, 'Import Excel 2024', '', 0, 'booking-income-BKE20240101-0001', 'import-excel-2024', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at) VALUES ('BKE20240102-0002', 'SUD-07', '', 'SUD-07', 'Irkham Trisandi', 'Airbnb', 'Checked-out', '2024-01-02', '2024-01-03', 1, 345112, 0, 0, 0, 0, 'Import Excel 2024', '', 0, 'booking-income-BKE20240102-0002', 'import-excel-2024', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at) VALUES ('BKE20240104-0003', 'SUD-07', '', 'SUD-07', 'Ricky Chandra', 'Airbnb', 'Checked-out', '2024-01-04', '2024-01-06', 2, 933199, 0, 0, 0, 0, 'Import Excel 2024', '', 0, 'booking-income-BKE20240104-0003', 'import-excel-2024', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at) VALUES ('BKE20240201-0004', 'GH-TBS', '', 'GH-TBS', 'Tamu Kode Aneh', 'Agoda', 'Checked-out', '2024-02-01', '2024-02-03', 2, 500000, 0, 0, 0, 0, 'Import Excel 2024', '', 0, 'booking-income-BKE20240201-0004', 'import-excel-2024', datetime('now'), datetime('now'));

-- 2) Tautkan ke properti. Kode yang tidak ada di katalog ditandai BELUM-<kode>.
UPDATE dashboard_bookings SET property_id = COALESCE(NULLIF(TRIM((SELECT dashboard_id FROM properties WHERE property_code = dashboard_bookings.property_code)), ''), (SELECT id FROM properties WHERE property_code = dashboard_bookings.property_code), 'BELUM-' || property_code), property_name = COALESCE((SELECT name FROM properties WHERE property_code = dashboard_bookings.property_code), 'Properti ' || property_code || ' - kode perlu diperiksa'), note = CASE WHEN (SELECT COUNT(*) FROM properties WHERE property_code = dashboard_bookings.property_code) = 0 AND note NOT LIKE '%KODE PERLU DIPERIKSA%' THEN note || ' - KODE PERLU DIPERIKSA' ELSE note END WHERE created_by = 'import-excel-2024';

-- 2) Pemasukan Booking untuk setiap booking di atas
INSERT OR IGNORE INTO finance_entries (id, kind, category_id, category_name, property_id, property_name, entry_date, amount, description, payee, recurrence, created_by, created_at)
SELECT b.income_entry_id, 'income', 'income-booking', 'Booking', b.property_id, b.property_name, b.checkin, b.amount, 'Booking ' || b.id || ' - ' || b.guest, b.platform, 'once', b.created_by, b.created_at
FROM dashboard_bookings b WHERE b.created_by = 'import-excel-2024';

-- 4) PEMERIKSAAN - jalankan terpisah, D1 hanya menampilkan hasil query pertama
SELECT COUNT(*) AS jumlah_booking, COALESCE(SUM(amount), 0) AS nilai_booking FROM dashboard_bookings WHERE created_by = 'import-excel-2024';

SELECT COUNT(*) AS jumlah_pemasukan, COALESCE(SUM(amount), 0) AS nilai_pemasukan FROM finance_entries WHERE created_by = 'import-excel-2024';

SELECT substr(checkin, 1, 7) AS bulan, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE created_by = 'import-excel-2024' GROUP BY bulan ORDER BY bulan;

-- Booking yang kodenya TIDAK ketemu di katalog.
-- Muncul di Dashboard sebagai booking belum terhubung - perbaiki kodenya di sana.
SELECT property_code AS kode_perlu_diperiksa, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE created_by = 'import-excel-2024' AND property_id LIKE 'BELUM-%' GROUP BY property_code;

-- Kode properti yang dipakai: ada_properti harus lebih dari 0
SELECT 'GH-TBS' AS kode, (SELECT COUNT(*) FROM properties p WHERE p.property_code = 'GH-TBS') AS ada_properti;
SELECT 'SUD-07' AS kode, (SELECT COUNT(*) FROM properties p WHERE p.property_code = 'SUD-07') AS ada_properti;
