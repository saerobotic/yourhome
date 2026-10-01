CREATE TABLE IF NOT EXISTS it_support_tickets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'task')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'input_it' CHECK (source IN ('input_it', 'lapor_bug')),
  reported_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_by TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);