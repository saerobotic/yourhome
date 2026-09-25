ALTER TABLE properties ADD COLUMN image_urls TEXT NOT NULL DEFAULT '[]';

UPDATE properties
SET image_urls = CASE
  WHEN image_url IS NULL OR image_url = '' THEN '[]'
  ELSE json_array(image_url)
END
WHERE image_urls = '[]';
