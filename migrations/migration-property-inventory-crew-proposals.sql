ALTER TABLE property_inventory_items ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE property_inventory_items ADD COLUMN source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE property_inventory_items ADD COLUMN photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE property_inventory_items ADD COLUMN reported_by TEXT NOT NULL DEFAULT '';
