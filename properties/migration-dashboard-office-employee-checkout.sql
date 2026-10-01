-- Absen pulang untuk karyawan kantor: setelah absen masuk (selfie + GPS), karyawan
-- cukup klik nama yang sama lagi lalu ambil GPS saja (tanpa selfie, karena sudah pasti
-- di kantor) untuk mencatat jam pulang. Dashboard lalu bisa menghitung lama kerja dari
-- checked_in_at sampai checked_out_at. Aman dijalankan ulang (ALTER TABLE akan gagal
-- jika kolom sudah ada -- jalankan satu kali saja).
ALTER TABLE office_employee_attendance ADD COLUMN checked_out_at TEXT;
ALTER TABLE office_employee_attendance ADD COLUMN checkout_lat REAL;
ALTER TABLE office_employee_attendance ADD COLUMN checkout_lng REAL;
ALTER TABLE office_employee_attendance ADD COLUMN checkout_accuracy REAL;
