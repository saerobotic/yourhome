-- Kategori id 'expense-agent-fee' sudah ada sejak migration-dashboard-finance.sql (lama),
-- dengan nama "Komisi Agen". migration-dashboard-agents.sql mencoba menamainya "Fee Agen"
-- lewat INSERT OR IGNORE, tapi baris itu sudah ada duluan jadi INSERT OR IGNORE tidak
-- berpengaruh -- namanya tetap "Komisi Agen" di dropdown "Tambah Pengeluaran", padahal
-- entri otomatis dari booking sudah memakai label "Fee Agen". Samakan jadi satu nama.
-- Aman dijalankan ulang.
UPDATE finance_categories SET name = 'Fee Agen' WHERE id = 'expense-agent-fee';
UPDATE finance_entries SET category_name = 'Fee Agen' WHERE category_id = 'expense-agent-fee';
