SELECT COUNT(*) AS total_transaksi_2026, COALESCE(SUM(amount), 0) AS total_omset_2026 FROM dashboard_bookings WHERE checkin >= '2026-01-01' AND checkin < '2027-01-01';
