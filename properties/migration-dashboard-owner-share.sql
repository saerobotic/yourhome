CREATE TABLE IF NOT EXISTS dashboard_owner_share_calculations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  period_month TEXT NOT NULL CHECK (
    period_month GLOB '????-??'
    AND substr(period_month, 6, 2) BETWEEN '01' AND '12'
  ),
  calculation_json TEXT NOT NULL CHECK (length(calculation_json) <= 262144),
  status TEXT NOT NULL DEFAULT 'final' CHECK (status = 'final'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_owner_share_calculations_period
  ON dashboard_owner_share_calculations(period_month, owner_id);