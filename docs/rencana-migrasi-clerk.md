# Rencana Migrasi Autentikasi YOUR HOME ke Clerk

Dokumen ini adalah panduan bertahap untuk memindahkan login **staf dan owner** dari D1 ke **Clerk**.
Ditulis untuk proyek HTML + vanilla JavaScript + Cloudflare Worker
(yang saat ini belum memakai bundler/`wrangler.toml`).

> **⚠️ STATUS (2026-09-29): SELURUH KODE SUDAH DIREVERT KE D1-ONLY.**
> Patch Clerk (Worker R1, `dasbord.html` R2, `admin_yourhome/index.html` R4) sudah
> dikembalikan. Tidak ada kode Clerk yang aktif sekarang. Dokumen ini kini murni **rencana**.
> Semua catatan "SELESAI / DONE / sudah diterapkan" di bawah adalah **riwayat**, bukan kondisi saat ini.
>
> Urutan yang terbukti penting saat mencoba lagi:
> 1. Set **Access mode = Invite-only** di Clerk Dashboard **sebelum** menguji login.
> 2. Matikan social connection Google.
> 3. Buat user staf dan isi `publicMetadata` (`role`, `staff_id`).
> 4. Baru terapkan patch Worker, lalu frontend satu per satu.

> Status dokumen: Langkah 1 dan 2 sudah dirinci. Langkah 3–6 masih ringkas.
>
> **Keputusan final (2026-09-29):** Clerk hanya menangani login **staf (Master/Admin/IT)**,
> **owner** (`yourhome/owner-portal.html`), dan **Portal Owner** (`owner_yourhome/`).
> **Crew (ID Crew + PIN 6 digit)** dan **PIN Master 4 digit** **tetap di D1** — lihat bagian 0.4.

---

## 0. Prinsip yang wajib dipahami lebih dulu

### 0.1 Urutan migrasi: Worker DULU, frontend BELAKANGAN

Ini bagian paling penting. Login saat ini **bukan** proses lokal di browser:

```text
Browser  ──POST /dashboard/login {account_id, password}──►  Worker
                                                              │ cek password_salt + password_hash di D1
                                                              ▼
Browser  ◄──────────── { token } ────────────────────────────┘
Browser  ──Authorization: Bearer <token>──►  Worker (verifikasi signature HMAC)
```

Kalau `dasbord.html` diganti ke Clerk **sebelum** Worker bisa memverifikasi token Clerk,
maka dashboard langsung tidak bisa dipakai (401 untuk semua request).

Karena itu urutannya:

1. Worker ditambah bersama `verifyClerkToken()` yang bisa memverifikasi JWT Clerk
   **tanpa menghapus** verifikasi token lama (mode transisi dua token).
2. Frontend diubah ke Clerk, satu halaman per satu rilis.
3. Setelah semua halaman staf & owner pindah, verifikasi token lama dan kolom password
   staf/owner di D1 dihapus. **Kolom PIN (Master & crew) tetap dipakai.**

### 0.2 Pembagian tanggung jawab

| Bagian | Tanggung jawab |
| --- | --- |
| Clerk | Menyimpan kredensial (password, OTP), mengelola sesi, menerbitkan JWT, menyimpan metadata role. |
| Worker | **Satu-satunya** penentu otorisasi. Memverifikasi JWT Clerk, membaca `role` dari token, memutuskan boleh/tidak. |
| Frontend | Hanya untuk UX. Menyembunyikan tombol berdasarkan role **bukan** keamanan. |

`user.publicMetadata` bisa dibaca frontend, jadi role di browser **tidak boleh dipercaya**.
Worker tetap wajib memeriksa ulang.

### 0.3 Peta identitas lama → Clerk

| Halaman login lama | Kredensial lama | Identitas Clerk baru | `publicMetadata` |
| --- | --- | --- | --- |
| `admin_yourhome/index.html` | ID Staf + password Dashboard | satu user Clerk per staf | `{ "role":"Master"\|"Admin"\|"IT", "staff_id":"master" }` |
| `yourhome/dasbord.html` | akun staf + password | user yang sama | idem |
| `yourhome/admin-properti.html` | akun staf + password | user yang sama | idem |
| `yourhome/check-in-crew-dashboard.html` | akun staf + password | user yang sama | idem |
| `yourhome/owner-portal.html` | ID Owner + password owner | satu user Clerk per owner | `{ "role":"Owner", "owner_id":"O1" }` |
| `owner_yourhome/index.html` | password Portal Owner + pilih owner | satu user Clerk khusus portal | `{ "role":"OwnerPortal", "portal_access":true }` |
| `yourhome/check-in-crew.html` | ID Crew + PIN 6 digit | — | **Tetap di D1, tidak dipindah ke Clerk** (lihat 0.4b) |

