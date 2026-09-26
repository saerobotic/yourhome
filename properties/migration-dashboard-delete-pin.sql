ALTER TABLE dashboard_users
  ADD COLUMN delete_pin_salt TEXT NOT NULL DEFAULT '';

ALTER TABLE dashboard_users
  ADD COLUMN delete_pin_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE dashboard_users
  ADD COLUMN delete_pin_must_change INTEGER NOT NULL DEFAULT 1
    CHECK (delete_pin_must_change IN (0, 1));
