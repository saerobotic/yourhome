-- Key Room: password pintu (smart lock) per properti + akses crew.
-- Jalankan satu kali. Aman dijalankan ulang (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS door_passwords (
  id TEXT PRIMARY KEY,
  property_name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS door_access_grants (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  granted_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(crew_id, property_name)
);
CREATE INDEX IF NOT EXISTS idx_door_access_grants_crew ON door_access_grants(crew_id);
CREATE INDEX IF NOT EXISTS idx_door_access_grants_property ON door_access_grants(property_name);
