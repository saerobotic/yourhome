# YOUR HOME

Sistem manajemen dan pemasaran properti YOUR HOME. Proyek ini terdiri dari website publik, portal internal staf, portal laporan owner, serta Cloudflare Worker yang terhubung ke Cloudflare D1 dan R2.

## Struktur proyek

```text
your_home/
|- admin_yourhome/                 # Launcher/member area staf
|  |- index.html                   # 🔒 Login: ID Staf + password Dashboard
|  `- CNAME
|- owner_yourhome/                 # Portal laporan untuk pemilik
|  |- index.html                   # 🔒 Login: password Portal Owner + pilih owner
|  `- CNAME
|- yourhome/                       # Website utama dan aplikasi operasional
|  |- index.html                   # Website publik YOUR HOME (tanpa login)
|  |- dasbord.html                 # 🔒 Login: akun staf (Master/Admin/IT) + password
|  |- admin-properti.html          # 🔒 Login: akun staf + password
|  |- check-in-crew.html           # 🔒 Login: ID Crew + PIN 6 digit
|  |- check-in-crew-dashboard.html # 🔒 Login: akun staf + password (PIN Master untuk hapus data)
|  |- owner-portal.html            # 🔒 Login: ID Owner + password owner
|  |- navigasi312.html             # Halaman navigasi internal (tanpa login)
|  |- database.html                # Referensi data properti lokal (tanpa login)
|  |- worker-checkin-api.js        # Cloudflare Worker API
|  |- properties/                  # Skema, seed, dan migrasi D1
|  |  |- schema.sql
|  |  |- seed.sql
|  |  |- migration-*.sql
|  |  |- apartemen/
|  |  |- villa/
|  |  |- guest-house/
|  |  `- kosan/
|  `- CNAME
`- README.md
```

Halaman bertanda 🔒 memiliki pintu login (kata sandi atau PIN) sebelum konten dapat diakses. Kredensialnya dirangkum pada kolom **Login** di tabel berikut.

## Fungsi halaman

| Halaman | Fungsi | Login |
| --- | --- | --- |
| `yourhome/index.html` | Katalog dan halaman publik properti. | Tidak ada |
| `yourhome/dasbord.html` | Operasional: properti, booking, keuangan, owner, akun staf, dan chat internal. | 🔒 Akun staf (Master/Admin/IT) + password |
| `yourhome/admin-properti.html` | Melengkapi detail katalog, galeri, peta, logo, kontak, dan pesan IT. | 🔒 Akun staf + password |
| `yourhome/check-in-crew.html` | Login crew dengan ID Crew dan PIN untuk mencatat pekerjaan. | 🔒 ID Crew + PIN 6 digit |
| `yourhome/check-in-crew-dashboard.html` | Rekap check-in, honor, dan pengelolaan data crew. | 🔒 Akun staf + password; PIN Master untuk hapus permanen |
| `yourhome/owner-portal.html` | Laporan final khusus berdasarkan ID Owner dan password owner. | 🔒 ID Owner + password owner |
| `yourhome/navigasi312.html` | Halaman navigasi internal menuju halaman aplikasi. | Tidak ada |
| `yourhome/database.html` | Referensi data properti lokal. | Tidak ada |
| `owner_yourhome/index.html` | Portal laporan bersama yang memakai password Portal Owner dan pilihan owner. | 🔒 Password Portal Owner + pilihan owner |
| `admin_yourhome/index.html` | Launcher staf menuju halaman utama aplikasi. | 🔒 ID Staf + password Dashboard |

## Arsitektur

```text
Browser
  |- yourhome.id           -> yourhome/ (Cloudflare Pages)
  |- admin.yourhome.id     -> admin_yourhome/ (Cloudflare Pages)
  `- owner.yourhome.id     -> owner_yourhome/ (Cloudflare Pages)
                                  |
                                  v
             your-home-checkin-api.saerobotic.workers.dev
                                  |
                    |- D1: your-home-checkin
                    `- R2: PHOTOS
```

API Worker pada `yourhome/worker-checkin-api.js` menangani autentikasi, properti, booking, keuangan, check-in crew, laporan owner, pengaturan situs, dan penyimpanan foto. Foto disimpan melalui binding R2 `PHOTOS`; data aplikasi tersimpan di D1 `your-home-checkin`.

## Menjalankan lokal

1. Jalankan Apache melalui XAMPP.
2. Buka `http://localhost/your_home/yourhome/`.
3. Jangan membuka file HTML langsung dengan `file://`, karena Worker hanya menerima origin `http://localhost` atau `http://127.0.0.1` untuk pengembangan lokal.
4. Halaman tetap memanggil API produksi kecuali Worker dikonfigurasi ulang secara terpisah.

## Database dan migrasi

Skema awal tersedia di `yourhome/properties/schema.sql` dan data awal di `yourhome/properties/seed.sql`. Berkas `migration-*.sql` dipakai untuk database lama atau fitur yang ditambahkan setelah skema awal.

Panduan urutan migrasi, kondisi database baru/lama, akun awal, dan secret Worker tersedia di [yourhome/properties/README.md](yourhome/properties/README.md). Jalankan migrasi satu kali sesuai kondisi database; jangan mengulang migrasi destruktif `migration-dashboard-multi-admin.sql`.

Secret Worker dikelola di Cloudflare, bukan di HTML atau SQL. Konfigurasi produksi menggunakan D1 `your-home-checkin`, R2 binding `PHOTOS`, serta Worker `your-home-checkin-api`.

## Deploy Cloudflare

- `yourhome/` dipublikasikan ke `yourhome.id`.
- `admin_yourhome/` dipublikasikan ke `admin.yourhome.id`.
- `owner_yourhome/` dipublikasikan ke `owner.yourhome.id`.
- Deploy ulang `yourhome/worker-checkin-api.js` hanya ketika API Worker berubah.
- Jalankan migrasi D1 secara manual sebelum merilis perubahan Worker yang bergantung pada tabel atau kolom baru.

## Catatan pengembangan

- Seluruh teks antarmuka menggunakan bahasa Indonesia.
- Field password atau PIN harus mempunyai tombol tampilkan/sembunyikan password.
- Aksi hapus memerlukan dialog konfirmasi; penghapusan permanen juga memerlukan PIN Master.
- Jangan memasukkan password, token, atau secret ke dalam berkas statis.