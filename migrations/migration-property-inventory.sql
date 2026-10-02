-- migration-property-inventory.sql
--
-- Tujuan: menu Inventaris di Dashboard (daftar barang per properti) dan checklist
-- kondisi barang yang diisi Crew dari lapangan pada momen tertentu (bukan tiap
-- kunjungan), misalnya saat checkout tamu atau cek berkala.
--
-- property_inventory_items  = master data barang per properti, dikelola Master/Admin.
-- property_inventory_checks = satu baris per sesi ceklis dari Crew; items_json menyimpan
--   snapshot nama+status tiap barang saat diceklis (JSON array), jadi riwayat tetap utuh
--   walau master barangnya diedit/dinonaktifkan belakangan. photo_urls_json menyimpan
--   foto dokumentasi masalah (opsional, tidak wajib per barang).
--
-- Aman dijalankan ulang (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS property_inventory_items (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  expected_qty INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_property_inventory_items_property ON property_inventory_items(property_id);

CREATE TABLE IF NOT EXISTS property_inventory_checks (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL DEFAULT '',
  property_name TEXT NOT NULL,
  crew TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]',
  photo_urls_json TEXT NOT NULL DEFAULT '[]',
  has_issues INTEGER NOT NULL DEFAULT 0 CHECK (has_issues IN (0, 1)),
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  resolved_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_property_inventory_checks_property ON property_inventory_checks(property_name);
