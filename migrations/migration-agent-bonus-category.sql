-- Kategori pengeluaran "Bonus Agen", dipakai tombol "+ Tambah Manual" di Laporan Agen
-- (dasbord.html) untuk mencatat bonus/penyesuaian yang tidak menempel ke satu booking
-- tertentu. Mengikuti pola persis migration-dashboard-agents.sql (kategori "Fee Agen").
-- Aman dijalankan ulang (INSERT OR IGNORE).
INSERT OR IGNORE INTO finance_categories (id, kind, name, created_at)
VALUES ('expense-agent-bonus', 'expense', 'Bonus Agen', datetime('now'));
