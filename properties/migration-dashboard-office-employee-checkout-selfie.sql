-- Absen pulang kini juga mewajibkan selfie (sama seperti absen masuk), bukan GPS saja.
-- Kolom terpisah dari migration-dashboard-office-employee-checkout.sql karena migration
-- itu sudah dijalankan duluan tanpa kolom ini.
ALTER TABLE office_employee_attendance ADD COLUMN checkout_selfie_url TEXT;
