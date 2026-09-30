SELECT property_code, dashboard_id, id, name, active, publication_status FROM properties WHERE property_code IN ('AL12', 'AZR') OR name LIKE '%Azure%' ORDER BY property_code;
