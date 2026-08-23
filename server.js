const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
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
  if (/\b(headphone|headphones|earphone|earphones|tws|iem|speaker|speakers|airpods|audio|mic|microphone|soundbar)\b/.test(t)) return 'Audio';
  if (/\b(baju|kaos|kemeja|celana|hoodie|jacket|jaket|sepatu|sneaker|sneakers|dress|outfit|shirt|tshirt|shoes|pants|sock|socks)\b/.test(t)) return 'Outfit';
  if (/\b(monitor|keyboard|mouse|desk|pad|deskmat|holder|stand|lampu meja|lightbar)\b/.test(t)) return 'Desk Setup';
  if (/\b(game|playstation|nintendo|xbox|ps5|switch|controller|gamepad|steam deck|rog ally)\b/.test(t)) return 'Gaming';
  if (/\b(kamera|camera|lensa|lens|tripod|gimbal|drone|lighting|fujifilm|lumix)\b/.test(t)) return 'Photography';
  if (/\b(laptop|pc|macbook|ipad|tablet|iphone|android|samsung|charger|hub|ssd|ram|gpu|gadget)\b/.test(t)) return 'Electronics';
  if (/\b(buku|book|novel|komik|comic|manga|kindle)\b/.test(t)) return 'Books';
  if (/\b(gym|dumbbell|barbell|matras|yoga|sepeda|running|sports)\b/.test(t)) return 'Fitness';
  if (/\b(cangkir|tumbler|mug|kasur|bantal|sprei|diffuser|lampu|meja|kursi|sofa)\b/.test(t)) return 'Home & Living';
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

  // 2. Fetch page / resolve shortlinks
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  // API Endpoint: /api/scrape-product
  if (req.method === 'POST' && reqPath === '/api/scrape-product') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL parameter is required' }));
          return;
        }
        const data = await scrapeProduct(url);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
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

server.listen(PORT, () => {
  console.log(`Zero-Cache Server running at http://localhost:${PORT}`);
});
