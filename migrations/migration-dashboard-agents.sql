-- Daftar master Agen/Marketing + PIN login Agen Portal (agen_yourhome) dalam satu tabel,
-- mengikuti pola tabel crews persis (ID + PIN 6 digit, pin_hash tanpa salt).
CREATE TABLE IF NOT EXISTS dashboard_agents (
  id TEXT PRIMARY KEY,
  agent_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  default_fee_type TEXT NOT NULL DEFAULT 'amount' CHECK (default_fee_type IN ('amount', 'percent')),
  default_fee_value INTEGER NOT NULL DEFAULT 0,
  pin_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_agents_active
  ON dashboard_agents(active);

-- Fee agen per booking
ALTER TABLE dashboard_bookings ADD COLUMN agent_id TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_bookings ADD COLUMN agent_name TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_bookings ADD COLUMN agent_fee_type TEXT NOT NULL DEFAULT '';
ALTER TABLE dashboard_bookings ADD COLUMN agent_fee_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dashboard_bookings ADD COLUMN agent_fee_amount INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dashboard_bookings_agent
  ON dashboard_bookings(agent_id);

INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at)
VALUES ('expense-agent-fee', 'expense', 'Fee Agen', datetime('now'));
