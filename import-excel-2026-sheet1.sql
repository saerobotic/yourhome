UPDATE dashboard_bookings SET property_id = COALESCE(NULLIF(TRIM((SELECT dashboard_id FROM properties WHERE property_code = dashboard_bookings.property_code)), ''), (SELECT id FROM properties WHERE property_code = dashboard_bookings.property_code), 'BELUM-' || property_code), property_name = COALESCE((SELECT name FROM properties WHERE property_code = dashboard_bookings.property_code), 'Properti ' || property_code || ' - kode perlu diperiksa'), note = CASE WHEN (SELECT COUNT(*) FROM properties WHERE property_code = dashboard_bookings.property_code) = 0 AND note NOT LIKE '%KODE PERLU DIPERIKSA%' THEN note || ' - KODE PERLU DIPERIKSA' ELSE note END WHERE created_by = 'import-excel-2026';
INSERT OR IGNORE INTO finance_entries (id, kind, category_id, category_name, property_id, property_name, entry_date, amount, description, payee, recurrence, created_by, created_at)
SELECT b.income_entry_id, 'income', 'income-booking', 'Booking', b.property_id, b.property_name, b.checkin, b.amount, 'Booking ' || b.id || ' - ' || b.guest, b.platform, 'once', b.created_by, b.created_at
FROM dashboard_bookings b WHERE b.created_by = 'import-excel-2026';
SELECT COUNT(*) AS jumlah_booking, COALESCE(SUM(amount), 0) AS nilai_booking FROM dashboard_bookings WHERE created_by = 'import-excel-2026';
SELECT COUNT(*) AS jumlah_pemasukan, COALESCE(SUM(amount), 0) AS nilai_pemasukan FROM finance_entries WHERE created_by = 'import-excel-2026';
SELECT substr(checkin, 1, 7) AS bulan, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE created_by = 'import-excel-2026' GROUP BY bulan ORDER BY bulan;
SELECT property_code AS kode_perlu_diperiksa, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE created_by = 'import-excel-2026' AND property_id LIKE 'BELUM-%' GROUP BY property_code;
SELECT 'VAL-01' AS kode, (SELECT COUNT(*) FROM properties p WHERE p.property_code = 'VAL-01') AS ada_properti;
SELECT 'VAL-02' AS kode, (SELECT COUNT(*) FROM properties p WHERE p.property_code = 'VAL-02') AS ada_properti;
SELECT 'VX4' AS kode, (SELECT COUNT(*) FROM properties p WHERE p.property_code = 'VX4') AS ada_properti;
