SELECT id, guest, property_code, checkin, amount, created_by, created_at FROM dashboard_bookings WHERE checkin = '2026-07-25' AND amount IN (1750000, 2543027, 2659375) ORDER BY guest, created_at, id;
