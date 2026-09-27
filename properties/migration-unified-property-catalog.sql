/* Run after migration-dashboard-management-data.sql. */
ALTER TABLE properties ADD COLUMN dashboard_id TEXT;
ALTER TABLE properties ADD COLUMN property_code TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'active';

UPDATE properties
SET publication_status = CASE WHEN active = 1 THEN 'active' ELSE 'archived' END;

UPDATE properties
SET dashboard_id = (
      SELECT json_extract(item.value, '$.id')
      FROM dashboard_management_data AS management,
           json_each(management.data_json, '$.properties') AS item
      WHERE lower(trim(json_extract(item.value, '$.name'))) = lower(trim(properties.name))
        AND (
          SELECT COUNT(*)
          FROM json_each(management.data_json, '$.properties') AS same_name
          WHERE lower(trim(json_extract(same_name.value, '$.name'))) = lower(trim(properties.name))
        ) = 1
      LIMIT 1
    ),
    property_code = COALESCE((
      SELECT json_extract(item.value, '$.code')
      FROM dashboard_management_data AS management,
           json_each(management.data_json, '$.properties') AS item
      WHERE lower(trim(json_extract(item.value, '$.name'))) = lower(trim(properties.name))
        AND (
          SELECT COUNT(*)
          FROM json_each(management.data_json, '$.properties') AS same_name
          WHERE lower(trim(json_extract(same_name.value, '$.name'))) = lower(trim(properties.name))
        ) = 1
      LIMIT 1
    ), '')
WHERE dashboard_id IS NULL;

UPDATE properties
SET dashboard_id = 'D-' || lower(id)
WHERE dashboard_id IS NULL;

UPDATE properties
SET active = 0,
    publication_status = 'archived'
WHERE dashboard_id IN (
  SELECT json_extract(item.value, '$.id')
  FROM dashboard_management_data AS management,
       json_each(management.data_json, '$.properties') AS item
  WHERE json_extract(item.value, '$.active') IN (0, 'false')
);

INSERT INTO properties (
  id, dashboard_id, property_code, name, category, location, price,
  weekday_price, weekend_price, beds, baths, guests, image_url, image_urls,
  map_query, map_link, map_embed, description, room_options, external_bookings,
  sort_order, active, publication_status, updated_at
)
SELECT
  'dashboard-' || lower(json_extract(item.value, '$.id')),
  json_extract(item.value, '$.id'),
  upper(COALESCE(json_extract(item.value, '$.code'), '')),
  trim(json_extract(item.value, '$.name')),
  json_extract(item.value, '$.type'),
  COALESCE(json_extract(item.value, '$.area'), ''),
  MAX(0, CAST(COALESCE(json_extract(item.value, '$.price'), 0) AS INTEGER)),
  CASE WHEN json_extract(item.value, '$.type') = 'kos' THEN NULL ELSE MAX(0, CAST(COALESCE(json_extract(item.value, '$.price'), 0) AS INTEGER)) END,
  CASE WHEN json_extract(item.value, '$.type') = 'kos' THEN NULL ELSE MAX(0, CAST(COALESCE(json_extract(item.value, '$.price'), 0) AS INTEGER)) END,
  MAX(0, CAST(COALESCE(json_extract(item.value, '$.beds'), 0) AS INTEGER)),
  MAX(0, CAST(COALESCE(json_extract(item.value, '$.baths'), 0) AS INTEGER)),
  MAX(0, CAST(COALESCE(json_extract(item.value, '$.guests'), 0) AS INTEGER)),
  '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
FROM dashboard_management_data AS management,
     json_each(management.data_json, '$.properties') AS item
WHERE length(trim(COALESCE(json_extract(item.value, '$.id'), ''))) BETWEEN 1 AND 80
  AND length(trim(COALESCE(json_extract(item.value, '$.name'), ''))) BETWEEN 2 AND 180
  AND json_extract(item.value, '$.type') IN ('apartment', 'villa', 'guesthouse', 'kos')
  AND NOT EXISTS (
    SELECT 1 FROM properties AS existing
    WHERE existing.dashboard_id = json_extract(item.value, '$.id')
      OR existing.id = 'dashboard-' || lower(json_extract(item.value, '$.id'))
       OR lower(trim(existing.name)) = lower(trim(json_extract(item.value, '$.name')))
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_dashboard_id
  ON properties(dashboard_id)
  WHERE dashboard_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_publication_status
  ON properties(publication_status, active, sort_order);