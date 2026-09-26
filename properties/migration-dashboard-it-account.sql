CREATE TABLE IF NOT EXISTS dashboard_users (
  account_id TEXT PRIMARY KEY CHECK (account_id IN ('master', 'admin', 'it')),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('Master', 'Admin', 'IT')),
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO dashboard_users (
  account_id, display_name, email, role, password_salt, password_hash, active, created_at, updated_at
)
SELECT account_id, display_name, email, role, password_salt, password_hash, active, created_at, updated_at
FROM dashboard_accounts;

INSERT OR IGNORE INTO dashboard_users (
  account_id, display_name, email, role, created_at, updated_at
) VALUES ('it', 'IT Support', '', 'IT', datetime('now'), datetime('now'));
