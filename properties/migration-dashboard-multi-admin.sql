CREATE TABLE dashboard_users_multi_admin (
  account_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('Master', 'Admin', 'IT')),
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delete_pin_salt TEXT NOT NULL DEFAULT '',
  delete_pin_hash TEXT NOT NULL DEFAULT '',
  delete_pin_must_change INTEGER NOT NULL DEFAULT 1 CHECK (delete_pin_must_change IN (0, 1))
);

INSERT INTO dashboard_users_multi_admin (
  account_id, display_name, email, role, password_salt, password_hash, active,
  created_at, updated_at, delete_pin_salt, delete_pin_hash, delete_pin_must_change
)
SELECT
  account_id, display_name, email, role, password_salt, password_hash, active,
  created_at, updated_at, delete_pin_salt, delete_pin_hash, delete_pin_must_change
FROM dashboard_users;

DROP TABLE dashboard_users;
ALTER TABLE dashboard_users_multi_admin RENAME TO dashboard_users;