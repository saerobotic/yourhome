CREATE TABLE IF NOT EXISTS dashboard_bookings (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  property_code TEXT NOT NULL DEFAULT '',
  guest TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Inquiry', 'Confirmed', 'Checked-in', 'Checked-out', 'Cancelled')),
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  nights INTEGER NOT NULL CHECK (nights > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  cleaning_fee INTEGER NOT NULL DEFAULT 0 CHECK (cleaning_fee >= 0),
  platform_fee_pct INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_pct BETWEEN 0 AND 50),
  note TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT NOT NULL DEFAULT '',
  refund_amount INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  income_entry_id TEXT NOT NULL,
  refund_entry_id TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_bookings_checkin
  ON dashboard_bookings(checkin, status);

INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at) VALUES
  ('income-booking', 'income', 'Booking', datetime('now')),
  ('expense-booking-refund', 'expense', 'Refund Booking', datetime('now'));