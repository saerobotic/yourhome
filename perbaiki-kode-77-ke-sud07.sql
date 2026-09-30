UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'SUD-07'),
    property_name = (SELECT name FROM properties WHERE property_code = 'SUD-07'),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE property_code IN ('77', '7');

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE property_code = 'SUD-07'),
    property_name = (SELECT name FROM properties WHERE property_code = 'SUD-07')
WHERE property_id IN ('BELUM-77', 'BELUM-7');
