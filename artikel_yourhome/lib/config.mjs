// Pengaturan situs Jurnal YOUR HOME (artikel.yourhome.id)

export const SITE = {
  url: 'https://artikel.yourhome.id',
  mainUrl: 'https://yourhome.id',
  name: 'Jurnal YOUR HOME',
  brand: 'YOUR HOME',
  headline: 'Jurnal Properti, Wisata Bandung & Pariwisata Indonesia',
  description: 'Artikel pilihan seputar properti, wisata Bandung, dan pariwisata Indonesia. Panduan, tips, dan inspirasi perjalanan dari tim YOUR HOME.',
  api: (process.env.API_BASE || 'https://your-home-checkin-api.saerobotic.workers.dev').replace(/\/+$/, ''),
  logo: 'https://ik.imagekit.io/o1hnx31yy/yh%20(2).png?tr=f-jpg',
  pageSize: 12,
  rssLimit: 30,
};

// Kategori harus sama dengan daftar di admin-artikel.html dan ARTICLE_CATEGORIES di Worker.
export const CATEGORIES = [
  { id: 'properti', label: 'Properti & Akomodasi', nav: 'Properti', description: 'Panduan memilih, menyewa, dan berinvestasi di properti: villa, apartemen, guest house, dan kosan di Bandung dan sekitarnya.' },
  { id: 'wisata', label: 'Wisata Bandung', nav: 'Wisata Bandung', description: 'Rekomendasi destinasi, itinerari, dan tempat menginap untuk liburan di Bandung, Lembang, Dago, Ciwidey, dan sekitarnya.' },
  { id: 'pariwisata', label: 'Pariwisata Indonesia', nav: 'Pariwisata', description: 'Kabar, tren, dan inspirasi perjalanan dari berbagai penjuru Indonesia.' },
  { id: 'kuliner', label: 'Kuliner', nav: 'Kuliner', description: 'Kuliner khas Bandung dan sekitarnya: tempat makan, jajanan, dan kafe yang layak dicoba.' },
  { id: 'tips', label: 'Tips & Panduan', nav: 'Tips', description: 'Tips praktis untuk wisatawan, tamu, dan pemilik properti agar liburan dan bisnis sewa berjalan lancar.' },
  { id: 'budaya', label: 'Budaya & Event', nav: 'Budaya & Event', description: 'Budaya, festival, dan acara menarik yang bisa dinikmati saat berkunjung.' },
];

// Jalur yang dipakai situs. Slug artikel tidak boleh sama dengan nama-nama ini.
export const RESERVED_PATHS = new Set(['kategori', 'halaman', 'cari', 'assets', 'tag', 'search', 'admin', '404', 'index', 'categories', 'sitemap', 'rss', 'feed', 'images', 'page']);

export const DEFAULT_CONTACT = {
  location: 'Bandung, Jawa Barat, Indonesia',
  phone: '+62 882-7678-8800',
  email: 'hello@yourhome.id',
  instagram: '@yourhomeapartment',
};
