CREATE TABLE IF NOT EXISTS office_employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS office_employee_attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  work_date TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  selfie_url TEXT NOT NULL,
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_office_employee_attendance_work_date
  ON office_employee_attendance(work_date);
