SELECT substr(checkin, 1, 7) AS bulan, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS omzet FROM dashboard_bookings WHERE checkin >= '2026-09-01' AND checkin < '2026-10-01' GROUP BY bulan;
