# Property data layout

Kategori properti dipisahkan menjadi empat folder:

- `apartemen/`
- `villa/`
- `guest-house/`
- `kosan/`

Website publik membaca data aktif dari Cloudflare D1 melalui `GET /properties`.
Folder kategori dipakai untuk pengelompokan seed/aset lokal; perubahan admin disimpan ke D1 melalui `POST /admin/properties`.

Jalankan `schema.sql` sekali pada database D1 `your-home-checkin` sebelum memakai halaman admin properti.
