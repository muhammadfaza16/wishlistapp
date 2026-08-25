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
let DB_PATH;
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  DB_PATH = path.join('/tmp', 'database.sqlite');
  const sourceDb = path.join(__dirname, 'database.sqlite');
  if (!fs.existsSync(DB_PATH) && fs.existsSync(sourceDb)) {
    try {
      fs.copyFileSync(sourceDb, DB_PATH);
    } catch (e) {}
  }
} else {
  DB_PATH = path.join(__dirname, 'database.sqlite');
}

const db = new DatabaseSync(DB_PATH);
try {
  db.exec('PRAGMA foreign_keys = OFF;');
} catch (e) {}

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
    expires_at TEXT NOT NULL
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
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);

  INSERT OR IGNORE INTO users (id, name, email, username, password_hash, salt, created_at)
  VALUES ('guest', 'Guest User', 'guest@local', 'guest', '', '', '2026-01-01T00:00:00.000Z');
`);

// Ensure user row exists in SQLite to prevent any constraint failures
const ensureUserRecord = (userId, user = null) => {
  if (!userId) return;
  try {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      const now = new Date().toISOString();
      const name = (user && user.name) ? user.name : (userId === 'guest' ? 'Guest User' : 'User');
      const email = (user && user.email) ? user.email : `${userId}@local`;
      const username = (user && user.username) ? user.username : (userId === 'guest' ? 'guest' : `u_${String(userId).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24)}`);

      try {
        db.prepare(`
          INSERT OR IGNORE INTO users (id, name, email, username, password_hash, salt, created_at)
          VALUES (?, ?, ?, ?, '', '', ?)
        `).run(userId, name, email, username, now);
      } catch (insertErr) {
        const uniqueSuffix = crypto.randomBytes(4).toString('hex');
        try {
          db.prepare(`
            INSERT OR IGNORE INTO users (id, name, email, username, password_hash, salt, created_at)
            VALUES (?, ?, ?, ?, '', '', ?)
          `).run(userId, name, `u_${userId}_${uniqueSuffix}@local`, `u_${uniqueSuffix}`, now);
        } catch (e2) {}
      }
    }
  } catch (err) {
    console.warn('ensureUserRecord warning:', err.message);
  }
};

// Helper to format string or UUID safely for PostgreSQL UUID columns
const toUUID = (str) => {
  if (!str || str === 'guest') return '00000000-0000-0000-0000-000000000000';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return str;
  const hash = crypto.createHash('md5').update(String(str)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

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

    const targetUserId = toUUID(item.user_id);
    const targetItemId = toUUID(item.id);

    if (action === 'upsert') {
      const row = {
        id: targetItemId,
        user_id: targetUserId,
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
      }).catch((e) => console.warn('Supabase sync upsert error:', e.message));
    } else if (action === 'delete') {
      await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items?id=eq.${encodeURIComponent(targetItemId)}&user_id=eq.${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
        headers
      }).catch((e) => console.warn('Supabase sync delete error:', e.message));
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

// Password Hashing & Stateless JWT Signing
const JWT_SECRET = process.env.JWT_SECRET || 'wishlist_app_jwt_secret_2026';

const hashPassword = (password, salt) => {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
};

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const createSessionToken = (user) => {
  const payload = {
    id: user.id,
    name: user.name || 'User',
    email: user.email || '',
    username: user.username || (user.email ? user.email.split('@')[0] : 'user'),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days valid
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};

const verifySessionToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
};

// Authentication Middleware Helper (Stateless across serverless instances + SQLite cache)
const getAuthenticatedUser = (req) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const headerUserId = req.headers['x-user-id'] || '';

  if (!token && !headerUserId) return null;

  try {
    if (token) {
      // 1. Verify signed stateless session token (shared across all Vercel/lambda instances)
      const verified = verifySessionToken(token);
      if (verified && verified.id) {
        const u = {
          id: verified.id,
          name: verified.name,
          email: verified.email,
          username: verified.username,
          createdAt: verified.createdAt || new Date().toISOString(),
          token
        };
        ensureUserRecord(u.id, u);
        return u;
      }

      // 2. Check local SQLite sessions
      try {
        const sessionStmt = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
        const session = sessionStmt.get(token);
        if (session && new Date(session.expires_at) >= new Date()) {
          const userStmt = db.prepare('SELECT id, name, email, username, created_at FROM users WHERE id = ?');
          const user = userStmt.get(session.user_id);
          if (user) return { ...user, token };
        }
      } catch (e) {}

      // 3. If token is standard 3-part JWT (e.g. direct Supabase JWT)
      if (token.includes('.') && token.split('.').length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
          if (payload && payload.sub) {
            const meta = payload.user_metadata || {};
            const u = {
              id: payload.sub,
              name: meta.name || (payload.email ? payload.email.split('@')[0] : 'User'),
              email: payload.email || '',
              username: meta.username || (payload.email ? payload.email.split('@')[0] : ''),
              createdAt: new Date().toISOString(),
              token
            };
            ensureUserRecord(u.id, u);
            return u;
          }
        } catch (e) {}
      }
    }

    // Direct User ID matching (for internal / guest-scoped API calls)
    const targetUserId = token || headerUserId;
    if (targetUserId && targetUserId !== 'guest') {
      try {
        const userStmt = db.prepare('SELECT id, name, email, username, created_at FROM users WHERE id = ?');
        const user = userStmt.get(targetUserId);
        if (user) return { ...user, token: targetUserId };
      } catch (e) {}
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

const cleanProductTitle = (raw) => {
  if (!raw || typeof raw !== 'string') return '';

  let t = decodeHtmlEntities(raw).trim();

  // 1. Remove emojis & unicode symbol sparkles
  t = t.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, ' ');

  // 2. Remove marketplace SEO prefixes
  t = t.replace(/^(?:Jual|Beli|Ready\s*Stock\s*[:\-]?|Pre-?Order\s*[:\-]?|PO\s*[:\-]?)\s+/i, '');

  // 3. Remove marketing tags inside brackets, parens or japanese brackets:
  t = t.replace(/[\[\(\【\〔\‹\<]\s*(?:[^\]\)\】\〕\›\>]*?(?:promo|diskon|discount|sale|garansi|resmi|terlaris|termurah|best\s*seller|ready|stock|bisa\s*cod|cod|gratis\s*ongkir|free\s*ongkir|import|terlengkap|flash\s*sale|special\s*edition|murah|cuci\s*gudang|premium|authentic|original|ori|100%|official|store|terpercaya|hemat)[^\]\)\】\〕\›\>]*?)\s*[\]\)\】\〕\›\>]/gi, ' ');

  // 4. Remove marketplace brand suffixes & SEO tails
  t = t.replace(/\s*[\|\-–—•/]\s*(?:Shopee|Tokopedia|Blibli|Lazada|TikTok(?:\s*Shop)?|Bukalapak|Amazon|Zalora)(?:\s*(?:Indonesia|\.co\.id|\.com))?.*$/i, '');
  t = t.replace(/\s*(?:[\|\-–—•/]\s*)?(?:Official\s*Store|Flagship\s*Store|Authorized\s*(?:Reseller|Dealer)|Gratis\s*Ongkir|Cashback(?:\s*Xtra)?|Bisa\s*COD|Termurah|Terlaris|Terpercaya|100%\s*Original)\s*$/i, '');

  // 5. Remove Shopee/marketplace ID artifacts (e.g. -i.55945766.17841330802)
  t = t.replace(/-?i\.\d+\.\d+/ig, ' ');

  // 6. Clean consecutive symbols and normalize slashes/hyphens
  t = t.replace(/[\s\-_\|\/]{3,}/g, ' - ');
  t = t.replace(/([a-zA-Z0-9])\/([a-zA-Z0-9])/g, '$1 / $2');
  t = t.replace(/\s+/g, ' ').trim();

  // 7. Smart Title Casing for words
  const acronyms = new Set([
    'RGB', 'USB', 'TWS', 'SSD', 'RAM', 'GPU', 'CPU', 'OLED', 'ANC', 'LED', 
    'PRO', 'MAX', 'PLUS', 'MINI', 'SE', 'HD', '4K', '8K', 'FPS', 'DPI', 
    'PCB', 'BT', 'ISO', 'ANSI', 'IDR', 'USD', 'UK', 'US', 'EU', 'XL', 'XXL', 'XXXL',
    '3S', '4S', '5S', 'GT', 'XR', 'XS', 'MX', 'AI', 'ANC', 'GPS', 'NFC', 'PD', 'QC',
    'WH', 'WF', 'WI', 'MDR', 'FE', 'RTX', 'GTX', 'RX'
  ]);
  const minorWords = new Set(['and', 'or', 'in', 'on', 'at', 'for', 'with', 'by', 'to', 'of', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'yang', 'yg']);

  const cleanSubWord = (sw, idx) => {
    const cleanAlphanum = sw.replace(/[^a-zA-Z0-9]/g, '');
    const upper = cleanAlphanum.toUpperCase();
    if (acronyms.has(upper)) return sw.toUpperCase();
    if (/\d/.test(sw)) return sw.toUpperCase();
    if (idx > 0 && minorWords.has(sw.toLowerCase())) return sw.toLowerCase();

    const cleanLetters = sw.replace(/[^a-zA-Z]/g, '');
    if (cleanLetters.length > 1 && cleanLetters === cleanLetters.toUpperCase()) {
      return sw.charAt(0).toUpperCase() + sw.slice(1).toLowerCase();
    }
    return sw;
  };

  const words = t.split(' ');
  t = words.map((w, idx) => {
    if (w.includes('-')) {
      return w.split('-').map((sw, sIdx) => cleanSubWord(sw, idx === 0 && sIdx === 0 ? 0 : 1)).join('-');
    }
    return cleanSubWord(w, idx);
  }).join(' ');

  // 8. Final trim of dangling punctuation & whitespace
  t = t.replace(/^[\|\-–—:,\./\s]+|[\|\-–—:,\./\s]+$/g, '').trim();

  return t;
};

const guessGroupFromTitle = (title) => {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(headphone|headphones|earphone|earphones|tws|iem|speaker|speakers|airpods|audio|mic|microphone|soundbar|dac|amp)\b/i.test(t)) return 'Audio & Sound';
  if (/\b(baju|kaos|kemeja|celana|hoodie|jacket|jaket|sepatu|sneaker|sneakers|dress|outfit|shirt|tshirt|shoes|pants|sock|socks|denim|jeans|skinny|jogger|chino|cardigan|blazer|sweater|polo|vest|outer|wrangler|uniqlo|zara|levis)\b/i.test(t)) return 'Outfit & Fashion';
  if (/\b(monitor|keyboard|mouse|desk|pad|deskmat|holder|stand|lampu meja|lightbar|screenbar|keychron|nuphy)\b/i.test(t)) return 'Workspace & Desk';
  if (/\b(game|playstation|nintendo|xbox|ps5|switch|controller|gamepad|steam deck|rog ally)\b/i.test(t)) return 'Gaming & Gear';
  if (/\b(kamera|camera|lensa|lens|tripod|gimbal|drone|lighting|fujifilm|lumix|sony|canon)\b/i.test(t)) return 'Photography';
  if (/\b(laptop|pc|macbook|ipad|tablet|iphone|android|samsung|charger|hub|ssd|ram|gpu|gadget|watch|smartwatch)\b/i.test(t)) return 'Electronics & Gadgets';
  if (/\b(buku|book|books|novel|hardcover|paperback|komik|comic|manga|kindle)\b/i.test(t)) return 'Books & Study';
  if (/\b(gym|dumbbell|barbell|matras|yoga|sepeda|running|sports)\b/i.test(t)) return 'Fitness & Health';
  if (/\b(cangkir|tumbler|mug|kasur|bantal|sprei|diffuser|lampu|meja|kursi|sofa|home|living|room)\b/i.test(t)) return 'Home & Living';
  if (/\b(kopi|coffee|cafe|lifestyle)\b/i.test(t)) return 'Daily Lifestyle';
  return null;
};

const extractSlugTitle = (urlStr) => {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(p => p && p.length > 2 && !['p', 'product', 'item', 'dp', 'gp', 'products', 'shop'].includes(p.toLowerCase()));
    if (parts.length > 0) {
      let lastPart = decodeURIComponent(parts[parts.length - 1]);
      // Remove shopee id suffix (e.g. -i.55945766.17841330802 or i.1234.5678)
      lastPart = lastPart.replace(/-?i\.\d+\.\d+/ig, '');
      const cleanSlug = lastPart.replace(/\.(html|htm|php|asp)$/i, '').replace(/[-_]+/g, ' ').trim();
      if (cleanSlug.length >= 3 && !/^\d+$/.test(cleanSlug)) {
        return cleanSlug.replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  } catch (e) {}
  return '';
};

const extractMetaTag = (html, propName) => {
  const reg1 = new RegExp(`<meta\\s+[^>]*property=["']${propName}["'][^>]*content=["']([^"']+)["']`, 'i');
  const reg2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${propName}["']`, 'i');
  const reg3 = new RegExp(`<meta\\s+[^>]*name=["']${propName}["'][^>]*content=["']([^"']+)["']`, 'i');
  const reg4 = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*name=["']${propName}["']`, 'i');
  const m = html.match(reg1) || html.match(reg2) || html.match(reg3) || html.match(reg4);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
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

  const userAgents = [
    'WhatsApp/2.21.12.21 A',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(finalUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const html = await res.text();

        // 1. OpenGraph & Meta Tags
        const ogTitle = extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title');
        const ogImage = extractMetaTag(html, 'og:image') || extractMetaTag(html, 'og:image:secure_url') || extractMetaTag(html, 'twitter:image');
        const ogPrice = extractMetaTag(html, 'product:price:amount') || extractMetaTag(html, 'og:price:amount');
        const tagTitle = html.match(/<title[^>]*>(.*?)<\/title>/i);

        if (ogTitle) title = cleanProductTitle(ogTitle);
        else if (tagTitle && tagTitle[1]) title = cleanProductTitle(tagTitle[1]);

        if (ogImage && !ogImage.includes('placeholder') && ogImage.startsWith('http')) {
          imageUrl = ogImage;
        }

        if (ogPrice) {
          const parsedPrice = parseFloat(ogPrice.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsedPrice) && parsedPrice > 0) price = parsedPrice;
        }

        // 2. JSON-LD Structured Data
        const jsonLdMatches = html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
        for (const m of jsonLdMatches) {
          try {
            const rawLd = JSON.parse(m[1]);
            const ldItems = Array.isArray(rawLd) ? rawLd : (rawLd['@graph'] ? rawLd['@graph'] : [rawLd]);

            for (const ld of ldItems) {
              if (!ld || typeof ld !== 'object') continue;
              const type = ld['@type'] || '';
              const isProduct = type === 'Product' || type === 'IndividualProduct' || !!ld.offers;

              if (isProduct || ld.name) {
                if (ld.name && !title) title = cleanProductTitle(ld.name);
                if (ld.image && !imageUrl) {
                  const img = Array.isArray(ld.image) ? ld.image[0] : ld.image;
                  imageUrl = typeof img === 'object' ? (img.url || img.contentUrl || '') : img;
                }
                if (ld.offers) {
                  const offersList = Array.isArray(ld.offers) ? ld.offers : [ld.offers];
                  for (const offer of offersList) {
                    if (offer.price && (!price || price === 0)) {
                      price = Number(offer.price);
                    }
                    if (offer.lowPrice && (!price || price === 0)) {
                      price = Number(offer.lowPrice);
                    }
                    if (offer.priceCurrency) currency = offer.priceCurrency;
                  }
                }
                if (ld.brand && !brand) {
                  brand = typeof ld.brand === 'object' ? ld.brand.name : ld.brand;
                }
              }
            }
          } catch (e) {}
        }

        // 3. Fallback Price Extraction from common regex patterns or description
        if (!price || price === 0) {
          const ogDesc = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description');
          const textToSearch = ogDesc ? `${ogDesc} ${html.slice(0, 5000)}` : html.slice(0, 5000);
          const rpMatch = textToSearch.match(/(?:Rp|IDR)\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?)/i);
          if (rpMatch && rpMatch[1]) {
            const cleanNum = parseInt(rpMatch[1].replace(/\./g, ''), 10);
            if (!isNaN(cleanNum) && cleanNum > 1000) {
              price = cleanNum;
            }
          }
        }

        // If we found a title or image, we got valid product data!
        if (title || imageUrl) break;
      }
    } catch (err) {}
  }

  // Fallback title from URL slug if still empty
  if (!title) {
    title = extractSlugTitle(finalUrl);
  } else {
    title = cleanProductTitle(title);
  }

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

// --- DEV LIVE RELOAD WATCHER ---
const liveReloadClients = new Set();

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const watchFiles = ['index.html', 'styles.css', 'app.js'];
  let reloadTimer = null;

  watchFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.watch(filePath, () => {
          if (reloadTimer) clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => {
            const isCss = file.endsWith('.css');
            const data = JSON.stringify({ type: isCss ? 'css-reload' : 'reload', file, timestamp: Date.now() });
            for (const clientRes of liveReloadClients) {
              try {
                clientRes.write(`data: ${data}\n\n`);
              } catch (e) {
                liveReloadClients.delete(clientRes);
              }
            }
          }, 80);
        });
      } catch (err) {}
    }
  });
}

