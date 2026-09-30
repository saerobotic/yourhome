UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'HIB'),
    property_name = (SELECT name FROM properties WHERE property_code = 'HIB'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE property_code = 'HIB'
  AND EXISTS (SELECT 1 FROM properties WHERE property_code = 'HIB');

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'HIB'),
    property_name = (SELECT name FROM properties WHERE property_code = 'HIB')
WHERE property_id = 'BELUM-HIB'
  AND EXISTS (SELECT 1 FROM properties WHERE property_code = 'HIB');
