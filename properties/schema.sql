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
  external_bookings TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_active_category
  ON properties(active, category, sort_order);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  crew TEXT NOT NULL,
  unit TEXT NOT NULL,
  job_type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  accuracy REAL,
  selfie_url TEXT NOT NULL DEFAULT '',
  work_photo_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  work_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_work_date
  ON checkins(work_date);

CREATE INDEX IF NOT EXISTS idx_checkins_crew_work_date
  ON checkins(crew, work_date);
