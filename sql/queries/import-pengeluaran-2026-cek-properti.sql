-- ============================================================
-- CEK KODE PROPERTI SEBELUM IMPOR PENGELUARAN FEB - AGS 2026
-- Jalankan di D1 Console, database: your-home-checkin
--
-- Harap semua baris berstatus ada_di_properti = 1.
-- Kalau ada yang 0: buat dulu propertinya di Dashboard > Properti > Tambah,
-- isi kolom kode sama persis, baru jalankan file impornya.
-- (Kalau kodenya belum ada, baris pengeluaran itu masuk sebagai "tanpa properti".)
--
-- Perkiraan jumlah baris dari file Feb - Ags 2026:
--   KDO 123 | VBD 61 | VIB 72 | GH-KBP 63 | GCB-03 34 | HIB 14 | SUD-18 1
--   tanpa properti 54 (gaji CSO, bagi hasil, biaya bank, dll.)
-- ============================================================
SELECT c.kode,
       (SELECT COUNT(*) FROM properties p WHERE UPPER(p.property_code) = UPPER(c.kode)) AS ada_di_properti,
       (SELECT p.name FROM properties p WHERE UPPER(p.property_code) = UPPER(c.kode)) AS nama_properti
FROM (
  SELECT 'KDO' AS kode
  UNION ALL SELECT 'VBD'
  UNION ALL SELECT 'VIB'
  UNION ALL SELECT 'GH-KBP'
  UNION ALL SELECT 'GCB-03'
  UNION ALL SELECT 'SUD-18'
  UNION ALL SELECT 'HIB'
) c
ORDER BY c.kode;
