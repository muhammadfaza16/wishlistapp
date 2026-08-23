const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = 3000;
const PUBLIC_DIR = __dirname;

// Database Setup
const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

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

  CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT PRIMARY KEY,
    items_json TEXT NOT NULL DEFAULT '[]',
    notes_json TEXT NOT NULL DEFAULT '[]',
    notepad_text TEXT NOT NULL DEFAULT '',
    preferences_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

const hashPassword = (password, salt) => {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const getAuthenticatedUser = (req) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    const sessionStmt = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
    const session = sessionStmt.get(token);
    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }

    const userStmt = db.prepare('SELECT id, name, email, username, created_at FROM users WHERE id = ?');
    const user = userStmt.get(session.user_id);
    if (!user) return null;

    return { ...user, token };
  } catch (err) {
    return null;
  }
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
};

const readBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5e6) { // 5MB limit
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
  if (/\b(buku|book|books|novel|hardcover|paperback|komik|comic|manga|kindle|prince|author)\b/i.test(t)) return 'Books';
  if (/\b(gym|dumbbell|barbell|matras|yoga|sepeda|running|sports)\b/i.test(t)) return 'Fitness';
  if (/\b(cangkir|tumbler|mug|kasur|bantal|sprei|diffuser|lampu|meja|kursi|sofa)\b/i.test(t)) return 'Home & Living';
  return null;
};

const extractFromSlug = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('shopee.')) {
      const match = parsed.pathname.match(/\/([^/?#]+)-i\.(\d+)\.(\d+)/);
      if (match && match[1]) {
        let title = decodeURIComponent(match[1]).replace(/[-_+]/g, ' ').trim();
        return { title: cleanProductTitle(title), shopid: match[2], itemid: match[3] };
      }
    }
    if (parsed.hostname.includes('tokopedia.')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        let title = decodeURIComponent(parts[parts.length - 1]).replace(/[-_+]/g, ' ').trim();
        return { title: cleanProductTitle(title) };
      }
    }
  } catch (e) {}
  return null;
};

