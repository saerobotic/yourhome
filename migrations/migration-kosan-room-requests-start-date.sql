-- Tambah tanggal mulai sewa pada pengajuan kamar/penyewa baru (kosan.html, menu "Ajukan
-- Kamar/Penyewa Baru"). Dipakai saat approval untuk menandai periode sebelum tanggal ini
-- sebagai belum ditempati penyewa ini, dan periode sejak tanggal ini sebagai Belum Bayar,
-- supaya kamar bekas penyewa lama (checkout) yang dipakai ulang tidak menampilkan riwayat
-- penyewa sebelumnya sebagai milik penyewa baru.
-- Jalankan SATU KALI. ALTER TABLE ADD COLUMN bukan operasi idempotent di SQLite -- jangan
-- dijalankan dua kali pada database yang sama.
ALTER TABLE kosan_room_requests ADD COLUMN start_date TEXT NOT NULL DEFAULT '';
