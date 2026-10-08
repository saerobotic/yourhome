CREATE TABLE IF NOT EXISTS dashboard_crew_extra_pay (
  crew TEXT NOT NULL,
  period_month TEXT NOT NULL,
  tunjangan INTEGER NOT NULL DEFAULT 0 CHECK (tunjangan >= 0),
  bonus INTEGER NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  bensin INTEGER NOT NULL DEFAULT 0 CHECK (bensin >= 0),
  reimburse INTEGER NOT NULL DEFAULT 0 CHECK (reimburse >= 0),
  pulsa INTEGER NOT NULL DEFAULT 0 CHECK (pulsa >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (crew, period_month)
);