Catatan: satu user Clerk bisa dipakai di beberapa halaman (contoh: user staf yang sama untuk
`dasbord.html`, `admin-properti.html`, dan `check-in-crew-dashboard.html`). Ini otomatis
memenuhi tujuan Anda nomor 4 — login sekali, dikenali di portal lain — **asal semua portal
berada di satu instance Clerk yang sama**.

### 0.4 Dua hal yang TETAP di D1 (tidak dimigrasikan ke Clerk)

**Keputusan: kedua kredensial di bawah tidak dipindah ke Clerk.** Clerk tidak menanganinya
sama sekali, jadi tidak ada akun crew di Clerk dan tidak ada pengganti PIN Master.

**(a) PIN Master 4 digit** untuk aksi hapus permanen/penghapusan.
Tetap tersimpan di `dashboard_users` (kolom `delete_pin_salt` / `delete_pin_hash`) dan tetap
diverifikasi Worker memakai `hashDashboardPassword()`, persis seperti sekarang.
Tidak ada reverification/step-up Clerk. Konvensi "permanen delete butuh PIN Master 4 digit"
tidak berubah.

**(b) PIN Crew 6 digit** untuk `yourhome/check-in-crew.html`.
Tetap tersimpan di tabel `crews` dan tetap diverifikasi Worker lewat endpoint `/crew/login`
yang ada sekarang. `check-in-crew.html` (dan offline queue `pending_checkins_v1`)
**tidak diubah sama sekali**.

Ringkasan pembagian:

| Kredensial | Lokasi setelah migrasi |
| --- | --- |
| Password staf (`dashboard_users.password_hash`) | Clerk |
| Password owner (`owners.password_hash`) | Clerk |
| Password Portal Owner (shared secret) | Clerk (`owner_yourhome/`) |
| **PIN Master 4 digit** | **D1 — tidak berubah** |
| **PIN Crew 6 digit** | **D1 — tidak berubah** |

### 0.5 Aturan proyek yang tetap berlaku setelah migrasi

- Semua teks antarmuka berbahasa Indonesia (Clerk mendukung lokalisasi `idID`).
- Field password tetap harus punya tombol tampilkan/sembunyikan. Pada komponen bawaan Clerk
  (`<SignIn />`) tombol ini sudah ada; kalau memakai custom flow, wajib Anda buat sendiri.
- Aksi hapus tetap butuh dialog konfirmasi.
- Jangan menaruh `CLERK_SECRET_KEY` di HTML/SQL. Hanya Publishable Key yang boleh di frontend.

---

## LANGKAH 1 — Instalasi Clerk untuk HTML + vanilla JavaScript

> 📋 **Panduan klik-demi-klik di Dashboard Clerk ada di [`setup-clerk.md`](setup-clerk.md)`**
> (buat aplikasi, aktifkan metode login, mode Invite-only, daftarkan domain, buat user staf,
> isi `publicMetadata`, custom session token, dan menaruh nilainya di Cloudflare Worker).
> Bagian di bawah ini menjelaskan sisi teknis/HTML-nya.

### 1.1 Buat aplikasi Clerk

1. Daftar/masuk ke <https://dashboard.clerk.com>.
2. **Create application** → beri nama `YOUR HOME`.
3. Aktifkan metode sign-in yang dibutuhkan pada **User & Authentication → Email, Phone, Username**:
   - **Email address** → aktifkan (wajib, untuk staff & owner).
   - **Username** → aktifkan (dipakai sebagai `staff_id` / `owner_id` bila mau).
   - **Password** → aktifkan.
   - Phone/SMS OTP → **tidak diperlukan** (crew tidak memakai Clerk).
4. Buka **API keys** (<https://dashboard.clerk.com/~/api-keys>), salin:
   - **Publishable key** → `pk_test_...` (development) / `pk_live_...` (production). **Aman di frontend.**
   - **Secret key** → `sk_test_...` / `sk_live_...`. **RAHASIA — hanya untuk Worker.**
   - **Show JWT public key → PEM Public Key** (`CLERK_PEM_PUBLIC_KEY`) → dipakai untuk verifikasi networkless.
5. Catat **Frontend API URL** Anda (muncul di halaman API keys / Domains), contoh:
   - development: `https://<slug>.clerk.accounts.dev`
   - production: `https://clerk.yourhome.id` (bisa memakai subdomain Clerk atau CNAME `clerk.` ke Clerk)

> Gunakan **instance production yang terpisah** untuk `yourhome.id`. Jangan pakai kunci
> development untuk situs yang sudah live.

