-- Gabungkan kode properti lama ke kode katalog yang benar.
-- AZA -> AZR, CSB -> VCB, CKB -> VCKB.
-- Jalankan per blok di D1 Console database: your-home-checkin.

-- 1. Pastikan ketiga properti tujuan tersedia sebelum memindahkan data.
SELECT property_code, dashboard_id, id, name
FROM properties
WHERE UPPER(property_code) IN ('AZR', 'VCB', 'VCKB')
ORDER BY property_code;

-- 2. Pindahkan booking, termasuk kode yang ditampilkan di Dashboard.
UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'AZR'),
    property_code = 'AZR',
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'AZR'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) = 'AZA'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'AZR');

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'VCB'),
    property_code = 'VCB',
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'VCB'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) = 'CSB'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'VCB');

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'VCKB'),
    property_code = 'VCKB',
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'VCKB'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) = 'CKB'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'VCKB');

-- 3. Pindahkan transaksi keuangan yang masih memakai ID atau placeholder kode lama.
UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'AZR'),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'AZR')
WHERE (
  UPPER(property_id) = 'BELUM-AZA'
  OR property_id IN (SELECT id FROM properties WHERE UPPER(property_code) = 'AZA')
  OR property_id IN (SELECT dashboard_id FROM properties WHERE UPPER(property_code) = 'AZA')
) AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'AZR');

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'VCB'),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'VCB')
WHERE (
  UPPER(property_id) = 'BELUM-CSB'
  OR property_id IN (SELECT id FROM properties WHERE UPPER(property_code) = 'CSB')
  OR property_id IN (SELECT dashboard_id FROM properties WHERE UPPER(property_code) = 'CSB')
) AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'VCB');

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'VCKB'),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'VCKB')
WHERE (
  UPPER(property_id) = 'BELUM-CKB'
  OR property_id IN (SELECT id FROM properties WHERE UPPER(property_code) = 'CKB')
  OR property_id IN (SELECT dashboard_id FROM properties WHERE UPPER(property_code) = 'CKB')
) AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'VCKB');

-- 4. Hapus properti lama dari daftar Dashboard agar tidak muncul lagi setelah refresh.
UPDATE dashboard_management_data
SET data_json = json_set(
  data_json,
  '$.properties',
  COALESCE((
    SELECT json_group_array(json(value))
    FROM json_each(dashboard_management_data.data_json, '$.properties')
    WHERE UPPER(COALESCE(json_extract(value, '$.code'), '')) NOT IN ('AZA', 'CSB', 'CKB')
  ), json('[]'))
)
WHERE id = 'main'
  AND (SELECT COUNT(*) FROM properties WHERE UPPER(property_code) IN ('AZR', 'VCB', 'VCKB')) = 3;

-- 5. Hapus entri katalog kode lama setelah semua referensi dipindahkan.
DELETE FROM properties
WHERE UPPER(property_code) IN ('AZA', 'CSB', 'CKB')
  AND (SELECT COUNT(*) FROM properties WHERE UPPER(property_code) IN ('AZR', 'VCB', 'VCKB')) = 3;

-- 6. Verifikasi akhir: tiga kode lama harus bernilai 0 pada semua hasil ini.
SELECT 'booking' AS data, property_code AS kode, COUNT(*) AS jumlah
FROM dashboard_bookings
WHERE UPPER(property_code) IN ('AZA', 'CSB', 'CKB')
GROUP BY property_code
UNION ALL
SELECT 'properti' AS data, property_code AS kode, COUNT(*) AS jumlah
FROM properties
WHERE UPPER(property_code) IN ('AZA', 'CSB', 'CKB')
GROUP BY property_code;

SELECT property_code, name
FROM properties
WHERE UPPER(property_code) IN ('AZR', 'VCB', 'VCKB')
ORDER BY property_code;