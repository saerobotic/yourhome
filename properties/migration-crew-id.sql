ALTER TABLE crews ADD COLUMN crew_code TEXT NOT NULL DEFAULT '';

UPDATE crews
SET crew_code = 'CR-' || upper(substr(replace(id, '-', ''), 1, 8))
WHERE crew_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crews_crew_code
  ON crews(crew_code COLLATE NOCASE);