### 1.2 Daftarkan domain Anda di Clerk

Di **Domains** / **Allowed origins**, tambahkan domain yang akan memuat Clerk JS:

- `https://yourhome.id`
- `https://admin.yourhome.id`
- `https://owner.yourhome.id`
- untuk pengembangan lokal: `http://localhost` dan `http://127.0.0.1`

Tanpa langkah ini, Clerk menolak memuat di domain tersebut (khusus instance production).

### 1.3 Memuat Clerk di HTML (tanpa bundler) — cara utama untuk proyek ini

Karena halaman Anda adalah HTML statis di Cloudflare Pages, cara paling praktis adalah
**`<script>` tag dari CDN**. Letakkan **sebelum** semua script yang memakai Clerk.

Clerk JS v6 membutuhkan **dua** bundle: UI bundle (`@clerk/ui`) dan SDK (`@clerk/clerk-js`).

```html
<!-- 1. Bundle UI Clerk -->
<script
  defer
  crossorigin="anonymous"
  src="https://<FRONTEND-API-URL>/npm/@clerk/ui@1/dist/ui.browser.js"
  type="text/javascript"
></script>

<!-- 2. SDK Clerk JS (global bernama `Clerk`) -->
<script
  defer
  crossorigin="anonymous"
  data-clerk-publishable-key="<PUBLISHABLE-KEY>"
  src="https://<FRONTEND-API-URL>/npm/@clerk/clerk-js@6/dist/clerk.browser.js"
  type="text/javascript"
></script>
```

Ganti `<FRONTEND-API-URL>` (tanpa `https://` di dalam path, sudah termasuk di URL) dan
`<PUBLISHABLE-KEY>` dengan milik Anda. Contoh nyata:

```html
<script defer crossorigin="anonymous"
  src="https://clerk.yourhome.id/npm/@clerk/ui@1/dist/ui.browser.js" type="text/javascript"></script>

<script defer crossorigin="anonymous"
  data-clerk-publishable-key="pk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
  src="https://clerk.yourhome.id/npm/@clerk/clerk-js@6/dist/clerk.browser.js"
  type="text/javascript"></script>
```

Catatan:
- Opsi Clerk yang ditulis sebagai atribut script tag **wajib** berawalan `data-clerk-`.
  Hanya tiga yang didukung: `data-clerk-publishable-key`, `data-clerk-proxy-url`, `data-clerk-domain`.
  Opsi lain diberikan ke `Clerk.load()`, bukan ke atribut.
- Alternatif CDN generik: `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js`.
  Konfigurasi `atob(publishableKey.split('_')[2])` untuk menurunkan domain FAPI juga bisa dipakai
  kalau Anda tidak ingin domain Clerk tampak di HTML.
- **Publishable key bukan rahasia.** Aman ikut ter-publish ke Pages.

### 1.4 Inisialisasi Clerk

```html
<script>
  window.addEventListener('load', async function () {
    await Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      localization: { locale: 'id-ID' }, // opsional: UI bahasa Indonesia
    });
    // ... lanjutkan logika login/logout di sini
  });
</script>
```

`Clerk.load()` wajib dipanggil sekali. Setelah itu tersedia `Clerk.isSignedIn`,
`Clerk.user`, `Clerk.session`, `Clerk.mountSignIn()`, `Clerk.signOut()`, dan seterusnya.

### 1.5 (Opsional) Kalau nanti memakai bundler

Kalau proyek berkembang memakai Vite/Webpack:

```bash
npm install @clerk/clerk-js
```

```js
import { Clerk } from '@clerk/clerk-js';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkDomain = atob(publishableKey.split('_')[2]).slice(0, -1);

await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.onload = resolve;
  script.onerror = () => reject(new Error('Gagal memuat bundle UI Clerk'));
  document.head.appendChild(script);
});

const clerk = new Clerk(publishableKey);
await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
```

**Belum diperlukan sekarang.** Semua halaman Anda masih HTML statis, jadi pakai cara 1.3.

### 1.6 Secret & konfigurasi di Cloudflare Worker

Tambahkan sebagai **Worker secret / variable** (Cloudflare Dashboard → Workers → Settings):

| Nama | Jenis | Contoh nilai | Kegunaan |
| --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | Secret | `sk_live_...` | Hanya jika Anda memakai Backend API Clerk (mis. `getUser`, membuat user). |
| `CLERK_PEM_PUBLIC_KEY` | Secret/Text | `-----BEGIN PUBLIC KEY-----...` | Verifikasi JWT **networkless** (disarankan, tanpa request ke Clerk). |
| `CLERK_ISSUER` | Text | `https://clerk.yourhome.id` | Memvalidasi claim `iss`. |
| `CLERK_AUTHORIZED_PARTIES` | Text | `https://yourhome.id,https://admin.yourhome.id,https://owner.yourhome.id,http://localhost` | Memvalidasi claim `azp` — **mencegah CSRF**. Wajib diisi. |

