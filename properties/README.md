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

Untuk absen masuk selfie karyawan kantor di portal Admin, jalankan `migration-dashboard-office-employees.sql` satu kali pada D1. Daftar karyawan kantor terpisah dari Crew; hanya akun Master yang mengelola nama dari **Dasbord → Pengaturan → Karyawan Kantor**. Empat karyawan aktif pertama ditampilkan di portal. Worker menyimpan satu absen per karyawan per tanggal WIB ke D1 dan foto selfie ke R2. Untuk database baru, `schema.sql` sudah menyertakan tabel dan indeks yang sama. Jika `migration-dashboard-employee-attendance.sql` versi lama sudah dijalankan, biarkan tabel `employee_attendance_records` tetap ada; versi itu hanya tabel crew lama dan tidak lagi dipakai.

Setelah tabel `crews` tersedia, jalankan `migration-crew-id.sql` satu kali. Migration ini menambahkan ID Crew unik dan memberi ID awal otomatis kepada crew lama. Di **Check In Crew Dashboard → Kelola Data Crew**, admin dapat menambah/mengubah nama, ID Crew, dan PIN 6 digit. Crew masuk dari halaman Check In memakai ID Crew dan PIN; histori tetap menampilkan nama crew.

## Dashboard finance dan akun

Jalankan `migration-dashboard-finance.sql` satu kali pada database D1 `your-home-checkin`. Migrasi ini menambahkan akun Master/Admin, kategori pemasukan/pengeluaran, dan ledger transaksi; tidak menghapus tabel atau data yang sudah ada.

Setelah migration finance, jalankan `migration-crew-expense-category.sql` satu kali. Migration ini membuat kategori `Fee untuk Crew` dan memindahkan transaksi honor check-in otomatis yang sudah tersimpan; kategori `Gaji` manual tidak diubah.

Setelah itu jalankan `migration-dashboard-it-account.sql` satu kali pada D1. Migrasi ini membuat tabel akun aktif dengan role Master, Admin, dan IT, lalu menyalin nama, email, status, serta hash password Master/Admin yang sudah ada. Tabel lama tidak dihapus.

Lalu jalankan `migration-dashboard-delete-pin.sql` satu kali. Migrasi ini menambah kolom hash PIN penghapusan ke akun dashboard.

Untuk membuat lebih dari satu akun Admin, jalankan `migration-dashboard-multi-admin.sql` satu kali setelah migration akun IT dan PIN delete. Setelah Worker serta Dashboard terbaru dipublikasikan, Master membuka **Dashboard → Pengaturan → Tambah Admin**, menentukan nama awal dan password awal minimal 12 karakter. Worker membuat ID login otomatis (`admin-1`, `admin-2`, dan seterusnya); Admin dapat mengganti nama, email, dan passwordnya sendiri melalui **Profil Akun**.

Setelah migration finance, jalankan `migration-dashboard-bookings.sql` satu kali. Migrasi ini menyiapkan penyimpanan booking dan kategori finance untuk pemasukan booking serta refund pembatalan.

Jalankan `migration-dashboard-extra-bed.sql` satu kali setelah migration booking agar jumlah dan harga Extra Bed tersimpan di D1. Jalankan `migration-finance-proof.sql` satu kali setelah migration finance agar URL foto bukti pengeluaran tersimpan pada transaksi.

Jalankan `../migrations/migration-dashboard-guest-phone.sql` satu kali setelah migration booking agar nomor HP tamu yang booking tersimpan di D1. Berkas ini disimpan di folder `migrations/` pada root repo (bukan di `properties/`) supaya mudah terlihat di samping `worker-checkin-api.js`.

Jalankan `../migrations/migration-dashboard-partner-fee.sql` satu kali setelah migration booking. Migrasi ini menambah kolom nilai transaksi tamu (khusus catatan, bukan pemasukan kita) dan kategori finance `Fee Mitra` untuk properti dengan Tipe Kerja Sama "Mitra". Properti Mitra ditandai lewat field `managementType` pada data Owner/properti (tersimpan otomatis di `dashboard_management_data`, tidak perlu migration tabel terpisah); saat booking properti Mitra disimpan, nilai yang diinput sebagai "Fee Kita" tercatat sebagai pemasukan kategori Fee Mitra, bukan kategori Booking, sehingga tidak menggelembungkan omzet dengan uang milik Mitra.

