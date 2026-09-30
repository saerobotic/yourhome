DELETE FROM dashboard_bookings WHERE checkin >= '2026-01-01' AND checkin < '2027-01-01' AND created_by NOT LIKE 'import-excel%';