`CLERK_SECRET_KEY` **tidak boleh** masuk ke HTML/SQL/git.

### 1.7 Tambahan ke daftar CORS Worker

Daftar origin yang diizinkan Worker saat ini sudah berisi `https://yourhome.id`,
`https://admin.yourhome.id`, `https://owner.yourhome.id`, dan localhost — tidak ada perubahan
selama domain tetap sama. Kalau nanti Clerk memakai domain khusus (mis. `clerk.yourhome.id`),
CORS tetap tidak perlu diubah karena browser hanya memanggil API Worker dari domain halaman.

---

## LANGKAH 2 — Contoh implementasi Clerk Sign-In di `dasbord.html`

### 2.1 Kondisi kode saat ini (yang akan diganti)

| Bagian `dasbord.html` | Baris (perkiraan) | Isi |
| --- | --- | --- |
| Markup login | `<main id="adminLoginScreen">` | Dropdown ID Akun + input password + status + tombol Masuk |
| Sesi | `DASHBOARD_SESSION_KEY`, `readDashboardSession()`, `applyDashboardSession()`, `getDashboardToken()` | Simpan token Worker + `expiresAt` di `localStorage` |
| Pengiriman token | `dashboardApi()` | `headers.Authorization = 'Bearer ' + token` |
| Login | `loginDashboard()` | `POST /dashboard/login {account_id, password}` |
| Opsi akun | `loadLoginAccountOptions()` | `GET /dashboard/login-accounts` |
| Masuk otomatis | `initializeDashboardAuth()` | Cek sesi `localStorage` → `GET /dashboard/profile` |
| Logout | `logoutDashboard()` | Hapus `localStorage` |

Yang **berubah**: password tidak lagi dikirim ke Worker; token yang dikirim adalah
**JWT Clerk**. Yang **tidak berubah**: `dashboardApi()` dan seluruh pemanggilan API dashboard —
hanya sumber tokennya yang berbeda. Ini membuat migrasi `dasbord.html` relatif kecil.

### 2.2 Perubahan di `<head>`

Tambahkan dua script Clerk **sebelum** script dashboard yang ada:

```html
<!-- Clerk: UI bundle + SDK -->
<script defer crossorigin="anonymous"
  src="https://clerk.yourhome.id/npm/@clerk/ui@1/dist/ui.browser.js" type="text/javascript"></script>
<script defer crossorigin="anonymous"
  data-clerk-publishable-key="pk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
  src="https://clerk.yourhome.id/npm/@clerk/clerk-js@6/dist/clerk.browser.js" type="text/javascript"></script>
```

### 2.3 Perubahan markup layar login

Ganti isi `<form id="dashboardLoginForm">…</form>` (dropdown akun + password + tombol Masuk)
dengan container Clerk:

```html
<main id="adminLoginScreen" class="min-h-screen flex items-center justify-center p-4 bg-slate-100">
  <section class="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8">
    <div class="mb-6">
      <img id="dashboardLoginLogo" alt="YOUR HOME" class="hidden mx-auto w-48 max-h-16 object-contain mb-5">
      <p class="text-xs font-bold uppercase tracking-wider text-brand-600">YOUR HOME · Dashboard</p>
      <h1 class="text-2xl font-extrabold text-slate-900 mt-2">Dasbord Management</h1>
      <p class="text-sm text-slate-500 mt-1">Masuk dengan akun staf Anda.</p>
    </div>

    <!-- Clerk merender form sign-in di sini -->
    <div id="dashboardClerkSignIn"></div>

    <!-- Menu akun Clerk (avatar + logout) -->
    <div id="dashboardClerkUser" class="mt-4 hidden justify-center"></div>

    <p id="dashboardLoginStatus" class="text-sm min-h-5 mt-3" role="status" aria-live="polite"></p>
  </section>
</main>
```

Yang **dihapus** dari markup: `<select id="dashboardLoginAccount">`,
`<input id="dashboardLoginPassword">`, tombol `#dashboardLoginButton`, dan teks
"Sesi berlaku 1 hari atau sampai logout." Sekaligus hilang kebutuhan tombol
tampilkan/sembunyikan password — sudah ditangani Clerk.

### 2.4 Perubahan JavaScript

Ganti blok sesi lama. Ringkasnya:

