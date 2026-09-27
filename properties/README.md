# Property data layout

Kategori properti dipisahkan menjadi empat folder:

- `apartemen/`
- `villa/`
- `guest-house/`
- `kosan/`

Website publik membaca properti berstatus aktif dari Cloudflare D1 melalui `GET /properties`.
Folder kategori dipakai untuk pengelompokan seed/aset lokal. Dashboard membuat properti berstatus Draft; Admin Properti hanya memperbarui detail listing melalui endpoint PATCH terbatas dan tidak dapat membuat atau menghapus properti.

Jalankan `schema.sql` sekali pada database D1 `your-home-checkin` sebelum memakai halaman admin properti.

Untuk menyimpan logo dan kontak website, jalankan `migration-site-settings.sql` pada database D1, lalu deploy ulang `worker-checkin-api.js`. Admin Properti menyediakan upload terpisah untuk Header, Footer, dan Dashboard; logo Dashboard disimpan dengan key `dashboard_logo` dan tidak mengubah logo situs publik.

Untuk daftar karyawan/crew, jalankan `migration-dashboard-crews.sql` satu kali pada D1 sebelum deploy Worker terbaru. Jika tabel `crews` sudah tersedia untuk Check In Crew, migration ini tidak mengubah data. Master/Admin mengelola nama dari **Dashboard → Pengaturan → Daftar Karyawan / Crew**; kru baru memerlukan PIN login 6 digit. Penghapusan menonaktifkan kru agar histori check-in tetap utuh. Check In Crew memuat nama aktif dari `GET /crews`.

Setelah tabel `crews` tersedia, jalankan `migration-crew-id.sql` satu kali. Migration ini menambahkan ID Crew unik dan memberi ID awal otomatis kepada crew lama. Di **Check In Crew Dashboard → Kelola Data Crew**, admin dapat menambah/mengubah nama, ID Crew, dan PIN 6 digit. Crew masuk dari halaman Check In memakai ID Crew dan PIN; histori tetap menampilkan nama crew.

## Dashboard finance dan akun

Jalankan `migration-dashboard-finance.sql` satu kali pada database D1 `your-home-checkin`. Migrasi ini menambahkan akun Master/Admin, kategori pemasukan/pengeluaran, dan ledger transaksi; tidak menghapus tabel atau data yang sudah ada.

Setelah migration finance, jalankan `migration-crew-expense-category.sql` satu kali. Migration ini membuat kategori `Fee untuk Crew` dan memindahkan transaksi honor check-in otomatis yang sudah tersimpan; kategori `Gaji` manual tidak diubah.

Setelah itu jalankan `migration-dashboard-it-account.sql` satu kali pada D1. Migrasi ini membuat tabel akun aktif dengan role Master, Admin, dan IT, lalu menyalin nama, email, status, serta hash password Master/Admin yang sudah ada. Tabel lama tidak dihapus.

Lalu jalankan `migration-dashboard-delete-pin.sql` satu kali. Migrasi ini menambah kolom hash PIN penghapusan ke akun dashboard.

Setelah migration finance, jalankan `migration-dashboard-bookings.sql` satu kali. Migrasi ini menyiapkan penyimpanan booking dan kategori finance untuk pemasukan booking serta refund pembatalan.

Jalankan `migration-dashboard-extra-bed.sql` satu kali setelah migration booking agar jumlah dan harga Extra Bed tersimpan di D1. Jalankan `migration-finance-proof.sql` satu kali setelah migration finance agar URL foto bukti pengeluaran tersimpan pada transaksi.

Jalankan `migration-dashboard-refund-net-income.sql` setelah migration finance, booking, dan Extra Bed. Migration ini menghitung ulang pemasukan booking batal dari nilai booking dan refund sumber, mengganti keterangannya agar tidak berulang, mengurangi Extra Bed jika refund melebihi nilai booking, dan menghapus entri pengeluaran refund duplikat. Migration ini aman dijalankan ulang untuk memperbaiki hasil sebelumnya.

Jalankan `migration-dashboard-owner-share.sql` satu kali pada D1 untuk menyimpan snapshot final bagi hasil per owner dan bulan. Menyimpan ulang owner/bulan yang sama memperbarui laporan sehingga final tetap dapat diedit. Endpoint dashboard menyediakan data ini untuk dipakai portal Owner saat portal tersebut tersedia.

