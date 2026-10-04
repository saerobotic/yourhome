const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ENTITIES[char]);

export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

export function truncate(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return value.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[.,;:!\-–—\s]+$/, '') + '…';
}

export function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

export const wordCount = html => {
  const text = stripHtml(html);
  return text ? text.split(' ').length : 0;
};

export const readMinutes = html => Math.max(1, Math.round(wordCount(html) / 200));

const dateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = iso => dateFormat.format(new Date(iso));
export const formatShortDate = iso => shortDateFormat.format(new Date(iso));

export function initials(name) {
  const letters = String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('');
  return letters || 'YH';
}

// Memberi id pada H2/H3 (untuk daftar isi dan tautan langsung) dan menandai gambar agar dimuat malas.
// Isi artikel sudah dibersihkan Worker saat disimpan, jadi bentuknya sederhana: <h2>teks</h2>.
export function prepareContent(html) {
  const toc = [];
  const used = new Set();
  let output = String(html || '').replace(/<h([23])>([\s\S]*?)<\/h\1>/gi, (match, level, inner) => {
    const text = stripHtml(inner);
    if (!text) return match;
    let id = slugify(text) || `bagian-${toc.length + 1}`;
    while (used.has(id)) id += '-2';
    used.add(id);
    toc.push({ level: Number(level), id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  output = output.replace(/<img\s/gi, '<img loading="lazy" decoding="async" ');
  return { html: output, toc };
}

export const absoluteUrl = (base, path) => `${base}${path.startsWith('/') ? path : `/${path}`}`;