```js
const CLERK_ALLOWED_ROLES = ['Master', 'Admin', 'IT']; // role yang boleh membuka dashboard

// Token sekarang selalu diambil segar dari Clerk, bukan dari localStorage.
async function getDashboardToken() {
  if (!window.Clerk?.session) return '';
  return await Clerk.session.getToken(); // JWT Clerk, masa berlaku pendek
}
```

`applyDashboardSession()` dan `readDashboardSession()` **dihapus** (tidak ada lagi
token jangka panjang di `localStorage`), begitu juga `sessionExpiryTimer` dan
`localStorage.removeItem(DASHBOARD_SESSION_KEY)` di dalam `dashboardApi()`.

Fungsi login diganti total:

```js
async function loginDashboardClerk() {
  // Tidak ada password yang dikirim ke Worker.
  const role = Clerk.user?.publicMetadata?.role || '';
  if (!CLERK_ALLOWED_ROLES.includes(role)) {
    await Clerk.signOut();
    showDashboardLogin('Akun ini tidak memiliki akses dashboard.');
    return;
  }

  const token = await getDashboardToken();
  const result = await dashboardApi('/dashboard/profile', { token });

  await loadDashboardManagementData();
  updatePropertyCounts();
  document.getElementById('bookingNavCount').textContent = BOOKINGS.length;
  populatePropSelects();
  try { await loadBookingData(result.data); } catch (e) { showToast(`Booking belum siap: ${e.message}`); }
  try { await loadCrewMembers(); }           catch (e) { showToast(`Daftar karyawan belum siap: ${e.message}`); }
  try { await loadFinanceData(); }           catch (e) { if (!await getDashboardToken()) throw e; showToast(`Finance belum siap: ${e.message}`); }

  showDashboardApp(result.data);
  renderDashboard();
}
```

`currentDashboardAccount` / `updateAccountDisplay()` sekarang mengisi
`display_name` dan `role` dari data yang dikembalikan Worker (`/dashboard/profile`),
**bukan** dari hasil login. Jadi Worker harus tetap mengembalikan bentuk objek akun yang sama
(`account_id`, `display_name`, `role`) — diambil dengan mencocokkan
`clerk_user_id` ke tabel `dashboard_users`, bukan lagi dari password.

`initializeDashboardAuth()` menjadi:

```js
async function initializeDashboardAuth() {
  if (!Clerk.isSignedIn) { showDashboardLogin(); return; }
  try {
    await loginDashboardClerk();
  } catch (error) {
    await Clerk.signOut();
    showDashboardLogin(error.message || 'Silakan login kembali.');
  }
}
```

`logoutDashboard()` menjadi:

```js
async function logoutDashboard() {
  await Clerk.signOut();          // Clerk yang menghapus sesi
  currentDashboardAccount = null;
  showDashboardLogin('Anda sudah logout.');
  window.scrollTo({ top: 0, behavior: 'auto' });
}
```

Bagian inisialisasi paling bawah (yang saat ini mendaftarkan
`dashboardLoginForm.addEventListener('submit', loginDashboard)`) diganti menjadi:

```js
window.addEventListener('load', async function () {
  await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });

  const signInContainer = document.getElementById('dashboardClerkSignIn');

  Clerk.addListener(({ user, session }) => {
    const signedIn = Boolean(user && session);
    signInContainer.hidden = signedIn;
    // Setelah login, Clerk otomatis render tombol akun di container ini:
    if (signedIn && !signInContainer.dataset.mounted) {
      Clerk.mountUserButton(document.getElementById('dashboardClerkUser'));
      signInContainer.dataset.mounted = '1';
    }
  });

  if (Clerk.isSignedIn) {
    await initializeDashboardAuth();
  } else {
    Clerk.mountSignIn(signInContainer);
    showDashboardLogin();
  }
});
```

`loadLoginAccountOptions()` dan endpoint `/dashboard/login-accounts` **dihapus** dari
frontend — daftar akun tidak lagi dipilih dari dropdown (dan memang lebih aman tidak
membeberkan daftar akun sebelum login).

### 2.5 Verifikasi JWT Clerk di Worker — dasar teori (implementasi nyatanya di 2.5b)

Frontend di atas **belum bisa jalan** sampai Worker memverifikasi JWT Clerk. Tambahkan
verifikasi ini ke `yourhome/worker-checkin-api.js`.

Karena Worker Anda di-deploy sebagai satu file (tanpa `wrangler.toml`/bundler), verifikasi
dibuat **tanpa dependensi npm**, memakai Web Crypto + JWKS Clerk:

