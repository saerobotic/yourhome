// Membuat situs statis artikel.yourhome.id dari data Worker (D1).
// Pakai: node build.mjs   (variabel opsional: API_BASE, OUT_DIR)
// Hasil ada di folder dist/. Bila API gagal, skrip berhenti dengan kode 1 sehingga situs yang tayang tidak tertimpa.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, CATEGORIES, RESERVED_PATHS, DEFAULT_CONTACT } from './lib/config.mjs';
import { fetchPublishedArticles, fetchSettings } from './lib/api.mjs';
import { stripHtml, truncate } from './lib/util.mjs';
import {
  articlePage, articleUrl, categoryPage, catById, homePage, notFoundPage, paginate,
  robotsTxt, rssXml, searchPage, sitemapXml,
} from './lib/templates.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, process.env.OUT_DIR || 'dist');
const files = new Map(); // path relatif -> isi (dipakai juga untuk menghitung hash build)

const put = (path, content) => files.set(path.replace(/^\//, ''), content);
const pageFile = path => `${path.replace(/^\/|\/$/g, '')}/index.html`.replace(/^\//, '');

async function main() {
  const [rawArticles, settings] = await Promise.all([fetchPublishedArticles(), fetchSettings()]);

  const now = Date.now();
  const articles = rawArticles
    .filter(article => article.status === 'published' && article.published_at && new Date(article.published_at).getTime() <= now)
    .filter(article => {
      if (!article.slug || !article.title || !article.cover_url) { console.warn(`Dilewati (data kurang): ${article.id}`); return false; }
      if (RESERVED_PATHS.has(article.slug)) { console.warn(`Dilewati (slug dicadangkan): ${article.slug}`); return false; }
      return true;
    })
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  const cats = CATEGORIES.map(category => ({ ...category, count: articles.filter(article => article.category === category.id).length }));
  const ctx = {
    logo: settings.header_logo && /^https:\/\//.test(settings.header_logo) ? settings.header_logo : SITE.logo,
    contact: {
      location: settings.footer_location || DEFAULT_CONTACT.location,
      phone: settings.footer_phone || DEFAULT_CONTACT.phone,
      email: settings.footer_email || DEFAULT_CONTACT.email,
      instagram: settings.footer_instagram || DEFAULT_CONTACT.instagram,
    },
    cats,
    navCats: cats.filter(category => category.count > 0),
    latest: articles.slice(0, 6),
    year: articles.length ? new Date(articles[0].published_at).getFullYear() : new Date().getFullYear(),
    cssVersion: '',
  };

  // CSS dan JS
  const css = (await readFile(join(root, 'assets/style.base.css'), 'utf8')) + '\n' + (await readFile(join(root, 'assets/style.extra.css'), 'utf8'));
  const minCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\n+/g, '').trim();
  ctx.cssVersion = createHash('sha1').update(minCss).digest('hex').slice(0, 8);
  put('assets/style.css', minCss);
  put('assets/app.js', await readFile(join(root, 'assets/app.js'), 'utf8'));

  // Beranda: artikel terbaru menjadi hero, sisanya dibagi per halaman
  const [hero, ...rest] = articles;
  const homePages = paginate(rest, SITE.pageSize);
  homePages.forEach((items, index) => {
    const page = index + 1;
    const html = homePage(ctx, { hero, items, page, pages: homePages.length });
    put(page === 1 ? 'index.html' : pageFile(`/halaman/${page}/`), html);
  });

  // Kategori yang punya artikel
  for (const category of ctx.navCats) {
    const list = articles.filter(article => article.category === category.id);
    const pages = paginate(list, SITE.pageSize);
    pages.forEach((items, index) => {
      const page = index + 1;
      const path = page === 1 ? `/kategori/${category.id}/` : `/kategori/${category.id}/halaman/${page}/`;
      put(pageFile(path), categoryPage(ctx, category, { items, page, pages: pages.length, total: list.length }));
    });
  }

  // Artikel + artikel terkait (kategori sama dulu, lalu yang terbaru)
  for (const article of articles) {
    const same = articles.filter(other => other.id !== article.id && other.category === article.category);
    const others = articles.filter(other => other.id !== article.id && other.category !== article.category);
    const related = [...same, ...others].slice(0, 3);
    put(pageFile(articleUrl(article)), articlePage(ctx, article, related));
  }

  // Pencarian, 404, sitemap, robots, RSS
  put('cari/index.html', searchPage(ctx));
  put('404.html', notFoundPage(ctx));
  put('search-index.json', JSON.stringify(articles.map(article => ({
    t: article.title,
    u: articleUrl(article),
    c: catById(article.category)?.label || '',
    e: truncate(article.excerpt || stripHtml(article.content), 160),
    g: (article.tags || []).join(' '),
  }))));
  put('sitemap.xml', sitemapXml(articles, ctx.navCats));
  put('robots.txt', robotsTxt());
  put('rss.xml', rssXml(articles));
  put('CNAME', (await readFile(join(root, 'CNAME'), 'utf8')).trim() + '\n');
  put('.nojekyll', '');

  // Hash isi situs: workflow memakainya untuk melewati deploy bila tidak ada yang berubah.
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) hash.update(path).update('\0').update(files.get(path)).update('\0');
  put('build-hash.txt', hash.digest('hex') + '\n');

  await rm(outDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  console.log(`Selesai: ${articles.length} artikel, ${ctx.navCats.length} kategori, ${files.size} file -> ${outDir}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
