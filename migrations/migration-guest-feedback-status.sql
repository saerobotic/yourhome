-- Tambah status baca/belum-dibaca pada guest_feedback, untuk lampu notifikasi
-- di kartu "QR Kritik & Saran" pada hub admin_yourhome/index.html.
-- Jalankan SATU KALI setelah migration-guest-feedback.sql. Menjalankan ulang akan
-- gagal dengan "duplicate column name" karena ALTER TABLE ADD COLUMN bukan operasi
-- idempotent di SQLite -- jangan dijalankan dua kali pada database yang sama.
ALTER TABLE guest_feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';
CREATE INDEX IF NOT EXISTS idx_guest_feedback_status ON guest_feedback(status);