const scrapeProduct = async (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL is required');
  }

  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let finalUrl = targetUrl;
  let title = '';
  let price = 0;
  let imageUrl = '';
  let brand = '';
  let currency = 'IDR';

  // 1. Initial slug extraction
  const initialSlug = extractFromSlug(targetUrl);
  if (initialSlug && initialSlug.title) {
    title = initialSlug.title;
  }

  // 2. Fetch page / resolve shortlinks (Using WhatsApp/Facebook crawler UA for SSR OpenGraph metadata)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'WhatsApp/2.21.12.21 A',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeout);
    finalUrl = response.url || targetUrl;

    const finalSlug = extractFromSlug(finalUrl);
    if (finalSlug && finalSlug.title && !title) {
      title = finalSlug.title;
    }

    const html = await response.text();

    // 3. OpenGraph Tags
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                         html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      const extracted = cleanProductTitle(ogTitleMatch[1]);
      if (extracted) title = extracted;
    }

    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                         html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImageMatch && ogImageMatch[1]) {
      imageUrl = decodeHtmlEntities(ogImageMatch[1].trim());
    }

    // 4. JSON-LD Schema
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const product = data['@type'] === 'Product' ? data : (Array.isArray(data['@graph']) ? data['@graph'].find(i => i && i['@type'] === 'Product') : null);
        if (product) {
          if (product.name && !title) title = cleanProductTitle(product.name);
          if (product.image) {
            imageUrl = Array.isArray(product.image) ? product.image[0] : (typeof product.image === 'string' ? product.image : product.image.url || imageUrl);
          }
          if (product.brand) {
            brand = typeof product.brand === 'string' ? product.brand : (product.brand.name || brand);
          }
          if (product.offers) {
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            const p = offer.price || offer.lowPrice || offer.highPrice;
            if (p) price = parseFloat(p);
            if (offer.priceCurrency) currency = offer.priceCurrency;
          }
        }
      } catch (e) {}
    }

    // 5. Price Meta
    if (!price) {
      const priceMetaMatch = html.match(/<meta[^>]+property=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:product:price:amount|og:price:amount)["']/i);
      if (priceMetaMatch && priceMetaMatch[1]) {
        price = parseFloat(priceMetaMatch[1].replace(/[^\d.]/g, ''));
      }
    }

    // 6. Shopee API Check
    const shopMatch = finalUrl.match(/shopee\.co\.id\/.*?-i\.(\d+)\.(\d+)/) || finalUrl.match(/shopee\.co\.id\/product\/(\d+)\/(\d+)/);
    if (shopMatch) {
      const shopid = shopMatch[1];
      const itemid = shopMatch[2];
      try {
        const apiRes = await fetch(`https://shopee.co.id/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': `https://shopee.co.id/product/${shopid}/${itemid}`,
            'X-Shopee-Language': 'id',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson && apiJson.data) {
            const d = apiJson.data;
            if (d.name) title = cleanProductTitle(d.name);
            if (d.price) price = d.price / 100000;
            else if (d.price_min) price = d.price_min / 100000;
            if (d.image) imageUrl = `https://down-id.img.susercontent.com/file/${d.image}`;
            if (d.brand && d.brand !== 'Tidak Ada Merek' && d.brand !== 'No Brand') brand = d.brand;
          }
        }
      } catch (err) {}
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

const server = http.createServer(async (req, res) => {
  let reqPath = req.url.split('?')[0];

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  // --- REST API ENDPOINTS ---

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

      // Check if user already exists
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

      // Initialize empty user_data
      db.prepare(`
        INSERT INTO user_data (user_id, items_json, notes_json, notepad_text, preferences_json, updated_at)
        VALUES (?, '[]', '[]', '', '{}', ?)
      `).run(userId, now);

      // Create session token (valid for 30 days)
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, userId, now, expiresAt);

      return sendJson(res, 201, {
        success: true,
        token,
        user: { id: userId, name, email, username, createdAt: now }
      });
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

      if (!ident || !password) return sendJson(res, 400, { error: 'Email/username and password are required' });

      const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(ident, ident);
      if (!user) return sendJson(res, 401, { error: 'Invalid email/username or password' });

      const expectedHash = hashPassword(password, user.salt);
      if (expectedHash !== user.password_hash) {
        return sendJson(res, 401, { error: 'Invalid email/username or password' });
      }

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

  // 3. Current User Profile
  if (req.method === 'GET' && reqPath === '/api/auth/me') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { success: true, user });
  }

  // 4. Logout
  if (req.method === 'POST' && reqPath === '/api/auth/logout') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    return sendJson(res, 200, { success: true });
  }

  // 5. Get User Data (Sync Pull)
  if (req.method === 'GET' && reqPath === '/api/user/sync') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

    try {
      const dataRow = db.prepare('SELECT * FROM user_data WHERE user_id = ?').get(user.id);
      if (!dataRow) {
        return sendJson(res, 200, {
          success: true,
          data: { items: [], notes: [], notepadText: '', preferences: {}, updatedAt: new Date().toISOString() }
        });
      }

      return sendJson(res, 200, {
        success: true,
        data: {
          items: JSON.parse(dataRow.items_json || '[]'),
          notes: JSON.parse(dataRow.notes_json || '[]'),
          notepadText: dataRow.notepad_text || '',
          preferences: JSON.parse(dataRow.preferences_json || '{}'),
          updatedAt: dataRow.updated_at
        }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to fetch user data' });
    }
  }

  // 6. Save User Data (Sync Push)
  if (req.method === 'POST' && reqPath === '/api/user/sync') {
    const user = getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { error: 'Unauthorized' });

    try {
      const body = await readBody(req);
      const itemsJson = JSON.stringify(body.items || []);
      const notesJson = JSON.stringify(body.notes || []);
      const notepadText = typeof body.notepadText === 'string' ? body.notepadText : '';
      const preferencesJson = JSON.stringify(body.preferences || {});
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO user_data (user_id, items_json, notes_json, notepad_text, preferences_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          items_json = excluded.items_json,
          notes_json = excluded.notes_json,
          notepad_text = excluded.notepad_text,
          preferences_json = excluded.preferences_json,
          updated_at = excluded.updated_at
      `).run(user.id, itemsJson, notesJson, notepadText, preferencesJson, now);

      return sendJson(res, 200, { success: true, updatedAt: now });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to save user data' });
    }
  }

  // 7. Scrape Product Metadata
  if (req.method === 'POST' && reqPath === '/api/scrape-product') {
    try {
      const body = await readBody(req);
      const { url } = body;
      if (!url) return sendJson(res, 400, { error: 'URL parameter is required' });

      const data = await scrapeProduct(url);
      return sendJson(res, 200, data);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Static File Server
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zero-Cache Server with SQLite running on 0.0.0.0:${PORT}`);
});
