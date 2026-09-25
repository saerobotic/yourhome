CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('apartment', 'villa', 'guesthouse', 'kos')),
  location TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  weekday_price INTEGER,
  weekend_price INTEGER,
  beds INTEGER NOT NULL DEFAULT 0,
  baths INTEGER NOT NULL DEFAULT 0,
  guests INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  image_urls TEXT NOT NULL DEFAULT '[]',
  map_query TEXT NOT NULL DEFAULT '',
  map_link TEXT NOT NULL DEFAULT '',
  map_embed TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  room_options TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_active_category
  ON properties(active, category, sort_order);