Jalankan `migration-dashboard-refund-net-income.sql` setelah migration finance, booking, dan Extra Bed. Migration ini menghitung ulang pemasukan booking batal dari nilai booking dan refund sumber, mengganti keterangannya agar tidak berulang, mengurangi Extra Bed jika refund melebihi nilai booking, dan menghapus entri pengeluaran refund duplikat. Migration ini aman dijalankan ulang untuk memperbaiki hasil sebelumnya.

Jalankan `migration-dashboard-owner-share.sql` satu kali pada D1 untuk menyimpan snapshot final bagi hasil per owner dan bulan. Menyimpan ulang owner/bulan yang sama memperbarui laporan sehingga final tetap dapat diedit. Endpoint dashboard menyediakan data ini untuk dipakai portal Owner saat portal tersebut tersedia.

Jalankan `migration-dashboard-management-data.sql` satu kali pada D1 sebelum deploy Worker/dashboard yang menyinkronkan daftar Owner dan pengaitan properti lintas browser. Setelah deploy, login pertama dari browser dan alamat lama yang memiliki perubahan Owner/properti lokal akan mengimpornya ke D1 dengan operasi insert-only; impor tidak menimpa data D1 yang sudah ada. Snapshot lokal yang hanya berisi data bawaan aplikasi tidak otomatis diimpor. Jika D1 kosong, buka browser dan alamat lama yang memuat data khusus terlebih dahulu; pada browser tanpa salinan khusus, jangan pilih inisialisasi manual kecuali datanya memang sumber yang benar. Sesudah D1 berisi data, semua browser membaca data kanonis dari D1 dan perubahan Master/Admin disinkronkan kembali. Jika nama properti diubah pada ID yang sama, Worker juga mengganti nama lama pada histori `checkins.unit` yang cocok agar histori crew mengikuti nama baru; jika nama lama dipakai oleh beberapa properti, pembaruan histori ambigu dilewati agar tidak mengubah catatan yang salah. Untuk memperbaiki check-in lama yang sudah tersimpan sebelum Worker rename ini dideploy, jalankan migrasi koreksi yang sesuai satu kali; misalnya `migration-rename-checkin-forest-heal.sql` memperbaiki ejaan Villa Forest Hill menjadi Villa Forest Heal. Dropdown Check In Crew memuat properti aktif melalui `GET /checkin/properties` dengan sesi crew; properti yang diarsipkan di Dashboard tidak muncul setelah daftar dimuat ulang. Tab Dokumentasi Saya memakai `GET /crew/checkins`, membaca riwayat hanya dari crew yang terikat pada token, dan memakai paginasi/filter bulan/properti; endpoint ini hanya-baca dan tidak menambah tabel atau menduplikasi check-in. Booking dan transaksi keuangan tetap menggunakan tabel D1 masing-masing.

Jalankan `migration-unified-property-catalog.sql` satu kali setelah `migration-dashboard-management-data.sql`. Migrasi menambahkan ID penghubung Dashboard, kode properti, dan status `draft`/`active`/`archived` ke tabel `properties`, memetakan nama unik yang cocok, dan mempertahankan properti arsip. Dashboard menjadi sumber pembuatan properti serta aksi arsip/pulihkan. Admin Properti mengedit detail listing dan menjadi satu-satunya tempat menyimpan Draft atau Publish; properti arsip dapat dipublikasikan kembali dari Admin Properti setelah detail wajib lengkap. Saat daftar Admin Properti dimuat, Worker merekonsiliasi properti Dashboard yang belum memiliki baris katalog agar Draft lama tetap muncul untuk dilengkapi. Draft tidak tampil pada website atau pilihan check-in Crew. Jangan jalankan ulang migrasi ini setelah berhasil.

