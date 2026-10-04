import { SITE } from './config.mjs';

// Mengambil data dengan beberapa kali percobaan. Bila tetap gagal, build berhenti (exit 1)
// supaya situs yang sedang tayang tidak tertimpa halaman kosong.
async function getJson(path) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${SITE.api}${path}`, { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) {
        throw new Error(`${path} -> HTTP ${response.status} ${data?.error || ''}`.trim());
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error(`Gagal mengambil data dari API: ${lastError?.message || lastError}`);
}

// Semua artikel yang sudah tayang, lengkap dengan isinya (dibagi per 50 artikel).
export async function fetchPublishedArticles() {
  const articles = [];
  const limit = 50;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await getJson(`/articles?include=content&limit=${limit}&offset=${offset}`);
    const rows = Array.isArray(data.data) ? data.data : [];
    total = Number(data.pagination?.total ?? rows.length);
    articles.push(...rows);
    if (!rows.length) break;
    offset += limit;
  }
  return articles;
}

// Logo dan kontak footer diambil dari pengaturan Admin Website. Kalau gagal, pakai bawaan.
export async function fetchSettings() {
  try {
    const data = await getJson('/settings');
    return data.data || {};
  } catch (error) {
    console.warn(`Pengaturan situs tidak terbaca, memakai bawaan: ${error.message}`);
    return {};
  }
}