```js
// ===== Verifikasi JWT Clerk (tanpa dependensi npm) =====

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

let clerkJwksCache = { keys: [], fetchedAt: 0 };

async function getClerkJwks(env) {
  const now = Date.now();
  if (clerkJwksCache.keys.length && now - clerkJwksCache.fetchedAt < 3600 * 1000) {
    return clerkJwksCache.keys;
  }
  const url = `${env.CLERK_ISSUER}/.well-known/jwks.json`;
  const response = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error('JWKS Clerk tidak dapat dimuat.');
  const data = await response.json();
  clerkJwksCache = { keys: Array.isArray(data.keys) ? data.keys : [], fetchedAt: now };
  return clerkJwksCache.keys;
}

// Mengembalikan claims bila token valid, atau null.
async function verifyClerkToken(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) return null;

  try {
    const header = decodeJwtSegment(headerSegment);
    if (header.alg !== 'RS256') return null;

    const keys = await getClerkJwks(env);
    const jwk = keys.find((key) => key.kid === header.kid) || keys[0];
    if (!jwk) return null;

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      base64UrlToBytes(signatureSegment),
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
    );
    if (!valid) return null;

    const claims = decodeJwtSegment(payloadSegment);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) return null;
    if (claims.nbf && claims.nbf > nowSeconds + 60) return null;
    if (env.CLERK_ISSUER && claims.iss !== env.CLERK_ISSUER) return null;

    const allowedParties = String(env.CLERK_AUTHORIZED_PARTIES || '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    if (allowedParties.length && claims.azp && !allowedParties.includes(claims.azp)) return null;

    return claims; // { sub, sid, role, staff_id, owner_id, ... }
  } catch {
    return null;
  }
}

// Pembungkus: coba Clerk dulu, lalu token lama (masa transisi).
async function getClerkAuth(request, env) {
  const claims = await verifyClerkToken(request, env);
  if (!claims) return null;
  const role = String(claims.role || claims.public_metadata?.role || '');
  return { userId: claims.sub, sessionId: claims.sid, role, claims };
}
```

Satu hal penting soal `crypto.subtle.importKey('jwk', …)`: bentuk JWK dari Clerk adalah
RSA public key dan didukung Web Crypto di Workers. Simpan JWKS di cache per-isolate
(seperti di atas) supaya tidak memanggil Clerk di setiap request.

### 2.5b Implementasi R1 (pernah diterapkan 2026-09-29, lalu DIREVERT)

R1 sudah dikerjakan di `yourhome/worker-checkin-api.js`. Pendekatan yang dipakai **berbeda**
dari sketsa di atas, dan lebih kecil risikonya:

- `verifyClerkToken()`, `getClerkJwks()` (cache 1 jam per isolate), dan
  `resolveDashboardAccountByClerkId()` ditambahkan sebagai blok baru.
- Logika token HMAC lama dipindah ke `getLegacyAdminTokenPayload()` **tanpa diubah isinya**.
- `getAdminTokenPayload(request, secret)` kini mencoba Clerk lebih dulu (dari cache), lalu
  token lama. **Tanda tangan fungsinya tidak berubah**, sehingga **26 pemanggil guard di dalam
  Worker tidak perlu disentuh sama sekali.**
- Identitas Clerk disimpan di `WeakMap` berkunci objek `request` (`clerkStaffAuthCache`),
  diisi sekali oleh `primeClerkStaffAuth(request, env)` di awal `fetch()` — tepat setelah
  preflight `OPTIONS`. Fungsi ini **hanya membaca header `Authorization`** dan tidak
  menyentuh body request, jadi aman untuk semua endpoint (termasuk `POST` berisi JSON/foto).
- Selama `CLERK_ISSUER` belum diisi, `isClerkConfigured()` bernilai false sehingga seluruh
  jalur Clerk dilewati dan perilaku Worker **identik dengan sebelumnya**. Artinya R1 aman
  di-deploy bahkan sebelum aplikasi Clerk dibuat.

Role untuk otorisasi **selalu** diambil dari tabel `dashboard_users` di D1, bukan dari token.
Claim `role` (bila ada) hanya dipakai sebagai pemeriksaan silang: kalau tidak cocok dengan D1,
request ditolak. Jadi `publicMetadata` yang salah set di Clerk tidak bisa menaikkan hak akses.

Pemetaan Clerk → akun staf memakai urutan:

1. Kolom `dashboard_users.clerk_user_id` (baru berguna setelah migrasi di Langkah 6). Bila
   kolomnya belum ada, kode mendeteksi error `no such column` lalu lanjut ke langkah 2.