Booking dari website maupun platform lain dicatat melalui **Dashboard → Booking**, dengan platform dan tanggal check-in/check-out yang sesuai. `GET /properties` menggabungkan booking yang belum dibatalkan ke rentang tanggal tidak tersedia; check-out bersifat eksklusif sehingga tanggal check-out otomatis tersedia lagi. Blokir manual lama pada `properties.external_bookings` tetap dihormati.

Jalankan `migration-auth-login-rate-limits.sql` satu kali sebelum deploy Worker yang menerapkan pembatas percobaan login. Tabel ini menyimpan HMAC alamat IP, bukan alamat IP mentah, dan counter direset setelah autentikasi sukses.

Deploy versi terbaru `worker-checkin-api.js` setelah seluruh migration dashboard di atas dijalankan: finance, kategori Fee untuk Crew, akun IT, PIN delete, multi-Admin, booking, Extra Bed, nomor HP tamu, properti Mitra/Fee, bukti finance, refund net income, login rate limits, karyawan/crew, ID Crew, bagi hasil owner, data manajemen Owner/properti, katalog properti terpadu, akun Portal Owner, dan Chat internal staf. Publikasikan juga versi terbaru `dasbord.html`, `admin-properti.html`, `index.html`, `check-in-crew.html`, `check-in-crew-dashboard.html`, dan `owner-portal.html` bersamaan dengan Worker. Halaman Check In meminta ID Crew; daftar nama dan ID hanya tersedia setelah admin login.

Pastikan tabel `checkins` sudah ada sebelum deploy. Database baru yang dibuat dari `schema.sql` sudah memuat tabel ini beserta indeksnya. Untuk database lama yang belum memilikinya, jalankan `migration-checkins.sql` satu kali; karena memakai `CREATE TABLE IF NOT EXISTS`, migration ini aman dijalankan pada database yang sudah memiliki tabel tersebut dan tidak menghapus data.

Jangan menjalankan `migration-image-gallery.sql`, `migration-map-embed.sql`, `migration-external-bookings.sql`, `migration-contact-status.sql`, atau `migration-dashboard-finance-proof.sql` pada database baru: kolom yang ditambahkan file-file tersebut sudah dibuat oleh `schema.sql` atau `migration-finance-proof.sql`, sehingga akan gagal dengan `duplicate column name`. File-file itu hanya untuk database lama yang belum memiliki kolomnya. Jalankan cukup satu di antara `migration-finance-proof.sql` dan `migration-dashboard-finance-proof.sql`.

Pada Cloudflare Worker `your-home-checkin-api`, atur secrets berikut di **Settings → Variables and Secrets**:

- `ADMIN_DASHBOARD_SECRET`: secret signing session yang sudah dipakai Worker. Jangan ganti bersamaan dengan password akun.
- `MASTER_INITIAL_PASSWORD`: password awal Master, minimal 12 karakter.
- `ADMIN_INITIAL_PASSWORD`: password awal Admin, minimal 12 karakter.
- `IT_INITIAL_PASSWORD`: password awal akun IT, minimal 12 karakter.
- `ALLOW_DEV_IMPERSONATION` (opsional, default nonaktif): isi `1` hanya pada lingkungan uji untuk mengaktifkan login crew memakai nilai `DEV_IMPERSONATION_SECRET`. Biarkan kosong atau hapus pada produksi agar tidak ada jalur login crew tanpa PIN asli.

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

Jalankan `migrations/migration-dashboard-extra-bed-payment-status.sql` satu kali setelah migration Extra Bed agar status pembayaran Extra Bed (`extra_bed_payment_status`: `paid`/`pending`) tersimpan di D1. Saat Extra Bed dipilih "Bayar nanti (COD saat check-in)", booking tersebut ditandai `pending` dan muncul sebagai badge "Belum Dibayar" di Daftar Booking beserta tombol pengingat WhatsApp ke tamu; Worker juga menandai properti terkait pada `GET /checkin/properties` lewat `pending_extra_bed` supaya Crew yang membuka Check In Crew pada properti itu diingatkan menagih saat di lokasi. Status ini murni operasional (penagihan), bukan status akuntansi — pemasukan Extra Bed tetap dicatat seperti biasa saat booking dibuat.

