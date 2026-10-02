CREATE TABLE IF NOT EXISTS it_support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender_account_id TEXT NOT NULL,
  sender_label TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_it_support_ticket_messages_ticket ON it_support_ticket_messages(ticket_id);
