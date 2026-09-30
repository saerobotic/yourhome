// Ringkas isi file impor Excel 2026 tanpa perlu menjalankannya di D1.
// Dipakai untuk memastikan total per bulan sesuai angka acuan.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root)
  .filter(name => /^import-excel-2026.*\.sql$/.test(name))
  .sort();

const rowPattern = /'(BK[Ee]?[A-Za-z0-9_-]+)'[^;]*?'(\d{4}-\d{2}-\d{2})', '(\d{4}-\d{2}-\d{2})', (\d+), (\d+)/g;

const seen = new Map();
const perMonth = new Map();
const duplicates = [];
let total = 0;

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  let match;
  let fileCount = 0;
  while ((match = rowPattern.exec(text)) !== null) {
    const [, id, , checkin, , amount] = match;
    fileCount += 1;
    const value = Number(amount);
    total += value;
    const month = checkin.slice(0, 7);
    const entry = perMonth.get(month) || { count: 0, sum: 0 };
    entry.count += 1;
    entry.sum += value;
    perMonth.set(month, entry);
    if (seen.has(id)) duplicates.push({ id, first: seen.get(id), second: file });
    else seen.set(id, file);
  }
  console.log(`${file}: ${fileCount} baris booking`);
}

console.log(`\nTotal baris unik: ${seen.size}, total nilai terbaca: Rp ${total.toLocaleString('id-ID')}`);
console.log(`Duplikat ID: ${duplicates.length}`);
duplicates.slice(0, 20).forEach(item => console.log(`  ${item.id} (${item.first} & ${item.second})`));

console.log('\nPer bulan (hasil baca file):');
[...perMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([month, entry]) => {
  console.log(`  ${month}: ${entry.count} baris, Rp ${entry.sum.toLocaleString('id-ID')}`);
});

const september = perMonth.get('2026-09');
console.log(`\nSeptember 2026 dari file: Rp ${(september ? september.sum : 0).toLocaleString('id-ID')} (${september ? september.count : 0} baris)`);