Foto bukti pengeluaran dikonversi ke JPEG di browser dan dibatasi di bawah 100 KB, lalu disimpan di R2 dengan URL pada kolom `finance_entries.proof_url`. Pengeluaran manual dapat diedit dengan PIN Master 4 digit; perubahan bukti bersifat opsional dan mempertahankan foto yang ada bila tidak diganti.

Booking baru disimpan ke D1 dan otomatis membuat pemasukan berkategori Booking pada tanggal booking dicatat. Login Master/Admin pertama kali pada versi ini menyinkronkan booking lama dari browser ke D1; ID yang sama mencegah pemasukan dobel saat sinkronisasi ulang. Edit booking memperbarui pemasukan terkait tanpa mengubah tanggal transaksi. Cancel meminta alasan, nominal refund, dan PIN Master 4 digit; refund mengurangi pemasukan Booking, lalu Extra Bed bila refund melebihi nilai booking. Keterangan pemasukan menyimpan alasan dan nominal refund; refund tidak dicatat lagi sebagai pengeluaran agar tidak terhitung dua kali. Booking berstatus Cancelled dapat diedit dengan persetujuan PIN Master, status batal dan refund tetap dipertahankan.

## Owner Portal

Jalankan `migration-owner-portal-accounts.sql` satu kali pada D1 sebelum deploy Worker terbaru. Portal Owner hanya menampilkan laporan bagi hasil yang sudah final pada `dashboard_owner_share_calculations`; perhitungan tidak diulang di browser owner. Master atau Admin membuka **Dashboard → Owner → Akses Portal** untuk membuat atau mereset password owner. Bagikan ID Owner dan password minimal 12 karakter melalui kanal aman. Owner masuk dari `owner-portal.html` dan hanya dapat membaca laporan final miliknya. Login Owner dibatasi 10 percobaan per IP dalam 15 menit dan sesi berlaku 24 jam.

## Chat Internal Dashboard

Jalankan `migration-dashboard-staff-chat.sql` satu kali pada D1 sebelum deploy Worker terbaru. Setelah itu deploy `worker-checkin-api.js` dan publikasikan `dasbord.html`. Menu **Chat Internal** menyediakan satu ruang percakapan bersama untuk akun Dashboard Master, Admin, dan IT. Pesan tersimpan di D1, hanya dapat dibaca atau dikirim oleh sesi Dashboard yang valid, dan dibatasi maksimal 2.000 karakter per pesan. Tidak ada secret, domain, atau binding Cloudflare baru yang diperlukan.

## Kamar/Penyewa/Pembayaran Kos (kosan.html)

Jalankan `../migrations/migration-kosan-rooms.sql` satu kali pada D1 sebelum deploy Worker terbaru. Migrasi ini membuat tabel `kosan_rooms`, `kosan_room_payments`, dan `kosan_room_requests`, lalu mengisi 26 kamar dan 442 baris histori pembayaran (17 bulan, Maret 2025–Juli 2026) yang sebelumnya hanya berupa data statis di dalam `kosan.html` — tidak ada endpoint atau tabel untuk fitur ini sebelumnya, jadi Check-out, Tambah Kamar/Penyewa, dan antrean approval selama ini tidak benar-benar tersimpan. `INSERT OR IGNORE` dipakai untuk baris seed sehingga migrasi aman dijalankan ulang tanpa menimpa data yang sudah berubah. Setelah migrasi, deploy `worker-checkin-api.js` lalu publikasikan `kosan.html`; sebelum Worker terbaru dideploy, `kosan.html` akan menampilkan data kosong/gagal memuat dari `/kosan/rooms` karena endpointnya belum ada di Worker lama.

