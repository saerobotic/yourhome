CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL
);

