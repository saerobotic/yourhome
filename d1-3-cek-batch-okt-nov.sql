SELECT created_by, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai FROM dashboard_bookings WHERE checkin >= '2026-10-01' AND checkin < '2026-12-01' GROUP BY created_by ORDER BY created_by;
