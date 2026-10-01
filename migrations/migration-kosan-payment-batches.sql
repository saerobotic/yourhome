CREATE TABLE IF NOT EXISTS kosan_payment_batches (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES kosan_rooms(id),
  start_period TEXT NOT NULL,
  months_paid INTEGER NOT NULL CHECK (months_paid BETWEEN 1 AND 12),
  received_date TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);