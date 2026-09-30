# Setup Clerk untuk YOUR HOME — Panduan Dashboard (langkah demi langkah)

Panduan praktis mengerjakan **sisi Clerk** untuk migrasi login staf & owner.
Untuk konteks arsitektur dan urutan rilis, lihat [`rencana-migrasi-clerk.md`](rencana-migrasi-clerk.md).

> **⚠️ STATUS (2026-09-29): kode aplikasi sudah DIREVERT ke D1-only.**
> Tidak ada Clerk di `dasbord.html` maupun `admin_yourhome/index.html`. Panduan ini tetap
> berlaku penuh untuk setup di Clerk Dashboard, tetapi jangan menguji login dari aplikasi
> sampai patch Clerk diterapkan kembali.
>
> Tiga hal yang terverifikasi dari instance Anda dan **wajib dibetulkan lebih dulu**:
> sign-up masih **Open** (harus Invite-only), **Google masih aktif**, dan password minimum **15** karakter.

> **Ingat cakupannya:** Clerk hanya untuk **staf (Master/Admin/IT)**, **owner**
> (`owner-portal.html`), dan **Portal Owner** (`owner_yourhome/`).
> **Crew (ID Crew + PIN 6 digit)** dan **PIN Master 4 digit** **tetap di D1** —
> jangan dibuatkan akun Clerk, dan jangan pernah menaruh PIN di Clerk.

---

## Ringkasan: 4 nilai yang harus Anda kumpulkan

Kerjakan bagian A–D, lalu catat empat nilai ini. Semuanya dipakai di bagian G dan I.

| # | Nilai | Contoh | Taruh di mana |
| --- | --- | --- | --- |
| 1 | **Publishable key** | `pk_live_xxxx` | HTML (`data-clerk-publishable-key`) — bukan rahasia |
| 2 | **Secret key** | `sk_live_xxxx` | **Hanya** Worker secret, jangan di HTML/SQL/git |
| 3 | **Frontend API URL** | `https://clerk.yourhome.id` | HTML (URL script) + Worker `CLERK_ISSUER` |
| 4 | **PEM Public Key** | `-----BEGIN PUBLIC KEY-----…` | Opsional, verifikasi networkless |

---

## A. Buat akun & aplikasi Clerk

1. Buka <https://dashboard.clerk.com> dan daftar (bisa pakai Google/GitHub).
2. Pilih **Create application**.
3. Nama aplikasi: `YOUR HOME`.
4. Saat diminta memilih metode login, **jangan buru-buru lanjut** — lompat ke bagian B
   supaya setelannya benar sejak awal.

> Clerk otomatis membuat **Development instance** (kunci diawali `pk_test_`/`sk_test_`).
> Instance inilah yang dipakai untuk uji coba di `localhost`.
> Instance **Production** dibuat terpisah (bagian E) dan memakai kunci `pk_live_`/`sk_live_`.

## B. Aktifkan metode sign-in

