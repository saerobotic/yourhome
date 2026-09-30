-- ============================================================
-- IMPORT BOOKING AGUSTUS 2026 DARI Book2.xlsx
-- Dibuat otomatis oleh tools/siapkan-import-book2.py
-- Jalankan di D1 Console, database: your-home-checkin
--
-- 128 booking | total Rp 245.046.913
-- Tanggal pemasukan = tanggal check-in (masuk bulan Agustus).
-- Semua INSERT idempoten: aman dijalankan ulang, tidak menggandakan data.
-- Penanda data: created_by = 'import-book2'.
-- ============================================================

-- 1) Pastikan properti tersedia. Yang belum ada dibuat sebagai Draft
--    (tampil di Dashboard untuk diedit, tidak muncul di website).
-- 7 -> SUD-07 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-sud-07', 'book2-sud-07', 'SUD-07', 'Lantai 7 Sudirman Suites', 'apartment', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'SUD-07' OR lower(trim(name)) = lower(trim('Lantai 7 Sudirman Suites')));
-- 11 -> SUD-11 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-sud-11', 'book2-sud-11', 'SUD-11', 'Lantai 11 Sudirman Suites', 'apartment', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'SUD-11' OR lower(trim(name)) = lower(trim('Lantai 11 Sudirman Suites')));
-- 18 -> SUD-18 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-sud-18', 'book2-sud-18', 'SUD-18', 'Lantai 18 Sudirman Suites', 'apartment', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'SUD-18' OR lower(trim(name)) = lower(trim('Lantai 18 Sudirman Suites')));
-- 19 -> SUD-19 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-sud-19', 'book2-sud-19', 'SUD-19', 'Lantai 19 Sudirman Suites', 'apartment', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'SUD-19' OR lower(trim(name)) = lower(trim('Lantai 19 Sudirman Suites')));
-- AL1 -> VAL-01 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-val-01', 'book2-val-01', 'VAL-01', 'Villa Alam 1', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VAL-01' OR lower(trim(name)) = lower(trim('Villa Alam 1')));
-- AL2 -> VAL-02 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-val-02', 'book2-val-02', 'VAL-02', 'Villa Alam 2', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VAL-02' OR lower(trim(name)) = lower(trim('Villa Alam 2')));
-- X4 -> VX4 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-vx4', 'book2-vx4', 'VX4', 'Villa X4', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VX4' OR lower(trim(name)) = lower(trim('Villa X4')));
-- X7 -> VX7 (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-vx7', 'book2-vx7', 'VX7', 'Villa X7', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VX7' OR lower(trim(name)) = lower(trim('Villa X7')));
-- AWN -> AWN (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-awn', 'book2-awn', 'AWN', 'Villa AWN', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'AWN' OR lower(trim(name)) = lower(trim('Villa AWN')));
-- AUR -> VAUR (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-vaur', 'book2-vaur', 'VAUR', 'Villa Aurum', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VAUR' OR lower(trim(name)) = lower(trim('Villa Aurum')));
-- TBS -> GH-TBS (dipetakan)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-gh-tbs', 'book2-gh-tbs', 'GH-TBS', 'Guest House Tatar Banyak Sumba', 'guesthouse', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'GH-TBS' OR lower(trim(name)) = lower(trim('Guest House Tatar Banyak Sumba')));
-- CSB -> CSB (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-csb', 'book2-csb', 'CSB', 'CSB - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'CSB' OR lower(trim(name)) = lower(trim('CSB - perlu dipetakan')));
-- CKB -> CKB (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-ckb', 'book2-ckb', 'CKB', 'CKB - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'CKB' OR lower(trim(name)) = lower(trim('CKB - perlu dipetakan')));
-- CZB -> CZB (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-czb', 'book2-czb', 'CZB', 'CZB - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'CZB' OR lower(trim(name)) = lower(trim('CZB - perlu dipetakan')));
-- VIB -> VIB (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-vib', 'book2-vib', 'VIB', 'VIB - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'VIB' OR lower(trim(name)) = lower(trim('VIB - perlu dipetakan')));
-- SMR -> SMR (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-smr', 'book2-smr', 'SMR', 'SMR - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'SMR' OR lower(trim(name)) = lower(trim('SMR - perlu dipetakan')));
-- GCA -> GCA (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-gca', 'book2-gca', 'GCA', 'GCA - perlu dipetakan', 'apartment', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'GCA' OR lower(trim(name)) = lower(trim('GCA - perlu dipetakan')));
-- Dago -> DAGO (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-dago', 'book2-dago', 'DAGO', 'DAGO - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'DAGO' OR lower(trim(name)) = lower(trim('DAGO - perlu dipetakan')));
-- HIB -> HIB (PERLU DIPETAKAN)
INSERT INTO properties (id, dashboard_id, property_code, name, category, location, price, weekday_price, weekend_price, beds, baths, guests, image_url, image_urls, map_query, map_link, map_embed, description, room_options, external_bookings, sort_order, active, publication_status, updated_at)
SELECT 'book2-hib', 'book2-hib', 'HIB', 'HIB - perlu dipetakan', 'villa', '', 0, 0, 0, 0, 0, 0, '', '[]', '', '', '', '', '[]', '[]', 0, 1, 'draft', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE property_code = 'HIB' OR lower(trim(name)) = lower(trim('HIB - perlu dipetakan')));

-- 2) Booking + pemasukan Booking-nya (tanggal pemasukan = check-in).
WITH v(id, lookup_code, lookup_name, guest, platform, checkin, checkout, nights, amount, note) AS (VALUES
  ('BK20260801-001', 'SUD-07', 'Lantai 7 Sudirman Suites', 'She Chien Hsin', 'Booking.com', '2026-08-01', '2026-08-03', 2, 1411986, 'Import Book2.xlsx baris 1'),
  ('BK20260801-002', 'CZB', 'CZB - perlu dipetakan', 'Devananada Karnaadisabda', 'Airbnb', '2026-08-01', '2026-08-02', 1, 1318030, 'Import Book2.xlsx baris 2'),
  ('BK20260801-003', 'VIB', 'VIB - perlu dipetakan', 'Amelia Yastari', 'Agoda', '2026-08-01', '2026-08-02', 1, 1166692, 'Import Book2.xlsx baris 3'),
  ('BK20260801-004', 'VX4', 'Villa X4', 'Syohibul Padillah', 'Agoda', '2026-08-01', '2026-08-02', 1, 1839660, 'Import Book2.xlsx baris 4'),
  ('BK20260801-005', 'CKB', 'CKB - perlu dipetakan', 'Ire Tanari', 'Airbnb', '2026-08-01', '2026-08-02', 1, 2670172, 'Import Book2.xlsx baris 5'),
  ('BK20260801-006', 'CSB', 'CSB - perlu dipetakan', 'Hendra Chia', 'Direct', '2026-08-01', '2026-08-02', 1, 4517975, 'Import Book2.xlsx baris 6'),
  ('BK20260801-007', 'VAL-01', 'Villa Alam 1', 'Septria Yola', 'Booking.com', '2026-08-01', '2026-08-02', 1, 1739400, 'Import Book2.xlsx baris 7'),
  ('BK20260801-008', 'VAL-02', 'Villa Alam 2', 'Tsaabitah Thifaal Aziizah', 'Airbnb', '2026-08-01', '2026-08-02', 1, 2659375, 'Import Book2.xlsx baris 8'),
  ('BK20260802-009', 'GCA', 'GCA - perlu dipetakan', 'Aditya Raffi', 'Airbnb', '2026-08-02', '2026-08-03', 1, 418943, 'Import Book2.xlsx baris 9'),
  ('BK20260802-010', 'CKB', 'CKB - perlu dipetakan', 'Rimba', 'Direct', '2026-08-02', '2026-08-03', 1, 2500000, 'Import Book2.xlsx baris 10'),
  ('BK20260803-011', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Nanda Putra', 'Airbnb', '2026-08-03', '2026-08-04', 1, 711622, 'Import Book2.xlsx baris 11'),
  ('BK20260804-012', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Nurfazzilah Nordin', 'Airbnb', '2026-08-04', '2026-08-06', 2, 1354711, 'Import Book2.xlsx baris 12'),
  ('BK20260804-013', 'GH-TBS', 'Guest House Tatar Banyak Sumba', 'Jill Prasetya', 'Airbnb', '2026-08-04', '2026-08-06', 2, 1873154, 'Import Book2.xlsx baris 13'),
  ('BK20260804-014', 'CSB', 'CSB - perlu dipetakan', 'Etin Etin', 'Direct', '2026-08-04', '2026-08-05', 1, 1400000, 'Import Book2.xlsx baris 14'),
  ('BK20260805-015', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Nimas Kusuma', 'Airbnb', '2026-08-05', '2026-08-07', 2, 782860, 'Import Book2.xlsx baris 15'),
  ('BK20260805-016', 'SUD-18', 'Lantai 18 Sudirman Suites', 'G Susanto Dony Gurniartono', 'Agoda', '2026-08-05', '2026-08-06', 1, 586547, 'Import Book2.xlsx baris 16'),
  ('BK20260805-017', 'CSB', 'CSB - perlu dipetakan', 'Etin Etin', 'Booking.com', '2026-08-05', '2026-08-07', 2, 2160000, 'Import Book2.xlsx baris 17'),
  ('BK20260807-018', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Clemens Bottcher', 'Booking.com', '2026-08-07', '2026-08-08', 1, 418300, 'Import Book2.xlsx baris 18'),
  ('BK20260807-019', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Hasya Sintya', 'Airbnb', '2026-08-07', '2026-08-09', 2, 887032, 'Import Book2.xlsx baris 19'),
  ('BK20260807-020', 'VX4', 'Villa X4', 'Sandy Ramadhan', 'Booking.com', '2026-08-07', '2026-08-08', 1, 1216656, 'Import Book2.xlsx baris 20'),
  ('BK20260807-021', 'CSB', 'CSB - perlu dipetakan', 'Etin Etin', 'Direct', '2026-08-07', '2026-08-08', 1, 1400000, 'Import Book2.xlsx baris 21'),
  ('BK20260807-022', 'SMR', 'SMR - perlu dipetakan', 'Tri Indah Susilowati', 'Airbnb', '2026-08-07', '2026-08-09', 2, 1819834, 'Import Book2.xlsx baris 22'),
  ('BK20260807-023', 'CZB', 'CZB - perlu dipetakan', 'Febri Wahyudi', 'Airbnb', '2026-08-07', '2026-08-09', 2, 2318260, 'Import Book2.xlsx baris 23'),
  ('BK20260807-024', 'VAL-01', 'Villa Alam 1', 'Predy Hamdani', 'Airbnb', '2026-08-07', '2026-08-09', 2, 4520938, 'Import Book2.xlsx baris 24'),
  ('BK20260807-025', 'VAL-01', 'Villa Alam 1', 'Siva', 'Direct', '2026-08-07', '2026-08-08', 1, 1708230, 'Import Book2.xlsx baris 25'),
  ('BK20260807-026', 'VAL-02', 'Villa Alam 2', 'Vallerie Cassandra', 'Airbnb', '2026-08-07', '2026-08-09', 2, 5318751, 'Import Book2.xlsx baris 26'),
  ('BK20260808-027', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Audris Vondrea', 'Airbnb', '2026-08-08', '2026-08-09', 1, 484185, 'Import Book2.xlsx baris 27'),
  ('BK20260808-028', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Jeany Meiliana', 'Booking.com', '2026-08-08', '2026-08-09', 1, 1052925, 'Import Book2.xlsx baris 28'),
  ('BK20260808-029', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Edward Yosua', 'Airbnb', '2026-08-08', '2026-08-09', 1, 794335, 'Import Book2.xlsx baris 29'),
  ('BK20260808-030', 'GCA', 'GCA - perlu dipetakan', 'Tommi Jayanegara', 'Airbnb', '2026-08-08', '2026-08-09', 1, 467540, 'Import Book2.xlsx baris 30'),
  ('BK20260808-031', 'VIB', 'VIB - perlu dipetakan', 'Natasya Lie', 'Agoda', '2026-08-08', '2026-08-09', 1, 1139685, 'Import Book2.xlsx baris 31'),
  ('BK20260808-032', 'CKB', 'CKB - perlu dipetakan', 'Syafira Dwi Septyanthi', 'Airbnb', '2026-08-08', '2026-08-09', 1, 2401055, 'Import Book2.xlsx baris 32'),
  ('BK20260808-033', 'VAL-01', 'Villa Alam 1', 'Rezaldy', 'Direct', '2026-08-08', '2026-08-09', 1, 1855491, 'Import Book2.xlsx baris 33'),
  ('BK20260809-034', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Rachel Rachel', 'Airbnb', '2026-08-09', '2026-08-11', 2, 1423246, 'Import Book2.xlsx baris 34'),
  ('BK20260809-035', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Indah Ayu', 'Airbnb', '2026-08-09', '2026-08-10', 1, 470110, 'Import Book2.xlsx baris 35'),
  ('BK20260809-036', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Muhammad Ovha', 'Airbnb', '2026-08-09', '2026-08-10', 1, 369500, 'Import Book2.xlsx baris 36'),
  ('BK20260809-037', 'VX7', 'Villa X7', 'Saddiya Rama Janna', 'Direct', '2026-08-09', '2026-08-10', 1, 1400000, 'Import Book2.xlsx baris 37'),
  ('BK20260811-038', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Ria Prisila', 'Booking.com', '2026-08-11', '2026-08-12', 1, 673360, 'Import Book2.xlsx baris 38'),
  ('BK20260811-039', 'GCA', 'GCA - perlu dipetakan', 'Riko Agustian', 'Airbnb', '2026-08-11', '2026-08-12', 1, 335154, 'Import Book2.xlsx baris 39'),
  ('BK20260811-040', 'VIB', 'VIB - perlu dipetakan', 'Rozza Rahadika', 'Agoda', '2026-08-11', '2026-08-12', 1, 899625, 'Import Book2.xlsx baris 40'),
  ('BK20260812-041', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Suwai Mat Sobree', 'Airbnb', '2026-08-12', '2026-08-15', 3, 1218629, 'Import Book2.xlsx baris 41'),
  ('BK20260812-042', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Winnusa Dhora', 'Direct', '2026-08-12', '2026-08-13', 1, 975000, 'Import Book2.xlsx baris 42'),
  ('BK20260812-043', 'GCA', 'GCA - perlu dipetakan', 'Riko Agustian', 'Direct', '2026-08-12', '2026-08-13', 1, 380000, 'Import Book2.xlsx baris 43'),
  ('BK20260813-044', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Winnusa Dhora', 'Booking.com', '2026-08-13', '2026-08-17', 4, 3994707, 'Import Book2.xlsx baris 44'),
  ('BK20260813-045', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Arab', 'Booking.com', '2026-08-13', '2026-08-14', 1, 741825, 'Import Book2.xlsx baris 45'),
  ('BK20260813-046', 'GCA', 'GCA - perlu dipetakan', 'Shanice Avriel', 'Airbnb', '2026-08-13', '2026-08-15', 2, 750745, 'Import Book2.xlsx baris 46'),
  ('BK20260813-047', 'GH-TBS', 'Guest House Tatar Banyak Sumba', 'Farhana Syihab', 'Airbnb', '2026-08-13', '2026-08-14', 1, 1112185, 'Import Book2.xlsx baris 47'),
  ('BK20260813-048', 'VAL-02', 'Villa Alam 2', 'Ica Melani', 'Booking.com', '2026-08-13', '2026-08-16', 3, 4216149, 'Import Book2.xlsx baris 48'),
  ('BK20260814-049', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Els Vikanza', 'Airbnb', '2026-08-14', '2026-08-16', 2, 887032, 'Import Book2.xlsx baris 49'),
  ('BK20260814-050', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Vika Mandasari', 'Airbnb', '2026-08-14', '2026-08-15', 1, 714902, 'Import Book2.xlsx baris 50'),
  ('BK20260814-051', 'VAL-01', 'Villa Alam 1', 'Daffa Tsany', 'Booking.com', '2026-08-14', '2026-08-15', 1, 1756728, 'Import Book2.xlsx baris 51'),
  ('BK20260814-052', 'CSB', 'CSB - perlu dipetakan', 'Yosan', 'Direct', '2026-08-14', '2026-08-15', 1, 670000, 'Import Book2.xlsx baris 52'),
  ('BK20260814-053', 'GH-TBS', 'Guest House Tatar Banyak Sumba', 'Farhana Syihab', 'Airbnb', '2026-08-14', '2026-08-17', 3, 3465335, 'Import Book2.xlsx baris 53'),
  ('BK20260814-054', 'SMR', 'SMR - perlu dipetakan', 'Ria Megasari', 'Agoda', '2026-08-14', '2026-08-16', 2, 1918880, 'Import Book2.xlsx baris 54'),
  ('BK20260815-055', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Zakkia Hayati', 'Airbnb', '2026-08-15', '2026-08-17', 2, 827197, 'Import Book2.xlsx baris 55'),
  ('BK20260815-056', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Meidiana Meimei', 'Airbnb', '2026-08-15', '2026-08-17', 2, 1324513, 'Import Book2.xlsx baris 56'),
  ('BK20260815-057', 'GCA', 'GCA - perlu dipetakan', 'Angelia Miswazudi', 'Airbnb', '2026-08-15', '2026-08-17', 2, 750745, 'Import Book2.xlsx baris 57'),
  ('BK20260815-058', 'VIB', 'VIB - perlu dipetakan', 'Nurman Sahri', 'Booking.com', '2026-08-15', '2026-08-16', 1, 1554422, 'Import Book2.xlsx baris 58'),
  ('BK20260815-059', 'VX4', 'Villa X4', 'Carolina Josephine', 'Agoda', '2026-08-15', '2026-08-16', 1, 1839660, 'Import Book2.xlsx baris 59'),
  ('BK20260815-060', 'VX4', 'Villa X4', 'Defy Aldi', 'Agoda', '2026-08-15', '2026-08-16', 1, 1563711, 'Import Book2.xlsx baris 60'),
  ('BK20260815-061', 'DAGO', 'DAGO - perlu dipetakan', 'Siska Amilatun Azizah', 'Agoda', '2026-08-15', '2026-08-17', 2, 1740962, 'Import Book2.xlsx baris 61'),
  ('BK20260815-062', 'VAL-01', 'Villa Alam 1', 'Angelia Suryani', 'Airbnb', '2026-08-15', '2026-08-17', 2, 4139750, 'Import Book2.xlsx baris 62'),
  ('BK20260815-063', 'CSB', 'CSB - perlu dipetakan', 'Anto', 'Direct', '2026-08-15', '2026-08-18', 3, 16462496, 'Import Book2.xlsx baris 63'),
  ('BK20260815-064', 'AWN', 'Villa AWN', 'Billie Setiawan', 'Airbnb', '2026-08-15', '2026-08-17', 2, 10281649, 'Import Book2.xlsx baris 64'),
  ('BK20260816-065', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Krisma Bella', 'Airbnb', '2026-08-16', '2026-08-18', 2, 846198, 'Import Book2.xlsx baris 65'),
  ('BK20260816-066', 'VIB', 'VIB - perlu dipetakan', 'Recia Dea Putri', 'Booking.com', '2026-08-16', '2026-08-17', 1, 1471745, 'Import Book2.xlsx baris 66'),
  ('BK20260816-067', 'VX7', 'Villa X7', 'Ayu Rahmah Dani', 'Airbnb', '2026-08-16', '2026-08-17', 1, 818925, 'Import Book2.xlsx baris 67'),
  ('BK20260816-068', 'HIB', 'HIB - perlu dipetakan', 'Supriyanto', 'Direct', '2026-08-16', '2026-08-17', 1, 1000000, 'Import Book2.xlsx baris 68'),
  ('BK20260816-069', 'VAL-02', 'Villa Alam 2', 'Sinta Devi', 'Airbnb', '2026-08-16', '2026-08-17', 1, 1821490, 'Import Book2.xlsx baris 69'),
  ('BK20260816-070', 'SMR', 'SMR - perlu dipetakan', 'Vellany Citra', 'Agoda', '2026-08-16', '2026-08-17', 1, 719380, 'Import Book2.xlsx baris 70'),
  ('BK20260817-071', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Marwansyah', 'Agoda', '2026-08-17', '2026-08-18', 1, 649562, 'Import Book2.xlsx baris 71'),
  ('BK20260817-072', 'VIB', 'VIB - perlu dipetakan', 'Rian Handip', 'Agoda', '2026-08-17', '2026-08-18', 1, 899625, 'Import Book2.xlsx baris 72'),
  ('BK20260817-073', 'DAGO', 'DAGO - perlu dipetakan', 'Herlan Lanher', 'Agoda', '2026-08-17', '2026-08-18', 1, 870481, 'Import Book2.xlsx baris 73'),
  ('BK20260817-074', 'SMR', 'SMR - perlu dipetakan', 'Ria Megasari', 'Booking.com', '2026-08-17', '2026-08-18', 1, 625173, 'Import Book2.xlsx baris 74'),
  ('BK20260818-075', 'SUD-18', 'Lantai 18 Sudirman Suites', 'China', 'Airbnb', '2026-08-18', '2026-08-20', 2, 884913, 'Import Book2.xlsx baris 75'),
  ('BK20260819-076', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Mega Suci Putri', 'Agoda', '2026-08-19', '2026-08-21', 2, 840690, 'Import Book2.xlsx baris 76'),
  ('BK20260819-077', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Ridha Hayatul', 'Airbnb', '2026-08-19', '2026-08-22', 3, 2149027, 'Import Book2.xlsx baris 77'),
  ('BK20260819-078', 'GCA', 'GCA - perlu dipetakan', 'Vanya Naura', 'Airbnb', '2026-08-19', '2026-08-20', 1, 335154, 'Import Book2.xlsx baris 78'),
  ('BK20260819-079', 'VIB', 'VIB - perlu dipetakan', 'Kireyna Prima', 'Agoda', '2026-08-19', '2026-08-21', 2, 1859225, 'Import Book2.xlsx baris 79'),
  ('BK20260820-080', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Elfarizanis Baharudin', 'Booking.com', '2026-08-20', '2026-08-22', 2, 1876823, 'Import Book2.xlsx baris 80'),
  ('BK20260821-081', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Matthew Bryan', 'Airbnb', '2026-08-21', '2026-08-24', 3, 1485839, 'Import Book2.xlsx baris 81'),
  ('BK20260821-082', 'SUD-18', 'Lantai 18 Sudirman Suites', 'John', 'Airbnb', '2026-08-21', '2026-08-22', 1, 471236, 'Import Book2.xlsx baris 82'),
  ('BK20260821-083', 'GCA', 'GCA - perlu dipetakan', 'Hasna Nadifah', 'Airbnb', '2026-08-21', '2026-08-23', 2, 1038978, 'Import Book2.xlsx baris 83'),
  ('BK20260821-084', 'VIB', 'VIB - perlu dipetakan', 'Sulistian Mindry', 'Agoda', '2026-08-21', '2026-08-22', 1, 1166692, 'Import Book2.xlsx baris 84'),
  ('BK20260821-085', 'CSB', 'CSB - perlu dipetakan', 'Rima Artha Afrilda', 'Airbnb', '2026-08-21', '2026-08-23', 2, 12451043, 'Import Book2.xlsx baris 85'),
  ('BK20260821-086', 'SMR', 'SMR - perlu dipetakan', 'Benny Taruna', 'Booking.com', '2026-08-21', '2026-08-22', 1, 1177200, 'Import Book2.xlsx baris 86'),
  ('BK20260822-087', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Damayanti Sekarsari', 'Booking.com', '2026-08-22', '2026-08-23', 1, 986741, 'Import Book2.xlsx baris 87'),
  ('BK20260822-088', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Reiza Rachmattullah', 'Airbnb', '2026-08-22', '2026-08-25', 3, 1317434, 'Import Book2.xlsx baris 88'),
  ('BK20260822-089', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Annisa Kant', 'Airbnb', '2026-08-22', '2026-08-23', 1, 794335, 'Import Book2.xlsx baris 89'),
  ('BK20260822-090', 'VIB', 'VIB - perlu dipetakan', 'Mahesa Adiputra', 'Airbnb', '2026-08-22', '2026-08-23', 1, 1166692, 'Import Book2.xlsx baris 90'),
  ('BK20260822-091', 'VX4', 'Villa X4', 'Evanita Siahaan', 'Airbnb', '2026-08-22', '2026-08-23', 1, 1713111, 'Import Book2.xlsx baris 91'),
  ('BK20260822-092', 'VAL-02', 'Villa Alam 2', 'Bernadeth Oktaviani', 'Booking.com', '2026-08-22', '2026-08-23', 1, 2464150, 'Import Book2.xlsx baris 92'),
  ('BK20260822-093', 'AWN', 'Villa AWN', 'Serlita Sari / Fhia Ghania', 'Direct', '2026-08-22', '2026-08-23', 1, 6300000, 'Import Book2.xlsx baris 93'),
  ('BK20260823-094', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Rara Anggraeni', 'Airbnb', '2026-08-23', '2026-08-24', 1, 575744, 'Import Book2.xlsx baris 94'),
  ('BK20260823-095', 'GCA', 'GCA - perlu dipetakan', 'Putri Oktovinanda', 'Airbnb', '2026-08-23', '2026-08-25', 2, 837885, 'Import Book2.xlsx baris 95'),
  ('BK20260823-096', 'VIB', 'VIB - perlu dipetakan', 'Rizka Maulida Nafi''ah', 'Agoda', '2026-08-23', '2026-08-24', 1, 959600, 'Import Book2.xlsx baris 96'),
  ('BK20260823-097', 'VAL-02', 'Villa Alam 2', 'Lie Susan', 'Airbnb', '2026-08-23', '2026-08-25', 2, 3096533, 'Import Book2.xlsx baris 97'),
  ('BK20260823-098', 'CKB', 'CKB - perlu dipetakan', 'Lila Cholilah', 'Airbnb', '2026-08-23', '2026-08-25', 2, 3697161, 'Import Book2.xlsx baris 98'),
  ('BK20260823-099', 'AWN', 'Villa AWN', 'Chaerul Umam', 'Airbnb', '2026-08-23', '2026-08-25', 2, 10619234, 'Import Book2.xlsx baris 99'),
  ('BK20260824-100', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Erika Pratiwi', 'Booking.com', '2026-08-24', '2026-08-25', 1, 548696, 'Import Book2.xlsx baris 100'),
  ('BK20260824-101', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Hesti', 'Direct', '2026-08-24', '2026-08-25', 1, 546845, 'Import Book2.xlsx baris 101'),
  ('BK20260824-102', 'DAGO', 'DAGO - perlu dipetakan', 'Zavira Thalita', 'Agoda', '2026-08-24', '2026-08-25', 1, 870481, 'Import Book2.xlsx baris 102'),
  ('BK20260825-103', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Lydia Juliana', 'Airbnb', '2026-08-25', '2026-08-27', 2, 940220, 'Import Book2.xlsx baris 103'),
  ('BK20260826-104', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Olivia Chairunissa', 'Airbnb', '2026-08-26', '2026-08-28', 2, 869844, 'Import Book2.xlsx baris 104'),
  ('BK20260826-105', 'GCA', 'GCA - perlu dipetakan', 'Matthew Leandro', 'Airbnb', '2026-08-26', '2026-08-30', 4, 1351342, 'Import Book2.xlsx baris 105'),
  ('BK20260826-106', 'DAGO', 'DAGO - perlu dipetakan', 'Eksir Anis', 'Booking.com', '2026-08-26', '2026-08-27', 1, 864000, 'Import Book2.xlsx baris 106'),
  ('BK20260827-107', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Jelsi Ratu Berlianne', 'Agoda', '2026-08-27', '2026-08-28', 1, 649562, 'Import Book2.xlsx baris 107'),
  ('BK20260827-108', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Fifin', 'Direct', '2026-08-27', '2026-08-28', 1, 421987, 'Import Book2.xlsx baris 108'),
  ('BK20260827-109', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Nura Azizah', 'Agoda', '2026-08-27', '2026-08-28', 1, 476087, 'Import Book2.xlsx baris 109'),
  ('BK20260828-110', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Marja Van Noort', 'Booking.com', '2026-08-28', '2026-09-01', 4, 1845192, 'Import Book2.xlsx baris 110'),
  ('BK20260828-111', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Cynthia Mudhita', 'Airbnb', '2026-08-28', '2026-08-30', 2, 740804, 'Import Book2.xlsx baris 111'),
  ('BK20260828-112', 'SUD-11', 'Lantai 11 Sudirman Suites', 'Ayu Nuraini', 'Airbnb', '2026-08-28', '2026-08-30', 2, 1676599, 'Import Book2.xlsx baris 112'),
  ('BK20260828-113', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Pravito Ananta', 'Airbnb', '2026-08-28', '2026-08-30', 2, 942472, 'Import Book2.xlsx baris 113'),
  ('BK20260828-114', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Ratna Yuli Herawaty', 'Airbnb', '2026-08-28', '2026-08-29', 1, 794335, 'Import Book2.xlsx baris 114'),
  ('BK20260828-115', 'CSB', 'CSB - perlu dipetakan', 'Fernandy FRBP Team', 'Direct', '2026-08-28', '2026-08-30', 2, 12100000, 'Import Book2.xlsx baris 115'),
  ('BK20260829-116', 'SUD-19', 'Lantai 19 Sudirman Suites', 'Maizaitul Akmal Salaiman', 'Airbnb', '2026-08-29', '2026-09-01', 3, 2149028, 'Import Book2.xlsx baris 116'),
  ('BK20260829-117', 'VIB', 'VIB - perlu dipetakan', 'Dwi Fajar Hariyanto', 'Agoda', '2026-08-29', '2026-08-30', 1, 1139685, 'Import Book2.xlsx baris 117'),
  ('BK20260829-118', 'VX4', 'Villa X4', 'Nadia Nabilla', 'Airbnb', '2026-08-29', '2026-08-30', 1, 1350420, 'Import Book2.xlsx baris 118'),
  ('BK20260829-119', 'VX7', 'Villa X7', 'Mo Saefurahman', 'Agoda', '2026-08-29', '2026-08-31', 2, 3039160, 'Import Book2.xlsx baris 119'),
  ('BK20260829-120', 'VAL-01', 'Villa Alam 1', 'Pitri Menia Lestari', 'Booking.com', '2026-08-29', '2026-08-30', 1, 1756728, 'Import Book2.xlsx baris 120'),
  ('BK20260829-121', 'VAL-02', 'Villa Alam 2', 'Dio Ahmad', 'Booking.com', '2026-08-29', '2026-08-30', 1, 2318882, 'Import Book2.xlsx baris 121'),
  ('BK20260829-122', 'VAUR', 'Villa Aurum', 'Tarmizi Haryono', 'Airbnb', '2026-08-29', '2026-08-30', 1, 6778493, 'Import Book2.xlsx baris 122'),
  ('BK20260829-123', 'DAGO', 'DAGO - perlu dipetakan', 'Tegar Setiawan', 'Booking.com', '2026-08-29', '2026-08-30', 1, 1152000, 'Import Book2.xlsx baris 123'),
  ('BK20260830-124', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Francisca Lutfia Wong', 'Airbnb', '2026-08-30', '2026-08-31', 1, 391430, 'Import Book2.xlsx baris 124'),
  ('BK20260830-125', 'SUD-18', 'Lantai 18 Sudirman Suites', 'Asia Muflihah', 'Airbnb', '2026-08-30', '2026-08-31', 1, 470110, 'Import Book2.xlsx baris 125'),
  ('BK20260830-126', 'VIB', 'VIB - perlu dipetakan', 'Fitri Candya Ayunda', 'Agoda', '2026-08-30', '2026-08-31', 1, 899625, 'Import Book2.xlsx baris 126'),
  ('BK20260830-127', 'VAL-02', 'Villa Alam 2', 'Riza Nur Sholihah', 'Airbnb', '2026-08-30', '2026-08-31', 1, 1741800, 'Import Book2.xlsx baris 127'),
  ('BK20260831-128', 'SUD-07', 'Lantai 7 Sudirman Suites', 'Erike', 'Airbnb', '2026-08-31', '2026-09-01', 1, 460506, 'Import Book2.xlsx baris 128')
),
mapped AS (
  SELECT v.id, v.guest, v.platform, v.checkin, v.checkout, v.nights, v.amount, v.note,
         (SELECT p.id FROM properties p
          WHERE p.property_code = v.lookup_code OR lower(trim(p.name)) = lower(trim(v.lookup_name))
          ORDER BY (p.property_code = v.lookup_code) DESC LIMIT 1) AS property_id
  FROM v)
INSERT OR IGNORE INTO dashboard_bookings (id, property_id, property_name, property_code, guest, platform, status, checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note, cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at)
SELECT m.id, p.id, p.name, p.property_code, m.guest, m.platform, 'Checked-out', m.checkin, m.checkout, m.nights, m.amount, 0, 0, 0, 0, m.note, '', 0, 'booking-income-' || m.id, 'import-book2', datetime('now'), datetime('now')
FROM mapped m JOIN properties p ON p.id = m.property_id;

-- 3) Pemasukan kategori Booking untuk setiap booking di atas.
INSERT OR IGNORE INTO finance_entries (id, kind, category_id, category_name, property_id, property_name, entry_date, amount, description, payee, recurrence, created_by, created_at)
SELECT b.income_entry_id, 'income', 'income-booking', 'Booking', b.property_id, b.property_name, b.checkin, b.amount, 'Booking ' || b.id || ' - ' || b.guest, b.platform, 'once', 'import-book2', b.created_at
FROM dashboard_bookings b WHERE b.created_by = 'import-book2';

-- 4) PEMERIKSAAN: jumlah harus 128 dan total harus Rp 245.046.913.
SELECT 'booking terimpor' AS pemeriksaan, COUNT(*) AS jumlah, SUM(amount) AS nilai FROM dashboard_bookings WHERE created_by = 'import-book2'
UNION ALL SELECT 'pemasukan Booking terimpor', COUNT(*), SUM(amount) FROM finance_entries WHERE created_by = 'import-book2' AND category_id = 'income-booking';

SELECT p.property_code AS kode, p.name AS properti, p.publication_status AS status, COUNT(b.id) AS booking, SUM(b.amount) AS nilai FROM dashboard_bookings b JOIN properties p ON p.id = b.property_id WHERE b.created_by = 'import-book2' GROUP BY p.id ORDER BY nilai DESC;
