-- Kosan rooms migration - PART 09: rooms De Sun #18, De Sun #19
INSERT OR IGNORE INTO kosan_rooms
  (id, building, building_code, room_number, room_label, tenant_name, price, depo_amount, depo_refundable, status, notes, created_at, updated_at)
VALUES
('room-0025', 'De Sun', 'SUN', '18', 'Kamar 18', 'Ajeng Apriliasari', 951437, 0, 0, 'occupied', '', datetime('now'), datetime('now')),
('room-0026', 'De Sun', 'SUN', '19', 'Kamar 19', '', 0, 0, 0, 'vacant', '', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO kosan_room_payments
  (id, room_id, period, label, status, date, updated_at)
VALUES
('room-0025-2025-03', 'room-0025', '2025-03', 'Maret 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2025-04', 'room-0025', '2025-04', 'April 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2025-05', 'room-0025', '2025-05', 'Mei 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2025-06', 'room-0025', '2025-06', 'Juni 2025', 'paid', '2025-05-31', datetime('now')),
('room-0025-2025-07', 'room-0025', '2025-07', 'Juli 2025', 'paid', '2026-06-29', datetime('now')),
('room-0025-2025-08', 'room-0025', '2025-08', 'Agustus 2025', 'paid', '2026-07-29', datetime('now')),
('room-0025-2025-09', 'room-0025', '2025-09', 'September 2025', 'paid', '2026-08-28', datetime('now')),
('room-0025-2025-10', 'room-0025', '2025-10', 'Oktober 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2025-11', 'room-0025', '2025-11', 'November 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2025-12', 'room-0025', '2025-12', 'Desember 2025', 'unpaid', NULL, datetime('now')),
('room-0025-2026-01', 'room-0025', '2026-01', 'Januari 2026', 'unpaid', NULL, datetime('now')),
('room-0025-2026-02', 'room-0025', '2026-02', 'Februari 2026', 'none', NULL, datetime('now')),
('room-0025-2026-03', 'room-0025', '2026-03', 'Maret 2026', 'none', NULL, datetime('now')),
('room-0025-2026-04', 'room-0025', '2026-04', 'April 2026', 'none', NULL, datetime('now')),
('room-0025-2026-05', 'room-0025', '2026-05', 'Mei 2026', 'none', NULL, datetime('now')),
('room-0025-2026-06', 'room-0025', '2026-06', 'Juni 2026', 'none', NULL, datetime('now')),
('room-0025-2026-07', 'room-0025', '2026-07', 'Juli 2026', 'none', NULL, datetime('now')),
('room-0026-2025-03', 'room-0026', '2025-03', 'Maret 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-04', 'room-0026', '2025-04', 'April 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-05', 'room-0026', '2025-05', 'Mei 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-06', 'room-0026', '2025-06', 'Juni 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-07', 'room-0026', '2025-07', 'Juli 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-08', 'room-0026', '2025-08', 'Agustus 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-09', 'room-0026', '2025-09', 'September 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-10', 'room-0026', '2025-10', 'Oktober 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-11', 'room-0026', '2025-11', 'November 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2025-12', 'room-0026', '2025-12', 'Desember 2025', 'unpaid', NULL, datetime('now')),
('room-0026-2026-01', 'room-0026', '2026-01', 'Januari 2026', 'unpaid', NULL, datetime('now')),
('room-0026-2026-02', 'room-0026', '2026-02', 'Februari 2026', 'none', NULL, datetime('now')),
('room-0026-2026-03', 'room-0026', '2026-03', 'Maret 2026', 'none', NULL, datetime('now')),
('room-0026-2026-04', 'room-0026', '2026-04', 'April 2026', 'none', NULL, datetime('now')),
('room-0026-2026-05', 'room-0026', '2026-05', 'Mei 2026', 'none', NULL, datetime('now')),
('room-0026-2026-06', 'room-0026', '2026-06', 'Juni 2026', 'none', NULL, datetime('now')),
('room-0026-2026-07', 'room-0026', '2026-07', 'Juli 2026', 'none', NULL, datetime('now'));
