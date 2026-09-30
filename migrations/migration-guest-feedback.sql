-- Migration: guest feedback ("Kritik & Saran") submissions from form-kritik-saran.html.
-- Safe to run once; uses CREATE TABLE IF NOT EXISTS so re-running is harmless.

CREATE TABLE IF NOT EXISTS guest_feedback (
  id TEXT PRIMARY KEY,
  property_type TEXT NOT NULL,
  property_name TEXT NOT NULL,
  checkin_date TEXT NOT NULL,
  stay_duration TEXT NOT NULL,
  booking_source TEXT NOT NULL DEFAULT '',
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT NOT NULL DEFAULT '',
  guest_city TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  rating_cleanliness INTEGER NOT NULL CHECK (rating_cleanliness BETWEEN 1 AND 5),
  rating_comfort INTEGER NOT NULL CHECK (rating_comfort BETWEEN 1 AND 5),
  rating_facilities INTEGER NOT NULL CHECK (rating_facilities BETWEEN 1 AND 5),
  rating_location INTEGER NOT NULL CHECK (rating_location BETWEEN 1 AND 5),
  rating_service INTEGER NOT NULL CHECK (rating_service BETWEEN 1 AND 5),
  rating_value INTEGER NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
  avg_rating REAL NOT NULL,
  liked TEXT NOT NULL,
  improve TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL DEFAULT '',
  nps_score INTEGER NOT NULL CHECK (nps_score BETWEEN 0 AND 10),
  follow_up_consent INTEGER NOT NULL DEFAULT 0 CHECK (follow_up_consent IN (0, 1)),
  testimonial_consent INTEGER NOT NULL DEFAULT 0 CHECK (testimonial_consent IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_feedback_created ON guest_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_feedback_property ON guest_feedback(property_name);
