-- Tabel check-in crew.
-- Jalankan satu kali pada D1 jika tabel `checkins` belum ada.
-- Migration ini memakai CREATE TABLE IF NOT EXISTS sehingga aman dijalankan
-- pada database yang sudah memiliki tabel ini (tidak menghapus data).

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  crew TEXT NOT NULL,
  unit TEXT NOT NULL,
  job_type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  accuracy REAL,
  selfie_url TEXT NOT NULL DEFAULT '',
  work_photo_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  work_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_work_date
  ON checkins(work_date);

CREATE INDEX IF NOT EXISTS idx_checkins_crew_work_date
  ON checkins(crew, work_date);
