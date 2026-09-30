SELECT id, entry_date, amount, description, created_by FROM finance_entries WHERE created_by = 'master' AND entry_date >= '2026-08-01' AND entry_date < '2026-10-01' ORDER BY entry_date;
