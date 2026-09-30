# Prompt untuk AI di Excel — ekstraksi data 2023 (YOUR HOME)

Cara pakai:
1. Buka file ini, copy mulai baris "KONTEKS SISTEM" sampai baris "SELESAI PROMPT".
2. Kirim ke AI di Excel (boleh tanpa melampirkan dasbord.html).
3. Simpan jawabannya jadi `c:\xampp\htdocs\your_home\data-excel-2023.txt`.

Kalau workbook-nya TIDAK punya sheet 2023 (hanya ada 16 baris Nov–Des 2023
yang menempel di sheet 2024), ganti bagian nomor 7 menjadi:

7. Ambil HANYA baris dengan tanggal check-in antara 2023-11-01 sampai 2023-12-31.

---

KONTEKS SISTEM

Saya punya aplikasi dashboard bernama "YOUR HOME" untuk manajemen properti
(villa, apartemen, guest house, kosan).

Database (Cloudflare D1), tabel utama:
- properties         : daftar properti. Kode properti = kolom property_code.
                       Contoh kode yang sudah ada: SUD-07, SUD-11, SUD-18,
                       SUD-19, VAL-01, VAL-02, VX4, VX7, AWN, VAUR, GH-TBS.
- dashboard_bookings : daftar booking. Kolom: id, property_id, property_code,
                       guest, platform, status, checkin, checkout, nights,
                       amount, extra_bed_quantity, extra_bed_price,
                       cleaning_fee, platform_fee_pct, note.
- finance_entries    : pemasukan & pengeluaran. Kolom: kind ('income' atau
                       'expense'), category_id, category_name, property_id,
                       entry_date, amount, description, payee.

Aturan sistem yang harus kamu ikuti:
- Setiap booking otomatis menghasilkan satu baris pemasukan dengan
  category_id 'income-booking', dan entry_date = tanggal check-in.
- status booking hanya boleh salah satu dari: Inquiry, Confirmed,
  Checked-in, Checked-out, Cancelled.
  Untuk data historis pakai: Checked-out
- platform hanya boleh salah satu dari: Direct, Airbnb, Booking.com,
  Agoda, Tiket.com, Traveloka, Agen Offline, Website.
- nights dan amount wajib lebih besar dari 0. Booking bernilai 0 tidak
  bisa diterima sistem.

TUJUAN

Ubah data booking di sheet Excel ini menjadi teks siap impor. Hasilmu nanti
akan saya jadikan query ke database, jadi formatnya harus persis.

SUMBER KOLOM (sesuaikan sendiri kalau posisinya berbeda):
- Kolom B = Nama tamu
- Kolom C = Kode properti
- Kolom D = Tanggal check-in
- Kolom E = Tanggal check-out
- Kolom F = Jumlah malam
- Kolom G = Platform
- Kolom I = Total payment
- Kolom J = Harga per hari

FORMAT HASIL — satu blok teks, tanpa penjelasan di dalamnya:

Nama | Kode | Checkin | Checkout | Malam | Platform | TotalPayment | HargaPerHari

Aturan wajib:
1. Pemisah antar kolom: spasi, pipa, spasi ( " | " ).
2. Satu baris = satu booking. Tanpa header, tanpa penomoran, tanpa tanda
   kutip, tanpa simbol Rp, tanpa pemisah ribuan, tanpa desimal.
3. Tanggal wajib format YYYY-MM-DD. Kalau selnya bertipe tanggal, tulis
   sebagai teks biasa dalam format itu.
4. Malam = check-out dikurangi check-in. Kalau kolom malam kosong atau tidak
   cocok dengan tanggalnya, hitung dari tanggalnya.
5. Platform tulis salah satu dari daftar di atas.
   Yosan, WA, WhatsApp, telp, telepon, langsung = Direct.
6. Kode properti tulis kode katalog, pakai pemetaan ini:
   7 -> SUD-07, 11 -> SUD-11, 18 -> SUD-18, 19 -> SUD-19,
   AL1 -> VAL-01, AL2 -> VAL-02, X4 -> VX4, X7 -> VX7,
   AWN -> AWN, AUR -> VAUR, TBS -> GH-TBS.
   Kode yang tidak ada di peta: tulis apa adanya, jangan dikarang.
7. Ambil HANYA baris dengan tanggal check-in di tahun 2023
   (yaitu antara 2023-01-01 sampai 2023-12-31).
8. Lewati baris kosong, baris judul, dan baris rekap.

LARANGAN
- JANGAN menulis SQL, INSERT, CREATE, atau perintah database apa pun.
  Cukup teks dengan format di atas.
- JANGAN mengubah, menambah, atau menghapus isi sheet Excel.
- JANGAN mengarang data. Kalau ada sel kosong atau tidak jelas, lewati
  barisnya, lalu laporkan di bagian D.

RINGKASAN WAJIB di akhir jawaban (di luar blok teks):
A. Jumlah baris yang berhasil diekstrak
B. Total dari kolom TotalPayment
C. Jumlah baris per bulan dalam periode itu
D. Daftar baris yang dilewati beserta alasannya (nomor baris di Excel,
   nama tamu, dan apa yang kurang)
E. Daftar kode properti yang muncul tapi tidak ada di peta di atas

KALAU JAWABANNYA TERLALU PANJANG
Bagi menjadi beberapa bagian (Bagian 1, Bagian 2, dst). Format barisnya
harus tetap sama persis, dan jangan mengulang baris yang sudah dikirim.

--- SELESAI PROMPT — copy mulai dari baris "KONTEKS SISTEM" sampai atas ini ---
