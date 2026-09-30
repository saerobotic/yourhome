SELECT id, guest, property_code, checkin, amount, created_by FROM dashboard_bookings WHERE id IN ('BKE20260725-0001', 'BKE20260725-0002', 'BKE20260725-0003') ORDER BY id;
SELECT COUNT(*) AS jumlah_dobel, COALESCE(SUM(amount), 0) AS nilai_dobel FROM dashboard_bookings WHERE id IN ('BKE20260725-0001', 'BKE20260725-0002', 'BKE20260725-0003');
DELETE FROM finance_entries WHERE id IN ('booking-income-BKE20260725-0001', 'booking-income-BKE20260725-0002', 'booking-income-BKE20260725-0003');
DELETE FROM dashboard_bookings WHERE id IN ('BKE20260725-0001', 'BKE20260725-0002', 'BKE20260725-0003');
SELECT substr(checkin, 1, 7) AS bulan, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE checkin >= '2026-01-01' AND checkin < '2027-01-01' GROUP BY bulan ORDER BY bulan;
SELECT COUNT(*) AS total_transaksi, COALESCE(SUM(amount), 0) AS total_omset FROM dashboard_bookings WHERE checkin >= '2026-01-01' AND checkin < '2027-01-01';
SELECT COUNT(*) AS jumlah_pemasukan, COALESCE(SUM(amount), 0) AS nilai_pemasukan FROM finance_entries WHERE kind = 'income' AND category_id = 'income-booking' AND entry_date >= '2026-01-01' AND entry_date < '2027-01-01';