// HTTP Request Handler
const handler = async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = parsedUrl.pathname;

  // Live Reload SSE Endpoint (Local Dev)
  if (reqPath === '/api/dev/live-reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected"}\n\n');
    liveReloadClients.add(res);
    req.on('close', () => {
      liveReloadClients.delete(res);
    });
    return;
  }

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

  // 1. Register User (Supabase Auth + Local Cache)
  if (req.method === 'POST' && reqPath === '/api/auth/register') {
    try {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const ident = (body.emailOrUsername || body.email || body.username || '').trim().toLowerCase();
      const password = body.password || '';

      if (!name) return sendJson(res, 400, { error: 'Full name is required' });
      if (!ident || ident.length < 3) return sendJson(res, 400, { error: 'Email or username must be at least 3 characters' });
      if (!password || password.length < 4) return sendJson(res, 400, { error: 'Password must be at least 4 characters' });

      const isEmail = ident.includes('@');
      const email = isEmail ? ident : `${ident}@user`;
      const username = isEmail ? ident.split('@')[0] : ident;
      const now = new Date().toISOString();
      let userId = 'usr_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

      // Attempt Supabase Auth signup
      try {
        const supaRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            password,
            data: { name, username, wishlist_items: [] }
          })
        });
        const supaData = await supaRes.json();
        if (supaData && supaData.user && supaData.user.id) {
          userId = supaData.user.id;
        }
      } catch (e) {}

      // Cache in Local SQLite
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);

      const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (id, name, email, username, password_hash, salt, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, name, email, username, passwordHash, salt, now);
      }

      const userObj = { id: userId, name, email, username, createdAt: now };
      const token = createSessionToken(userObj);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        db.prepare(`
          INSERT INTO sessions (token, user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(token, userId, now, expiresAt);
      } catch (e) {}

      return sendJson(res, 201, {
        success: true,
        token,
        user: userObj
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Registration failed' });
    }
  }

  // 2. Login User (Supabase Auth + Local Cache)
  if (req.method === 'POST' && reqPath === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const ident = (body.emailOrUsername || body.email || body.username || '').trim().toLowerCase();
      const password = body.password || '';

      if (!ident || !password) return sendJson(res, 400, { error: 'Email/Username and password are required' });

      const isEmail = ident.includes('@');
      const email = isEmail ? ident : `${ident}@user`;
      const username = isEmail ? ident.split('@')[0] : ident;
      const now = new Date().toISOString();

      let authenticatedUser = null;

      // 1. Attempt Supabase Auth login
      try {
        const supaRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        });

        if (supaRes.ok) {
          const supaData = await supaRes.json();
          if (supaData && supaData.user) {
            const sUser = supaData.user;
            const meta = sUser.user_metadata || {};
            const userId = sUser.id;
            const userName = meta.name || sUser.email.split('@')[0];
            const userEmail = sUser.email;
            const uName = meta.username || sUser.email.split('@')[0];

            authenticatedUser = {
              id: userId,
              name: userName,
              email: userEmail,
              username: uName,
              createdAt: sUser.created_at || now
            };

            // Sync user to SQLite
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(password, salt);
            try {
              db.prepare('DELETE FROM users WHERE id = ? OR email = ? OR username = ?').run(userId, userEmail, uName);
            } catch (e) {}
            db.prepare(`
              INSERT INTO users (id, name, email, username, password_hash, salt, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userId, userName, userEmail, uName, passwordHash, salt, now);
          }
        }
      } catch (e) {}

      // 2. Fallback to Local SQLite if Supabase auth was not used or failed
      if (!authenticatedUser) {
        const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(ident, ident);
        if (!user) return sendJson(res, 401, { error: 'Invalid username or password' });

        const hash = hashPassword(password, user.salt);
        if (hash !== user.password_hash) return sendJson(res, 401, { error: 'Invalid username or password' });

        authenticatedUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          createdAt: user.created_at
        };
      }

      // Generate signed stateless session token
      const token = createSessionToken(authenticatedUser);

      // Store active session in SQLite
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        db.prepare(`
          INSERT INTO sessions (token, user_id, created_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(token, authenticatedUser.id, now, expiresAt);
      } catch (e) {}

      return sendJson(res, 200, {
        success: true,
        token,
        user: authenticatedUser
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
    ensureUserRecord(userId, user);

    try {
      // 1. If authenticated user, ALWAYS fetch latest real-time items from Supabase wishlist_items
      if (user && user.id && user.id !== 'guest' && SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const targetUserId = toUUID(user.id);
          const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items?user_id=eq.${encodeURIComponent(targetUserId)}&select=*&order=created_at.asc`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });

          if (supaRes.ok) {
            const supaItems = await supaRes.json();
            if (Array.isArray(supaItems)) {
              const items = supaItems.map(r => ({
                id: r.id,
                title: r.title,
                price: Number(r.price) || 0,
                currency: r.currency || 'IDR',
                group: r.group || r.group_name || null,
                priority: Number(r.priority) || 2,
                checked: r.checked === true || r.checked === 1,
                link: r.link || null,
                imageData: r.image_data || null,
                createdAt: r.created_at,
                updatedAt: r.updated_at
              }));

              // Sync to local SQLite cache
              try {
                const insertStmt = db.prepare(`
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
                `);
                items.forEach(it => {
                  insertStmt.run(
                    it.id,
                    user.id,
                    it.title,
                    it.price,
                    it.currency,
                    it.group,
                    it.priority,
                    it.checked ? 1 : 0,
                    it.link,
                    it.imageData,
                    it.createdAt,
                    it.updatedAt
                  );
                });
              } catch (e) {}

              return sendJson(res, 200, { success: true, items });
            }
          }
        } catch (supaErr) {
          console.warn('Supabase fetch items error, falling back to SQLite:', supaErr.message);
        }
      }

      // 2. Fallback to Local SQLite (or Guest)
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
    ensureUserRecord(userId, user);

    try {
      const body = await readBody(req);
      const id = String(body.id || ('item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)));
      const title = cleanProductTitle(String(body.title || 'Untitled'));
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
      await syncItemToSupabase(newItem, 'upsert');

      return sendJson(res, 201, { success: true, item: newItem });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to create item' });
    }
  }

  // 7. UPDATE Item
  if (req.method === 'PUT' && reqPath.startsWith('/api/items/')) {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');
    ensureUserRecord(userId, user);
    const itemId = decodeURIComponent(reqPath.replace('/api/items/', ''));

    try {
      const body = await readBody(req);
      let existing = db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').get(itemId, userId);

      // If not found in local SQLite cache on this cold container, query Supabase wishlist_items
      if (!existing && user && user.id && user.id !== 'guest' && SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const targetUserId = toUUID(user.id);
          const targetItemId = toUUID(itemId);
          const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items?id=eq.${encodeURIComponent(targetItemId)}&user_id=eq.${encodeURIComponent(targetUserId)}&select=*`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
          if (supaRes.ok) {
            const supaRows = await supaRes.json();
            if (Array.isArray(supaRows) && supaRows.length > 0) {
              const r = supaRows[0];
              existing = {
                id: r.id,
                user_id: user.id,
                title: r.title,
                price: r.price,
                currency: r.currency,
                group_name: r.group || r.group_name || null,
                priority: r.priority,
                checked: r.checked ? 1 : 0,
                link: r.link,
                image_data: r.image_data,
                created_at: r.created_at,
                updated_at: r.updated_at
              };
            }
          }
        } catch (e) {}
      }

      if (!existing && body.title === undefined && body.checked === undefined && body.price === undefined) {
        return sendJson(res, 404, { error: 'Item not found' });
      }

      const now = new Date().toISOString();
      const title = body.title !== undefined ? cleanProductTitle(String(body.title)) : (existing ? existing.title : 'Untitled');
      const price = body.price !== undefined ? Number(body.price) : (existing ? existing.price : 0);
      const currency = body.currency !== undefined ? body.currency : (existing ? existing.currency : 'IDR');
      const groupName = body.group !== undefined ? (body.group ? String(body.group).trim() : null) : (existing ? existing.group_name : null);
      const priority = body.priority !== undefined ? Number(body.priority) : (existing ? existing.priority : 2);
      const checked = body.checked !== undefined ? (body.checked ? 1 : 0) : (existing ? existing.checked : 0);
      const link = body.link !== undefined ? (body.link ? String(body.link).trim() : null) : (existing ? existing.link : null);
      const imageData = body.imageData !== undefined ? body.imageData : (body.image_data !== undefined ? body.image_data : (existing ? existing.image_data : null));
      const createdAt = existing ? existing.created_at : (body.createdAt || now);

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
      `).run(itemId, userId, title, price, currency, groupName, priority, checked, link, imageData, createdAt, now);

      const updatedItem = {
        id: itemId,
        user_id: userId,
        title,
        price,
        currency,
        group: groupName,
        priority,
        checked: checked === 1,
        link,
        imageData,
        createdAt,
        updatedAt: now
      };

      await syncItemToSupabase(updatedItem, 'upsert');

      return sendJson(res, 200, { success: true, item: updatedItem });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to update item' });
    }
  }

  // 8. DELETE Item
  if (req.method === 'DELETE' && reqPath.startsWith('/api/items/')) {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');
    ensureUserRecord(userId, user);
    const itemId = decodeURIComponent(reqPath.replace('/api/items/', ''));

    try {
      try {
        db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').run(itemId, userId);
      } catch (e) {}
      await syncItemToSupabase({ id: itemId, user_id: userId }, 'delete');
      return sendJson(res, 200, { success: true, id: itemId });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Failed to delete item' });
    }
  }

  // 9. BULK Operations
  if (req.method === 'POST' && reqPath === '/api/items/bulk') {
    const user = getAuthenticatedUser(req);
    const userId = user ? user.id : (req.headers['x-user-id'] || 'guest');
    ensureUserRecord(userId, user);

    try {
      const body = await readBody(req);
      const action = body.action || 'save_all';
      const now = new Date().toISOString();

      if (action === 'delete_multiple') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          db.prepare(`DELETE FROM items WHERE user_id = ? AND id IN (${placeholders})`).run(userId, ...ids);
          await Promise.all(ids.map(id => syncItemToSupabase({ id, user_id: userId }, 'delete')));
        }
        return sendJson(res, 200, { success: true, count: ids.length });
      }

      if (action === 'rename_group') {
        const oldGroup = body.oldGroup || '';
        const newGroup = body.newGroup ? String(body.newGroup).trim() : null;
        if (oldGroup) {
          db.prepare('UPDATE items SET group_name = ?, updated_at = ? WHERE user_id = ? AND group_name = ?')
            .run(newGroup, now, userId, oldGroup);

          if (SUPABASE_URL && SUPABASE_ANON_KEY && userId && userId !== 'guest') {
            const targetUserId = toUUID(userId);
            await fetch(`${SUPABASE_URL}/rest/v1/wishlist_items?user_id=eq.${encodeURIComponent(targetUserId)}&group=eq.${encodeURIComponent(oldGroup)}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ group: newGroup, updated_at: now })
            }).catch(e => console.warn('Supabase rename group error:', e.message));
          }
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
            const title = cleanProductTitle(String(item.title || item.name || 'Untitled'));
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
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
};

// Start standalone HTTP server when not in Vercel serverless environment
if (!process.env.VERCEL) {
  const server = http.createServer({ maxHeaderSize: 65536 }, handler);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Wishlist Server is running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = handler;
