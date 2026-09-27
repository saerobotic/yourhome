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
    'Access-Control-Allow-Origin': ['https://yourhome.id', 'https://admin.yourhome.id', 'https://owner.yourhome.id'].includes(origin) || isLocalOrigin
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
      statements.push(env.DB.prepare(`
        UPDATE properties
        SET dashboard_id = ?, property_code = ?, name = ?, category = ?, active = ?, publication_status = ?, updated_at = ?
        WHERE id = ?
      `).bind(dashboardId, code, name, category, publicationStatus === 'archived' ? 0 : 1, publicationStatus, now, row.id));
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

  for (const [key, { crew, workDate }] of pairsByKey) {
    const units = new Map();
    for (const row of checkinsByPair.get(key) || []) {
      const unit = String(row.unit || '').trim();
      if (!unit) continue;
      if (!units.has(unit)) units.set(unit, new Set());
      const jobType = String(row.job_type || '').trim();
      if (jobType) units.get(unit).add(jobType);
    }

    const sortedUnits = [...units.keys()].sort((left, right) => left.localeCompare(right, 'id'));
    const baseAmount = sortedUnits.length ? Math.floor(100000 / sortedUnits.length) : 0;
    const remainder = sortedUnits.length ? 100000 - baseAmount * sortedUnits.length : 0;
    const expectedIds = new Set();

    for (const [index, unit] of sortedUnits.entries()) {
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
        baseAmount + (index < remainder ? 1 : 0), description, crew, now
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

async function isAdminRequest(request, secret) {
  const tokenData = await getAdminTokenPayload(request, secret);
  return Boolean(tokenData && tokenData.role !== 'IT');
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
      if (request.method === 'GET' && path === '/properties') {
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
            WHERE LOWER(TRIM(status)) NOT IN ('cancelled', 'canceled')
          `).all(),
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
        const publishedResult = await env.DB.prepare(`
          SELECT dashboard_id, name FROM properties
          WHERE active = 1 AND publication_status = 'active'
        `).all();
        const publishedIds = new Set((publishedResult.results || []).map(property => property.dashboard_id).filter(Boolean));
        const publishedNames = new Set((publishedResult.results || []).map(property => String(property.name || '').trim().toLocaleLowerCase('id')));
        const seenNames = new Set();
        const properties = (Array.isArray(managementData.properties) ? managementData.properties : [])
          .filter(property => property && property.active !== false && property.active !== 0 && typeof property.name === 'string' && property.name.trim())
          .filter(property => publishedIds.has(String(property.id || '')) || publishedNames.has(property.name.trim().toLocaleLowerCase('id')))
          .filter(property => {
            const key = property.name.trim().toLocaleLowerCase('id');
            if (seenNames.has(key)) return false;
            seenNames.add(key);
            return true;
          })
          .sort((left, right) => left.name.localeCompare(right.name, 'id'))
          .map(property => ({ id:String(property.id || ''), name:property.name.trim(), type:String(property.type || property.category || '') }));
        return json({ ok:true, data:properties });
      }

      // Ambil logo dan kontak website untuk halaman publik
      if (request.method === 'GET' && path === '/settings') {
        const result = await env.DB.prepare(`
          SELECT key, value FROM site_settings
          WHERE key IN ('header_logo', 'footer_logo', 'dashboard_logo', 'footer_location', 'footer_phone', 'footer_email', 'footer_instagram')
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

        if (!crew || !unit || !jobType || !workDate) {
          return bad(
            'crew, unit, job_type, work_date wajib diisi'
          );
        }

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
        const unit = String(body.unit || '').trim();
        const jobType = String(body.job_type || body.jobType || '').trim();
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

        if (!crew || !unit || !jobType) {
          return bad('crew, unit, job_type wajib');
        }

        if (unit.length > 180 || jobType.length > 120) {
          return bad('unit atau job_type terlalu panjang');
        }

        if (workDate && !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
          return bad('Tanggal kerja tidak valid.');
        }

        if (lat == null || lng == null) {
          return bad('GPS wajib');
        }

        const numericLat = Number(lat);
        const numericLng = Number(lng);
        const numericAccuracy = accuracy == null || accuracy === '' ? null : Number(accuracy);

        if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng) ||
            numericLat < -90 || numericLat > 90 || numericLng < -180 || numericLng > 180) {
          return bad('Koordinat GPS tidak valid');
        }

        if (numericAccuracy != null && (!Number.isFinite(numericAccuracy) || numericAccuracy < 0)) {
          return bad('Akurasi GPS tidak valid');
        }

        if (!selfie) {
          return bad('selfie wajib');
        }

        if (!Array.isArray(workPhotos) || workPhotos.length === 0) {
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

        // Upload selfie
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

        const selfieUrl = publicFileUrl(
          origin,
          selfieKey
        );

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
          if (!account) return bad('Akun tidak ditemukan atau tidak aktif.', 404);
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
        const result = await env.DB.prepare(`
          SELECT account_id, display_name, email, role, active FROM dashboard_users
          WHERE active = 1 ORDER BY CASE account_id WHEN 'master' THEN 0 ELSE 1 END
        `).all();
        return json({ ok: true, data: result.results || [] });
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
            result = await env.DB.prepare('SELECT id, crew_code, name, active FROM crews ORDER BY active DESC, name COLLATE NOCASE ASC').all();
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
          const pinHash = await sha256Hex(pin);
          if (existingName) {
            const restoredCrewCode = crewCode || existingName.crew_code;
            await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ?, pin_hash = ?, active = 1 WHERE id = ?')
              .bind(restoredCrewCode, name, pinHash, existingName.id).run();
            return json({ ok:true, data:{ id:existingName.id, crew_code:restoredCrewCode, name, active:1 } });
          }
          const id = crypto.randomUUID();
          const generatedCrewCode = crewCode || `CR-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
          await env.DB.prepare('INSERT INTO crews (id, crew_code, name, pin_hash, active) VALUES (?, ?, ?, ?, 1)')
            .bind(id, generatedCrewCode, name, pinHash).run();
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
        const crew = await env.DB.prepare('SELECT id, crew_code, name, active FROM crews WHERE id = ?').bind(id).first();
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
        if (pin) {
          await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ?, pin_hash = ? WHERE id = ?')
            .bind(crewCode, name, await sha256Hex(pin), id).run();
        } else {
          await env.DB.prepare('UPDATE crews SET crew_code = ?, name = ? WHERE id = ?').bind(crewCode, name, id).run();
        }
        return json({ ok:true, data:{ id, crew_code:crewCode, name, active:Number(crew.active) } });
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
              SELECT data_json FROM dashboard_management_data WHERE id = 'main'
            `).first();
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
            String(row.additionalDeductionLabel || '').length <= 60;
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
          if (!rows.every(rowIsValid) || !rows.every(detailListsAreValid) || !rows.every(detailsAreReconciled) || !totalFields.every(field => validAmount(totals[field])) || !Number.isSafeInteger(Number(totals.bookingCount)) || Number(totals.bookingCount) < 0) {
            return bad('Rincian nominal atau persentase laporan tidak valid.');
          }
          const calculationJson = JSON.stringify({ ownerId, ownerName, month, rows, totals });
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

      if (request.method === 'GET' && path === '/dashboard/bookings') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        const tokenData = await getAdminTokenPayload(request, adminSecret);
        if (!tokenData?.account_id || !hasDashboardRole(tokenData)) return bad('Login dashboard diperlukan', 401);
        const result = await env.DB.prepare('SELECT * FROM dashboard_bookings ORDER BY checkin DESC, created_at DESC').all();
        return json({ ok:true, data:(result.results || []).map(row => ({
          id:row.id, propId:row.property_id, propName:row.property_name, propCode:row.property_code,
          guest:row.guest, platform:row.platform, status:row.status, checkin:row.checkin,
          checkout:row.checkout, nights:Number(row.nights), amount:Number(row.amount),
          extraBedQuantity:Number(row.extra_bed_quantity || 0), extraBedPrice:Number(row.extra_bed_price || 0),
          cleaningFee:Number(row.cleaning_fee), platformFeePct:Number(row.platform_fee_pct),
          note:row.note, cancellationReason:row.cancellation_reason, refundAmount:Number(row.refund_amount),
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
        const platform = String(body.platform || '').trim();
        const status = String(body.status || 'Confirmed');
        const checkin = String(body.checkin || '');
        const checkout = String(body.checkout || '');
        const amount = Number(body.amount);
        const extraBedQuantity = Number(body.extraBedQuantity || 0);
        const extraBedPrice = Number(body.extraBedPrice || 0);
        const cleaningFee = Number(body.cleaningFee || 0);
        const platformFeePct = Number(body.platformFeePct || 0);
        const note = String(body.note || '').trim();
        const validStatuses = ['Inquiry', 'Confirmed', 'Checked-in', 'Checked-out', 'Cancelled'];
        const validPlatforms = ['Airbnb', 'Booking.com', 'Agoda', 'Tiket.com', 'Traveloka', 'Direct', 'Agen Offline', 'Website'];
        if (!/^BK[A-Za-z0-9_-]{1,60}$/.test(id) || !propertyId || propertyName.length > 160 || propertyCode.length > 30 || guest.length < 2 || guest.length > 120 || !validPlatforms.includes(platform) || !validStatuses.includes(status)) {
          return bad('Data booking tidak valid.');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(extraBedQuantity) || extraBedQuantity < 0 || !Number.isSafeInteger(extraBedPrice) || extraBedPrice < 0 || !Number.isSafeInteger(cleaningFee) || cleaningFee < 0 || !Number.isInteger(platformFeePct) || platformFeePct < 0 || platformFeePct > 50 || note.length > 500) {
          return bad('Tanggal, jumlah, biaya, atau catatan booking tidak valid.');
        }
        const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86400000);
        const now = new Date().toISOString();
        const incomeEntryId = `booking-income-${id}`;
        await env.DB.batch([
          env.DB.prepare(`
            INSERT OR IGNORE INTO dashboard_bookings (
              id, property_id, property_name, property_code, guest, platform, status,
              checkin, checkout, nights, amount, extra_bed_quantity, extra_bed_price, cleaning_fee, platform_fee_pct, note,
              cancellation_reason, refund_amount, income_entry_id, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?)
          `).bind(id, propertyId, propertyName, propertyCode, guest, platform, status, checkin, checkout,
            nights, amount, extraBedQuantity, extraBedPrice, cleaningFee, platformFeePct, note, incomeEntryId, tokenData.account_id || '', now, now),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) SELECT ?, 'income', 'income-booking', 'Booking', ?, ?, ?, ?, ?, ?, 'once', ?, ?
              WHERE changes() = 1 AND ? <> 'Cancelled'
          `).bind(incomeEntryId, propertyId, propertyName, now.slice(0, 10), amount,
            `Booking ${id} - ${guest}`, platform, tokenData.account_id || '', now, status),
          env.DB.prepare(`
            INSERT INTO finance_entries (
              id, kind, category_id, category_name, property_id, property_name,
              entry_date, amount, description, payee, recurrence, created_by, created_at
            ) SELECT ?, 'income', 'income-extra-bed', 'Extra Bed', ?, ?, ?, ?, ?, ?, 'once', ?, ?
              WHERE changes() = 1 AND ? <> 'Cancelled' AND ? > 0
            ON CONFLICT(id) DO UPDATE SET
              property_id = excluded.property_id,
              property_name = excluded.property_name,
              amount = excluded.amount,
              description = excluded.description,
              payee = excluded.payee
          `).bind(`booking-extra-bed-${id}`, propertyId, propertyName, now.slice(0, 10),
            extraBedQuantity * extraBedPrice, `Extra Bed (${extraBedQuantity} x Rp ${extraBedPrice}) - Booking ${id}`, guest,
            tokenData.account_id || '', now, status, extraBedQuantity * extraBedPrice),
        ]);
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
        const platform = String(body.platform || '').trim();
        const status = isCancelledBooking ? booking.status : String(body.status || 'Confirmed');
        const checkin = String(body.checkin || '');
        const checkout = String(body.checkout || '');
        const amount = Number(body.amount);
        const extraBedQuantity = Number(body.extraBedQuantity || 0);
        const extraBedPrice = Number(body.extraBedPrice || 0);
        const cleaningFee = Number(body.cleaningFee || 0);
        const platformFeePct = Number(body.platformFeePct || 0);
        const note = String(body.note || '').trim();
        const validStatuses = isCancelledBooking ? [booking.status] : ['Inquiry', 'Confirmed', 'Checked-in', 'Checked-out'];
        const validPlatforms = ['Airbnb', 'Booking.com', 'Agoda', 'Tiket.com', 'Traveloka', 'Direct', 'Agen Offline', 'Website'];
        if (!propertyId || propertyName.length > 160 || propertyCode.length > 30 || guest.length < 2 || guest.length > 120 || !validPlatforms.includes(platform) || !validStatuses.includes(status) || !/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(extraBedQuantity) || extraBedQuantity < 0 || !Number.isSafeInteger(extraBedPrice) || extraBedPrice < 0 || !Number.isSafeInteger(cleaningFee) || cleaningFee < 0 || !Number.isInteger(platformFeePct) || platformFeePct < 0 || platformFeePct > 50 || note.length > 500) {
          return bad('Data booking tidak valid.');
        }
        const nights = Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86400000);
        const extraBedTotal = extraBedQuantity * extraBedPrice;
        const retainedRefund = isCancelledBooking ? Number(booking.refund_amount || 0) : 0;
        if (retainedRefund > amount + extraBedTotal) return bad('Nilai booking dan Extra Bed baru tidak boleh lebih kecil dari refund yang tercatat.', 400);
        const baseRefundAmount = Math.min(retainedRefund, amount);
        const extraBedRefundAmount = Math.max(0, retainedRefund - baseRefundAmount);
        const bookingIncomeAmount = Math.max(0, amount - baseRefundAmount);
        const bookingIncomeDescription = isCancelledBooking
          ? `Booking ${id} - ${guest} - Dibatalkan: ${booking.cancellation_reason}. Refund Rp ${retainedRefund}; pemasukan bersih Rp ${bookingIncomeAmount}.`
          : `Booking ${id} - ${guest}`;
        const results = await env.DB.batch([
          env.DB.prepare(`
            UPDATE dashboard_bookings SET
              property_id = ?, property_name = ?, property_code = ?, guest = ?, platform = ?, status = ?,
              checkin = ?, checkout = ?, nights = ?, amount = ?, extra_bed_quantity = ?, extra_bed_price = ?,
              cleaning_fee = ?, platform_fee_pct = ?, note = ?, updated_at = ?
            WHERE id = ? AND status = ?
          `).bind(propertyId, propertyName, propertyCode, guest, platform, status, checkin, checkout,
            nights, amount, extraBedQuantity, extraBedPrice, cleaningFee, platformFeePct, note, now, id, booking.status),
          env.DB.prepare(`
            UPDATE finance_entries SET property_id = ?, property_name = ?, amount = ?, description = ?, payee = ?
            WHERE id = (SELECT income_entry_id FROM dashboard_bookings WHERE id = ?) AND kind = 'income' AND changes() = 1
          `).bind(propertyId, propertyName, bookingIncomeAmount, bookingIncomeDescription, platform, id),
        ]);
        if (!results[0]?.meta?.changes) return bad('Booking sudah berubah. Muat ulang lalu coba lagi.', 409);
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
        return json({ ok:true, data:{ id } });
      }

      if (request.method === 'GET' && path === '/admin/finance') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await getAdminTokenPayload(request, adminSecret))) return bad('Login admin diperlukan', 401);
        const [categoryResult, entryResult] = await Promise.all([
          env.DB.prepare('SELECT id, kind, name FROM finance_categories WHERE active = 1 ORDER BY kind, name COLLATE NOCASE').all(),
          env.DB.prepare('SELECT * FROM finance_entries ORDER BY entry_date DESC, created_at DESC LIMIT 2000').all(),
        ]);
        return json({ ok: true, data: { categories: categoryResult.results || [], entries: entryResult.results || [] } });
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

        const result = await env.DB.prepare('DELETE FROM finance_entries WHERE id = ?').bind(id).run();
        if (!result.meta?.changes) return bad('Transaksi tidak ditemukan.', 404);
        return json({ ok: true, data: { id } });
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
          'footer_email', 'footer_instagram',
        ]);
        const key = String(body.key || '').trim();
        if (!allowedKeys.has(key)) return bad('Setting tidak dikenal');

        let value = String(body.value || '').trim();
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

      // Terima laporan bug atau pesan dari admin properti
      if (request.method === 'POST' && path === '/admin/contact-it') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const message = String(body.message || '').trim();
        if (!message || message.length > 2000) {
          return bad('Pesan wajib diisi dan maksimal 2000 karakter');
        }

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

        const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `Pesan Contact IT YOUR HOME\n\n${message}\n\n${createdAt}`,
          }),
        });
        const telegramResult = await telegramResponse.json().catch(() => ({}));
        if (!telegramResponse.ok || telegramResult.ok !== true) {
          return bad('Pesan tersimpan, tetapi gagal dikirim ke Telegram', 502);
        }

        return json({ ok: true, data: { id, created_at: createdAt } });
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
        const tokenData = await getOwnerTokenPayload(request, String(env.ADMIN_DASHBOARD_SECRET || '').trim());
        if (!tokenData) return bad('Login Owner diperlukan.', 401);
        const account = await env.DB.prepare('SELECT owner_id FROM owner_portal_accounts WHERE owner_id = ? AND active = 1').bind(tokenData.owner_id).first();
        if (!account) return bad('Akses Owner tidak aktif.', 401);
        const result = await env.DB.prepare(`
          SELECT id, owner_name, period_month, status, created_at, updated_at
          FROM dashboard_owner_share_calculations
          WHERE owner_id = ? AND status = 'final'
          ORDER BY period_month DESC
        `).bind(tokenData.owner_id).all();
        return json({ ok:true, data:result.results || [] });
      }

      const ownerReportMatch = path.match(/^\/owner\/reports\/(\d{4}-(?:0[1-9]|1[0-2]))$/);
      if (request.method === 'GET' && ownerReportMatch) {
        const tokenData = await getOwnerTokenPayload(request, String(env.ADMIN_DASHBOARD_SECRET || '').trim());
        if (!tokenData) return bad('Login Owner diperlukan.', 401);
        const account = await env.DB.prepare('SELECT owner_id FROM owner_portal_accounts WHERE owner_id = ? AND active = 1').bind(tokenData.owner_id).first();
        if (!account) return bad('Akses Owner tidak aktif.', 401);
        const saved = await env.DB.prepare(`
          SELECT id, owner_name, period_month, calculation_json, created_at, updated_at
          FROM dashboard_owner_share_calculations
          WHERE owner_id = ? AND period_month = ? AND status = 'final'
        `).bind(tokenData.owner_id, ownerReportMatch[1]).first();
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
      return json({
        ok: false,
        error: String(error?.message || error),
      }, 500);
    }
  },
};
