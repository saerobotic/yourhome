/**
 * YOUR HOME - Check In Crew API
 *
 * Bindings:
 * DB     -> D1 database: your-home-checkin
 * PHOTOS -> R2 bucket: your-home
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

async function createAdminToken(secret) {
  const payload = base64UrlEncode(JSON.stringify({
    scope: 'admin',
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
  const signature = await hmacSha256Hex(secret, payload);
  return `${payload}.${signature}`;
}

async function isAdminRequest(request, secret) {
  if (!secret) return false;
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  try {
    const expectedSignature = await hmacSha256Hex(secret, payload);
    if (signature !== expectedSignature) return false;
    const data = JSON.parse(base64UrlDecode(payload));
    return data.scope === 'admin' && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS,
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
          endpoints: [
            'GET /',
            'GET /crews',
            'GET /properties',
            'GET /checkins',
            'POST /admin/login',
            'POST /admin/properties',
            'POST /checkin',
            'POST /login',
            'POST /admin/set-pin',
            'POST /checkins/manual',
            'PATCH /checkins/{id}',
            'DELETE /checkins/{id}',
            'DELETE /checkins?date=YYYY-MM-DD',
            'DELETE /checkins?all=1',
            'GET /files/*',
          ],
        });
      }

      // Ambil foto dari R2
      if (request.method === 'GET' && path.startsWith('/files/')) {
        const key = fileKeyFromPath(path);
        const object = await env.PHOTOS.get(key);

        if (!object) {
          return bad('Foto tidak ditemukan', 404, { key });
        }

        const headers = new Headers(CORS);
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
        const crew = url.searchParams.get('crew');
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();

        if (!date && !crew && !(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
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

      // Ambil daftar crew aktif tanpa mengekspos hash PIN
      if (request.method === 'GET' && path === '/crews') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const result = await env.DB
          .prepare('SELECT name FROM crews WHERE active = 1 ORDER BY name ASC')
          .all();

        return json({
          ok: true,
          data: (result.results || []).map(row => ({ name: row.name })),
        });
      }

      // Ambil properti aktif untuk website publik
      if (request.method === 'GET' && path === '/properties') {
        const result = await env.DB
          .prepare("SELECT * FROM properties WHERE active = 1 AND id <> 'villa-forest-heal' ORDER BY sort_order ASC, name ASC")
          .all();

        return json({
          ok: true,
          data: (result.results || []).map(row => ({
            ...row,
            room_options: safeParseJsonArray(row.room_options),
            image_urls: (() => {
              const urls = safeParseJsonArray(row.image_urls);
              return row.image_url
                ? [row.image_url, ...urls.filter(imageUrl => imageUrl !== row.image_url)]
                : urls;
            })(),
          })),
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
          .prepare('SELECT id FROM checkins WHERE id = ?')
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
          await env.DB
            .prepare('DELETE FROM checkins WHERE work_date = ?')
            .bind(date)
            .run();

          return json({
            ok: true,
            deleted: 'date',
            date,
          });
        }

        if (all) {
          await env.DB
            .prepare('DELETE FROM checkins')
            .run();

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
        const body = await request.json();

        const crew = body.crew;
        const unit = body.unit;
        const jobType = body.job_type || body.jobType;
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

        const workDate = body.work_date || body.workDate;
        const clientCreatedAt = body.created_at || body.createdAt;

        if (!crew || !unit || !jobType) {
          return bad('crew, unit, job_type wajib');
        }

        if (lat == null || lng == null) {
          return bad('GPS wajib');
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
            Number(lat),
            Number(lng),
            accuracy == null ? null : Number(accuracy),
            selfieUrl,
            JSON.stringify(workPhotoUrls),
            createdAt,
            today
          )
          .run();

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

      // POST /admin/login { password }
      if (request.method === 'POST' && path === '/admin/login') {
        const body = await request.json();
        const password = String(body.password || '').trim();
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();

        if (!adminSecret || !password || password !== adminSecret) {
          return bad('Password admin salah', 401);
        }

        return json({
          ok: true,
          token: await createAdminToken(adminSecret),
        });
      }

      // Simpan atau perbarui properti dari dashboard admin
      if (request.method === 'POST' && path === '/admin/properties') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const id = String(body.id || '').trim();
        const name = String(body.name || '').trim();
        const category = String(body.category || '').trim();
        const location = String(body.location || '').trim();
        const price = Number(body.price);
        const weekdayPrice = body.weekday_price == null || body.weekday_price === '' ? null : Number(body.weekday_price);
        const weekendPrice = body.weekend_price == null || body.weekend_price === '' ? null : Number(body.weekend_price);
        const beds = Number(body.beds || 0);
        const baths = Number(body.baths || 0);
        const guests = Number(body.guests || 0);
        const preserveImages = body.preserve_images === true;
        let imageUrl = String(body.image_url || '').trim();
        const mapQuery = String(body.map_query || '').trim();
        const mapLink = String(body.map_embed || body.map_link || '').trim();
        const description = String(body.description || '');
        const roomOptions = Array.isArray(body.room_options) ? body.room_options : [];
        let imageUrls = Array.isArray(body.image_urls)
          ? body.image_urls.filter(value => typeof value === 'string' && value.trim())
          : (imageUrl ? [imageUrl] : []);
        const sortOrder = Number(body.sort_order || 0);
        const active = body.active === false ? 0 : 1;

        if (!id || !name || !['apartment', 'villa', 'guesthouse', 'kos'].includes(category) || !location || !Number.isFinite(price) || price < 0) {
          return bad('id, name, category, location, dan price wajib valid');
        }

        if (preserveImages) {
          const current = await env.DB
            .prepare('SELECT image_url, image_urls FROM properties WHERE id = ?')
            .bind(id)
            .first();
          if (current) {
            imageUrl = String(current.image_url || '');
            imageUrls = safeParseJsonArray(current.image_urls);
          }
        }

        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO properties (
            id, name, category, location, price, weekday_price, weekend_price,
            beds, baths, guests, image_url, map_query, map_link, description,
            room_options, image_urls, sort_order, active, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            location = excluded.location,
            price = excluded.price,
            weekday_price = excluded.weekday_price,
            weekend_price = excluded.weekend_price,
            beds = excluded.beds,
            baths = excluded.baths,
            guests = excluded.guests,
            image_url = excluded.image_url,
            map_query = excluded.map_query,
            map_link = excluded.map_link,
            description = excluded.description,
            room_options = excluded.room_options,
            image_urls = excluded.image_urls,
            sort_order = excluded.sort_order,
            active = excluded.active,
            updated_at = excluded.updated_at
        `).bind(
          id, name, category, location, price, weekdayPrice, weekendPrice,
          beds, baths, guests, imageUrl, mapQuery, mapLink, description,
          JSON.stringify(roomOptions), JSON.stringify(imageUrls), sortOrder, active, now
        ).run();

        return json({ ok: true, data: { id, name } });
      }

      // Upload foto galeri properti ke R2 dan simpan URL-nya di D1
      if (request.method === 'POST' && path === '/admin/properties/images') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const id = String(body.id || '').trim();
        const mainImage = String(body.main_image || '').trim();
        const existingMainUrl = String(body.existing_main_url || '').trim();
        const images = Array.isArray(body.images) ? body.images : [];
        const existingUrls = Array.isArray(body.existing_urls)
          ? body.existing_urls.filter(value => typeof value === 'string' && value.trim())
          : [];

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
        if (images.length) {
          await env.DB
            .prepare('UPDATE properties SET image_urls = ?, updated_at = ? WHERE id = ?')
            .bind(JSON.stringify(imageUrls), now, id)
            .run();
        }

        return json({ ok: true, id, image_url: mainImage ? mainUrl : existingMainUrl, image_urls: images.length ? imageUrls : undefined });
      }

      // POST /login { crew, pin }
      if (request.method === 'POST' && path === '/login') {
        const body = await request.json();
        const crew = String(body.crew || '').trim();
        const pin = String(body.pin || '').trim();

        if (!crew || !pin) {
          return bad('Nama crew dan PIN wajib diisi');
        }

        const row = await env.DB.prepare(
          'SELECT id, name, pin_hash, active FROM crews WHERE name = ? AND active = 1'
        )
          .bind(crew)
          .first();

        if (!row) {
          return bad('PIN salah atau crew tidak aktif', 401);
        }

        const hash = await sha256Hex(pin);
        const masterSecret = String(env.DEV_IMPERSONATION_SECRET || '').trim();
        const validCrewPin = hash === row.pin_hash;
        const validMasterPin = Boolean(masterSecret) && pin === masterSecret;
        if (!validCrewPin && !validMasterPin) {
          return bad('PIN salah atau crew tidak aktif', 401);
        }

        return json({
          ok: true,
          crew: row.name,
          token: crypto.randomUUID(),
        });
      }

      // POST /admin/set-pin { name, pin, admin_pin }
      if (request.method === 'POST' && path === '/admin/set-pin') {
        const adminSecret = String(env.ADMIN_DASHBOARD_SECRET || '').trim();
        if (!(await isAdminRequest(request, adminSecret))) {
          return bad('Login admin diperlukan', 401);
        }

        const body = await request.json();
        const name = String(body.name || '').trim();
        const pin = String(body.pin || '').trim();
        const adminPin = String(body.admin_pin || '').trim();

        if (!name || !/^\d{6}$/.test(pin) || !adminPin) {
          return bad('name, pin (tepat 6 digit), dan admin_pin wajib diisi');
        }

        if (adminPin !== '3124admin') {
          return bad('PIN admin salah', 403);
        }

        const pinHash = await sha256Hex(pin);
        const existing = await env.DB
          .prepare('SELECT id FROM crews WHERE name = ?')
          .bind(name)
          .first();

        if (existing) {
          await env.DB
            .prepare('UPDATE crews SET pin_hash = ?, active = 1 WHERE name = ?')
            .bind(pinHash, name)
            .run();
        } else {
          await env.DB
            .prepare('INSERT INTO crews (id, name, pin_hash, active) VALUES (?, ?, ?, 1)')
            .bind(crypto.randomUUID(), name, pinHash)
            .run();
        }

        return json({ ok: true, name });
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