Periode billing (`KOSAN_PERIODS`, `KOSAN_CURRENT_PERIOD`) didefinisikan sebagai konstanta tetap di `worker-checkin-api.js`, harus selalu sinkron manual dengan `DATA.meta.periods`/`DATA.meta.current_period` di `kosan.html`. Saat periode bisnis maju ke bulan berikutnya, perbarui kedua tempat itu bersamaan.

### Profil penghuni & riwayat sewa (`migration-kosan-tenants.sql`)

Membuat `kosan_tenants` (profil permanen penghuni: biodata MOU, key foto KTP/foto diri di R2 prefix privat `kosan-identity/`) dan `kosan_stays` (satu baris per masa tinggal: kamar, harga, deposit, tanggal masuk/keluar, nomor MOU). Penghuni yang keluar lalu kembali, termasuk di kamar berbeda, cukup memakai profil lama + baris `kosan_stays` baru. Aman dijalankan ulang. Tabel ini belum dipakai Worker/`kosan.html` sampai endpoint dan UI-nya dibuat.

## Ganti Kode Properti (ganti-kode-properti.html)

Halaman login tersendiri (bukan tanpa login lagi): hanya akun Master dan `admin-1` (ditampilkan sebagai "Operasional" di sini maupun di Member Area, lihat `LOGIN_ACCOUNT_LABELS` pada `dasbord.html`) yang bisa masuk, memakai `/dashboard/login` yang sama dengan Member Area. Token disimpan di `sessionStorage` halaman ini (terpisah dari sesi Dashboard, hilang saat tab ditutup), dan dikirim sebagai `Authorization: Bearer` ke `GET`/`POST /property-codes`. Kedua endpoint ini memverifikasi token lewat `canEditPropertyCodes()` (account_id harus `master` atau `admin-1`) sebelum memproses — role Admin/IT lain tetap ditolak walau berhasil login. `GET /property-codes` menampilkan seluruh properti di katalog dengan kolom kode yang bisa diubah; kolom yang tidak disentuh tetap sama. Simpan lewat `POST /property-codes` (dibatasi rate limit `property-code-change`, reuse tabel `auth_login_attempts`), yang memvalidasi keunikan kode, memperbarui `properties.property_code`, ikut menyinkronkan field `code` di `dashboard_management_data` (agar tidak tertimpa balik saat Dashboard menyimpan ulang Owner/properti), lalu mengirim notifikasi Telegram berisi daftar perubahan ke chat IT yang sama dengan Contact IT/Lapor Bug. Tidak perlu migration baru — kolom `property_code` sudah ada di `properties`.

## Kritik & Saran Tamu (form-kritik-saran.html) + QR Stiker Properti

Jalankan `../migrations/migration-guest-feedback.sql` satu kali pada D1 sebelum deploy Worker terbaru. Migrasi ini membuat tabel `guest_feedback` untuk menyimpan submit dari `form-kritik-saran.html`; sebelumnya form ini tidak tersambung ke backend sama sekali (hanya `console.log`, tidak ada data yang benar-benar tersimpan). Setelah migrasi, deploy `worker-checkin-api.js`, lalu publikasikan `form-kritik-saran.html` (root situs utama) dan `admin_yourhome/admin-qr-kritik-saran.html` (folder `admin_yourhome`, deploy ke `admin.yourhome.id`) bersamaan.

`form-kritik-saran.html` sekarang memuat daftar properti aktif secara live dari `GET /properties` (katalog publik yang sama dengan website), bukan lagi daftar contoh yang di-hardcode. Domain di halaman ini sebelumnya salah ketik `youthome.id` — sudah diperbaiki menjadi `yourhome.id` di semua tautan dan email kontak (`hello@yourhome.id`, konsisten dengan `index.html`).

