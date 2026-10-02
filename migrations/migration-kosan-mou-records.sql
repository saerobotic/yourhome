CREATE TABLE IF NOT EXISTS kosan_mou_records (
  id TEXT PRIMARY KEY,
  mou_number TEXT NOT NULL,
  agreement_date TEXT NOT NULL,
  building TEXT NOT NULL,
  room_number TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  deposit INTEGER NOT NULL CHECK (deposit >= 0),
  data_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kosan_mou_records_updated_at
  ON kosan_mou_records(updated_at DESC);
