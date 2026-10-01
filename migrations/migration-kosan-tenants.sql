-- Data penghuni kos (profil permanen) + riwayat sewa (satu baris per masa tinggal) + foto identitas.
-- Penghuni yang keluar lalu kembali (bisa di kamar berbeda) cukup dicari profilnya, lalu dibuat baris
-- kosan_stays baru; biodata dan foto KTP tidak perlu diisi ulang.
-- Aman dijalankan ulang: hanya memakai CREATE TABLE/INDEX IF NOT EXISTS.
-- Foto KTP & foto diri disimpan di R2 (bucket PHOTOS) dengan prefix privat "kosan-identity/";
-- tabel ini hanya menyimpan key-nya, bukan isi gambar.

CREATE TABLE IF NOT EXISTS kosan_tenants (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  nik TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birth_place_date TEXT NOT NULL DEFAULT '',
  origin_address TEXT NOT NULL DEFAULT '',
  bio_json TEXT NOT NULL DEFAULT '{}',
  ktp_photo_key TEXT NOT NULL DEFAULT '',
  selfie_photo_key TEXT NOT NULL DEFAULT '',
  selfie_taken_by TEXT NOT NULL DEFAULT '',
  photos_updated_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kosan_tenants_phone ON kosan_tenants(phone) WHERE phone <> '';
CREATE INDEX IF NOT EXISTS idx_kosan_tenants_name ON kosan_tenants(full_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS kosan_stays (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES kosan_tenants(id),
  room_id TEXT REFERENCES kosan_rooms(id),
  building TEXT NOT NULL,
  room_number TEXT NOT NULL,
  monthly_price INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  mou_number TEXT NOT NULL DEFAULT '',
  mou_signed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kosan_stays_tenant ON kosan_stays(tenant_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_kosan_stays_room ON kosan_stays(room_id, status);
-- Satu kamar hanya boleh punya satu masa sewa aktif.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kosan_stays_active_room ON kosan_stays(room_id) WHERE status = 'active' AND room_id IS NOT NULL;
