-- Pindahkan semua data GH-KBP ke DVH, lalu hapus GH-KBP.
-- Jalankan setiap blok secara terpisah di D1 Console database: your-home-checkin.

-- 1. Pastikan properti tujuan tersedia.
SELECT property_code, dashboard_id, id, name
FROM properties
WHERE UPPER(property_code) = 'DVH';

-- 2. Pindahkan booking dan kode yang tampil pada Dashboard.
UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'DVH'),
    property_code = 'DVH',
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'DVH'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) = 'GH-KBP'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'DVH');

-- 3. Pindahkan transaksi keuangan yang masih mengarah ke GH-KBP.
UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = 'DVH'),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = 'DVH')
WHERE (
  UPPER(property_id) = 'BELUM-GH-KBP'
  OR property_id IN (SELECT id FROM properties WHERE UPPER(property_code) = 'GH-KBP')
  OR property_id IN (SELECT dashboard_id FROM properties WHERE UPPER(property_code) = 'GH-KBP')
) AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'DVH');

-- 4. Hapus GH-KBP dari daftar properti Dashboard agar tidak muncul lagi.
UPDATE dashboard_management_data
SET data_json = json_set(
  data_json,
  '$.properties',
  COALESCE((
    SELECT json_group_array(json(value))
    FROM json_each(dashboard_management_data.data_json, '$.properties')
    WHERE UPPER(COALESCE(json_extract(value, '$.code'), '')) <> 'GH-KBP'
  ), json('[]'))
)
WHERE id = 'main'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'DVH');

-- 5. Hapus katalog properti lama setelah semua referensinya dipindahkan.
DELETE FROM properties
WHERE UPPER(property_code) = 'GH-KBP'
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = 'DVH');

-- 6. Verifikasi akhir: GH-KBP harus tidak memiliki booking atau properti tersisa.
SELECT 'booking' AS data, COUNT(*) AS jumlah
FROM dashboard_bookings
WHERE UPPER(property_code) = 'GH-KBP'
UNION ALL
SELECT 'properti' AS data, COUNT(*) AS jumlah
FROM properties
WHERE UPPER(property_code) = 'GH-KBP';