CREATE TABLE IF NOT EXISTS dashboard_accounts (
  account_id TEXT PRIMARY KEY CHECK (account_id IN ('master', 'admin')),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('Master', 'Admin')),
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO dashboard_accounts (
  account_id, display_name, role, created_at, updated_at
) VALUES
  ('master', 'Andri Fernando', 'Master', datetime('now'), datetime('now')),
  ('admin', 'Admin', 'Admin', datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (kind, name)
);

INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at) VALUES
  ('expense-dues', 'expense', 'Iuran', datetime('now')),
  ('expense-salary', 'expense', 'Gaji', datetime('now')),
  ('expense-crew-fee', 'expense', 'Fee untuk Crew', datetime('now')),
  ('expense-electricity', 'expense', 'Listrik', datetime('now')),
  ('expense-internet', 'expense', 'WiFi / Internet', datetime('now')),
  ('expense-laundry', 'expense', 'Laundry', datetime('now')),
  ('expense-amenities', 'expense', 'Amenities', datetime('now')),
  ('expense-repair', 'expense', 'Perbaikan', datetime('now')),
  ('expense-maintenance', 'expense', 'Maintenance', datetime('now')),
  ('expense-pest-control', 'expense', 'Pest Control', datetime('now')),
  ('expense-supplies', 'expense', 'Perlengkapan', datetime('now')),
  ('expense-tax', 'expense', 'Pajak', datetime('now')),
  ('expense-agent-fee', 'expense', 'Komisi Agen', datetime('now')),
  ('expense-other', 'expense', 'Lain-lain', datetime('now')),
  ('income-extra-bed', 'income', 'Extra Bed', datetime('now')),
  ('income-extra-service', 'income', 'Layanan Tambahan', datetime('now')),
  ('income-refund', 'income', 'Pengembalian Dana', datetime('now')),
  ('income-other', 'income', 'Pemasukan Lain', datetime('now')),
  ('income-opening-balance', 'income', 'Saldo Awal / Carry-over', datetime('now'));

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category_id TEXT NOT NULL REFERENCES finance_categories(id),
  category_name TEXT NOT NULL,
  property_id TEXT,
  property_name TEXT NOT NULL DEFAULT '',
  entry_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL DEFAULT '',
  payee TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL DEFAULT 'once'
    CHECK (recurrence IN ('once', 'weekly', 'monthly', 'quarterly', 'yearly')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_date_kind
  ON finance_entries(entry_date, kind);

CREATE INDEX IF NOT EXISTS idx_finance_entries_property_date
  ON finance_entries(property_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_finance_entries_category_date
  ON finance_entries(category_id, entry_date);