Halaman `admin_yourhome/admin-qr-kritik-saran.html` (login pakai akun Dashboard yang sama, `dashboard_admin_token`) dilink dari kartu **"QR Kritik & Saran"** di hub `admin_yourhome/index.html` (bukan dari `dasbord.html`). Isinya dua tab: **Generate QR** men-generate kode QR per properti aktif — bukan barcode 1D, karena tujuannya supaya kamera HP tamu bisa langsung membuka link form dengan properti sudah terisi otomatis (`form-kritik-saran.html?p=<nama properti>`), tanpa tamu perlu memilih dari dropdown; setiap kode QR digambar satu kanvas bersama nama properti kecil di bawahnya, sehingga hasil unduhan PNG atau cetak "Semua sebagai Stiker" sudah langsung siap tempel. Tab **Data Masukan Tamu** menampilkan daftar masukan dari `GET /admin/guest-feedback` dengan detail per entri.

Setelah `migration-guest-feedback.sql`, jalankan juga `migrations/migration-guest-feedback-status.sql` satu kali (memakai `ALTER TABLE ADD COLUMN`, jangan dijalankan dua kali). Migrasi ini menambah kolom `status` (`unread`/`read`, default `unread`) untuk lampu notifikasi di kartu "QR Kritik & Saran" pada hub: merah jika ada masukan yang belum dibaca (`GET /admin/guest-feedback/unread-count`), hijau jika sudah semua dibaca. Membuka detail satu masukan di tab "Data Masukan Tamu" otomatis menandainya `read` lewat `PATCH /admin/guest-feedback/{id}`.

## Key Room (password pintu smart lock + akses crew)

Jalankan `migrations/migration-key-room.sql` satu kali pada D1 sebelum deploy Worker terbaru. Migrasi ini membuat tabel `door_passwords` (password/kode smart lock per nama properti, disimpan sebagai teks biasa karena admin perlu membacanya kembali untuk dibagikan) dan `door_access_grants` (relasi crew ke properti yang boleh dia masuki). Setelah migrasi, deploy `worker-checkin-api.js`, lalu publikasikan `admin_yourhome/key-room.html` dan `admin_yourhome/index.html` bersamaan.

Halaman `admin_yourhome/key-room.html` (kartu **"Key Room"** di hub, login akun Dashboard yang sama) hanya bisa dibuka oleh role Master/Admin -- akun IT ditolak sepenuhnya baik di client maupun di endpoint (`GET/PUT/POST/DELETE /admin/key-room*` semua memakai `hasManagementRole`), karena datanya berupa kode fisik pintu properti. Password pintu disembunyikan (`••••••`) sampai admin klik "Tampilkan". Daftar crew diambil dari tabel `crews` yang sama dengan Check In Crew; menambah/menghapus grant akses tidak mengubah smart lock fisik itu sendiri -- halaman ini murni pencatatan siapa boleh tahu kode pintu mana, bukan integrasi API ke vendor smart lock tertentu.

Endpoint publik `POST /guest-feedback` dibatasi memakai mekanisme pembatas percobaan yang sama dengan login (`auth_login_attempts`, 10 kali per 15 menit per IP) untuk mencegah spam; tidak perlu migrasi tambahan selama `migration-auth-login-rate-limits.sql` sudah pernah dijalankan.

Check-out (tombol "🚪 Check-out Penyewa" di detail kamar) mengosongkan `tenant_name`, mengeset `status` ke `vacant`, mengeset `price` ke 0, dan menandai pembayaran periode berjalan berstatus `checkout` — semuanya tersimpan permanen ke `kosan_rooms`/`kosan_room_payments`, bukan lagi cuma di memori browser. Pengajuan kamar/penyewa baru dari **Tambah Kamar/Penyewa** masuk ke `kosan_room_requests` berstatus pending; Master/Admin menyetujui atau menolak dari antrean yang sama. Menyetujui pengajuan untuk nomor kamar yang sudah ada (mis. kamar bekas check-out disewa ulang) memperbarui baris kamar yang sama, bukan membuat duplikat. Belum ada fitur untuk mengedit harga/penyewa/status kamar yang sudah ada di luar alur checkout dan approval ini, dan matriks Pembayaran masih murni tampilan (tidak ada aksi tandai lunas dari UI).
