-- Kosan rooms migration - PART 0 of N: schema only. Jalankan file ini duluan.
CREATE TABLE IF NOT EXISTS kosan_rooms (
  id TEXT PRIMARY KEY,
  building TEXT NOT NULL,
  building_code TEXT NOT NULL DEFAULT '',
  room_number TEXT NOT NULL,
  room_label TEXT NOT NULL DEFAULT '',
  tenant_name TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  depo_amount INTEGER NOT NULL DEFAULT 0 CHECK (depo_amount >= 0),
  depo_refundable INTEGER NOT NULL DEFAULT 0 CHECK (depo_refundable IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant', 'checkout')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(building, room_number)
);

CREATE TABLE IF NOT EXISTS kosan_room_payments (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES kosan_rooms(id),
  period TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'checkout', 'none')),
  date TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(room_id, period)
);
CREATE INDEX IF NOT EXISTS idx_kosan_room_payments_room ON kosan_room_payments(room_id);

CREATE TABLE IF NOT EXISTS kosan_room_requests (
  id TEXT PRIMARY KEY,
  building TEXT NOT NULL,
  building_code TEXT NOT NULL DEFAULT '',
  room_number TEXT NOT NULL,
  tenant_name TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  depo INTEGER NOT NULL DEFAULT 0 CHECK (depo >= 0),
  status TEXT NOT NULL DEFAULT 'occupied' CHECK (status IN ('occupied', 'vacant', 'checkout')),
  notes TEXT NOT NULL DEFAULT '',
  decision_status TEXT NOT NULL DEFAULT 'pending' CHECK (decision_status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT NOT NULL DEFAULT '',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kosan_room_requests_status ON kosan_room_requests(decision_status);
