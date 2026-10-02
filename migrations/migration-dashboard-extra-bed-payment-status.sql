ALTER TABLE dashboard_bookings
  ADD COLUMN extra_bed_payment_status TEXT NOT NULL DEFAULT 'paid';
