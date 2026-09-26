ALTER TABLE dashboard_bookings
  ADD COLUMN extra_bed_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (extra_bed_quantity >= 0);

ALTER TABLE dashboard_bookings
  ADD COLUMN extra_bed_price INTEGER NOT NULL DEFAULT 0
    CHECK (extra_bed_price >= 0);