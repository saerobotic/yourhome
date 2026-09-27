CREATE TABLE IF NOT EXISTS dashboard_management_data (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  data_json TEXT NOT NULL CHECK (length(data_json) <= 524288),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