Jalankan `migration-dashboard-management-data.sql` satu kali pada D1 sebelum deploy Worker/dashboard yang menyinkronkan daftar Owner dan pengaitan properti lintas browser. Setelah deploy, login pertama dari browser dan alamat lama yang memiliki perubahan Owner/properti lokal akan mengimpornya ke D1 dengan operasi insert-only; impor tidak menimpa data D1 yang sudah ada. Snapshot lokal yang hanya berisi data bawaan aplikasi tidak otomatis diimpor. Jika D1 kosong, buka browser dan alamat lama yang memuat data khusus terlebih dahulu; pada browser tanpa salinan khusus, jangan pilih inisialisasi manual kecuali datanya memang sumber yang benar. Sesudah D1 berisi data, semua browser membaca data kanonis dari D1 dan perubahan Master/Admin disinkronkan kembali. Jika nama properti diubah pada ID yang sama, Worker juga mengganti nama lama pada histori `checkins.unit` yang cocok agar histori crew mengikuti nama baru; jika nama lama dipakai oleh beberapa properti, pembaruan histori ambigu dilewati agar tidak mengubah catatan yang salah. Untuk memperbaiki check-in lama yang sudah tersimpan sebelum Worker rename ini dideploy, jalankan migrasi koreksi yang sesuai satu kali; misalnya `migration-rename-checkin-forest-heal.sql` memperbaiki ejaan Villa Forest Hill menjadi Villa Forest Heal. Dropdown Check In Crew memuat properti aktif melalui `GET /checkin/properties` dengan sesi crew; properti yang diarsipkan di Dashboard tidak muncul setelah daftar dimuat ulang. Tab Dokumentasi Saya memakai `GET /crew/checkins`, membaca riwayat hanya dari crew yang terikat pada token, dan memakai paginasi/filter bulan/properti; endpoint ini hanya-baca dan tidak menambah tabel atau menduplikasi check-in. Booking dan transaksi keuangan tetap menggunakan tabel D1 masing-masing.

Jalankan `migration-unified-property-catalog.sql` satu kali setelah `migration-dashboard-management-data.sql`. Migrasi menambahkan ID penghubung Dashboard, kode properti, dan status `draft`/`active`/`archived` ke tabel `properties`, memetakan nama unik yang cocok, dan mempertahankan properti arsip. Dashboard menjadi sumber pembuatan properti serta aksi arsip/pulihkan. Admin Properti mengedit detail listing dan menjadi satu-satunya tempat menyimpan Draft atau Publish; properti arsip dapat dipublikasikan kembali dari Admin Properti setelah detail wajib lengkap. Saat daftar Admin Properti dimuat, Worker merekonsiliasi properti Dashboard yang belum memiliki baris katalog agar Draft lama tetap muncul untuk dilengkapi. Draft tidak tampil pada website atau pilihan check-in Crew. Jangan jalankan ulang migrasi ini setelah berhasil.

Booking dari website maupun platform lain dicatat melalui **Dashboard → Booking**, dengan platform dan tanggal check-in/check-out yang sesuai. `GET /properties` menggabungkan booking yang belum dibatalkan ke rentang tanggal tidak tersedia; check-out bersifat eksklusif sehingga tanggal check-out otomatis tersedia lagi. Blokir manual lama pada `properties.external_bookings` tetap dihormati.

Jalankan `migration-auth-login-rate-limits.sql` satu kali sebelum deploy Worker yang menerapkan pembatas percobaan login. Tabel ini menyimpan HMAC alamat IP, bukan alamat IP mentah, dan counter direset setelah autentikasi sukses.

Deploy versi terbaru `worker-checkin-api.js` setelah dua belas migration dashboard: finance, kategori Fee untuk Crew, akun IT, PIN delete, booking, Extra Bed, bukti finance, refund net income, login rate limits, karyawan/crew, ID Crew, dan bagi hasil owner. Publikasikan juga versi terbaru `dasbord.html`, `admin-properti.html`, `index.html`, `check-in-crew.html`, dan `check-in-crew-dashboard.html` bersamaan dengan Worker. Halaman Check In meminta ID Crew; daftar nama dan ID hanya tersedia setelah admin login. Pada Cloudflare Worker `your-home-checkin-api`, atur secrets berikut di **Settings → Variables and Secrets**:

- `ADMIN_DASHBOARD_SECRET`: secret signing session yang sudah dipakai Worker. Jangan ganti bersamaan dengan password akun.
- `MASTER_INITIAL_PASSWORD`: password awal Master, minimal 12 karakter.
- `ADMIN_INITIAL_PASSWORD`: password awal Admin, minimal 12 karakter.
- `IT_INITIAL_PASSWORD`: password awal akun IT, minimal 12 karakter.

Akun Dashboard adalah Master (Andri Fernando), Admin, dan IT (IT Support). Saat login Master pertama setelah deploy, Worker menginisialisasi PIN hapus `1234` sebagai hash bersalt. Master perlu menggantinya segera dari **Profil Akun → PIN Persetujuan Delete**. Penghapusan transaksi oleh Admin membutuhkan PIN Master tersebut; IT tidak dapat menghapus transaksi. IT juga tidak dapat mengakses endpoint admin properti/sistem. Perubahan password normal dilakukan dari **Profil Akun → Ganti Password**.

Jika password perlu di-reset lewat Cloudflare, ubah secret akun yang sesuai, lalu jalankan satu perintah berikut di D1 Console. Ganti `master` menjadi `admin` bila yang di-reset akun Admin:

```sql
UPDATE dashboard_users
SET password_salt = '', password_hash = '', updated_at = datetime('now')
WHERE account_id = 'master';
```