2. Fallback transisi: claim `staff_id` (username Clerk) dicocokkan ke `account_id`, dengan
   validasi pola `^(master|it|admin(-\d+)?)$` dan kecocokan role.

Konsekuensi penting: **R1 tidak membutuhkan migrasi D1 dan tidak mengubah endpoint apa pun.**
`/dashboard/login`, `/owner/login`, `/crew/login`, `hashDashboardPassword()`, serta verifikasi
PIN Master dan PIN crew semuanya tetap apa adanya.

**Worker secret yang perlu diisi agar jalur Clerk aktif** (Cloudflare → Workers → `your-home-checkin-api` → Settings → Variables):

| Nama | Jenis | Contoh |
| --- | --- | --- |
| `CLERK_ISSUER` | Text | `https://clerk.yourhome.id` |
| `CLERK_AUTHORIZED_PARTIES` | Text | `https://yourhome.id,https://admin.yourhome.id,https://owner.yourhome.id` |

Kosongkan keduanya = jalur Clerk mati (perilaku lama).

`resolveDashboardAccountByClerkId()` mencocokkan `clerk_user_id` (kolom baru di
`dashboard_users`) ke akun lama, sehingga kode downstream yang memakai
`tokenData.account_id` / `tokenData.role` tidak perlu diubah — termasuk verifikasi
PIN Master, yang **tetap** memakai PIN 4 digit di D1 (lihat 0.4a).

### 2.6 Keputusan final: login Crew TIDAK memakai Clerk

`yourhome/check-in-crew.html` **tetap** memakai **ID Crew + PIN 6 digit** yang tersimpan di
D1 (tabel `crews`) dan endpoint `/crew/login` yang ada sekarang. Halaman ini tidak diubah,
tidak ada akun crew di Clerk, dan tidak ada perubahan pada antrean offline
`pending_checkins_v1`.

