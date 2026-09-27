-- migration-dashboard-multi-admin.sql
--
-- Tujuan: mengizinkan lebih dari satu akun Admin (admin-1, admin-2, admin-3, ...)
-- dengan menghapus batas CHECK (account_id IN ('master','admin','it')).
--
-- Jalankan SEKALI pada D1, SETELAH migration-dashboard-it-account.sql dan
-- migration-dashboard-delete-pin.sql, karena kolom delete_pin_* disalin di sini.
--
-- PERHATIAN: migration ini MENGGANTI tabel dashboard_users secara utuh
-- (CREATE -> salin data -> DROP -> RENAME). Akun Master/Admin/IT beserta hash
-- password dan PIN ikut dipindahkan. Jangan dijalankan dua kali: eksekusi kedua
-- akan gagal pada baris CREATE TABLE karena tabel penampung sudah ada, dan
-- kegagalan itu terjadi sebelum DROP sehingga data lama tetap utuh.
--
-- Verifikasi setelah dijalankan:
--   SELECT account_id, display_name, role, active FROM dashboard_users ORDER BY account_id;
--   SELECT sql FROM sqlite_master WHERE name = 'dashboard_users';
--     -> pastikan tidak ada lagi CHECK (account_id IN ('master','admin','it'))

CREATE TABLE dashboard_users_multi_admin (
  account_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('Master', 'Admin', 'IT')),
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  delete_pin_salt TEXT NOT NULL DEFAULT '',
  delete_pin_hash TEXT NOT NULL DEFAULT '',
  delete_pin_must_change INTEGER NOT NULL DEFAULT 1 CHECK (delete_pin_must_change IN (0, 1))
);

INSERT INTO dashboard_users_multi_admin (
  account_id, display_name, email, role, password_salt, password_hash, active,
  created_at, updated_at, delete_pin_salt, delete_pin_hash, delete_pin_must_change
)
SELECT
  account_id, display_name, email, role, password_salt, password_hash, active,
  created_at, updated_at, delete_pin_salt, delete_pin_hash, delete_pin_must_change
FROM dashboard_users;

DROP TABLE dashboard_users;
ALTER TABLE dashboard_users_multi_admin RENAME TO dashboard_users;