Jalankan setelah ketiga migrasi selesai. Untuk mereset akun Admin atau IT, ganti nilai `account_id` menjadi `admin` atau `it`. Login sekali dengan password baru dari Worker secret agar hash baru tersimpan di D1. Setelah berhasil, secret awal boleh dihapus dari Worker. Jangan mengirim password melalui SQL atau menaruhnya di file HTML.

Frekuensi rutin pada ledger saat ini adalah penanda transaksi yang dicatat; sistem tidak membuat tagihan berulang otomatis. Setiap tagihan dimasukkan saat benar-benar dibayar. Jika kategori pengeluaran adalah Gaji, pilih nama karyawan dari daftar kru aktif; namanya disimpan pada kolom penerima transaksi.

Honor check-in crew otomatis direkonsiliasi sebagai beban owner kategori Fee untuk Crew, bukan pengeluaran kantor umum. Satu crew memperoleh total Rp100.000 per tanggal kerja, dibagi rata ke properti unik yang dikunjungi pada tanggal itu; sisa pembulatan rupiah dibagikan deterministik agar total tetap tepat Rp100.000. Keterangan transaksi menampilkan nama crew dan jenis pekerjaan (mis. `Aji Agung - Cleaning`) tanpa kata Gaji. Entri ditautkan ke properti D1 agar beban masuk ke rekap properti/owner dan memakai ID stabil agar refresh tidak menggandakan biaya. Check-in baru, edit, dan hapus memperbarui pembagian; dashboard Check In Crew melakukan rekonsiliasi awal untuk riwayat lama. Entri tersimpan untuk audit tetapi disembunyikan dari menu Pengeluaran umum; lihat pada laporan owner. Untuk mengoreksi nominal, edit atau hapus check-in sumbernya.

Login check-in memakai ID Crew dan PIN 6 digit. Worker menerbitkan sesi bertanda tangan berlaku 24 jam; submit check-in dan riwayat crew wajib membawa sesi ini. Crew hanya dapat membaca check-in miliknya, sedangkan daftar seluruh crew dan riwayat lengkap memerlukan sesi admin. Login crew, admin lama, dan dashboard dibatasi 10 percobaan per IP dalam 15 menit. CORS API mengizinkan `https://yourhome.id` serta origin XAMPP tepat `http://localhost` dan `http://127.0.0.1` (port lokal opsional); origin `null` dari `file://` tetap ditolak.

Booking dapat mencatat jumlah dan harga per Extra Bed. Subtotal Extra Bed dibuat sebagai transaksi pemasukan kategori Extra Bed terpisah dari nilai booking, tidak terkena platform fee, dan ikut diperhitungkan pada batas refund pembatalan.

Foto bukti pengeluaran dikonversi ke JPEG di browser dan dibatasi di bawah 100 KB, lalu disimpan di R2 dengan URL pada kolom `finance_entries.proof_url`. Pengeluaran manual dapat diedit dengan PIN Master 4 digit; perubahan bukti bersifat opsional dan mempertahankan foto yang ada bila tidak diganti.

Booking baru disimpan ke D1 dan otomatis membuat pemasukan berkategori Booking pada tanggal booking dicatat. Login Master/Admin pertama kali pada versi ini menyinkronkan booking lama dari browser ke D1; ID yang sama mencegah pemasukan dobel saat sinkronisasi ulang. Edit booking memperbarui pemasukan terkait tanpa mengubah tanggal transaksi. Cancel meminta alasan, nominal refund, dan PIN Master 4 digit; refund mengurangi pemasukan Booking, lalu Extra Bed bila refund melebihi nilai booking. Keterangan pemasukan menyimpan alasan dan nominal refund; refund tidak dicatat lagi sebagai pengeluaran agar tidak terhitung dua kali. Booking berstatus Cancelled dapat diedit dengan persetujuan PIN Master, status batal dan refund tetap dipertahankan.

## Owner Portal

Jalankan `migration-owner-portal-accounts.sql` satu kali pada D1 sebelum deploy Worker terbaru. Portal Owner hanya menampilkan laporan bagi hasil yang sudah final pada `dashboard_owner_share_calculations`; perhitungan tidak diulang di browser owner. Master atau Admin membuka **Dashboard → Owner → Akses Portal** untuk membuat atau mereset password owner. Bagikan ID Owner dan password minimal 12 karakter melalui kanal aman. Owner masuk dari `owner-portal.html` dan hanya dapat membaca laporan final miliknya. Login Owner dibatasi 10 percobaan per IP dalam 15 menit dan sesi berlaku 24 jam.

## Chat Internal Dashboard

Jalankan `migration-dashboard-staff-chat.sql` satu kali pada D1 sebelum deploy Worker terbaru. Setelah itu deploy `worker-checkin-api.js` dan publikasikan `dasbord.html`. Menu **Chat Internal** menyediakan satu ruang percakapan bersama untuk akun Dashboard Master, Admin, dan IT. Pesan tersimpan di D1, hanya dapat dibaca atau dikirim oleh sesi Dashboard yang valid, dan dibatasi maksimal 2.000 karakter per pesan. Tidak ada secret, domain, atau binding Cloudflare baru yang diperlukan.
