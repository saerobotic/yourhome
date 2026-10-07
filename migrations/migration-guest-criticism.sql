-- Simple name/phone/criticism submissions from form-kritik-saran.html.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS guest_criticisms (
  id TEXT PRIMARY KEY,
  property_name TEXT NOT NULL DEFAULT '',
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  criticism TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('read', 'unread')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_criticisms_created ON guest_criticisms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_criticisms_status ON guest_criticisms(status);
