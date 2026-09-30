UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VBD')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VBD')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('Dago'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VBD'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VBD')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VBD'))
WHERE property_id IN (UPPER('BELUM-Dago'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VBD'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('SUD-07')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('SUD-07')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('7'), UPPER('77'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('SUD-07'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('SUD-07')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('SUD-07'))
WHERE property_id IN (UPPER('BELUM-7'), UPPER('BELUM-77'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('SUD-07'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('KBP'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP'))
WHERE property_id IN (UPPER('BELUM-KBP'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('GH-KBP'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('GCB-03')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('GCB-03')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('GCA'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('GCB-03'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('GCB-03')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('GCB-03'))
WHERE property_id IN (UPPER('BELUM-GCA'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('GCB-03'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VLAR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VLAR')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('VAUR'), UPPER('AUR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VLAR'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VLAR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VLAR'))
WHERE property_id IN (UPPER('BELUM-VAUR'), UPPER('BELUM-AUR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VLAR'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VTG')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VTG')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('TGV'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VTG'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VTG')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VTG'))
WHERE property_id IN (UPPER('BELUM-TGV'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VTG'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VAL-12')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VAL-12')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('AL12'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VAL-12'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('VAL-12')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('VAL-12'))
WHERE property_id IN (UPPER('BELUM-AL12'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('VAL-12'));

