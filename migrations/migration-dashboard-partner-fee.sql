ALTER TABLE dashboard_bookings
  ADD COLUMN gross_amount INTEGER NOT NULL DEFAULT 0 CHECK (gross_amount >= 0);

INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at) VALUES
  ('income-partner-fee', 'income', 'Fee Mitra', datetime('now'));
