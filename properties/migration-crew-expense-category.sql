INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at)
VALUES ('expense-crew-fee', 'expense', 'Fee untuk Crew', datetime('now'));

UPDATE finance_entries
SET category_id = 'expense-crew-fee',
    category_name = 'Fee untuk Crew'
WHERE created_by = 'checkin-payroll';