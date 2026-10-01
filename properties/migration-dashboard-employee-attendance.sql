-- LEGACY: crew-based table; preserve it where this migration has already run.
-- Office employee attendance uses migration-dashboard-office-employees.sql instead.
CREATE TABLE IF NOT EXISTS employee_attendance_records (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL,
  crew_name TEXT NOT NULL,
  work_date TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  selfie_url TEXT NOT NULL,
  UNIQUE (crew_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_attendance_work_date
  ON employee_attendance_records(work_date);
