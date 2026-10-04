ALTER TABLE finance_entries ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE finance_entries ADD COLUMN review_sent_at TEXT NOT NULL DEFAULT '';
