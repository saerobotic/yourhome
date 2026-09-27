CREATE TABLE IF NOT EXISTS dashboard_staff_chat_messages (
  id TEXT PRIMARY KEY,
  sender_account_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_staff_chat_messages_created_at
  ON dashboard_staff_chat_messages(created_at DESC, id DESC);