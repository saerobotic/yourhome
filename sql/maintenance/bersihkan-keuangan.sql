-- ============================================================
-- TAHAP 1 DARI 2 — BERSIHKAN DATA PEMASUKAN & PENGELUARAN
-- Jalankan di D1 Console, database: your-home-checkin
-- ------------------------------------------------------------
-- Prasyarat WAJIB: backup sudah dibuat
--   wrangler d1 export your-home-checkin --remote --output backup-sebelum-dibersihkan.sql
--
-- Yang DIHAPUS di tahap ini:
--   dashboard_bookings            -> daftar booking
--   finance_entries               -> semua pemasukan & pengeluaran
--   dashboard_owner_share_calculations -> hasil bagi hasil (turunan)
--
-- Kenapa booking ikut dihapus?
--   Setiap booking otomatis membuat baris pemasukan
--   'booking-income-<id>' dan 'booking-extra-bed-<id>'.
--   Kalau booking dibiarkan, pemasukan akan muncul lagi / laporan jadi timpang.
--
-- Yang TETAP: properties, crews, akun, finance_categories, site_settings
--
-- SETELAH file ini dijalankan, lanjut ke R2:
--   hapus seluruh folder 'finance/' (isinya bukti pengeluaran)
--   JANGAN hapus 'properties/' dan 'site/'
-- ============================================================


-- ------------------------------------------------------------
-- 1) CATAT DULU — salin hasilnya untuk berita acara serah terima
-- ------------------------------------------------------------
SELECT kind AS jenis, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai
FROM finance_entries
GROUP BY kind;

SELECT 'booking' AS data, COUNT(*) AS jumlah, COALESCE(SUM(amount), 0) AS nilai
FROM dashboard_bookings;


-- ------------------------------------------------------------
-- 2) HAPUS semua booking
-- ------------------------------------------------------------
DELETE FROM dashboard_bookings;


-- ------------------------------------------------------------
-- 3) HAPUS semua pemasukan & pengeluaran
-- ------------------------------------------------------------
DELETE FROM finance_entries;


-- ------------------------------------------------------------
-- 4) HAPUS hasil bagi hasil (turunan dari data di atas)
--    Kalau tabel ini belum pernah dibuat, abaikan pesan errornya.
--    Bagian penting (no. 2 & 3) sudah selesai lebih dulu.
-- ------------------------------------------------------------
DELETE FROM dashboard_owner_share_calculations;


-- ------------------------------------------------------------
-- 5) PEMERIKSAAN AKHIR
--    Dua baris pertama harus 0.
--    Properti & crew harus tetap seperti sebelumnya.
-- ------------------------------------------------------------
SELECT 'pemasukan/pengeluaran' AS data, COUNT(*) AS sisa FROM finance_entries
UNION ALL SELECT 'booking',                     COUNT(*) FROM dashboard_bookings
UNION ALL SELECT 'properti (harus tetap)',      COUNT(*) FROM properties
UNION ALL SELECT 'crew (harus tetap)',          COUNT(*) FROM crews;