Komentar di kode `check-in-crew-dashboard.html` ("Sama seperti Dashboard: masuk memakai akun
staf") tetap berlaku: dashboard crew memakai login **staf** (Clerk), sedangkan
`check-in-crew.html` memakai **PIN crew** (D1). Dua hal berbeda, dan itu memang disengaja.

Kriteria PIN crew yang harus tetap dipenuhi setelah migrasi:

- Minimum 6 digit (sudah diatur `pattern="[0-9]{6}"` di form dan validasi 6 digit di Worker).
- Field PIN tetap wajib punya tombol tampilkan/sembunyikan.
- Daftar ID crew (bila ada endpoint seperti `/crew/login-accounts`) tetap memakai label generik,
  bukan nama asli.

### 2.7 Cara mencoba tanpa mengubah produksi

File contoh mandiri sudah disiapkan di:

```text
docs/contoh-clerk/dasbord-clerk-login.html
```

Isi `<FRONTEND-API-URL>` dan `<PUBLISHABLE-KEY>` di file itu, lalu buka lewat
`http://localhost/your_home/docs/contoh-clerk/dasbord-clerk-login.html`.
File ini **tidak ikut ter-publish** ke Cloudflare Pages karena Pages hanya mempublikasikan
folder `yourhome/`, `admin_yourhome/`, dan `owner_yourhome/`.

---

## LANGKAH 3 — Role & ID di Clerk (ringkas, akan dirinci)

Gunakan **`publicMetadata`** (read-only dari sisi user, bisa dibaca frontend & backend):

```json
{ "role": "Master", "staff_id": "master" }
{ "role": "Admin",  "staff_id": "admin-1" }
{ "role": "IT",     "staff_id": "it" }
{ "role": "Owner",  "owner_id": "O1" }
{ "role": "OwnerPortal", "portal_access": true }
```

Tidak ada role `Crew` di Clerk — crew tidak login lewat Clerk.

Cara mengisi: Clerk Dashboard → Users → pilih user → **Metadata → Public**,
atau lewat Backend API `PATCH /v1/users/{user_id}/metadata`.

Agar Worker tidak perlu memanggil Clerk tiap request, tambahkan custom claim
di **Sessions → Customize session token**:

```json
{
  "role": "{{user.public_metadata.role}}",
  "staff_id": "{{user.public_metadata.staff_id}}",
  "owner_id": "{{user.public_metadata.owner_id}}"
}
```

Jaga total custom claim < 1.2 KB. Kalau metadata diubah, claim baru muncul setelah token
di-refresh.

---

## LANGKAH 4 — Melindungi halaman (ringkas, akan dirinci)

Tiga lapis:

1. **UX (frontend):** setelah `Clerk.load()`, kalau `!Clerk.isSignedIn` → tampilkan sign-in;
   kalau role tidak sesuai → `Clerk.signOut()` + pesan.
2. **Autorisasi (Worker) — yang sebenarnya:** setiap endpoint memeriksa
   `role` dari JWT Clerk. Contoh matriks:

   | Endpoint | Role yang boleh |
   | --- | --- |
   | `/dashboard/*` | Master, Admin, IT |
   | `/dashboard/accounts*`, reset password, hapus permanen | Master |
   | `/owner/reports*` | Owner (hanya `owner_id` sendiri), atau OwnerPortal dengan `?owner_id=` |
   | `/crew/*` (check-in) | Crew — **tetap token PIN crew lama dari D1, bukan Clerk** |

3. **PIN Master:** aksi hapus permanen **tetap** memakai PIN Master 4 digit di D1.
   Tidak ada reverification Clerk.

---

## LANGKAH 5 — Logout (ringkas, akan dirinci)

```js
await Clerk.signOut();   // menghapus sesi Clerk, lalu panggil showDashboardLogin()
```

Semua halaman memakai satu instance Clerk yang sama, sehingga logout di satu portal
mengakhiri sesi untuk portal lain juga (tujuan Anda nomor 4).

---

## LANGKAH 6 — Strategi migrasi user lama dari D1 (ringkas, akan dirinci)

1. **Kolom penghubung:** tambahkan `clerk_user_id TEXT` (nullable) ke `dashboard_users`
   dan `owners` saja. (`crews` **tidak** perlu — PIN crew tetap di D1.)
2. **Impor user ke Clerk** (Backend API `POST /v1/users` atau Clerk CLI), dengan
   `username` = ID lama (`master`, `admin-1`, `O1`) dan `publicMetadata`
   sesuai peta di bagian 0.3. Password lama **tidak bisa** dipindahkan (hanya hash PBKDF2
   yang tersimpan) — user harus memakai "reset password"/undangan dari Clerk.
   Akun crew **tidak** dibuat di Clerk.
3. **Kirim undangan** ke tiap staf/owner agar mereka menetapkan password baru di Clerk.
4. **Isi `clerk_user_id`** dengan mencocokkan `username` Clerk ke `account_id` (staf) dan `owner_id` (owner).
5. **Stop menulis** hanya `password_hash`/`password_salt` milik `dashboard_users` dan `owners`.
   Kolom PIN — `delete_pin_salt`/`delete_pin_hash` (`dashboard_users`) dan `pin_hash`
   (`crews`) — **tetap dipakai** dan tidak berubah.
6. **Hapus** endpoint `/dashboard/login` dan `/owner/login` setelah semua frontend pindah.
   Endpoint `/crew/login` dan fungsi `hashDashboardPassword()` **tetap dipakai**
   (untuk PIN crew dan PIN Master).
7. **Terakhir**, `DROP COLUMN` hanya untuk kolom **password staf & owner** setelah periode aman
   (mis. 1 bulan). **Kolom PIN tidak di-drop.**

Mitigasi risiko: jalankan dua mekanisme berdampingan (Clerk + token lama) selama transisi,
migrasikan satu halaman per rilis, mulai dari `dasbord.html`.

---

## Ringkasan urutan rilis yang disarankan

| Rilis | Isi | Halaman yang berubah |
| --- | --- | --- |
| R1 | Worker: `verifyClerkToken()` + mode transisi (Clerk **atau** token lama) | hanya Worker |
| ~~R1~~ | Riwayat: pernah diterapkan 2026-09-29, lalu **direvert**. Lihat 2.5b. | `yourhome/worker-checkin-api.js` |
| R2 | `dasbord.html` pindah ke Clerk | `yourhome/dasbord.html` |
| R3 | `admin-properti.html` + `check-in-crew-dashboard.html` | 2 file |
| R4 | `admin_yourhome/index.html` | 1 file |
| R5 | `owner-portal.html` + `owner_yourhome/index.html` | 2 file |
| — | ~~R6 `check-in-crew.html`~~ **dibatalkan** — tetap memakai PIN crew di D1 | — |
| R7 | Bersihkan login lama **staf & owner** di Worker + kolom password di D1 | Worker + migrasi D1 |

---

## Referensi

- Quickstart JavaScript (script tag): <https://clerk.com/docs/quickstarts/javascript>
- Objek `Clerk`: <https://clerk.com/docs/references/javascript/clerk/clerk>
- User metadata: <https://clerk.com/docs/users/metadata>
- Session token & custom claims: <https://clerk.com/docs/guides/sessions/session-tokens>
- Manual JWT verification: <https://clerk.com/docs/guides/sessions/manual-jwt-verification>
- `verifyToken()`: <https://clerk.com/docs/references/backend/verify-token>
