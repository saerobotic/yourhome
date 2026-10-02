ALTER TABLE it_support_tickets ADD COLUMN last_it_reply_at TEXT NOT NULL DEFAULT '';
ALTER TABLE it_support_tickets ADD COLUMN reporter_last_seen_at TEXT NOT NULL DEFAULT '';
