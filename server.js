const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Supabase Cloud Configuration (for server-side background sync)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rdsueqccskkhjnbbmpjm.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_z1xg-Bwxosn3rdzcFqwASw_S9Hr3Vuk';

// Database Setup
const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

// Initialize relational schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'IDR',
    group_name TEXT,
    priority INTEGER NOT NULL DEFAULT 2,
    checked INTEGER NOT NULL DEFAULT 0,
    link TEXT,
    image_data TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);

  INSERT OR IGNORE INTO users (id, name, email, username, password_hash, salt, created_at)
  VALUES ('guest', 'Guest User', 'guest@local', 'guest', '', '', '2026-01-01T00:00:00.000Z');
`);

// Background Sync Helper to Supabase (Server-to-Server, never blocks client response)
const syncItemToSupabase = async (item, action = 'upsert') => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !item) return;
  try {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };

    if (action === 'upsert') {
      const row = {
        id: String(item.id),
        user_id: String(item.user_id),
        title: String(item.title || 'Untitled'),
        price: Number(item.price) || 0,
        currency: item.currency || 'IDR',
        group: item.group_name || item.group || null,
        priority: Number(item.priority) || 2,
        checked: item.checked === 1 || item.checked === true,
        link: item.link || null,
        image_data: (item.image_data && item.image_data.length < 25000) ? item.image_data : (item.imageData && item.imageData.length < 25000 ? item.imageData : null),
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
        updated_at: item.updated_at || item.updatedAt || new Date().toISOString()
      };
      await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items`, {
        method: 'POST',
        headers,
        body: JSON.stringify([row])
      }).catch(() => {});
    } else if (action === 'delete') {
      await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items?id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(item.user_id)}`, {
        method: 'DELETE',
        headers
      }).catch(() => {});
    }
  } catch (err) {
    // Non-blocking log
  }
};

// MIME Types
const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};

// Password Hashing
const hashPassword = (password, salt) => {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Authentication Middleware Helper
const getAuthenticatedUser = (req) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const headerUserId = req.headers['x-user-id'] || '';

  if (!token && !headerUserId) return null;

  try {
    if (token) {
      const sessionStmt = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
      const session = sessionStmt.get(token);
      if (session && new Date(session.expires_at) >= new Date()) {
        const userStmt = db.prepare('SELECT id, name, email, username, created_at FROM users WHERE id = ?');
        const user = userStmt.get(session.user_id);
        if (user) return { ...user, token };
      }
    }

    // Direct User ID matching (for internal / guest-scoped API calls)
    const targetUserId = token || headerUserId;
    if (targetUserId) {
      const userStmt = db.prepare('SELECT id, name, email, username, created_at FROM users WHERE id = ?');
      const user = userStmt.get(targetUserId);
      if (user) return { ...user, token: token || targetUserId };
    }
  } catch (err) {
    console.warn('Auth check error:', err.message);
  }
  return null;
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
};

const readBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e7) { // 10MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
};

// URL Scraping Helpers for Shopee / Tokopedia
const decodeHtmlEntities = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

const cleanProductTitle = (t) => {
  if (!t) return '';
  return decodeHtmlEntities(t)
    .replace(/^Jual\s+/i, '')
    .replace(/\s*\|\s*(Shopee|Tokopedia|Blibli|Lazada|TikTok|Bukalapak|Amazon).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const guessGroupFromTitle = (title) => {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(headphone|headphones|earphone|earphones|tws|iem|speaker|speakers|airpods|audio|mic|microphone|soundbar)\b/i.test(t)) return 'Audio';
  if (/\b(baju|kaos|kemeja|celana|hoodie|jacket|jaket|sepatu|sneaker|sneakers|dress|outfit|shirt|tshirt|shoes|pants|sock|socks)\b/i.test(t)) return 'Outfit';
  if (/\b(monitor|keyboard|mouse|desk|pad|deskmat|holder|stand|lampu meja|lightbar)\b/i.test(t)) return 'Desk Setup';
  if (/\b(game|playstation|nintendo|xbox|ps5|switch|controller|gamepad|steam deck|rog ally)\b/i.test(t)) return 'Gaming';
  if (/\b(kamera|camera|lensa|lens|tripod|gimbal|drone|lighting|fujifilm|lumix)\b/i.test(t)) return 'Photography';
  if (/\b(laptop|pc|macbook|ipad|tablet|iphone|android|samsung|charger|hub|ssd|ram|gpu|gadget)\b/i.test(t)) return 'Electronics';
  if (/\b(buku|book|books|novel|hardcover|paperback|komik|comic|manga|kindle)\b/i.test(t)) return 'Books';
  if (/\b(gym|dumbbell|barbell|matras|yoga|sepeda|running|sports)\b/i.test(t)) return 'Fitness';
  if (/\b(cangkir|tumbler|mug|kasur|bantal|sprei|diffuser|lampu|meja|kursi|sofa)\b/i.test(t)) return 'Home & Living';
  return null;
};

const scrapeProduct = async (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL is required');
  }

  let finalUrl = rawUrl.trim();
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'https://' + finalUrl;
  }

  let title = '';
  let price = 0;
  let currency = 'IDR';
  let imageUrl = '';
  let brand = '';

  try {
    const res = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();

      // OpenGraph & Meta Tags
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                      html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i);
      const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
                      html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i);
      const tagTitle = html.match(/<title>(.*?)<\/title>/i);

      if (ogTitle && ogTitle[1]) title = cleanProductTitle(ogTitle[1]);
      else if (tagTitle && tagTitle[1]) title = cleanProductTitle(tagTitle[1]);

      if (ogImage && ogImage[1] && !ogImage[1].includes('placeholder')) {
        imageUrl = decodeHtmlEntities(ogImage[1]);
      }

      // JSON-LD Structured Data
      const jsonLdMatches = html.matchAll(/<script\s+type=["']application\/ld\+json["']>(.*?)<\/script>/gis);
      for (const m of jsonLdMatches) {
        try {
          const ld = JSON.parse(m[1]);
          if (ld['@type'] === 'Product' || ld.name) {
            if (ld.name && !title) title = cleanProductTitle(ld.name);
            if (ld.image && !imageUrl) {
              imageUrl = Array.isArray(ld.image) ? ld.image[0] : (typeof ld.image === 'object' ? ld.image.url : ld.image);
            }
            if (ld.offers) {
              const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
              if (offer.price) price = Number(offer.price);
              if (offer.priceCurrency) currency = offer.priceCurrency;
            }
            if (ld.brand) {
              brand = typeof ld.brand === 'object' ? ld.brand.name : ld.brand;
            }
          }
        } catch (e) {}
      }
    }
  } catch (err) {}

  if (title) title = cleanProductTitle(title);

  return {
    success: !!(title || price || imageUrl),
    url: finalUrl,
    title: title || '',
    price: price || 0,
    currency: currency || 'IDR',
    imageUrl: imageUrl || '',
    brand: brand || '',
    suggestedGroup: guessGroupFromTitle(title)
  };
};

// HTTP Server
const server = http.createServer({ maxHeaderSize: 65536 }, async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  // --- AUTHENTICATION ENDPOINTS ---

  // 1. Register User
  if (req.method === 'POST' && reqPath === '/api/auth/register') {
    try {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const ident = (body.emailOrUsername || body.email || body.username || '').trim().toLowerCase();
      const password = body.password || '';

      if (!name) return sendJson(res, 400, { error: 'Full name is required' });
      if (!ident || ident.length < 3) return sendJson(res, 400, { error: 'Email or username must be at least 3 characters' });
      if (!password || password.length < 4) return sendJson(res, 400, { error: 'Password must be at least 4 characters' });

      const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(ident, ident);
      if (existing) return sendJson(res, 409, { error: 'An account with this email/username already exists' });

      const isEmail = ident.includes('@');
      const email = isEmail ? ident : `${ident}@user`;
      const username = isEmail ? ident.split('@')[0] : ident;
      const userId = 'usr_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (id, name, email, username, password_hash, salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, name, email, username, passwordHash, salt, now);

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, userId, now, expiresAt);

      return sendJson(res, 201, { success: true, token, user: { id: userId, name, email, username, createdAt: now } });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Registration failed' });
    }
  }

  // 2. Login User
  if (req.method === 'POST' && reqPath === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const ident = (body.emailOrUsername || body.email || body.username || '').trim().toLowerCase();
      const password = body.password || '';

      if (!ident || !password) return sendJson(res, 400, { error: 'Email/Username and password are required' });

      const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(ident, ident);
      if (!user) return sendJson(res, 401, { error: 'Invalid username or password' });

      const hash = hashPassword(password, user.salt);
      if (hash !== user.password_hash) return sendJson(res, 401, { error: 'Invalid username or password' });

      const token = generateToken();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, user.id, now, expiresAt);

      return sendJson(res, 200, {
        success: true,
        token,
        user: { id: user.id, name: user.name, email: user.email, username: user.username, createdAt: user.created_at }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Login failed' });
    }
  }

  // 3. Get Current User Profile
  if (req.method === 'GET' && reqPath === '/api/auth/me') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { user });
  }

  // 4. Logout User
  if (req.method === 'POST' && reqPath === '/api/auth/logout') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch (e) {}
    }
    return sendJson(res, 200, { success: true });
  }

  // --- ITEMS RESTFUL CRUD ENDPOINTS ---

  // 5. GET All Items
  if (req.method === 'GET' && reqPath === '/api/items') {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');

    try {
      let rows = db.prepare(`
        SELECT id, user_id, title, price, currency, group_name, priority, checked, link, image_data, created_at, updated_at
        FROM items
        WHERE user_id = ?
        ORDER BY created_at ASC
      `).all(userId);

      // If guest has no items yet, seed default sample items
      if (rows.length === 0 && userId === 'guest') {
        const defaultSamples = [
          { id: 'sample-1', user_id: 'guest', title: 'Keychron Q1 Max Wireless Keyboard', price: 3450000, currency: 'IDR', group_name: 'Workspace & Setup', priority: 1, checked: 0, link: 'https://keychron.com', image_data: null },
          { id: 'sample-2', user_id: 'guest', title: 'BenQ ScreenBar Halo Monitor Light', price: 2450000, currency: 'IDR', group_name: 'Workspace & Setup', priority: 2, checked: 1, link: 'https://benq.com', image_data: null },
          { id: 'sample-3', user_id: 'guest', title: 'Sony WH-1000XM5 Noise Canceling Headphones', price: 4999000, currency: 'IDR', group_name: 'Audio & Sound', priority: 1, checked: 0, link: 'https://sony.com', image_data: null },
          { id: 'sample-4', user_id: 'guest', title: 'Ergonomic Mesh Chair Herman Miller', price: 14500000, currency: 'IDR', group_name: 'Workspace & Setup', priority: 3, checked: 0, link: null, image_data: null }
        ];

        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO items (id, user_id, title, price, currency, group_name, priority, checked, link, image_data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const now = new Date().toISOString();
        defaultSamples.forEach(s => {
          insertStmt.run(s.id, s.user_id, s.title, s.price, s.currency, s.group_name, s.priority, s.checked, s.link, s.image_data, now, now);
        });

        rows = db.prepare(`
          SELECT id, user_id, title, price, currency, group_name, priority, checked, link, image_data, created_at, updated_at
          FROM items
          WHERE user_id = ?
          ORDER BY created_at ASC
        `).all(userId);
      }

      const items = rows.map(r => ({
        id: r.id,
        title: r.title,
        price: Number(r.price) || 0,
        currency: r.currency || 'IDR',
        group: r.group_name || null,
        priority: Number(r.priority) || 2,
        checked: r.checked === 1,
        link: r.link || null,
        imageData: r.image_data || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));

      return sendJson(res, 200, { success: true, items });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to fetch items' });
    }
  }

  // 6. CREATE Item
  if (req.method === 'POST' && reqPath === '/api/items') {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');

    try {
      const body = await readBody(req);
      const id = String(body.id || ('item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)));
      const title = String(body.title || 'Untitled').trim();
      const price = Number(body.price) || 0;
      const currency = body.currency || 'IDR';
      const groupName = body.group ? String(body.group).trim() : null;
      const priority = Number(body.priority) || 2;
      const checked = (body.checked === true || body.checked === 1) ? 1 : 0;
      const link = body.link ? String(body.link).trim() : null;
      const imageData = body.imageData || body.image_data || null;
      const now = new Date().toISOString();
      const createdAt = body.createdAt || now;
      const updatedAt = body.updatedAt || now;

      db.prepare(`
        INSERT INTO items (id, user_id, title, price, currency, group_name, priority, checked, link, image_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          price = excluded.price,
          currency = excluded.currency,
          group_name = excluded.group_name,
          priority = excluded.priority,
          checked = excluded.checked,
          link = excluded.link,
          image_data = excluded.image_data,
          updated_at = excluded.updated_at
      `).run(id, userId, title, price, currency, groupName, priority, checked, link, imageData, createdAt, updatedAt);

      const newItem = { id, user_id: userId, title, price, currency, group: groupName, priority, checked: checked === 1, link, imageData, createdAt, updatedAt };
      syncItemToSupabase(newItem, 'upsert');

      return sendJson(res, 201, { success: true, item: newItem });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to create item' });
    }
  }

  // 7. UPDATE Item
  if (req.method === 'PUT' && reqPath.startsWith('/api/items/')) {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');
    const itemId = decodeURIComponent(reqPath.replace('/api/items/', ''));

    try {
      const body = await readBody(req);
      const existing = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(itemId, userId);
      if (!existing) return sendJson(res, 404, { error: 'Item not found' });

      const title = body.title !== undefined ? String(body.title).trim() : existing.title;
      const price = body.price !== undefined ? Number(body.price) : existing.price;
      const currency = body.currency !== undefined ? body.currency : existing.currency;
      const groupName = body.group !== undefined ? (body.group ? String(body.group).trim() : null) : existing.group_name;
      const priority = body.priority !== undefined ? Number(body.priority) : existing.priority;
      const checked = body.checked !== undefined ? (body.checked ? 1 : 0) : existing.checked;
      const link = body.link !== undefined ? (body.link ? String(body.link).trim() : null) : existing.link;
      const imageData = body.imageData !== undefined ? body.imageData : (body.image_data !== undefined ? body.image_data : existing.image_data);
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE items
        SET title = ?, price = ?, currency = ?, group_name = ?, priority = ?, checked = ?, link = ?, image_data = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(title, price, currency, groupName, priority, checked, link, imageData, now, itemId, userId);

      const updatedItem = { id: itemId, user_id: userId, title, price, currency, group: groupName, priority, checked: checked === 1, link, imageData, createdAt: existing.created_at, updatedAt: now };
      syncItemToSupabase(updatedItem, 'upsert');

      return sendJson(res, 200, { success: true, item: updatedItem });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to update item' });
    }
  }

  // 8. DELETE Item
  if (req.method === 'DELETE' && reqPath.startsWith('/api/items/')) {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');
    const itemId = decodeURIComponent(reqPath.replace('/api/items/', ''));

    try {
      db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(itemId, userId);
      syncItemToSupabase({ id: itemId, user_id: userId }, 'delete');
      return sendJson(res, 200, { success: true, id: itemId });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to delete item' });
    }
  }

  // 9. BULK Operations
  if (req.method === 'POST' && reqPath === '/api/items/bulk') {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');

    try {
      const body = await readBody(req);
      const action = body.action || 'save_all';
      const now = new Date().toISOString();

      if (action === 'delete_multiple') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          db.prepare(`DELETE FROM items WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...ids);
          ids.forEach(id => syncItemToSupabase({ id, user_id: userId }, 'delete'));
        }
        return sendJson(res, 200, { success: true, count: ids.length });
      }

      if (action === 'rename_group') {
        const oldGroup = body.oldGroup || '';
        const newGroup = body.newGroup ? String(body.newGroup).trim() : null;
        if (oldGroup) {
          db.prepare('UPDATE items SET group_name = ?, updated_at = ? WHERE user_id = ? AND group_name = ?')
            .run(newGroup, now, userId, oldGroup);
        }
        return sendJson(res, 200, { success: true, oldGroup, newGroup });
      }

      if (Array.isArray(body.items)) {
        const insertStmt = db.prepare(`
          INSERT INTO items (id, user_id, title, price, currency, group_name, priority, checked, link, image_data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title, price = excluded.price, currency = excluded.currency,
            group_name = excluded.group_name, priority = excluded.priority, checked = excluded.checked,
            link = excluded.link, image_data = excluded.image_data, updated_at = excluded.updated_at
        `);

        db.exec('BEGIN TRANSACTION');
        try {
          body.items.forEach(item => {
            const id = String(item.id || ('item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)));
            const title = String(item.title || item.name || 'Untitled').trim();
            const price = Number(item.price) || 0;
            const currency = item.currency || 'IDR';
            const groupName = item.group ? String(item.group).trim() : null;
            const priority = Number(item.priority) || 2;
            const checked = (item.checked === true || item.checked === 1) ? 1 : 0;
            const link = item.link || null;
            const imageData = item.imageData || item.image_data || null;
            const createdAt = item.createdAt || item.created_at || now;
            const updatedAt = item.updatedAt || item.updated_at || now;

            insertStmt.run(id, userId, title, price, currency, groupName, priority, checked, link, imageData, createdAt, updatedAt);
            syncItemToSupabase({ id, user_id: userId, title, price, currency, group_name: groupName, priority, checked, link, image_data: imageData, created_at: createdAt, updated_at: updatedAt }, 'upsert');
          });
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return sendJson(res, 200, { success: true, count: body.items.length });
      }
      return sendJson(res, 400, { error: 'Invalid bulk action' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Bulk operation failed' });
    }
  }

  // 10. Scrape Product
  if (req.method === 'POST' && reqPath === '/api/scrape-product') {
    try {
      const body = await readBody(req);
      if (!body.url) return sendJson(res, 400, { error: 'URL parameter is required' });
      return sendJson(res, 200, await scrapeProduct(body.url));
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- STATIC FILE SERVER ---
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Wishlist Server is running on http://0.0.0.0:${PORT}`);
});
