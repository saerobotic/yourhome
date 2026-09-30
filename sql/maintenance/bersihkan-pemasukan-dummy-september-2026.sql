-- ============================================================
-- BERSIHKAN PEMASUKAN BOOKING DUMMY SEPTEMBER 2026
-- Jalankan di D1 Console, database: your-home-checkin
--
-- Menghapus booking September 2026 yang BUKAN hasil impor Excel
-- (`created_by` tidak diawali `import-excel-2026`) beserta pemasukan
-- Booking dan Extra Bed turunannya. Pemasukan manual non-booking tetap ada.
-- ============================================================

-- 1) PERIKSA DAFTAR YANG AKAN DIHAPUS.
--    Pastikan tidak ada booking valid yang ikut tampil sebelum lanjut.
SELECT
  b.id,
  b.checkin,
  b.guest,
  b.property_name,
  b.amount,
  b.created_by,
  b.created_at
FROM dashboard_bookings b
WHERE b.checkin >= '2026-09-01'
  AND b.checkin < '2026-10-01'
  AND COALESCE(b.created_by, '') NOT LIKE 'import-excel-2026%'
ORDER BY b.checkin, b.id;

-- 2) HAPUS PEMASUKAN TURUNAN booking dummy terlebih dahulu.
DELETE FROM finance_entries
WHERE id IN (
  SELECT b.income_entry_id
  FROM dashboard_bookings b
  WHERE b.checkin >= '2026-09-01'
    AND b.checkin < '2026-10-01'
    AND COALESCE(b.created_by, '') NOT LIKE 'import-excel-2026%'
  UNION
  SELECT 'booking-income-' || b.id
  FROM dashboard_bookings b
  WHERE b.checkin >= '2026-09-01'
    AND b.checkin < '2026-10-01'
    AND COALESCE(b.created_by, '') NOT LIKE 'import-excel-2026%'
  UNION
  SELECT 'booking-extra-bed-' || b.id
  FROM dashboard_bookings b
  WHERE b.checkin >= '2026-09-01'
    AND b.checkin < '2026-10-01'
    AND COALESCE(b.created_by, '') NOT LIKE 'import-excel-2026%'
);

-- 3) HAPUS booking dummy agar pemasukan tidak dapat muncul kembali.
DELETE FROM dashboard_bookings
WHERE checkin >= '2026-09-01'
  AND checkin < '2026-10-01'
  AND COALESCE(created_by, '') NOT LIKE 'import-excel-2026%';

-- 4) VERIFIKASI: harus 0 baris dan Rp 0.
SELECT
  COUNT(*) AS sisa_booking_non_excel,
  COALESCE(SUM(amount), 0) AS nilai_booking_non_excel
FROM dashboard_bookings
WHERE checkin >= '2026-09-01'
  AND checkin < '2026-10-01'
  AND COALESCE(created_by, '') NOT LIKE 'import-excel-2026%';

SELECT
  COUNT(*) AS pemasukan_excel_september,
  COALESCE(SUM(amount), 0) AS total_pemasukan_excel_september
FROM finance_entries
WHERE kind = 'income'
  AND entry_date >= '2026-09-01'
  AND entry_date < '2026-10-01'
  AND created_by LIKE 'import-excel-2026%';