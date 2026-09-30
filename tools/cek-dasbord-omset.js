// Validasi ringan: pastikan script inline dasbord.html tetap bisa diparse
// dan panel Omset Bulanan benar-benar terpasang.
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'yourhome', 'dasbord.html');
const html = fs.readFileSync(file, 'utf8');

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(code => code.trim());

scripts.forEach((code, index) => {
  try {
    new Function(code);
  } catch (error) {
    console.error(`Script #${index + 1} gagal diparse: ${error.message}`);
    process.exitCode = 1;
  }
});
console.log(`Script inline dapat diparse: ${scripts.length}`);

const checks = [
  ['Markup tabel omset', 'id="monthlyRevenueBody"'],
  ['Markup judul tahun', 'id="monthlyRevenueHead"'],
  ['Catatan jumlah transaksi', 'id="monthlyRevenueNote"'],
  ['Fungsi render omset', 'function renderMonthlyRevenue'],
  ['Filter saldo awal', "entry.cat !== 'Saldo Awal / Carry-over'"],
  ['View omset tersendiri', 'id="view-omset"'],
  ['Menu sidebar Omset', "switchView('omset')"],
  ['Judul halaman Omset', "'omset': { title:'Omset'"],
];
checks.forEach(([label, needle]) => {
  console.log(`${html.includes(needle) ? 'OK  ' : 'HILANG'} ${label}`);
});

const callCount = (html.match(/renderMonthlyRevenue\(\);/g) || []).length;
console.log(`Pemanggilan renderMonthlyRevenue: ${callCount} (1 definisi + ${callCount - 1} pemanggilan)`);
