/**
 * YOUR HOME - Check In Crew API
 *
 * Bindings:
 * DB     -> D1 database: your-home-checkin
 * PHOTOS -> R2 bucket: your-home
 */

const CORS = {
  'Access-Control-Allow-Origin': 'https://yourhome.id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Vary': 'Origin',
};

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const isLocalOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ...CORS,
    'Access-Control-Allow-Origin': ['https://yourhome.id', 'https://admin.yourhome.id', 'https://owner.yourhome.id', 'https://agen.yourhome.id', 'https://artikel.yourhome.id'].includes(origin) || isLocalOrigin
      ? origin
      : 'https://yourhome.id',
  };
} 

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS,
    },
  });
}

function bad(message, status = 400, extra = {}) {
  return json({
    ok: false,
    error: message,
    ...extra,
  }, status);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error('Format foto tidak valid');
  }

  const contentType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    contentType,
    bytes,
  };
}

function slug(value) {
  return String(value || 'crew')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

// Periode billing kos mengikuti bulan berjalan di zona waktu Jakarta.
const KOSAN_MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function getKosanCurrentPeriod() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === 'year').value;
  const month = parts.find(part => part.type === 'month').value;
  return `${year}-${month}`;
}

// Dihitung per request di dalam fetch(): jam di scope global Worker beku, jadi periode
// yang dihitung saat modul dimuat bisa basi dan menolak pembayaran bulan berjalan.
function buildKosanPeriods(currentPeriod) {
  const [endYear, endMonth] = currentPeriod.split('-').map(Number);
  const startDate = new Date(Date.UTC(endYear, endMonth - 1 - 35, 1));
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const periods = [];
  while (cursor.getUTCFullYear() < endYear ||
    (cursor.getUTCFullYear() === endYear && cursor.getUTCMonth() + 1 <= endMonth)) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    periods.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${KOSAN_MONTHS_ID[month - 1]} ${year}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

function getKosanPeriod(key) {
  const match = String(key || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return { key:match[0], label:`${KOSAN_MONTHS_ID[month - 1]} ${year}` };
}

function shiftKosanPeriod(key, offset) {
  const [year, month] = String(key).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = shifted.getUTCMonth() + 1;
  return {
    key:`${nextYear}-${String(nextMonth).padStart(2, '0')}`,
    label:`${KOSAN_MONTHS_ID[nextMonth - 1]} ${nextYear}`,
  };
}

function getKosanBillingDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Makassar', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function fileKeyFromPath(pathname) {
  let key = pathname.slice('/files/'.length);

  for (let index = 0; index < 3; index++) {
    try {
      const decoded = decodeURIComponent(key);

      if (decoded === key) break;

      key = decoded;
    } catch {
      break;
    }
  }

  return key.replace(/^\/+/, '');
}

function publicFileUrl(origin, key) {
  return `${origin}/files/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function safeParseJsonArray(value) {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapPropertyRecord(row, includeAdminFields = false) {
  const urls = safeParseJsonArray(row.image_urls);
  const property = {
    room_options: safeParseJsonArray(row.room_options),
    external_bookings: safeParseJsonArray(row.external_bookings)
      .filter(booking => booking && typeof booking === 'object')
      .map(booking => ({
        start_date: String(booking.start_date || ''),
        end_date: String(booking.end_date || ''),
        room_name: String(booking.room_name || ''),
      })),
    image_urls: row.image_url
      ? [row.image_url, ...urls.filter(imageUrl => imageUrl !== row.image_url)]
      : urls,
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    price: Number(row.price || 0),
    weekday_price: row.weekday_price == null ? null : Number(row.weekday_price),
    weekend_price: row.weekend_price == null ? null : Number(row.weekend_price),
    beds: Number(row.beds || 0),
    baths: Number(row.baths || 0),
    guests: Number(row.guests || 0),
    image_url: row.image_url,
    map_query: row.map_query,
    map_link: row.map_link,
    map_embed: row.map_embed,
    description: row.description,
    sort_order: Number(row.sort_order || 0),
  };
  if (includeAdminFields) {
    property.dashboard_id = row.dashboard_id || '';
    property.property_code = row.property_code || '';
    property.publication_status = row.publication_status || (Number(row.active) ? 'active' : 'archived');
    property.active = Number(row.active) === 1;
  }
  return property;
}

async function buildDashboardCatalogStatements(env, properties, now) {
  const result = await env.DB.prepare(`
    SELECT id, dashboard_id, name, active, publication_status FROM properties
  `).all();
  const rows = result.results || [];
  const byDashboardId = new Map(rows.filter(row => row.dashboard_id).map(row => [row.dashboard_id, row]));
  const statements = [];
  const usedRows = new Set();
  const normalizeName = value => String(value || '').trim().toLocaleLowerCase('id');

  for (const property of properties) {
    const dashboardId = String(property.id).trim();
    const name = String(property.name).trim();
    const category = String(property.type || property.category || 'villa').trim();
    const code = String(property.code || dashboardId).trim().toUpperCase();
    if (!['apartment', 'villa', 'guesthouse', 'kos'].includes(category)) {
      throw new Error(`Jenis properti ${name} tidak valid.`);
    }

    const exactNameMatches = rows.filter(row => normalizeName(row.name) === normalizeName(name));
    const row = byDashboardId.get(dashboardId) || (exactNameMatches.length === 1 ? exactNameMatches[0] : null);
    if (row) {
      if (usedRows.has(row.id) || (row.dashboard_id && row.dashboard_id !== dashboardId)) {
        throw new Error(`Properti ${name} memiliki tautan Dashboard yang bertabrakan.`);
      }
      usedRows.add(row.id);
      const archived = property.active === false || property.active === 0;
      const requestedStatus = ['active', 'draft'].includes(property.publication_status)
        ? property.publication_status
        : '';
      const publicationStatus = archived
        ? 'archived'
        : requestedStatus || (row.publication_status === 'archived' ? 'draft' : row.publication_status || 'draft');
      const activeValue = publicationStatus === 'archived' ? 0 : 1;
      // Hanya tulis kalau ada kolom yang berubah, supaya sinkron rutin tidak menghabiskan kuota tulis D1.
      statements.push(env.DB.prepare(`
        UPDATE properties
        SET dashboard_id = ?, property_code = ?, name = ?, category = ?, active = ?, publication_status = ?, updated_at = ?
        WHERE id = ? AND (dashboard_id IS NOT ? OR property_code IS NOT ? OR name IS NOT ? OR
          category IS NOT ? OR active IS NOT ? OR publication_status IS NOT ?)
      `).bind(dashboardId, code, name, category, activeValue, publicationStatus, now, row.id,
        dashboardId, code, name, category, activeValue, publicationStatus));
      continue;
    }
    if (exactNameMatches.length > 1) {
      throw new Error(`Nama ${name} cocok dengan beberapa properti katalog; tautkan ID-nya terlebih dahulu.`);
    }

    const id = `dashboard-${slug(dashboardId)}`;
    const existingId = rows.find(item => item.id === id);
    if (existingId && existingId.dashboard_id !== dashboardId) {
      throw new Error(`ID katalog untuk ${name} sudah digunakan.`);
    }
    const archived = property.active === false || property.active === 0;
    const publicationStatus = archived
      ? 'archived'
      : property.publication_status === 'active' ? 'active' : 'draft';
    const basePrice = Math.max(0, Math.round(Number(property.price) || 0));
    const beds = Math.max(0, Math.round(Number(property.beds) || 0));
    const baths = Math.max(0, Math.round(Number(property.baths) || 0));
    const guests = Math.max(0, Math.round(Number(property.guests) || 0));
    statements.push(env.DB.prepare(`
      INSERT INTO properties (
        id, dashboard_id, property_code, name, category, location, price,
        weekday_price, weekend_price, beds, baths, guests, image_url, image_urls,
        map_query, map_link, map_embed, description, room_options, external_bookings,
        sort_order, active, publication_status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', '', '', '', '', '[]', '[]', 0, ?, ?, ?)
    `).bind(
      id, dashboardId, code, name, category, String(property.area || ''), basePrice,
      category === 'kos' ? null : basePrice, category === 'kos' ? null : basePrice,
      beds, baths, guests, archived ? 0 : 1, publicationStatus, now
    ));
  }
  return statements;
}

function isMissingContactStatusColumn(error) {
  return /(?:no column named status|no such column: status|no such column: contact_messages\.status)/i.test(
    String(error?.message || error)
  );
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function reserveLoginAttempt(env, request, scope) {
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const secret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
  const rateKey = await hmacSha256Hex(secret, `${scope}:${address}`);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 15 * 60;
  try {
    const row = await env.DB.prepare(`
      INSERT INTO auth_login_attempts (rate_key, window_started_at, attempts)
      VALUES (?, ?, 1)
      ON CONFLICT(rate_key) DO UPDATE SET
        attempts = CASE
          WHEN auth_login_attempts.window_started_at <= ? THEN 1
          ELSE auth_login_attempts.attempts + 1
        END,
        window_started_at = CASE
          WHEN auth_login_attempts.window_started_at <= ? THEN excluded.window_started_at
          ELSE auth_login_attempts.window_started_at
        END
      RETURNING attempts
    `).bind(rateKey, now, windowStart, windowStart).first();
    return { limited:Number(row?.attempts || 0) > 10, unavailable:false };
  } catch (error) {
    if (/no such table: auth_login_attempts/i.test(String(error?.message || error))) {
      return { limited:false, unavailable:true };
    }
    throw error;
  }
}

async function clearLoginAttempts(env, request, scope) {
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const secret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
  const rateKey = await hmacSha256Hex(secret, `${scope}:${address}`);
  await env.DB.prepare('DELETE FROM auth_login_attempts WHERE rate_key = ?').bind(rateKey).run();
}

function crewPayrollKey(crew, workDate) {
  return `${String(crew || '').trim()}\u0000${String(workDate || '').trim()}`;
}

async function syncCheckinPayrollExpenses(env, affectedPairs) {
  const pairsByKey = new Map();
  const syncAll = affectedPairs === 'all';
  if (!syncAll) {
    for (const pair of affectedPairs || []) {
      const crew = String(pair?.crew || '').trim();
      const workDate = String(pair?.workDate || pair?.work_date || '').trim();
      if (crew && /^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        pairsByKey.set(crewPayrollKey(crew, workDate), { crew, workDate });
      }
    }
  }
  if (!syncAll && !pairsByKey.size) return;

  const category = await env.DB.prepare(`
    SELECT id, name FROM finance_categories
    WHERE id = 'expense-crew-fee' AND kind = 'expense' AND active = 1
  `).first();
  if (!category) throw new Error('Kategori Fee untuk Crew belum tersedia. Jalankan migration-crew-expense-category.sql.');

  const properties = await env.DB.prepare('SELECT id, name FROM properties WHERE active = 1').all();
  const normalizePropertyName = value => String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const propertyIds = new Map((properties.results || []).map(property => [normalizePropertyName(property.name), property.id]));
  const checkinsByPair = new Map();
  const expensesByPair = new Map();

  if (syncAll) {
    const [checkinResult, expenseResult] = await Promise.all([
      env.DB.prepare('SELECT crew, unit, job_type, work_date FROM checkins').all(),
      env.DB.prepare(`SELECT id, payee, entry_date FROM finance_entries WHERE created_by = 'checkin-payroll'`).all(),
    ]);
    for (const row of checkinResult.results || []) {
      const pair = { crew:String(row.crew || '').trim(), workDate:String(row.work_date || '').trim() };
      if (!pair.crew || !/^\d{4}-\d{2}-\d{2}$/.test(pair.workDate)) continue;
      const key = crewPayrollKey(pair.crew, pair.workDate);
      pairsByKey.set(key, pair);
      if (!checkinsByPair.has(key)) checkinsByPair.set(key, []);
      checkinsByPair.get(key).push(row);
    }
    for (const row of expenseResult.results || []) {
      const pair = { crew:String(row.payee || '').trim(), workDate:String(row.entry_date || '').trim() };
      if (!pair.crew || !/^\d{4}-\d{2}-\d{2}$/.test(pair.workDate)) continue;
      const key = crewPayrollKey(pair.crew, pair.workDate);
      pairsByKey.set(key, pair);
      if (!expensesByPair.has(key)) expensesByPair.set(key, []);
      expensesByPair.get(key).push(row);
    }
  } else {
    const pairsByDate = new Map();
    for (const [key, pair] of pairsByKey) {
      if (!pairsByDate.has(pair.workDate)) pairsByDate.set(pair.workDate, []);
      pairsByDate.get(pair.workDate).push({ key, ...pair });
    }
    for (const [workDate, datePairs] of pairsByDate) {
      const [checkinResult, expenseResult] = await Promise.all([
        env.DB.prepare('SELECT crew, unit, job_type, work_date FROM checkins WHERE work_date = ?').bind(workDate).all(),
        env.DB.prepare(`SELECT id, payee, entry_date FROM finance_entries WHERE created_by = 'checkin-payroll' AND entry_date = ?`).bind(workDate).all(),
      ]);
      const keysByCrew = new Map(datePairs.map(pair => [pair.crew, pair.key]));
      for (const row of checkinResult.results || []) {
        const key = keysByCrew.get(String(row.crew || '').trim());
        if (!key) continue;
        if (!checkinsByPair.has(key)) checkinsByPair.set(key, []);
        checkinsByPair.get(key).push(row);
      }
      for (const row of expenseResult.results || []) {
        const key = keysByCrew.get(String(row.payee || '').trim());
        if (!key) continue;
        if (!expensesByPair.has(key)) expensesByPair.set(key, []);
        expensesByPair.get(key).push(row);
      }
    }
  }

  const now = new Date().toISOString();
  const statements = [];

  // Crew dan bulan yang slipnya sudah ditandai dibayar tidak disinkronkan lagi: slip menjadi sumber pengeluarannya.
  const paidSlipKeys = new Set();
  try {
    const paidSlips = await env.DB.prepare(`SELECT crew, period_month FROM crew_payroll_slips WHERE status = 'paid'`).all();
    (paidSlips.results || []).forEach(row => paidSlipKeys.add(`${row.crew}\u0000${row.period_month}`));
  } catch (error) {
    if (!/no such table: crew_payroll_slips/i.test(String(error?.message || error))) throw error;
  }

  for (const [key, { crew, workDate }] of pairsByKey) {
    if (paidSlipKeys.has(`${crew}\u0000${workDate.slice(0, 7)}`)) continue;
    const units = new Map();
    const reportCounts = new Map();
    for (const row of checkinsByPair.get(key) || []) {
      const unit = String(row.unit || '').trim();
      if (!unit) continue;
      if (!units.has(unit)) units.set(unit, new Set());
      reportCounts.set(unit, (reportCounts.get(unit) || 0) + 1);
      const jobType = String(row.job_type || '').trim();
      if (jobType) units.get(unit).add(jobType);
    }

    // Honor harian Rp 100.000 dibagi rata per laporan: properti dengan 2 laporan menanggung 2 bagian.
    const sortedUnits = [...units.keys()].sort((left, right) => left.localeCompare(right, 'id'));
    const totalReports = [...reportCounts.values()].reduce((sum, count) => sum + count, 0);
    const unitAmounts = new Map(sortedUnits.map(unit => [unit, Math.floor(100000 * reportCounts.get(unit) / totalReports)]));
    let remainder = sortedUnits.length ? 100000 - [...unitAmounts.values()].reduce((sum, amount) => sum + amount, 0) : 0;
    for (const unit of sortedUnits) {
      if (remainder <= 0) break;
      unitAmounts.set(unit, unitAmounts.get(unit) + 1);
      remainder -= 1;
    }
    const expectedIds = new Set();

    for (const unit of sortedUnits) {
      const id = `checkin-payroll-${await sha256Hex(JSON.stringify([crew, workDate, unit]))}`;
      expectedIds.add(id);
      const propertyId = propertyIds.get(normalizePropertyName(unit)) || null;
      const jobTypes = [...units.get(unit)].sort((left, right) => left.localeCompare(right, 'id'));
      const description = `${crew} - ${jobTypes.join(', ') || 'Pekerjaan'}`.slice(0, 240);
      statements.push(env.DB.prepare(`
        INSERT INTO finance_entries (
          id, kind, category_id, category_name, property_id, property_name,
          entry_date, amount, description, payee, recurrence, created_by, created_at
        ) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, 'once', 'checkin-payroll', ?)
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id,
          category_name = excluded.category_name,
          property_id = excluded.property_id,
          property_name = excluded.property_name,
          entry_date = excluded.entry_date,
          amount = excluded.amount,
          description = excluded.description,
          payee = excluded.payee
        WHERE finance_entries.created_by = 'checkin-payroll'
      `).bind(
        id, category.id, category.name, propertyId, unit, workDate,
        unitAmounts.get(unit), description, crew, now
      ));
    }

    for (const row of expensesByPair.get(key) || []) {
      if (!expectedIds.has(row.id)) {
        statements.push(env.DB.prepare(`
          DELETE FROM finance_entries WHERE id = ? AND created_by = 'checkin-payroll'
        `).bind(row.id));
      }
    }
  }

  for (let offset = 0; offset < statements.length; offset += 50) {
    await env.DB.batch(statements.slice(offset, offset + 50));
  }
}

async function safelySyncCheckinPayrollExpenses(env, affectedPairs) {
  try {
    await syncCheckinPayrollExpenses(env, affectedPairs);
  } catch (error) {
    console.error('Gagal sinkronisasi pengeluaran honor crew:', error);
  }
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(String(text))
  );
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function createAdminToken(secret, account = null) {
  const payload = base64UrlEncode(JSON.stringify({
    scope: 'admin',
    ...(account ? { account_id: account.account_id, role: account.role } : {}),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
  const signature = await hmacSha256Hex(secret, payload);
  return `${payload}.${signature}`;
}

async function createCrewToken(secret, crew) {
  const payload = base64UrlEncode(JSON.stringify({
    scope: 'crew',
    crew,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
  const signature = await hmacSha256Hex(secret, payload);
  return `${payload}.${signature}`;
}

function hexToBytes(value) {
  return new Uint8Array(String(value).match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
}

function bytesToHex(value) {
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashDashboardPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: hexToBytes(salt),
    iterations: 100000,
  }, key, 256);
  return bytesToHex(hash);
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left));
  const rightBytes = new TextEncoder().encode(String(right));
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

function hasDashboardRole(tokenData) {
  return ['Master', 'Admin', 'IT'].includes(tokenData?.role);
}

function hasManagementRole(tokenData) {
  return ['Master', 'Admin'].includes(tokenData?.role);
}

// Akun Admin biasa (bukan Master, IT, dan bukan admin-1/"Operasional"): akses dibatasi. Mengubah Daftar Crew dan
// Daftar Agen wajib PIN Master, dan tidak boleh menghapus/mereset absensi karyawan kantor.
function isRestrictedAdmin(tokenData) {
  return tokenData?.role === 'Admin' && tokenData?.account_id !== 'admin-1';
}

// Memverifikasi PIN Master 4 digit. Mengembalikan null kalau benar, atau { error, status } kalau gagal.
async function checkMasterDeletePin(env, value) {
  const pin = String(value || '').trim();
  if (!/^\d{4}$/.test(pin)) return { error:'Masukkan PIN Master tepat 4 digit.', status:400 };
  const master = await env.DB.prepare(`
    SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
    WHERE account_id = 'master' AND active = 1
  `).first();
  if (!master?.delete_pin_hash) return { error:'PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', status:409 };
  const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
  if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return { error:'PIN Master salah.', status:403 };
  return null;
}

// Ganti Kode Properti: dibatasi ke Master dan akun admin-1 (ditampilkan sebagai
// "Operasional" di Member Area), bukan ke seluruh role Admin/IT.
function canEditPropertyCodes(tokenData) {
  return ['master', 'admin-1'].includes(tokenData?.account_id);
}

async function getAdminTokenPayload(request, secret) {
  if (!secret) return null;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const expectedSignature = await hmacSha256Hex(secret, payload);
    if (!constantTimeEqual(signature, expectedSignature)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    return data.scope === 'admin' && Number(data.exp) > Math.floor(Date.now() / 1000)
      ? data
      : null;
  } catch {
    return null;
  }
}

async function getCrewTokenPayload(request, secret) {
  if (!secret) return null;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const expectedSignature = await hmacSha256Hex(secret, payload);
    if (!constantTimeEqual(signature, expectedSignature)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    return data.scope === 'crew' && typeof data.crew === 'string' && Number(data.exp) > Math.floor(Date.now() / 1000)
      ? data
      : null;
  } catch {
    return null;
  }
}

async function createOwnerToken(secret, ownerId) {
  const payload = base64UrlEncode(JSON.stringify({
    scope: 'owner',
    owner_id: ownerId,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
  return `${payload}.${await hmacSha256Hex(secret, payload)}`;
}

async function getOwnerTokenPayload(request, secret) {
  if (!secret) return null;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const expectedSignature = await hmacSha256Hex(secret, payload);
    if (!constantTimeEqual(signature, expectedSignature)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    return data.scope === 'owner' && /^[A-Za-z0-9_-]{1,80}$/.test(data.owner_id || '') && Number(data.exp) > Math.floor(Date.now() / 1000)
      ? data
      : null;
  } catch {
    return null;
  }
}

// Dipakai bersama oleh POST dan PATCH booking: validasi agen (opsional) dan hitung fee-nya.
// Melempar Error dengan pesan siap pakai untuk bad() kalau datanya tidak valid.
// Kolom guest_count baru ditambahkan lewat migration; sebelum dijalankan, booking tetap tersimpan tanpa jumlah tamu.
async function saveBookingGuestCount(env, bookingId, guestCount) {
  try {
    await env.DB.prepare('UPDATE dashboard_bookings SET guest_count = ? WHERE id = ?').bind(guestCount, bookingId).run();
  } catch (error) {
    if (!/no such column|guest_count/i.test(String(error?.message || error))) throw error;
  }
}

async function checkExtraBedStock(env, { propertyId, propertyName, checkin, checkout, quantity, excludeId = '' }) {
  const settingsResult = await env.DB.prepare(`SELECT property_id, stock FROM extra_bed_property_settings`).all();
  const settings = settingsResult.results || [];
  if (!settings.length) return null;
  // Pemakaian per properti pada rentang tanggal ini (tidak termasuk booking yang sedang diedit).
  const usageResult = await env.DB.prepare(`
    SELECT property_id, COALESCE(SUM(extra_bed_quantity), 0) AS used FROM dashboard_bookings
    WHERE id <> ? AND LOWER(status) NOT IN ('cancelled', 'canceled') AND extra_bed_quantity > 0
      AND checkin < ? AND checkout > ?
    GROUP BY property_id
  `).bind(excludeId, checkout, checkin).all();
  const usedByProperty = new Map((usageResult.results || []).map(row => [row.property_id, Number(row.used) || 0]));
  const usedBefore = [...usedByProperty.values()].reduce((sum, qty) => sum + qty, 0);
  usedByProperty.set(propertyId, (usedByProperty.get(propertyId) || 0) + quantity);

  // Stok sendiri per properti dipakai dulu; kelebihannya diambil dari sisa pinjaman suplier.
  const ownedStockOf = id => Number(settings.find(row => row.property_id === id)?.stock) || 0;
  const loanRow = await env.DB.prepare(`SELECT COALESCE(SUM(quantity - returned), 0) AS outstanding FROM extra_bed_suppliers`).first();
  const loanOutstanding = Number(loanRow?.outstanding || 0);
  const ownedTotal = settings.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
  let overflow = 0;
  for (const [id, qty] of usedByProperty) {
    overflow += Math.max(0, qty - ownedStockOf(id));
  }
  if (overflow > loanOutstanding) {
    const available = Math.max(0, ownedTotal + loanOutstanding - usedBefore);
    return `Stok extra bed ${propertyName || propertyId} tidak cukup pada tanggal tersebut. Tersedia ${available} unit (stok sendiri ${ownedTotal} + sisa pinjaman suplier ${loanOutstanding}, dipakai ${usedBefore}).`;
  }
  return null;
}

async function resolveBookingAgentFee(env, body, amount) {
  const agentId = String(body.agentId || '').trim();
  if (!agentId) return { agentId: '', agentName: '', feeType: '', feeValue: 0, feeAmount: 0 };
  // Tidak memfilter active=1: booking lama yang agennya sudah dinonaktifkan tetap harus bisa diedit
  // (dropdown di form hanya menawarkan agen aktif untuk pilihan baru, jadi ini aman).
  const agent = await env.DB.prepare('SELECT id, name FROM dashboard_agents WHERE id = ?').bind(agentId).first();
  if (!agent) throw new Error('Agen tidak ditemukan.');
  const feeType = body.agentFeeType === 'percent' ? 'percent' : 'amount';
  const feeValue = Number(body.agentFeeValue || 0);
  if (!Number.isSafeInteger(feeValue) || feeValue < 0 || (feeType === 'percent' && feeValue > 100)) {
    throw new Error('Fee agen tidak valid.');
  }
  const feeAmount = feeType === 'percent' ? Math.round(amount * feeValue / 100) : feeValue;
  return { agentId, agentName: agent.name, feeType, feeValue, feeAmount };
}

async function isAdminRequest(request, secret) {
  const tokenData = await getAdminTokenPayload(request, secret);
  return Boolean(tokenData && tokenData.role !== 'IT');
}

function isItSupportAccount(tokenData) {
  return tokenData?.account_id === 'it' && tokenData?.role === 'IT';
}

async function createAgentToken(secret, agentId) {
  const payload = base64UrlEncode(JSON.stringify({
    scope: 'agent',
    agent_id: agentId,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
  return `${payload}.${await hmacSha256Hex(secret, payload)}`;
}

async function getAgentTokenPayload(request, secret) {
  if (!secret) return null;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const expectedSignature = await hmacSha256Hex(secret, payload);
    if (!constantTimeEqual(signature, expectedSignature)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    return data.scope === 'agent' && typeof data.agent_id === 'string' && data.agent_id && Number(data.exp) > Math.floor(Date.now() / 1000)
      ? data
      : null;
  } catch {
    return null;
  }
}

// Gaji pokok per hari crew (Rp). null = tidak dikirim, NaN = tidak valid.
function parseDailySalary(value) {
  if (value === undefined || value === null || value === '') return null;
  const amount = Math.round(Number(value));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 10000000 ? amount : NaN;
}

// Jenis pengeluaran lapangan. Daftar khusus Crew (crew_group terisi, urut crew_sort); sebelum migration dijalankan
// atau kalau belum ada kategori yang ditandai, pakai seluruh kategori pengeluaran.
async function listFieldExpenseCategories(env) {
  try {
    const grouped = await env.DB.prepare(`
      SELECT id, name, crew_group AS "group" FROM finance_categories
      WHERE kind = 'expense' AND active = 1 AND crew_group <> ''
      ORDER BY crew_sort, name COLLATE NOCASE
    `).all();
    if ((grouped.results || []).length) return grouped.results;
  } catch (error) {
    if (!/no such column: crew_(group|sort)/i.test(String(error?.message || error))) throw error;
  }
  const result = await env.DB.prepare(`
    SELECT id, name FROM finance_categories WHERE kind = 'expense' AND active = 1 ORDER BY name COLLATE NOCASE
  `).all();
  return result.results || [];
}

// Menyimpan pengeluaran lapangan (Crew atau Operasional) berstatus 'pending': belum dihitung sebagai pengeluaran sampai
// dikirim ke Admin dari Dashboard Check In Crew dan diterima di menu Laporan Crew & Operasional. Tanpa kolom review
// (migration belum dijalankan) ditolak, supaya tidak ada pengeluaran yang masuk tanpa melewati Laporan.
// Mengembalikan { error, status } kalau gagal validasi, atau { id, proofUrl } kalau tersimpan.
async function savePendingFieldExpense(env, origin, { createdBy, payee, body, dailyLimit = 0 }) {
  const categoryId = String(body.category_id || '').trim();
  const propertyName = String(body.property || '').trim();
  const amount = Number(body.amount);
  const entryDate = String(body.entry_date || '').trim();
  const description = String(body.description || '').trim();
  const receipt = String(body.receipt || '');
  const noReceiptReason = String(body.no_receipt_reason || '').trim();
  if (!propertyName || propertyName.length > 180 || !Number.isSafeInteger(amount) || amount <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || description.length > 160) {
    return { error:'Properti, jumlah, dan tanggal pengeluaran wajib valid.', status:400 };
  }
  // Tanpa foto struk: wajib menulis alasan (kolom no_receipt_reason).
  const hasReceipt = receipt.startsWith('data:image/');
  if (!hasReceipt && (noReceiptReason.length < 3 || noReceiptReason.length > 160)) {
    return { error:'Foto struk wajib dilampirkan, atau isi alasan tidak ada struk (3-160 karakter).', status:400 };
  }
  const category = await env.DB.prepare(`
    SELECT id, name FROM finance_categories WHERE id = ? AND kind = 'expense' AND active = 1
  `).bind(categoryId).first();
  if (!category) return { error:'Jenis pengeluaran tidak valid.', status:400 };
  if (dailyLimit) {
    const countOwn = hideDeleted => env.DB.prepare(`
      SELECT COUNT(*) AS count FROM finance_entries WHERE created_by = ? AND entry_date = ?${hideDeleted ? ' AND crew_hidden = 0' : ''}
    `).bind(createdBy, entryDate).first();
    const countRow = await countOwn(true).catch(error => {
      if (!/no such column: crew_hidden/i.test(String(error?.message || error))) throw error;
      return countOwn(false);
    });
    if (Number(countRow?.count || 0) >= dailyLimit) return { error:`Batas ${dailyLimit} struk per hari sudah tercapai.`, status:409 };
  }
  let parsedReceipt = null;
  if (hasReceipt) {
    try { parsedReceipt = parseDataUrl(receipt); }
    catch { return { error:'Foto struk tidak valid.', status:400 }; }
    if (!String(parsedReceipt.contentType || '').startsWith('image/')) return { error:'Foto struk harus berupa gambar.', status:400 };
    if (parsedReceipt.bytes.byteLength >= 100 * 1024) return { error:'Foto struk wajib di bawah 100 KB.', status:400 };
  }

  const id = crypto.randomUUID();
  let proofUrl = '';
  if (parsedReceipt) {
    const receiptKey = `finance/crew-expense/${id}.jpg`;
    await env.PHOTOS.put(receiptKey, parsedReceipt.bytes, {
      httpMetadata:{ contentType:parsedReceipt.contentType || 'image/jpeg' },
    });
    proofUrl = publicFileUrl(origin, receiptKey);
  }
  const reasonToStore = hasReceipt ? '' : noReceiptReason;
  const propertyRow = await env.DB.prepare('SELECT id FROM properties WHERE name = ? COLLATE NOCASE LIMIT 1')
    .bind(propertyName).first();
  const createdAt = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO finance_entries (
        id, kind, category_id, category_name, property_id, property_name,
        entry_date, amount, description, payee, recurrence, created_by, created_at, proof_url,
        review_status, review_sent_at${reasonToStore ? ', no_receipt_reason' : ''}
      ) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, 'once', ?, ?, ?, 'pending', ''${reasonToStore ? ', ?' : ''})
    `).bind(id, category.id, category.name, propertyRow?.id || null, propertyName,
      entryDate, amount, description, payee, createdBy, createdAt, proofUrl,
      ...(reasonToStore ? [reasonToStore] : [])).run();
  } catch (error) {
    if (reasonToStore && /no_receipt_reason/i.test(String(error?.message || error))) {
      return { error:'Alasan tanpa struk belum bisa disimpan: jalankan migration-crew-expense-no-receipt.sql di D1.', status:503 };
    }
    if (/review_status|review_sent_at/i.test(String(error?.message || error))) {
      return { error:'Pengeluaran belum bisa disimpan: fitur review belum aktif di server. Hubungi admin. (Jalankan migration-crew-expense-review.sql di D1.)', status:503 };
    }
    throw error;
  }
  return { id, proofUrl };
}

// ===== Artikel / Blog (artikel.yourhome.id) =====
// Tabel: articles (migrations/migration-articles.sql). Gambar disimpan di R2 (PHOTOS) pada folder articles/.
const ARTICLE_CATEGORIES = ['properti', 'wisata', 'pariwisata', 'kuliner', 'tips', 'budaya'];
const ARTICLE_RESERVED_SLUGS = new Set(['categories', 'sitemap', 'rss', 'feed', 'images', 'page']);
const ARTICLE_MIN_WORDS_PUBLISH = 100;
const ARTICLE_MAX_TAGS = 8;
const ARTICLE_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ARTICLE_IMAGE_TYPES = { 'image/webp':'webp', 'image/jpeg':'jpg', 'image/png':'png', 'image/gif':'gif' };
const ARTICLE_LIST_COLUMNS = 'id, slug, title, excerpt, category, tags, cover_url, cover_alt, status, published_at, meta_title, meta_description, author, author_account_id, created_at, updated_at';
const ARTICLE_ALLOWED_TAGS = { p:[], br:[], h2:[], h3:[], h4:[], strong:[], em:[], u:[], s:[], a:['href'], ul:[], ol:[], li:[], blockquote:[], img:['src', 'alt'] };
const ARTICLE_TAG_MAP = { b:'strong', i:'em', h1:'h2', h5:'h4', h6:'h4' };
const ARTICLE_DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'noscript', 'svg', 'math', 'template', 'head', 'title', 'base', 'frame', 'frameset']);

function slugifyArticle(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

function safeArticleUrl(value, { image = false } = {}) {
  const v = String(value || '').trim();
  if (!v || v.length > 2048 || /[\u0000- \u007f]/.test(v)) return '';
  if (image) return /^https:\/\//i.test(v) || /^\/(?!\/)/.test(v) ? v : '';
  return /^https?:\/\//i.test(v) || /^(mailto:|tel:|#)/i.test(v) || /^\/(?!\/)/.test(v) ? v : '';
}

// Sanitasi isi artikel: hanya tag/atribut daftar putih yang lolos. Dijalankan di Worker karena data dari browser tidak boleh dipercaya.
async function sanitizeArticleHtml(html) {
  const rewriter = new HTMLRewriter()
    .onDocument({ comments(comment) { comment.remove(); } })
    .on('*', {
      element(el) {
        const original = el.tagName.toLowerCase();
        if (ARTICLE_DROP_TAGS.has(original)) { el.remove(); return; }
        const tag = ARTICLE_TAG_MAP[original] || original;
        const allowedAttrs = ARTICLE_ALLOWED_TAGS[tag];
        if (!allowedAttrs) { el.removeAndKeepContent(); return; }
        const attrs = [...el.attributes];
        for (const [name] of attrs) el.removeAttribute(name);
        if (tag !== original) el.tagName = tag;
        const attr = name => (attrs.find(([key]) => key.toLowerCase() === name) || [])[1];
        if (tag === 'a') {
          const href = safeArticleUrl(attr('href'));
          if (!href) { el.removeAndKeepContent(); return; }
          el.setAttribute('href', href);
          if (/^https?:\/\//i.test(href) && !/^https?:\/\/([a-z0-9-]+\.)*yourhome\.id(\/|$)/i.test(href)) {
            el.setAttribute('rel', 'noopener nofollow');
            el.setAttribute('target', '_blank');
          }
        } else if (tag === 'img') {
          const src = safeArticleUrl(attr('src'), { image:true });
          if (!src) { el.remove(); return; }
          el.setAttribute('src', src);
          el.setAttribute('alt', String(attr('alt') || '').trim().slice(0, 200));
        }
      },
    });
  const cleaned = await rewriter
    .transform(new Response(String(html || ''), { headers:{ 'Content-Type':'text/html; charset=utf-8' } }))
    .text();
  return cleaned.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '').trim();
}

function articleWordCount(html) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

function parseArticleTags(value) {
  try {
    const tags = JSON.parse(value || '[]');
    return Array.isArray(tags) ? tags.map(tag => String(tag)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function articleRow(row) {
  return row ? { ...row, tags:parseArticleTags(row.tags) } : row;
}

// Memvalidasi payload editor. Mengembalikan { error } atau { value } yang siap disimpan.
async function normalizeArticleInput(body, existing) {
  const title = String(body.title || '').trim();
  if (!title) return { error:'Judul wajib diisi.' };
  if (title.length > 160) return { error:'Judul maksimal 160 karakter.' };

  const slug = slugifyArticle(body.slug || title);
  if (!slug) return { error:'Slug tidak valid.' };
  if (ARTICLE_RESERVED_SLUGS.has(slug)) return { error:'Slug memakai kata yang dicadangkan sistem. Ubah slug.' };

  const status = body.status === 'published' ? 'published' : 'draft';
  const category = String(body.category || '').trim();
  if (category && !ARTICLE_CATEGORIES.includes(category)) return { error:'Kategori tidak dikenal.' };

  const excerpt = String(body.excerpt || '').trim();
  const metaTitle = String(body.meta_title || '').trim();
  const metaDescription = String(body.meta_description || '').trim();
  const coverAlt = String(body.cover_alt || '').trim();
  if (excerpt.length > 300) return { error:'Ringkasan maksimal 300 karakter.' };
  if (metaTitle.length > 90) return { error:'Judul SEO maksimal 90 karakter.' };
  if (metaDescription.length > 200) return { error:'Deskripsi SEO maksimal 200 karakter.' };
  if (coverAlt.length > 140) return { error:'Teks alternatif gambar maksimal 140 karakter.' };

  const rawContent = String(body.content || '');
  if (rawContent.length > 400000) return { error:'Isi artikel terlalu panjang.' };
  const content = await sanitizeArticleHtml(rawContent);

  const coverUrl = body.cover_url ? safeArticleUrl(body.cover_url, { image:true }) : '';
  if (body.cover_url && !coverUrl) return { error:'URL gambar utama tidak valid.' };

  const tags = [...new Set((Array.isArray(body.tags) ? body.tags : [])
    .map(tag => String(tag).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30))
    .filter(Boolean))];
  if (tags.length > ARTICLE_MAX_TAGS) return { error:`Maksimal ${ARTICLE_MAX_TAGS} tag.` };

  let publishedAt = null;
  if (status === 'published') {
    if (!category) return { error:'Pilih kategori sebelum menerbitkan.' };
    if (!coverUrl) return { error:'Tambahkan gambar utama sebelum menerbitkan.' };
    const words = articleWordCount(content);
    if (words < ARTICLE_MIN_WORDS_PUBLISH) return { error:`Isi artikel baru ${words} kata. Minimal ${ARTICLE_MIN_WORDS_PUBLISH} kata untuk diterbitkan.` };
    if (/<img(?![^>]*\balt="[^"]+")/i.test(content)) return { error:'Ada gambar di dalam artikel yang belum diberi teks alternatif.' };
    const requested = body.published_at || (existing?.status === 'published' ? existing.published_at : null);
    const parsed = requested ? new Date(requested) : new Date();
    if (Number.isNaN(parsed.getTime())) return { error:'Waktu terbit tidak valid.' };
    publishedAt = parsed.toISOString();
  }

  return { value:{ slug, title, excerpt, content, category, tags:JSON.stringify(tags), cover_url:coverUrl, cover_alt:coverAlt, status, published_at:publishedAt, meta_title:metaTitle, meta_description:metaDescription } };
}

const escapeLike = value => String(value).replace(/[\\%_]/g, char => `\\${char}`);

// Memberi tahu GitHub Actions (repo saerobotic/artikel_yourhome) untuk build ulang & deploy situs statis.
// Butuh secret GITHUB_TOKEN (Personal Access Token dengan izin "Actions: Read and write" pada repo tsb).
// Gagal kirim notifikasi tidak boleh membatalkan penyimpanan artikel, jadi errornya hanya dicatat.
async function triggerArticlesDeploy(env) {
  const token = String(env.GITHUB_TOKEN || '').trim();
  if (!token) { console.warn('GITHUB_TOKEN belum diset: deploy artikel.yourhome.id tidak otomatis.'); return; }
  try {
    const response = await fetch('https://api.github.com/repos/saerobotic/artikel_yourhome/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'your-home-checkin-api',
      },
      body: JSON.stringify({ event_type: 'article-published' }),
    });
    if (!response.ok) console.warn(`Gagal memicu deploy artikel.yourhome.id: HTTP ${response.status} ${await response.text().catch(() => '')}`);
  } catch (error) {
    console.warn(`Gagal memicu deploy artikel.yourhome.id: ${error?.message || error}`);
  }
}

async function handleArticleRoutes({ request, env, url, path, json, bad }) {
  if (!/^\/(admin\/)?articles(\/|$)/.test(path)) return null;
  const method = request.method;
  const missingTable = error => /no such table: articles/i.test(String(error?.message || error));
  const migrationNeeded = () => bad('Tabel articles belum ada. Jalankan migration-articles.sql di D1.', 503);

  try {
    // ---------- Publik: hanya artikel terbit (published_at sudah lewat) ----------
    if (!path.startsWith('/admin/')) {
      if (method !== 'GET') return bad('Metode tidak didukung', 405);
      const cached = response => { response.headers.set('Cache-Control', 'public, max-age=60'); return response; };
      const nowIso = new Date().toISOString();

      if (path === '/articles/categories') {
        const result = await env.DB.prepare(`
          SELECT category, COUNT(*) AS total FROM articles
          WHERE status = 'published' AND published_at <= ? AND category != ''
          GROUP BY category
        `).bind(nowIso).all();
        return cached(json({ ok:true, data:result.results || [] }));
      }

      if (path === '/articles') {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 12, 1), 50);
        const offset = Math.max(parseInt(url.searchParams.get('offset'), 10) || 0, 0);
        const category = String(url.searchParams.get('category') || '').trim();
        const tag = String(url.searchParams.get('tag') || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
        const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
        const includeParam = String(url.searchParams.get('include') || '').toLowerCase();
        const includeContent = includeParam.split(',').map(part => part.trim()).includes('content');
        const selectColumns = includeContent ? `${ARTICLE_LIST_COLUMNS}, content` : ARTICLE_LIST_COLUMNS;
        const where = ["status = 'published'", 'published_at <= ?'];
        const binds = [nowIso];
        if (ARTICLE_CATEGORIES.includes(category)) { where.push('category = ?'); binds.push(category); }
        if (tag) { where.push('tags LIKE ?'); binds.push(`%"${tag}"%`); }
        if (q) { where.push("(title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\')"); binds.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`); }
        const condition = where.join(' AND ');
        const [rows, total] = await Promise.all([
          env.DB.prepare(`SELECT ${selectColumns} FROM articles WHERE ${condition} ORDER BY published_at DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset).all(),
          env.DB.prepare(`SELECT COUNT(*) AS total FROM articles WHERE ${condition}`).bind(...binds).first(),
        ]);
        return cached(json({ ok:true, data:(rows.results || []).map(articleRow), pagination:{ total:Number(total?.total || 0), limit, offset } }));
      }

      const slugMatch = path.match(/^\/articles\/([^/]+)$/);
      if (slugMatch) {
        const article = await env.DB.prepare(`SELECT * FROM articles WHERE slug = ? AND status = 'published' AND published_at <= ?`)
          .bind(decodeURIComponent(slugMatch[1]), nowIso).first();
        if (!article) return bad('Artikel tidak ditemukan', 404);
        const related = await env.DB.prepare(`
          SELECT ${ARTICLE_LIST_COLUMNS} FROM articles
          WHERE status = 'published' AND published_at <= ? AND id != ? AND category = ?
          ORDER BY published_at DESC LIMIT 3
        `).bind(nowIso, article.id, article.category).all();
        return cached(json({ ok:true, data:articleRow(article), related:(related.results || []).map(articleRow) }));
      }
      return bad('Endpoint tidak ditemukan', 404);
    }

    // ---------- Admin: Master / Admin ----------
    const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
    const tokenData = await getAdminTokenPayload(request, adminSecret);
    if (!tokenData) return bad('Login admin diperlukan', 401);
    if (tokenData.account_id && !hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola artikel.', 403);

    // Upload gambar (gambar utama dan gambar di dalam isi) ke R2
    if (method === 'POST' && path === '/admin/articles/images') {
      const body = await request.json();
      const dataUrl = String(body.data_url || '');
      if (dataUrl.length > Math.ceil(ARTICLE_MAX_IMAGE_BYTES * 1.4)) return bad('Gambar terlalu besar. Maksimal 2 MB.', 413);
      let parsed;
      try { parsed = parseDataUrl(dataUrl); } catch { return bad('Format gambar tidak valid.'); }
      const extension = ARTICLE_IMAGE_TYPES[parsed.contentType];
      if (!extension) return bad('Format gambar harus JPG, PNG, WebP, atau GIF.');
      if (parsed.bytes.byteLength > ARTICLE_MAX_IMAGE_BYTES) return bad('Gambar terlalu besar. Maksimal 2 MB.', 413);
      const [year, month] = new Date().toISOString().slice(0, 7).split('-');
      const key = `articles/${year}/${month}/${crypto.randomUUID()}.${extension}`;
      await env.PHOTOS.put(key, parsed.bytes, { httpMetadata:{ contentType:parsed.contentType, cacheControl:'public, max-age=31536000, immutable' } });
      return json({ ok:true, data:{ url:publicFileUrl(url.origin, key), key } }, 201);
    }

    if (method === 'GET' && path === '/admin/articles') {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 500, 1), 1000);
      const rows = await env.DB.prepare(`SELECT ${ARTICLE_LIST_COLUMNS} FROM articles ORDER BY updated_at DESC LIMIT ?`).bind(limit).all();
      return json({ ok:true, data:(rows.results || []).map(articleRow) });
    }

    if (method === 'POST' && path === '/admin/articles') {
      const result = await normalizeArticleInput(await request.json(), null);
      if (result.error) return bad(result.error);
      const a = result.value;
      const taken = await env.DB.prepare('SELECT id FROM articles WHERE slug = ?').bind(a.slug).first();
      if (taken) return bad('Slug sudah dipakai artikel lain. Ubah slug.', 409);
      let authorName = tokenData.account_id || 'Admin';
      try {
        const user = await env.DB.prepare('SELECT display_name FROM dashboard_users WHERE account_id = ?').bind(tokenData.account_id || '').first();
        if (user?.display_name) authorName = user.display_name;
      } catch { /* tabel akun belum ada: pakai account_id */ }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO articles (id, slug, title, excerpt, content, category, tags, cover_url, cover_alt, status, published_at, meta_title, meta_description, author, author_account_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, a.slug, a.title, a.excerpt, a.content, a.category, a.tags, a.cover_url, a.cover_alt, a.status, a.published_at, a.meta_title, a.meta_description, authorName, tokenData.account_id || '', now, now).run();
      const created = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first();
      if (a.status === 'published') await triggerArticlesDeploy(env);
      return json({ ok:true, data:articleRow(created) }, 201);
    }

    const idMatch = path.match(/^\/admin\/articles\/([^/]+)$/);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const existing = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first();
      if (!existing) return bad('Artikel tidak ditemukan', 404);

      if (method === 'GET') return json({ ok:true, data:articleRow(existing) });

      if (method === 'PUT') {
        const result = await normalizeArticleInput(await request.json(), existing);
        if (result.error) return bad(result.error);
        const a = result.value;
        const taken = await env.DB.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').bind(a.slug, id).first();
        if (taken) return bad('Slug sudah dipakai artikel lain. Ubah slug.', 409);
        await env.DB.prepare(`
          UPDATE articles SET slug = ?, title = ?, excerpt = ?, content = ?, category = ?, tags = ?, cover_url = ?, cover_alt = ?,
            status = ?, published_at = ?, meta_title = ?, meta_description = ?, updated_at = ?
          WHERE id = ?
        `).bind(a.slug, a.title, a.excerpt, a.content, a.category, a.tags, a.cover_url, a.cover_alt, a.status, a.published_at, a.meta_title, a.meta_description, new Date().toISOString(), id).run();
        const updated = await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first();
        if (a.status === 'published' || existing.status === 'published') await triggerArticlesDeploy(env);
        return json({ ok:true, data:articleRow(updated) });
      }

      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
        if (existing.status === 'published') await triggerArticlesDeploy(env);
        return json({ ok:true, data:{ id } });
      }
    }
    return bad('Endpoint tidak ditemukan', 404);
  } catch (error) {
    if (missingTable(error)) return migrationNeeded();
    if (/UNIQUE constraint failed: articles\.slug/i.test(String(error?.message || error))) return bad('Slug sudah dipakai artikel lain. Ubah slug.', 409);
    throw error;
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
    const bad = (message, status = 400, extra = {}) => json({ ok:false, error:message, ...extra }, status);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    let path = url.pathname;
    const KOSAN_CURRENT_PERIOD = getKosanCurrentPeriod();
    const KOSAN_PERIODS = buildKosanPeriods(KOSAN_CURRENT_PERIOD);

    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    try {
      // Health check
      if (request.method === 'GET' && path === '/') {
        return json({
          ok: true,
          service: 'your-home-checkin-api',
        });
      }

      // Ambil foto dari R2
      if (request.method === 'GET' && path.startsWith('/files/')) {
        const key = fileKeyFromPath(path);
        const object = await env.PHOTOS.get(key);

        if (!object) {
          return bad('Foto tidak ditemukan', 404, { key });
        }

        const headers = new Headers(corsHeaders);
        headers.set(
          'Content-Type',
          object.httpMetadata?.contentType || 'image/jpeg'
        );
        headers.set('Cache-Control', 'public, max-age=86400');

        return new Response(object.body, { headers });
      }

      // Ambil semua check-in
      if (request.method === 'GET' && path === '/checkins') {
        const date = url.searchParams.get('date');
        let crew = url.searchParams.get('crew');
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const adminAuthorized = await isAdminRequest(request, adminSecret);
        const crewSession = adminAuthorized ? null : await getCrewTokenPayload(request, adminSecret);

        if (!adminAuthorized && !crewSession) {
          return bad('Login admin diperlukan', 401);
        }
        if (crewSession) {
          if (crew && crew !== crewSession.crew) return bad('Sesi crew tidak dapat melihat data crew lain.', 403);
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Tanggal riwayat crew tidak valid.', 400);
          crew = crewSession.crew;
        }

        let sql = 'SELECT * FROM checkins WHERE 1=1';
        const params = [];

        if (date) {
          sql += ' AND work_date = ?';
          params.push(date);
        }

        if (crew) {
          sql += ' AND crew = ?';
          params.push(crew);
        }

        sql += ' ORDER BY created_at DESC LIMIT 500';

        const result = await env.DB
          .prepare(sql)
          .bind(...params)
          .all();

        const rows = (result.results || []).map((row) => ({
          ...row,
          work_photo_urls: safeParseJsonArray(row.work_photo_urls),
        }));

        return json({
          ok: true,
          data: rows,
        });
      }

      if (request.method === 'GET' && path === '/crew/checkins') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Sesi Crew diperlukan untuk membuka dokumentasi.', 401);
        const month = String(url.searchParams.get('month') || '').trim();
        const property = String(url.searchParams.get('property') || '').trim();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
        const offset = Number(url.searchParams.get('offset') || 0);
        if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return bad('Filter bulan dokumentasi tidak valid.');
        if (property.length > 180) return bad('Filter properti terlalu panjang.');
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return bad('Halaman dokumentasi tidak valid.');
        let sql = `
          SELECT * FROM checkins
          WHERE crew = ?
        `;
        const params = [crewSession.crew];
        if (month) {
          const [year, monthNumber] = month.split('-').map(Number);
          const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
          sql += ' AND work_date >= ? AND work_date < ?';
          params.push(`${month}-01`, nextMonth);
        }
        if (property) {
          sql += ' AND unit = ?';
          params.push(property);
        }
        sql += ' ORDER BY work_date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?';
        params.push(limit + 1, offset);
        const result = await env.DB.prepare(sql).bind(...params).all();
        const rows = result.results || [];
        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit).map(row => ({
          ...row,
          work_photo_urls:safeParseJsonArray(row.work_photo_urls),
        }));
        return json({
          ok:true,
          data,
          pagination:{ limit, offset, next_offset:hasMore ? offset + data.length : null, has_more:hasMore },
        });
      }

      if (request.method === 'POST' && path === '/admin/checkins/payroll-sync') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        await syncCheckinPayrollExpenses(env, 'all');
        return json({ ok:true });
      }

      // Ambil daftar crew aktif tanpa mengekspos hash PIN
      if (request.method === 'GET' && path === '/crews') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const result = await env.DB
          .prepare('SELECT name FROM crews WHERE active = 1 ORDER BY name ASC')
          .all();

        return json({
          ok: true,
          data: (result.results || []).map(row => ({ name: row.name })),
        });
      }

      if (request.method === 'POST' && path === '/admin/properties/sync-dashboard') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        let saved;
        try {
          saved = await env.DB.prepare(`
            SELECT data_json FROM dashboard_management_data WHERE id = 'main'
          `).first();
        } catch (error) {
          if (/no such table: dashboard_management_data/i.test(String(error?.message || error))) {
            return bad('Data Dashboard belum tersedia. Jalankan migration-dashboard-management-data.sql di D1.', 503);
          }
          throw error;
        }
        if (!saved) return json({ ok:true, data:{ synced:0 } });
        let managementData;
        try { managementData = JSON.parse(saved.data_json); }
        catch { return bad('Data properti Dashboard rusak dan tidak dapat disinkronkan.', 500); }
        const properties = Array.isArray(managementData.properties) ? managementData.properties : [];
        const statements = await buildDashboardCatalogStatements(env, properties, new Date().toISOString());
        if (statements.length) await env.DB.batch(statements);
        return json({ ok:true, data:{ synced:properties.length } });
      }

      if (request.method === 'GET' && path === '/admin/properties') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const result = await env.DB.prepare(`
          SELECT id, dashboard_id, property_code, publication_status, active, name, category,
                 location, price, weekday_price, weekend_price, beds, baths, guests,
                 image_url, image_urls, map_query, map_link, map_embed, description,
                 room_options, external_bookings, sort_order
          FROM properties
          ORDER BY active DESC, sort_order ASC, name ASC
        `).all();
        return json({ ok:true, data:(result.results || []).map(row => mapPropertyRecord(row, true)) });
      }

      // Ambil properti aktif untuk website publik
      // ================= GANTI KODE PROPERTI =================
      // Login Dashboard (Master atau admin-1/"Operasional") wajib sebelum GET nama+kode
      // atau POST perubahan. POST tetap mengirim notifikasi Telegram ke Sigit.
      if (request.method === 'GET' && path === '/property-codes') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!canEditPropertyCodes(tokenData)) return bad('Login Master atau Operasional diperlukan.', 401);
        const result = await env.DB.prepare(`
          SELECT id, dashboard_id, property_code, publication_status, active, name, category
          FROM properties ORDER BY name COLLATE NOCASE
        `).all();
        return json({ ok:true, data:(result.results || []).map(row => ({
          id:row.id, name:row.name, category:row.category, property_code:row.property_code || '',
          archived: row.publication_status === 'archived' || Number(row.active) === 0,
        })) });
      }

      if (request.method === 'POST' && path === '/property-codes') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!canEditPropertyCodes(tokenData)) return bad('Login Master atau Operasional diperlukan.', 401);
        const rate = await reserveLoginAttempt(env, request, 'property-code-change');
        if (rate.limited) return bad('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedPinHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedPinHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        const submittedBy = String(body.submitted_by || '').trim().slice(0, 120);
        const changes = Array.isArray(body.changes) ? body.changes : [];
        if (!changes.length) return bad('Tidak ada data kode untuk disimpan.');
        if (changes.length > 300) return bad('Terlalu banyak baris dalam satu kali kirim.');
        const validChange = change => change && typeof change.id === 'string' && change.id &&
          typeof change.new_code === 'string' && /^[A-Za-z0-9-]{1,20}$/.test(change.new_code.trim());
        const cleaned = changes.filter(validChange).map(change => ({ id:change.id, new_code:change.new_code.trim().toUpperCase() }));
        if (changes.some(change => !validChange(change))) {
          return bad('Format kode baru tidak valid. Gunakan huruf, angka, dan tanda minus saja (maks 20 karakter).');
        }

        const rows = await env.DB.prepare('SELECT id, dashboard_id, name, property_code FROM properties').all();
        const byId = new Map((rows.results || []).map(row => [row.id, row]));
        const actual = cleaned.filter(change => byId.has(change.id) && byId.get(change.id).property_code !== change.new_code);
        if (!actual.length) return bad('Tidak ada kode yang berubah dari sebelumnya.');

        const finalCodes = new Map((rows.results || []).map(row => [row.id, row.property_code]));
        actual.forEach(change => finalCodes.set(change.id, change.new_code));
        const seenCodes = new Map();
        for (const [id, code] of finalCodes) {
          if (!code) continue;
          if (seenCodes.has(code)) {
            return bad(`Kode "${code}" dipakai lebih dari satu properti. Pastikan setiap kode unik sebelum menyimpan.`, 409);
          }
          seenCodes.set(code, id);
        }

        const now = new Date().toISOString();
        const statements = actual.map(change => env.DB.prepare(`
          UPDATE properties SET property_code = ?, updated_at = ? WHERE id = ?
        `).bind(change.new_code, now, change.id));

        // Sinkron juga ke dashboard_management_data, supaya kode baru tidak tertimpa balik
        // saat Dashboard menyimpan ulang daftar Owner/properti (lihat buildDashboardCatalogStatements).
        const saved = await env.DB.prepare(`SELECT data_json FROM dashboard_management_data WHERE id = 'main'`).first();
        if (saved) {
          try {
            const managementData = JSON.parse(saved.data_json);
            if (Array.isArray(managementData.properties)) {
              let touched = false;
              actual.forEach(change => {
                const dashboardId = byId.get(change.id)?.dashboard_id;
                if (!dashboardId) return;
                const managed = managementData.properties.find(property => property.id === dashboardId);
                if (managed) { managed.code = change.new_code; touched = true; }
              });
              if (touched) {
                statements.push(env.DB.prepare(`
                  UPDATE dashboard_management_data SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = 'main'
                `).bind(JSON.stringify(managementData), 'property-code-form', now));
              }
            }
          } catch {
            // Data Dashboard rusak: lanjutkan simpan kode properti saja, tanpa sinkron management data.
          }
        }

        await env.DB.batch(statements);

        const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
        const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
        if (telegramToken && telegramChatId) {
          const lines = actual.map(change => {
            const row = byId.get(change.id);
            return `${row.name}: ${row.property_code || '(kosong)'} -> ${change.new_code}`;
          });
          const text = [
            'PERUBAHAN KODE PROPERTI',
            submittedBy ? `Dikirim oleh: ${submittedBy}` : '',
            '',
            ...lines,
            '',
            now,
          ].filter(line => line !== '').join('\n');
          try {
            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: telegramChatId, text }),
            });
          } catch {
            // Jangan gagalkan penyimpanan hanya karena notifikasi Telegram gagal terkirim.
          }
        }

        return json({ ok:true, data:{ changed: actual.length } });
      }

      if (request.method === 'GET' && path === '/properties') {
        // Booking yang sudah lewat tidak dibutuhkan untuk ketersediaan; tanggal hari ini mengikuti zona Jakarta.
        const availabilityFrom = new Date().toLocaleDateString('en-CA', { timeZone:'Asia/Jakarta' });
        const [result, bookingResult] = await Promise.all([
          env.DB.prepare(`
            SELECT id, name, category, location, price, weekday_price, weekend_price,
                   beds, baths, guests, image_url, image_urls, map_query, map_link,
                   map_embed, description, room_options, external_bookings, sort_order,
                   publication_status, dashboard_id
            FROM properties
            WHERE active = 1 AND publication_status = 'active'
            ORDER BY sort_order ASC, name ASC
          `).all(),
          env.DB.prepare(`
            SELECT property_id, property_name, checkin, checkout
            FROM dashboard_bookings
            WHERE LOWER(TRIM(status)) NOT IN ('cancelled', 'canceled') AND checkout >= ?
          `).bind(availabilityFrom).all(),
        ]);
        const bookings = bookingResult.results || [];
        const data = (result.results || []).map(row => {
          const mapped = mapPropertyRecord(row);
          const linkedIds = new Set([String(row.id || ''), String(row.dashboard_id || '')]);
          const dashboardBookings = bookings
            .filter(booking => linkedIds.has(String(booking.property_id || '')))
            .map(booking => ({
              start_date:String(booking.checkin || ''),
              end_date:String(booking.checkout || ''),
              room_name:'',
            }))
            .filter(booking => /^\d{4}-\d{2}-\d{2}$/.test(booking.start_date) && /^\d{4}-\d{2}-\d{2}$/.test(booking.end_date));
          return { ...mapped, external_bookings:[...mapped.external_bookings, ...dashboardBookings] };
        });
        return json({ ok:true, data });
      }

      if (request.method === 'GET' && path === '/checkin/properties') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan untuk memuat daftar properti.', 401);
        let saved;
        try {
          saved = await env.DB.prepare(`
            SELECT data_json FROM dashboard_management_data WHERE id = 'main'
          `).first();
        } catch (error) {
          if (/no such table: dashboard_management_data/i.test(String(error?.message || error))) {
            return bad('Daftar properti bersama belum disiapkan. Jalankan migration-dashboard-management-data.sql di D1.', 503);
          }
          throw error;
        }
        if (!saved) return bad('Daftar properti belum disinkronkan dari Dashboard.', 503);
        let managementData;
        try { managementData = JSON.parse(saved.data_json); }
        catch { return bad('Daftar properti di D1 rusak dan tidak dapat dibaca.', 500); }
        const seenNames = new Set();
        const properties = (Array.isArray(managementData.properties) ? managementData.properties : [])
          .filter(property => property && property.active !== false && property.active !== 0 && typeof property.name === 'string' && property.name.trim())
          .filter(property => {
            const key = property.name.trim().toLocaleLowerCase('id');
            if (seenNames.has(key)) return false;
            seenNames.add(key);
            return true;
          })
          .sort((left, right) => left.name.localeCompare(right.name, 'id'))
          .map(property => ({ id:String(property.id || ''), name:property.name.trim(), type:String(property.type || property.category || '') }));

        // Tandai properti yang punya tagihan Extra Bed belum dibayar hari ini, supaya Crew
        // yang check-in di lokasi diingatkan menagih ke tamu (lihat migration-dashboard-extra-bed-payment-status.sql).
        const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
          timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit',
        }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
        try {
          const pendingResult = await env.DB.prepare(`
            SELECT property_name, SUM(extra_bed_quantity * extra_bed_price) AS pending_amount
            FROM dashboard_bookings
            WHERE extra_bed_payment_status = 'pending' AND extra_bed_quantity > 0
              AND LOWER(status) NOT IN ('cancelled', 'canceled') AND checkin <= ? AND checkout > ?
            GROUP BY property_name
          `).bind(today, today).all();
          const pendingByName = new Map((pendingResult.results || []).map(row => [row.property_name.trim().toLocaleLowerCase('id'), Number(row.pending_amount || 0)]));
          properties.forEach(property => {
            const pendingAmount = pendingByName.get(property.name.trim().toLocaleLowerCase('id'));
            if (pendingAmount) { property.pending_extra_bed = true; property.pending_extra_bed_amount = pendingAmount; }
          });
        } catch (error) {
          if (!/no such column: extra_bed_payment_status/i.test(String(error?.message || error))) throw error;
        }
        return json({ ok:true, data:properties });
      }

      // Artikel/blog: /articles* (publik) dan /admin/articles* (Master/Admin)
      const articleResponse = await handleArticleRoutes({ request, env, url, path, json, bad });
      if (articleResponse) return articleResponse;

      // Ambil logo dan kontak website untuk halaman publik
      if (request.method === 'GET' && path === '/settings') {
        const result = await env.DB.prepare(`
          SELECT key, value FROM site_settings
          WHERE key IN ('header_logo', 'footer_logo', 'dashboard_logo', 'footer_location', 'footer_phone', 'footer_email', 'footer_instagram', 'linktree_links', 'kosan_dashboard_sync', 'article_daily_target')
        `).all();
        return json({
          ok: true,
          data: Object.fromEntries((result.results || []).map(row => [row.key, row.value])),
        });
      }

      // Simpan data manual dari admin pusat tanpa GPS dan foto
      if (request.method === 'POST' && path === '/checkins/manual') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();

        const crew = String(body.crew || '').trim();
        const unit = String(body.unit || '').trim();
        const jobType = String(
          body.job_type || body.jobType || ''
        ).trim();
        const workDate = String(
          body.work_date || body.workDate || ''
        ).trim();
        const pin = String(body.pin || '').trim();

        if (!crew || !unit || !jobType || !workDate) {
          return bad(
            'crew, unit, job_type, work_date wajib diisi'
          );
        }
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedPinHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedPinHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO checkins (
              id,
              crew,
              unit,
              job_type,
              lat,
              lng,
              accuracy,
              selfie_url,
              work_photo_urls,
              created_at,
              work_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id,
            crew,
            unit,
            jobType,
            0,
            0,
            0,
            '',
            JSON.stringify([]),
            createdAt,
            workDate
          )
          .run();

        await safelySyncCheckinPayrollExpenses(env, [{ crew, workDate }]);

        return json({
          ok: true,
          data: {
            id,
            crew,
            unit,
            job_type: jobType,
            lat: null,
            lng: null,
            accuracy: null,
            selfie_url: '',
            work_photo_urls: [],
            created_at: createdAt,
            work_date: workDate,
          },
        });
      }

      /**
       * Edit atau hapus SATU check-in
       *
       * PATCH  /checkins/{id}
       * DELETE /checkins/{id}
       */
      const checkinIdMatch = path.match(/^\/checkins\/([^/]+)$/);

      if (checkinIdMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const id = decodeURIComponent(checkinIdMatch[1]);

        const existing = await env.DB
          .prepare('SELECT id, crew, work_date FROM checkins WHERE id = ?')
          .bind(id)
          .first();

        if (!existing) {
          return bad('Check-in tidak ditemukan', 404);
        }

        // Hapus satu check-in saja
        if (request.method === 'DELETE') {
          await env.DB
            .prepare('DELETE FROM checkins WHERE id = ?')
            .bind(id)
            .run();

          await safelySyncCheckinPayrollExpenses(env, [{ crew:existing.crew, workDate:existing.work_date }]);

          return json({
            ok: true,
            deleted_id: id,
          });
        }

        // Edit satu check-in saja
        if (request.method === 'PATCH') {
          const body = await request.json();

          const crew = String(body.crew || '').trim();
          const unit = String(body.unit || '').trim();
          const jobType = String(
            body.job_type || body.jobType || ''
          ).trim();
          const workDate = String(
            body.work_date || body.workDate || ''
          ).trim();

          if (!crew || !unit || !jobType || !workDate) {
            return bad(
              'crew, unit, job_type, work_date wajib diisi'
            );
          }

          await env.DB
            .prepare(`
              UPDATE checkins
              SET crew = ?,
                  unit = ?,
                  job_type = ?,
                  work_date = ?
              WHERE id = ?
            `)
            .bind(
              crew,
              unit,
              jobType,
              workDate,
              id
            )
            .run();

          await safelySyncCheckinPayrollExpenses(env, [
            { crew:existing.crew, workDate:existing.work_date },
            { crew, workDate },
          ]);

          return json({
            ok: true,
            updated_id: id,
          });
        }
      }

      // Hapus berdasarkan tanggal atau semua data
      if (request.method === 'DELETE' && path === '/checkins') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const date = url.searchParams.get('date');
        const all = url.searchParams.get('all') === '1';

        if (date && !all) {
          const affected = await env.DB.prepare('SELECT DISTINCT crew, work_date FROM checkins WHERE work_date = ?')
            .bind(date).all();
          await env.DB
            .prepare('DELETE FROM checkins WHERE work_date = ?')
            .bind(date)
            .run();

          await safelySyncCheckinPayrollExpenses(env, affected.results || []);

          return json({
            ok: true,
            deleted: 'date',
            date,
          });
        }

        if (all) {
          const affected = await env.DB.prepare('SELECT DISTINCT crew, work_date FROM checkins').all();
          await env.DB
            .prepare('DELETE FROM checkins')
            .run();

          await safelySyncCheckinPayrollExpenses(env, affected.results || []);

          return json({
            ok: true,
            deleted: 'all',
          });
        }

        return bad(
          'Gunakan ?date=YYYY-MM-DD atau ?all=1',
          400
        );
      }

      // Simpan check-in baru dari crew dengan GPS dan foto
      if (request.method === 'POST' && path === '/checkin') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan untuk mengirim check-in.', 401);
        const body = await request.json();

        const crew = String(body.crew || '').trim();
        if (crew !== crewSession.crew) return bad('Sesi crew tidak sesuai dengan check-in.', 403);
        // Check-in lokasi: GPS + selfie saja (tanpa properti dan foto hasil kerja).
        // unit dikosongkan supaya tidak ikut dihitung sebagai honor properti.
        const arrivalOnly = body.arrival === true;
        const unit = arrivalOnly ? '' : String(body.unit || '').trim();
        const jobType = arrivalOnly ? 'Check-in Lokasi' : String(body.job_type || body.jobType || '').trim();
        const lat = body.lat;
        const lng = body.lng;
        const accuracy = body.accuracy;

        const selfie =
          body.selfie ||
          body.selfie_base64 ||
          body.selfieBase64;

        const workPhotos =
          body.work_photos ||
          body.work_photos_base64 ||
          body.workPhotosBase64 ||
          body.workPhotos;

        const workDate = String(body.work_date || body.workDate || '').trim();
        const clientCreatedAt = body.created_at || body.createdAt;

        if (!crew || (!arrivalOnly && !unit) || !jobType) {
          return bad('crew, unit, job_type wajib');
        }

        if (unit.length > 180 || jobType.length > 120) {
          return bad('unit atau job_type terlalu panjang');
        }

        if (workDate && !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
          return bad('Tanggal kerja tidak valid.');
        }

        // GPS dan selfie wajib hanya untuk check-in lokasi; laporan pekerjaan boleh tanpa keduanya.
        const hasGps = lat != null && lng != null && lat !== '';
        if (arrivalOnly && (!hasGps || !selfie)) {
          return bad(!hasGps ? 'GPS wajib' : 'selfie wajib');
        }

        const numericLat = hasGps ? Number(lat) : 0;
        const numericLng = hasGps ? Number(lng) : 0;
        const numericAccuracy = hasGps && accuracy != null && accuracy !== '' ? Number(accuracy) : null;

        if (hasGps && (!Number.isFinite(numericLat) || !Number.isFinite(numericLng) ||
            numericLat < -90 || numericLat > 90 || numericLng < -180 || numericLng > 180)) {
          return bad('Koordinat GPS tidak valid');
        }

        if (numericAccuracy != null && (!Number.isFinite(numericAccuracy) || numericAccuracy < 0)) {
          return bad('Akurasi GPS tidak valid');
        }

        if (!arrivalOnly && (!Array.isArray(workPhotos) || workPhotos.length === 0)) {
          return bad('minimal 1 foto hasil kerja');
        }

        if (workPhotos.length > 30) {
          return bad('maksimal 30 foto hasil kerja');
        }

        const id = crypto.randomUUID();
        const today = workDate ||
          new Date().toISOString().slice(0, 10);
        const createdAt = clientCreatedAt || new Date().toISOString();
        const base = `${slug(crew)}/${today}/${id}`;
        const origin = url.origin;

        // Upload selfie (opsional untuk laporan pekerjaan)
        let selfieUrl = '';
        if (selfie) {
          const selfieParsed = parseDataUrl(selfie);
          const selfieKey = `${base}/selfie.jpg`;

          await env.PHOTOS.put(
            selfieKey,
            selfieParsed.bytes,
            {
              httpMetadata: {
                contentType:
                  selfieParsed.contentType || 'image/jpeg',
              },
            }
          );

          selfieUrl = publicFileUrl(
            origin,
            selfieKey
          );
        }

        // Upload foto kerja
        const workPhotoUrls = [];

        for (let index = 0; index < workPhotos.length; index++) {
          const photoParsed = parseDataUrl(workPhotos[index]);
          const photoKey = `${base}/work_${index + 1}.jpg`;

          await env.PHOTOS.put(
            photoKey,
            photoParsed.bytes,
            {
              httpMetadata: {
                contentType:
                  photoParsed.contentType || 'image/jpeg',
              },
            }
          );

          workPhotoUrls.push(
            publicFileUrl(origin, photoKey)
          );
        }

        await env.DB
          .prepare(`
            INSERT INTO checkins (
              id,
              crew,
              unit,
              job_type,
              lat,
              lng,
              accuracy,
              selfie_url,
              work_photo_urls,
              created_at,
              work_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id,
            crew,
            unit,
            jobType,
            numericLat,
            numericLng,
            numericAccuracy,
            selfieUrl,
            JSON.stringify(workPhotoUrls),
            createdAt,
            today
          )
          .run();

          await safelySyncCheckinPayrollExpenses(env, [{ crew, workDate:today }]);

        const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
        const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
        if (telegramToken && telegramChatId) {
          const locationUrl = `https://maps.google.com/?q=${numericLat},${numericLng}`;
          const telegramMessage = [
            'CHECK-IN CREW BERHASIL',
            `Crew: ${crew}`,
            `Properti: ${unit}`,
            `Pekerjaan: ${jobType}`,
            `Tanggal: ${today}`,
            `Waktu: ${createdAt}`,
            `GPS: ${numericLat}, ${numericLng}${numericAccuracy == null ? '' : ` (akurasi ${numericAccuracy} m)`}`,
            'Foto selfie: diterima',
            `Foto hasil kerja: ${workPhotos.length}`,
            `Lokasi: ${locationUrl}`,
          ].join('\n');

          try {
            const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: telegramChatId, text: telegramMessage }),
            });
            const telegramResult = await telegramResponse.json().catch(() => ({}));
            if (!telegramResponse.ok || telegramResult.ok !== true) {
              console.error('Notifikasi check-in gagal dikirim ke Telegram:', telegramResult.description || telegramResponse.status);
            }
          } catch (error) {
            console.error('Notifikasi check-in gagal dikirim ke Telegram:', error);
          }
        }

        return json({
          ok: true,
          data: {
            id,
            crew,
            unit,
            job_type: jobType,
            lat,
            lng,
            accuracy,
            selfie_url: selfieUrl,
            work_photo_urls: workPhotoUrls,
            created_at: createdAt,
            work_date: today,
          },
        });
      }

      // Daftar akun untuk pilihan di halaman login.
      // Sengaja hanya mengirim ID dan role; nama pegawai tidak dikirim keluar sebelum login.
      if (request.method === 'GET' && path === '/dashboard/login-accounts') {
        try {
          const result = await env.DB.prepare(`
            SELECT account_id, role FROM dashboard_users
            WHERE active = 1
            ORDER BY CASE role WHEN 'Master' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END, account_id COLLATE NOCASE
          `).all();
          return json({ ok:true, data: result.results || [] });
        } catch (error) {
          if (/no such table: dashboard_users/i.test(String(error?.message || error))) {
            return json({ ok:true, data: [
              { account_id:'master', role:'Master' },
              { account_id:'admin', role:'Admin' },
              { account_id:'it', role:'IT' },
            ] });
          }
          throw error;
        }
      }

      if (request.method === 'POST' && path === '/dashboard/login') {
        const rate = await reserveLoginAttempt(env, request, 'dashboard-login');
        if (rate.unavailable) return bad('Tabel pembatas login belum tersedia. Jalankan migration-auth-login-rate-limits.sql di D1.', 503);
        if (rate.limited) return bad('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        const accountId = String(body.account_id || '');
        const password = String(body.password || '');
        if (!/^(master|it|admin(?:-\d+)?)$/.test(accountId) || !password || password.length > 256) {
          return bad('Pilih akun dan masukkan password yang valid.');
        }

        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!adminSecret) return bad('Secret session dashboard belum dikonfigurasi di Cloudflare.', 503);

        let account;
        try {
          account = await env.DB.prepare(`
                 SELECT account_id, display_name, email, role, password_salt, password_hash,
                   delete_pin_salt, delete_pin_hash, delete_pin_must_change, active
            FROM dashboard_users WHERE account_id = ?
          `).bind(accountId).first();
        } catch (error) {
          if (/no such table: dashboard_users/i.test(String(error?.message || error))) {
            return bad('Tabel akun IT belum tersedia. Jalankan migration-dashboard-it-account.sql pada D1.', 503);
          }
          if (/no such column: delete_pin_/i.test(String(error?.message || error))) {
            return bad('Kolom PIN belum tersedia. Jalankan migration-dashboard-delete-pin.sql pada D1.', 503);
          }
          throw error;
        }
        if (!account || !account.active) return bad('Akun tidak aktif atau belum dibuat di D1.', 401);

        if (!account.password_hash) {
          const passwordSecret = { master:'MASTER_INITIAL_PASSWORD', admin:'ADMIN_INITIAL_PASSWORD', it:'IT_INITIAL_PASSWORD' }[accountId];
          if (!passwordSecret) return bad('Password akun belum diinisialisasi.', 409);
          const bootstrapPassword = String(env[passwordSecret] || '');
          if (bootstrapPassword.length < 12) {
            return bad(`Password awal ${account.role} belum diatur sebagai Cloudflare Worker secret (minimal 12 karakter).`, 503);
          }
          if (!constantTimeEqual(password, bootstrapPassword)) return bad('Password salah.', 401);

          const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
          const passwordHash = await hashDashboardPassword(password, salt);
          await env.DB.prepare(`
            UPDATE dashboard_users SET password_salt = ?, password_hash = ?, updated_at = ?
            WHERE account_id = ?
          `).bind(salt, passwordHash, new Date().toISOString(), accountId).run();
          account.password_salt = salt;
          account.password_hash = passwordHash;
        } else {
          const attemptedHash = await hashDashboardPassword(password, account.password_salt);
          if (!constantTimeEqual(attemptedHash, account.password_hash)) return bad('Password salah.', 401);
        }

        if (accountId === 'master' && !account.delete_pin_hash) {
          const pinSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
          const pinHash = await hashDashboardPassword('1234', pinSalt);
          await env.DB.prepare(`
            UPDATE dashboard_users
            SET delete_pin_salt = ?, delete_pin_hash = ?, delete_pin_must_change = 1, updated_at = ?
            WHERE account_id = 'master'
          `).bind(pinSalt, pinHash, new Date().toISOString()).run();
          account.delete_pin_must_change = 1;
        }

        await clearLoginAttempts(env, request, 'dashboard-login');
        return json({
          ok: true,
          token: await createAdminToken(adminSecret, account),
          expires_in: 24 * 60 * 60,
          data: { account_id: account.account_id, display_name: account.display_name, email: account.email, role: account.role, delete_pin_must_change: Boolean(account.delete_pin_must_change) },
        });
      }

      if (path === '/dashboard/profile') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) {
          return bad('Sesi dashboard tidak valid. Silakan login kembali.', 401);
        }

        if (request.method === 'GET') {
          const account = await env.DB.prepare(`
            SELECT account_id, display_name, email, role, delete_pin_must_change FROM dashboard_users
            WHERE account_id = ? AND active = 1
          `).bind(tokenData.account_id).first();
          if (!account) return bad('Akun ini sudah dinonaktifkan. Hubungi Master.', 401);
          return json({ ok: true, data: account });
        }

        if (request.method === 'PATCH') {
          const body = await request.json();
          const displayName = String(body.display_name || '').trim();
          const email = String(body.email || '').trim();
          if (displayName.length < 2 || displayName.length > 80) return bad('Nama profil wajib 2 sampai 80 karakter.');
          if (email.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return bad('Format email tidak valid.');
          await env.DB.prepare(`
            UPDATE dashboard_users SET display_name = ?, email = ?, updated_at = ?
            WHERE account_id = ? AND active = 1
          `).bind(displayName, email, new Date().toISOString(), tokenData.account_id).run();
          const masterPin = tokenData.account_id === 'master'
            ? await env.DB.prepare('SELECT delete_pin_must_change FROM dashboard_users WHERE account_id = ?').bind(tokenData.account_id).first()
            : null;
          return json({ ok: true, data: { account_id: tokenData.account_id, display_name: displayName, email, role: tokenData.role, delete_pin_must_change: Boolean(masterPin?.delete_pin_must_change) } });
        }
      }

      if (path === '/dashboard/accounts') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) return bad('Login admin diperlukan', 401);

        if (request.method === 'POST') {
          if (tokenData.account_id !== 'master' || tokenData.role !== 'Master') return bad('Hanya Master yang dapat menambah Admin.', 403);
          const body = await request.json();
          const displayName = String(body.display_name || '').trim().replace(/\s+/g, ' ');
          const email = String(body.email || '').trim();
          const password = String(body.password || '');
          if (displayName.length < 2 || displayName.length > 80) return bad('Nama Admin wajib 2 sampai 80 karakter.');
          if (email.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return bad('Format email tidak valid.');
          if (password.length < 12 || password.length > 256) return bad('Password awal Admin wajib 12 sampai 256 karakter.');
          const existing = await env.DB.prepare("SELECT account_id FROM dashboard_users WHERE account_id GLOB 'admin-[0-9]*'").all();
          const usedNumbers = new Set((existing.results || []).map(row => Number(String(row.account_id).slice(6))).filter(Number.isSafeInteger));
          let number = 1;
          while (usedNumbers.has(number)) number += 1;
          const accountId = `admin-${number}`;
          const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
          const passwordHash = await hashDashboardPassword(password, salt);
          const now = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO dashboard_users (
              account_id, display_name, email, role, password_salt, password_hash, active,
              created_at, updated_at, delete_pin_salt, delete_pin_hash, delete_pin_must_change
            ) VALUES (?, ?, ?, 'Admin', ?, ?, 1, ?, ?, '', '', 0)
          `).bind(accountId, displayName, email, salt, passwordHash, now, now).run();
          return json({ ok:true, data:{ account_id:accountId, display_name:displayName, email, role:'Admin', active:1 } }, 201);
        }

        if (request.method !== 'GET') return bad('Metode akun tidak didukung.', 405);
        if (tokenData.role === 'IT') {
          const account = await env.DB.prepare(`
            SELECT account_id, display_name, email, role, active FROM dashboard_users
            WHERE account_id = 'it' AND active = 1
          `).first();
          return json({ ok: true, data: account ? [account] : [] });
        }
        // Master melihat seluruh akun, termasuk yang nonaktif, agar bisa diaktifkan kembali.
        const isMasterViewer = tokenData.account_id === 'master' && tokenData.role === 'Master';
        const result = await env.DB.prepare(`
          SELECT account_id, display_name, email, role, active FROM dashboard_users
          ${isMasterViewer ? '' : 'WHERE active = 1'}
          ORDER BY CASE role WHEN 'Master' THEN 0 WHEN 'Admin' THEN 1 ELSE 2 END, account_id COLLATE NOCASE
        `).all();
        return json({ ok: true, data: result.results || [] });
      }

      const dashboardAccountPasswordMatch = path.match(/^\/dashboard\/accounts\/([^/]+)\/password$/);
      if (request.method === 'POST' && dashboardAccountPasswordMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (tokenData?.account_id !== 'master' || tokenData.role !== 'Master') {
          return bad('Hanya Master yang dapat mereset password akun staf.', 403);
        }
        const accountId = decodeURIComponent(dashboardAccountPasswordMatch[1]);
        if (accountId === 'master') {
          return bad('Password akun Master diubah dari Profil Akun.', 403);
        }
        const target = await env.DB.prepare('SELECT account_id, display_name, role FROM dashboard_users WHERE account_id = ?')
          .bind(accountId).first();
        if (!target) return bad('Akun tidak ditemukan.', 404);
        if (target.role === 'IT') return bad('Password akun IT Support tidak dapat direset dari Dashboard.', 403);
        const body = await request.json();
        const newPassword = String(body.new_password || '');
        const pin = String(body.pin || '').trim();
        if (newPassword.length < 12 || newPassword.length > 256) return bad('Password baru wajib 12 sampai 256 karakter.');
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashDashboardPassword(newPassword, salt);
        await env.DB.prepare(`
          UPDATE dashboard_users SET password_salt = ?, password_hash = ?, updated_at = ?
          WHERE account_id = ?
        `).bind(salt, passwordHash, new Date().toISOString(), accountId).run();
        return json({ ok:true, data:{ account_id:accountId } });
      }

      const dashboardAccountMatch = path.match(/^\/dashboard\/accounts\/([^/]+)$/);
      if (dashboardAccountMatch && ['PATCH', 'DELETE'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (tokenData?.account_id !== 'master' || tokenData.role !== 'Master') {
          return bad('Hanya Master yang dapat mengelola akun staf.', 403);
        }
        const accountId = decodeURIComponent(dashboardAccountMatch[1]);
        if (accountId === 'master') {
          return bad('Akun Master tidak dapat dinonaktifkan atau dihapus.', 403);
        }
        const target = await env.DB.prepare(`
          SELECT account_id, display_name, role, active FROM dashboard_users WHERE account_id = ?
        `).bind(accountId).first();
        if (!target) return bad('Akun tidak ditemukan.', 404);
        if (target.role === 'IT') return bad('Akun IT Support tidak dapat dinonaktifkan atau dihapus.', 403);

        if (request.method === 'PATCH') {
          const body = await request.json();
          const requested = body.active;
          const active = requested === 1 || requested === true ? 1 : requested === 0 || requested === false ? 0 : null;
          if (active === null) return bad('Status akun tidak valid.', 400);
          await env.DB.prepare('UPDATE dashboard_users SET active = ?, updated_at = ? WHERE account_id = ?')
            .bind(active, new Date().toISOString(), accountId).run();
          return json({ ok: true, data: { account_id: accountId, active } });
        }

        // Hapus permanen memerlukan PIN Master.
        let body = {};
        try { body = await request.json(); } catch {}
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        await env.DB.prepare('DELETE FROM dashboard_users WHERE account_id = ?').bind(accountId).run();
        return json({ ok: true, data: { account_id: accountId, deleted: true } });
      }

      if (path === '/dashboard/staff-chat') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) {
          return bad('Login Dashboard diperlukan.', 401);
        }

        if (request.method === 'GET') {
          try {
            const result = await env.DB.prepare(`
              SELECT id, sender_account_id, sender_name, sender_role, message, created_at
              FROM dashboard_staff_chat_messages
              ORDER BY created_at DESC, id DESC
              LIMIT 100
            `).all();
            return json({ ok:true, data:(result.results || []).reverse() });
          } catch (error) {
            if (/no such table: dashboard_staff_chat_messages/i.test(String(error?.message || error))) {
              return bad('Ruang Chat belum disiapkan. Jalankan migration-dashboard-staff-chat.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const message = String(body.message || '').trim();
          if (!message || message.length > 2000) return bad('Pesan wajib diisi dan maksimal 2.000 karakter.');
          const sender = await env.DB.prepare(`
            SELECT account_id, display_name, role FROM dashboard_users
            WHERE account_id = ? AND active = 1
          `).bind(tokenData.account_id).first();
          if (!sender) return bad('Akun Dashboard tidak aktif.', 401);
          const data = {
            id:crypto.randomUUID(),
            sender_account_id:sender.account_id,
            sender_name:sender.display_name,
            sender_role:sender.role,
            message,
            created_at:new Date().toISOString(),
          };
          try {
            await env.DB.prepare(`
              INSERT INTO dashboard_staff_chat_messages (
                id, sender_account_id, sender_name, sender_role, message, created_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `).bind(data.id, data.sender_account_id, data.sender_name, data.sender_role, data.message, data.created_at).run();
            return json({ ok:true, data }, 201);
          } catch (error) {
            if (/no such table: dashboard_staff_chat_messages/i.test(String(error?.message || error))) {
              return bad('Ruang Chat belum disiapkan. Jalankan migration-dashboard-staff-chat.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (request.method === 'DELETE') {
          if (!['master', 'it'].includes(tokenData.account_id)) {
            return bad('Hanya Master atau IT yang dapat menghapus riwayat Chat.', 403);
          }
          const account = await env.DB.prepare(`
            SELECT account_id FROM dashboard_users
            WHERE account_id = ? AND active = 1
          `).bind(tokenData.account_id).first();
          if (!account) return bad('Akun Dashboard tidak aktif.', 401);
          try {
            const deleted = await env.DB.prepare('DELETE FROM dashboard_staff_chat_messages').run();
            return json({ ok:true, data:{ deleted:Number(deleted.meta?.changes || 0) } });
          } catch (error) {
            if (/no such table: dashboard_staff_chat_messages/i.test(String(error?.message || error))) {
              return bad('Ruang Chat belum disiapkan. Jalankan migration-dashboard-staff-chat.sql di D1.', 503);
            }
            throw error;
          }
        }

        return bad('Metode Chat tidak didukung.', 405);
      }

      if (path === '/dashboard/office-employees') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);

        if (request.method === 'GET') {
          try {
            const result = await env.DB.prepare(`
              SELECT id, name, active, created_at, updated_at
              FROM office_employees ORDER BY active DESC, name COLLATE NOCASE ASC
            `).all();
            return json({ ok:true, data:result.results || [] });
          } catch (error) {
            if (/no such table: office_employees/i.test(String(error?.message || error))) {
              return bad('Daftar karyawan kantor belum disiapkan. Jalankan migration-dashboard-office-employees.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (request.method !== 'POST') return bad('Metode karyawan kantor tidak didukung.', 405);
        if (tokenData.account_id !== 'master' || tokenData.role !== 'Master') return bad('Hanya akun Master yang dapat menambah karyawan kantor.', 403);
        const body = await request.json();
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 80) return bad('Nama karyawan wajib 2 sampai 80 karakter.');
        const activeCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM office_employees WHERE active = 1').first();
        if (Number(activeCount?.count || 0) >= 4) return bad('Maksimal empat karyawan kantor aktif untuk tombol absensi.', 409);
        const duplicate = await env.DB.prepare('SELECT id FROM office_employees WHERE name = ? COLLATE NOCASE').bind(name).first();
        if (duplicate) return bad('Nama karyawan kantor sudah terdaftar.', 409);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO office_employees (id, name, active, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?)
        `).bind(id, name, now, now).run();
        return json({ ok:true, data:{ id, name, active:1, created_at:now, updated_at:now } }, 201);
      }

      const officeEmployeeMatch = path.match(/^\/dashboard\/office-employees\/([^/]+)$/);
      if (request.method === 'PATCH' && officeEmployeeMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (tokenData?.account_id !== 'master' || tokenData.role !== 'Master') return bad('Hanya akun Master yang dapat mengubah karyawan kantor.', 403);
        const id = decodeURIComponent(officeEmployeeMatch[1]);
        const employee = await env.DB.prepare('SELECT id, name, active FROM office_employees WHERE id = ?').bind(id).first();
        if (!employee) return bad('Karyawan kantor tidak ditemukan.', 404);
        const body = await request.json();
        const name = Object.prototype.hasOwnProperty.call(body, 'name')
          ? String(body.name || '').trim().replace(/\s+/g, ' ')
          : employee.name;
        const active = body.active === undefined ? Number(employee.active)
          : body.active === true || body.active === 1 ? 1
          : body.active === false || body.active === 0 ? 0 : null;
        if (name.length < 2 || name.length > 80 || active === null) return bad('Nama atau status karyawan kantor tidak valid.');
        if (Number(employee.active) === 0 && active === 1) {
          const activeCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM office_employees WHERE active = 1 AND id <> ?').bind(id).first();
          if (Number(activeCount?.count || 0) >= 4) return bad('Maksimal empat karyawan kantor aktif untuk tombol absensi.', 409);
        }
        const duplicate = await env.DB.prepare('SELECT id FROM office_employees WHERE name = ? COLLATE NOCASE AND id <> ?')
          .bind(name, id).first();
        if (duplicate) return bad('Nama karyawan kantor sudah digunakan.', 409);
        const now = new Date().toISOString();
        await env.DB.prepare('UPDATE office_employees SET name = ?, active = ?, updated_at = ? WHERE id = ?')
          .bind(name, active, now, id).run();
        return json({ ok:true, data:{ id, name, active, updated_at:now } });
      }

      if (request.method === 'DELETE' && officeEmployeeMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (tokenData?.account_id !== 'master' || tokenData.role !== 'Master') return bad('Hanya akun Master yang dapat menghapus karyawan kantor.', 403);
        const id = decodeURIComponent(officeEmployeeMatch[1]);
        const employee = await env.DB.prepare('SELECT id, name FROM office_employees WHERE id = ?').bind(id).first();
        if (!employee) return bad('Karyawan kantor tidak ditemukan.', 404);
        let body = {};
        try { body = await request.json(); } catch {}
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM office_employee_attendance WHERE employee_id = ?').bind(id),
          env.DB.prepare('DELETE FROM office_employees WHERE id = ?').bind(id),
        ]);
        return json({ ok:true, data:{ id, deleted:true } });
      }

      if (path === '/dashboard/employee-attendance') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);

        const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
          timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit',
        }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        const workDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

        if (request.method === 'GET') {
          const employeeIdParam = String(url.searchParams.get('employee_id') || '').trim();
          if (employeeIdParam) {
            const startParam = String(url.searchParams.get('start') || '').trim();
            const endParam = String(url.searchParams.get('end') || '').trim();
            const rangeStart = /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : workDate;
            const rangeEnd = /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : workDate;
            try {
              const result = await env.DB.prepare(`
                SELECT id, employee_id, employee_name, work_date, checked_in_at, checked_out_at,
                       lat, lng, accuracy, checkout_lat, checkout_lng, checkout_accuracy,
                       selfie_url, checkout_selfie_url
                FROM office_employee_attendance
                WHERE employee_id = ? AND work_date BETWEEN ? AND ?
                ORDER BY work_date DESC
              `).bind(employeeIdParam, rangeStart, rangeEnd).all();
              let totalSeconds = 0;
              let completedDays = 0;
              const records = (result.results || []).map(record => {
                const checkedInAt = Date.parse(record.checked_in_at);
                const checkedOutAt = record.checked_out_at ? Date.parse(record.checked_out_at) : null;
                const workedSeconds = record.checked_out_at && Number.isFinite(checkedInAt) && Number.isFinite(checkedOutAt)
                  ? Math.max(0, Math.floor((checkedOutAt - checkedInAt) / 1000))
                  : null;
                if (workedSeconds != null) { totalSeconds += workedSeconds; completedDays += 1; }
                return { ...record, worked_seconds:workedSeconds };
              });
              const summary = {
                total_seconds:totalSeconds,
                days_count:records.length,
                completed_days:completedDays,
                avg_seconds_per_day: completedDays ? Math.round(totalSeconds / completedDays) : 0,
              };
              return json({ ok:true, data:{ employee_id:employeeIdParam, start:rangeStart, end:rangeEnd, records, summary } });
            } catch (error) {
              if (/no such table: office_employee_attendance/i.test(String(error?.message || error))) {
                return bad('Absensi karyawan kantor belum disiapkan. Jalankan migration-dashboard-office-employees.sql di D1.', 503);
              }
              throw error;
            }
          }

          const requestedDate = String(url.searchParams.get('date') || '').trim();
          const queryDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : workDate;
          try {
            const result = await env.DB.prepare(`
              SELECT id, employee_id, employee_name, work_date, checked_in_at, checked_out_at,
                     lat, lng, accuracy, checkout_lat, checkout_lng, checkout_accuracy,
                     selfie_url, checkout_selfie_url
              FROM office_employee_attendance
              WHERE work_date = ?
              ORDER BY checked_in_at DESC
            `).bind(queryDate).all();
            const now = Date.now();
            const records = (result.results || []).map(record => {
              const checkedInAt = Date.parse(record.checked_in_at);
              const checkedOutAt = record.checked_out_at ? Date.parse(record.checked_out_at) : now;
              const workedSeconds = Number.isFinite(checkedInAt) && Number.isFinite(checkedOutAt)
                ? Math.max(0, Math.floor((checkedOutAt - checkedInAt) / 1000))
                : null;
              return { ...record, worked_seconds:workedSeconds };
            });
            return json({ ok:true, data:{ work_date:queryDate, records } });
          } catch (error) {
            if (/no such table: office_employee_attendance/i.test(String(error?.message || error))) {
              return bad('Absensi karyawan kantor belum disiapkan. Jalankan migration-dashboard-office-employees.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (request.method !== 'POST') return bad('Metode absensi tidak didukung.', 405);
        const body = await request.json();
        const employeeId = String(body.employee_id || '').trim();
        const lat = Number(body.lat);
        const lng = Number(body.lng);
        const accuracy = body.accuracy == null || body.accuracy === '' ? null : Number(body.accuracy);
        const selfie = String(body.selfie || '');
        if (!employeeId || !selfie.startsWith('data:image/')) return bad('Karyawan dan foto selfie wajib diisi.');
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
          return bad('Koordinat lokasi tidak valid.');
        }
        if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) return bad('Akurasi lokasi tidak valid.');

        const employee = await env.DB.prepare('SELECT id, name FROM office_employees WHERE id = ? AND active = 1').bind(employeeId).first();
        if (!employee) return bad('Karyawan kantor tidak aktif atau tidak ditemukan.', 404);
        try {
          const existing = await env.DB.prepare(`
            SELECT id, checked_in_at FROM office_employee_attendance WHERE employee_id = ? AND work_date = ?
          `).bind(employeeId, workDate).first();
          if (existing) return bad('Karyawan ini sudah absen masuk hari ini.', 409);
        } catch (error) {
          if (/no such table: office_employee_attendance/i.test(String(error?.message || error))) {
            return bad('Absensi karyawan kantor belum disiapkan. Jalankan migration-dashboard-office-employees.sql di D1.', 503);
          }
          throw error;
        }

        let parsedSelfie;
        try { parsedSelfie = parseDataUrl(selfie); }
        catch { return bad('Foto selfie tidak valid.'); }
        if (!String(parsedSelfie.contentType || '').startsWith('image/')) return bad('Selfie harus berupa foto.');
        if (parsedSelfie.bytes.byteLength >= 100 * 1024) return bad('Foto selfie wajib di bawah 100 KB.');

        const attendanceId = crypto.randomUUID();
        const checkedInAt = new Date().toISOString();
        const objectKey = `employee-attendance/${workDate}/${attendanceId}/selfie.jpg`;
        await env.PHOTOS.put(objectKey, parsedSelfie.bytes, {
          httpMetadata:{ contentType:parsedSelfie.contentType || 'image/jpeg' },
        });
        const selfieUrl = publicFileUrl(url.origin, objectKey);
        try {
          await env.DB.prepare(`
            INSERT INTO office_employee_attendance (id, employee_id, employee_name, work_date, checked_in_at, lat, lng, accuracy, selfie_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(attendanceId, employee.id, employee.name, workDate, checkedInAt, lat, lng, accuracy, selfieUrl).run();
        } catch (error) {
          if (/UNIQUE constraint failed/i.test(String(error?.message || error))) return bad('Karyawan ini sudah absen masuk hari ini.', 409);
          throw error;
        }
        return json({ ok:true, data:{ id:attendanceId, employee_id:employee.id, employee_name:employee.name, work_date:workDate, checked_in_at:checkedInAt, lat, lng, accuracy, selfie_url:selfieUrl } }, 201);
      }

      // Absen pulang (GPS saja, tanpa selfie -- karyawan dianggap sudah di kantor) dan reset/hapus
      // satu baris absen (perlu PIN Master, untuk koreksi data salah input/testing).
      const employeeAttendanceRecordMatch = path.match(/^\/dashboard\/employee-attendance\/([^/]+)$/);
      if (employeeAttendanceRecordMatch && ['PATCH', 'DELETE'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const id = decodeURIComponent(employeeAttendanceRecordMatch[1]);
        let attendance;
        try {
          attendance = await env.DB.prepare(`
            SELECT id, employee_id, employee_name, checked_out_at FROM office_employee_attendance WHERE id = ?
          `).bind(id).first();
        } catch (error) {
          if (/no such column: checked_out_at/i.test(String(error?.message || error))) {
            return bad('Kolom absen pulang belum tersedia. Jalankan migration-dashboard-office-employee-checkout.sql di D1.', 503);
          }
          throw error;
        }
        if (!attendance) return bad('Data absen tidak ditemukan.', 404);

        if (request.method === 'DELETE') {
          if (isRestrictedAdmin(tokenData)) return bad('Akun Admin hanya dapat melihat absensi, tidak dapat menghapus atau mereset.', 403);
          let body = {};
          try { body = await request.json(); } catch {}
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          await env.DB.prepare('DELETE FROM office_employee_attendance WHERE id = ?').bind(id).run();
          return json({ ok:true, data:{ id, deleted:true } });
        }

        const body = await request.json();
        if (body.action !== 'checkout') return bad('Aksi tidak didukung.', 400);
        if (attendance.checked_out_at) return bad('Karyawan ini sudah absen pulang.', 409);
        const lat = Number(body.lat);
        const lng = Number(body.lng);
        const accuracy = body.accuracy == null || body.accuracy === '' ? null : Number(body.accuracy);
        const selfie = String(body.selfie || '');
        if (!selfie.startsWith('data:image/')) return bad('Foto selfie wajib diisi untuk absen pulang.');
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
          return bad('Koordinat lokasi tidak valid.');
        }
        if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) return bad('Akurasi lokasi tidak valid.');
        let parsedCheckoutSelfie;
        try { parsedCheckoutSelfie = parseDataUrl(selfie); }
        catch { return bad('Foto selfie tidak valid.'); }
        if (!String(parsedCheckoutSelfie.contentType || '').startsWith('image/')) return bad('Selfie harus berupa foto.');
        if (parsedCheckoutSelfie.bytes.byteLength >= 100 * 1024) return bad('Foto selfie wajib di bawah 100 KB.');
        const checkedOutAt = new Date().toISOString();
        const checkoutObjectKey = `employee-attendance/checkout/${id}/selfie.jpg`;
        await env.PHOTOS.put(checkoutObjectKey, parsedCheckoutSelfie.bytes, {
          httpMetadata:{ contentType:parsedCheckoutSelfie.contentType || 'image/jpeg' },
        });
        const checkoutSelfieUrl = publicFileUrl(url.origin, checkoutObjectKey);
        let updated;
        try {
          updated = await env.DB.prepare(`
            UPDATE office_employee_attendance
            SET checked_out_at = ?, checkout_lat = ?, checkout_lng = ?, checkout_accuracy = ?, checkout_selfie_url = ?
            WHERE id = ? AND checked_out_at IS NULL
          `).bind(checkedOutAt, lat, lng, accuracy, checkoutSelfieUrl, id).run();
        } catch (error) {
          if (/no such column: checkout_selfie_url/i.test(String(error?.message || error))) {
            return bad('Kolom selfie absen pulang belum tersedia. Jalankan migration-dashboard-office-employee-checkout-selfie.sql di D1.', 503);
          }
          throw error;
        }
        if (!updated.meta?.changes) return bad('Karyawan ini sudah absen pulang.', 409);
        return json({ ok:true, data:{ id, employee_id:attendance.employee_id, employee_name:attendance.employee_name, checked_out_at:checkedOutAt, checkout_lat:lat, checkout_lng:lng, checkout_accuracy:accuracy, checkout_selfie_url:checkoutSelfieUrl } });
      }

      // ================= INVENTARIS PROPERTI =================
      // Master data barang per properti (dikelola Master/Admin dari Dashboard) dan riwayat
      // ceklis kondisi barang dari Crew. Lihat migration-property-inventory.sql.
      if (path === '/dashboard/inventory-items') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);

        if (request.method === 'GET') {
          try {
            const result = await env.DB.prepare(`
              SELECT id, property_id, property_name, name, category, expected_qty, active,
                     review_status, source, photo_url, reported_by, created_at, updated_at
              FROM property_inventory_items ORDER BY
                CASE review_status WHEN 'pending' THEN 0 ELSE 1 END,
                property_name COLLATE NOCASE, name COLLATE NOCASE
            `).all();
            return json({ ok:true, data:result.results || [] });
          } catch (error) {
            if (/no such table: property_inventory_items/i.test(String(error?.message || error)) ||
                /no such column: review_status/i.test(String(error?.message || error))) {
              return bad('Inventaris belum disiapkan. Jalankan migration-property-inventory.sql dan migration-property-inventory-crew-proposals.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola inventaris.', 403);
        if (request.method !== 'POST') return bad('Metode inventaris tidak didukung.', 405);
        const body = await request.json();
        const propertyId = String(body.property_id || '').trim();
        const propertyName = String(body.property_name || '').trim();
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const category = String(body.category || '').trim();
        const expectedQty = Number(body.expected_qty || 1);
        const photo = String(body.photo || '');
        if (!propertyId || !propertyName || name.length < 2 || name.length > 120) return bad('Properti dan nama barang wajib diisi (maks 120 karakter).');
        if (category.length > 60) return bad('Kategori maksimal 60 karakter.');
        if (!Number.isSafeInteger(expectedQty) || expectedQty < 1 || expectedQty > 10000) return bad('Jumlah seharusnya tidak valid.');
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        let photoUrl = '';
        if (photo) {
          let parsedPhoto;
          try { parsedPhoto = parseDataUrl(photo); }
          catch { return bad('Foto tidak valid.'); }
          if (!String(parsedPhoto.contentType || '').startsWith('image/')) return bad('Foto harus berupa gambar.');
          if (parsedPhoto.bytes.byteLength >= 100 * 1024) return bad('Foto wajib di bawah 100 KB.');
          const key = `inventory-items/${id}/photo.jpg`;
          await env.PHOTOS.put(key, parsedPhoto.bytes, { httpMetadata:{ contentType:parsedPhoto.contentType || 'image/jpeg' } });
          photoUrl = publicFileUrl(url.origin, key);
        }
        try {
          await env.DB.prepare(`
            INSERT INTO property_inventory_items (id, property_id, property_name, name, category, expected_qty, active, photo_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          `).bind(id, propertyId, propertyName, name, category, expectedQty, photoUrl, now, now).run();
        } catch (error) {
          if (/no such table: property_inventory_items/i.test(String(error?.message || error))) {
            return bad('Inventaris belum disiapkan. Jalankan migration-property-inventory.sql di D1.', 503);
          }
          if (/no such column: photo_url/i.test(String(error?.message || error))) {
            return bad('Kolom foto belum tersedia. Jalankan migration-property-inventory-crew-proposals.sql di D1.', 503);
          }
          throw error;
        }
        return json({ ok:true, data:{ id, property_id:propertyId, property_name:propertyName, name, category, expected_qty:expectedQty, active:1, photo_url:photoUrl, created_at:now, updated_at:now } }, 201);
      }

      const inventoryItemMatch = path.match(/^\/dashboard\/inventory-items\/([^/]+)$/);
      if (request.method === 'PATCH' && inventoryItemMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola inventaris.', 403);
        const id = decodeURIComponent(inventoryItemMatch[1]);
        const item = await env.DB.prepare('SELECT id, name, category, expected_qty, active, review_status FROM property_inventory_items WHERE id = ?').bind(id).first();
        if (!item) return bad('Barang tidak ditemukan.', 404);
        const body = await request.json();
        const name = Object.prototype.hasOwnProperty.call(body, 'name') ? String(body.name || '').trim().replace(/\s+/g, ' ') : item.name;
        const category = Object.prototype.hasOwnProperty.call(body, 'category') ? String(body.category || '').trim() : item.category;
        const expectedQty = Object.prototype.hasOwnProperty.call(body, 'expected_qty') ? Number(body.expected_qty) : Number(item.expected_qty);
        const active = body.active === undefined ? Number(item.active)
          : body.active === true || body.active === 1 ? 1
          : body.active === false || body.active === 0 ? 0 : null;
        const reviewStatus = body.review_status === undefined ? item.review_status
          : ['pending', 'approved', 'rejected'].includes(body.review_status) ? body.review_status : null;
        if (name.length < 2 || name.length > 120 || category.length > 60 || !Number.isSafeInteger(expectedQty) || expectedQty < 1 || expectedQty > 10000 || active === null || reviewStatus === null) {
          return bad('Data barang tidak valid.');
        }
        const now = new Date().toISOString();
        try {
          await env.DB.prepare(`
            UPDATE property_inventory_items SET name = ?, category = ?, expected_qty = ?, active = ?, review_status = ?, updated_at = ? WHERE id = ?
          `).bind(name, category, expectedQty, active, reviewStatus, now, id).run();
        } catch (error) {
          if (/no such column: review_status/i.test(String(error?.message || error))) {
            return bad('Kolom review barang belum tersedia. Jalankan migration-property-inventory-crew-proposals.sql di D1.', 503);
          }
          throw error;
        }
        return json({ ok:true, data:{ id, name, category, expected_qty:expectedQty, active, review_status:reviewStatus, updated_at:now } });
      }

      if (path === '/dashboard/inventory-checks') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        if (request.method !== 'GET') return bad('Metode riwayat inventaris tidak didukung.', 405);
        try {
          const result = await env.DB.prepare(`
            SELECT id, property_id, property_name, crew, items_json, photo_urls_json, has_issues, resolved, resolved_note, created_at
            FROM property_inventory_checks ORDER BY created_at DESC LIMIT 300
          `).all();
          const data = (result.results || []).map(row => ({
            id:row.id, property_id:row.property_id, property_name:row.property_name, crew:row.crew,
            items:safeParseJsonArray(row.items_json), photo_urls:safeParseJsonArray(row.photo_urls_json),
            has_issues:Number(row.has_issues) === 1, resolved:Number(row.resolved) === 1,
            resolved_note:row.resolved_note || '', created_at:row.created_at,
          }));
          return json({ ok:true, data });
        } catch (error) {
          if (/no such table: property_inventory_checks/i.test(String(error?.message || error))) {
            return bad('Inventaris belum disiapkan. Jalankan migration-property-inventory.sql di D1.', 503);
          }
          throw error;
        }
      }

      const inventoryCheckMatch = path.match(/^\/dashboard\/inventory-checks\/([^/]+)$/);
      if (request.method === 'PATCH' && inventoryCheckMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat menindaklanjuti inventaris.', 403);
        const id = decodeURIComponent(inventoryCheckMatch[1]);
        const check = await env.DB.prepare('SELECT id FROM property_inventory_checks WHERE id = ?').bind(id).first();
        if (!check) return bad('Riwayat pengecekan tidak ditemukan.', 404);
        const body = await request.json();
        const resolved = body.resolved === true || body.resolved === 1 ? 1 : 0;
        const resolvedNote = String(body.resolved_note || '').trim();
        if (resolvedNote.length > 500) return bad('Catatan tindak lanjut maksimal 500 karakter.');
        await env.DB.prepare('UPDATE property_inventory_checks SET resolved = ?, resolved_note = ? WHERE id = ?')
          .bind(resolved, resolvedNote, id).run();
        return json({ ok:true, data:{ id, resolved:Boolean(resolved), resolved_note:resolvedNote } });
      }

      // Crew: daftar barang yang sudah disetujui Admin/Operasional milik properti yang sedang
      // dipilih di check-in-crew.html. Barang yang masih 'pending' (baru dilaporkan Crew, belum
      // direview) sengaja tidak ikut muncul di checklist sampai disetujui.
      if (request.method === 'GET' && path === '/checkin/inventory-items') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan.', 401);
        const propertyName = String(url.searchParams.get('property') || '').trim();
        if (!propertyName) return bad('Properti wajib dipilih.');
        try {
          const result = await env.DB.prepare(`
            SELECT id, name, category, expected_qty FROM property_inventory_items
            WHERE active = 1 AND review_status = 'approved' AND property_name = ? COLLATE NOCASE
            ORDER BY name COLLATE NOCASE
          `).bind(propertyName).all();
          return json({ ok:true, data:result.results || [] });
        } catch (error) {
          if (/no such table: property_inventory_items/i.test(String(error?.message || error)) ||
              /no such column: review_status/i.test(String(error?.message || error))) {
            return bad('Inventaris belum disiapkan. Jalankan migration-property-inventory.sql dan migration-property-inventory-crew-proposals.sql di D1.', 503);
          }
          throw error;
        }
      }

      // Crew: daftar jenis pengeluaran yang sama dengan Dashboard (finance_categories kind='expense').
      if (request.method === 'GET' && path === '/checkin/expense-categories') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan.', 401);
        return json({ ok:true, data:await listFieldExpenseCategories(env) });
      }

      // Operasional (Dashboard Check In Crew): daftar jenis pengeluaran yang sama dengan form Crew.
      if (request.method === 'GET' && path === '/dashboard/expense-categories') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengisi pengeluaran operasional.', 403);
        return json({ ok:true, data:await listFieldExpenseCategories(env) });
      }

      // Operasional: input pengeluaran sendiri dari Dashboard Check In Crew. Alurnya sama dengan pengeluaran Crew
      // (Belum dikirim -> Kirim ke Admin -> diterima di Laporan Crew & Operasional), dengan created_by 'ops:<akun>'.
      if (request.method === 'POST' && path === '/dashboard/ops-expenses') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData) || !tokenData.account_id) return bad('Hanya Master atau Admin yang dapat mengisi pengeluaran operasional.', 403);
        const account = await env.DB.prepare('SELECT display_name FROM dashboard_users WHERE account_id = ? AND active = 1')
          .bind(tokenData.account_id).first();
        if (!account) return bad('Akun Dashboard tidak aktif.', 401);
        const payee = String(account.display_name || tokenData.account_id).trim().slice(0, 120);
        const saved = await savePendingFieldExpense(env, url.origin, {
          createdBy:`ops:${tokenData.account_id}`, payee, body:await request.json(),
        });
        if (saved.error) return bad(saved.error, saved.status);
        return json({ ok:true, data:{ id:saved.id, proof_url:saved.proofUrl } }, 201);
      }

      // Crew: pengeluaran lapangan (rembuse) -- masuk finance_entries sebagai pengeluaran, maks 10 struk per hari.
      if (path === '/checkin/expenses') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan.', 401);
        const createdBy = `crew:${crewSession.crew}`;

        if (request.method === 'GET') {
          const date = String(url.searchParams.get('date') || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Tanggal tidak valid.');
          // Baris yang dihapus (disembunyikan) dari Dashboard Check In Crew tidak ikut tampil di aplikasi crew.
          const queryOwn = hideDeleted => env.DB.prepare(`
            SELECT id, category_name, property_name, amount, description, proof_url
            FROM finance_entries WHERE created_by = ? AND entry_date = ?${hideDeleted ? ' AND crew_hidden = 0' : ''}
            ORDER BY created_at DESC
          `).bind(createdBy, date).all();
          const result = await queryOwn(true).catch(error => {
            if (!/no such column: crew_hidden/i.test(String(error?.message || error))) throw error;
            return queryOwn(false);
          });
          return json({ ok:true, data:result.results || [] });
        }

        if (request.method !== 'POST') return bad('Metode pengeluaran tidak didukung.', 405);
        const saved = await savePendingFieldExpense(env, url.origin, {
          createdBy, payee:crewSession.crew, body:await request.json(), dailyLimit:10,
        });
        if (saved.error) return bad(saved.error, saved.status);
        return json({ ok:true, data:{ id:saved.id, proof_url:saved.proofUrl } }, 201);
      }

      // Admin: daftar pengeluaran lapangan crew per tanggal (dipakai di Dashboard Check In Crew).
      if (request.method === 'GET' && path === '/dashboard/crew-expenses') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        // Tanggal opsional: tanpa tanggal = semua pengeluaran crew. Selalu dipaginasi (default 10 baris).
        const date = String(url.searchParams.get('date') || '').trim();
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Tanggal tidak valid.');
        const payee = String(url.searchParams.get('payee') || '').trim();
        const month = String(url.searchParams.get('month') || '').trim();
        if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return bad('Bulan tidak valid.');
        // review=admin: hanya pengeluaran yang pernah dikirim ke Admin (menu Laporan Crew > Pengeluaran).
        const adminView = url.searchParams.get('review') === 'admin';
        const limit = Math.min(50, Math.max(1, Math.trunc(Number(url.searchParams.get('limit'))) || 10));
        const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset'))) || 0);
        // source=crew / ops memisahkan pengeluaran Crew dan Operasional; tanpa source = keduanya (menu Laporan di Dashboard utama).
        const source = String(url.searchParams.get('source') || '').trim();
        const conditions = [source === 'crew' ? "created_by LIKE 'crew:%'"
          : source === 'ops' ? "created_by LIKE 'ops:%'"
          : "(created_by LIKE 'crew:%' OR created_by LIKE 'ops:%')"];
        const params = [];
        if (date) { conditions.push('entry_date = ?'); params.push(date); }
        if (payee) { conditions.push('payee = ?'); params.push(payee); }
        if (month) {
          const [monthYear, monthNumber] = month.split('-').map(Number);
          conditions.push('entry_date >= ? AND entry_date < ?');
          params.push(`${month}-01`, new Date(Date.UTC(monthYear, monthNumber, 1)).toISOString().slice(0, 10));
        }
        let rows;
        try {
          const queryCrewExpenses = (hideCrewDeleted, withReason = true) => env.DB.prepare(`
            SELECT id, payee, category_name, property_name, amount, description, proof_url, entry_date,
                   review_status, review_sent_at, ${withReason ? 'no_receipt_reason' : "'' AS no_receipt_reason"},
                   CASE WHEN created_by LIKE 'ops:%' THEN 'operasional' ELSE 'crew' END AS source
            FROM finance_entries WHERE ${[...conditions, ...(adminView ? ["review_sent_at <> ''", "review_status NOT IN ('removed', 'removed-rejected')"] : (hideCrewDeleted ? ['crew_hidden = 0'] : []))].join(' AND ')}
            ORDER BY entry_date DESC, created_at DESC LIMIT ? OFFSET ?
          `).bind(...params, limit + 1, offset).all();
          // Kolom crew_hidden belum ada (migration belum dijalankan): tampilkan seperti biasa.
          // Kolom no_receipt_reason belum ada: alasan tanpa struk dikosongkan.
          const result = await queryCrewExpenses(true).catch(error => {
            const message = String(error?.message || error);
            if (/no such column: no_receipt_reason/i.test(message)) return queryCrewExpenses(true, false);
            if (!/no such column: crew_hidden/i.test(message)) throw error;
            return queryCrewExpenses(false).catch(inner => {
              if (!/no such column: no_receipt_reason/i.test(String(inner?.message || inner))) throw inner;
              return queryCrewExpenses(false, false);
            });
          });
          rows = result.results || [];
        } catch (error) {
          if (!/no such column: review_/i.test(String(error?.message || error))) throw error;
          if (adminView) return bad('Kolom review pengeluaran belum tersedia. Jalankan migration-crew-expense-review.sql di D1.', 503);
          const legacy = await env.DB.prepare(`
            SELECT id, payee, category_name, property_name, amount, description, proof_url, entry_date,
                   CASE WHEN created_by LIKE 'ops:%' THEN 'operasional' ELSE 'crew' END AS source
            FROM finance_entries WHERE ${conditions.join(' AND ')}
            ORDER BY entry_date DESC, created_at DESC LIMIT ? OFFSET ?
          `).bind(...params, limit + 1, offset).all();
          rows = (legacy.results || []).map(row => ({ ...row, review_status:'approved', review_sent_at:'' }));
        }
        return json({ ok:true, data:rows.slice(0, limit), pagination:{ limit, offset, has_more:rows.length > limit } });
      }

      // Review pengeluaran lapangan crew: pending -> sent (Kirim ke Admin) -> approved (Terima) atau rejected (Tolak).
      // Hanya yang approved masuk pengeluaran. Crew tidak diberi tahu soal penolakan.
      const crewExpenseMatch = path.match(/^\/dashboard\/crew-expenses\/([^/]+)$/);
      if (['PATCH', 'DELETE'].includes(request.method) && crewExpenseMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat meninjau pengeluaran crew.', 403);
        const id = decodeURIComponent(crewExpenseMatch[1]);
        const missingReviewColumns = 'Kolom review pengeluaran belum tersedia. Jalankan migration-crew-expense-review.sql di D1.';
        let entry;
        try {
          entry = await env.DB.prepare(`
            SELECT id, created_by, review_status, review_sent_at, proof_url, description FROM finance_entries WHERE id = ?
          `).bind(id).first();
        } catch (error) {
          if (/no such column: review_/i.test(String(error?.message || error))) return bad(missingReviewColumns, 503);
          throw error;
        }
        if (!entry || !/^(crew|ops):/.test(String(entry.created_by || ''))) return bad('Pengeluaran crew tidak ditemukan.', 404);

        if (request.method === 'DELETE') {
          let deleteBody = {};
          try { deleteBody = await request.json(); } catch {}
          const deletePin = String(deleteBody.pin || '').trim();
          if (!/^\d{4}$/.test(deletePin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(deletePin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          if (deleteBody.scope === 'crew' && entry.review_sent_at) {
            // Dihapus dari Dashboard Check In Crew: hanya menyembunyikan riwayat crew. Laporan Crew dan menu Pengeluaran
            // tidak berubah, karena riwayat masing-masing tempat berdiri sendiri.
            try {
              await env.DB.prepare('UPDATE finance_entries SET crew_hidden = 1 WHERE id = ?').bind(id).run();
            } catch (error) {
              if (/crew_hidden/i.test(String(error?.message || error))) {
                return bad('Kolom penyembunyi riwayat crew belum tersedia. Jalankan migration-crew-expense-hidden.sql di D1.', 503);
              }
              throw error;
            }
            return json({ ok:true, data:{ id, hidden:true } });
          }
          // Belum pernah dikirim ke Admin (dihapus dari Dashboard Check In Crew): itu data milik crew sendiri, jadi dihapus betul-betul.
          if (deleteBody.scope === 'crew') {
            await env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(id).run();
            return json({ ok:true, data:{ id, deleted:true } });
          }
          // Dihapus dari Dashboard utama (Laporan Crew & Operasional): satu arah, seperti dioda. Baris asli di Dashboard Check In
          // Crew TIDAK ikut terhapus; hanya disembunyikan dari Laporan (status 'removed'). Yang ditolak tetap tampil Ditolak
          // di dashboard crew ('removed-rejected'). Salinan di menu Pengeluaran (kalau sudah diterima) ikut dihapus.
          await env.DB.batch([
            env.DB.prepare(`
              UPDATE finance_entries
              SET review_status = CASE WHEN review_status = 'rejected' THEN 'removed-rejected' ELSE 'removed' END
              WHERE id = ? AND review_status NOT IN ('removed', 'removed-rejected')
            `).bind(id),
            env.DB.prepare(`DELETE FROM finance_entries WHERE id = ? AND created_by = 'crew-expense'`).bind(`crew-expense-${id}`),
          ]);
          return json({ ok:true, data:{ id, removed:true } });
        }

        const body = await request.json();
        const action = String(body.action || '').trim();
        if (!['send', 'reject', 'accept', 'edit'].includes(action)) return bad('Aksi pengeluaran tidak valid.');
        if (action === 'edit') {
          // Edit jumlah, keterangan, dan struk (struk sering menyusul). Boleh di semua status; kalau sudah diterima,
          // salinannya di menu Pengeluaran ikut diperbarui.
          const amount = Number(body.amount);
          const description = String(body.description || '').trim();
          const receipt = String(body.receipt || '');
          const noReceiptReason = String(body.no_receipt_reason || '').trim();
          if (!Number.isSafeInteger(amount) || amount <= 0 || description.length > 160) return bad('Jumlah atau keterangan tidak valid.');
          let proofUrl = String(entry.proof_url || '');
          let reason = '';
          if (receipt.startsWith('data:image/')) {
            let parsedReceipt;
            try { parsedReceipt = parseDataUrl(receipt); }
            catch { return bad('Foto struk tidak valid.'); }
            if (!String(parsedReceipt.contentType || '').startsWith('image/')) return bad('Foto struk harus berupa gambar.');
            if (parsedReceipt.bytes.byteLength >= 100 * 1024) return bad('Foto struk wajib di bawah 100 KB.');
            const receiptKey = `finance/crew-expense/${crypto.randomUUID()}.jpg`;
            await env.PHOTOS.put(receiptKey, parsedReceipt.bytes, {
              httpMetadata:{ contentType:parsedReceipt.contentType || 'image/jpeg' },
            });
            proofUrl = publicFileUrl(url.origin, receiptKey);
          } else if (noReceiptReason) {
            if (noReceiptReason.length < 3 || noReceiptReason.length > 160) return bad('Alasan tidak ada struk 3-160 karakter.');
            proofUrl = '';
            reason = noReceiptReason;
          }
          const updateOwn = withReasonColumn => env.DB.prepare(`
            UPDATE finance_entries SET amount = ?, description = ?, proof_url = ?${withReasonColumn ? ', no_receipt_reason = ?' : ''} WHERE id = ?
          `).bind(amount, description, proofUrl, ...(withReasonColumn ? [reason] : []), id).run();
          try {
            await updateOwn(true);
          } catch (error) {
            if (!/no_receipt_reason/i.test(String(error?.message || error))) throw error;
            if (reason) return bad('Alasan tanpa struk belum bisa disimpan: jalankan migration-crew-expense-no-receipt.sql di D1.', 503);
            await updateOwn(false);
          }
          if (entry.review_status === 'approved' && entry.review_sent_at) {
            await env.DB.prepare(`
              UPDATE finance_entries SET amount = ?, description = ?, proof_url = ? WHERE id = ? AND created_by = 'crew-expense'
            `).bind(amount, reason ? `${description} (Tanpa struk: ${reason})`.trim() : description, proofUrl, `crew-expense-${id}`).run();
          }
          return json({ ok:true, data:{ id, amount, description, proof_url:proofUrl, no_receipt_reason:reason } });
        }
        if (['removed', 'removed-rejected'].includes(entry.review_status)) return bad('Pengeluaran ini sudah dihapus dari Laporan Crew.', 409);
        if (entry.review_status === 'approved') return bad('Pengeluaran ini sudah diterima dan masuk pengeluaran.', 409);
        const now = new Date().toISOString();
        if (action === 'send') {
          if (entry.review_status === 'sent') return bad('Pengeluaran ini sudah dikirim ke Admin.', 409);
          await env.DB.prepare(`UPDATE finance_entries SET review_status = 'sent', review_sent_at = ? WHERE id = ?`).bind(now, id).run();
          return json({ ok:true, data:{ id, review_status:'sent', review_sent_at:now } });
        }
        if (action === 'reject') {
          if (entry.review_status === 'rejected') return bad('Pengeluaran ini sudah ditolak.', 409);
          await env.DB.prepare(`UPDATE finance_entries SET review_status = 'rejected' WHERE id = ?`).bind(id).run();
          return json({ ok:true, data:{ id, review_status:'rejected', review_sent_at:entry.review_sent_at || '' } });
        }
        if (!entry.review_sent_at) return bad('Pengeluaran ini belum dikirim ke Admin dari Dashboard Check In Crew.', 409);
        // Diterima: baris crew tetap jadi riwayat di Dashboard Check In Crew, sedangkan pengeluaran dicatat sebagai
        // salinan terpisah (crew-expense-<id>) supaya menghapusnya di menu Pengeluaran tidak menghapus riwayat crew.
        // Alasan tanpa struk (kalau ada) ikut tercatat di keterangan salinan, karena menu Pengeluaran tidak punya kolom khusus.
        let noReceiptReason = '';
        try {
          const reasonRow = await env.DB.prepare('SELECT no_receipt_reason FROM finance_entries WHERE id = ?').bind(id).first();
          noReceiptReason = String(reasonRow?.no_receipt_reason || '').trim();
        } catch (error) {
          if (!/no_receipt_reason/i.test(String(error?.message || error))) throw error;
        }
        await env.DB.batch([
          env.DB.prepare(`UPDATE finance_entries SET review_status = 'approved' WHERE id = ?`).bind(id),
          env.DB.prepare(`
            INSERT OR IGNORE INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at, proof_url
            ) SELECT 'crew-expense-' || id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount,
              CASE WHEN ? <> '' THEN trim(description || ' (Tanpa struk: ' || ? || ')') ELSE description END,
              payee, recurrence, 'crew-expense', created_at, proof_url
            FROM finance_entries WHERE id = ?
          `).bind(noReceiptReason, noReceiptReason, id),
        ]);
        return json({ ok:true, data:{ id, review_status:'approved', review_sent_at:entry.review_sent_at } });
      }

      // Slip gaji crew yang dikirim dari Dashboard Check In Crew ke Dashboard utama (menu Gaji Crew).
      // Satu slip per crew per bulan; mengirim ulang memperbarui slip selama belum ditandai dibayar.
      if (path === '/dashboard/crew-payroll' && ['GET', 'POST'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola slip gaji crew.', 403);
        const missingTable = 'Slip gaji crew belum disiapkan. Jalankan migration-crew-payroll-slips.sql di D1.';
        const missingReviewColumn = 'Kolom catatan review belum tersedia. Jalankan migration-crew-payroll-review-note.sql di D1.';

        if (request.method === 'GET') {
          const month = String(url.searchParams.get('month') || '').trim();
          if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return bad('Bulan tidak valid.');
          try {
            const result = await env.DB.prepare(`
              SELECT id, crew, period_month, base_pay, extra_total, total_pay, data_json, status,
                     review_note, submitted_by, submitted_at, updated_at, paid_at
              FROM crew_payroll_slips ${month ? 'WHERE period_month = ?' : ''}
              ORDER BY period_month DESC, crew COLLATE NOCASE LIMIT 500
            `).bind(...(month ? [month] : [])).all();
            const data = (result.results || []).map(row => {
              let detail = {};
              try { detail = JSON.parse(row.data_json); } catch {}
              const { data_json, ...rest } = row;
              return { ...rest, detail };
            });
            return json({ ok:true, data });
          } catch (error) {
            if (/no such table: crew_payroll_slips/i.test(String(error?.message || error))) return bad(missingTable, 503);
            if (/no such column: review_note/i.test(String(error?.message || error))) return bad(missingReviewColumn, 503);
            throw error;
          }
        }

        const body = await request.json();
        const crew = String(body.crew || '').trim();
        const month = String(body.month || '').trim();
        const wholeNumber = value => {
          const number = Math.round(Number(value));
          return Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000_000 ? number : null;
        };
        const extraFields = ['tunjangan', 'bonus', 'bensin', 'reimburse', 'pulsa'];
        const extraPay = {};
        for (const field of extraFields) {
          const amount = wholeNumber(body.extra_pay?.[field] ?? 0);
          if (amount === null) return bad('Nominal gaji tambahan tidak valid.');
          extraPay[field] = amount;
        }
        const dailyRate = wholeNumber(body.daily_rate);
        const totalDays = wholeNumber(body.total_days);
        const checkInDays = wholeNumber(body.check_in_days);
        const absentDays = wholeNumber(body.absent_days);
        const deduction = wholeNumber(body.deduction);
        const basePay = wholeNumber(body.base_pay);
        const totalPay = wholeNumber(body.total_pay);
        const properties = Array.isArray(body.properties) ? body.properties : null;
        if (crew.length < 2 || crew.length > 80 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
            [dailyRate, totalDays, checkInDays, absentDays, deduction, basePay, totalPay].some(value => value === null) ||
            !properties || properties.length > 300) {
          return bad('Data slip gaji tidak valid.');
        }
        const extraTotal = extraFields.reduce((sum, field) => sum + extraPay[field], 0);
        if (Math.abs(basePay + extraTotal - totalPay) > 1) return bad('Total gaji tidak sesuai dengan rinciannya.');
        const cleanedProperties = [];
        for (const item of properties) {
          const unit = String(item?.unit || '').trim();
          const days = wholeNumber(item?.days);
          const visits = wholeNumber(item?.visits);
          const honor = wholeNumber(item?.honor);
          const fuel = wholeNumber(item?.fuel ?? 0);
          if (!unit || unit.length > 180 || [days, visits, honor, fuel].some(value => value === null)) return bad('Rincian properti slip tidak valid.');
          cleanedProperties.push({ unit, days, visits, honor, fuel });
        }
        const detail = {
          daily_rate:dailyRate, total_days:totalDays, check_in_days:checkInDays, absent_days:absentDays,
          deduction, extra_pay:extraPay, properties:cleanedProperties,
        };
        const now = new Date().toISOString();
        try {
          const existing = await env.DB.prepare('SELECT id, status FROM crew_payroll_slips WHERE crew = ? AND period_month = ?')
            .bind(crew, month).first();
          if (existing?.status === 'paid') return bad('Slip bulan ini sudah dimasukkan sebagai pengeluaran. Minta admin membatalkannya di menu Laporan Crew sebelum mengirim revisi.', 409);
          const id = existing?.id || crypto.randomUUID();
          // Kirim ulang (revisi) menghapus status ditolak dan mengembalikan slip ke antrean review.
          await env.DB.prepare(`
            INSERT INTO crew_payroll_slips (
              id, crew, period_month, base_pay, extra_total, total_pay, data_json, status,
              review_note, submitted_by, submitted_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', '', ?, ?, ?)
            ON CONFLICT(crew, period_month) DO UPDATE SET
              base_pay = excluded.base_pay, extra_total = excluded.extra_total, total_pay = excluded.total_pay,
              data_json = excluded.data_json, review_note = '', submitted_by = excluded.submitted_by,
              updated_at = excluded.updated_at
          `).bind(id, crew, month, basePay, extraTotal, totalPay, JSON.stringify(detail),
            String(tokenData.account_id || ''), now, now).run();
          return json({ ok:true, data:{ id, crew, period_month:month, total_pay:totalPay, updated:Boolean(existing) } }, existing ? 200 : 201);
        } catch (error) {
          if (/no such table: crew_payroll_slips/i.test(String(error?.message || error))) return bad(missingTable, 503);
          if (/no such column: review_note|no column named review_note/i.test(String(error?.message || error))) return bad(missingReviewColumn, 503);
          throw error;
        }
      }

      const crewPayrollMatch = path.match(/^\/dashboard\/crew-payroll\/([^/]+)$/);
      if (request.method === 'DELETE' && crewPayrollMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat menghapus slip gaji crew.', 403);
        const id = decodeURIComponent(crewPayrollMatch[1]);
        let body = {};
        try { body = await request.json(); } catch {}
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        let slip;
        try {
          slip = await env.DB.prepare('SELECT id, crew, period_month, status FROM crew_payroll_slips WHERE id = ?').bind(id).first();
        } catch (error) {
          if (/no such table: crew_payroll_slips/i.test(String(error?.message || error))) {
            return bad('Slip gaji crew belum disiapkan. Jalankan migration-crew-payroll-slips.sql di D1.', 503);
          }
          throw error;
        }
        if (!slip) return bad('Slip tidak ditemukan.', 404);
        // Slip yang sudah masuk pengeluaran ikut menghapus catatan pengeluarannya.
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM finance_entries WHERE created_by = 'crew-payroll' AND substr(id, 1, ?) = ?`).bind(`crew-payroll-${slip.id}-`.length, `crew-payroll-${slip.id}-`),
          env.DB.prepare('DELETE FROM crew_payroll_slips WHERE id = ?').bind(id),
        ]);
        if (slip.status === 'paid') {
          // Catatan honor otomatis dari check-in bulan itu dikembalikan, sama seperti saat slip dibatalkan.
          const [slipYear, slipMonth] = String(slip.period_month).split('-').map(Number);
          const daysResult = await env.DB.prepare(`
            SELECT DISTINCT work_date FROM checkins WHERE crew = ? AND work_date >= ? AND work_date < ?
          `).bind(slip.crew, `${slip.period_month}-01`, new Date(Date.UTC(slipYear, slipMonth, 1)).toISOString().slice(0, 10)).all();
          await safelySyncCheckinPayrollExpenses(env, (daysResult.results || []).map(row => ({ crew:slip.crew, workDate:row.work_date })));
        }
        return json({ ok:true, data:{ id, deleted:true } });
      }
      if (request.method === 'PATCH' && crewPayrollMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola slip gaji crew.', 403);
        const id = decodeURIComponent(crewPayrollMatch[1]);
        const body = await request.json();
        // accept = masukkan sebagai pengeluaran, reject = tolak (revisi di Dashboard Check In Crew),
        // undo = batalkan slip yang sudah dimasukkan sebagai pengeluaran.
        const action = String(body.action || '').trim();
        if (!['accept', 'reject', 'undo'].includes(action)) return bad('Aksi slip tidak valid.');
        const status = action === 'accept' ? 'paid' : 'submitted';
        let slip;
        try {
          slip = await env.DB.prepare(`
            SELECT id, crew, period_month, base_pay, extra_total, total_pay, data_json, status, review_note
            FROM crew_payroll_slips WHERE id = ?
          `).bind(id).first();
        } catch (error) {
          if (/no such table: crew_payroll_slips/i.test(String(error?.message || error))) {
            return bad('Slip gaji crew belum disiapkan. Jalankan migration-crew-payroll-slips.sql di D1.', 503);
          }
          if (/no such column: review_note/i.test(String(error?.message || error))) {
            return bad('Kolom catatan review belum tersedia. Jalankan migration-crew-payroll-review-note.sql di D1.', 503);
          }
          throw error;
        }
        if (!slip) return bad('Slip tidak ditemukan.', 404);
        const reviewNote = action === 'reject' ? String(body.note || '').trim() : '';
        if (action === 'accept') {
          if (slip.status === 'paid') return bad('Slip ini sudah dimasukkan sebagai pengeluaran.', 409);
          if (slip.review_note) return bad('Slip ini ditolak. Tunggu revisi yang dikirim ulang dari Dashboard Check In Crew.', 409);
        }
        if (action === 'reject') {
          if (slip.status === 'paid') return bad('Slip sudah dimasukkan sebagai pengeluaran. Batalkan dulu sebelum menolak.', 409);
          if (reviewNote.length < 3 || reviewNote.length > 200) return bad('Alasan penolakan wajib diisi (3-200 karakter).');
        }
        if (action === 'undo' && slip.status !== 'paid') return bad('Slip ini belum dimasukkan sebagai pengeluaran.', 409);

        const now = new Date().toISOString();
        const paidAt = status === 'paid' ? now : null;
        const [slipYear, slipMonth] = String(slip.period_month).split('-').map(Number);
        const monthStart = `${slip.period_month}-01`;
        const nextMonthStart = new Date(Date.UTC(slipYear, slipMonth, 1)).toISOString().slice(0, 10);
        const entryDate = new Date(Date.UTC(slipYear, slipMonth, 0)).toISOString().slice(0, 10);
        const entryPrefix = `crew-payroll-${slip.id}-`;
        // Catatan pengeluaran dari slip dihapus dulu lalu dibuat ulang, jadi aksi ini aman diulang.
        const statements = [
          env.DB.prepare(`DELETE FROM finance_entries WHERE created_by = 'crew-payroll' AND substr(id, 1, ?) = ?`).bind(entryPrefix.length, entryPrefix),
        ];

        if (status === 'paid') {
          let detail = {};
          try { detail = JSON.parse(slip.data_json); } catch {}
          const categoryResult = await env.DB.prepare(`
            SELECT id, name FROM finance_categories
            WHERE id IN ('expense-crew-fee', 'expense-salary') AND kind = 'expense' AND active = 1
          `).all();
          const categoriesById = new Map((categoryResult.results || []).map(category => [category.id, category]));
          const feeCategory = categoriesById.get('expense-crew-fee');
          const salaryCategory = categoriesById.get('expense-salary') || feeCategory;
          if (!feeCategory) return bad('Kategori Fee untuk Crew belum tersedia. Jalankan migration-crew-expense-category.sql di D1.', 409);

          const propertyResult = await env.DB.prepare('SELECT id, name FROM properties WHERE active = 1').all();
          const normalizeName = value => String(value || '').normalize('NFKD')
            .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const propertyIds = new Map((propertyResult.results || []).map(property => [normalizeName(property.name), property.id]));
          const periodLabel = `${String(slip.period_month)}`;
          const rupiah = value => `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;
          const entries = [];
          let allocatedHonor = 0;
          let allocatedFuel = 0;

          // Honor dan bensin per properti (sudah dibagi per laporan di slip).
          for (const item of Array.isArray(detail.properties) ? detail.properties : []) {
            const honor = Math.round(Number(item.honor) || 0);
            const fuel = Math.round(Number(item.fuel) || 0);
            allocatedHonor += honor;
            allocatedFuel += fuel;
            if (honor + fuel <= 0) continue;
            entries.push({
              key:`p-${(await sha256Hex(String(item.unit))).slice(0, 16)}`,
              category:feeCategory,
              propertyName:String(item.unit),
              propertyId:propertyIds.get(normalizeName(item.unit)) || null,
              amount:honor + fuel,
              description:`Gaji ${slip.crew} ${periodLabel} - honor ${rupiah(honor)}${fuel ? ` + bensin ${rupiah(fuel)}` : ''}`,
            });
          }
          // Sisa gaji pokok dan bensin pada hari yang tidak punya laporan properti.
          const honorRest = Math.round(Number(slip.base_pay) || 0) - allocatedHonor;
          if (honorRest > 0) {
            entries.push({ key:'base-rest', category:feeCategory, propertyName:'', propertyId:null, amount:honorRest,
              description:`Gaji pokok ${slip.crew} ${periodLabel} - hari tanpa laporan properti` });
          }
          const fuelRest = Math.round(Number(detail.extra_pay?.bensin) || 0) - allocatedFuel;
          if (fuelRest > 0) {
            entries.push({ key:'fuel-rest', category:feeCategory, propertyName:'', propertyId:null, amount:fuelRest,
              description:`Uang bensin ${slip.crew} ${periodLabel} - hari tanpa laporan properti` });
          }
          // Tambahan lain. Reimburse tidak dicatat lagi karena struknya sudah masuk lewat Pengeluaran Lapangan.
          const extraLabels = { tunjangan:'Tunjangan', bonus:'Bonus', pulsa:'Pulsa / Komunikasi' };
          for (const [field, label] of Object.entries(extraLabels)) {
            const amount = Math.round(Number(detail.extra_pay?.[field]) || 0);
            if (amount > 0) {
              entries.push({ key:field, category:salaryCategory, propertyName:'', propertyId:null, amount,
                description:`${label} ${slip.crew} ${periodLabel}` });
            }
          }

          // Slip menjadi sumber tunggal: catatan otomatis dari check-in untuk crew dan bulan ini diganti.
          statements.push(env.DB.prepare(`
            DELETE FROM finance_entries
            WHERE created_by = 'checkin-payroll' AND payee = ? AND entry_date >= ? AND entry_date < ?
          `).bind(slip.crew, monthStart, nextMonthStart));
          for (const entry of entries) {
            statements.push(env.DB.prepare(`
              INSERT INTO finance_entries (
                id, kind, category_id, category_name, property_id, property_name,
                entry_date, amount, description, payee, recurrence, created_by, created_at
              ) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, 'once', 'crew-payroll', ?)
            `).bind(`${entryPrefix}${entry.key}`, entry.category.id, entry.category.name, entry.propertyId,
              entry.propertyName, entryDate, entry.amount, entry.description.slice(0, 240), slip.crew, now));
          }
        }

        statements.push(env.DB.prepare('UPDATE crew_payroll_slips SET status = ?, paid_at = ?, review_note = ?, updated_at = ? WHERE id = ?')
          .bind(status, paidAt, reviewNote, now, id));
        await env.DB.batch(statements);

        if (action === 'undo') {
          // Dibatalkan: kembalikan catatan honor otomatis dari data check-in bulan ini.
          const daysResult = await env.DB.prepare(`
            SELECT DISTINCT work_date FROM checkins WHERE crew = ? AND work_date >= ? AND work_date < ?
          `).bind(slip.crew, monthStart, nextMonthStart).all();
          await safelySyncCheckinPayrollExpenses(env, (daysResult.results || []).map(row => ({ crew:slip.crew, workDate:row.work_date })));
        }
        return json({ ok:true, data:{ id, status, paid_at:paidAt, review_note:reviewNote } });
      }

      // Crew: lapor barang baru yang ditemukan di lapangan (belum ada di daftar resmi).
      // Masuk sebagai review_status='pending' sampai Admin/Operasional menyetujui dari Dashboard.
      if (request.method === 'POST' && path === '/checkin/inventory-items') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan.', 401);
        const body = await request.json();
        const propertyName = String(body.property || '').trim();
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const category = String(body.category || '').trim();
        const expectedQty = Number(body.expected_qty || 1);
        const photo = String(body.photo || '');
        if (!propertyName) return bad('Properti wajib dipilih.');
        if (name.length < 2 || name.length > 120) return bad('Nama barang wajib diisi (maks 120 karakter).');
        if (category.length > 60) return bad('Kategori maksimal 60 karakter.');
        if (!Number.isSafeInteger(expectedQty) || expectedQty < 1 || expectedQty > 10000) return bad('Jumlah tidak valid.');
        let photoUrl = '';
        if (photo) {
          let parsedPhoto;
          try { parsedPhoto = parseDataUrl(photo); }
          catch { return bad('Foto tidak valid.'); }
          if (!String(parsedPhoto.contentType || '').startsWith('image/')) return bad('Foto harus berupa gambar.');
          if (parsedPhoto.bytes.byteLength >= 100 * 1024) return bad('Foto wajib di bawah 100 KB.');
          const id = crypto.randomUUID();
          const key = `inventory-items/${id}/photo.jpg`;
          await env.PHOTOS.put(key, parsedPhoto.bytes, { httpMetadata:{ contentType:parsedPhoto.contentType || 'image/jpeg' } });
          photoUrl = publicFileUrl(url.origin, key);
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await env.DB.prepare(`
            INSERT INTO property_inventory_items (
              id, property_id, property_name, name, category, expected_qty, active,
              review_status, source, photo_url, reported_by, created_at, updated_at
            ) VALUES (?, '', ?, ?, ?, ?, 1, 'pending', 'crew', ?, ?, ?, ?)
          `).bind(id, propertyName, name, category, expectedQty, photoUrl, crewSession.crew, now, now).run();
        } catch (error) {
          if (/no such column: review_status/i.test(String(error?.message || error))) {
            return bad('Fitur lapor barang baru belum disiapkan. Jalankan migration-property-inventory-crew-proposals.sql di D1.', 503);
          }
          throw error;
        }

        const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
        const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
        if (telegramToken && telegramChatId) {
          const text = [
            'LAPORAN BARANG BARU - INVENTARIS',
            `Properti: ${propertyName}`,
            `Barang: ${name}${category ? ` (${category})` : ''}`,
            `Crew: ${crewSession.crew}`,
            'Menunggu review Admin/Operasional di Dashboard.',
            now,
          ].join('\n');
          try {
            await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method:'POST', headers:{ 'Content-Type':'application/json' },
              body:JSON.stringify({ chat_id:telegramChatId, text }),
            });
          } catch {
            // Jangan gagalkan penyimpanan hanya karena notifikasi Telegram gagal terkirim.
          }
        }

        return json({ ok:true, data:{ id, property_name:propertyName, name, category, expected_qty:expectedQty, photo_url:photoUrl, review_status:'pending' } }, 201);
      }

      // Crew: submit hasil ceklis kondisi barang (momen tertentu, bukan wajib tiap kunjungan).
      if (request.method === 'POST' && path === '/checkin/inventory-checks') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const crewSession = await getCrewTokenPayload(request, adminSecret);
        if (!crewSession) return bad('Login crew diperlukan.', 401);
        const body = await request.json();
        const propertyName = String(body.property || '').trim();
        const items = Array.isArray(body.items) ? body.items : [];
        const photos = Array.isArray(body.photos) ? body.photos : [];
        if (!propertyName) return bad('Properti wajib dipilih.');
        if (!items.length || items.length > 300) return bad('Daftar barang tidak valid.');
        const validStatuses = ['ok', 'rusak', 'hilang'];
        const cleanedItems = [];
        for (const item of items) {
          const itemId = String(item?.item_id || '').trim();
          const name = String(item?.name || '').trim();
          const status = validStatuses.includes(item?.status) ? item.status : null;
          const note = String(item?.note || '').trim();
          if (!itemId || !name || !status || note.length > 300) return bad('Status salah satu barang tidak valid.');
          cleanedItems.push({ item_id:itemId, name, status, note });
        }
        if (photos.length > 10) return bad('Maksimal 10 foto dokumentasi.');
        const hasIssues = cleanedItems.some(item => item.status !== 'ok');
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const photoUrls = [];
        for (let index = 0; index < photos.length; index++) {
          let parsedPhoto;
          try { parsedPhoto = parseDataUrl(photos[index]); }
          catch { return bad('Salah satu foto dokumentasi tidak valid.'); }
          if (!String(parsedPhoto.contentType || '').startsWith('image/')) return bad('Foto dokumentasi harus berupa gambar.');
          if (parsedPhoto.bytes.byteLength >= 100 * 1024) return bad('Setiap foto dokumentasi wajib di bawah 100 KB.');
          const key = `inventory-checks/${id}/photo-${index + 1}.jpg`;
          await env.PHOTOS.put(key, parsedPhoto.bytes, { httpMetadata:{ contentType:parsedPhoto.contentType || 'image/jpeg' } });
          photoUrls.push(publicFileUrl(url.origin, key));
        }
        try {
          await env.DB.prepare(`
            INSERT INTO property_inventory_checks (id, property_id, property_name, crew, items_json, photo_urls_json, has_issues, resolved, resolved_note, created_at)
            VALUES (?, '', ?, ?, ?, ?, ?, 0, '', ?)
          `).bind(id, propertyName, crewSession.crew, JSON.stringify(cleanedItems), JSON.stringify(photoUrls), hasIssues ? 1 : 0, now).run();
        } catch (error) {
          if (/no such table: property_inventory_checks/i.test(String(error?.message || error))) {
            return bad('Inventaris belum disiapkan. Jalankan migration-property-inventory.sql di D1.', 503);
          }
          throw error;
        }

        if (hasIssues) {
          const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
          const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
          if (telegramToken && telegramChatId) {
            const issueLines = cleanedItems.filter(item => item.status !== 'ok')
              .map(item => `- ${item.name}: ${item.status === 'rusak' ? 'Rusak' : 'Hilang'}${item.note ? ` (${item.note})` : ''}`);
            const text = [
              'LAPORAN INVENTARIS BERMASALAH',
              `Properti: ${propertyName}`,
              `Crew: ${crewSession.crew}`,
              '',
              ...issueLines,
              '',
              now,
            ].join('\n');
            try {
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method:'POST', headers:{ 'Content-Type':'application/json' },
                body:JSON.stringify({ chat_id:telegramChatId, text }),
              });
            } catch {
              // Jangan gagalkan penyimpanan hanya karena notifikasi Telegram gagal terkirim.
            }
          }
        }

        return json({ ok:true, data:{ id, property_name:propertyName, crew:crewSession.crew, items:cleanedItems, photo_urls:photoUrls, has_issues:hasIssues, created_at:now } }, 201);
      }

      if (path === '/dashboard/crews') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        const dashboardAccount = hasDashboardRole(tokenData);
        const legacyAdmin = Boolean(tokenData && !tokenData.account_id && !tokenData.role);
        if (!dashboardAccount && !legacyAdmin) {
          return bad('Login dashboard diperlukan', 401);
        }

        if (request.method === 'GET') {
          let result;
          try {
            result = await env.DB.prepare('SELECT id, crew_code, name, active, daily_salary, fuel_allowance FROM crews ORDER BY active DESC, name COLLATE NOCASE ASC').all();
          } catch (error) {
            if (/no such column: crew_code/i.test(String(error?.message || error))) return bad('ID Crew belum tersedia. Jalankan migration-crew-id.sql di D1.', 503);
            throw error;
          }
          return json({ ok:true, data:result.results || [] });
        }

        if (dashboardAccount && !hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat mengelola karyawan.', 403);
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const name = String(body.name || '').trim().replace(/\s+/g, ' ');
          const crewCode = String(body.crew_code || '').trim().toUpperCase();
          const pin = String(body.pin || '').trim();
          if (name.length < 2 || name.length > 80 || (crewCode && !/^[A-Z0-9_-]{3,20}$/.test(crewCode)) || !/^\d{6}$/.test(pin)) {
            return bad('Nama dan PIN login tepat 6 digit wajib diisi. ID Crew opsional dan akan dibuat otomatis bila dikosongkan.');
          }
          const [existingName, existingCode] = await Promise.all([
            env.DB.prepare('SELECT id, crew_code, active FROM crews WHERE name = ? COLLATE NOCASE').bind(name).first(),
            crewCode ? env.DB.prepare('SELECT id FROM crews WHERE crew_code = ? COLLATE NOCASE').bind(crewCode).first() : Promise.resolve(null),
          ]);
          if (existingCode && existingCode.id !== existingName?.id) return bad('ID Crew tersebut sudah digunakan.', 409);
          if (existingName?.active) return bad('Nama crew tersebut sudah terdaftar.', 409);
          const postedDailySalary = parseDailySalary(body.daily_salary);
          if (Number.isNaN(postedDailySalary)) return bad('Gaji pokok per hari tidak valid.');
          const dailySalary = postedDailySalary ?? 100000;
          const pinHash = await sha256Hex(pin);
          if (existingName) {
            const restoredCrewCode = crewCode || existingName.crew_code;
            await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ?, pin_hash = ?, active = 1, daily_salary = ? WHERE id = ?')
              .bind(restoredCrewCode, name, pinHash, dailySalary, existingName.id).run();
            return json({ ok:true, data:{ id:existingName.id, crew_code:restoredCrewCode, name, active:1 } });
          }
          const id = crypto.randomUUID();
          const generatedCrewCode = crewCode || `CR-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
          await env.DB.prepare('INSERT INTO crews (id, crew_code, name, pin_hash, active, daily_salary) VALUES (?, ?, ?, ?, 1, ?)')
            .bind(id, generatedCrewCode, name, pinHash, dailySalary).run();
          return json({ ok:true, data:{ id, crew_code:generatedCrewCode, name, active:1 } }, 201);
        }
      }

      const dashboardCrewMatch = path.match(/^\/dashboard\/crews\/([^/]+)$/);
      if (dashboardCrewMatch && ['PATCH', 'DELETE'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        const legacyAdmin = Boolean(tokenData && !tokenData.account_id && !tokenData.role);
        if (!legacyAdmin && !hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat mengelola karyawan.', 403);
        }
        const id = decodeURIComponent(dashboardCrewMatch[1]);
        const crew = await env.DB.prepare('SELECT id, crew_code, name, active, daily_salary, fuel_allowance FROM crews WHERE id = ?').bind(id).first();
        if (!crew) return bad('Karyawan tidak ditemukan.', 404);

        if (request.method === 'DELETE') {
          let body = {};
          try { body = await request.json(); } catch {}
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          await env.DB.prepare('UPDATE crews SET active = 0 WHERE id = ?').bind(id).run();
          return json({ ok:true, data:{ id, active:0 } });
        }

        const body = await request.json();
        // Admin biasa wajib PIN Master (master_pin) untuk mengubah data crew. 'pin' di sini adalah PIN login crew.
        if (isRestrictedAdmin(tokenData)) {
          const pinError = await checkMasterDeletePin(env, body.master_pin);
          if (pinError) return bad(pinError.error, pinError.status);
        }
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const crewCode = String(body.crew_code || '').trim().toUpperCase();
        const pin = String(body.pin || '').trim();
        if (name.length < 2 || name.length > 80 || !/^[A-Z0-9_-]{3,20}$/.test(crewCode)) return bad('Nama dan ID Crew (3–20 karakter) wajib valid.');
        if (pin && !/^\d{6}$/.test(pin)) return bad('PIN Crew harus tepat 6 digit.');
        const duplicate = await env.DB.prepare('SELECT id FROM crews WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1')
          .bind(name, id).first();
        if (duplicate) return bad('Nama karyawan tersebut sudah digunakan.', 409);
        const duplicateCode = await env.DB.prepare('SELECT id FROM crews WHERE crew_code = ? COLLATE NOCASE AND id <> ? LIMIT 1')
          .bind(crewCode, id).first();
        if (duplicateCode) return bad('ID Crew tersebut sudah digunakan.', 409);
        const postedDailySalary = parseDailySalary(body.daily_salary);
        if (Number.isNaN(postedDailySalary)) return bad('Gaji pokok per hari tidak valid.');
        const dailySalary = postedDailySalary ?? Number(crew.daily_salary ?? 100000);
        const postedFuel = parseDailySalary(body.fuel_allowance);
        if (Number.isNaN(postedFuel)) return bad('Uang bensin tidak valid.');
        const fuelAllowance = postedFuel ?? Number(crew.fuel_allowance ?? 0);
        if (pin) {
          await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ?, pin_hash = ?, daily_salary = ?, fuel_allowance = ? WHERE id = ?')
            .bind(crewCode, name, await sha256Hex(pin), dailySalary, fuelAllowance, id).run();
        } else {
          await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ?, daily_salary = ?, fuel_allowance = ? WHERE id = ?').bind(crewCode, name, dailySalary, fuelAllowance, id).run();
        }
        return json({ ok:true, data:{ id, crew_code:crewCode, name, active:Number(crew.active) } });
      }

      // ================= AGEN / MARKETING (fee per booking + Agen Portal) =================
      // Butuh migrations/migration-dashboard-agents.sql dijalankan di D1 sebelum endpoint ini dipakai.
      if (path === '/dashboard/agents') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan', 401);

        if (request.method === 'GET') {
          let result;
          try {
            result = await env.DB.prepare(`
              SELECT id, agent_code, name, phone, default_fee_type, default_fee_value, active
              FROM dashboard_agents ORDER BY active DESC, name COLLATE NOCASE ASC
            `).all();
          } catch (error) {
            if (/no such table: dashboard_agents/i.test(String(error?.message || error))) {
              return bad('Daftar Agen belum disiapkan. Jalankan migration-dashboard-agents.sql di D1.', 503);
            }
            throw error;
          }
          return json({ ok:true, data:result.results || [] });
        }

        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola agen.', 403);

        if (request.method === 'POST') {
          const body = await request.json();
          const name = String(body.name || '').trim().replace(/\s+/g, ' ');
          const phone = String(body.phone || '').trim();
          const agentCode = String(body.agent_code || '').trim().toUpperCase();
          const pin = String(body.pin || '').trim();
          const defaultFeeType = body.default_fee_type === 'percent' ? 'percent' : 'amount';
          const defaultFeeValue = Number(body.default_fee_value || 0);
          if (name.length < 2 || name.length > 80 || phone.length > 30 || (agentCode && !/^[A-Z0-9_-]{3,20}$/.test(agentCode)) || !/^\d{6}$/.test(pin) ||
              !Number.isSafeInteger(defaultFeeValue) || defaultFeeValue < 0 || (defaultFeeType === 'percent' && defaultFeeValue > 100)) {
            return bad('Nama, telepon, dan PIN login tepat 6 digit wajib diisi. ID Agen opsional dan akan dibuat otomatis bila dikosongkan.');
          }
          let duplicateName;
          try {
            duplicateName = await env.DB.prepare('SELECT id FROM dashboard_agents WHERE name = ? COLLATE NOCASE AND active = 1').bind(name).first();
          } catch (error) {
            if (/no such table: dashboard_agents/i.test(String(error?.message || error))) {
              return bad('Daftar Agen belum disiapkan. Jalankan migration-dashboard-agents.sql di D1.', 503);
            }
            throw error;
          }
          if (duplicateName) return bad('Nama agen tersebut sudah terdaftar.', 409);
          const id = crypto.randomUUID();
          const generatedCode = agentCode || `AG-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
          const duplicateCode = await env.DB.prepare('SELECT id FROM dashboard_agents WHERE agent_code = ? COLLATE NOCASE').bind(generatedCode).first();
          if (duplicateCode) return bad('Kode Agen tersebut sudah digunakan.', 409);
          const now = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO dashboard_agents (id, agent_code, name, phone, default_fee_type, default_fee_value, pin_hash, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).bind(id, generatedCode, name, phone, defaultFeeType, defaultFeeValue, await sha256Hex(pin), now, now).run();
          return json({ ok:true, data:{ id, agent_code:generatedCode, name, phone, default_fee_type:defaultFeeType, default_fee_value:defaultFeeValue, active:1 } }, 201);
        }

        return bad('Metode agen tidak didukung.', 405);
      }

      const dashboardAgentMatch = path.match(/^\/dashboard\/agents\/([^/]+)$/);
      if (dashboardAgentMatch && ['PATCH', 'DELETE'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola agen.', 403);
        const id = decodeURIComponent(dashboardAgentMatch[1]);
        let agent;
        try {
          agent = await env.DB.prepare('SELECT id, agent_code, name, active FROM dashboard_agents WHERE id = ?').bind(id).first();
        } catch (error) {
          if (/no such table: dashboard_agents/i.test(String(error?.message || error))) {
            return bad('Daftar Agen belum disiapkan. Jalankan migration-dashboard-agents.sql di D1.', 503);
          }
          throw error;
        }
        if (!agent) return bad('Agen tidak ditemukan.', 404);

        if (request.method === 'DELETE') {
          let body = {};
          try { body = await request.json(); } catch {}
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          await env.DB.prepare('UPDATE dashboard_agents SET active = 0 WHERE id = ?').bind(id).run();
          return json({ ok:true, data:{ id, active:0 } });
        }

        const body = await request.json();
        // Admin biasa wajib PIN Master (master_pin) untuk mengubah data agen. 'pin' di sini adalah PIN login agen.
        if (isRestrictedAdmin(tokenData)) {
          const pinError = await checkMasterDeletePin(env, body.master_pin);
          if (pinError) return bad(pinError.error, pinError.status);
        }
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const agentCode = String(body.agent_code || '').trim().toUpperCase();
        const phone = String(body.phone || '').trim();
        const pin = String(body.pin || '').trim();
        const defaultFeeType = body.default_fee_type === 'percent' ? 'percent' : 'amount';
        const defaultFeeValue = Number(body.default_fee_value || 0);
        if (name.length < 2 || name.length > 80 || !/^[A-Z0-9_-]{3,20}$/.test(agentCode) || phone.length > 30 || !Number.isSafeInteger(defaultFeeValue) || defaultFeeValue < 0 || (defaultFeeType === 'percent' && defaultFeeValue > 100)) {
          return bad('Nama, ID Agen (3-20 karakter), telepon, dan fee default wajib valid.');
        }
        if (pin && !/^\d{6}$/.test(pin)) return bad('PIN Agen harus tepat 6 digit.');
        const duplicate = await env.DB.prepare('SELECT id FROM dashboard_agents WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1')
          .bind(name, id).first();
        if (duplicate) return bad('Nama agen tersebut sudah digunakan.', 409);
        const duplicateCode = await env.DB.prepare('SELECT id FROM dashboard_agents WHERE agent_code = ? COLLATE NOCASE AND id <> ? LIMIT 1')
          .bind(agentCode, id).first();
        if (duplicateCode) return bad('ID Agen tersebut sudah digunakan.', 409);
        if (pin) {
          await env.DB.prepare(`
            UPDATE dashboard_agents SET name = ?, agent_code = ?, phone = ?, default_fee_type = ?, default_fee_value = ?, pin_hash = ?, updated_at = ?
            WHERE id = ?
          `).bind(name, agentCode, phone, defaultFeeType, defaultFeeValue, await sha256Hex(pin), new Date().toISOString(), id).run();
        } else {
          await env.DB.prepare(`
            UPDATE dashboard_agents SET name = ?, agent_code = ?, phone = ?, default_fee_type = ?, default_fee_value = ?, updated_at = ?
            WHERE id = ?
          `).bind(name, agentCode, phone, defaultFeeType, defaultFeeValue, new Date().toISOString(), id).run();
        }
        return json({ ok:true, data:{ id, agent_code:agentCode, name, phone, default_fee_type:defaultFeeType, default_fee_value:defaultFeeValue, active:Number(agent.active) } });
      }

      if (request.method === 'POST' && path === '/agent/login') {
        const rate = await reserveLoginAttempt(env, request, 'agent-login');
        if (rate.unavailable) return bad('Tabel pembatas login belum tersedia. Jalankan migration-auth-login-rate-limits.sql di D1.', 503);
        if (rate.limited) return bad('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!adminSecret) return bad('Secret sesi Worker belum dikonfigurasi.', 503);
        const body = await request.json();
        const agentCode = String(body.agent_code || '').trim();
        const pin = String(body.pin || '').trim();
        if (!agentCode || !pin) return bad('ID Agen dan PIN wajib diisi.');
        let agent;
        try {
          agent = await env.DB.prepare(`
            SELECT id, agent_code, name, pin_hash, active FROM dashboard_agents
            WHERE agent_code = ? COLLATE NOCASE AND active = 1
          `).bind(agentCode).first();
        } catch (error) {
          if (/no such table: dashboard_agents/i.test(String(error?.message || error))) {
            return bad('Agen Portal belum disiapkan. Jalankan migration-dashboard-agents.sql di D1.', 503);
          }
          throw error;
        }
        if (!agent) return bad('PIN salah atau agen tidak aktif', 401);
        const hash = await sha256Hex(pin);
        if (!constantTimeEqual(hash, agent.pin_hash)) return bad('PIN salah atau agen tidak aktif', 401);
        await clearLoginAttempts(env, request, 'agent-login');
        return json({
          ok:true, token:await createAgentToken(adminSecret, agent.id), expires_in:24 * 60 * 60,
          data:{ agent_id:agent.id, agent_code:agent.agent_code, agent_name:agent.name },
        });
      }

      if (request.method === 'GET' && path === '/agent/bookings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const agentSession = await getAgentTokenPayload(request, adminSecret);
        if (!agentSession) return bad('Login Agen diperlukan.', 401);
        const agent = await env.DB.prepare('SELECT id, agent_code, name FROM dashboard_agents WHERE id = ? AND active = 1')
          .bind(agentSession.agent_id).first();
        if (!agent) return bad('Akses Agen tidak aktif.', 401);
        const result = await env.DB.prepare(`
          SELECT id, property_name, property_code, guest, checkin, checkout, status,
                 agent_fee_type, agent_fee_value, agent_fee_amount, created_at
          FROM dashboard_bookings WHERE agent_id = ? ORDER BY checkin DESC
        `).bind(agent.id).all();
        return json({ ok:true, data:{
          agent:{ id:agent.id, agent_code:agent.agent_code, name:agent.name },
          bookings:(result.results || []).map(row => ({
            id:row.id, propName:row.property_name, propCode:row.property_code, guest:row.guest,
            checkin:row.checkin, checkout:row.checkout, status:row.status,
            feeType:row.agent_fee_type, feeValue:Number(row.agent_fee_value || 0), feeAmount:Number(row.agent_fee_amount || 0),
            createdAt:row.created_at,
          })),
        } });
      }

      if (request.method === 'POST' && path === '/dashboard/password') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) {
          return bad('Sesi dashboard tidak valid. Silakan login kembali.', 401);
        }
        const body = await request.json();
        const currentPassword = String(body.current_password || '');
        const newPassword = String(body.new_password || '');
        if (newPassword.length < 12 || newPassword.length > 256) return bad('Password baru wajib 12 sampai 256 karakter.');
        const account = await env.DB.prepare(`
          SELECT password_salt, password_hash FROM dashboard_users WHERE account_id = ? AND active = 1
        `).bind(tokenData.account_id).first();
        if (!account?.password_hash) return bad('Akun belum memiliki password aktif.', 409);
        const currentHash = await hashDashboardPassword(currentPassword, account.password_salt);
        if (!constantTimeEqual(currentHash, account.password_hash)) return bad('Password saat ini salah.', 401);
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashDashboardPassword(newPassword, salt);
        await env.DB.prepare(`
          UPDATE dashboard_users SET password_salt = ?, password_hash = ?, updated_at = ?
          WHERE account_id = ?
        `).bind(salt, passwordHash, new Date().toISOString(), tokenData.account_id).run();
        return json({ ok: true });
      }

      if (path === '/dashboard/management-data') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) {
          return bad('Login dashboard diperlukan.', 401);
        }

        if (request.method === 'GET') {
          const saved = await env.DB.prepare(`
            SELECT data_json, updated_by, updated_at
            FROM dashboard_management_data WHERE id = 'main'
          `).first();
          if (!saved) return json({ ok:true, data:null });
          let data;
          try { data = JSON.parse(saved.data_json); }
          catch { return bad('Data Owner/properti di D1 rusak dan tidak dapat dibaca.', 500); }
          const catalogResult = await env.DB.prepare(`
            SELECT id, dashboard_id, property_code, publication_status, active, name, category,
                   location, price, beds, baths, guests
            FROM properties
          `).all();
          const catalog = catalogResult.results || [];
          const managedProperties = Array.isArray(data.properties) ? data.properties : [];
          const normalizeName = value => String(value || '').trim().toLocaleLowerCase('id');
          const usedCatalogIds = new Set();
          const properties = managedProperties.map(managed => {
            const matches = catalog.filter(row => normalizeName(row.name) === normalizeName(managed.name));
            const row = catalog.find(item => item.dashboard_id === managed.id) || (matches.length === 1 ? matches[0] : null);
            if (!row) return { ...managed, publication_status:managed.publication_status || 'draft' };
            usedCatalogIds.add(row.id);
            const archived = managed.active === false || Number(row.active) === 0 || row.publication_status === 'archived';
            return {
              ...managed,
              name:row.name,
              code:row.property_code || managed.code,
              type:row.category,
              area:row.location,
              beds:Number(row.beds || 0),
              baths:Number(row.baths || 0),
              guests:Number(row.guests || 0),
              price:Number(row.price || 0),
              active:!archived,
              publication_status:archived ? 'archived' : (row.publication_status || 'draft'),
            };
          });
          for (const row of catalog) {
            if (usedCatalogIds.has(row.id)) continue;
            const id = row.dashboard_id || `D-${slug(row.id)}`;
            const archived = Number(row.active) === 0 || row.publication_status === 'archived';
            properties.push({
              id,
              name:row.name,
              code:row.property_code || slug(row.id).replace(/_/g, '-').slice(0, 20).toUpperCase(),
              type:row.category,
              area:row.location,
              beds:Number(row.beds || 0),
              baths:Number(row.baths || 0),
              guests:Number(row.guests || 0),
              price:Number(row.price || 0),
              owners:[],
              agents:[],
              active:!archived,
              publication_status:archived ? 'archived' : (row.publication_status || 'active'),
            });
          }
          return json({ ok:true, data:{ ...data, properties, updated_by:saved.updated_by, updated_at:saved.updated_at } });
        }

        if (request.method === 'PUT') {
          if (!hasManagementRole(tokenData)) {
            return bad('Hanya Master atau Admin yang dapat menyimpan Owner dan properti.', 403);
          }
          const body = await request.json();
          const owners = Array.isArray(body.owners) ? body.owners : null;
          const properties = Array.isArray(body.properties) ? body.properties : null;
          const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
          const validOwner = owner => owner && typeof owner === 'object' && !Array.isArray(owner) &&
            validId(owner.id) && typeof owner.name === 'string' && owner.name.trim().length >= 2 && owner.name.length <= 160 &&
            String(owner.phone || '').length <= 40 && String(owner.email || '').length <= 200 &&
            String(owner.initial || '').length <= 12 && String(owner.color || '').length <= 120;
          const validShareList = list => Array.isArray(list) && list.length <= 100 && list.every(item => item &&
            validId(item.id) && Number.isFinite(Number(item.share)) && Number(item.share) >= 0 && Number(item.share) <= 100);
          const validAgents = list => Array.isArray(list) && list.length <= 100 && list.every(item => item &&
            typeof item.name === 'string' && item.name.length <= 160 && Number.isFinite(Number(item.share)) && Number(item.share) >= 0 && Number(item.share) <= 100);
          const validProperty = property => property && typeof property === 'object' && !Array.isArray(property) &&
            validId(property.id) && typeof property.name === 'string' && property.name.trim().length >= 2 && property.name.length <= 180 &&
            ['apartment', 'villa', 'guesthouse', 'kos'].includes(String(property.type || property.category || 'villa')) &&
            String(property.code || '').length <= 60 && validShareList(property.owners) && validAgents(property.agents || []);
          if (!owners || !properties || !owners.length || owners.length > 300 || !properties.length || properties.length > 500 ||
              !owners.every(validOwner) || new Set(owners.map(owner => owner.id)).size !== owners.length ||
              !properties.every(validProperty) || new Set(properties.map(property => property.id)).size !== properties.length) {
            return bad('Daftar Owner atau properti tidak valid.');
          }
          const data = { owners, properties };
          const dataJson = JSON.stringify(data);
          if (new TextEncoder().encode(dataJson).byteLength > 524288) return bad('Data Owner/properti melebihi batas 512 KB.');
          const now = new Date().toISOString();
          if (body.initialize_only === true) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO dashboard_management_data (id, data_json, updated_by, updated_at)
              VALUES ('main', ?, ?, ?)
            `).bind(dataJson, tokenData.account_id, now).run();
            const savedManagement = await env.DB.prepare(`
              SELECT data_json FROM dashboard_management_data WHERE id = 'main'
            `).first();
            let savedData;
            try { savedData = JSON.parse(savedManagement.data_json); }
            catch { return bad('Data Owner/properti di D1 rusak dan katalog tidak dapat disinkronkan.', 500); }
            const catalogStatements = await buildDashboardCatalogStatements(env, savedData.properties || [], now);
            if (catalogStatements.length) await env.DB.batch(catalogStatements);
          } else {
            const previous = await env.DB.prepare(`
              SELECT data_json, updated_by, updated_at FROM dashboard_management_data WHERE id = 'main'
            `).first();
            // Data tidak berubah: jangan tulis ulang properti dan management data ke D1.
            if (previous && previous.data_json === dataJson) {
              return json({ ok:true, data:{ ...data, updated_by:previous.updated_by, updated_at:previous.updated_at } });
            }
            const renameStatements = [];
            if (previous) {
              let previousData;
              try { previousData = JSON.parse(previous.data_json); }
              catch { return bad('Data Owner/properti sebelumnya rusak; perubahan nama properti dibatalkan.', 500); }
              const oldProperties = Array.isArray(previousData.properties) ? previousData.properties : [];
              const oldPropertiesById = new Map(oldProperties.filter(property => property?.id).map(property => [property.id, property]));
              const archiveStateChanged = properties.some(property => {
                const oldProperty = oldPropertiesById.get(property.id);
                return oldProperty && (oldProperty.active !== false) !== (property.active !== false);
              });
              if (archiveStateChanged) return bad('Status arsip hanya dapat diubah melalui aksi Arsip/Pulihkan di Dashboard.', 409);
              const oldNameCounts = new Map();
              oldProperties.forEach(property => {
                const key = String(property?.name || '').trim().toLocaleLowerCase('id');
                if (key) oldNameCounts.set(key, (oldNameCounts.get(key) || 0) + 1);
              });
              const renames = properties.flatMap(property => {
                const previousProperty = oldPropertiesById.get(property.id);
                const oldName = String(previousProperty?.name || '').trim();
                const newName = property.name.trim();
                if (!oldName || oldName === newName || oldName.toLocaleLowerCase('id') === newName.toLocaleLowerCase('id')) return [];
                if (oldNameCounts.get(oldName.toLocaleLowerCase('id')) !== 1) return [];
                return [{ oldName, newName }];
              });
              const temporaryNames = renames.map(() => `__YOURHOME_RENAME_${crypto.randomUUID()}__`);
              renames.forEach((rename, index) => {
                renameStatements.push(env.DB.prepare(`
                  UPDATE checkins SET unit = ? WHERE unit = ? COLLATE NOCASE
                `).bind(temporaryNames[index], rename.oldName));
              });
              renames.forEach((rename, index) => {
                renameStatements.push(env.DB.prepare(`
                  UPDATE checkins SET unit = ? WHERE unit = ?
                `).bind(rename.newName, temporaryNames[index]));
              });
            }
            const catalogStatements = await buildDashboardCatalogStatements(env, properties, now);
            renameStatements.push(...catalogStatements);
            renameStatements.push(env.DB.prepare(`
              INSERT INTO dashboard_management_data (id, data_json, updated_by, updated_at)
              VALUES ('main', ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                data_json = excluded.data_json,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
            `).bind(dataJson, tokenData.account_id, now));
            await env.DB.batch(renameStatements);
          }
          const saved = await env.DB.prepare(`
            SELECT data_json, updated_by, updated_at
            FROM dashboard_management_data WHERE id = 'main'
          `).first();
          return json({ ok:true, data:{ ...JSON.parse(saved.data_json), updated_by:saved.updated_by, updated_at:saved.updated_at } });
        }
      }

      const dashboardPropertyAction = path.match(/^\/dashboard\/properties\/([^/]+)\/(archive|restore)$/);
      if (request.method === 'POST' && dashboardPropertyAction) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat mengelola status properti.', 403);
        }
        const dashboardId = decodeURIComponent(dashboardPropertyAction[1]);
        const action = dashboardPropertyAction[2];
        const property = await env.DB.prepare(`
          SELECT id, dashboard_id, name, category, location, price, weekday_price, weekend_price,
                 guests, image_url, room_options, active, publication_status
          FROM properties WHERE dashboard_id = ?
        `).bind(dashboardId).first();
        if (!property) return bad('Properti belum tersinkron ke katalog D1.', 404);

        if (action === 'archive') {
          const body = await request.json();
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          if (property.publication_status === 'archived') return bad('Properti sudah diarsipkan.', 409);
        }

        if (action === 'restore' && property.publication_status !== 'archived') {
          return bad('Hanya properti yang diarsipkan yang dapat dipulihkan.', 409);
        }

        const nextStatus = action === 'archive' ? 'archived' : 'draft';
        const nextActive = action === 'archive' ? 0 : 1;
        const saved = await env.DB.prepare(`
          SELECT data_json FROM dashboard_management_data WHERE id = 'main'
        `).first();
        if (!saved) return bad('Data Dashboard belum tersedia.', 503);
        let managementData;
        try { managementData = JSON.parse(saved.data_json); }
        catch { return bad('Data Dashboard rusak dan status properti tidak dapat diubah.', 500); }
        const managedProperty = (managementData.properties || []).find(item => item.id === dashboardId);
        if (!managedProperty) return bad('Relasi properti Dashboard tidak ditemukan.', 409);
        managedProperty.active = nextActive === 1;
        managedProperty.publication_status = nextStatus;
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE properties SET active = ?, publication_status = ?, updated_at = ? WHERE id = ?
          `).bind(nextActive, nextStatus, now, property.id),
          env.DB.prepare(`
            UPDATE dashboard_management_data SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = 'main'
          `).bind(JSON.stringify(managementData), tokenData.account_id, now),
        ]);
        return json({ ok:true, data:{ id:property.id, dashboard_id:dashboardId, publication_status:nextStatus } });
      }

      const dashboardPropertyPurgeMatch = path.match(/^\/dashboard\/properties\/([^/]+)\/purge$/);
      if (request.method === 'POST' && dashboardPropertyPurgeMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat menghapus properti.', 403);
        }
        const dashboardId = decodeURIComponent(dashboardPropertyPurgeMatch[1]);
        const body = await request.json();
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);

        const saved = await env.DB.prepare(`
          SELECT data_json FROM dashboard_management_data WHERE id = 'main'
        `).first();
        if (!saved) return bad('Data Dashboard belum tersedia.', 503);
        let managementData;
        try { managementData = JSON.parse(saved.data_json); }
        catch { return bad('Data Dashboard rusak dan properti tidak dapat dihapus.', 500); }
        const managedProperty = (managementData.properties || []).find(item => item.id === dashboardId);
        if (!managedProperty) return bad('Properti tidak ditemukan.', 404);
        if (managedProperty.active !== false) return bad('Hanya properti yang diarsipkan yang dapat dihapus permanen.', 409);

        managementData.properties = (managementData.properties || []).filter(item => item.id !== dashboardId);
        const now = new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('DELETE FROM properties WHERE dashboard_id = ?').bind(dashboardId),
          env.DB.prepare(`
            UPDATE dashboard_management_data SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = 'main'
          `).bind(JSON.stringify(managementData), tokenData.account_id, now),
        ]);
        return json({ ok:true, data:{ id:dashboardId, deleted:true } });
      }

      // Hapus Owner dari Dashboard (PIN Master wajib). Ditolak selama masih ada properti yang tertaut ke owner ini.
      // Akses Owner Portal-nya ikut dicabut; Laporan Akhir bagi hasil yang sudah tersimpan tetap ada sebagai riwayat.
      const dashboardOwnerMatch = path.match(/^\/dashboard\/owners\/([^/]+)$/);
      if (request.method === 'DELETE' && dashboardOwnerMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat menghapus Owner.', 403);
        const ownerId = decodeURIComponent(dashboardOwnerMatch[1]);
        let body = {};
        try { body = await request.json(); } catch {}
        const pinError = await checkMasterDeletePin(env, body.pin);
        if (pinError) return bad(pinError.error, pinError.status);
        const management = await env.DB.prepare(`SELECT data_json FROM dashboard_management_data WHERE id = 'main'`).first();
        if (!management) return bad('Data Owner belum tersedia di Dashboard.', 503);
        let managementData;
        try { managementData = JSON.parse(management.data_json); }
        catch { return bad('Data Owner Dashboard tidak dapat dibaca.', 500); }
        const owner = (managementData.owners || []).find(item => item?.id === ownerId);
        if (!owner) return bad('Owner tidak ditemukan.', 404);
        const linked = (managementData.properties || []).filter(property => (property.owners || []).some(item => item.id === ownerId));
        if (linked.length) {
          const names = linked.slice(0, 5).map(property => property.name).join(', ');
          return bad(`Owner ${owner.name} masih terhubung ke ${linked.length} properti (${names}${linked.length > 5 ? ', ...' : ''}). Pindahkan properti tersebut ke owner lain terlebih dahulu.`, 409);
        }
        managementData.owners = managementData.owners.filter(item => item.id !== ownerId);
        const now = new Date().toISOString();
        await env.DB.prepare(`UPDATE dashboard_management_data SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = 'main'`)
          .bind(JSON.stringify(managementData), tokenData.account_id, now).run();
        try {
          await env.DB.prepare('DELETE FROM owner_portal_accounts WHERE owner_id = ?').bind(ownerId).run();
        } catch (error) {
          if (!/no such table: owner_portal_accounts/i.test(String(error?.message || error))) throw error;
        }
        return json({ ok:true, data:{ id:ownerId, deleted:true } });
      }

      if (path === '/dashboard/owner-share-calculations') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat mengelola laporan bagi hasil.', 403);
        }

        if (request.method === 'GET') {
          const ownerId = String(url.searchParams.get('owner_id') || '').trim();
          const month = String(url.searchParams.get('month') || '').trim();
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(ownerId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return bad('Owner dan bulan laporan wajib valid.');
          }
          const saved = await env.DB.prepare(`
            SELECT id, owner_id, owner_name, period_month, calculation_json, status, created_by, created_at, updated_at
            FROM dashboard_owner_share_calculations
            WHERE owner_id = ? AND period_month = ?
          `).bind(ownerId, month).first();
          if (!saved) return json({ ok:true, data:null });
          let calculation;
          try { calculation = JSON.parse(saved.calculation_json); }
          catch { return bad('Data final bagi hasil rusak dan tidak dapat dibaca.', 500); }
          return json({ ok:true, data:{
            id:saved.id, owner_id:saved.owner_id, owner_name:saved.owner_name,
            period_month:saved.period_month, status:saved.status,
            created_by:saved.created_by, created_at:saved.created_at,
            updated_at:saved.updated_at, calculation,
          } });
        }

        if (request.method === 'DELETE') {
          const ownerId = String(url.searchParams.get('owner_id') || '').trim();
          const month = String(url.searchParams.get('month') || '').trim();
          const body = await request.json();
          const pin = String(body.pin || '').trim();
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(ownerId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            return bad('Owner dan bulan laporan wajib valid.');
          }
          if (!/^\d{4}$/.test(pin)) return bad('PIN Master harus tepat 4 digit.');
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master) return bad('Akun Master tidak ditemukan.', 404);
          if (!master.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          const deleted = await env.DB.prepare(`
            DELETE FROM dashboard_owner_share_calculations
            WHERE owner_id = ? AND period_month = ?
          `).bind(ownerId, month).run();
          if (!deleted.meta?.changes) return bad('Laporan Akhir tidak ditemukan atau sudah dihapus.', 404);
          return json({ ok:true, data:{ owner_id:ownerId, period_month:month, deleted:true } });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const ownerId = String(body.ownerId || '').trim();
          const ownerName = String(body.ownerName || '').trim();
          const month = String(body.month || '').trim();
          const rows = Array.isArray(body.rows) ? body.rows : [];
          const totals = body.totals && typeof body.totals === 'object' && !Array.isArray(body.totals) ? body.totals : null;
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(ownerId) || ownerName.length < 2 || ownerName.length > 80 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !rows.length || rows.length > 100 || !totals) {
            return bad('Owner, bulan, properti, dan total laporan wajib valid.');
          }
          const validAmount = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1_000_000_000_000;
          const rowIsValid = row => row &&
            /^[A-Za-z0-9_-]{1,80}$/.test(String(row.propertyId || '')) &&
            String(row.propertyName || '').length <= 160 &&
            String(row.propertyCode || '').length <= 30 &&
            Number.isSafeInteger(Number(row.bookingCount)) && Number(row.bookingCount) >= 0 &&
            [row.bookingRevenue, row.otherIncome, row.platformFee, row.operatingExpenses, row.additionalDeduction, row.netBase, row.ownerShare].every(validAmount) &&
            Number.isFinite(Number(row.platformFeePercent)) && Number(row.platformFeePercent) >= 0 && Number(row.platformFeePercent) <= 50 &&
            Number.isFinite(Number(row.ownerPercent)) && Number(row.ownerPercent) >= 0 && Number(row.ownerPercent) <= 100 &&
            String(row.additionalDeductionLabel || '').length <= 60 &&
            (row.tax === undefined || row.tax === null || validAmount(row.tax)) &&
            (row.taxPercent === undefined || row.taxPercent === null || (Number.isFinite(Number(row.taxPercent)) && Number(row.taxPercent) >= 0 && Number(row.taxPercent) <= 100));
          const validText = (value, maximum) => typeof value === 'string' && value.length <= maximum;
          const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
          const validDetailList = (list, validator) => list === undefined ||
            (Array.isArray(list) && list.length <= 5000 && list.every(validator));
          const bookingDetailIsValid = item => item &&
            validText(item.id, 80) && validText(item.guest, 120) && validText(item.platform, 40) &&
            validDate(item.checkin) && validDate(item.checkout) && validText(item.status, 40) &&
            Number.isSafeInteger(Number(item.nights)) && Number(item.nights) >= 0 &&
            [item.amount, item.refundAmount, item.netAmount].every(validAmount);
          const financeDetailIsValid = item => item && validText(item.id, 160) && validDate(item.date) &&
            validText(item.category, 60) && validText(item.description, 240) &&
            validText(item.payee, 120) && validAmount(item.amount);
          const crewDetailIsValid = item => financeDetailIsValid(item) && validText(item.job, 240);
          const detailListsAreValid = row =>
            validDetailList(row.bookingDetails, bookingDetailIsValid) &&
            validDetailList(row.incomeDetails, financeDetailIsValid) &&
            validDetailList(row.expenseDetails, financeDetailIsValid) &&
            validDetailList(row.crewExpenseDetails, crewDetailIsValid);
          const detailsAreReconciled = row => {
            const keys = ['bookingDetails', 'incomeDetails', 'expenseDetails', 'crewExpenseDetails'];
            if (!keys.some(key => Array.isArray(row[key]))) return true;
            if (!keys.every(key => Array.isArray(row[key]))) return false;
            const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
            return sum(row.bookingDetails, 'netAmount') === Number(row.bookingRevenue) &&
              sum(row.incomeDetails, 'amount') === Number(row.otherIncome) &&
              sum(row.expenseDetails, 'amount') + sum(row.crewExpenseDetails, 'amount') === Number(row.operatingExpenses);
          };
          const totalFields = ['bookingRevenue', 'otherIncome', 'platformFee', 'operatingExpenses', 'additionalDeduction', 'netBase', 'ownerShare', 'deficit'];
          // Potongan pajak bersifat opsional agar laporan lama tanpa pajak tetap sah.
          const tax = body.tax && typeof body.tax === 'object' && !Array.isArray(body.tax) ? body.tax : null;
          const optionalAmount = value => value === undefined || value === null || validAmount(value);
          const optionalPercent = value => value === undefined || value === null || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100);
          const taxIsValid = !tax || (
            (tax.mode === undefined || tax.mode === null || tax.mode === '' || tax.mode === 'percent' || tax.mode === 'amount') &&
            optionalPercent(tax.percent) && optionalAmount(tax.amountInput) && optionalAmount(tax.amount) && optionalAmount(totals.tax)
          );
          if (!rows.every(rowIsValid) || !rows.every(detailListsAreValid) || !rows.every(detailsAreReconciled) || !taxIsValid || !totalFields.every(field => validAmount(totals[field])) || !Number.isSafeInteger(Number(totals.bookingCount)) || Number(totals.bookingCount) < 0) {
            return bad('Rincian nominal atau persentase laporan tidak valid.');
          }
          const calculationJson = JSON.stringify({ ownerId, ownerName, month, tax, rows, totals });
          if (new TextEncoder().encode(calculationJson).byteLength > 262144) return bad('Rincian laporan terlalu besar.');

          const now = new Date().toISOString();
          const id = `OS${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
          await env.DB.prepare(`
            INSERT INTO dashboard_owner_share_calculations (
              id, owner_id, owner_name, period_month, calculation_json, status,
              created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'final', ?, ?, ?)
            ON CONFLICT(owner_id, period_month) DO UPDATE SET
              owner_name = excluded.owner_name,
              calculation_json = excluded.calculation_json,
              status = 'final',
              created_by = excluded.created_by,
              updated_at = excluded.updated_at
          `).bind(id, ownerId, ownerName, month, calculationJson, tokenData.account_id, now, now).run();
          const saved = await env.DB.prepare(`
            SELECT id, owner_id, owner_name, period_month, status, created_at, updated_at
            FROM dashboard_owner_share_calculations
            WHERE owner_id = ? AND period_month = ?
          `).bind(ownerId, month).first();
          return json({ ok:true, data:saved }, 201);
        }
      }

      if (request.method === 'POST' && path === '/dashboard/delete-pin') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id) return bad('Login admin diperlukan', 401);
        if (tokenData.account_id !== 'master' || tokenData.role !== 'Master') {
          return bad('Hanya Master yang dapat mengubah PIN penghapusan.', 403);
        }
        const body = await request.json();
        const currentPin = String(body.current_pin || '');
        const newPin = String(body.new_pin || '');
        if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
          return bad('PIN saat ini dan PIN baru harus tepat 4 digit.');
        }
        let account = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!account) return bad('Akun Master tidak ditemukan.', 404);
        if (!account.delete_pin_hash) {
          const initialSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
          const initialHash = await hashDashboardPassword('1234', initialSalt);
          await env.DB.prepare(`
            UPDATE dashboard_users SET delete_pin_salt = ?, delete_pin_hash = ?, delete_pin_must_change = 1
            WHERE account_id = 'master'
          `).bind(initialSalt, initialHash).run();
          account = { delete_pin_salt:initialSalt, delete_pin_hash:initialHash };
        }
        const currentHash = await hashDashboardPassword(currentPin, account.delete_pin_salt);
        if (!constantTimeEqual(currentHash, account.delete_pin_hash)) return bad('PIN saat ini salah.', 401);
        const newSalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const newHash = await hashDashboardPassword(newPin, newSalt);
        await env.DB.prepare(`
          UPDATE dashboard_users
          SET delete_pin_salt = ?, delete_pin_hash = ?, delete_pin_must_change = 0, updated_at = ?
          WHERE account_id = 'master'
        `).bind(newSalt, newHash, new Date().toISOString()).run();
        return json({ ok:true, data:{ delete_pin_must_change:false } });
      }

      if (request.method === 'POST' && path === '/dashboard/verify-delete-pin') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat meminta persetujuan PIN Master.', 403);
        }
        const body = await request.json();
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('PIN Master harus tepat 4 digit.');
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master) return bad('Akun Master tidak ditemukan.', 404);
        if (!master.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        return json({ ok:true });
      }

      if (path === '/dashboard/extra-bed-suppliers' || path.startsWith('/dashboard/extra-bed-suppliers/')) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const supplierId = path.slice('/dashboard/extra-bed-suppliers/'.length);
        const mapSupplier = row => {
          const supplierPrice = Number(row.supplier_price || 0);
          return {
            id:row.id, supplier_name:row.supplier_name, quantity:Number(row.quantity),
            returned:Number(row.returned || 0), outstanding:Number(row.quantity) - Number(row.returned || 0),
            borrowed_date:row.borrowed_date, note:row.note || '',
            supplier_price:supplierPrice, supplier_cost_total:supplierPrice * Number(row.quantity),
            guest_price:Number(row.guest_price || 0),
          };
        };

        if (request.method === 'GET' && !supplierId) {
          const result = await env.DB.prepare(`SELECT * FROM extra_bed_suppliers ORDER BY borrowed_date DESC, created_at DESC`).all();
          const suppliers = (result.results || []).map(mapSupplier);
          const outstanding = suppliers.reduce((sum, item) => sum + Math.max(0, item.outstanding), 0);
          const costTotal = suppliers.reduce((sum, item) => sum + item.supplier_cost_total, 0);
          const revenueRow = await env.DB.prepare(`
            SELECT COALESCE(SUM(extra_bed_quantity * extra_bed_price), 0) AS revenue FROM dashboard_bookings
            WHERE LOWER(status) NOT IN ('cancelled', 'canceled') AND extra_bed_quantity > 0
          `).first();
          const extraBedRevenue = Number(revenueRow?.revenue || 0);
          return json({ ok:true, data:{ suppliers, outstanding, supplier_cost_total:costTotal, extra_bed_revenue:extraBedRevenue, margin_total:extraBedRevenue - costTotal } });
        }

        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah data suplier extra bed.', 403);

        if (request.method === 'POST' && !supplierId) {
          const body = await request.json();
          const supplierName = String(body.supplier_name || '').trim();
          const quantity = Number(body.quantity);
          const borrowedDate = String(body.borrowed_date || '').trim();
          const note = String(body.note || '').trim().slice(0, 200);
          const supplierPrice = Number(body.supplier_price || 0);
          const guestPrice = Math.max(0, Math.round(Number(body.guest_price) || 0));
          if (supplierName.length < 2 || supplierName.length > 80) return bad('Nama suplier wajib 2-80 karakter.');
          if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) return bad('Jumlah extra bed yang dipinjam harus bilangan bulat minimal 1.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(borrowedDate)) return bad('Tanggal pinjam tidak valid.');
          if (!Number.isSafeInteger(supplierPrice) || supplierPrice < 0 || !Number.isSafeInteger(guestPrice) || guestPrice < 0) return bad('Harga sewa tidak valid.');
          const id = `sup-${crypto.randomUUID()}`;
          const now = new Date().toISOString();
          await env.DB.prepare(`
            INSERT INTO extra_bed_suppliers (id, supplier_name, quantity, returned, borrowed_date, note, supplier_price, guest_price, created_at)
            VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
          `).bind(id, supplierName, quantity, borrowedDate, note, supplierPrice, guestPrice, now).run();
          return json({ ok:true, data:mapSupplier({ id, supplier_name:supplierName, quantity, returned:0, borrowed_date:borrowedDate, note, supplier_price:supplierPrice, guest_price:guestPrice }) });
        }

        if (request.method === 'PATCH' && supplierId) {
          const body = await request.json();
          const existing = await env.DB.prepare(`SELECT * FROM extra_bed_suppliers WHERE id = ?`).bind(supplierId).first();
          if (!existing) return bad('Data suplier tidak ditemukan.', 404);
          const returned = body.returned === undefined ? Number(existing.returned || 0) : Number(body.returned);
          if (!Number.isSafeInteger(returned) || returned < 0 || returned > Number(existing.quantity)) return bad('Jumlah dikembalikan tidak boleh melebihi jumlah pinjam.');
          const note = body.note === undefined ? existing.note : String(body.note || '').trim().slice(0, 200);
          await env.DB.prepare(`UPDATE extra_bed_suppliers SET returned = ?, note = ? WHERE id = ?`).bind(returned, note, supplierId).run();
          return json({ ok:true, data:{ id:supplierId, returned, outstanding:Number(existing.quantity) - returned } });
        }

        if (request.method === 'DELETE' && supplierId) {
          const body = await request.json().catch(() => ({}));
          const pin = String(body.pin || '').trim();
          if (!/^\d{4}$/.test(pin)) return bad('PIN Master harus tepat 4 digit.');
          const master = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi.', 409);
          const attemptedHash = await hashDashboardPassword(pin, master.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
          await env.DB.prepare(`DELETE FROM extra_bed_suppliers WHERE id = ?`).bind(supplierId).run();
          return json({ ok:true, data:{ id:supplierId } });
        }

        return bad('Metode suplier extra bed tidak didukung.', 405);
      }

      if (path === '/dashboard/extra-bed-supplier-list' || path.startsWith('/dashboard/extra-bed-supplier-list/')) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const listId = path.slice('/dashboard/extra-bed-supplier-list/'.length);

        if (request.method === 'GET' && !listId) {
          const result = await env.DB.prepare(`SELECT * FROM extra_bed_supplier_list WHERE active = 1 ORDER BY name COLLATE NOCASE`).all();
          return json({ ok:true, data:(result.results || []).map(row => ({ id:row.id, name:row.name, phone:row.phone || '', note:row.note || '', price_per_day:Number(row.price_per_day) || 0 })) });
        }

        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah daftar suplier.', 403);

        if (request.method === 'POST' && !listId) {
          const body = await request.json();
          const name = String(body.name || '').trim();
          const phone = String(body.phone || '').trim().slice(0, 30);
          const note = String(body.note || '').trim().slice(0, 200);
          const pricePerDay = Math.max(0, Math.round(Number(body.price_per_day) || 0));
          if (name.length < 2 || name.length > 80) return bad('Nama suplier wajib 2-80 karakter.');
          const duplicate = await env.DB.prepare(`SELECT id FROM extra_bed_supplier_list WHERE active = 1 AND LOWER(name) = LOWER(?)`).bind(name).first();
          if (duplicate) return bad('Suplier dengan nama tersebut sudah ada.', 409);
          const id = `supl-${crypto.randomUUID()}`;
          await env.DB.prepare(`INSERT INTO extra_bed_supplier_list (id, name, phone, note, active, created_at, price_per_day) VALUES (?, ?, ?, ?, 1, ?, ?)`)
            .bind(id, name, phone, note, new Date().toISOString(), pricePerDay).run();
          return json({ ok:true, data:{ id, name, phone, note, price_per_day:pricePerDay } });
        }

        if (request.method === 'PATCH' && listId) {
          const current = await env.DB.prepare(`SELECT * FROM extra_bed_supplier_list WHERE id = ? AND active = 1`).bind(listId).first();
          if (!current) return bad('Suplier tidak ditemukan.', 404);
          const body = await request.json();
          const name = body.name !== undefined ? String(body.name || '').trim() : current.name;
          const phone = body.phone !== undefined ? String(body.phone || '').trim().slice(0, 30) : (current.phone || '');
          const note = body.note !== undefined ? String(body.note || '').trim().slice(0, 200) : (current.note || '');
          const pricePerDay = body.price_per_day !== undefined ? Math.max(0, Math.round(Number(body.price_per_day) || 0)) : (Number(current.price_per_day) || 0);
          if (name.length < 2 || name.length > 80) return bad('Nama suplier wajib 2-80 karakter.');
          const duplicate = await env.DB.prepare(`SELECT id FROM extra_bed_supplier_list WHERE active = 1 AND id != ? AND LOWER(name) = LOWER(?)`).bind(listId, name).first();
          if (duplicate) return bad('Suplier dengan nama tersebut sudah ada.', 409);
          await env.DB.prepare(`UPDATE extra_bed_supplier_list SET name = ?, phone = ?, note = ?, price_per_day = ? WHERE id = ?`)
            .bind(name, phone, note, pricePerDay, listId).run();
          return json({ ok:true, data:{ id:listId, name, phone, note, price_per_day:pricePerDay } });
        }

        if (request.method === 'DELETE' && listId) {
          await env.DB.prepare(`UPDATE extra_bed_supplier_list SET active = 0 WHERE id = ?`).bind(listId).run();
          return json({ ok:true, data:{ id:listId } });
        }

        return bad('Metode daftar suplier tidak didukung.', 405);
      }

      if (path === '/dashboard/extra-bed-stock') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);

        if (request.method === 'GET') {
          const result = await env.DB.prepare(`SELECT property_id, stock, price FROM extra_bed_property_settings`).all();
          const rows = result.results || [];
          const properties = {};
          rows.forEach(row => { properties[row.property_id] = { stock:Number(row.stock) || 0, price:Number(row.price) || 0 }; });
          const total = rows.length ? rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0) : null;
          return json({ ok:true, data:{ total, properties } });
        }

        if (request.method === 'PUT') {
          if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah stok extra bed.', 403);
          const body = await request.json();
          const items = Array.isArray(body.items) ? body.items : [];
          const now = new Date().toISOString();
          const statements = [];
          for (const item of items) {
            const propertyId = String(item.propertyId || '').trim();
            const stock = Number(item.stock);
            const price = Number(item.price);
            if (!propertyId) return bad('Properti tidak valid.');
            if (!Number.isSafeInteger(stock) || stock < 0 || stock > 10000) return bad('Jumlah stok extra bed tidak valid.');
            if (!Number.isSafeInteger(price) || price < 0 || price > 100000000) return bad('Harga extra bed tidak valid.');
            statements.push(env.DB.prepare(`
              INSERT INTO extra_bed_property_settings (property_id, stock, price, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(property_id) DO UPDATE SET stock = excluded.stock, price = excluded.price, updated_at = excluded.updated_at
            `).bind(propertyId, stock, price, now));
          }
          if (statements.length) await env.DB.batch(statements);
          return json({ ok:true, data:{ saved:statements.length } });
        }

        return bad('Metode stok extra bed tidak didukung.', 405);
      }

      if (request.method === 'GET' && path === '/dashboard/bookings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan', 401);
        const result = await env.DB.prepare('SELECT * FROM dashboard_bookings ORDER BY checkin DESC, created_at DESC').all();
        return json({ ok:true, data:(result.results || []).map(row => ({
          id:row.id, propId:row.property_id, propName:row.property_name, propCode:row.property_code,
          guest:row.guest, phone:row.guest_phone || '', platform:row.platform, status:row.status, checkin:row.checkin,
          checkout:row.checkout, nights:Number(row.nights), amount:Number(row.amount), grossAmount:Number(row.gross_amount || 0),
          extraBedQuantity:Number(row.extra_bed_quantity || 0), extraBedPrice:Number(row.extra_bed_price || 0),
          extraBedPaymentStatus:row.extra_bed_payment_status === 'pending' ? 'pending' : 'paid',
          extraBedPaymentMethod:row.extra_bed_payment_method || '',
          cleaningFee:Number(row.cleaning_fee), platformFeePct:Number(row.platform_fee_pct),
          note:row.note, cancellationReason:row.cancellation_reason, refundAmount:Number(row.refund_amount),
          captureImage:row.capture_image || '', guestCount:Number(row.guest_count || 0),
          agentId:row.agent_id || '', agentName:row.agent_name || '',
          agentFeeType:row.agent_fee_type || '', agentFeeValue:Number(row.agent_fee_value || 0), agentFeeAmount:Number(row.agent_fee_amount || 0),
          createdAt:row.created_at,
        })) });
      }

      if (request.method === 'POST' && path === '/dashboard/bookings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola booking.', 403);
        const body = await request.json();
        const id = String(body.id || `BK${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`).trim();
        const propertyId = String(body.propId || '').trim();
        const propertyName = String(body.propName || '').trim();
        const propertyCode = String(body.propCode || '').trim();
        const guest = String(body.guest || '').trim();
        const phone = String(body.phone || '').trim();
        const platform = String(body.platform || '').trim();
        const status = String(body.status || 'Confirmed');
        const checkin = String(body.checkin || '');
        const checkout = String(body.checkout || '');
        const amount = Number(body.amount);
        const managementType = String(body.managementType || 'managed').trim();
        const grossAmount = Number(body.grossAmount || 0);
        const extraBedQuantity = Number(body.extraBedQuantity || 0);
        const extraBedPrice = Number(body.extraBedPrice || 0);
        const extraBedPaymentStatus = extraBedQuantity > 0 && body.extraBedPaymentStatus === 'pending' ? 'pending' : 'paid';
        const extraBedPaymentMethod = extraBedQuantity > 0 && extraBedPaymentStatus === 'paid' ? String(body.extraBedPaymentMethod || '').trim().slice(0, 20) : '';
        const cleaningFee = Number(body.cleaningFee || 0);
        const platformFeePct = Number(body.platformFeePct || 0);
        const note = String(body.note || '').trim();
        const captureImage = String(body.captureImage || '').trim();
        const validStatuses = ['Inquiry', 'Confirmed', 'Checked-in', 'Checked-out', 'Cancelled'];
        const validPlatforms = ['Airbnb', 'Booking.com', 'Agoda', 'Tiket.com', 'Traveloka', 'Direct', 'Agen Offline', 'Website'];
        const validManagementTypes = ['managed', 'partner'];
        if (!/^BK[A-Za-z0-9_-]{1,60}$/.test(id) || !propertyId || propertyName.length > 160 || propertyCode.length > 30 || guest.length < 2 || guest.length > 120 || phone.length > 30 || !validPlatforms.includes(platform) || !validStatuses.includes(status) || !validManagementTypes.includes(managementType)) {
          return bad('Data booking tidak valid.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(grossAmount) || grossAmount < 0 || !Number.isSafeInteger(extraBedQuantity) || extraBedQuantity < 0 || !Number.isSafeInteger(extraBedPrice) || extraBedPrice < 0 || !Number.isSafeInteger(cleaningFee) || cleaningFee < 0 || !Number.isInteger(platformFeePct) || platformFeePct < 0 || platformFeePct > 50 || note.length > 500) {
          return bad('Tanggal, jumlah, biaya, atau catatan booking tidak valid.');
        }
        if (captureImage && (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(captureImage) || captureImage.length > 250000)) {
          return bad('Capture pesanan tidak valid atau terlalu besar.');
        }
        if (status !== 'Cancelled') {
          const conflict = await env.DB.prepare(`
            SELECT id, guest, checkin, checkout FROM dashboard_bookings
            WHERE property_id = ? AND LOWER(status) NOT IN ('cancelled', 'canceled')
              AND checkin < ? AND checkout > ?
            LIMIT 1
          `).bind(propertyId, checkout, checkin).first();
          if (conflict) {
            return bad(`Properti ${propertyName || propertyId} sudah ada booking lain yang tanggalnya bentrok: ${conflict.guest || 'tamu lain'} (${conflict.checkin} s/d ${conflict.checkout}).`, 409);
          }
        }
        if (status !== 'Cancelled' && extraBedQuantity > 0) {
          const stockError = await checkExtraBedStock(env, { propertyId, propertyName, checkin, checkout, quantity:extraBedQuantity });
          if (stockError) return bad(stockError, 409);
        }
        const guestCount = Number(body.guestCount || 0);
        if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 99) return bad('Jumlah tamu harus bilangan bulat 0 sampai 99.');
        let bookingAgent;
        try {
          bookingAgent = await resolveBookingAgentFee(env, body, amount);
        } catch (error) {
          return bad(error.message, 400);
        }
        const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86400000);
        const now = new Date().toISOString();
        const incomeEntryId = `booking-income-${id}`;
        const agentFeeEntryId = `booking-agent-fee-${id}`;
        const incomeCategoryId = managementType === 'partner' ? 'income-partner-fee' : 'income-booking';
        const incomeCategoryName = managementType === 'partner' ? 'Fee Mitra' : 'Booking';
        const incomeDescription = managementType === 'partner' ? `Fee Mitra ${id} - ${guest}` : `Booking ${id} - ${guest}`;
        await env.DB.batch([
          env.DB.prepare(`
            INSERT OR IGNORE INTO dashboard_bookings (
              id, property_id, property_name, property_code, guest, guest_phone, platform, status,
              checkin, checkout, nights, amount, gross_amount, extra_bed_quantity, extra_bed_price, extra_bed_payment_status, cleaning_fee, platform_fee_pct, note,
              cancellation_reason, refund_amount, capture_image, agent_id, agent_name, agent_fee_type, agent_fee_value, agent_fee_amount,
              income_entry_id, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, propertyId, propertyName, propertyCode, guest, phone, platform, status, checkin, checkout,
            nights, amount, grossAmount, extraBedQuantity, extraBedPrice, extraBedPaymentStatus, cleaningFee, platformFeePct, note, captureImage,
            bookingAgent.agentId, bookingAgent.agentName, bookingAgent.feeType, bookingAgent.feeValue, bookingAgent.feeAmount,
            incomeEntryId, tokenData.account_id || '', now, now),
          env.DB.prepare(`UPDATE dashboard_bookings SET extra_bed_payment_method = ? WHERE id = ?`).bind(extraBedPaymentMethod, id),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) SELECT ?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, 'once', ?, ?
              WHERE changes() = 1 AND ? <> 'Cancelled'
          `).bind(incomeEntryId, incomeCategoryId, incomeCategoryName, propertyId, propertyName, now.slice(0, 10), amount,
            incomeDescription, platform, tokenData.account_id || '', now, status),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) SELECT ?, 'income', 'income-extra-bed', 'Extra Bed', ?, ?, ?, ?, ?, ?, 'once', ?, ?
              WHERE EXISTS (SELECT 1 FROM dashboard_bookings WHERE id = ? AND status <> 'Cancelled') AND ? > 0
            ON CONFLICT(id) DO UPDATE SET
              property_id = excluded.property_id,
              property_name = excluded.property_name,
              amount = excluded.amount,
              description = excluded.description,
              payee = excluded.payee
          `).bind(`booking-extra-bed-${id}`, propertyId, propertyName, now.slice(0, 10),
            extraBedQuantity * extraBedPrice, `Extra Bed (${extraBedQuantity} x Rp ${extraBedPrice}) - Booking ${id}`, guest,
            tokenData.account_id || '', now, id, extraBedQuantity * extraBedPrice),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) SELECT ?, 'expense', 'expense-agent-fee', 'Fee Agen', ?, ?, ?, ?, ?, ?, 'once', ?, ?
              WHERE EXISTS (SELECT 1 FROM dashboard_bookings WHERE id = ? AND status <> 'Cancelled') AND ? > 0
            ON CONFLICT(id) DO UPDATE SET
              property_id = excluded.property_id,
              property_name = excluded.property_name,
              amount = excluded.amount,
              description = excluded.description,
              payee = excluded.payee
          `).bind(agentFeeEntryId, propertyId, propertyName, now.slice(0, 10),
            bookingAgent.feeAmount, `Fee Agen ${bookingAgent.agentName} - Booking ${id}`, bookingAgent.agentName,
            tokenData.account_id || '', now, id, bookingAgent.feeAmount),
        ]);
        await saveBookingGuestCount(env, id, guestCount);
        return json({ ok:true, data:{ id, created_at:now } }, 201);
      }

      const dashboardBookingMatch = path.match(/^\/dashboard\/bookings\/([^/]+)$/);
      if (request.method === 'PATCH' && dashboardBookingMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengelola booking.', 403);
        const id = decodeURIComponent(dashboardBookingMatch[1]);
        const booking = await env.DB.prepare('SELECT * FROM dashboard_bookings WHERE id = ?').bind(id).first();
        if (!booking) return bad('Booking tidak ditemukan.', 404);
        const body = await request.json();
        const now = new Date().toISOString();
        const isCancelledBooking = ['cancelled', 'canceled'].includes(String(booking.status || '').trim().toLowerCase());
        const verifyMasterPin = async value => {
          const pin = String(value || '');
          if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master 4 digit untuk menyetujui perubahan booking.', 400);
          const masterPin = await env.DB.prepare(`
            SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
            WHERE account_id = 'master' AND active = 1
          `).first();
          if (!masterPin?.delete_pin_hash) return bad('PIN penghapusan Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
          const attemptedHash = await hashDashboardPassword(pin, masterPin.delete_pin_salt);
          if (!constantTimeEqual(attemptedHash, masterPin.delete_pin_hash)) return bad('PIN Master salah.', 403);
          return null;
        };

        if (body.action === 'cancel') {
          if (isCancelledBooking) return bad('Booking sudah dibatalkan.', 409);
          const pinError = await verifyMasterPin(body.pin);
          if (pinError) return pinError;
          const reason = String(body.cancellation_reason || '').trim();
          const refundAmount = Number(body.refund_amount);
          const maxRefund = Number(booking.amount) + Number(booking.extra_bed_quantity || 0) * Number(booking.extra_bed_price || 0);
          if (reason.length < 3 || reason.length > 300 || !Number.isSafeInteger(refundAmount) || refundAmount < 0 || refundAmount > maxRefund) {
            return bad('Alasan wajib diisi dan nominal refund harus antara Rp 0 sampai nilai booking.');
          }
          const baseRefundAmount = Math.min(refundAmount, Number(booking.amount));
          const extraBedRefundAmount = Math.max(0, refundAmount - baseRefundAmount);
          const bookingIncomeAmount = Math.max(0, Number(booking.amount) - baseRefundAmount);
          const bookingIncomeDescription = `Booking ${id} - ${booking.guest} - Dibatalkan: ${reason}. Refund Rp ${refundAmount}; pemasukan bersih Rp ${bookingIncomeAmount}.`;
          const statements = [
            env.DB.prepare(`
              UPDATE dashboard_bookings
              SET status = 'Cancelled', cancellation_reason = ?, refund_amount = ?, refund_entry_id = NULL, updated_at = ?
              WHERE id = ? AND LOWER(status) NOT IN ('cancelled', 'canceled')
            `).bind(reason, refundAmount, now, id),
            env.DB.prepare(`
              UPDATE finance_entries
              SET amount = ?, description = ?
              WHERE id = ? AND kind = 'income' AND changes() = 1
            `).bind(bookingIncomeAmount, bookingIncomeDescription, booking.income_entry_id),
          ];
          if (extraBedRefundAmount > 0) {
            const extraBedAmount = Number(booking.extra_bed_quantity || 0) * Number(booking.extra_bed_price || 0);
            statements.push(env.DB.prepare(`
              UPDATE finance_entries
              SET amount = ?, description = ?
              WHERE id = ? AND kind = 'income' AND changes() = 1
            `).bind(Math.max(0, extraBedAmount - extraBedRefundAmount),
              `Extra Bed (${booking.extra_bed_quantity} x Rp ${booking.extra_bed_price}) - Booking ${id} - Refund Rp ${extraBedRefundAmount}: ${reason}`,
              `booking-extra-bed-${id}`));
          }
          // Booking batal: agen tidak berhak atas fee, hapus catatan pengeluarannya.
          statements.push(env.DB.prepare(`DELETE FROM finance_entries WHERE id = ?`).bind(`booking-agent-fee-${id}`));
          const results = await env.DB.batch(statements);
          if (!results[0]?.meta?.changes) return bad('Booking sudah berubah. Muat ulang lalu coba lagi.', 409);
          return json({ ok:true, data:{ id, status:'Cancelled', refund_amount:refundAmount } });
        }

        if (isCancelledBooking) {
          const pinError = await verifyMasterPin(body.pin);
          if (pinError) return pinError;
        }

        const propertyId = String(body.propId || '').trim();
        const propertyName = String(body.propName || '').trim();
        const propertyCode = String(body.propCode || '').trim();
        const guest = String(body.guest || '').trim();
        const phone = String(body.phone || '').trim();
        const platform = String(body.platform || '').trim();
        const status = isCancelledBooking ? booking.status : String(body.status || 'Confirmed');
        const checkin = String(body.checkin || '');
        const checkout = String(body.checkout || '');
        const amount = Number(body.amount);
        const managementType = String(body.managementType || 'managed').trim();
        const grossAmount = Number(body.grossAmount || 0);
        const extraBedQuantity = Number(body.extraBedQuantity || 0);
        const extraBedPrice = Number(body.extraBedPrice || 0);
        const extraBedPaymentStatus = extraBedQuantity > 0 && body.extraBedPaymentStatus === 'pending' ? 'pending' : 'paid';
        const extraBedPaymentMethod = extraBedQuantity > 0 && extraBedPaymentStatus === 'paid' ? String(body.extraBedPaymentMethod || '').trim().slice(0, 20) : '';
        const cleaningFee = Number(body.cleaningFee || 0);
        const platformFeePct = Number(body.platformFeePct || 0);
        const note = String(body.note || '').trim();
        const captureImage = String(body.captureImage || '').trim();
        const validStatuses = isCancelledBooking ? [booking.status] : ['Inquiry', 'Confirmed', 'Checked-in', 'Checked-out'];
        const validPlatforms = ['Airbnb', 'Booking.com', 'Agoda', 'Tiket.com', 'Traveloka', 'Direct', 'Agen Offline', 'Website'];
        const validManagementTypes = ['managed', 'partner'];
        if (!propertyId || propertyName.length > 160 || propertyCode.length > 30 || guest.length < 2 || guest.length > 120 || phone.length > 30 || !validPlatforms.includes(platform) || !validStatuses.includes(status) || !validManagementTypes.includes(managementType) || !/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(grossAmount) || grossAmount < 0 || !Number.isSafeInteger(extraBedQuantity) || extraBedQuantity < 0 || !Number.isSafeInteger(extraBedPrice) || extraBedPrice < 0 || !Number.isSafeInteger(cleaningFee) || cleaningFee < 0 || !Number.isInteger(platformFeePct) || platformFeePct < 0 || platformFeePct > 50 || note.length > 500) {
          return bad('Data booking tidak valid.');
        }
        if (captureImage && (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(captureImage) || captureImage.length > 250000)) {
          return bad('Capture pesanan tidak valid atau terlalu besar.');
        }
        if (!isCancelledBooking) {
          const conflict = await env.DB.prepare(`
            SELECT id, guest, checkin, checkout FROM dashboard_bookings
            WHERE property_id = ? AND id <> ? AND LOWER(status) NOT IN ('cancelled', 'canceled')
              AND checkin < ? AND checkout > ?
            LIMIT 1
          `).bind(propertyId, id, checkout, checkin).first();
          if (conflict) {
            return bad(`Properti ${propertyName || propertyId} sudah ada booking lain yang tanggalnya bentrok: ${conflict.guest || 'tamu lain'} (${conflict.checkin} s/d ${conflict.checkout}).`, 409);
          }
        }
        if (!isCancelledBooking && extraBedQuantity > 0) {
          const stockError = await checkExtraBedStock(env, { propertyId, propertyName, checkin, checkout, quantity:extraBedQuantity, excludeId:id });
          if (stockError) return bad(stockError, 409);
        }
        const guestCount = Number(body.guestCount || 0);
        if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 99) return bad('Jumlah tamu harus bilangan bulat 0 sampai 99.');
        let bookingAgent;
        try {
          bookingAgent = await resolveBookingAgentFee(env, body, amount);
        } catch (error) {
          return bad(error.message, 400);
        }
        const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86400000);
        const extraBedTotal = extraBedQuantity * extraBedPrice;
        const retainedRefund = isCancelledBooking ? Number(booking.refund_amount || 0) : 0;
        if (retainedRefund > amount + extraBedTotal) return bad('Nilai booking dan Extra Bed baru tidak boleh lebih kecil dari refund yang tercatat.', 400);
        const baseRefundAmount = Math.min(retainedRefund, amount);
        const extraBedRefundAmount = Math.max(0, retainedRefund - baseRefundAmount);
        const bookingIncomeAmount = Math.max(0, amount - baseRefundAmount);
        const incomeCategoryId = managementType === 'partner' ? 'income-partner-fee' : 'income-booking';
        const incomeCategoryName = managementType === 'partner' ? 'Fee Mitra' : 'Booking';
        const incomeLabel = managementType === 'partner' ? 'Fee Mitra' : 'Booking';
        const bookingIncomeDescription = isCancelledBooking
          ? `${incomeLabel} ${id} - ${guest} - Dibatalkan: ${booking.cancellation_reason}. Refund Rp ${retainedRefund}; pemasukan bersih Rp ${bookingIncomeAmount}.`
          : `${incomeLabel} ${id} - ${guest}`;
        const results = await env.DB.batch([
          env.DB.prepare(`
            UPDATE dashboard_bookings SET
              property_id = ?, property_name = ?, property_code = ?, guest = ?, guest_phone = ?, platform = ?, status = ?,
              checkin = ?, checkout = ?, nights = ?, amount = ?, gross_amount = ?, extra_bed_quantity = ?, extra_bed_price = ?, extra_bed_payment_status = ?,
              cleaning_fee = ?, platform_fee_pct = ?, note = ?, capture_image = ?,
              agent_id = ?, agent_name = ?, agent_fee_type = ?, agent_fee_value = ?, agent_fee_amount = ?, updated_at = ?
            WHERE id = ? AND status = ?
          `).bind(propertyId, propertyName, propertyCode, guest, phone, platform, status, checkin, checkout,
            nights, amount, grossAmount, extraBedQuantity, extraBedPrice, extraBedPaymentStatus, cleaningFee, platformFeePct, note, captureImage,
            bookingAgent.agentId, bookingAgent.agentName, bookingAgent.feeType, bookingAgent.feeValue, bookingAgent.feeAmount,
            now, id, booking.status),
          env.DB.prepare(`
            UPDATE finance_entries SET property_id = ?, property_name = ?, category_id = ?, category_name = ?, amount = ?, description = ?, payee = ?
            WHERE id = (SELECT income_entry_id FROM dashboard_bookings WHERE id = ?) AND kind = 'income' AND changes() = 1
          `).bind(propertyId, propertyName, incomeCategoryId, incomeCategoryName, bookingIncomeAmount, bookingIncomeDescription, platform, id),
          env.DB.prepare(`UPDATE dashboard_bookings SET extra_bed_payment_method = ? WHERE id = ?`).bind(extraBedPaymentMethod, id),
        ]);
        if (!results[0]?.meta?.changes) return bad('Booking sudah berubah. Muat ulang lalu coba lagi.', 409);
        await saveBookingGuestCount(env, id, guestCount);
        if (extraBedTotal > 0) {
          await env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) VALUES (?, 'income', 'income-extra-bed', 'Extra Bed', ?, ?, ?, ?, ?, ?, 'once', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              property_id = excluded.property_id,
              property_name = excluded.property_name,
              amount = excluded.amount,
              description = excluded.description,
              payee = excluded.payee
          `).bind(`booking-extra-bed-${id}`, propertyId, propertyName, now.slice(0, 10), Math.max(0, extraBedTotal - extraBedRefundAmount),
            `Extra Bed (${extraBedQuantity} x Rp ${extraBedPrice}) - Booking ${id}${isCancelledBooking ? ` - Refund Extra Bed Rp ${extraBedRefundAmount}: ${booking.cancellation_reason}` : ''}`, guest, tokenData.account_id || '', now).run();
        } else {
          await env.DB.prepare(`DELETE FROM finance_entries WHERE id = ? AND category_id = 'income-extra-bed'`)
            .bind(`booking-extra-bed-${id}`).run();
        }
        if (bookingAgent.feeAmount > 0) {
          await env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) VALUES (?, 'expense', 'expense-agent-fee', 'Fee Agen', ?, ?, ?, ?, ?, ?, 'once', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              property_id = excluded.property_id,
              property_name = excluded.property_name,
              amount = excluded.amount,
              description = excluded.description,
              payee = excluded.payee
          `).bind(`booking-agent-fee-${id}`, propertyId, propertyName, now.slice(0, 10), bookingAgent.feeAmount,
            `Fee Agen ${bookingAgent.agentName} - Booking ${id}`, bookingAgent.agentName, tokenData.account_id || '', now).run();
        } else {
          await env.DB.prepare(`DELETE FROM finance_entries WHERE id = ? AND category_id = 'expense-agent-fee'`)
            .bind(`booking-agent-fee-${id}`).run();
        }
        return json({ ok:true, data:{ id } });
      }

      if (request.method === 'DELETE' && dashboardBookingMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat menghapus booking.', 403);
        const id = decodeURIComponent(dashboardBookingMatch[1]);
        const booking = await env.DB.prepare('SELECT id, income_entry_id FROM dashboard_bookings WHERE id = ?').bind(id).first();
        if (!booking) return bad('Booking tidak ditemukan.', 404);
        let deleteBody = {};
        try { deleteBody = await request.json(); } catch {}
        const deletePin = String(deleteBody.pin || '').trim();
        if (!/^\d{4}$/.test(deletePin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const masterForDelete = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!masterForDelete?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedDeletePinHash = await hashDashboardPassword(deletePin, masterForDelete.delete_pin_salt);
        if (!constantTimeEqual(attemptedDeletePinHash, masterForDelete.delete_pin_hash)) return bad('PIN Master salah.', 403);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(booking.income_entry_id),
          env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(`booking-extra-bed-${id}`),
          env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(`booking-agent-fee-${id}`),
          env.DB.prepare('DELETE FROM dashboard_bookings WHERE id = ?').bind(id),
        ]);
        return json({ ok:true, data:{ id, deleted:true } });
      }

      if (request.method === 'GET' && path === '/admin/finance') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await getAdminTokenPayload(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const [categoryResult, entryResult, syncSetting] = await Promise.all([
          env.DB.prepare('SELECT id, kind, name FROM finance_categories WHERE active = 1 ORDER BY kind, name COLLATE NOCASE').all(),
          // Baris riwayat crew (pending/sent/rejected, dan yang sudah diterima) tidak dihitung langsung; pengeluaran crew
          // yang diterima Admin masuk lewat salinannya (crew-expense-<id>).
          env.DB.prepare(`SELECT * FROM finance_entries WHERE review_status = 'approved' AND review_sent_at = '' ORDER BY entry_date DESC, created_at DESC LIMIT 2000`).all()
            .catch(error => {
              if (!/no such column: review_status/i.test(String(error?.message || error))) throw error;
              return env.DB.prepare('SELECT * FROM finance_entries ORDER BY entry_date DESC, created_at DESC LIMIT 2000').all();
            }),
          env.DB.prepare(`SELECT value FROM site_settings WHERE key = 'kosan_dashboard_sync'`).first(),
        ]);
        let entries = entryResult.results || [];
        // Saklar OFF dari kosan.html: pemasukan & pengeluaran Kosan disembunyikan dari semua
        // pembaca (Dashboard, laporan owner), kecuali kosan.html sendiri yang meminta ?scope=kosan.
        if (syncSetting?.value === '0' && url.searchParams.get('scope') !== 'kosan') {
          let kosanPropertyId = '';
          let kosanPropertyName = 'kosan de orange kost';
          try {
            const management = await env.DB.prepare(`SELECT data_json FROM dashboard_management_data WHERE id = 'main'`).first();
            const kosanProperty = (JSON.parse(management?.data_json || '{}').properties || [])
              .find(property => String(property?.code || '').toUpperCase() === 'KDO');
            if (kosanProperty) {
              kosanPropertyId = String(kosanProperty.id || '');
              kosanPropertyName = String(kosanProperty.name || kosanPropertyName).trim().toLowerCase();
            }
          } catch {
            // Data Dashboard tidak terbaca: pakai pencocokan kategori dan nama bawaan.
          }
          entries = entries.filter(entry => !(
            entry.category_id === 'income-kosan-rent' ||
            entry.category_name === 'Deposit Kos' ||
            (kosanPropertyId && entry.property_id === kosanPropertyId) ||
            String(entry.property_name || '').trim().toLowerCase() === kosanPropertyName
          ));
        }
        return json({ ok: true, data: { categories: categoryResult.results || [], entries } });
      }

      if (request.method === 'POST' && path === '/admin/finance/categories') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await getAdminTokenPayload(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const body = await request.json();
        const kind = String(body.kind || '');
        const name = String(body.name || '').trim();
        if (!['income', 'expense'].includes(kind) || name.length < 2 || name.length > 60) return bad('Jenis dan nama kategori wajib valid.');
        const id = `category-${crypto.randomUUID()}`;
        try {
          await env.DB.prepare('INSERT INTO finance_categories (id, kind, name, created_at) VALUES (?, ?, ?, ?)')
            .bind(id, kind, name, new Date().toISOString()).run();
        } catch (error) {
          if (/UNIQUE constraint failed: finance_categories\.kind, finance_categories\.name/i.test(String(error?.message || error))) {
            return bad('Kategori dengan nama tersebut sudah ada.', 409);
          }
          throw error;
        }
        return json({ ok: true, data: { id, kind, name } }, 201);
      }

      if (request.method === 'POST' && path === '/admin/finance/entries') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData) return bad('Login admin diperlukan', 401);
        const body = await request.json();
        const kind = String(body.kind || '');
        const categoryId = String(body.category_id || '');
        const entryDate = String(body.entry_date || '');
        const amount = Number(body.amount);
        const recurrence = String(body.recurrence || 'once');
        const description = String(body.description || '').trim();
        const payee = String(body.payee || '').trim();
        const propertyId = String(body.property_id || '').trim() || null;
        const propertyName = String(body.property_name || '').trim();
        let proofUrl = '';
        if (!['income', 'expense'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isSafeInteger(amount) || amount <= 0) {
          return bad('Jenis, tanggal, dan jumlah transaksi wajib valid.');
        }
        if (description.length > 240 || payee.length > 120) return bad('Deskripsi atau penerima terlalu panjang.');
        if (!['once', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(recurrence) || (kind === 'income' && recurrence !== 'once')) {
          return bad('Frekuensi hanya berlaku untuk pengeluaran dan nilainya tidak valid.');
        }
        const category = await env.DB.prepare('SELECT id, kind, name FROM finance_categories WHERE id = ? AND active = 1')
          .bind(categoryId).first();
        if (!category || category.kind !== kind) return bad('Kategori tidak cocok dengan jenis transaksi.');
        if (body.proof_image) {
          const proof = parseDataUrl(body.proof_image);
          if (!String(proof.contentType || '').startsWith('image/')) return bad('Bukti transaksi harus berupa gambar.');
          if (proof.bytes.byteLength > 100 * 1024) return bad('Ukuran bukti setelah kompresi harus di bawah 100 KB.');
          const proofKey = `finance/expense-proof/${crypto.randomUUID()}.jpg`;
          await env.PHOTOS.put(proofKey, proof.bytes, {
            httpMetadata: { contentType:proof.contentType || 'image/jpeg' },
          });
          proofUrl = publicFileUrl(url.origin, proofKey);
        }
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO finance_entries (
            id, kind, category_id, category_name, property_id, property_name,
            entry_date, amount, description, payee, recurrence, created_by, created_at, proof_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id, kind, category.id, category.name, propertyId, propertyName,
          entryDate, amount, description, payee, recurrence,
          String(tokenData.account_id || tokenData.role || 'legacy-admin'), createdAt, proofUrl
        ).run();
        return json({ ok: true, data: { id, proof_url:proofUrl } }, 201);
      }

      const financeEntryMatch = path.match(/^\/admin\/finance\/entries\/([^/]+)$/);
      if (['PATCH', 'DELETE'].includes(request.method) && financeEntryMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData) return bad('Login admin diperlukan', 401);
        if (tokenData.role === 'IT') return bad('Role IT tidak dapat mengedit atau menghapus transaksi.', 403);
        let body = {};
        try { body = await request.json(); } catch {}
        const pin = String(body.pin || '');
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master 4 digit untuk menyetujui perubahan transaksi.', 400);
        const masterPin = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!masterPin?.delete_pin_hash) return bad('PIN penghapusan Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedHash = await hashDashboardPassword(pin, masterPin.delete_pin_salt);
        if (!constantTimeEqual(attemptedHash, masterPin.delete_pin_hash)) return bad('PIN Master salah.', 403);
        const id = decodeURIComponent(financeEntryMatch[1]);
        const financeEntry = await env.DB.prepare('SELECT * FROM finance_entries WHERE id = ?').bind(id).first();
        if (!financeEntry) return bad('Transaksi tidak ditemukan.', 404);
        if (financeEntry?.created_by === 'checkin-payroll') {
          return bad('Pengeluaran honor crew mengikuti data check-in. Edit atau hapus check-in sumber untuk memperbarui biaya ini.', 409);
        }
        if (financeEntry?.created_by === 'crew-payroll') {
          return bad('Pengeluaran ini berasal dari slip gaji crew. Klik Batalkan di Laporan Crew, revisi slip di Dashboard Check In Crew, lalu masukkan lagi sebagai pengeluaran.', 409);
        }
        if (request.method === 'PATCH') {
          if (financeEntry.kind !== 'expense') return bad('Hanya transaksi pengeluaran yang dapat diedit dari form ini.', 400);
          const categoryId = String(body.category_id || '');
          const entryDate = String(body.entry_date || '');
          const amount = Number(body.amount);
          const recurrence = String(body.recurrence || 'once');
          const description = String(body.description || '').trim();
          const payee = String(body.payee || '').trim();
          const propertyId = String(body.property_id || '').trim() || null;
          const propertyName = String(body.property_name || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !Number.isSafeInteger(amount) || amount <= 0) return bad('Tanggal dan jumlah pengeluaran tidak valid.');
          if (description.length > 240 || payee.length > 120 || propertyName.length > 160) return bad('Keterangan, penerima, atau properti terlalu panjang.');
          if (!['once', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(recurrence)) return bad('Frekuensi pengeluaran tidak valid.');
          const category = await env.DB.prepare('SELECT id, kind, name FROM finance_categories WHERE id = ? AND active = 1')
            .bind(categoryId).first();
          if (!category || category.kind !== 'expense') return bad('Pilih kategori pengeluaran yang valid.');
          let proofUrl = financeEntry.proof_url || '';
          if (body.proof_image) {
            const proof = parseDataUrl(body.proof_image);
            if (!String(proof.contentType || '').startsWith('image/')) return bad('Bukti transaksi harus berupa gambar.');
            if (proof.bytes.byteLength > 100 * 1024) return bad('Ukuran bukti setelah kompresi harus di bawah 100 KB.');
            const proofKey = `finance/expense-proof/${crypto.randomUUID()}.jpg`;
            await env.PHOTOS.put(proofKey, proof.bytes, {
              httpMetadata: { contentType:proof.contentType || 'image/jpeg' },
            });
            proofUrl = publicFileUrl(url.origin, proofKey);
          }
          await env.DB.prepare(`
            UPDATE finance_entries SET
              category_id = ?, category_name = ?, property_id = ?, property_name = ?,
              entry_date = ?, amount = ?, description = ?, payee = ?, recurrence = ?, proof_url = ?
            WHERE id = ? AND kind = 'expense' AND created_by <> 'checkin-payroll'
          `).bind(category.id, category.name, propertyId, propertyName, entryDate, amount,
            description, payee, recurrence, proofUrl, id).run();
          return json({ ok:true, data:{ id, proof_url:proofUrl } });
        }

        // Pengeluaran crew yang diterima (crew-expense-<id>): menghapusnya di sini juga menghapusnya dari Laporan Crew,
        // tetapi riwayat di Dashboard Check In Crew tetap ada (berstatus Terkirim).
        if (financeEntry.created_by === 'crew-expense' && id.startsWith('crew-expense-')) {
          await env.DB.prepare(`UPDATE finance_entries SET review_status = 'removed' WHERE id = ? AND (created_by LIKE 'crew:%' OR created_by LIKE 'ops:%')`)
            .bind(id.slice('crew-expense-'.length)).run();
        }
        // Baris lama crew/operasional (dibuat sebelum ada salinan terpisah) tampil langsung di menu Pengeluaran. Menghapusnya
        // dari sini hanya menyembunyikannya (status 'removed'); riwayat di Dashboard Check In Crew tetap ada sebagai Terkirim.
        if (/^(crew|ops):/.test(String(financeEntry.created_by || ''))) {
          try {
            await env.DB.prepare(`
              UPDATE finance_entries
              SET review_status = 'removed', review_sent_at = CASE WHEN review_sent_at = '' THEN ? ELSE review_sent_at END
              WHERE id = ?
            `).bind(new Date().toISOString(), id).run();
            return json({ ok: true, data: { id } });
          } catch (error) {
            if (!/review_/i.test(String(error?.message || error))) throw error;
          }
        }
        const result = await env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(id).run();
        if (!result.meta?.changes) return bad('Transaksi tidak ditemukan.', 404);
        return json({ ok: true, data: { id } });
      }

      const kosanMouMatch = path.match(/^\/kosan\/mous(?:\/([^/]+))?$/);
      if (kosanMouMatch && ['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengakses data MOU.', 403);
        const recordId = kosanMouMatch[1] ? decodeURIComponent(kosanMouMatch[1]) : '';

        try {
          if (request.method === 'GET') {
            if (recordId) {
              const row = await env.DB.prepare('SELECT * FROM kosan_mou_records WHERE id = ?').bind(recordId).first();
              if (!row) return bad('Data MOU tidak ditemukan.', 404);
              let record;
              try { record = JSON.parse(row.data_json); }
              catch { return bad('Data MOU rusak dan tidak dapat dibaca.', 500); }
              return json({ ok:true, data:{
                id:row.id, mou_number:row.mou_number, agreement_date:row.agreement_date,
                building:row.building, room_number:row.room_number, tenant_name:row.tenant_name,
                price:Number(row.price), deposit:Number(row.deposit), created_at:row.created_at,
                updated_at:row.updated_at, record,
              } });
            }
            const result = await env.DB.prepare(`
              SELECT id, mou_number, agreement_date, building, room_number,
                COALESCE(NULLIF(tenant_name, ''), json_extract(data_json, '$.fields."mou-bio-nama"'), '') AS tenant_name,
                     price, deposit, created_at, updated_at
              FROM kosan_mou_records ORDER BY updated_at DESC LIMIT 500
            `).all();
            return json({ ok:true, data:result.results || [] });
          }

          if (request.method === 'DELETE') {
            if (!recordId) return bad('ID MOU wajib diisi.');
            const body = await request.json().catch(() => ({}));
            const pin = String(body.pin || '').trim();
            if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master 4 digit untuk menghapus MOU.');
            const master = await env.DB.prepare(`
              SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
              WHERE account_id = 'master' AND active = 1
            `).first();
            if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi.', 409);
            const attemptedPinHash = await hashDashboardPassword(pin, master.delete_pin_salt);
            if (!constantTimeEqual(attemptedPinHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
            const deleted = await env.DB.prepare('DELETE FROM kosan_mou_records WHERE id = ?').bind(recordId).run();
            if (!deleted.meta?.changes) return bad('Data MOU tidak ditemukan.', 404);
            return json({ ok:true, data:{ id:recordId, deleted:true } });
          }

          if (request.method === 'PUT' && !recordId) return bad('ID MOU wajib diisi untuk memperbarui data.');
          if (request.method === 'POST' && recordId) return bad('Gunakan POST untuk membuat MOU baru.');
          const body = await request.json();
          const record = body.record && typeof body.record === 'object' && !Array.isArray(body.record) ? body.record : null;
          const fields = record?.fields;
          const requiredFields = ['mou-nomor','mou-tanggal','mou-gedung','mou-kamar','mou-harga','mou-deposit',
            'mou-bio-nama','mou-bio-hp','mou-bio-kontak-darurat','mou-bio-hp-darurat'];
          if (!fields || !requiredFields.every(id => typeof fields[id] === 'string' && fields[id].trim()) ||
              !Object.values(fields || {}).every(value => typeof value === 'string' && value.length <= 2000)) {
            return bad('Lengkapi data wajib MOU dan pastikan teks maksimal 2.000 karakter.');
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fields['mou-tanggal'])) return bad('Tanggal MOU tidak valid.');
          const price = Number(fields['mou-harga']);
          const deposit = Number(fields['mou-deposit']);
          if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(deposit) || deposit < 0) {
            return bad('Harga sewa atau deposit MOU tidak valid.');
          }
          if (record.agree !== true) return bad('Persetujuan MOU wajib dicentang sebelum disimpan.');
          const validPhoto = photo => {
            if (!photo || typeof photo.data !== 'string') return false;
            try {
              const parsed = parseDataUrl(photo.data);
              return parsed.contentType === 'image/jpeg' && parsed.bytes.byteLength < 100 * 1024;
            } catch { return false; }
          };
          if (!validPhoto(record.photos?.ktp) || !validPhoto(record.photos?.selfie)) {
            return bad('Foto KTP dan foto diri wajib berupa JPEG hasil kompresi di bawah 100 KB.');
          }
          const validSignature = signature => {
            if (!signature || typeof signature.data !== 'string') return false;
            try {
              const parsed = parseDataUrl(signature.data);
              return parsed.contentType === 'image/png' && parsed.bytes.byteLength < 300 * 1024;
            } catch { return false; }
          };
          if (!validSignature(record.signatures?.penghuni) || !validSignature(record.signatures?.management)) {
            return bad('Tanda tangan penghuni dan management wajib dikonfirmasi.');
          }
          const dataJson = JSON.stringify(record);
          if (new TextEncoder().encode(dataJson).byteLength > 1024 * 1024) return bad('Data MOU melebihi batas 1 MB.');
          const mouNumber = fields['mou-nomor'].trim().slice(0, 100);
          const building = fields['mou-gedung'].trim().slice(0, 160);
          const roomNumber = fields['mou-kamar'].trim().slice(0, 60);
          const tenantName = fields['mou-bio-nama'].trim().slice(0, 160);
          const now = new Date().toISOString();

          if (request.method === 'POST') {
            const id = `mou-${crypto.randomUUID()}`;
            await env.DB.prepare(`
              INSERT INTO kosan_mou_records (
                id, mou_number, agreement_date, building, room_number, tenant_name, price, deposit,
                data_json, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(id, mouNumber, fields['mou-tanggal'], building, roomNumber, tenantName, price, deposit,
              dataJson, tokenData.account_id || '', now, now).run();
            return json({ ok:true, data:{ id, mou_number:mouNumber, tenant_name:tenantName, created_at:now } }, 201);
          }

          const updated = await env.DB.prepare(`
            UPDATE kosan_mou_records SET
              mou_number = ?, agreement_date = ?, building = ?, room_number = ?, tenant_name = ?,
              price = ?, deposit = ?, data_json = ?, updated_at = ?
            WHERE id = ?
          `).bind(mouNumber, fields['mou-tanggal'], building, roomNumber, tenantName, price, deposit,
            dataJson, now, recordId).run();
          if (!updated.meta?.changes) return bad('Data MOU tidak ditemukan.', 404);
          return json({ ok:true, data:{ id:recordId, mou_number:mouNumber, tenant_name:tenantName, updated_at:now } });
        } catch (error) {
          if (/no such table: kosan_mou_records/i.test(String(error?.message || error))) {
            return bad('Penyimpanan MOU belum disiapkan. Jalankan migration-kosan-mou-records.sql di D1.', 503);
          }
          throw error;
        }
      }

      // ================= KOSAN ROOMS (Kamar/Penyewa/Pembayaran kos) =================
      // Butuh migrations/migration-kosan-rooms.sql dijalankan di D1 sebelum endpoint ini dipakai.
      if (request.method === 'GET' && path === '/kosan/rooms') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const status = String(url.searchParams.get('status') || 'approved');

        if (status === 'pending') {
          const result = await env.DB.prepare(`
            SELECT id, building, building_code, room_number, tenant_name, price, depo, status, notes, created_at
            FROM kosan_room_requests WHERE decision_status = 'pending' ORDER BY created_at ASC
          `).all();
          return json({ ok:true, data:result.results || [] });
        }

        const [roomsResult, paymentsResult] = await Promise.all([
          env.DB.prepare('SELECT * FROM kosan_rooms ORDER BY building, room_number').all(),
          env.DB.prepare('SELECT * FROM kosan_room_payments').all(),
        ]);
        let batchesResult = { results:[] };
        try {
          batchesResult = await env.DB.prepare('SELECT * FROM kosan_payment_batches').all();
        } catch (error) {
          if (!/no such table: kosan_payment_batches/i.test(String(error?.message || error))) throw error;
        }
        const paymentsByRoom = new Map();
        for (const row of paymentsResult.results || []) {
          if (!paymentsByRoom.has(row.room_id)) paymentsByRoom.set(row.room_id, new Map());
          paymentsByRoom.get(row.room_id).set(row.period, row);
        }
        const batchesByRoomPeriod = new Map();
        for (const batch of batchesResult.results || []) {
          for (let index = 0; index < Number(batch.months_paid || 0); index++) {
            const period = shiftKosanPeriod(batch.start_period, index);
            batchesByRoomPeriod.set(`${batch.room_id}\u0000${period.key}`, batch);
          }
        }
        const rooms = (roomsResult.results || []).map(room => {
          const existing = paymentsByRoom.get(room.id) || new Map();
          const periodKeys = new Set(KOSAN_PERIODS.map(period => period.key));
          existing.forEach((row, periodKey) => {
            if (periodKey > KOSAN_CURRENT_PERIOD) periodKeys.add(periodKey);
          });
          const payments = [...periodKeys].sort().map(periodKey => {
            const period = getKosanPeriod(periodKey);
            const row = existing.get(period.key);
            const batch = batchesByRoomPeriod.get(`${room.id}\u0000${period.key}`);
            return {
              period:period.key, label:period.label,
              status:row?.status || (room.status === 'occupied' ? 'unpaid' : 'none'),
              recorded:Boolean(row), date:row?.date || null,
              amount:batch ? Math.round(Number(batch.total_amount) / Number(batch.months_paid)) : null,
              method:batch?.method || '', notes:batch?.notes || '', batch_id:batch?.id || '',
            };
          });
          return {
            id:room.id, building:room.building, building_code:room.building_code, room_number:room.room_number,
            room_label:room.room_label, tenant_name:room.tenant_name, price:Number(room.price || 0),
            depo:{ amount:Number(room.depo_amount || 0), refundable:Boolean(room.depo_refundable) },
            status:room.status, notes:room.notes, payments,
          };
        });
        return json({ ok:true, data:rooms });
      }

      if (request.method === 'POST' && path === '/kosan/room-payments') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mencatat pembayaran kos.', 403);
        const body = await request.json();
        let roomId = String(body.room_id || '').trim();
        const building = String(body.building || '').trim();
        const roomNumber = String(body.room_number || '').trim();
        const startPeriod = String(body.start_period || '').trim();
        const monthsPaid = Number(body.months_paid);
        const receivedDate = String(body.received_date || '').trim();
        const method = String(body.method || '').trim();
        const notes = String(body.notes || '').trim();
        const validMethods = ['Transfer BCA', 'Transfer Bank Lain', 'Tunai', 'Lainnya'];
        if ((!roomId && (!building || !roomNumber)) || !getKosanPeriod(startPeriod) || !Number.isInteger(monthsPaid) || monthsPaid < 1 || monthsPaid > 12 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || receivedDate > getKosanBillingDate() ||
            !validMethods.includes(method) || notes.length > 500) {
          return bad('Kamar, bulan, jumlah bulan, tanggal, metode, atau catatan pembayaran tidak valid.');
        }
        const findRoom = () => roomId
          ? env.DB.prepare('SELECT id, building, room_number, tenant_name, price, status FROM kosan_rooms WHERE id = ?').bind(roomId).first()
          : env.DB.prepare('SELECT id, building, room_number, tenant_name, price, status FROM kosan_rooms WHERE building = ? AND room_number = ?').bind(building, roomNumber).first();
        let room = await findRoom();
        // Kamar yang baru ada di snapshot lokal kosan.html dibuat dulu di D1, sama seperti alur checkout.
        if (!room && !roomId && body.room && typeof body.room === 'object') {
          const snapshot = body.room;
          const tenantName = String(snapshot.tenant_name || '').trim();
          const price = Number(snapshot.price);
          const depoAmount = Number(snapshot.depo_amount || 0);
          const snapshotNotes = String(snapshot.notes || '').trim();
          if (!tenantName || tenantName.length > 120 || snapshotNotes.length > 500 ||
              !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(depoAmount) || depoAmount < 0) {
            return bad('Data kamar dari halaman tidak valid untuk dicatat pembayarannya.');
          }
          const now = new Date().toISOString();
          const newRoomId = `room-${crypto.randomUUID()}`;
          await env.DB.prepare(`
            INSERT OR IGNORE INTO kosan_rooms
              (id, building, building_code, room_number, room_label, tenant_name, price, depo_amount, depo_refundable, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'occupied', ?, ?, ?)
          `).bind(newRoomId, building, String(snapshot.building_code || '').trim().slice(0, 20), roomNumber,
            String(snapshot.room_label || `Kamar ${roomNumber}`).trim().slice(0, 100), tenantName, price, depoAmount,
            snapshot.depo_refundable ? 1 : 0, snapshotNotes, now, now).run();
          room = await findRoom();
          if (room) {
            const historyStatements = (Array.isArray(snapshot.payments) ? snapshot.payments : []).flatMap(payment => {
              const period = getKosanPeriod(String(payment?.period || '').trim());
              if (!period) return [];
              const paymentStatus = ['paid', 'unpaid', 'checkout', 'none'].includes(payment.status) ? payment.status : 'unpaid';
              const paymentDate = typeof payment.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? payment.date : null;
              return [env.DB.prepare(`
                INSERT OR IGNORE INTO kosan_room_payments (id, room_id, period, label, status, date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).bind(`${room.id}-${period.key}`, room.id, period.key, period.label, paymentStatus, paymentDate, now)];
            });
            for (let offset = 0; offset < historyStatements.length; offset += 50) {
              await env.DB.batch(historyStatements.slice(offset, offset + 50));
            }
          }
        }
        if (!room || room.status !== 'occupied' || !room.tenant_name) return bad('Kamar tidak ditemukan atau tidak sedang ditempati.', 404);
        roomId = room.id;
        const monthlyPrice = Number(room.price);
        const totalAmount = monthlyPrice * monthsPaid;
        if (!Number.isSafeInteger(monthlyPrice) || monthlyPrice <= 0 || !Number.isSafeInteger(totalAmount)) {
          return bad('Tarif sewa kamar tidak valid.');
        }
        const periods = Array.from({ length:monthsPaid }, (_, index) => shiftKosanPeriod(startPeriod, index));
        const maximumPeriod = shiftKosanPeriod(KOSAN_CURRENT_PERIOD, 12).key;
        if (periods[0].key < KOSAN_PERIODS[0].key || periods.at(-1).key > maximumPeriod) {
          return bad('Periode pembayaran harus berada dalam rentang riwayat kos dan maksimal 12 bulan ke depan.');
        }
        const placeholders = periods.map(() => '?').join(', ');
        const existingPayments = await env.DB.prepare(`
          SELECT period, status FROM kosan_room_payments
          WHERE room_id = ? AND period IN (${placeholders})
        `).bind(roomId, ...periods.map(period => period.key)).all();
        const blockedPeriods = (existingPayments.results || [])
          .filter(payment => ['paid', 'checkout'].includes(payment.status))
          .map(payment => getKosanPeriod(payment.period)?.label || payment.period);
        if (blockedPeriods.length) return bad(`Tidak dapat mencatat ulang periode: ${blockedPeriods.join(', ')}.` , 409);

        const batchId = crypto.randomUUID();
        const now = new Date().toISOString();
        const periodRange = periods.length === 1
          ? periods[0].label
          : `${periods[0].label} - ${periods.at(-1).label}`;
        const description = `Sewa kos ${room.building} Kamar ${room.room_number} (${periodRange}, ${monthsPaid} bulan)`;
        const statements = [
          env.DB.prepare(`
            INSERT INTO kosan_payment_batches (
              id, room_id, start_period, months_paid, received_date, total_amount, method, notes, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(batchId, room.id, startPeriod, monthsPaid, receivedDate, totalAmount, method, notes, tokenData.account_id || '', now),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) VALUES (?, 'income', 'income-kosan-rent', 'Sewa Kos', NULL, ?, ?, ?, ?, ?, 'once', 'kosan-payment', ?)
          `).bind(`kosan-rent-${batchId}`, room.building, receivedDate, totalAmount, description, room.tenant_name, now),
          ...periods.map(period => env.DB.prepare(`
            INSERT INTO kosan_room_payments (id, room_id, period, label, status, date, updated_at)
            VALUES (?, ?, ?, ?, 'paid', ?, ?)
            ON CONFLICT(room_id, period) DO UPDATE SET status = 'paid', date = excluded.date, updated_at = excluded.updated_at
          `).bind(`${room.id}-${period.key}`, room.id, period.key, period.label, receivedDate, now)),
        ];
        try {
          await env.DB.batch(statements);
        } catch (error) {
          if (/no such table: kosan_payment_batches|no such column: payment_batch_id/i.test(String(error?.message || error))) {
            return bad('Fitur pencatatan pembayaran belum disiapkan. Jalankan migration-kosan-payment-batches.sql di D1.', 503);
          }
          if (/no such row|FOREIGN KEY constraint failed|no such table: finance_categories/i.test(String(error?.message || error))) {
            return bad('Kategori pemasukan Sewa Kos belum tersedia. Jalankan migration-kosan-rent-income-category.sql di D1.', 503);
          }
          throw error;
        }
        return json({ ok:true, data:{
          id:batchId, room_id:room.id, building:room.building, room_number:room.room_number,
          tenant_name:room.tenant_name, start_period:startPeriod, end_period:periods.at(-1).key,
          period_label:periodRange, months_paid:monthsPaid, received_date:receivedDate,
          total_amount:totalAmount, method, notes,
        } }, 201);
      }

      if (request.method === 'POST' && path === '/kosan/rooms') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const body = await request.json();
        const building = String(body.building || '').trim();
        const buildingCode = String(body.building_code || '').trim().slice(0, 20);
        const roomNumber = String(body.room_number || '').trim();
        const tenantName = String(body.tenant_name || '').trim();
        const price = Number(body.price);
        const depo = Number(body.depo || 0);
        const status = 'occupied';
        const notes = String(body.notes || '').trim();
        const startDate = String(body.start_date || '').trim();
        if (!building || building.length > 100) return bad('Nama kost/gedung wajib diisi.');
        if (!roomNumber || roomNumber.length > 20) return bad('Nomor kamar wajib diisi.');
        if (!tenantName || tenantName.length > 120) return bad('Nama penyewa wajib diisi dan maksimal 120 karakter.');
        if (!Number.isSafeInteger(price) || price <= 0) return bad('Harga sewa wajib diisi dan valid.');
        if (!Number.isSafeInteger(depo) || depo <= 0) return bad('Deposit wajib lebih dari Rp0.');
        if (notes.length > 500) return bad('Catatan terlalu panjang.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return bad('Tanggal mulai sewa wajib diisi dan valid.');
        const id = crypto.randomUUID();
        try {
          await env.DB.prepare(`
            INSERT INTO kosan_room_requests (id, building, building_code, room_number, tenant_name, price, depo, status, notes, start_date, decision_status, submitted_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
          `).bind(id, building, buildingCode, roomNumber, tenantName, price, depo, status, notes, startDate, String(tokenData.account_id || ''), new Date().toISOString()).run();
        } catch (error) {
          if (/(?:no such column:|no column named)\s*start_date/i.test(String(error?.message || error))) {
            return bad('Kolom tanggal mulai sewa belum tersedia. Jalankan migration-kosan-room-requests-start-date.sql di D1.', 503);
          }
          throw error;
        }
        return json({ ok:true, data:{ id } }, 201);
      }

      const kosanRoomDecisionMatch = path.match(/^\/kosan\/rooms\/([^/]+)\/(approve|reject)$/);
      if (request.method === 'POST' && kosanRoomDecisionMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat memutuskan pengajuan kamar.', 403);
        const [, requestId, action] = kosanRoomDecisionMatch;
        const submission = await env.DB.prepare(`SELECT * FROM kosan_room_requests WHERE id = ? AND decision_status = 'pending'`).bind(requestId).first();
        if (!submission) return bad('Pengajuan tidak ditemukan atau sudah diputuskan.', 404);
        const now = new Date().toISOString();
        if (action === 'reject') {
          await env.DB.prepare(`UPDATE kosan_room_requests SET decision_status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?`)
            .bind(String(tokenData.account_id || ''), now, requestId).run();
          return json({ ok:true, data:{ id:requestId, decision:'rejected' } });
        }
        const existingRoom = await env.DB.prepare('SELECT id FROM kosan_rooms WHERE building = ? AND room_number = ?')
          .bind(submission.building, submission.room_number).first();
        const roomId = existingRoom?.id || crypto.randomUUID();
        const statements = [
          env.DB.prepare(`
            INSERT INTO kosan_rooms (id, building, building_code, room_number, room_label, tenant_name, price, depo_amount, depo_refundable, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            ON CONFLICT(building, room_number) DO UPDATE SET
              tenant_name = excluded.tenant_name, price = excluded.price, depo_amount = excluded.depo_amount,
              status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
          `).bind(roomId, submission.building, submission.building_code, submission.room_number, `Kamar ${submission.room_number}`,
            submission.tenant_name, submission.price, submission.depo, submission.status, submission.notes, now, now),
          env.DB.prepare(`UPDATE kosan_room_requests SET decision_status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?`)
            .bind(String(tokenData.account_id || ''), now, requestId),
        ];
        // Kamar bekas penyewa lama: bersihkan riwayat pembayaran lama supaya tidak tertukar
        // dengan penyewa baru, lalu siapkan baris "Belum Bayar" sejak tanggal mulai sewa.
        const startPeriod = getKosanPeriod(String(submission.start_date || '').trim());
        if (existingRoom && startPeriod) {
          statements.push(env.DB.prepare(`
            UPDATE kosan_room_payments SET status = 'none', date = NULL, updated_at = ?
            WHERE room_id = ? AND period < ?
          `).bind(now, roomId, startPeriod.key));
        }
        if (startPeriod) {
          let cursor = startPeriod;
          while (cursor.key <= KOSAN_CURRENT_PERIOD) {
            statements.push(env.DB.prepare(`
              INSERT INTO kosan_room_payments (id, room_id, period, label, status, date, updated_at)
              VALUES (?, ?, ?, ?, 'unpaid', NULL, ?)
              ON CONFLICT(room_id, period) DO UPDATE SET
                status = 'unpaid', date = NULL, updated_at = excluded.updated_at
              WHERE kosan_room_payments.status NOT IN ('paid', 'checkout')
            `).bind(`${roomId}-${cursor.key}`, roomId, cursor.key, cursor.label, now));
            cursor = shiftKosanPeriod(cursor.key, 1);
          }
        }
        await env.DB.batch(statements);
        return json({ ok:true, data:{ id:requestId, decision:'approved', room_id:roomId } });
      }

      const kosanRoomEditMatch = path.match(/^\/kosan\/rooms\/([^/]+)$/);
      if (request.method === 'PATCH' && kosanRoomEditMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah data kamar.', 403);
        const roomId = decodeURIComponent(kosanRoomEditMatch[1]);
        const room = await env.DB.prepare('SELECT id, status, tenant_name FROM kosan_rooms WHERE id = ?').bind(roomId).first();
        if (!room) return bad('Kamar tidak ditemukan.', 404);
        // Pakai keberadaan tenant_name (bukan status strict) -- beberapa kamar datanya tidak
        // sinkron (sudah ada penyewa tapi status belum/tidak "occupied"), lihat fix serupa di /kosan/room-payments.
        if (!room.tenant_name) return bad('Hanya kamar yang sedang ditempati yang dapat diedit di sini.', 409);
        const body = await request.json();
        const tenantName = String(body.tenant_name || '').trim();
        const price = Number(body.price);
        const depoAmount = Number(body.depo_amount);
        const depoRefundable = body.depo_refundable ? 1 : 0;
        const notes = String(body.notes || '').trim();
        if (!tenantName || tenantName.length > 120) return bad('Nama penyewa wajib diisi dan maksimal 120 karakter.');
        if (!Number.isSafeInteger(price) || price <= 0) return bad('Harga sewa wajib diisi dan valid.');
        if (!Number.isSafeInteger(depoAmount) || depoAmount < 0) return bad('Deposit tidak valid.');
        if (notes.length > 500) return bad('Catatan terlalu panjang.');
        const now = new Date().toISOString();
        await env.DB.prepare(`
          UPDATE kosan_rooms SET tenant_name = ?, price = ?, depo_amount = ?, depo_refundable = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).bind(tenantName, price, depoAmount, depoRefundable, notes, now, roomId).run();
        return json({ ok:true, data:{ id:roomId, tenant_name:tenantName, price, depo_amount:depoAmount, depo_refundable:Boolean(depoRefundable), notes } });
      }

      if (request.method === 'POST' && path === '/kosan/room-status/checkout') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const body = await request.json();
        const building = String(body.building || '').trim();
        const roomNumber = String(body.room_number || '').trim();
        if (!building || !roomNumber) return bad('Gedung dan nomor kamar wajib diisi.');
        let room = await env.DB.prepare('SELECT id FROM kosan_rooms WHERE building = ? AND room_number = ?').bind(building, roomNumber).first();
        const now = new Date().toISOString();
        const currentPeriodMeta = KOSAN_PERIODS.find(p => p.key === KOSAN_CURRENT_PERIOD);
        const statements = [];
        if (!room) {
          const snapshot = body.room && typeof body.room === 'object' ? body.room : null;
          if (!snapshot) return bad('Kamar belum ada di D1 dan snapshot kamar tidak tersedia.', 404);
          const buildingCode = String(snapshot.building_code || '').trim().slice(0, 20);
          const roomLabel = String(snapshot.room_label || `Kamar ${roomNumber}`).trim().slice(0, 100);
          const tenantName = String(snapshot.tenant_name || '').trim();
          const price = Number(snapshot.price);
          const depoAmount = Number(snapshot.depo_amount || 0);
          const depoRefundable = snapshot.depo_refundable ? 1 : 0;
          const notes = String(snapshot.notes || '').trim();
          if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(depoAmount) || depoAmount < 0) {
            return bad('Data harga/deposit kamar tidak valid.');
          }
          if (tenantName.length > 120 || notes.length > 500) return bad('Nama penyewa atau catatan terlalu panjang.');

          const roomId = `room-${crypto.randomUUID()}`;
          await env.DB.prepare(`
            INSERT OR IGNORE INTO kosan_rooms
              (id, building, building_code, room_number, room_label, tenant_name, price, depo_amount, depo_refundable, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'vacant', ?, ?, ?)
          `).bind(roomId, building, buildingCode, roomNumber, roomLabel, tenantName, price, depoAmount, depoRefundable, notes, now, now).run();
          room = await env.DB.prepare('SELECT id FROM kosan_rooms WHERE building = ? AND room_number = ?').bind(building, roomNumber).first();
          if (!room) return bad('Kamar gagal disiapkan di D1.', 500);

          const payments = Array.isArray(snapshot.payments) ? snapshot.payments : [];
          payments.forEach(payment => {
            const period = KOSAN_PERIODS.find(item => item.key === String(payment.period || '').trim());
            if (!period) return;
            const paymentStatus = ['paid', 'unpaid', 'checkout', 'none'].includes(payment.status) ? payment.status : 'unpaid';
            const paymentDate = typeof payment.date === 'string' && payment.date ? payment.date : null;
            statements.push(env.DB.prepare(`
              INSERT OR IGNORE INTO kosan_room_payments (id, room_id, period, label, status, date, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(`${room.id}-${period.key}`, room.id, period.key, period.label, paymentStatus, paymentDate, now));
          });
        }
        statements.push(
          env.DB.prepare(`UPDATE kosan_rooms SET status = 'vacant', tenant_name = '', price = 0, updated_at = ? WHERE id = ?`).bind(now, room.id),
          env.DB.prepare(`
            INSERT INTO kosan_room_payments (id, room_id, period, label, status, date, updated_at)
            VALUES (?, ?, ?, ?, 'checkout', NULL, ?)
            ON CONFLICT(room_id, period) DO UPDATE SET status = 'checkout', date = NULL, updated_at = excluded.updated_at
          `).bind(`${room.id}-${KOSAN_CURRENT_PERIOD}`, room.id, KOSAN_CURRENT_PERIOD, currentPeriodMeta?.label || KOSAN_CURRENT_PERIOD, now),
        );
        await env.DB.batch(statements);
        return json({ ok:true, data:{ building, room_number:roomNumber } });
      }

      // Saklar ON/OFF penghubung pemasukan & pengeluaran Kosan ke Dashboard (dasbord.html).
      // Nilai disimpan di site_settings ('1' = terhubung, '0' = terputus; kosong = terhubung).
      // Mengubahnya wajib PIN Master; dibaca publik lewat GET /settings.
      if (request.method === 'POST' && path === '/kosan/dashboard-sync') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah koneksi Dashboard.', 403);
        const rate = await reserveLoginAttempt(env, request, 'kosan-dashboard-sync');
        if (rate.limited) return bad('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        if (typeof body.enabled !== 'boolean') return bad('Status koneksi tidak valid.');
        const pin = String(body.pin || '').trim();
        if (!/^\d{4}$/.test(pin)) return bad('Masukkan PIN Master tepat 4 digit.', 400);
        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedPinHash = await hashDashboardPassword(pin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedPinHash, master.delete_pin_hash)) return bad('PIN Master salah.', 403);
        await env.DB.prepare(`
          INSERT INTO site_settings (key, value, updated_at) VALUES ('kosan_dashboard_sync', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(body.enabled ? '1' : '0', new Date().toISOString()).run();
        return json({ ok:true, data:{ enabled:body.enabled } });
      }

      // ================= GUEST FEEDBACK (form-kritik-saran.html) =================
      // Butuh migrations/migration-guest-feedback.sql dijalankan di D1 sebelum endpoint ini dipakai.
      if (request.method === 'POST' && path === '/guest-feedback') {
        const rate = await reserveLoginAttempt(env, request, 'guest-feedback');
        if (rate.limited) return bad('Terlalu banyak pengiriman dari perangkat ini. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        const propertyType = String(body.property_type || '').trim();
        const propertyName = String(body.property_name || '').trim();
        const checkinDate = String(body.checkin_date || '').trim();
        const stayDuration = String(body.stay_duration || '').trim();
        const bookingSource = String(body.booking_source || '').trim();
        const guestName = String(body.guest_name || '').trim();
        const guestPhone = String(body.guest_phone || '').trim();
        const guestEmail = String(body.guest_email || '').trim();
        const guestCity = String(body.guest_city || '').trim();
        const purpose = String(body.purpose || '').trim();
        const ratings = body.ratings && typeof body.ratings === 'object' ? body.ratings : {};
        const ratingFields = ['cleanliness', 'comfort', 'facilities', 'location', 'service', 'value'];
        const ratingValues = {};
        for (const key of ratingFields) {
          const value = Number(ratings[key]);
          if (!Number.isInteger(value) || value < 1 || value > 5) return bad(`Rating "${key}" wajib diisi (1-5).`);
          ratingValues[key] = value;
        }
        const avgRating = ratingFields.reduce((sum, key) => sum + ratingValues[key], 0) / ratingFields.length;
        const liked = String(body.liked || '').trim();
        const improve = String(body.improve || '').trim();
        const suggestion = String(body.suggestion || '').trim();
        const npsScore = Number(body.nps_score);
        const followUpConsent = body.follow_up_consent ? 1 : 0;
        const testimonialConsent = body.testimonial_consent ? 1 : 0;

        if (!['villa', 'apartment', 'kos', 'guesthouse'].includes(propertyType)) return bad('Jenis properti tidak valid.');
        if (!propertyName || propertyName.length > 160) return bad('Nama properti wajib diisi.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkinDate)) return bad('Tanggal check-in tidak valid.');
        if (!stayDuration || stayDuration.length > 40) return bad('Durasi menginap wajib diisi.');
        if (bookingSource.length > 80) return bad('Sumber booking terlalu panjang.');
        if (!guestName || guestName.length > 120) return bad('Nama tamu wajib diisi.');
        if (!guestPhone || guestPhone.length < 8 || guestPhone.length > 30) return bad('No. WhatsApp tidak valid.');
        if (guestEmail.length > 160) return bad('Email terlalu panjang.');
        if (!guestCity || guestCity.length > 80) return bad('Kota asal wajib diisi.');
        if (purpose.length > 40) return bad('Tujuan kunjungan tidak valid.');
        if (!liked || liked.length > 1000) return bad('Kolom "apa yang paling disukai" wajib diisi (maks 1000 karakter).');
        if (improve.length > 1000 || suggestion.length > 1000) return bad('Saran/masukan terlalu panjang (maks 1000 karakter).');
        if (!Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10) return bad('Skor rekomendasi tidak valid.');

        const id = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO guest_feedback (
            id, property_type, property_name, checkin_date, stay_duration, booking_source,
            guest_name, guest_phone, guest_email, guest_city, purpose,
            rating_cleanliness, rating_comfort, rating_facilities, rating_location, rating_service, rating_value,
            avg_rating, liked, improve, suggestion, nps_score, follow_up_consent, testimonial_consent, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id, propertyType, propertyName, checkinDate, stayDuration, bookingSource,
          guestName, guestPhone, guestEmail, guestCity, purpose,
          ratingValues.cleanliness, ratingValues.comfort, ratingValues.facilities, ratingValues.location, ratingValues.service, ratingValues.value,
          avgRating, liked, improve, suggestion, npsScore, followUpConsent, testimonialConsent, new Date().toISOString()
        ).run();
        return json({ ok:true, data:{ id } }, 201);
      }

      if (request.method === 'GET' && path === '/admin/guest-feedback') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        try {
          const [result, totalRow] = await Promise.all([
            env.DB.prepare('SELECT * FROM guest_feedback ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset).all(),
            env.DB.prepare('SELECT COUNT(*) AS total FROM guest_feedback').first(),
          ]);
          return json({ ok:true, data:result.results || [], pagination:{ limit, offset, total:Number(totalRow?.total || 0) } });
        } catch (error) {
          if (/no such table: guest_feedback/i.test(String(error?.message || error))) {
            return bad('Tabel masukan tamu belum tersedia. Jalankan migration-guest-feedback.sql di D1.', 503);
          }
          throw error;
        }
      }

      // Hitungan ringan untuk lampu notifikasi di kartu "QR Kritik & Saran" (hub admin_yourhome).
      if (request.method === 'GET' && path === '/admin/guest-feedback/unread-count') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        try {
          const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM guest_feedback WHERE status = 'unread'`).first();
          return json({ ok:true, data:{ count:Number(row?.count || 0) } });
        } catch (error) {
          if (/no such table: guest_feedback|no such column: status/i.test(String(error?.message || error))) {
            return json({ ok:true, data:{ count:0 } });
          }
          throw error;
        }
      }

      const guestFeedbackStatusMatch = path.match(/^\/admin\/guest-feedback\/([^/]+)$/);
      if (request.method === 'PATCH' && guestFeedbackStatusMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan.', 401);
        const id = decodeURIComponent(guestFeedbackStatusMatch[1]);
        const body = await request.json();
        const status = String(body.status || '').trim();
        if (!['read', 'unread'].includes(status)) return bad('Status tidak valid.');
        const result = await env.DB.prepare('UPDATE guest_feedback SET status = ? WHERE id = ?').bind(status, id).run();
        if (!result.meta?.changes) return bad('Masukan tamu tidak ditemukan.', 404);
        return json({ ok:true, data:{ id, status } });
      }

      // ================= KEY ROOM (password pintu smart lock + akses crew) =================
      // Butuh migrations/migration-key-room.sql dijalankan di D1 sebelum endpoint ini dipakai.
      // Data sensitif (password pintu fisik) -- hanya Master/Admin, IT tidak diizinkan sama sekali.
      if (request.method === 'GET' && path === '/admin/key-room') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat membuka Key Room.', 403);
        try {
          const [passwordsResult, grantsResult, crewsResult] = await Promise.all([
            env.DB.prepare('SELECT * FROM door_passwords ORDER BY property_name COLLATE NOCASE').all(),
            env.DB.prepare('SELECT * FROM door_access_grants ORDER BY created_at DESC').all(),
            env.DB.prepare('SELECT id, crew_code, name, active FROM crews WHERE active = 1 ORDER BY name COLLATE NOCASE').all(),
          ]);
          return json({ ok:true, data:{
            passwords: passwordsResult.results || [],
            grants: grantsResult.results || [],
            crews: crewsResult.results || [],
          } });
        } catch (error) {
          if (/no such table: door_passwords|no such table: door_access_grants/i.test(String(error?.message || error))) {
            return bad('Key Room belum disiapkan. Jalankan migration-key-room.sql di D1.', 503);
          }
          throw error;
        }
      }

      if (request.method === 'PUT' && path === '/admin/key-room/passwords') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengubah password pintu.', 403);
        const body = await request.json();
        const propertyName = String(body.property_name || '').trim();
        const password = String(body.password || '').trim();
        const notes = String(body.notes || '').trim();
        if (!propertyName || propertyName.length > 160) return bad('Nama properti wajib diisi.');
        if (!password || password.length > 60) return bad('Password pintu wajib diisi (maks 60 karakter).');
        if (notes.length > 240) return bad('Catatan terlalu panjang.');
        const now = new Date().toISOString();
        const id = `door-${slug(propertyName)}`;
        await env.DB.prepare(`
          INSERT INTO door_passwords (id, property_name, password, notes, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(property_name) DO UPDATE SET
            password = excluded.password, notes = excluded.notes,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at
        `).bind(id, propertyName, password, notes, String(tokenData.account_id || ''), now).run();
        return json({ ok:true, data:{ id, property_name:propertyName, password, notes, updated_at:now } });
      }

      if (request.method === 'POST' && path === '/admin/key-room/grants') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengatur akses crew.', 403);
        const body = await request.json();
        const crewId = String(body.crew_id || '').trim();
        const propertyName = String(body.property_name || '').trim();
        if (!crewId || !propertyName || propertyName.length > 160) return bad('Crew dan properti wajib dipilih.');
        const crew = await env.DB.prepare('SELECT id FROM crews WHERE id = ? AND active = 1').bind(crewId).first();
        if (!crew) return bad('Crew tidak ditemukan atau tidak aktif.', 404);
        const id = crypto.randomUUID();
        try {
          await env.DB.prepare(`
            INSERT INTO door_access_grants (id, crew_id, property_name, granted_by, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).bind(id, crewId, propertyName, String(tokenData.account_id || ''), new Date().toISOString()).run();
        } catch (error) {
          if (/UNIQUE constraint failed/i.test(String(error?.message || error))) {
            return bad('Crew ini sudah punya akses ke properti tersebut.', 409);
          }
          throw error;
        }
        return json({ ok:true, data:{ id, crew_id:crewId, property_name:propertyName } }, 201);
      }

      const keyRoomGrantMatch = path.match(/^\/admin\/key-room\/grants\/([^/]+)$/);
      if (request.method === 'DELETE' && keyRoomGrantMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!hasManagementRole(tokenData)) return bad('Hanya Master atau Admin yang dapat mengatur akses crew.', 403);
        const id = decodeURIComponent(keyRoomGrantMatch[1]);
        const result = await env.DB.prepare('DELETE FROM door_access_grants WHERE id = ?').bind(id).run();
        if (!result.meta?.changes) return bad('Akses tidak ditemukan.', 404);
        return json({ ok:true, data:{ id, deleted:true } });
      }

      // POST /admin/login { password }
      if (request.method === 'POST' && path === '/admin/login') {
        const rate = await reserveLoginAttempt(env, request, 'admin-login');
        if (rate.unavailable) return bad('Tabel pembatas login belum tersedia. Jalankan migration-auth-login-rate-limits.sql di D1.', 503);
        if (rate.limited) return bad('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        const password = String(body.password || '').trim();
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();

        if (!adminSecret || !password || !constantTimeEqual(password, adminSecret)) {
          return bad('Password admin salah', 401);
        }

        await clearLoginAttempts(env, request, 'admin-login');
        return json({
          ok: true,
          token: await createAdminToken(adminSecret),
        });
      }

      // Retire the broad upsert; Dashboard management-data now owns creation.
      if (request.method === 'POST' && path === '/admin/properties') {
        return bad('Properti baru hanya dapat dibuat melalui Dashboard.', 405);
      }

      // Simpan logo website ke R2 dan setting kontak ke D1
      if (request.method === 'POST' && path === '/admin/settings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const allowedKeys = new Set([
          'header_logo', 'footer_logo', 'dashboard_logo', 'footer_location', 'footer_phone',
          'footer_email', 'footer_instagram', 'linktree_links', 'article_daily_target',
        ]);
        const key = String(body.key || '').trim();
        if (!allowedKeys.has(key)) return bad('Setting tidak dikenal');

        let value = String(body.value || '').trim();
        if (key === 'article_daily_target') {
          const tokenData = await getAdminTokenPayload(request, adminSecret);
          if (tokenData?.role !== 'Master') return bad('Hanya Master yang dapat mengubah target artikel harian.', 403);
          const target = Number(value);
          if (!Number.isInteger(target) || target < 1 || target > 50) return bad('Target artikel harian harus 1 sampai 50.');
          value = String(target);
        }
        if (key === 'linktree_links') {
          let links;
          try { links = JSON.parse(value); }
          catch { return bad('Format tautan Linktree tidak valid.'); }
          if (!Array.isArray(links) || links.length !== 10) return bad('Linktree harus berisi tepat 10 tautan.');
          const cleanedLinks = [];
          for (const link of links) {
            const label = String(link?.label || '').trim();
            const linkUrl = String(link?.url || '').trim();
            if (label.length > 80 || linkUrl.length > 2048) return bad('Judul maksimal 80 karakter dan URL maksimal 2048 karakter.');
            if (linkUrl) {
              let protocol;
              try { protocol = new URL(linkUrl).protocol; }
              catch { return bad('Salah satu URL Linktree tidak valid.'); }
              if (!['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) return bad('URL Linktree hanya boleh menggunakan http, https, mailto, atau tel.');
            }
            cleanedLinks.push({ label, url:linkUrl });
          }
          value = JSON.stringify(cleanedLinks);
        }
        if (key === 'header_logo' || key === 'footer_logo' || key === 'dashboard_logo') {
          const parsed = parseDataUrl(value);
          if (parsed.bytes.byteLength > 500 * 1024) {
            return bad('Logo wajib berukuran di bawah 500 KB');
          }
          const objectKey = `site/${key}-${crypto.randomUUID()}`;
          await env.PHOTOS.put(objectKey, parsed.bytes, {
            httpMetadata: { contentType: parsed.contentType || 'image/png' },
          });
          value = publicFileUrl(url.origin, objectKey);
        }

        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO site_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).bind(key, value, now).run();

        return json({ ok: true, data: { key, value } });
      }

      if (request.method === 'POST' && path === '/admin/properties/external-bookings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const body = await request.json();
        const id = String(body.id || '').trim();
        const externalBookings = Array.isArray(body.external_bookings)
          ? body.external_bookings.filter(item => item && item.start_date && item.end_date && item.platform)
          : [];
        if (!id) return bad('id properti wajib diisi');
        const result = await env.DB.prepare('UPDATE properties SET external_bookings = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(externalBookings), new Date().toISOString(), id).run();
        if (!result.meta?.changes) return bad('Properti tidak ditemukan', 404);
        return json({ ok: true, data: { id, external_bookings: externalBookings } });
      }

      const propertyAdminMatch = path.match(/^\/admin\/properties\/([^/]+)$/);
      if (request.method === 'PATCH' && propertyAdminMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const adminIdentity = await getAdminTokenPayload(request, adminSecret);
        if (!adminIdentity) return bad('Login admin diperlukan', 401);
        if (adminIdentity.account_id && !hasManagementRole(adminIdentity)) {
          return bad('Hanya Master atau Admin yang dapat mengubah detail properti.', 403);
        }
        const id = decodeURIComponent(propertyAdminMatch[1]);
        const current = await env.DB.prepare('SELECT id, dashboard_id, category, active, publication_status, image_url FROM properties WHERE id = ?').bind(id).first();
        if (!current) return bad('Properti tidak ditemukan', 404);
        const body = await request.json();
        const location = String(body.location || '').trim();
        const mapQuery = String(body.map_query || '').trim();
        const mapLink = String(body.map_link || '').trim();
        const mapEmbed = String(body.map_embed || '').trim();
        const description = String(body.description || '');
        const sortOrder = Number(body.sort_order ?? 0);
        const beds = Number(body.beds ?? 0);
        const baths = Number(body.baths ?? 0);
        const guests = Number(body.guests ?? 0);
        const roomOptions = Array.isArray(body.room_options) ? body.room_options : [];
        const weekdayPrice = body.weekday_price == null || body.weekday_price === '' ? null : Number(body.weekday_price);
        const weekendPrice = body.weekend_price == null || body.weekend_price === '' ? null : Number(body.weekend_price);
        const publish = body.publish === true;
        const kosPrices = roomOptions.map(room => Number(room?.price)).filter(price => Number.isSafeInteger(price) && price > 0);
        const price = current.category === 'kos'
          ? (kosPrices.length ? Math.min(...kosPrices) : 0)
          : Number(weekdayPrice || 0);
        const validRoomOptions = roomOptions.length <= 100 && roomOptions.every(room => room &&
          String(room.name || '').trim().length <= 100 && String(room.details || '').length <= 500 &&
          Number.isSafeInteger(Number(room.price)) && Number(room.price) >= 0);
        const validOptionalPrice = value => value == null || (Number.isSafeInteger(value) && value >= 0);
        if (location.length > 180 || mapQuery.length > 180 || mapLink.length > 1000 || mapEmbed.length > 1000 || description.length > 5000 ||
            !Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000 ||
            !Number.isSafeInteger(beds) || beds < 0 || beds > 100 || !Number.isSafeInteger(baths) || baths < 0 || baths > 100 ||
            !Number.isSafeInteger(guests) || guests < 0 || guests > 500 || !validRoomOptions ||
            (current.category !== 'kos' && (!validOptionalPrice(weekdayPrice) || !validOptionalPrice(weekendPrice)))) {
          return bad('Lokasi, harga, kapasitas, peta, atau detail properti tidak valid.');
        }
        if (publish) {
          const missing = [];
          if (location.length < 3) missing.push('lokasi');
          if (!current.image_url) missing.push('foto utama');
          if (guests < 1) missing.push('kapasitas tamu');
          if (current.category === 'kos') {
            if (!roomOptions.some(room => String(room.name || '').trim() && Number(room.price) > 0)) missing.push('tipe kamar dan harga');
          } else if (Number(weekdayPrice || 0) <= 0 || Number(weekendPrice || 0) <= 0) {
            missing.push('harga hari biasa dan Jumat/Sabtu');
          }
          if (missing.length) return bad(`Lengkapi ${missing.join(', ')} sebelum menampilkan properti.`, 409, { missing });
        }
        const publicationStatus = publish
          ? 'active'
          : current.publication_status === 'archived' ? 'archived' : 'draft';
        const active = publicationStatus === 'archived' ? 0 : 1;
        const now = new Date().toISOString();
        const statements = [env.DB.prepare(`
          UPDATE properties SET location = ?, price = ?, weekday_price = ?, weekend_price = ?,
            beds = ?, baths = ?, guests = ?, map_query = ?, map_link = ?, map_embed = ?,
            description = ?, room_options = ?, sort_order = ?, active = ?, publication_status = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          location, price, current.category === 'kos' ? null : weekdayPrice,
          current.category === 'kos' ? null : weekendPrice, beds, baths, guests,
          mapQuery, mapLink, mapEmbed, description, JSON.stringify(roomOptions), sortOrder, active, publicationStatus, now, id
        )];
        if (publish && current.dashboard_id) {
          const savedManagement = await env.DB.prepare(`
            SELECT data_json FROM dashboard_management_data WHERE id = 'main'
          `).first();
          if (savedManagement) {
            let managementData;
            try { managementData = JSON.parse(savedManagement.data_json); }
            catch { return bad('Data Dashboard rusak; status publikasi tidak dapat disinkronkan.', 500); }
            const managedProperty = (managementData.properties || []).find(property => property.id === current.dashboard_id);
            if (managedProperty) {
              managedProperty.active = true;
              managedProperty.publication_status = 'active';
              statements.push(env.DB.prepare(`
                UPDATE dashboard_management_data SET data_json = ?, updated_by = 'admin-website', updated_at = ?
                WHERE id = 'main'
              `).bind(JSON.stringify(managementData), now));
            }
          }
        }
        await env.DB.batch(statements);
        return json({ ok:true, data:{ id, publication_status:publicationStatus, updated_at:now } });
      }
      if (request.method === 'DELETE' && propertyAdminMatch) {
        return bad('Properti tidak dapat dihapus dari Admin Properti. Arsipkan melalui Dashboard.', 405);
      }

      const itTicketMatch = path.match(/^\/it\/tickets\/([^/]+)$/);
      if ((request.method === 'GET' && path === '/it/tickets') ||
          (request.method === 'POST' && path === '/it/tickets') ||
          (['PATCH', 'DELETE'].includes(request.method) && itTicketMatch)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const itSession = await getAdminTokenPayload(request, adminSecret);
        if (!isItSupportAccount(itSession)) return bad('Akses khusus akun IT Support diperlukan.', 403);

        // Jenis tiket. Kolom kind dibatasi CHECK ('bug','task') di D1, jadi jenis baru disimpan di kolom ticket_type
        // dan kind diisi 'task' (kolom ticket_type: migration-it-ticket-type.sql).
        const ticketTypes = ['bug', 'task', 'question', 'confirm', 'reminder', 'hidden'];

        if (request.method === 'GET') {
          try {
            const listTickets = withType => env.DB.prepare(`
              SELECT id, kind, ${withType ? 'ticket_type' : "'' AS ticket_type"}, title, description, source, reported_by, created_at,
                status, completed_by, completed_at
              FROM it_support_tickets
              ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC
              LIMIT 500
            `).all();
            const result = await listTickets(true).catch(error => {
              if (!/no such column: ticket_type/i.test(String(error?.message || error))) throw error;
              return listTickets(false);
            });
            return json({ ok:true, data:(result.results || []).map(row => ({ ...row, ticket_type:row.ticket_type || row.kind })) });
          } catch (error) {
            if (/no such table: it_support_tickets/i.test(String(error?.message || error))) {
              return bad('Tabel antrean IT belum tersedia. Jalankan properties/migration-it-support-tickets.sql di D1.', 503);
            }
            throw error;
          }
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const ticketType = String(body.kind || '').trim();
          const title = String(body.title || '').trim();
          const description = String(body.description || '').trim();
          if (!ticketTypes.includes(ticketType)) return bad('Jenis tiket tidak valid.');
          if (!title || title.length > 160) return bad('Judul wajib diisi dan maksimal 160 karakter.');
          if (!description || description.length > 4000) return bad('Catatan wajib diisi dan maksimal 4000 karakter.');
          const kind = ticketType === 'bug' ? 'bug' : 'task';
          const needsTypeColumn = !['bug', 'task'].includes(ticketType);

          const id = crypto.randomUUID();
          const createdAt = new Date().toISOString();
          try {
            if (needsTypeColumn) {
              await env.DB.prepare(`
                INSERT INTO it_support_tickets (id, kind, ticket_type, title, description, source, reported_by, created_at, status)
                VALUES (?, ?, ?, ?, ?, 'input_it', 'it', ?, 'open')
              `).bind(id, kind, ticketType, title, description, createdAt).run();
            } else {
              await env.DB.prepare(`
                INSERT INTO it_support_tickets (id, kind, title, description, source, reported_by, created_at, status)
                VALUES (?, ?, ?, ?, 'input_it', 'it', ?, 'open')
              `).bind(id, kind, title, description, createdAt).run();
            }
          } catch (error) {
            if (/no such table: it_support_tickets/i.test(String(error?.message || error))) {
              return bad('Tabel antrean IT belum tersedia. Jalankan properties/migration-it-support-tickets.sql di D1.', 503);
            }
            if (needsTypeColumn && /ticket_type/i.test(String(error?.message || error))) {
              return bad('Jenis tiket baru belum aktif. Jalankan migrations/migration-it-ticket-type.sql di D1.', 503);
            }
            throw error;
          }
          return json({ ok:true, data:{ id, kind, ticket_type:ticketType, title, description, source:'input_it', reported_by:'it', created_at:createdAt, status:'open' } }, 201);
        }

        const id = decodeURIComponent(itTicketMatch[1]);
        const existing = await env.DB.prepare('SELECT id FROM it_support_tickets WHERE id = ?').bind(id).first();
        if (!existing) return bad('Tiket tidak ditemukan.', 404);
        if (request.method === 'DELETE') {
          const deleted = await env.DB.prepare('DELETE FROM it_support_tickets WHERE id = ?').bind(id).run();
          if (!deleted.meta?.changes) return bad('Tiket tidak ditemukan.', 404);
          return json({ ok:true, data:{ id, deleted:true } });
        }

        const body = await request.json();
        const hasEditFields = ['kind', 'title', 'description'].some(field => Object.prototype.hasOwnProperty.call(body, field));
        if (hasEditFields) {
          const ticketType = String(body.kind || '').trim();
          const title = String(body.title || '').trim();
          const description = String(body.description || '').trim();
          if (!ticketTypes.includes(ticketType)) return bad('Jenis tiket tidak valid.');
          if (!title || title.length > 160) return bad('Judul wajib diisi dan maksimal 160 karakter.');
          if (!description || description.length > 4000) return bad('Catatan wajib diisi dan maksimal 4000 karakter.');
          const kind = ticketType === 'bug' ? 'bug' : 'task';
          try {
            await env.DB.prepare(`
              UPDATE it_support_tickets SET kind = ?, ticket_type = ?, title = ?, description = ? WHERE id = ?
            `).bind(kind, ticketType, title, description, id).run();
          } catch (error) {
            if (!/ticket_type/i.test(String(error?.message || error))) throw error;
            // Kolom ticket_type belum ada: hanya Bug/Tugas yang bisa disimpan.
            if (!['bug', 'task'].includes(ticketType)) {
              return bad('Jenis tiket baru belum aktif. Jalankan migrations/migration-it-ticket-type.sql di D1.', 503);
            }
            await env.DB.prepare(`
              UPDATE it_support_tickets SET kind = ?, title = ?, description = ? WHERE id = ?
            `).bind(kind, title, description, id).run();
          }
          return json({ ok:true, data:{ id, kind, ticket_type:ticketType, title, description } });
        }

        const status = String(body.status || '').trim();
        if (!['open', 'done'].includes(status)) return bad('Status tiket tidak valid.');
        const completedAt = status === 'done' ? new Date().toISOString() : null;
        await env.DB.prepare(`
          UPDATE it_support_tickets
          SET status = ?, completed_by = ?, completed_at = ?
          WHERE id = ?
        `).bind(status, status === 'done' ? 'it' : '', completedAt, id).run();
        return json({ ok:true, data:{ id, status, completed_by:status === 'done' ? 'it' : '', completed_at:completedAt } });
      }

      // Percakapan per tiket -- dipakai IT Support (akses semua tiket) dan pelapor (hanya
      // tiketnya sendiri, lihat lapor-it.html) supaya bisa saling balas sampai tiket selesai.
      const ticketMessagesMatch = path.match(/^\/it\/tickets\/([^/]+)\/messages$/);
      if (ticketMessagesMatch && ['GET', 'POST'].includes(request.method)) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id) return bad('Login diperlukan.', 401);
        const ticketId = decodeURIComponent(ticketMessagesMatch[1]);
        const ticket = await env.DB.prepare('SELECT id, reported_by FROM it_support_tickets WHERE id = ?').bind(ticketId).first();
        if (!ticket) return bad('Tiket tidak ditemukan.', 404);
        const isIt = isItSupportAccount(tokenData);
        const isReporter = tokenData.role !== 'IT' && tokenData.account_id === ticket.reported_by;
        if (!isIt && !isReporter) return bad('Anda tidak memiliki akses ke tiket ini.', 403);

        if (request.method === 'GET') {
          try {
            const result = await env.DB.prepare(`
              SELECT id, sender_account_id, sender_label, sender_role, message, created_at
              FROM it_support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC
            `).bind(ticketId).all();
            // Pelapor membuka tiketnya sendiri -- tandai sudah dibaca supaya lampu notifikasi mati.
            if (isReporter) {
              try {
                await env.DB.prepare('UPDATE it_support_tickets SET reporter_last_seen_at = ? WHERE id = ?')
                  .bind(new Date().toISOString(), ticketId).run();
              } catch (error) {
                if (!/no such column: reporter_last_seen_at/i.test(String(error?.message || error))) throw error;
              }
            }
            return json({ ok:true, data:result.results || [] });
          } catch (error) {
            if (/no such table: it_support_ticket_messages/i.test(String(error?.message || error))) {
              return bad('Percakapan tiket belum disiapkan. Jalankan migration-it-ticket-messages.sql di D1.', 503);
            }
            throw error;
          }
        }

        const body = await request.json();
        const message = String(body.message || '').trim();
        if (!message || message.length > 2000) return bad('Pesan wajib diisi dan maksimal 2000 karakter.');
        let senderLabel = 'IT Support';
        if (!isIt) {
          const account = await env.DB.prepare('SELECT display_name FROM dashboard_users WHERE account_id = ?').bind(tokenData.account_id).first();
          senderLabel = account?.display_name || tokenData.account_id;
        }
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        try {
          await env.DB.prepare(`
            INSERT INTO it_support_ticket_messages (id, ticket_id, sender_account_id, sender_label, sender_role, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(id, ticketId, tokenData.account_id, senderLabel, tokenData.role || '', message, now).run();
        } catch (error) {
          if (/no such table: it_support_ticket_messages/i.test(String(error?.message || error))) {
            return bad('Percakapan tiket belum disiapkan. Jalankan migration-it-ticket-messages.sql di D1.', 503);
          }
          throw error;
        }

        // IT membalas -- catat waktunya supaya lampu notifikasi pelapor di admin_yourhome menyala
        // merah sampai pelapor membuka tiket ini (lihat GET di atas yang menandai reporter_last_seen_at).
        if (isIt) {
          try {
            await env.DB.prepare('UPDATE it_support_tickets SET last_it_reply_at = ? WHERE id = ?').bind(now, ticketId).run();
          } catch (error) {
            if (!/no such column: last_it_reply_at/i.test(String(error?.message || error))) throw error;
          }
        }

        if (!isIt) {
          const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
          const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
          if (telegramToken && telegramChatId) {
            try {
              await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method:'POST', headers:{ 'Content-Type':'application/json' },
                body:JSON.stringify({ chat_id:telegramChatId, text:`BALASAN TIKET IT\nDari: ${senderLabel}\nTiket: ${ticketId}\n\n${message}` }),
              });
            } catch {
              // Jangan gagalkan pengiriman pesan hanya karena notifikasi Telegram gagal.
            }
          }
        }

        return json({ ok:true, data:{ id, ticket_id:ticketId, sender_account_id:tokenData.account_id, sender_label:senderLabel, sender_role:tokenData.role || '', message, created_at:now } }, 201);
      }

      // Lampu notifikasi kartu "Lapor ke IT Support" di hub admin_yourhome -- merah kalau ada
      // balasan IT yang belum dibuka pelapor (dicek lewat GET /it/tickets/{id}/messages).
      if (request.method === 'GET' && path === '/my-it-tickets/unread-count') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || tokenData.role === 'IT') return bad('Login diperlukan.', 401);
        try {
          const row = await env.DB.prepare(`
            SELECT COUNT(*) AS count FROM it_support_tickets
            WHERE reported_by = ? AND last_it_reply_at <> ''
              AND (reporter_last_seen_at = '' OR last_it_reply_at > reporter_last_seen_at)
          `).bind(tokenData.account_id).first();
          return json({ ok:true, data:{ count:Number(row?.count || 0) } });
        } catch (error) {
          if (/no such column: last_it_reply_at|no such table: it_support_tickets/i.test(String(error?.message || error))) {
            return json({ ok:true, data:{ count:0 } });
          }
          throw error;
        }
      }

      // Daftar tiket milik pelapor sendiri (lapor-it.html) -- bukan akun IT, hanya tiket yang
      // reported_by miliknya sendiri yang terlihat.
      if (request.method === 'GET' && path === '/my-it-tickets') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || tokenData.role === 'IT') return bad('Login diperlukan.', 401);
        try {
          const result = await env.DB.prepare(`
            SELECT id, kind, title, description, created_at, status, completed_at
            FROM it_support_tickets WHERE reported_by = ? ORDER BY created_at DESC LIMIT 100
          `).bind(tokenData.account_id).all();
          return json({ ok:true, data:result.results || [] });
        } catch (error) {
          if (/no such table: it_support_tickets/i.test(String(error?.message || error))) {
            return bad('Tabel antrean IT belum tersedia. Jalankan properties/migration-it-support-tickets.sql di D1.', 503);
          }
          throw error;
        }
      }

      // Terima laporan bug atau pesan dari admin properti
      if (request.method === 'POST' && path === '/admin/contact-it') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const adminIdentity = await getAdminTokenPayload(request, adminSecret);
        if (!adminIdentity || adminIdentity.role === 'IT') {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const message = String(body.message || '').trim();
        const submittedTitle = String(body.title || '').trim();
        if (!message || message.length > 2000) {
          return bad('Pesan wajib diisi dan maksimal 2000 karakter');
        }
        if (submittedTitle.length > 160) return bad('Judul maksimal 160 karakter.');

        const telegramToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
        const telegramChatId = String(env.TELEGRAM_CHAT_ID || '').trim();
        if (!telegramToken || !telegramChatId) {
          return bad('Telegram IT belum dikonfigurasi di Worker', 503);
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        try {
          await env.DB.prepare(`
            INSERT INTO contact_messages (id, message, status, created_at)
            VALUES (?, ?, 'unread', ?)
          `).bind(id, message, createdAt).run();
        } catch (error) {
          if (!isMissingContactStatusColumn(error)) throw error;
          await env.DB.prepare(`
            INSERT INTO contact_messages (id, message, created_at)
            VALUES (?, ?, ?)
          `).bind(id, message, createdAt).run();
        }

        const ticketTitle = submittedTitle || message.split(/\r?\n/, 1)[0].trim().slice(0, 160) || 'Laporan dari Lapor Bug';
        const ticketId = crypto.randomUUID();
        try {
          await env.DB.prepare(`
            INSERT INTO it_support_tickets (id, kind, title, description, source, reported_by, created_at, status)
            VALUES (?, 'bug', ?, ?, 'lapor_bug', ?, ?, 'open')
          `).bind(ticketId, ticketTitle, message, adminIdentity.account_id || adminIdentity.role || 'staf', createdAt).run();
        } catch (error) {
          if (/no such table: it_support_tickets/i.test(String(error?.message || error))) {
            return bad('Tabel antrean IT belum tersedia. Jalankan properties/migration-it-support-tickets.sql di D1.', 503);
          }
          throw error;
        }

        const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `LAPOR BUG YOUR HOME\nJudul: ${ticketTitle}\n\n${message}\n\n${createdAt}`,
          }),
        });
        const telegramResult = await telegramResponse.json().catch(() => ({}));
        if (!telegramResponse.ok || telegramResult.ok !== true) {
          return bad('Pesan tersimpan, tetapi gagal dikirim ke Telegram', 502);
        }

        return json({ ok: true, data: { id, ticket_id: ticketId, created_at: createdAt } });
      }

      // Baca dan ubah status history Contact IT
      if (request.method === 'GET' && path === '/admin/contact-it') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        let result;
        try {
          result = await env.DB
            .prepare('SELECT id, message, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 100')
            .all();
        } catch (error) {
          if (!isMissingContactStatusColumn(error)) throw error;
          result = await env.DB
            .prepare('SELECT id, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 100')
            .all();
          return json({
            ok: true,
            data: (result.results || []).map(row => ({ ...row, status: 'unread' })),
          });
        }
        return json({ ok: true, data: result.results || [] });
      }

      const contactStatusMatch = path.match(/^\/admin\/contact-it\/([^/]+)$/);
      if (request.method === 'PATCH' && contactStatusMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const body = await request.json();
        const status = String(body.status || '').trim();
        if (!['unread', 'process', 'done'].includes(status)) return bad('Status tidak valid');
        const id = decodeURIComponent(contactStatusMatch[1]);
        try {
          await env.DB.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').bind(status, id).run();
        } catch (error) {
          if (!isMissingContactStatusColumn(error)) throw error;
          return bad('Kolom status pesan belum tersedia di D1; perubahan status tidak dapat disimpan.', 409);
        }
        return json({ ok: true, data: { id, status } });
      }

      if (request.method === 'DELETE' && contactStatusMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const id = decodeURIComponent(contactStatusMatch[1]);
        await env.DB.prepare('DELETE FROM contact_messages WHERE id = ?').bind(id).run();
        return json({ ok: true, data: { id } });
      }

      // Upload foto galeri properti ke R2 dan simpan URL-nya di D1
      if (request.method === 'POST' && path === '/admin/properties/images') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const adminIdentity = await getAdminTokenPayload(request, adminSecret);
        if (!adminIdentity) return bad('Login admin diperlukan', 401);
        if (adminIdentity.account_id && !hasManagementRole(adminIdentity)) {
          return bad('Hanya Master atau Admin yang dapat mengubah foto properti.', 403);
        }

        const body = await request.json();
        const id = String(body.id || '').trim();
        const mainImage = String(body.main_image || '').trim();
        const existingMainUrl = String(body.existing_main_url || '').trim();
        const images = Array.isArray(body.images) ? body.images : [];
        const existingUrls = Array.isArray(body.existing_urls)
          ? body.existing_urls.filter(value => typeof value === 'string' && value.trim())
          : [];
        const replaceGallery = body.replace_gallery === true;

        if (!id || images.length > 20) {
          return bad('id wajib dan maksimal 20 foto galeri per upload');
        }

        const existing = await env.DB
          .prepare('SELECT id FROM properties WHERE id = ?')
          .bind(id)
          .first();
        if (!existing) return bad('Properti tidak ditemukan', 404);

        let mainUrl = existingMainUrl;
        if (mainImage) {
          const parsedMain = parseDataUrl(mainImage);
          if (parsedMain.bytes.byteLength > 100 * 1024) {
            return bad('Foto utama wajib berukuran di bawah 100 KB');
          }
          const mainKey = `properties/${slug(id)}/main-${crypto.randomUUID()}.jpg`;
          await env.PHOTOS.put(mainKey, parsedMain.bytes, {
            httpMetadata: { contentType: parsedMain.contentType || 'image/jpeg' },
          });
          mainUrl = publicFileUrl(url.origin, mainKey);
        }

        const uploadedUrls = [];
        for (const image of images) {
          const parsed = parseDataUrl(image);
          if (parsed.bytes.byteLength > 100 * 1024) {
            return bad('Setiap foto wajib berukuran di bawah 100 KB');
          }
          const key = `properties/${slug(id)}/${crypto.randomUUID()}.jpg`;
          await env.PHOTOS.put(key, parsed.bytes, {
            httpMetadata: { contentType: parsed.contentType || 'image/jpeg' },
          });
          uploadedUrls.push(publicFileUrl(url.origin, key));
        }

        const now = new Date().toISOString();
        if (mainImage) {
          await env.DB
            .prepare('UPDATE properties SET image_url = ?, updated_at = ? WHERE id = ?')
            .bind(mainUrl, now, id)
            .run();
        }
        const imageUrls = [...existingUrls, ...uploadedUrls];
        if (images.length || replaceGallery) {
          await env.DB
            .prepare('UPDATE properties SET image_urls = ?, updated_at = ? WHERE id = ?')
            .bind(JSON.stringify(imageUrls), now, id)
            .run();
        }

        return json({ ok: true, id, image_url: mainImage ? mainUrl : existingMainUrl, image_urls: images.length || replaceGallery ? imageUrls : undefined });
      }

      // POST /login { crew_id, pin }
      if (request.method === 'POST' && path === '/login') {
        const rate = await reserveLoginAttempt(env, request, 'crew-login');
        if (rate.unavailable) return bad('Tabel pembatas login belum tersedia. Jalankan migration-auth-login-rate-limits.sql di D1.', 503);
        if (rate.limited) return bad('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!adminSecret) return bad('Secret sesi Worker belum dikonfigurasi.', 503);
        const body = await request.json();
        const crewCode = String(body.crew_id || '').trim();
        const pin = String(body.pin || '').trim();

        if (!crewCode || !pin) {
          return bad('ID Crew dan PIN wajib diisi.');
        }

        let row;
        try {
          row = await env.DB.prepare(`
            SELECT id, crew_code, name, pin_hash, active FROM crews
            WHERE crew_code = ? COLLATE NOCASE AND active = 1
          `).bind(crewCode).first();
        } catch (error) {
          if (/no such column: crew_code/i.test(String(error?.message || error))) return bad('ID Crew belum tersedia. Jalankan migration-crew-id.sql di D1.', 503);
          throw error;
        }

        if (!row) {
          return bad('PIN salah atau crew tidak aktif', 401);
        }

        const hash = await sha256Hex(pin);
        const impersonationSecret = String(env.DEV_IMPERSONATION_SECRET || '').trim();
        const impersonationEnabled = String(env.ALLOW_DEV_IMPERSONATION || '').trim() === '1' && Boolean(impersonationSecret);
        const validCrewPin = constantTimeEqual(hash, row.pin_hash);
        const validImpersonation = impersonationEnabled && constantTimeEqual(pin, impersonationSecret);
        if (!validCrewPin && !validImpersonation) {
          return bad('PIN salah atau crew tidak aktif', 401);
        }

        await clearLoginAttempts(env, request, 'crew-login');
        return json({
          ok: true,
          crew: row.name,
          crew_id: row.crew_code,
          token: await createCrewToken(adminSecret, row.name),
        });
      }

      // POST /admin/set-pin { name, pin, admin_pin }
      if (request.method === 'POST' && path === '/admin/set-pin') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const pin = String(body.pin || '').trim();
        const masterPin = String(body.admin_pin || '').trim();

        if (name.length < 2 || name.length > 80 || !/^\d{6}$/.test(pin)) {
          return bad('Nama crew dan PIN tepat 6 digit wajib diisi.');
        }
        if (!/^\d{4}$/.test(masterPin)) return bad('PIN Master tepat 4 digit wajib diisi.', 400);

        const master = await env.DB.prepare(`
          SELECT delete_pin_salt, delete_pin_hash FROM dashboard_users
          WHERE account_id = 'master' AND active = 1
        `).first();
        if (!master?.delete_pin_hash) return bad('PIN Master belum diinisialisasi. Login sebagai Master terlebih dahulu.', 409);
        const attemptedMasterPin = await hashDashboardPassword(masterPin, master.delete_pin_salt);
        if (!constantTimeEqual(attemptedMasterPin, master.delete_pin_hash)) return bad('PIN Master salah.', 403);

        const pinHash = await sha256Hex(pin);
        const existing = await env.DB
          .prepare('SELECT id, crew_code FROM crews WHERE name = ? COLLATE NOCASE')
          .bind(name)
          .first();

        if (existing) {
          await env.DB
            .prepare('UPDATE crews SET pin_hash = ?, active = 1 WHERE id = ?')
            .bind(pinHash, existing.id)
            .run();
          return json({ ok: true, data: { id: existing.id, name, crew_code: existing.crew_code } });
        }

        const id = crypto.randomUUID();
        const crewCode = `CR-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        await env.DB
          .prepare('INSERT INTO crews (id, crew_code, name, pin_hash, active) VALUES (?, ?, ?, ?, 1)')
          .bind(id, crewCode, name, pinHash)
          .run();

        return json({ ok: true, data: { id, name, crew_code: crewCode } });
      }

      if (request.method === 'POST' && path === '/owner/login') {
        const rate = await reserveLoginAttempt(env, request, 'owner-login');
        if (rate.unavailable) return bad('Tabel pembatas login belum tersedia. Jalankan migration-auth-login-rate-limits.sql di D1.', 503);
        if (rate.limited) return bad('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', 429);
        const body = await request.json();
        const ownerId = String(body.owner_id || '').trim();
        const password = String(body.password || '');
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!adminSecret || !/^[A-Za-z0-9_-]{1,80}$/.test(ownerId) || !password || password.length > 256) {
          return bad('ID Owner atau password tidak valid.', 401);
        }
        let account;
        try {
          account = await env.DB.prepare(`
            SELECT owner_id, password_salt, password_hash, active
            FROM owner_portal_accounts WHERE owner_id = ?
          `).bind(ownerId).first();
        } catch (error) {
          if (/no such table: owner_portal_accounts/i.test(String(error?.message || error))) {
            return bad('Akses Owner Portal belum disiapkan. Jalankan migration-owner-portal-accounts.sql di D1.', 503);
          }
          throw error;
        }
        if (!account?.active) return bad('ID Owner atau password salah.', 401);
        const attemptedHash = await hashDashboardPassword(password, account.password_salt);
        if (!constantTimeEqual(attemptedHash, account.password_hash)) return bad('ID Owner atau password salah.', 401);
        let ownerName = '';
        try {
          const management = await env.DB.prepare(`
            SELECT data_json FROM dashboard_management_data WHERE id = 'main'
          `).first();
          const managementData = management ? JSON.parse(management.data_json) : null;
          ownerName = String((managementData?.owners || []).find(owner => owner?.id === ownerId)?.name || '').trim();
        } catch {}
        await clearLoginAttempts(env, request, 'owner-login');
        return json({ ok:true, token:await createOwnerToken(adminSecret, ownerId), expires_in:24 * 60 * 60, data:{ owner_id:ownerId, owner_name:ownerName } });
      }

      if (request.method === 'GET' && path === '/owner/reports') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const ownerSession = await getOwnerTokenPayload(request, adminSecret);
        if (ownerSession) {
          const account = await env.DB.prepare('SELECT owner_id FROM owner_portal_accounts WHERE owner_id = ? AND active = 1').bind(ownerSession.owner_id).first();
          if (!account) return bad('Akses Owner tidak aktif.', 401);
          const result = await env.DB.prepare(`
            SELECT id, owner_id, owner_name, period_month, status, created_at, updated_at
            FROM dashboard_owner_share_calculations
            WHERE owner_id = ? AND status = 'final'
            ORDER BY period_month DESC
          `).bind(ownerSession.owner_id).all();
          return json({ ok:true, data:result.results || [] });
        }
        // Portal Owner memakai satu password bersama: token staf boleh membaca daftar
        // pemilik agar halaman dapat menampilkan pilihan owner.
        const staffToken = await getAdminTokenPayload(request, adminSecret);
        if (staffToken && (hasManagementRole(staffToken) || !staffToken.account_id)) {
          const requestedOwner = String(url.searchParams.get('owner_id') || '').trim();
          if (requestedOwner) {
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(requestedOwner)) return bad('Owner tidak valid.', 400);
            const owned = await env.DB.prepare(`
              SELECT id, owner_id, owner_name, period_month, status, created_at, updated_at
              FROM dashboard_owner_share_calculations
              WHERE owner_id = ? AND status = 'final'
              ORDER BY period_month DESC
            `).bind(requestedOwner).all();
            return json({ ok:true, data:owned.results || [] });
          }
          const result = await env.DB.prepare(`
            SELECT owner_id, MAX(owner_name) AS owner_name, COUNT(*) AS report_count, MAX(period_month) AS latest_month
            FROM dashboard_owner_share_calculations
            WHERE status = 'final'
            GROUP BY owner_id
            ORDER BY owner_name COLLATE NOCASE
          `).all();
          return json({ ok:true, data:result.results || [] });
        }
        return bad('Login Owner diperlukan.', 401);
      }

      const ownerReportMatch = path.match(/^\/owner\/reports\/(\d{4}-(?:0[1-9]|1[0-2]))$/);
      if (request.method === 'GET' && ownerReportMatch) {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const ownerSession = await getOwnerTokenPayload(request, adminSecret);
        let targetOwnerId = ownerSession?.owner_id || '';
        if (ownerSession) {
          const account = await env.DB.prepare('SELECT owner_id FROM owner_portal_accounts WHERE owner_id = ? AND active = 1').bind(targetOwnerId).first();
          if (!account) return bad('Akses Owner tidak aktif.', 401);
        } else {
          const staffToken = await getAdminTokenPayload(request, adminSecret);
          if (!staffToken || !(hasManagementRole(staffToken) || !staffToken.account_id)) return bad('Login Owner diperlukan.', 401);
          targetOwnerId = String(url.searchParams.get('owner_id') || '').trim();
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(targetOwnerId)) return bad('Pilih pemilik terlebih dahulu.', 400);
        }
        const saved = await env.DB.prepare(`
          SELECT id, owner_name, period_month, calculation_json, created_at, updated_at
          FROM dashboard_owner_share_calculations
          WHERE owner_id = ? AND period_month = ? AND status = 'final'
        `).bind(targetOwnerId, ownerReportMatch[1]).first();
        if (!saved) return bad('Laporan tidak ditemukan.', 404);
        let calculation;
        try { calculation = JSON.parse(saved.calculation_json); }
        catch { return bad('Data laporan tidak dapat dibaca.', 500); }
        return json({ ok:true, data:{ id:saved.id, owner_name:saved.owner_name, period_month:saved.period_month, created_at:saved.created_at, updated_at:saved.updated_at, calculation } });
      }

      if (request.method === 'POST' && path === '/admin/owner-portal/password') {
        const tokenData = await getAdminTokenPayload(request, String(env.ADMIN_DASHBOARD_SECRET || '').trim());
        if (!hasManagementRole(tokenData)) {
          return bad('Hanya Master atau Admin yang dapat mengatur akses Owner Portal.', 403);
        }
        const body = await request.json();
        const currentOwnerId = String(body.current_owner_id || body.owner_id || '').trim();
        const ownerId = String(body.owner_id || '').trim();
        const password = String(body.password || '');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(currentOwnerId) || !/^[A-Za-z0-9_-]{1,80}$/.test(ownerId) || password.length < 12 || password.length > 256) {
          return bad('ID Owner dan password 12-256 karakter wajib valid.');
        }
        const management = await env.DB.prepare(`SELECT data_json FROM dashboard_management_data WHERE id = 'main'`).first();
        if (!management) return bad('Data Owner belum tersedia di Dashboard.', 503);
        let managementData;
        try { managementData = JSON.parse(management.data_json); }
        catch { return bad('Data Owner Dashboard tidak dapat dibaca.', 500); }
        const currentOwner = (managementData.owners || []).find(owner => owner?.id === currentOwnerId);
        if (!currentOwner) return bad('Owner tidak ditemukan di Dashboard.', 404);
        if (ownerId !== currentOwnerId && (managementData.owners || []).some(owner => owner?.id === ownerId)) {
          return bad('ID Owner baru sudah digunakan.', 409);
        }
        if (ownerId !== currentOwnerId) {
          let existingAccount;
          let existingReport;
          try {
            [existingAccount, existingReport] = await Promise.all([
              env.DB.prepare('SELECT owner_id FROM owner_portal_accounts WHERE owner_id = ?').bind(ownerId).first(),
              env.DB.prepare('SELECT id FROM dashboard_owner_share_calculations WHERE owner_id = ?').bind(ownerId).first(),
            ]);
          } catch (error) {
            if (/no such table: owner_portal_accounts/i.test(String(error?.message || error))) {
              return bad('Akses Owner Portal belum disiapkan. Jalankan migration-owner-portal-accounts.sql di D1.', 503);
            }
            throw error;
          }
          if (existingAccount || existingReport) return bad('ID Owner baru sudah digunakan.', 409);
          managementData.owners = managementData.owners.map(owner => owner.id === currentOwnerId ? { ...owner, id:ownerId } : owner);
          managementData.properties = (managementData.properties || []).map(property => ({
            ...property,
            owners:(property.owners || []).map(owner => owner.id === currentOwnerId ? { ...owner, id:ownerId } : owner),
          }));
        }
        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await hashDashboardPassword(password, salt);
        const now = new Date().toISOString();
        try {
          const [reportResult, targetReportResult] = await Promise.all([
            env.DB.prepare(`
              SELECT id, owner_id, period_month, calculation_json
              FROM dashboard_owner_share_calculations
              WHERE owner_id = ? OR (owner_name = ? AND owner_id <> ?)
            `).bind(currentOwnerId, currentOwner.name, ownerId).all(),
            env.DB.prepare(`
              SELECT period_month FROM dashboard_owner_share_calculations WHERE owner_id = ?
            `).bind(ownerId).all(),
          ]);
          const existingMonths = new Set((targetReportResult.results || []).map(report => report.period_month));
          const reportStatements = (reportResult.results || [])
            .filter(report => report.owner_id !== ownerId && !existingMonths.has(report.period_month))
            .map(report => {
            let calculation = {};
            try { calculation = JSON.parse(report.calculation_json); } catch {}
            calculation.ownerId = ownerId;
            return env.DB.prepare('UPDATE dashboard_owner_share_calculations SET owner_id = ?, calculation_json = ?, updated_at = ? WHERE id = ?')
              .bind(ownerId, JSON.stringify(calculation), now, report.id);
            });
          const statements = [env.DB.prepare(`
            INSERT INTO owner_portal_accounts (owner_id, password_salt, password_hash, active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(owner_id) DO UPDATE SET password_salt = excluded.password_salt, password_hash = excluded.password_hash, active = 1, updated_at = excluded.updated_at
          `).bind(ownerId, salt, hash, now, now),
          env.DB.prepare('UPDATE dashboard_management_data SET data_json = ?, updated_by = ?, updated_at = ? WHERE id = \'main\'')
            .bind(JSON.stringify(managementData), tokenData.account_id, now),
          ...reportStatements];
          if (ownerId !== currentOwnerId) statements.push(env.DB.prepare('DELETE FROM owner_portal_accounts WHERE owner_id = ?').bind(currentOwnerId));
          await env.DB.batch(statements);
        } catch (error) {
          if (/no such table: owner_portal_accounts/i.test(String(error?.message || error))) {
            return bad('Akses Owner Portal belum disiapkan. Jalankan migration-owner-portal-accounts.sql di D1.', 503);
          }
          throw error;
        }
        return json({ ok:true, data:{ owner_id:ownerId } });
      }

      return bad('Endpoint tidak ditemukan', 404);
    } catch (error) {
      console.error(error);
      return json({
        ok: false,
        error: String(error?.message || error),
      }, 500);
    }
  },
};
