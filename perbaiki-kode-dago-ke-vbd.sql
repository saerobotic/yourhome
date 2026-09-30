UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'VBD'),
    property_name = (SELECT name FROM properties WHERE property_code = 'VBD'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE property_code = 'Dago';

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'VBD'),
    property_name = (SELECT name FROM properties WHERE property_code = 'VBD')
WHERE property_id = 'BELUM-Dago';
