-- ============================================================
-- TAHAP 2 DARI 2 — BERSIHKAN DATA CHECK-IN CREW
-- Jalankan di D1 Console, database: your-home-checkin
-- ------------------------------------------------------------
-- Jalankan HANYA setelah Tahap 1 (bersihkan-keuangan.sql) selesai
-- dan hasilnya sudah kamu periksa.
--
-- Yang DIHAPUS di tahap ini:
--   checkins  -> semua data check-in crew (selfie, foto kerja, lokasi)
--
-- Yang TETAP:
--   crews     -> daftar nama crew (diminta dipertahankan)
--   properties, akun, site_settings
--
-- SETELAH file ini dijalankan, lanjut ke R2:
--   hapus folder-folder bernama CREW di bucket PHOTOS
--   (setiap folder crew berisi selfie.jpg dan work_N.jpg)
--   JANGAN hapus: 'properties/' dan 'site/'
-- ============================================================


-- ------------------------------------------------------------
-- 1) CATAT DULU — salin hasilnya untuk berita acara serah terima
-- ------------------------------------------------------------
SELECT COUNT(*) AS jumlah_checkin,
       MIN(work_date) AS dari_tanggal,
       MAX(work_date) AS sampai_tanggal
FROM checkins;

SELECT crew, COUNT(*) AS jumlah_checkin
FROM checkins
GROUP BY crew
ORDER BY crew;


-- ------------------------------------------------------------
-- 2) HAPUS semua data check-in crew
-- ------------------------------------------------------------
DELETE FROM checkins;


-- ------------------------------------------------------------
-- 3) PEMERIKSAAN AKHIR
--    checkins harus 0, crews harus tetap utuh.
-- ------------------------------------------------------------
SELECT 'checkin crew' AS data, COUNT(*) AS sisa FROM checkins
UNION ALL SELECT 'crew (harus tetap)', COUNT(*) FROM crews;