Buka **User & Authentication → Email, phone, username**
(<https://dashboard.clerk.com/~/user-authentication/sign-up-sign-in-options>).

| Metode | Setelan | Alasan |
| --- | --- | --- |
| **Email address** | **Aktif**, jadikan identifier utama | Staf & owner login pakai email |
| **Username** | **Nonaktif** (default instance Anda) — tidak wajib | `staff_id` diambil dari `publicMetadata`, bukan username |
| **Password** | **Aktif** | Metode utama |
| Phone number / SMS | **Nonaktif** | Tidak dipakai (crew tetap di D1) |
| Social (Google dll.) | **Wajib Nonaktif** | Di instance Anda `oauth_google` masih aktif — matikan |

**Catatan Username.** Di instance Anda saat ini `username.enabled = false`, jadi login hanya
memakai **email**. Itu **tidak masalah**: kode di Worker membaca `staff_id` dari
`publicMetadata` (atau dari claim session token), bukan dari username Clerk. Jadi Anda
**tidak perlu** mengaktifkan Username — cukup isi `publicMetadata.staff_id` (bagian G).
Kalau nanti ingin login memakai ID Staf seperti dulu, aktifkan Username lalu set username
= `account_id` untuk setiap user.

**Catatan Password.** Instance Anda memakai panjang minimum **15 karakter** dan maksimum 72 —
bukan 8 seperti asumsi awal dokumen ini. Kalau staf keberatan, turunkan di
**User & Authentication → Password**, tapi jangan di bawah 8. PIN 6 digit **tidak** lewat
Clerk, jadi tidak ada alasan melemahkan password demi mengakomodasi PIN.

## C. Aktifkan mode Invite-only — **jangan dilewatkan**

Ini pengaman paling penting. Kalau dibiarkan default, **siapa pun bisa mendaftar** ke
instance Clerk Anda dan muncul sebagai user baru.

1. Buka **Access mode** (<https://dashboard.clerk.com/~/user-authentication/access-mode>).
2. Pilih **Invite-only** (nilai API: `restricted`), lalu **Save**.

Efeknya:

- Hanya user yang dibuat admin atau punya undangan valid yang bisa mendaftar.
- Komponen `<SignIn />` menyembunyikan tautan "Sign up" secara default.

**Kenapa ini krusial — kasus nyata yang sudah terjadi.** Selama masih **Open**, jika staf
mengetik email yang belum terdaftar, Clerk menganggapnya calon pendaftar dan mengarahkan ke
**Account Portal Clerk** di `https://<slug>.accounts.dev/sign-up`. Artinya user **keluar dari
aplikasi Anda** ke domain milik Clerk, bukan melihat pesan error di kartu login. Setelah
**Invite-only** aktif, Clerk tidak lagi menawarkan pendaftaran dan menampilkan pesan
"email tidak ditemukan" langsung di halaman Anda.

Jaring pengaman di sisi kode: `Clerk.mountSignIn(container, { signUpUrl: window.location.href })`.
Ini mencegah perpindahan ke Account Portal bila tautan Sign up sampai terklik. Ini hanya
jaring pengaman — perbaikan sebenarnya tetap **Invite-only**.

> **Jangan** memakai mode **Allowlist** untuk keperluan ini: allowlist hanya bisa diaktifkan
> saat mode **Open**, dan di production butuh paket berbayar. **Invite-only** lebih tepat
> untuk aplikasi internal dan tersedia tanpa biaya tambahan.

Langkah pengaman tambahan yang disarankan: **Protect → Rules**, aktifkan
*Block sign-ups that use disposable email addresses*.

## D. Ambil kunci dan URL

Buka **API keys** (<https://dashboard.clerk.com/~/api-keys>).

1. Di bagian **Quick Copy**, pilih **JavaScript** dari dropdown, lalu salin **kedua** tag
   `<script>`. Yang Anda butuhkan dari situ:
   - URL Frontend API (muncul di `src="https://<...>/npm/@clerk/..."`) → nilai #3
   - `data-clerk-publishable-key="pk_test_..."` → nilai #1
2. Salin **Secret key** → nilai #2.
3. Klik **Show JWT public key** → **PEM Public Key** → nilai #4 (salin termasuk baris
   `-----BEGIN PUBLIC KEY-----` dan `-----END PUBLIC KEY-----`).

> Kunci development: boleh dipakai di `localhost` saja. Untuk `yourhome.id` buat instance
> **Production** (bagian E) lalu ambil kunci `pk_live_`/`sk_live_` dari instance itu.

## E. Daftarkan domain (khusus instance Production)

1. Buat instance Production, lalu buka **Domains** (<https://dashboard.clerk.com/~/domains>).
2. Pilih salah satu:
   - **Pakai subdomain Clerk** (paling cepat): Clerk memberi `clerk.yourhome.id`. Tidak perlu
     DNS sendiri. Ini yang cocok dengan contoh `CLERK_ISSUER` di dokumen lain.
   - **Pakai domain sendiri**: ikuti instruksi CNAME dari Clerk di DNS Cloudflare Anda
     (mis. `clerk.yourhome.id` → target Clerk, proxy **DNS only**).
3. Tambahkan **allowed origins / domain aplikasi** agar Clerk JS boleh dimuat:
   - `https://yourhome.id`
   - `https://admin.yourhome.id`
   - `https://owner.yourhome.id`
   - `http://localhost` (untuk pengembangan)

Tanpa langkah 3, Clerk menolak memuat di domain tersebut dan halaman login akan kosong.

## F. Buat user staf

Buka **Users** (<https://dashboard.clerk.com/~/users>) → **Create user**.

Buat akun berikut. Gunakan **username yang sama persis** dengan `account_id` di tabel
`dashboard_users` — inilah yang membuat pemetaan otomatis berjalan sebelum migrasi kolom
`clerk_user_id` dikerjakan:

| Username Clerk | `account_id` di D1 | `publicMetadata.role` | Keterangan |
| --- | --- | --- | --- |
| `master` | `master` | `Master` | Akses penuh |
| `admin` | `admin` | `Admin` | |
| `admin-1`, `admin-2`, … | `admin-1`, `admin-2`, … | `Admin` | Pola wajib `admin-<angka>` |
| `it` | `it` | `IT` | Hanya chat IT & lihat data, tidak kelola |

Isi juga **Email** dan **Password** (minimal 8 karakter). Password ini diberikan sementara —
minta staf menggantinya setelah login pertama.

> **Owner belum di sini.** Akun owner (`O1`, `ANDRI01`, dst.) dibuat di **R5**, saat
> `owner-portal.html` dimigrasikan. Kalau dibuat sekarang tidak apa-apa, tapi belum terpakai.

> Aturan proyek yang dipertahankan: nama pegawai asli **tidak** ditampilkan sebelum login.
> Karena itu dropdown pilihan akun dihapus dari `dasbord.html` (R2) dan tidak digantikan
> apa pun di Clerk.

## G. Isi `publicMetadata` (role & ID)

Buka satu user → tab **Metadata** → bagian **Public** → isi JSON:

```json
{ "role": "Master", "staff_id": "master" }
```

Contoh lain:

```json
{ "role": "Admin", "staff_id": "admin-1" }
{ "role": "IT",    "staff_id": "it" }
```

Yang penting:

- **Hanya `publicMetadata`**, bukan `unsafeMetadata`. `unsafeMetadata` bisa diubah user dari
  browser, jadi tidak boleh dipakai untuk role.
- `publicMetadata` hanya bisa ditulis dari Dashboard atau Backend API — aman.
- Worker tetap menjadikan **role di D1 sebagai penentu akhir**. Kalau `role` di Clerk tidak
  cocok dengan `role` di `dashboard_users`, request ditolak. Jadi salah set di sini = ditolak,
  bukan jadi celah.
- Nama field: **`staff_id`** (dengan garis bawah). Itu yang dibaca Worker, dan nilainya harus
  sama dengan `account_id` di D1.

## H. Masukkan role ke session token

Supaya Worker tidak perlu memanggil Clerk untuk setiap request:

1. Buka **Sessions** (<https://dashboard.clerk.com/~/sessions>) → **Customize session token**.
2. Di editor **Claims**, isi:

```json
{
  "role": "{{user.public_metadata.role}}",
  "staff_id": "{{user.public_metadata.staff_id}}"
}
```

3. **Save**.

Catatan ukuran: batas aman custom claim adalah **1,2 KB**. Jangan masukkan seluruh
`{{user.public_metadata}}` — ambil per field seperti di atas.

Penting: kalau Anda mengubah `publicMetadata`, claim **belum** berubah sampai token
di-refresh. Kalau Staf baru login ulang, langsung terbawa.

> **Langkah ini opsional untuk R2.** Worker sudah dirancang tetap berjalan tanpa claim ini
> (fallback membaca `publicMetadata` dari token dan mencocokkan `account_id`). Menambahkannya
> hanya membuat otorisasi lebih cepat dan lebih tegas.

## I. Masukkan nilai ke Cloudflare Worker

Cloudflare Dashboard → **Workers & Pages** → `your-home-checkin-api` → **Settings** →
**Variables and Secrets**. Tambahkan:

| Nama | Jenis | Nilai |
| --- | --- | --- |
| `CLERK_ISSUER` | **Text** | Frontend API URL, ex: `https://clerk.yourhome.id` (tanpa garis miring di akhir) |
| `CLERK_AUTHORIZED_PARTIES` | **Text** | `https://yourhome.id,https://admin.yourhome.id,https://owner.yourhome.id` |

Lalu **Save and Deploy**.

Aturan penting:

- Keduanya **bukan** secret; Text sudah cukup.
- `CLERK_SECRET_KEY` **belum** dibutuhkan sekarang. Simpan sebagai **Secret** nanti
  hanya kalau Worker perlu memanggil Backend API Clerk (mis. membuat user otomatis).
  Jangan pernah menaruhnya di HTML, SQL, atau repo git.
- Selama `CLERK_ISSUER` kosong, jalur Clerk di Worker mati dan perilakunya sama seperti
  sebelum R1. Jadi tidak ada risiko kalau dikosongkan.

### I.1 Apakah `CLERK_SECRET_KEY` perlu disimpan?

**Tidak — untuk memverifikasi JWT.** Verifikasi tanda tangan memakai **public key (JWKS)**,
bukan secret key. Jadi `CLERK_ISSUER` + `CLERK_AUTHORIZED_PARTIES` sudah cukup, dan
`CLERK_SECRET_KEY` **tidak perlu** ada di Worker sama sekali. Ini justru lebih aman:
tidak ada kunci rahasia yang tersimpan sehingga tidak ada yang bisa bocor dari Worker.

`CLERK_SECRET_KEY` baru diperlukan kalau Worker memanggil **Backend API Clerk**, misalnya:

- mengambil data user yang **tidak** ada di session token (`getUser()`),
- membuat user otomatis atau mengirim undangan,
- menghapus user.

Untuk kebutuhan proyek ini, data user sudah ada di D1 (`dashboard_users`), jadi Backend API
belum dibutuhkan.

Kalau nanti memang perlu, simpan sebagai **Secret** (bukan Text), lewat salah satu cara:

**A. Cloudflare Dashboard — cara yang dipakai proyek ini**

1. Workers & Pages → `your-home-checkin-api` → **Settings** → **Variables and Secrets**.
2. **Add** → jenis **Secret** (bukan Text), nama `CLERK_SECRET_KEY`.
3. Tempel nilainya → **Save and Deploy**.
4. Setelah disimpan, nilainya **tidak bisa dibaca kembali** dari dashboard. Kalau lupa,
   harus ditimpa dengan nilai baru.

**B. Wrangler — kalau nanti proyek pindah ke `wrangler.toml`**

```bash
npx wrangler secret put CLERK_SECRET_KEY --name your-home-checkin-api
```

Perintah itu menanyakan nilainya lewat prompt, sehingga tidak masuk ke riwayat shell.
Cek daftar secret: `npx wrangler secret list`. Hapus: `npx wrangler secret delete CLERK_SECRET_KEY`.

> ⚠️ **Hindari** bentuk `echo "sk_xxx" | npx wrangler secret put ...` — nilainya ikut tercatat
> di riwayat shell.

Catatan: repo ini **belum punya** `wrangler.toml` dan di-deploy manual lewat dashboard,
jadi jalur **A** yang benar-benar dipakai.

> ⚠️ **Kalau `CLERK_SECRET_KEY` sempat bocor** (terkirim lewat chat/email, tersimpan di file,
> atau ter-commit ke git): buat kunci baru di Clerk Dashboard → **API keys** →
> **Rotate / Revoke**, lalu perbarui nilainya di Worker. Kunci lama harus dianggap mati.
> Karena verifikasi JWT tidak memakai secret key, memutar kunci ini tidak akan memutus
> login yang sudah berjalan.

> ⚠️ **Jangan pernah** menaruh secret key di HTML, SQL, atau dokumen di dalam repo. Semua file
> di bawah `yourhome/` ikut ter-publish ke Cloudflare Pages dan bisa dibaca siapa pun.

## J. Uji sebelum menyentuh produksi

1. Isi `<FRONTEND-API-URL>` dan `<PUBLISHABLE-KEY>` di
   `docs/contoh-clerk/dasbord-clerk-login.html`.
2. Buka `http://localhost/your_home/docs/contoh-clerk/dasbord-clerk-login.html`
   (lewat Apache XAMPP, **jangan** `file://`).
3. Login dengan user `master` yang dibuat di bagian F.

Hasil yang diharapkan:

| Tombol | Hasil bila setup benar |
| --- | --- |
| **Coba panggil API Worker** | 200 + data akun dari `/dashboard/profile`. **Ini menandakan R1 berhasil.** |
| **Lihat JWT Clerk** | JSON claims, ada `sub`, `iss`, dan `role`/`staff_id` bila bagian H dikerjakan |
| **Logout** | Kembali ke form login Clerk |

Kalau tombol API mengembalikan **401**, periksa berurutan:

1. `CLERK_ISSUER` sudah diisi dan Worker sudah di-**Save and Deploy**?
2. `username` Clerk sama persis dengan `account_id` di `dashboard_users`, dan `active = 1`?
3. `role` di `publicMetadata` cocok dengan `role` di D1?
4. Nilai `iss` di token sama dengan `CLERK_ISSUER` (garis miring di akhir ikut dihitung)?
5. Origin halaman ada di `CLERK_AUTHORIZED_PARTIES`?

## K. Checklist

- [ ] Aplikasi Clerk dibuat
- [ ] Email + Username + Password aktif; SMS/social nonaktif
- [ ] **Access mode = Invite-only**
- [ ] Domain + allowed origins terdaftar (localhost ikut)
- [ ] User `master`, `admin`, `admin-1`, `it` dibuat dengan username = `account_id`
- [ ] `publicMetadata` per user terisi (`role` + `staff_id`)
- [ ] Custom session token claims terisi (opsional tapi disarankan)
- [ ] `CLERK_ISSUER` + `CLERK_AUTHORIZED_PARTIES` tersimpan di Worker
- [ ] Halaman contoh berhasil login dan 200 dari `/dashboard/profile`
- [ ] Akun crew **tidak** dibuat di Clerk; PIN crew & PIN Master tetap di D1

---

## Lampiran: jalur CLI (opsional, untuk migrasi massal nanti)

Kalau nanti perlu membuat banyak akun sekaligus (mis. saat R5 membuat akun semua owner),
Clerk punya CLI yang menghilangkan kebutuhan menempelkan Secret Key secara manual:

```bash
npx clerk@latest env pull                       # menulis CLERK_SECRET_KEY ke file .env
npx clerk@latest api jwks                       # mengambil JWKS instance
npx clerk@latest users create --email staf@yourhome.id --first-name Admin --password 'PasswordKuat123' --yes
npx clerk@latest api users/<user_id>/metadata -X PATCH -d '{"public_metadata":{"role":"Admin","staff_id":"admin-1"}}'
npx clerk@latest config patch --json '{"session":{"claims":{"role":"{{user.public_metadata.role}}","staff_id":"{{user.public_metadata.staff_id}}"}}}'
```

Ini butuh Node.js di komputer Anda. Kalau tidak perlu massal, Dashboard sudah cukup.

---

## Referensi

- Quickstart JavaScript: <https://clerk.com/docs/quickstarts/javascript>
- Access mode / membatasi pendaftaran: <https://clerk.com/docs/guides/secure/restricting-access>
- User metadata: <https://clerk.com/docs/users/metadata>
- Session token & custom claims: <https://clerk.com/docs/guides/sessions/session-tokens>
- Manual JWT verification: <https://clerk.com/docs/guides/sessions/manual-jwt-verification>
- Membuat user: <https://clerk.com/docs/users/overview>
