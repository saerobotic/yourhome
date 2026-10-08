CREATE TABLE IF NOT EXISTS dashboard_field_tasks (
  id TEXT PRIMARY KEY,
  work_date TEXT NOT NULL,
  crew TEXT NOT NULL,
  property TEXT NOT NULL,
  type TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  completion_requested_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_field_tasks_date_crew
  ON dashboard_field_tasks(work_date, crew, time);
