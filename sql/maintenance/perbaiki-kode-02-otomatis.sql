UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('HIB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('HIB')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('HIB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('HIB'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('HIB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('HIB'))
WHERE property_id IN (UPPER('BELUM-HIB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('HIB'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CSB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CSB')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('CSB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CSB'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CSB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CSB'))
WHERE property_id IN (UPPER('BELUM-CSB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CSB'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('SMR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('SMR')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('SMR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('SMR'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('SMR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('SMR'))
WHERE property_id IN (UPPER('BELUM-SMR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('SMR'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CKB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CKB')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('CKB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CKB'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CKB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CKB'))
WHERE property_id IN (UPPER('BELUM-CKB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CKB'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CZB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CZB')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('CZB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CZB'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('CZB')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('CZB'))
WHERE property_id IN (UPPER('BELUM-CZB'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('CZB'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('111')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('111')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('111'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('111'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('111')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('111'))
WHERE property_id IN (UPPER('BELUM-111'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('111'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('20')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('20')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('20'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('20'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('20')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('20'))
WHERE property_id IN (UPPER('BELUM-20'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('20'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('AZR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('AZR')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('AZR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('AZR'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('AZR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('AZR'))
WHERE property_id IN (UPPER('BELUM-AZR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('AZR'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('DGR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('DGR')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('DGR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('DGR'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('DGR')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('DGR'))
WHERE property_id IN (UPPER('BELUM-DGR'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('DGR'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('Ora')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('Ora')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('Ora'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('Ora'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('Ora')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('Ora'))
WHERE property_id IN (UPPER('BELUM-Ora'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('Ora'));

UPDATE dashboard_bookings
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('Rekan')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('Rekan')),
    note = TRIM(REPLACE(REPLACE(note, ' - KODE PERLU DIPERIKSA', ''), 'KODE PERLU DIPERIKSA', ''))
WHERE UPPER(property_code) IN (UPPER('Rekan'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('Rekan'));

UPDATE finance_entries
SET property_id = (SELECT COALESCE(NULLIF(TRIM(dashboard_id), ''), id) FROM properties WHERE UPPER(property_code) = UPPER('Rekan')),
    property_name = (SELECT name FROM properties WHERE UPPER(property_code) = UPPER('Rekan'))
WHERE property_id IN (UPPER('BELUM-Rekan'))
  AND EXISTS (SELECT 1 FROM properties WHERE UPPER(property_code) = UPPER('Rekan'));

