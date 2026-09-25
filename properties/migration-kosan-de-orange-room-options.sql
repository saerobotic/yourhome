UPDATE properties
SET room_options = '[
  {"name":"Single Room","price":950000,"details":"Single bed - 1 orang; Kamar mandi luar; Kamar No. 2, 4, 5, 12, 15"},
  {"name":"Single Balkon","price":1000000,"details":"Single bed - 1 orang; Kamar mandi luar; Kamar No. 10, 13, 14"},
  {"name":"Superior Room","price":1250000,"details":"King bed atau twin beds - bisa 2 orang dengan tambahan Rp300.000; Kamar mandi luar; Kamar No. 1, 3, 6, 7, 8"},
  {"name":"Single Deluxe","price":1400000,"details":"Single bed - 1 orang; Kamar mandi dalam; Kamar No. 11"},
  {"name":"Superior Deluxe","price":1600000,"details":"King bed - bisa 2 orang dengan tambahan Rp300.000; Kamar mandi dalam; Kamar No. 9"}
]',
    updated_at = datetime('now')
WHERE id IN ('kosan-de-orange-kost', 'kos-de-orange');

UPDATE properties
SET description = 'Jl. Babakan Jeruk IV No. 11 A, Sukagalih, Kecamatan Sukajadi, Kota Bandung

FASILITAS:
Ruang tamu dan dapur umum; Kasur; Lemari; WiFi; Waterheater; Area parkir; Akses 24 jam.

CATATAN:
Belum termasuk deposit Rp500.000 yang dibayarkan satu kali dan dikembalikan saat check-out. Single untuk 1 orang. Superior bisa untuk 2 orang dengan tambahan Rp300.000 per bulan. Parkir mobil hanya tersedia untuk 2 mobil dengan biaya Rp150.000.',
  updated_at = datetime('now')
WHERE id IN ('kosan-de-orange-kost', 'kos-de-orange');
