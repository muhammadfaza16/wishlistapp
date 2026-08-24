// app.js - WISHLIST Application Engine

const safeCreateLucideIcons = () => {
  try {
    if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {}
};

const generateId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {}
  return 'id_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

let liveExchangeRateUSDToIDR = 16000;

const fetchLiveExchangeRate = async () => {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.IDR) {
        liveExchangeRateUSDToIDR = data.rates.IDR;
        console.log('Live Exchange Rate updated: 1 USD =', liveExchangeRateUSDToIDR, 'IDR');
        if (typeof render === 'function') render();
      }
    }
  } catch (e) {
    console.warn('Using default exchange rate fallback:', liveExchangeRateUSDToIDR);
  }
};

const convertCurrency = (amount, fromCurrency, toCurrency) => {
  const num = Number(amount) || 0;
  const from = fromCurrency || 'IDR';
  const to = toCurrency || 'IDR';
  if (from === to) return num;
  if (from === 'USD' && to === 'IDR') {
    return num * liveExchangeRateUSDToIDR;
  }
  if (from === 'IDR' && to === 'USD') {
    return num / liveExchangeRateUSDToIDR;
  }
  return num;
};

const getItemDisplayPrice = (item, targetCurrency = state.currency) => {
  const srcCurrency = item.currency || 'IDR';
  const srcPrice = item.originalPrice !== undefined ? item.originalPrice : item.price;
  return convertCurrency(srcPrice, srcCurrency, targetCurrency);
};

const getItemDisplaySaved = (item, targetCurrency = state.currency) => {
  const srcCurrency = item.currency || 'IDR';
  const srcSaved = item.originalSaved !== undefined ? item.originalSaved : item.saved;
  return convertCurrency(srcSaved, srcCurrency, targetCurrency);
};

const formatCurrencyValue = (amount, currencyCode = state.currency) => {
  const num = Number(amount) || 0;
  if (currencyCode === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: num % 1 === 0 ? 0 : 2
    }).format(num);
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

const formatItemPrice = (item) => {
  const val = getItemDisplayPrice(item);
  return formatCurrencyValue(val, state.currency);
};

const formatItemSaved = (item) => {
  const val = getItemDisplaySaved(item);
  return formatCurrencyValue(val, state.currency);
};

const formatCurrency = (amountIdr) => {
  const numIdr = Number(amountIdr) || 0;
  if (state.currency === 'USD') {
    const amountUsd = numIdr / liveExchangeRateUSDToIDR;
    return formatCurrencyValue(amountUsd, 'USD');
  }
  return formatCurrencyValue(numIdr, 'IDR');
};

const getProgress = (item) => {
  if (!item) return 0;
  const pVal = getItemDisplayPrice(item, 'IDR');
  const sVal = getItemDisplaySaved(item, 'IDR');
  if (pVal <= 0) return 0;
  const p = (sVal / pVal) * 100;
  return p > 100 ? 100 : p;
};

const getValidUrl = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeUrlForComparison = (url) => {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim();
  if (!clean) return '';
  
  // Prepend https:// if protocol missing for URL parser
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }
  
  try {
    const parsed = new URL(clean);
    // Lowercase hostname and strip leading 'www.'
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    // Strip trailing slashes from pathname
    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname === '/') pathname = '';
    
    // Strip common tracking query params
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid', 'igshid'];
    trackingParams.forEach(p => searchParams.delete(p));
    const search = searchParams.toString();
    
    return host + pathname + (search ? '?' + search : '');
  } catch {
    return clean.toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  }
};

const findDuplicateItemByLink = (url, excludeId = null) => {
  if (!url || typeof url !== 'string') return null;
  const targetNorm = normalizeUrlForComparison(url);
  if (!targetNorm) return null;

  // Check Quick Notes items
  if (state.notesItems && Array.isArray(state.notesItems)) {
    for (const note of state.notesItems) {
      if (note.id !== excludeId && note.link && note.link.trim()) {
        const noteNorm = normalizeUrlForComparison(note.link);
        if (noteNorm && noteNorm === targetNorm) {
          return { item: note, title: note.title || 'Untitled Note', type: 'note' };
        }
      }
    }
  }

  // Check Catalog Wishlist items
  if (state.items && Array.isArray(state.items)) {
    for (const catItem of state.items) {
      if (catItem.id !== excludeId && catItem.link && catItem.link.trim()) {
        const catNorm = normalizeUrlForComparison(catItem.link);
        if (catNorm && catNorm === targetNorm) {
          return { item: catItem, title: catItem.name || 'Untitled Item', type: 'catalog' };
        }
      }
    }
  }

  return null;
};

const resetQuickNoteLinkWarning = () => {
  const warningEl = document.getElementById('quick-note-link-warning');
  const linkInput = document.getElementById('quick-note-link-input');
  if (warningEl) {
    warningEl.classList.add('hidden');
    warningEl.textContent = '';
  }
  if (linkInput) {
    linkInput.classList.remove('input-warning-border');
  }
};

const validateQuickNoteLinkInput = () => {
  const input = document.getElementById('quick-note-link-input');
  const warningEl = document.getElementById('quick-note-link-warning');
  if (!input || !warningEl) return null;

  const val = input.value.trim();
  if (!val) {
    resetQuickNoteLinkWarning();
    return null;
  }

  const duplicate = findDuplicateItemByLink(val, state.editingNoteId);
  if (duplicate) {
    warningEl.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Link already exists in "${duplicate.title}"`;
    warningEl.classList.remove('hidden');
    input.classList.add('input-warning-border');
    safeCreateLucideIcons();
    return duplicate;
  } else {
    resetQuickNoteLinkWarning();
    return null;
  }
};

const resetCatalogLinkWarning = () => {
  const warningEl = document.getElementById('item-link-warning');
  const linkInput = document.getElementById('item-link');
  if (warningEl) {
    warningEl.classList.add('hidden');
    warningEl.textContent = '';
  }
  if (linkInput) {
    linkInput.classList.remove('input-warning-border');
  }
};

const validateCatalogLinkInput = () => {
  const input = document.getElementById('item-link');
  const warningEl = document.getElementById('item-link-warning');
  if (!input || !warningEl) return null;

  const val = input.value.trim();
  if (!val) {
    resetCatalogLinkWarning();
    return null;
  }

  const duplicate = findDuplicateItemByLink(val, state.editingId);
  if (duplicate) {
    warningEl.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Link already exists in "${duplicate.title}"`;
    warningEl.classList.remove('hidden');
    input.classList.add('input-warning-border');
    safeCreateLucideIcons();
    return duplicate;
  } else {
    resetCatalogLinkWarning();
    return null;
  }
};

const clientGuessGroupFromTitle = (title) => {
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

const extractClientSlug = (url) => {
  try {
    let clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    const parsed = new URL(clean);
    if (parsed.hostname.includes('shopee.')) {
      const match = parsed.pathname.match(/\/([^/?#]+)-i\.(\d+)\.(\d+)/);
      if (match && match[1]) {
        let title = decodeURIComponent(match[1]).replace(/[-_+]/g, ' ').trim();
        title = title.replace(/^Jual\s+/i, '').replace(/\s+/g, ' ');
        return { title, suggestedGroup: clientGuessGroupFromTitle(title) };
      }
    }
    if (parsed.hostname.includes('tokopedia.')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        let title = decodeURIComponent(parts[parts.length - 1]).replace(/[-_+]/g, ' ').trim();
        title = title.replace(/^Jual\s+/i, '').replace(/\s+/g, ' ');
        return { title, suggestedGroup: clientGuessGroupFromTitle(title) };
      }
    }
  } catch (e) {}
  return null;
};

const fetchProductMetadata = async (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length < 5) return null;

  try {
    const res = await fetch('/api/scrape-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return data;
      }
    }
  } catch (err) {
    // Fallback to client-side extraction if server error / offline
  }

  // Client-side fallback
  const clientFallback = extractClientSlug(trimmed);
  if (clientFallback && clientFallback.title) {
    return {
      success: true,
      title: clientFallback.title,
      price: 0,
      imageUrl: '',
      brand: '',
      suggestedGroup: clientFallback.suggestedGroup
    };
  }

  return null;
};

const processImageFile = (file, callback) => {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1200;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

const makeImagePannable = (wrapperEl, imgEl, indicatorEl) => {
  if (!wrapperEl || !imgEl) return () => {};

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let isPannable = false;

  const updateBounds = () => {
    if (!imgEl.naturalWidth || !imgEl.naturalHeight) return;
    const cW = wrapperEl.clientWidth;
    const cH = wrapperEl.clientHeight;
    if (!cW || !cH) return;

    // Calculate actual displayed dimensions with cover scaling
    const s = Math.max(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight);
    const rW = Math.round(imgEl.naturalWidth * s);
    const rH = Math.round(imgEl.naturalHeight * s);

    // Set width and height on img
    imgEl.style.width = `${rW}px`;
    imgEl.style.height = `${rH}px`;

    minX = cW - rW;
    maxX = 0;
    minY = cH - rH;
    maxY = 0;

    isPannable = minX < -2 || minY < -2;

    if (isPannable) {
      wrapperEl.classList.add('can-pan');
      if (indicatorEl) {
        indicatorEl.classList.remove('hidden');
        indicatorEl.style.opacity = '1';
      }
    } else {
      wrapperEl.classList.remove('can-pan');
      if (indicatorEl) indicatorEl.classList.add('hidden');
    }

    // Center initially or clamp
    currentX = Math.round(minX / 2);
    currentY = Math.round(minY / 2);
    imgEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
  };

  imgEl.addEventListener('load', () => setTimeout(updateBounds, 30));

  wrapperEl.addEventListener('pointerdown', (e) => {
    if (!isPannable) return;
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX - currentX;
    startY = e.clientY - currentY;
    wrapperEl.classList.add('is-panning');
    try {
      wrapperEl.setPointerCapture(e.pointerId);
    } catch (err) {}
    if (indicatorEl) indicatorEl.style.opacity = '0';
  });

  wrapperEl.addEventListener('pointermove', (e) => {
    if (!isDragging || !isPannable) return;
    e.preventDefault();
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    // Clamp within container
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    currentX = newX;
    currentY = newY;
    imgEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      wrapperEl.classList.remove('is-panning');
      try {
        wrapperEl.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  wrapperEl.addEventListener('pointerup', stopDrag);
  wrapperEl.addEventListener('pointercancel', stopDrag);

  return updateBounds;
};

let state = {
  currentUser: null,
  items: [],
  view: 'grid',
  sort: 'priority',
  currency: 'IDR',
  activeTab: 'notes',
  notesMode: 'list',
  notesViewMode: 'view',
  notesSortBy: null,
  notesItems: [],
  rawNotepadText: '',
  filters: [],
  search: '',
  editingId: null,
  deleteId: null,
  progressId: null,
  achievedOpen: false,
  editingNoteId: null,
  isSelectionMode: false,
  selectedNoteIds: new Set(),
  renamingGroupName: null,
  collapsedGroups: new Set(),
  currentQuickNoteImageData: null
};

// Authentication & Backend SQLite Cross-Device Data Sync
const AUTH_TOKEN_KEY = 'wishlist_auth_token';
const SESSION_STORAGE_KEY = 'wishlist_active_session';

const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch (e) {
    return null;
  }
};

const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
};

const getActiveSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const setActiveSession = (session) => {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
};

const defaultNotesItems = [
  { id: 'note-1', title: 'Keychron Q1 Max Keyboard', price: 3200000, currency: 'IDR', checked: false, group: 'Desk Setup Gear', priority: 1, createdAt: '2026-08-01T10:00:00.000Z' },
  { id: 'note-2', title: 'BenQ Monitor Light Bar', price: 650000, currency: 'IDR', checked: true, group: 'Desk Setup Gear', priority: 2, createdAt: '2026-08-05T14:00:00.000Z' },
  { id: 'note-3', title: 'Ergonomic Mesh Chair', price: 4500000, currency: 'IDR', checked: false, group: null, priority: 1, createdAt: '2026-08-10T09:00:00.000Z' }
];

const defaultItems = [
  {
    id: 'sample-3',
    brand: 'Daisy',
    name: 'Daisy One Headphones',
    currency: 'USD',
    originalPrice: 400,
    originalSaved: 260,
    price: 6400000,
    saved: 4160000,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
    imageData: null,
    link: 'https://curated.supply',
    tags: ['Tech', 'Audio'],
    priority: 1,
    achieved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sample-1',
    brand: 'Teenage Engineering',
    name: 'OP-1 Field Synthesizer',
    currency: 'USD',
    originalPrice: 1999,
    originalSaved: 1125,
    price: 31984000,
    saved: 18000000,
    imageUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=600&auto=format&fit=crop&q=80',
    imageData: null,
    link: 'https://teenage.engineering/store/op-1-field/',
    tags: ['Tech', 'Audio'],
    priority: 1,
    achieved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sample-2',
    brand: 'Leica',
    name: 'M11 Rangefinder Camera',
    currency: 'IDR',
    originalPrice: 135000000,
    originalSaved: 45000000,
    price: 135000000,
    saved: 45000000,
    imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80',
    imageData: null,
    link: 'https://leica-camera.com/',
    tags: ['Camera', 'Design'],
    priority: 2,
    achieved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const loadScopedData = () => {
  const userId = state.currentUser ? state.currentUser.id : 'guest';

  const scopedItemsKey = `wishlist_u_${userId}_items`;
  const scopedNotesKey = `wishlist_u_${userId}_notes`;
  const scopedNotepadKey = `wishlist_u_${userId}_notepad`;
  const scopedPrefsKey = `wishlist_u_${userId}_state`;

  let storedItems = null;
  let storedNotes = null;
  let storedNotepad = null;
  let storedPrefs = null;

  try {
    storedItems = localStorage.getItem(scopedItemsKey);
    storedNotes = localStorage.getItem(scopedNotesKey);
    storedNotepad = localStorage.getItem(scopedNotepadKey);
    storedPrefs = localStorage.getItem(scopedPrefsKey);

    // ONLY migrate legacy keys if current user is guest
    if (userId === 'guest') {
      if (storedItems === null && localStorage.getItem('wishlist_items') !== null) {
        storedItems = localStorage.getItem('wishlist_items');
        localStorage.setItem(scopedItemsKey, storedItems);
        localStorage.removeItem('wishlist_items');
      }
      if (storedNotes === null && localStorage.getItem('wishlist_notes_items') !== null) {
        storedNotes = localStorage.getItem('wishlist_notes_items');
        localStorage.setItem(scopedNotesKey, storedNotes);
        localStorage.removeItem('wishlist_notes_items');
      }
      if (storedNotepad === null && localStorage.getItem('wishlist_raw_notepad') !== null) {
        storedNotepad = localStorage.getItem('wishlist_raw_notepad');
        localStorage.setItem(scopedNotepadKey, storedNotepad);
        localStorage.removeItem('wishlist_raw_notepad');
      }
      if (storedPrefs === null && localStorage.getItem('wishlist_state') !== null) {
        storedPrefs = localStorage.getItem('wishlist_state');
        localStorage.setItem(scopedPrefsKey, storedPrefs);
        localStorage.removeItem('wishlist_state');
      }
    }
  } catch (e) {
    console.warn('localStorage read error:', e);
  }

  // Items Sanitization
  // If storedItems is null: guest gets defaultItems, registered user gets []
  const fallbackItems = userId === 'guest' ? defaultItems : [];
  if (storedItems !== null) {
    try {
      const parsed = JSON.parse(storedItems);
      const list = Array.isArray(parsed) ? parsed : fallbackItems;
      state.items = list.map(item => {
        if (!item || typeof item !== 'object') return null;
        let tags = [];
        if (Array.isArray(item.tags)) {
          tags = item.tags.filter(t => typeof t === 'string' && t.trim());
        } else if (typeof item.tags === 'string' && item.tags) {
          tags = item.tags.split(',').map(t => t.trim()).filter(Boolean);
        }
        return {
          id: item.id || generateId(),
          name: item.name || 'Untitled Wish',
          brand: item.brand || '',
          currency: item.currency || 'IDR',
          originalPrice: Number(item.originalPrice) || Number(item.price) || 0,
          originalSaved: Number(item.originalSaved) || Number(item.saved) || 0,
          price: Number(item.price) || 0,
          saved: Number(item.saved) || 0,
          imageUrl: item.imageUrl || '',
          imageData: item.imageData || null,
          link: item.link || '',
          tags: tags,
          priority: Number(item.priority) || 1,
          achieved: !!item.achieved,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        };
      }).filter(Boolean);
    } catch {
      state.items = fallbackItems;
    }
  } else {
    state.items = fallbackItems;
  }

  // Notes Sanitization
  // If storedNotes is null: guest gets defaultNotesItems, registered user gets []
  const fallbackNotes = userId === 'guest' ? defaultNotesItems : [];
  if (storedNotes !== null) {
    try {
      const raw = JSON.parse(storedNotes);
      const groupMap = {};
      if (Array.isArray(raw)) {
        raw.filter(i => i && i.isGroup).forEach(g => { groupMap[g.id] = g.title; });
        state.notesItems = raw.filter(i => i && !i.isGroup).map(i => ({
          id: i.id || generateId(),
          title: i.title || 'Untitled Note',
          price: Number(i.price) || 0,
          currency: i.currency || state.currency,
          checked: !!i.checked,
          group: (typeof i.group === 'string' && i.group.trim()) ? i.group.trim() : (i.parentId && groupMap[i.parentId]) || null,
          link: i.link || '',
          imageData: i.imageData || null,
          imageUrl: i.imageUrl || '',
          priority: Number(i.priority) || 2,
          createdAt: i.createdAt || new Date().toISOString()
        }));
      } else {
        state.notesItems = fallbackNotes;
      }
    } catch (e) {
      state.notesItems = fallbackNotes;
    }
  } else {
    state.notesItems = fallbackNotes;
  }

  // Raw Notepad
  const fallbackNotepad = userId === 'guest' ? "Keychron Keyboard - 3200000\nMonitor Light Bar - 650000 [x]\nErgonomic Chair - 4500000" : "";
  state.rawNotepadText = storedNotepad !== null ? storedNotepad : fallbackNotepad;

  // Preferences
  if (storedPrefs) {
    try {
      const prefs = JSON.parse(storedPrefs);
      if (prefs && typeof prefs === 'object') {
        state.view = prefs.view || 'grid';
        state.sort = prefs.sort || 'priority';
        state.currency = prefs.currency || 'IDR';
        state.activeTab = prefs.activeTab || 'notes';
        state.notesMode = prefs.notesMode || 'list';
        state.notesViewMode = prefs.notesViewMode || 'view';
        state.notesSortBy = prefs.notesSortBy || null;
      }
    } catch (e) {}
  }

  // Guarantee runtime state data structures
  if (!(state.selectedNoteIds instanceof Set)) state.selectedNoteIds = new Set();
  if (!(state.collapsedGroups instanceof Set)) state.collapsedGroups = new Set();
  if (!Array.isArray(state.filters)) state.filters = [];
};

let syncDebounceTimer = null;

const triggerSyncToBackend = () => {
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDataToBackend();
  }, 600);
};

const syncDataToBackend = async () => {
  const token = getAuthToken();
  if (!token || !state.currentUser || state.currentUser.isGuest) return;

  try {
    const payload = {
      items: state.items,
      notes: state.notesItems,
      notepadText: state.rawNotepadText,
      preferences: {
        view: state.view,
        sort: state.sort,
        currency: state.currency,
        activeTab: state.activeTab,
        notesMode: state.notesMode,
        notesViewMode: state.notesViewMode || 'view',
        notesSortBy: state.notesSortBy || null
      }
    };

    await fetch('/api/user/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Backend sync failed:', err.message);
  }
};

const syncDataFromBackend = async () => {
  const token = getAuthToken();
  if (!token || !state.currentUser || state.currentUser.isGuest) return;

  try {
    const res = await fetch('/api/user/sync', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        setAuthToken(null);
      }
      return;
    }

    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }
    if (json && json.success && json.data) {
      const d = json.data;
      const userId = state.currentUser.id;

      // If server has items, load them
      if (Array.isArray(d.items)) {
        state.items = d.items;
        localStorage.setItem(`wishlist_u_${userId}_items`, JSON.stringify(state.items));
      }

      // If server has notes, load them
      if (Array.isArray(d.notes)) {
        state.notesItems = d.notes;
        localStorage.setItem(`wishlist_u_${userId}_notes`, JSON.stringify(state.notesItems));
      }

      // Notepad text
      if (typeof d.notepadText === 'string') {
        state.rawNotepadText = d.notepadText;
        localStorage.setItem(`wishlist_u_${userId}_notepad`, state.rawNotepadText);
      }

      // Preferences
      if (d.preferences && typeof d.preferences === 'object') {
        const p = d.preferences;
        if (p.view) state.view = p.view;
        if (p.sort) state.sort = p.sort;
        if (p.currency) state.currency = p.currency;
        if (p.activeTab) state.activeTab = p.activeTab;
        if (p.notesMode) state.notesMode = p.notesMode;
        if (p.notesViewMode) state.notesViewMode = p.notesViewMode;
        if (p.notesSortBy) state.notesSortBy = p.notesSortBy;
        localStorage.setItem(`wishlist_u_${userId}_state`, JSON.stringify(p));
      }

      render();
      renderNotesView();
      updateSortUI();
      updateCurrencyUI();
    }
  } catch (err) {
    console.warn('Sync from backend failed:', err.message);
  }
};

const saveItems = () => {
  const userId = state.currentUser ? state.currentUser.id : 'guest';
  localStorage.setItem(`wishlist_u_${userId}_items`, JSON.stringify(state.items));
  triggerSyncToBackend();
};

const saveNotes = () => {
  const userId = state.currentUser ? state.currentUser.id : 'guest';
  localStorage.setItem(`wishlist_u_${userId}_notes`, JSON.stringify(state.notesItems));
  localStorage.setItem(`wishlist_u_${userId}_notepad`, state.rawNotepadText);
  triggerSyncToBackend();
};

const savePreferences = () => {
  const userId = state.currentUser ? state.currentUser.id : 'guest';
  localStorage.setItem(`wishlist_u_${userId}_state`, JSON.stringify({
    view: state.view,
    sort: state.sort,
    currency: state.currency,
    activeTab: state.activeTab,
    notesMode: state.notesMode,
    notesViewMode: state.notesViewMode || 'view',
    notesSortBy: state.notesSortBy || null
  }));
  triggerSyncToBackend();
};

const LOCAL_USERS_KEY = 'wishlist_local_users';

const getLocalUsers = () => {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveLocalUsers = (users) => {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {}
};

const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
};

const registerUser = async (name, emailOrUsername, password) => {
  const cleanName = (name || '').trim();
  const cleanIdent = (emailOrUsername || '').trim().toLowerCase();

  if (!cleanName) throw new Error('Please enter your full name');
  if (!cleanIdent || cleanIdent.length < 3) throw new Error('Email or username must be at least 3 characters');
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');

  let serverOk = false;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, emailOrUsername: cleanIdent, password })
    });

    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    if (json && res.ok && json.success) {
      serverOk = true;
      setAuthToken(json.token);
      const session = {
        id: json.user.id,
        name: json.user.name,
        email: json.user.email,
        username: json.user.username,
        isGuest: false,
        loggedInAt: new Date().toISOString()
      };
      setActiveSession(session);
      state.currentUser = session;

      // Initialize fresh user storage cleanly
      state.items = [];
      state.notesItems = [];
      state.rawNotepadText = "";
      localStorage.setItem(`wishlist_u_${session.id}_items`, JSON.stringify([]));
      localStorage.setItem(`wishlist_u_${session.id}_notes`, JSON.stringify([]));
      localStorage.setItem(`wishlist_u_${session.id}_notepad`, "");

      updateUserProfileUI();
      render();
      renderNotesView();
      showToast(`Account created! Welcome, ${session.name}!`);
      closeAuthModal();
      return;
    } else if (json && json.error) {
      throw new Error(json.error);
    }
  } catch (err) {
    if (err.message && !err.message.includes('fetch') && !err.message.includes('JSON') && !err.message.includes('NetworkError') && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // Local fallback registration if backend unavailable
  const isEmail = cleanIdent.includes('@');
  const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const localUsers = getLocalUsers();
  const existing = localUsers.find(u => (u.email && u.email.toLowerCase() === cleanIdent) || (u.username && u.username.toLowerCase() === cleanIdent));
  if (existing) throw new Error('An account with this email/username already exists');

  const newUser = {
    id: userId,
    name: cleanName,
    email: isEmail ? cleanIdent : cleanIdent + '@user',
    username: isEmail ? cleanIdent.split('@')[0] : cleanIdent,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString()
  };
  localUsers.push(newUser);
  saveLocalUsers(localUsers);

  const session = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    username: newUser.username,
    isGuest: false,
    loggedInAt: new Date().toISOString()
  };
  setActiveSession(session);
  state.currentUser = session;
  state.items = [];
  state.notesItems = [];
  state.rawNotepadText = "";
  localStorage.setItem(`wishlist_u_${session.id}_items`, JSON.stringify([]));
  localStorage.setItem(`wishlist_u_${session.id}_notes`, JSON.stringify([]));
  localStorage.setItem(`wishlist_u_${session.id}_notepad`, "");
  updateUserProfileUI();
  render();
  renderNotesView();
  showToast(`Account created! Welcome, ${session.name}!`);
  closeAuthModal();
};

const loginUser = async (emailOrUsername, password) => {
  const cleanIdent = (emailOrUsername || '').trim().toLowerCase();
  if (!cleanIdent || !password) throw new Error('Please enter your email/username and password');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: cleanIdent, password })
    });

    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    if (json && res.ok && json.success) {
      setAuthToken(json.token);
      const session = {
        id: json.user.id,
        name: json.user.name,
        email: json.user.email,
        username: json.user.username,
        isGuest: false,
        loggedInAt: new Date().toISOString()
      };
      setActiveSession(session);
      state.currentUser = session;

      loadScopedData();
      updateUserProfileUI();
      await syncDataFromBackend();
      render();
      renderNotesView();
      showToast(`Welcome back, ${session.name}!`);
      closeAuthModal();
      return;
    } else if (json && json.error) {
      throw new Error(json.error);
    } else if (res.status === 401) {
      throw new Error('Invalid email/username or password');
    }
  } catch (err) {
    if (err.message && !err.message.includes('fetch') && !err.message.includes('JSON') && !err.message.includes('NetworkError') && !err.message.includes('Failed to fetch')) {
      throw err;
    }
  }

  // Local fallback login
  const localUsers = getLocalUsers();
  const pwdHash = simpleHash(password);
  const user = localUsers.find(u =>
    ((u.email && u.email.toLowerCase() === cleanIdent) || (u.username && u.username.toLowerCase() === cleanIdent)) &&
    u.passwordHash === pwdHash
  );

  if (!user) {
    throw new Error('Invalid email/username or password');
  }

  const session = {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    isGuest: false,
    loggedInAt: new Date().toISOString()
  };
  setActiveSession(session);
  state.currentUser = session;
  loadScopedData();
  updateUserProfileUI();
  render();
  renderNotesView();
  showToast(`Welcome back, ${session.name}!`);
  closeAuthModal();
};

const loginAsGuest = () => {
  setAuthToken(null);
  const session = {
    id: 'guest',
    name: 'Guest User',
    email: 'guest@local',
    username: 'guest',
    isGuest: true,
    loggedInAt: new Date().toISOString()
  };
  setActiveSession(session);
  state.currentUser = session;
  loadScopedData();
  updateUserProfileUI();
  render();
  renderNotesView();
  showToast('Signed in as Guest');
  closeAuthModal();
};

const logoutUser = async () => {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }

  setAuthToken(null);
  setActiveSession(null);
  state.currentUser = null;
  loadScopedData();
  updateUserProfileUI();
  render();
  renderNotesView();
  showToast('Logged out');
};

const updateUserProfileUI = () => {
  const displayNameEl = document.getElementById('user-display-name');
  const avatarBadgeEl = document.getElementById('user-avatar-badge');
  const dropdownAvatarEl = document.getElementById('dropdown-user-avatar');
  const dropdownNameEl = document.getElementById('dropdown-user-name');
  const dropdownEmailEl = document.getElementById('dropdown-user-email');
  const dropdownNotesCount = document.getElementById('dropdown-notes-count');
  const dropdownCatalogCount = document.getElementById('dropdown-catalog-count');
  const logoutBtn = document.getElementById('dropdown-logout-btn');
  const switchBtn = document.getElementById('dropdown-switch-user-btn');

  const u = state.currentUser;
  const notesCount = state.notesItems ? state.notesItems.length : 0;
  const catalogCount = state.items ? state.items.length : 0;

  if (dropdownNotesCount) dropdownNotesCount.textContent = notesCount;
  if (dropdownCatalogCount) dropdownCatalogCount.textContent = catalogCount;

  if (u && !u.isGuest) {
    const initials = (u.name || u.username || 'U').charAt(0).toUpperCase();
    if (displayNameEl) displayNameEl.textContent = u.name || u.username;
    if (avatarBadgeEl) avatarBadgeEl.textContent = initials;
    if (dropdownAvatarEl) dropdownAvatarEl.textContent = initials;
    if (dropdownNameEl) dropdownNameEl.textContent = u.name || u.username;
    if (dropdownEmailEl) dropdownEmailEl.textContent = u.email || '';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (switchBtn && switchBtn.querySelector('span')) switchBtn.querySelector('span').textContent = 'Switch Account';
  } else if (u && u.isGuest) {
    if (displayNameEl) displayNameEl.textContent = 'Guest';
    if (avatarBadgeEl) avatarBadgeEl.innerHTML = '<i data-lucide="user" class="avatar-icon"></i>';
    if (dropdownAvatarEl) dropdownAvatarEl.innerHTML = '<i data-lucide="user"></i>';
    if (dropdownNameEl) dropdownNameEl.textContent = 'Guest User';
    if (dropdownEmailEl) dropdownEmailEl.textContent = 'Temporary Local Session';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (switchBtn && switchBtn.querySelector('span')) switchBtn.querySelector('span').textContent = 'Sign In / Register';
  } else {
    if (displayNameEl) displayNameEl.textContent = 'Sign In';
    if (avatarBadgeEl) avatarBadgeEl.innerHTML = '<i data-lucide="user" class="avatar-icon"></i>';
    if (dropdownAvatarEl) dropdownAvatarEl.innerHTML = '<i data-lucide="user"></i>';
    if (dropdownNameEl) dropdownNameEl.textContent = 'Not Signed In';
    if (dropdownEmailEl) dropdownEmailEl.textContent = 'Click to sign in or register';
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (switchBtn && switchBtn.querySelector('span')) switchBtn.querySelector('span').textContent = 'Sign In / Register';
  }

  safeCreateLucideIcons();
};

let currentAuthMode = 'signin';

const openAuthModal = (mode = 'signin') => {
  const modal = document.getElementById('auth-modal');
  const errorBox = document.getElementById('auth-error-box');
  const form = document.getElementById('auth-form');
  if (!modal) return;

  if (errorBox) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }
  if (form && typeof form.reset === 'function') form.reset();

  setAuthMode(mode);
  modal.classList.remove('hidden');
  safeCreateLucideIcons();

  const userDropdown = document.getElementById('user-profile-dropdown');
  const userWrapper = document.getElementById('user-profile-wrapper');
  if (userDropdown) userDropdown.classList.add('hidden');
  if (userWrapper) userWrapper.classList.remove('open');
};

const closeAuthModal = () => {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
};

const setAuthMode = (mode) => {
  currentAuthMode = mode;
  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  const nameGroup = document.getElementById('auth-name-group');
  const nameInput = document.getElementById('auth-name-input');
  const submitText = document.getElementById('auth-submit-text');
  const emailLabel = document.getElementById('auth-email-label');
  const errorBox = document.getElementById('auth-error-box');

  if (errorBox) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  if (mode === 'signup') {
    tabSignup?.classList.add('active');
    tabSignin?.classList.remove('active');
    nameGroup?.classList.remove('hidden');
    if (nameInput) nameInput.required = true;
    if (submitText) submitText.textContent = 'Create Account';
    if (emailLabel) emailLabel.textContent = 'Email or Username';
  } else {
    tabSignin?.classList.add('active');
    tabSignup?.classList.remove('active');
    nameGroup?.classList.add('hidden');
    if (nameInput) nameInput.required = false;
    if (submitText) submitText.textContent = 'Sign In';
    if (emailLabel) emailLabel.textContent = 'Email or Username';
  }
};

const getAllTags = () => {
  const tags = new Set();
  state.items.forEach(item => {
    if (!item.achieved && item.tags) {
      item.tags.forEach(t => tags.add(t));
    }
  });
  return Array.from(tags).sort();
};

const showToast = (message) => {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
};

const showConfirmDialog = ({ title = 'Confirm Action', message = 'Are you sure?', confirmText = 'Confirm', onConfirm }) => {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const actionBtn = document.getElementById('confirm-modal-action-btn');
  
  if (!modal || !msgEl || !actionBtn) return;
  
  if (titleEl) titleEl.textContent = title;
  msgEl.textContent = message;
  actionBtn.textContent = confirmText;
  
  modal.classList.remove('hidden');
  
  const closeConfirmModal = () => {
    modal.classList.add('hidden');
  };
  
  const newActionBtn = actionBtn.cloneNode(true);
  actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
  
  newActionBtn.addEventListener('click', () => {
    closeConfirmModal();
    if (typeof onConfirm === 'function') onConfirm();
  });

  document.querySelectorAll('.confirm-modal-close').forEach(btn => {
    btn.onclick = closeConfirmModal;
  });
};

const groupIconPresets = [
  { name: 'Outfit', icon: 'shirt', keywords: ['outfit', 'fashion', 'cloth', 'wear', 'shoes', 'apparel', 'wardrobe', 'jacket', 'pants', 'shirt', 'dress'] },
  { name: 'Electronics', icon: 'laptop', keywords: ['electron', 'tech', 'gadget', 'device', 'phone', 'computer', 'apple', 'ipad', 'mac', 'pc'] },
  { name: 'Desk Setup', icon: 'monitor', keywords: ['desk', 'setup', 'workspace', 'monitor', 'keyboard', 'mouse', 'chair', 'lamp', 'screen'] },
  { name: 'Home & Living', icon: 'home', keywords: ['home', 'living', 'room', 'house', 'kitchen', 'furniture', 'decor', 'bed', 'sofa'] },
  { name: 'Audio', icon: 'headphones', keywords: ['audio', 'music', 'sound', 'headphone', 'earphone', 'speaker', 'mic', 'iem', 'airpods'] },
  { name: 'Gaming', icon: 'gamepad-2', keywords: ['game', 'gaming', 'console', 'playstation', 'nintendo', 'steam', 'xbox', 'switch'] },
  { name: 'Travel', icon: 'plane', keywords: ['travel', 'trip', 'holiday', 'vacation', 'flight', 'bag', 'luggage', 'passport'] },
  { name: 'Photography', icon: 'camera', keywords: ['photo', 'camera', 'lens', 'video', 'cinematography', 'leica', 'sony', 'fuji'] },
  { name: 'Fitness', icon: 'dumbbell', keywords: ['fit', 'gym', 'sport', 'workout', 'exercise', 'health', 'running', 'training'] },
  { name: 'Books', icon: 'book-open', keywords: ['book', 'read', 'study', 'course', 'learn', 'magazine', 'novel'] }
];

const getGroupIcon = (groupName) => {
  if (!groupName || typeof groupName !== 'string') return 'folder';
  const lower = groupName.toLowerCase().trim();
  for (const preset of groupIconPresets) {
    if (preset.keywords.some(k => lower.includes(k))) {
      return preset.icon;
    }
  }
  return 'folder';
};

const renderGroupPresets = (containerId, targetInputId) => {
  const container = document.getElementById(containerId);
  const targetInput = document.getElementById(targetInputId);
  if (!container || !targetInput) return;

  const currentVal = targetInput.value.trim().toLowerCase();
  container.innerHTML = groupIconPresets.map(p => `
    <button type="button" class="category-preset-chip ${currentVal === p.name.toLowerCase() ? 'active' : ''}" data-name="${p.name}">
      <i data-lucide="${p.icon}"></i>
      <span>${p.name}</span>
    </button>
  `).join('');

  safeCreateLucideIcons();
};

const getExistingGroupNames = () => {
  const groups = new Set();
  groupIconPresets.forEach(p => groups.add(p.name));
  state.notesItems.forEach(i => {
    if (i.group && typeof i.group === 'string' && i.group.trim()) {
      groups.add(i.group.trim());
    }
  });
  return Array.from(groups);
};

const populateGroupDatalist = () => {
  const datalists = document.querySelectorAll('#group-options-list');
  const groupNames = getExistingGroupNames();
  datalists.forEach(dl => {
    dl.innerHTML = groupNames.map(g => `<option value="${g}">`).join('');
  });
};

const openGroupModal = (isRename = false, groupName = '') => {
  const modal = document.getElementById('group-modal');
  const titleEl = document.getElementById('group-modal-title');
  const input = document.getElementById('group-name-input');
  const saveBtn = document.getElementById('group-save-btn');
  if (!modal || !input) return;
  
  populateGroupDatalist();
  state.renamingGroupName = isRename ? groupName : null;
  
  if (isRename) {
    if (titleEl) titleEl.textContent = 'Rename Group';
    if (saveBtn) saveBtn.textContent = 'Rename Group';
    input.value = groupName;
  } else {
    const count = state.selectedNoteIds.size;
    if (titleEl) titleEl.textContent = count > 0 ? `Group ${count} Selected Items` : 'Group Items';
    if (saveBtn) saveBtn.textContent = 'Apply Group';
    input.value = '';
  }
  
  renderGroupPresets('group-modal-presets', 'group-name-input');
  
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
};

const closeGroupModal = () => {
  const modal = document.getElementById('group-modal');
  if (modal) modal.classList.add('hidden');
  state.renamingGroupName = null;
};

const openQuickNoteModal = (noteId = null) => {
  const modal = document.getElementById('quick-note-modal');
  const titleEl = document.getElementById('quick-note-modal-title');
  const titleInput = document.getElementById('quick-note-title-input');
  const priceInput = document.getElementById('quick-note-price-input');
  const groupInput = document.getElementById('quick-note-group-input');
  const linkInput = document.getElementById('quick-note-link-input');
  const convertContainer = document.getElementById('quick-note-convert-container');
  const deleteBtn = document.getElementById('quick-note-delete-btn');
  const submitBtnSpan = document.querySelector('#quick-note-submit-btn span');

  if (!modal) return;
  state.editingNoteId = noteId;
  populateGroupDatalist();

  if (noteId) {
    const item = state.notesItems.find(n => n.id === noteId);
    if (!item) return;

    if (titleEl) titleEl.textContent = 'Edit Item';
    if (titleInput) titleInput.value = item.title;
    if (priceInput) priceInput.value = item.price || '';
    if (groupInput) groupInput.value = item.group || '';
    if (linkInput) linkInput.value = item.link || '';
    if (convertContainer) convertContainer.classList.remove('hidden');
    if (submitBtnSpan) submitBtnSpan.textContent = 'Save Changes';
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    setQuickNoteImage(item.imageData || item.imageUrl || null);

    const priority = Number(item.priority) || 2;
    modal.querySelectorAll('#quick-note-priority-options .priority-btn').forEach(btn => {
      if (Number(btn.getAttribute('data-priority')) === priority) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  } else {
    if (titleEl) titleEl.textContent = 'Add Item';
    if (titleInput) titleInput.value = '';
    if (priceInput) priceInput.value = '';
    if (groupInput) groupInput.value = '';
    if (linkInput) linkInput.value = '';
    if (convertContainer) convertContainer.classList.add('hidden');
    if (submitBtnSpan) submitBtnSpan.textContent = 'Add Item';
    if (deleteBtn) deleteBtn.classList.add('hidden');
    setQuickNoteImage(null);

    modal.querySelectorAll('#quick-note-priority-options .priority-btn').forEach(btn => {
      if (Number(btn.getAttribute('data-priority')) === 2) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  resetQuickNoteLinkWarning();
  modal.classList.remove('hidden');
  safeCreateLucideIcons();
  setTimeout(() => { if (titleInput && typeof titleInput.focus === 'function') titleInput.focus(); }, 100);
};

const setQuickNoteImage = (dataUrl) => {
  state.currentQuickNoteImageData = dataUrl || null;
  const uploadArea = document.getElementById('quick-note-upload-area');
  const imgPreview = document.getElementById('quick-note-image-preview');
  const previewImg = document.getElementById('quick-note-preview-img');
  const fileInput = document.getElementById('quick-note-image-upload');

  if (dataUrl) {
    if (previewImg) previewImg.src = dataUrl;
    if (imgPreview) imgPreview.classList.remove('hidden');
    if (uploadArea) uploadArea.classList.add('hidden');
    if (window.updateEditImageBounds) setTimeout(window.updateEditImageBounds, 50);
  } else {
    if (previewImg) previewImg.src = '';
    if (imgPreview) imgPreview.classList.add('hidden');
    if (uploadArea) uploadArea.classList.remove('hidden');
    if (fileInput) fileInput.value = '';
  }
};

const closeQuickNoteModal = () => {
  const modal = document.getElementById('quick-note-modal');
  if (modal) modal.classList.add('hidden');
  state.editingNoteId = null;
  resetQuickNoteLinkWarning();
  setQuickNoteImage(null);
};

const openQuickNotePreviewModal = (noteId) => {
  const modal = document.getElementById('quick-note-preview-modal');
  if (!modal) return;

  const item = state.notesItems.find(n => n.id === noteId);
  if (!item) return;

  state.previewingNoteId = noteId;

  const nameEl = document.getElementById('quick-note-preview-name');
  const priceEl = document.getElementById('quick-note-preview-price');
  const groupEl = document.getElementById('quick-note-preview-group');
  const priorityEl = document.getElementById('quick-note-preview-priority');
  const linkRow = document.getElementById('quick-note-preview-link-row');
  const linkVal = document.getElementById('quick-note-preview-link-val');
  const imgBox = document.getElementById('quick-note-preview-image-container');
  const modalImg = document.getElementById('quick-note-preview-modal-img');

  const displayPrice = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
  const formattedPrice = formatCurrencyValue(displayPrice, state.currency);

  if (nameEl) nameEl.textContent = item.title;
  if (priceEl) priceEl.textContent = formattedPrice;

  const imgSrc = item.imageData || item.imageUrl;
  if (imgSrc) {
    if (modalImg) modalImg.src = imgSrc;
    if (imgBox) imgBox.classList.remove('hidden');
    if (window.updatePreviewImageBounds) setTimeout(window.updatePreviewImageBounds, 50);
  } else {
    if (imgBox) imgBox.classList.add('hidden');
  }

  if (groupEl) {
    if (item.group) {
      const groupIcon = getGroupIcon(item.group);
      groupEl.innerHTML = `<i data-lucide="${groupIcon}" style="width: 13px; height: 13px; color: #71717A;"></i> <span>${item.group}</span>`;
    } else {
      groupEl.innerHTML = `<span style="color: var(--text-tertiary);">None</span>`;
    }
  }

  if (priorityEl) {
    const p = Number(item.priority) || 2;
    const label = p === 1 ? 'High (P1)' : (p === 3 ? 'Low (P3)' : 'Medium (P2)');
    const dotColor = p === 1 ? '#EF4444' : (p === 3 ? '#10B981' : '#F59E0B');
    priorityEl.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dotColor};margin-right:2px;"></span> <span>${label}</span>`;
  }

  if (linkRow && linkVal) {
    if (item.link && item.link.trim()) {
      const validUrl = getValidUrl(item.link);
      let hostname = '';
      try {
        hostname = new URL(validUrl).hostname.replace(/^www\./, '');
      } catch (e) {
        hostname = validUrl;
      }
      linkVal.innerHTML = `
        <a href="${validUrl}" target="_blank" rel="noopener noreferrer" class="preview-link-btn" title="Open ${validUrl}">
          <span>${hostname}</span>
          <i data-lucide="arrow-up-right"></i>
        </a>
      `;
      linkRow.style.display = 'flex';
    } else {
      linkVal.innerHTML = `<span style="color: var(--text-tertiary);">None</span>`;
      linkRow.style.display = 'flex';
    }
  }

  modal.classList.remove('hidden');
  safeCreateLucideIcons();
};

const closeQuickNotePreviewModal = () => {
  const modal = document.getElementById('quick-note-preview-modal');
  if (modal) modal.classList.add('hidden');
  state.previewingNoteId = null;
};

const getFilteredItems = () => {
  const activeItems = [];
  const achievedItems = [];
  
  state.items.forEach(item => {
    let matchSearch = true;
    if (state.search) {
      const query = state.search.toLowerCase();
      const nameMatch = item.name.toLowerCase().includes(query);
      const brandMatch = item.brand ? item.brand.toLowerCase().includes(query) : false;
      const tagMatch = item.tags ? item.tags.some(t => t.toLowerCase().includes(query)) : false;
      matchSearch = nameMatch || brandMatch || tagMatch;
    }
    
    let matchTags = true;
    if (state.filters.length > 0) {
      matchTags = item.tags && item.tags.some(t => {
        const cleanT = t.replace(/^#/, '').toLowerCase();
        return state.filters.some(f => f.toLowerCase() === cleanT);
      });
    }
    
    if (matchSearch && matchTags) {
      if (item.achieved) {
        achievedItems.push(item);
      } else {
        activeItems.push(item);
      }
    }
  });
  
  return { active: activeItems, achieved: achievedItems };
};

const getSortedItems = (items) => {
  return [...items].sort((a, b) => {
    switch (state.sort) {
      case 'priority':
        return (a.priority || 1) - (b.priority || 1);
      case 'price-desc':
        return b.price - a.price;
      case 'price-asc':
        return a.price - b.price;
      case 'progress':
        return getProgress(b) - getProgress(a);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
};

const triggerConfetti = () => {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '3000';
  document.body.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const particles = [];
  const colors = ['#09090B', '#18181B', '#71717A', '#16A34A', '#2563EB', '#E11D48'];
  
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 1) * 18,
      size: Math.random() * 4 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8
    });
  }
  
  let animationFrame;
  const startTime = Date.now();
  
  const animate = () => {
    if (Date.now() - startTime > 2200) {
      if (document.body.contains(canvas)) {
        document.body.removeChild(canvas);
      }
      cancelAnimationFrame(animationFrame);
      return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4;
      p.rotation += p.rotationSpeed;
      
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
    
    animationFrame = requestAnimationFrame(animate);
  };
  
  animate();
};

const renderHeader = (activeItems) => {
  const itemCount = document.getElementById('item-count');
  const totalValue = document.getElementById('total-value');
  const totalSaved = document.getElementById('total-saved');
  const totalRemaining = document.getElementById('total-remaining');
  const overallProgressFill = document.getElementById('overall-progress-fill');
  const overallProgressText = document.getElementById('overall-progress-text');
  
  let tValue = 0;
  let tSaved = 0;
  
  activeItems.forEach(item => {
    tValue += getItemDisplayPrice(item, state.currency);
    tSaved += getItemDisplaySaved(item, state.currency);
  });
  
  const tRemaining = Math.max(0, tValue - tSaved);
  const p = tValue > 0 ? (tSaved / tValue) * 100 : 0;
  const clampedP = Math.min(100, p);
  
  if (itemCount) {
    if (state.activeTab === 'notes') {
      const notesCount = state.notesItems ? state.notesItems.length : 0;
      itemCount.innerHTML = `<i data-lucide="file-text"></i><span>${notesCount} ${notesCount === 1 ? 'Note' : 'Notes'}</span>`;
    } else {
      itemCount.innerHTML = `<i data-lucide="layers"></i><span>${activeItems.length} ${activeItems.length === 1 ? 'Item' : 'Items'}</span>`;
    }
    safeCreateLucideIcons();
  }
  if (totalValue) totalValue.textContent = formatCurrencyValue(tValue, state.currency);
  if (totalSaved) totalSaved.textContent = formatCurrencyValue(tSaved, state.currency);
  if (totalRemaining) totalRemaining.textContent = formatCurrencyValue(tRemaining, state.currency);
  
  if (overallProgressFill) overallProgressFill.style.width = `${clampedP}%`;
  if (overallProgressText) overallProgressText.textContent = `${Math.round(clampedP)}%`;
};

const tagIconMap = {
  all: 'layout-grid',
  tech: 'smartphone',
  workspace: 'laptop',
  audio: 'headphones',
  camera: 'camera',
  design: 'palette',
  fashion: 'shirt',
  watch: 'watch',
  gaming: 'gamepad-2',
  home: 'home',
  office: 'briefcase',
  music: 'music',
  phone: 'smartphone',
  auto: 'car',
  book: 'book-open'
};

const formatTagLabel = (tag) => {
  if (!tag) return '';
  const clean = tag.replace(/^#/, '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

const getMonochromeTagIcon = (tag) => {
  if (!tag) return 'tag';
  const key = tag.toLowerCase().replace(/^#/, '').trim();
  return tagIconMap[key] || 'tag';
};

const renderTagFilters = () => {
  const tagFilters = document.getElementById('tag-filters');
  if (!tagFilters) return;
  
  const allTags = new Set();
  state.items.forEach(item => {
    if (item.tags) {
      item.tags.forEach(t => allTags.add(t.replace(/^#/, '')));
    }
  });
  
  let html = `<button class="tag-pill ${state.filters.length === 0 ? 'active' : ''}" data-tag="all">
    <i data-lucide="${getMonochromeTagIcon('all')}"></i>
    <span>All</span>
  </button>`;

  allTags.forEach(t => {
    const formatted = formatTagLabel(t);
    const icon = getMonochromeTagIcon(t);
    const isSelected = state.filters.includes(t.toLowerCase()) || state.filters.includes(t);
    const active = isSelected ? 'active' : '';
    html += `<button class="tag-pill ${active}" data-tag="${t}">
      <i data-lucide="${icon}"></i>
      <span>${formatted}</span>
    </button>`;
  });
  
  tagFilters.innerHTML = html;
  safeCreateLucideIcons();
};

const priorityClassMap = { 1: 'priority-badge-p1', 2: 'priority-badge-p2', 3: 'priority-badge-p3' };
const priorityTextMap = { 1: 'P1', 2: 'P2', 3: 'P3' };

const renderItemCard = (item) => {
  const brandText = item.brand ? item.brand.trim() : '';
  const tagsText = item.tags && item.tags.length > 0 
    ? item.tags.map(t => formatTagLabel(t)).join(', ')
    : '';

  let subtitleContent = '';
  if (brandText && tagsText) {
    subtitleContent = `<span class="card-brand-text">${brandText}</span><span class="dot-sep"></span><span class="card-tag-text">${tagsText}</span>`;
  } else if (brandText) {
    subtitleContent = `<span class="card-brand-text">${brandText}</span>`;
  } else if (tagsText) {
    subtitleContent = `<span class="card-tag-text">${tagsText}</span>`;
  }

  return `
<div class="item-card ${item.achieved ? 'achieved' : ''}" data-id="${item.id}">
  <!-- Top Right External Circle Link Button -->
  ${item.link ? `
  <a class="card-external-btn" href="${item.link}" target="_blank" rel="noopener" title="Reference link">
    <i data-lucide="arrow-up-right"></i>
  </a>` : ''}

  <!-- Hover Action Buttons (Edit / Delete) -->
  <div class="card-hover-actions">
    ${!item.achieved ? `<button class="action-btn edit-btn" data-action="edit" data-id="${item.id}" title="Edit"><i data-lucide="edit-2"></i></button>` : ''}
    <button class="action-btn delete-btn" data-action="delete" data-id="${item.id}" title="Delete"><i data-lucide="trash"></i></button>
  </div>

  <!-- Hero Image Tile -->
  <div class="card-image">
    ${item.imageUrl || item.imageData 
      ? `<img src="${item.imageUrl || item.imageData}" alt="${item.name}" loading="lazy">` 
      : `<div class="card-image-placeholder"><i data-lucide="package"></i></div>`
    }
    ${item.achieved ? `<div class="card-achieved-badge"><i data-lucide="check"></i> ACQUIRED</div>` : ''}
  </div>

  <!-- Card Information Footer -->
  <div class="card-body">
    <!-- Subtitle Line: Brand · Category Tags -->
    ${subtitleContent ? `<div class="card-subtitle">${subtitleContent}</div>` : ''}

    <!-- Main Title & Price Pair -->
    <div class="card-main-row">
      <h3 class="card-title">${item.name}</h3>
      <div class="card-price mono-text">${formatItemPrice(item)}</div>
    </div>

    <!-- Ultra-Subtle Minimalist Progress Bar -->
    ${!item.achieved ? `
    <div class="card-progress">
      <div class="progress-bar"><div class="progress-fill" style="width:${getProgress(item)}%"></div></div>
      <div class="progress-info">
        <div class="progress-saved-group">
          <span class="progress-saved">${formatItemSaved(item)} saved</span>
          <button type="button" class="progress-inline-btn action-btn" data-action="progress" data-id="${item.id}" title="Update savings">
            <i data-lucide="plus"></i>
          </button>
        </div>
        <span class="progress-pct">${Math.round(getProgress(item))}%</span>
      </div>
    </div>` : ''}
  </div>
</div>
`;
};

const renderItems = (activeItems) => {
  const container = document.getElementById('items-container');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;
  
  if (activeItems.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    container.innerHTML = '';
    container.className = 'grid-view';
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    container.className = 'grid-view';
    
    container.innerHTML = getSortedItems(activeItems).map(item => {
      return renderItemCard(item);
    }).join('');
  }
};

const renderAchieved = (achievedItems) => {
  const section = document.getElementById('achieved-section');
  const container = document.getElementById('achieved-items');
  const count = document.getElementById('achieved-count');
  
  if (!section || !container) return;
  
  if (achievedItems.length === 0) {
    section.classList.add('hidden');
  } else {
    section.classList.remove('hidden');
    if (count) count.textContent = achievedItems.length;
    
    container.className = 'grid-view';
    if (state.achievedOpen) {
      container.classList.remove('collapsed');
      document.querySelector('.achieved-chevron')?.classList.add('rotated');
      container.innerHTML = getSortedItems(achievedItems).map(item => renderItemCard(item)).join('');
    } else {
      container.classList.add('collapsed');
      document.querySelector('.achieved-chevron')?.classList.remove('rotated');
      container.innerHTML = '';
    }
  }
};

const calculateNotesAccumulator = () => {
  let totalCost = 0;
  let checkedCost = 0;
  
  if (state.notesMode === 'list') {
    state.notesItems.forEach(item => {
      const val = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
      totalCost += val;
      if (item.checked) checkedCost += val;
    });
  } else {
    const text = state.rawNotepadText || '';
    const lines = text.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      const isChecked = /\[x\]/i.test(trimmed);
      const cleanLine = trimmed.replace(/\[x\]/gi, '').trim();
      
      const match = cleanLine.match(/(\$?Rp?\s*[\d.,]+|\d[\d.,]*)/i);
      if (match) {
        const numStr = match[0].replace(/[^\d.]/g, '');
        const val = parseFloat(numStr) || 0;
        const itemCurr = /[\$]/.test(match[0]) ? 'USD' : 'IDR';
        const displayVal = convertCurrency(val, itemCurr, state.currency);
        totalCost += displayVal;
        if (isChecked) checkedCost += displayVal;
      }
    });
  }
  
  const remainingCost = Math.max(0, totalCost - checkedCost);
  const progressPct = totalCost > 0 ? (checkedCost / totalCost) * 100 : 0;
  const clampedP = Math.min(100, progressPct);
  
  const totalEl = document.getElementById('notes-total-value');
  const checkedEl = document.getElementById('notes-checked-value');
  const remainingEl = document.getElementById('notes-remaining-value');
  const fillEl = document.getElementById('notes-progress-fill');
  const textEl = document.getElementById('notes-progress-text');
  
  if (totalEl) totalEl.textContent = formatCurrencyValue(totalCost, state.currency);
  if (checkedEl) checkedEl.textContent = formatCurrencyValue(checkedCost, state.currency);
  if (remainingEl) remainingEl.textContent = formatCurrencyValue(remainingCost, state.currency);
  if (fillEl) fillEl.style.width = `${clampedP}%`;
  if (textEl) textEl.textContent = `${Math.round(clampedP)}%`;
};

const updateSelectionBarUI = () => {
  const bar = document.getElementById('notes-selection-bar');
  const countEl = document.getElementById('notes-selected-count');
  const selectAllBtn = document.getElementById('notes-select-all-btn');
  const groupBtn = document.getElementById('notes-group-selected-btn');
  const ungroupBtn = document.getElementById('notes-ungroup-selected-btn');
  const deleteBtn = document.getElementById('notes-delete-selected-btn');
  const selectToggleBtn = document.getElementById('notes-select-toggle-btn');

  if (!bar) return;

  if (state.isSelectionMode) {
    bar.classList.remove('hidden');
    if (selectToggleBtn) {
      selectToggleBtn.classList.add('active');
      const span = selectToggleBtn.querySelector('span');
      if (span) span.textContent = 'Done';
    }
    const count = state.selectedNoteIds.size;
    if (countEl) countEl.textContent = `${count} selected`;
    
    if (selectAllBtn && state.notesItems) {
      const isAllSelected = state.notesItems.length > 0 && count === state.notesItems.length;
      selectAllBtn.title = isAllSelected ? 'Deselect All' : 'Select All';
      if (isAllSelected) {
        selectAllBtn.classList.add('active');
      } else {
        selectAllBtn.classList.remove('active');
      }
    }

    if (groupBtn) groupBtn.disabled = count === 0;
    if (ungroupBtn) ungroupBtn.disabled = count === 0;
    if (deleteBtn) deleteBtn.disabled = count === 0;
  } else {
    bar.classList.add('hidden');
    if (selectToggleBtn) {
      selectToggleBtn.classList.remove('active');
      const span = selectToggleBtn.querySelector('span');
      if (span) span.textContent = 'Select';
    }
  }
};

const renderNoteItemRow = (item, isGrouped = false) => {
  const displayPrice = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
  const formattedPrice = formatCurrencyValue(displayPrice, state.currency);
  const isSelected = state.selectedNoteIds.has(item.id);
  const isReader = state.notesViewMode === 'view';

  if (isReader) {
    if (isGrouped) {
      return `
        <div class="quick-note-row reader-row reader-grouped-row ${item.checked ? 'checked' : ''}" data-id="${item.id}" data-action="preview-note">
          <div class="reader-row-left">
            <span class="reader-grouped-bullet">•</span>
            <span class="quick-note-title reader-grouped-title">${item.title}</span>
          </div>
          <div class="reader-row-right">
            <span class="quick-note-price reader-grouped-price">${formattedPrice}</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="quick-note-row reader-row reader-standalone-row ${item.checked ? 'checked' : ''}" data-id="${item.id}" data-action="preview-note">
        <div class="reader-row-left">
          <span class="quick-note-title">${item.title}</span>
        </div>
        <div class="reader-row-right">
          <span class="quick-note-price">${formattedPrice}</span>
        </div>
      </div>
    `;
  }

  if (state.isSelectionMode) {
    return `
      <div class="quick-note-row ${isSelected ? 'selected-row' : ''}" data-id="${item.id}" data-action="select-item-row" style="cursor: pointer;">
        <div class="quick-note-left">
          <input type="checkbox" class="quick-note-select-checkbox" data-action="select-item-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
          <span class="quick-note-title">${item.title}</span>
        </div>
        <div class="quick-note-right">
          <span class="quick-note-price">${formattedPrice}</span>
        </div>
      </div>
    `;
  }

  const ungroupBtn = isGrouped
    ? `<button type="button" class="btn-icon-subtle" data-action="ungroup-note" data-id="${item.id}" title="Remove from group"><i data-lucide="corner-up-left"></i></button>`
    : '';

  return `
    <div class="quick-note-row ${item.checked ? 'checked' : ''}" data-id="${item.id}">
      <div class="quick-note-left">
        <input type="checkbox" class="quick-note-checkbox" data-action="toggle-note-checked" data-id="${item.id}" ${item.checked ? 'checked' : ''} title="Mark completed">
        <span class="quick-note-title">${item.title}</span>
      </div>
      <div class="quick-note-right">
        <span class="quick-note-price">${formattedPrice}</span>
        <div class="quick-note-actions-always">
          <button type="button" class="btn-icon-subtle edit-btn" data-action="edit-note" data-id="${item.id}" title="Edit item">
            <i data-lucide="edit-2"></i>
          </button>
          ${ungroupBtn}
        </div>
      </div>
    </div>
  `;
};

const notesSortLabelsMap = {
  'title': 'Title',
  'price': 'Price',
  'date': 'Date',
  'priority': 'Priority'
};

const updateNotesSortUI = () => {
  const currentSort = state.notesSortBy;
  const labelEl = document.getElementById('notes-sort-label');
  if (labelEl) {
    labelEl.textContent = notesSortLabelsMap[currentSort] || 'Sort';
  }
  const menu = document.getElementById('notes-sort-menu');
  if (menu) {
    menu.querySelectorAll('.sort-menu-item').forEach(item => {
      if (item.getAttribute('data-sort') === currentSort) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
};

const sortNotesItemsList = (items) => {
  if (!state.notesSortBy) return items;
  return [...items].sort((a, b) => {
    switch (state.notesSortBy) {
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'price':
        return (b.price || 0) - (a.price || 0);
      case 'date':
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'priority': {
        const pA = Number(a.priority) || 2;
        const pB = Number(b.priority) || 2;
        if (pA !== pB) return pA - pB;
        return (a.title || '').localeCompare(b.title || '');
      }
      default:
        return 0;
    }
  });
};

const renderQuickNotesManageList = () => {
  const container = document.getElementById('quick-notes-manage-list');
  if (!container) return;

  const isReader = (state.notesViewMode || 'view') === 'view';

  // Show / hide header controls: Sort & Edit in View mode, Back & Edit actions (Select, Add) in Edit mode
  const sortDropdownEl = document.getElementById('notes-sort-dropdown');
  const viewActionsEl = document.getElementById('notes-view-actions');
  const editActionsEl = document.getElementById('notes-edit-actions');
  const backToViewBtn = document.getElementById('notes-back-to-view-btn');
  const notesViewTitle = document.getElementById('notes-view-title');

  if (isReader) {
    if (notesViewTitle) notesViewTitle.classList.remove('hidden');
    if (backToViewBtn) backToViewBtn.classList.add('hidden');
    if (sortDropdownEl) sortDropdownEl.classList.remove('hidden');
    if (viewActionsEl) viewActionsEl.classList.remove('hidden');
    if (editActionsEl) editActionsEl.classList.add('hidden');
  } else {
    if (notesViewTitle) notesViewTitle.classList.add('hidden');
    if (backToViewBtn) backToViewBtn.classList.remove('hidden');
    if (sortDropdownEl) sortDropdownEl.classList.add('hidden');
    if (viewActionsEl) viewActionsEl.classList.add('hidden');
    if (editActionsEl) editActionsEl.classList.remove('hidden');
  }

  updateSelectionBarUI();
  updateNotesSortUI();

  if (!state.notesItems || state.notesItems.length === 0) {
    const emptyIcon = isReader ? 'book-open' : 'inbox';
    const emptyTitle = isReader ? 'Item list is empty' : 'No wishlist items yet';
    const emptySub = isReader
      ? 'Click <b>Edit</b> above to start adding and managing your wishlist items.'
      : 'Click <b>+ Add Item</b> above to start building your wishlist notes.';
    container.innerHTML = `
      <div style="text-align:center;padding:36px 16px;color:var(--text-tertiary);">
        <i data-lucide="${emptyIcon}" style="width:24px;height:24px;margin:0 auto 10px auto;opacity:0.4;display:block;"></i>
        <div style="font-family:var(--font-sans);font-size:13.5px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">${emptyTitle}</div>
        <div style="font-family:var(--font-sans);font-size:12px;color:var(--text-tertiary);max-width:280px;margin:0 auto;line-height:1.4;">${emptySub}</div>
      </div>
    `;
    safeCreateLucideIcons();
    return;
  }

  const groups = {};
  const standalone = [];

  state.notesItems.forEach(item => {
    if (item.group && typeof item.group === 'string' && item.group.trim()) {
      const g = item.group.trim();
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    } else {
      standalone.push(item);
    }
  });

  let html = '';

  Object.keys(groups).forEach(groupName => {
    const groupItems = isReader ? sortNotesItemsList(groups[groupName]) : groups[groupName];
    const groupTotal = groups[groupName].reduce((sum, i) => sum + convertCurrency(i.price || 0, i.currency || 'IDR', state.currency), 0);
    const formattedTotal = formatCurrencyValue(groupTotal, state.currency);
    const isCollapsed = state.collapsedGroups && state.collapsedGroups.has(groupName);
    const groupIcon = getGroupIcon(groupName);

    if (isReader) {
      html += `
        <div class="reader-group-block ${isCollapsed ? 'collapsed' : ''}">
          <div class="reader-group-header" data-action="toggle-group-collapse" data-group="${groupName}" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}">
            <div class="group-header-left">
              <i data-lucide="${groupIcon}" class="group-folder-icon"></i>
              <span class="group-header-title">${groupName}</span>
              <span class="group-badge-pill">${groupItems.length}</span>
            </div>
            <div class="group-header-right">
              <span class="group-header-total">${formattedTotal}</span>
            </div>
          </div>
          <div class="reader-group-items ${isCollapsed ? 'hidden' : ''}">
            ${groupItems.map(item => renderNoteItemRow(item, true)).join('')}
          </div>
        </div>
      `;
    } else {
      const groupActionsHtml = !state.isSelectionMode ? `
        <button type="button" class="btn-icon-subtle" data-action="rename-group" data-group="${groupName}" title="Rename Group">
          <i data-lucide="edit-2"></i>
        </button>
        <button type="button" class="btn-icon-subtle" data-action="ungroup-all" data-group="${groupName}" title="Ungroup All Items">
          <i data-lucide="corner-up-left"></i>
        </button>
      ` : '';

      html += `
        <div class="quick-note-group-container ${isCollapsed ? 'collapsed' : ''}">
          <div class="quick-note-group-header" data-action="toggle-group-collapse" data-group="${groupName}" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}">
            <div class="group-header-left">
              <i data-lucide="${groupIcon}" class="group-folder-icon"></i>
              <span class="group-header-title">${groupName}</span>
              <span class="group-badge-pill">${groupItems.length}</span>
            </div>
            <div class="group-header-right">
              <span class="group-header-total">${formattedTotal}</span>
              ${groupActionsHtml}
            </div>
          </div>
          <div class="quick-note-group-items ${isCollapsed ? 'hidden' : ''}">
            ${groupItems.map(item => renderNoteItemRow(item, true)).join('')}
          </div>
        </div>
      `;
    }
  });

  if (standalone.length > 0) {
    const sortedStandalone = isReader ? sortNotesItemsList(standalone) : standalone;
    if (Object.keys(groups).length > 0) {
      if (isReader) {
        html += `
          <div class="reader-standalone-header">
            <span class="standalone-header-title">Other Items</span>
            <span class="group-badge-pill">${sortedStandalone.length}</span>
          </div>
        `;
      } else {
        html += `
          <div class="quick-note-group-header" style="margin-top: 14px;">
            <div class="group-header-left">
              <span class="group-header-title" style="color: var(--text-tertiary);">Standalone Items</span>
              <span class="group-badge-pill">${sortedStandalone.length}</span>
            </div>
          </div>
        `;
      }
    }
    html += sortedStandalone.map(item => renderNoteItemRow(item, false)).join('');
  }

  container.innerHTML = html;
  safeCreateLucideIcons();
};

const renderNotesView = () => {
  renderQuickNotesManageList();
  calculateNotesAccumulator();
};

const renderTabUI = () => {
  const catalogView = document.getElementById('catalog-view');
  const notesView = document.getElementById('notes-view');
  const mobileFloatingBar = document.getElementById('mobile-floating-bar');
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  
  navBtns.forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    if (tab === state.activeTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (state.activeTab === 'catalog') {
    if (catalogView) catalogView.classList.remove('hidden');
    if (notesView) notesView.classList.add('hidden');
    if (mobileFloatingBar) mobileFloatingBar.classList.remove('hidden');
  } else {
    if (catalogView) catalogView.classList.add('hidden');
    if (notesView) notesView.classList.remove('hidden');
    if (mobileFloatingBar) mobileFloatingBar.classList.add('hidden');
    renderNotesView();
  }
};

const convertNoteToCatalog = (noteId) => {
  const note = state.notesItems.find(n => n.id === noteId);
  if (!note) return;
  
  const newItem = {
    id: generateId(),
    currency: note.currency || state.currency,
    originalPrice: note.price || 0,
    originalSaved: note.checked ? (note.price || 0) : 0,
    brand: '',
    name: note.title,
    price: convertCurrency(note.price || 0, note.currency || state.currency, 'IDR'),
    saved: note.checked ? convertCurrency(note.price || 0, note.currency || state.currency, 'IDR') : 0,
    imageUrl: note.imageUrl || '',
    imageData: note.imageData || null,
    link: note.link || '',
    tags: ['Quick Note'],
    priority: 2,
    achieved: note.checked,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.items.push(newItem);
  saveItems();
  showToast(`Converted "${note.title}" to Catalog Wish!`);
  render();
};

const render = () => {
  renderTabUI();
  
  const { active, achieved } = getFilteredItems();
  
  renderHeader(active);
  renderTagFilters();
  renderItems(active);
  renderAchieved(achieved);
  updateUserProfileUI();
  safeCreateLucideIcons();
};

let currentImageData = null;
let currentTags = [];
let currentPriority = 1;

const updatePriorityUI = () => {
  document.querySelectorAll('.priority-btn').forEach(btn => {
    const p = Number(btn.getAttribute('data-priority'));
    if (p === currentPriority) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

const sortLabelsMap = {
  'priority': 'Sort: Priority',
  'price-desc': 'Price: High → Low',
  'price-asc': 'Price: Low → High',
  'progress': 'Goal Progress',
  'name': 'Alphabetical'
};

const updateSortUI = () => {
  const sortLabel = document.getElementById('sort-current-label');
  if (sortLabel) sortLabel.textContent = sortLabelsMap[state.sort] || 'Sort: Priority';
  document.querySelectorAll('.sort-menu-item').forEach(item => {
    if (item.getAttribute('data-sort') === state.sort) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
};

const updateCurrencyUI = () => {
  const container = document.getElementById('currency-toggle');
  if (!container) return;
  const btns = container.querySelectorAll('.currency-btn');
  btns.forEach(btn => {
    const curr = btn.getAttribute('data-currency');
    if (curr === state.currency) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

// Event Handlers
const initEventHandlers = () => {
  const currencyToggle = document.getElementById('currency-toggle');
  if (currencyToggle) {
    currencyToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.currency-btn');
      if (!btn) return;
      const curr = btn.getAttribute('data-currency');
      if (curr && curr !== state.currency) {
        state.currency = curr;
        updateCurrencyUI();
        savePreferences();
        render();
      }
    });
  }

  const formCurrencySelect = document.getElementById('item-currency');
  if (formCurrencySelect) {
    let lastCurrency = formCurrencySelect.value;
    formCurrencySelect.addEventListener('change', (e) => {
      const newCurr = e.target.value;
      const priceEl = document.getElementById('item-price');
      const savedEl = document.getElementById('item-saved');
      const priceVal = parseFloat(priceEl?.value) || 0;
      const savedVal = parseFloat(savedEl?.value) || 0;
      
      if (lastCurrency === 'IDR' && newCurr === 'USD') {
        if (priceEl && priceVal > 0) priceEl.value = Math.round(priceVal / EXCHANGE_RATE);
        if (savedEl && savedVal > 0) savedEl.value = Math.round(savedVal / EXCHANGE_RATE);
      } else if (lastCurrency === 'USD' && newCurr === 'IDR') {
        if (priceEl && priceVal > 0) priceEl.value = Math.round(priceVal * EXCHANGE_RATE);
        if (savedEl && savedVal > 0) savedEl.value = Math.round(savedVal * EXCHANGE_RATE);
      }
      lastCurrency = newCurr;
    });
  }

  // App Nav Tabs (Catalog vs Quick Notes)
  const navTabs = document.getElementById('app-nav-tabs');
  if (navTabs) {
    navTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-tab-btn');
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');
      if (tab && tab !== state.activeTab) {
        state.activeTab = tab;
        savePreferences();
        render();
      }
    });
  }

  // User Profile & Auth Button Handlers
  const userProfileBtn = document.getElementById('user-profile-btn');
  const userProfileDropdown = document.getElementById('user-profile-dropdown');
  const userProfileWrapper = document.getElementById('user-profile-wrapper');
  const switchUserBtn = document.getElementById('dropdown-switch-user-btn');
  const logoutBtn = document.getElementById('dropdown-logout-btn');
  const authModalClose = document.getElementById('auth-modal-close');
  const authTabSignin = document.getElementById('auth-tab-signin');
  const authTabSignup = document.getElementById('auth-tab-signup');
  const authForm = document.getElementById('auth-form');
  const authGuestBtn = document.getElementById('auth-guest-btn');
  const authTogglePwd = document.getElementById('auth-toggle-pwd');
  const authPwdInput = document.getElementById('auth-password-input');

  if (userProfileBtn && userProfileDropdown) {
    userProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const u = state.currentUser;
      if (!u || u.isGuest) {
        openAuthModal('signin');
      } else {
        userProfileDropdown.classList.toggle('hidden');
        userProfileWrapper?.classList.toggle('open');
      }
    });
  }

  if (switchUserBtn) {
    switchUserBtn.addEventListener('click', () => {
      openAuthModal('signin');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (userProfileDropdown) userProfileDropdown.classList.add('hidden');
      if (userProfileWrapper) userProfileWrapper.classList.remove('open');
      logoutUser();
    });
  }

  if (authModalClose) {
    authModalClose.addEventListener('click', () => {
      closeAuthModal();
    });
  }

  if (authTabSignin) {
    authTabSignin.addEventListener('click', () => setAuthMode('signin'));
  }

  if (authTabSignup) {
    authTabSignup.addEventListener('click', () => setAuthMode('signup'));
  }

  if (authTogglePwd && authPwdInput) {
    authTogglePwd.addEventListener('click', () => {
      const isPwd = authPwdInput.type === 'password';
      authPwdInput.type = isPwd ? 'text' : 'password';
      authTogglePwd.innerHTML = isPwd ? '<i data-lucide="eye-off" style="width:14px;height:14px;"></i>' : '<i data-lucide="eye" style="width:14px;height:14px;"></i>';
      safeCreateLucideIcons();
    });
  }

  if (authGuestBtn) {
    authGuestBtn.addEventListener('click', () => {
      loginAsGuest();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById('auth-error-box');
      const nameInput = document.getElementById('auth-name-input');
      const emailInput = document.getElementById('auth-email-input');
      const pwdInput = document.getElementById('auth-password-input');
      const submitBtn = document.getElementById('auth-submit-btn');

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const pwdVal = pwdInput ? pwdInput.value : '';

      if (submitBtn) submitBtn.disabled = true;

      try {
        if (errorBox) {
          errorBox.classList.add('hidden');
          errorBox.textContent = '';
        }

        if (currentAuthMode === 'signup') {
          await registerUser(nameVal, emailVal, pwdVal);
        } else {
          await loginUser(emailVal, pwdVal);
        }
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || 'Authentication error';
          errorBox.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (userProfileWrapper && !userProfileWrapper.contains(e.target)) {
      userProfileDropdown?.classList.add('hidden');
      userProfileWrapper?.classList.remove('open');
    }
  });

  // Quick Notes Edit Mode Button (in View Mode)
  const notesEditModeBtn = document.getElementById('notes-edit-mode-btn');
  if (notesEditModeBtn) {
    notesEditModeBtn.addEventListener('click', () => {
      state.notesViewMode = 'edit';
      savePreferences();
      renderNotesView();
    });
  }

  // Quick Notes Back to View Mode Button (in Edit Mode)
  const notesBackToViewBtn = document.getElementById('notes-back-to-view-btn');
  if (notesBackToViewBtn) {
    notesBackToViewBtn.addEventListener('click', () => {
      state.notesViewMode = 'view';
      state.isSelectionMode = false;
      state.selectedNoteIds.clear();
      savePreferences();
      renderNotesView();
    });
  }

  // Notes Sort Dropdown Handlers
  const notesSortDropdown = document.getElementById('notes-sort-dropdown');
  const notesSortTrigger = document.getElementById('notes-sort-trigger');
  const notesSortMenu = document.getElementById('notes-sort-menu');

  if (notesSortTrigger && notesSortMenu) {
    notesSortTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      notesSortMenu.classList.toggle('hidden');
      notesSortDropdown?.classList.toggle('open');
    });

    notesSortMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.sort-menu-item');
      if (item) {
        const val = item.getAttribute('data-sort');
        if (val) {
          state.notesSortBy = val;
          savePreferences();
          renderQuickNotesManageList();
        }
        notesSortMenu.classList.add('hidden');
        notesSortDropdown?.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (notesSortDropdown && !notesSortDropdown.contains(e.target)) {
        notesSortMenu.classList.add('hidden');
        notesSortDropdown?.classList.remove('open');
      }
    });
  }

  // Main Add Note Item Button
  const mainAddNoteBtn = document.getElementById('main-add-note-btn');
  if (mainAddNoteBtn) {
    mainAddNoteBtn.addEventListener('click', () => {
      openQuickNoteModal(null);
    });
  }

  // Multi-select Toggle Button
  const selectToggleBtn = document.getElementById('notes-select-toggle-btn');
  if (selectToggleBtn) {
    selectToggleBtn.addEventListener('click', () => {
      state.isSelectionMode = !state.isSelectionMode;
      state.selectedNoteIds.clear();
      renderQuickNotesManageList();
    });
  }

  // Select All Toggle Button
  const selectAllBtn = document.getElementById('notes-select-all-btn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      if (!state.notesItems || state.notesItems.length === 0) return;
      if (state.selectedNoteIds.size === state.notesItems.length) {
        state.selectedNoteIds.clear();
      } else {
        state.notesItems.forEach(item => state.selectedNoteIds.add(item.id));
      }
      renderQuickNotesManageList();
    });
  }

  // Cancel Selection Mode Button
  const cancelSelectBtn = document.getElementById('notes-cancel-select-btn');
  if (cancelSelectBtn) {
    cancelSelectBtn.addEventListener('click', () => {
      state.isSelectionMode = false;
      state.selectedNoteIds.clear();
      renderQuickNotesManageList();
    });
  }

  // Group Selected Items Button
  const groupSelectedBtn = document.getElementById('notes-group-selected-btn');
  if (groupSelectedBtn) {
    groupSelectedBtn.addEventListener('click', () => {
      if (state.selectedNoteIds.size > 0) {
        openGroupModal(false);
      }
    });
  }

  // Ungroup Selected Items Button
  const ungroupSelectedBtn = document.getElementById('notes-ungroup-selected-btn');
  if (ungroupSelectedBtn) {
    ungroupSelectedBtn.addEventListener('click', () => {
      if (state.selectedNoteIds.size > 0) {
        state.notesItems.forEach(item => {
          if (state.selectedNoteIds.has(item.id)) {
            item.group = null;
          }
        });
        state.isSelectionMode = false;
        state.selectedNoteIds.clear();
        saveNotes();
        showToast('Selected items ungrouped');
        renderNotesView();
      }
    });
  }

  // Delete Selected Items Button
  const deleteSelectedBtn = document.getElementById('notes-delete-selected-btn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      const count = state.selectedNoteIds.size;
      if (count > 0) {
        showConfirmDialog({
          title: 'Delete Selected Items',
          message: `Are you sure you want to delete ${count} selected item(s)?`,
          confirmText: 'Delete Items',
          onConfirm: () => {
            state.notesItems = state.notesItems.filter(item => !state.selectedNoteIds.has(item.id));
            state.isSelectionMode = false;
            state.selectedNoteIds.clear();
            saveNotes();
            showToast(`${count} item(s) deleted`);
            renderNotesView();
          }
        });
      }
    });
  }

  // Group Form Submit (Create Group or Rename Group)
  const groupForm = document.getElementById('group-form');
  if (groupForm) {
    groupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('group-name-input');
      const groupName = input?.value.trim();
      if (!groupName) return;

      if (state.renamingGroupName) {
        state.notesItems.forEach(item => {
          if (item.group === state.renamingGroupName) {
            item.group = groupName;
          }
        });
        showToast(`Group renamed to '${groupName}'`);
      } else {
        state.notesItems.forEach(item => {
          if (state.selectedNoteIds.has(item.id)) {
            item.group = groupName;
          }
        });
        showToast(`Grouped ${state.selectedNoteIds.size} items into '${groupName}'`);
        state.isSelectionMode = false;
        state.selectedNoteIds.clear();
      }

      saveNotes();
      closeGroupModal();
      renderNotesView();
    });
  }

  // Group Modal Preset Chip Selection
  const groupModalPresets = document.getElementById('group-modal-presets');
  if (groupModalPresets) {
    groupModalPresets.addEventListener('click', (e) => {
      const chip = e.target.closest('.category-preset-chip');
      if (!chip) return;
      const name = chip.getAttribute('data-name');
      const input = document.getElementById('group-name-input');
      if (name && input) {
        input.value = name;
        groupModalPresets.querySelectorAll('.category-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        input.focus();
      }
    });
  }

  const groupNameInput = document.getElementById('group-name-input');
  if (groupNameInput) {
    groupNameInput.addEventListener('input', () => {
      const val = groupNameInput.value.trim().toLowerCase();
      document.querySelectorAll('#group-modal-presets .category-preset-chip').forEach(c => {
        const cName = (c.getAttribute('data-name') || '').toLowerCase();
        if (cName === val) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    });
  }

  document.querySelectorAll('.group-modal-close').forEach(btn => {
    btn.addEventListener('click', closeGroupModal);
  });

  document.querySelectorAll('.quick-note-modal-close').forEach(btn => {
    btn.addEventListener('click', closeQuickNoteModal);
  });

  document.querySelectorAll('.quick-note-preview-close').forEach(btn => {
    btn.addEventListener('click', closeQuickNotePreviewModal);
  });

  // Quick Note Preview Modal Action Handlers
  const previewEditBtn = document.getElementById('quick-note-preview-edit-btn');
  if (previewEditBtn) {
    previewEditBtn.addEventListener('click', () => {
      const id = state.previewingNoteId;
      if (id) {
        closeQuickNotePreviewModal();
        state.notesViewMode = 'edit';
        renderQuickNotesManageList();
        openQuickNoteModal(id);
      }
    });
  }

  const previewConvertBtn = document.getElementById('quick-note-preview-convert-btn');
  if (previewConvertBtn) {
    previewConvertBtn.addEventListener('click', () => {
      const id = state.previewingNoteId;
      if (id) {
        convertNoteToCatalog(id);
        closeQuickNotePreviewModal();
      }
    });
  }

  // Universal Click Outside Modal to Close Handler
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        if (overlay.id === 'quick-note-modal') {
          state.editingNoteId = null;
        }
        if (overlay.id === 'quick-note-preview-modal') {
          state.previewingNoteId = null;
        }
        if (overlay.id === 'group-modal') {
          state.renamingGroupName = null;
        }
      }
    });
  });

  // Quick Note Transfer to Catalog Button
  const quickNoteConvertBtn = document.getElementById('quick-note-convert-btn');
  if (quickNoteConvertBtn) {
    quickNoteConvertBtn.addEventListener('click', () => {
      if (state.editingNoteId) {
        convertNoteToCatalog(state.editingNoteId);
        closeQuickNoteModal();
      }
    });
  }

  // Quick Note Priority Selection Handler
  const quickNotePriorityOptions = document.getElementById('quick-note-priority-options');
  if (quickNotePriorityOptions) {
    quickNotePriorityOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.priority-btn');
      if (!btn) return;
      quickNotePriorityOptions.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  }

  // Quick Note Form Submit Handler
  const quickNoteForm = document.getElementById('quick-note-form');
  if (quickNoteForm) {
    quickNoteForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('quick-note-title-input');
      const priceInput = document.getElementById('quick-note-price-input');
      const groupInput = document.getElementById('quick-note-group-input');
      const linkInput = document.getElementById('quick-note-link-input');
      const activePriorityBtn = document.querySelector('#quick-note-priority-options .priority-btn.active');
      const priority = activePriorityBtn ? Number(activePriorityBtn.getAttribute('data-priority')) : 2;
      const title = titleInput?.value.trim();

      if (!title) return;
      const groupVal = groupInput?.value.trim() || null;
      const linkVal = linkInput?.value.trim() || '';

      if (linkVal) {
        const duplicate = findDuplicateItemByLink(linkVal, state.editingNoteId);
        if (duplicate) {
          validateQuickNoteLinkInput();
          showToast(`Link already exists in "${duplicate.title}". Please use a unique link.`);
          linkInput?.focus();
          return;
        }
      }

      if (state.editingNoteId) {
        const item = state.notesItems.find(n => n.id === state.editingNoteId);
        if (item) {
          item.title = title;
          item.price = parseFloat(priceInput?.value) || 0;
          item.group = groupVal;
          item.link = linkVal;
          item.imageData = state.currentQuickNoteImageData || null;
          item.priority = priority;
          showToast('Item updated');
        }
      } else {
        const newNote = {
          id: generateId(),
          title,
          price: parseFloat(priceInput?.value) || 0,
          currency: state.currency,
          checked: false,
          group: groupVal,
          link: linkVal,
          imageData: state.currentQuickNoteImageData || null,
          priority: priority,
          createdAt: new Date().toISOString()
        };
        state.notesItems.unshift(newNote);
        showToast('Added to Wishlist');
      }

      saveNotes();
      closeQuickNoteModal();
      renderNotesView();
    });
  }

  // Quick Note Link Input Live Duplicate Checker & Auto-Populate
  const handleAutoPopulateQuickNote = async (url) => {
    if (!url) return;
    const titleInput = document.getElementById('quick-note-title-input');
    const priceInput = document.getElementById('quick-note-price-input');
    const groupInput = document.getElementById('quick-note-group-input');

    const data = await fetchProductMetadata(url);
    if (!data) return;

    let populatedFields = [];
    if (data.title && titleInput && (!titleInput.value.trim() || titleInput.value.trim() === 'Untitled')) {
      titleInput.value = data.title;
      populatedFields.push('name');
    }
    if (data.price > 0 && priceInput && (!priceInput.value || Number(priceInput.value) === 0)) {
      priceInput.value = data.price;
      populatedFields.push('price');
    }
    if (data.suggestedGroup && groupInput && !groupInput.value.trim()) {
      groupInput.value = data.suggestedGroup;
      populatedFields.push('group');
    }
    if (data.imageUrl && !state.currentQuickNoteImageData) {
      setQuickNoteImage(data.imageUrl);
      populatedFields.push('photo');
    }

    if (populatedFields.length > 0) {
      showToast(`Auto-filled: ${populatedFields.join(', ')}`);
    }
  };

  const quickNoteLinkInput = document.getElementById('quick-note-link-input');
  if (quickNoteLinkInput) {
    quickNoteLinkInput.addEventListener('input', () => validateQuickNoteLinkInput());
    quickNoteLinkInput.addEventListener('paste', () => {
      setTimeout(() => {
        const dup = validateQuickNoteLinkInput();
        if (dup) {
          showToast(`Link already saved in "${dup.title}"`);
        } else {
          const val = quickNoteLinkInput.value.trim();
          if (val) handleAutoPopulateQuickNote(val);
        }
      }, 40);
    });
    quickNoteLinkInput.addEventListener('change', () => {
      const val = quickNoteLinkInput.value.trim();
      if (val && !validateQuickNoteLinkInput()) {
        handleAutoPopulateQuickNote(val);
      }
    });
  }

  // Quick Note Image Upload & Drag Drop Handlers
  const quickNoteUploadArea = document.getElementById('quick-note-upload-area');
  const quickNoteImageUpload = document.getElementById('quick-note-image-upload');
  const quickNoteRemoveImgBtn = document.getElementById('quick-note-remove-image-btn');

  if (quickNoteUploadArea && quickNoteImageUpload) {
    quickNoteUploadArea.addEventListener('click', () => {
      quickNoteImageUpload.click();
    });

    quickNoteImageUpload.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        processImageFile(file, (dataUrl) => {
          setQuickNoteImage(dataUrl);
          showToast('Photo uploaded!');
        });
      }
    });

    quickNoteUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      quickNoteUploadArea.classList.add('drag-over');
    });

    quickNoteUploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      quickNoteUploadArea.classList.remove('drag-over');
    });

    quickNoteUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      quickNoteUploadArea.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file) {
        processImageFile(file, (dataUrl) => {
          setQuickNoteImage(dataUrl);
          showToast('Photo uploaded!');
        });
      }
    });
  }

  if (quickNoteRemoveImgBtn) {
    quickNoteRemoveImgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setQuickNoteImage(null);
    });
  }

  // Universal Mobile & Desktop Clipboard Paste Handler
  const handleClipboardPasteAsync = async (target = 'quick-note') => {
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        let foundImage = false;
        for (const item of clipboardItems) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            foundImage = true;
            const blob = await item.getType(imageType);
            processImageFile(blob, (dataUrl) => {
              if (target === 'quick-note') {
                setQuickNoteImage(dataUrl);
              } else {
                const previewImg = document.getElementById('preview-img');
                const imagePreview = document.getElementById('image-preview');
                const uploadArea = document.getElementById('upload-area');
                const imageInput = document.getElementById('item-image');
                if (previewImg) previewImg.src = dataUrl;
                if (imagePreview) imagePreview.style.display = 'block';
                if (uploadArea) uploadArea.style.display = 'none';
                if (imageInput) imageInput.value = '';
                currentImageData = dataUrl;
              }
              showToast('Photo pasted from clipboard!');
            });
            return;
          }
        }
        if (!foundImage) {
          showToast('No photo found in clipboard');
        }
        return;
      } catch (err) {
        console.warn('Clipboard read permission/error:', err);
        showToast('Clipboard access denied. Please select photo from files.');
        return;
      }
    }

    showToast('Tap upload area or press Ctrl+V to paste');
  };

  const quickNotePasteBtn = document.getElementById('quick-note-paste-btn');
  if (quickNotePasteBtn) {
    quickNotePasteBtn.addEventListener('click', () => {
      handleClipboardPasteAsync('quick-note');
    });
  }

  const catalogPasteBtn = document.getElementById('catalog-paste-btn');
  if (catalogPasteBtn) {
    catalogPasteBtn.addEventListener('click', () => {
      handleClipboardPasteAsync('catalog');
    });
  }

  // Global Clipboard Paste Listener (Ctrl+V / Cmd+V for Quick Note & Catalog Modals)
  window.addEventListener('paste', (e) => {
    const quickNoteModal = document.getElementById('quick-note-modal');
    if (quickNoteModal && !quickNoteModal.classList.contains('hidden')) {
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              processImageFile(file, (dataUrl) => {
                setQuickNoteImage(dataUrl);
                showToast('Photo pasted from clipboard!');
              });
              return;
            }
          }
        }
      }
    }

    const itemModal = document.getElementById('item-modal');
    if (itemModal && !itemModal.classList.contains('hidden')) {
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              processImageFile(file, (dataUrl) => {
                const previewImg = document.getElementById('preview-img');
                const imagePreview = document.getElementById('image-preview');
                const uploadArea = document.getElementById('upload-area');
                const imageInput = document.getElementById('item-image');
                if (previewImg) previewImg.src = dataUrl;
                if (imagePreview) imagePreview.style.display = 'block';
                if (uploadArea) uploadArea.style.display = 'none';
                if (imageInput) imageInput.value = '';
                currentImageData = dataUrl;
                showToast('Photo pasted from clipboard!');
              });
              return;
            }
          }
        }
      }
    }
  });

  // Initialize Pannable Image Wrappers
  const previewPanWrapper = document.getElementById('quick-note-preview-pan-wrapper');
  const previewModalImg = document.getElementById('quick-note-preview-modal-img');
  const previewDragHint = document.getElementById('quick-note-preview-drag-hint');
  window.updatePreviewImageBounds = makeImagePannable(previewPanWrapper, previewModalImg, previewDragHint);

  const editPanWrapper = document.getElementById('quick-note-edit-pan-wrapper');
  const editPreviewImg = document.getElementById('quick-note-preview-img');
  const editDragHint = document.getElementById('quick-note-edit-drag-hint');
  window.updateEditImageBounds = makeImagePannable(editPanWrapper, editPreviewImg, editDragHint);

  // Quick Note Delete Button Inside Modal Handler
  const quickNoteDeleteBtn = document.getElementById('quick-note-delete-btn');
  if (quickNoteDeleteBtn) {
    quickNoteDeleteBtn.addEventListener('click', () => {
      if (state.editingNoteId) {
        const id = state.editingNoteId;
        state.notesItems = state.notesItems.filter(n => n.id !== id);
        saveNotes();
        closeQuickNoteModal();
        showToast('Item deleted');
        renderNotesView();
      }
    });
  }

  // Quick Notes List Delegation
  const quickNotesManageList = document.getElementById('quick-notes-manage-list');
  if (quickNotesManageList) {
    quickNotesManageList.addEventListener('click', (e) => {
      if (state.isSelectionMode) {
        const row = e.target.closest('[data-action="select-item-row"]');
        if (row) {
          const id = row.getAttribute('data-id');
          if (state.selectedNoteIds.has(id)) {
            state.selectedNoteIds.delete(id);
          } else {
            state.selectedNoteIds.add(id);
          }
          renderQuickNotesManageList();
          return;
        }
        return;
      }

      // Toggle Individual Note Checked
      const toggleNoteChecked = e.target.closest('[data-action="toggle-note-checked"]');
      if (toggleNoteChecked) {
        const id = toggleNoteChecked.getAttribute('data-id');
        const item = state.notesItems.find(n => n.id === id);
        if (item) {
          item.checked = toggleNoteChecked.checked;
          saveNotes();
          renderNotesView();
        }
        return;
      }

      // Ungroup Single Note
      const ungroupBtn = e.target.closest('[data-action="ungroup-note"]');
      if (ungroupBtn) {
        const id = ungroupBtn.getAttribute('data-id');
        const item = state.notesItems.find(n => n.id === id);
        if (item) {
          item.group = null;
          saveNotes();
          showToast('Removed from group');
          renderNotesView();
        }
        return;
      }

      // Rename Group
      const renameGroupBtn = e.target.closest('[data-action="rename-group"]');
      if (renameGroupBtn) {
        const groupName = renameGroupBtn.getAttribute('data-group');
        openGroupModal(true, groupName);
        return;
      }

      // Ungroup All Items in Group
      const ungroupAllBtn = e.target.closest('[data-action="ungroup-all"]');
      if (ungroupAllBtn) {
        const groupName = ungroupAllBtn.getAttribute('data-group');
        state.notesItems.forEach(item => {
          if (item.group === groupName) {
            item.group = null;
          }
        });
        saveNotes();
        showToast(`Ungrouped all items in '${groupName}'`);
        renderNotesView();
        return;
      }

      // Preview Note in View Mode
      if (state.notesViewMode === 'view') {
        const previewRow = e.target.closest('[data-action="preview-note"]');
        if (previewRow && !e.target.closest('button') && !e.target.closest('[data-action="toggle-group-collapse"]')) {
          const id = previewRow.getAttribute('data-id');
          if (id) {
            openQuickNotePreviewModal(id);
            return;
          }
        }
      }

      // Edit Note
      const editBtn = e.target.closest('[data-action="edit-note"]');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        openQuickNoteModal(id);
        return;
      }

      // Toggle Group Collapse on Header Click
      const groupCollapseHeader = e.target.closest('[data-action="toggle-group-collapse"]');
      if (groupCollapseHeader && !e.target.closest('button')) {
        const groupName = groupCollapseHeader.getAttribute('data-group');
        if (groupName) {
          if (!state.collapsedGroups) state.collapsedGroups = new Set();
          if (state.collapsedGroups.has(groupName)) {
            state.collapsedGroups.delete(groupName);
          } else {
            state.collapsedGroups.add(groupName);
          }
          renderQuickNotesManageList();
        }
        return;
      }
    });

  }

  // Raw Notepad Input
  const rawNotepad = document.getElementById('raw-notepad-input');
  if (rawNotepad) {
    let rawTimeout;
    rawNotepad.addEventListener('input', (e) => {
      state.rawNotepadText = e.target.value;
      saveNotes();
      clearTimeout(rawTimeout);
      rawTimeout = setTimeout(() => {
        calculateNotesAccumulator();
      }, 200);
    });
  }

  // Clear Notes Button
  const clearNotesBtn = document.getElementById('clear-notes-btn');
  if (clearNotesBtn) {
    clearNotesBtn.addEventListener('click', () => {
      showConfirmDialog({
        title: 'Clear All Notes',
        message: 'Are you sure you want to clear all quick notes items? This action cannot be undone.',
        confirmText: 'Clear All Notes',
        onConfirm: () => {
          if (state.notesMode === 'list') {
            state.notesItems = [];
          } else {
            state.rawNotepadText = '';
            const rawTextarea = document.getElementById('raw-notepad-input');
            if (rawTextarea) rawTextarea.value = '';
          }
          saveNotes();
          renderNotesView();
          showToast('Notes cleared');
        }
      });
    });
  }
  const sortDropdown = document.getElementById('sort-dropdown');
  const sortTrigger = document.getElementById('sort-dropdown-trigger');
  const sortMenu = document.getElementById('sort-dropdown-menu');

  if (sortTrigger && sortMenu) {
    sortTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      sortMenu.classList.toggle('hidden');
      sortDropdown?.classList.toggle('open');
    });

    sortMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.sort-menu-item');
      if (item) {
        const val = item.getAttribute('data-sort');
        if (val) {
          state.sort = val;
          updateSortUI();
          savePreferences();
          render();
        }
        sortMenu.classList.add('hidden');
        sortDropdown?.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (sortDropdown && !sortDropdown.contains(e.target)) {
        sortMenu.classList.add('hidden');
        sortDropdown?.classList.remove('open');
      }
    });
  }
  
  const priorityOptions = document.getElementById('priority-options');
  if (priorityOptions) {
    priorityOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.priority-btn');
      if (btn) {
        currentPriority = Number(btn.getAttribute('data-priority'));
        updatePriorityUI();
      }
    });
  }

  let searchTimeout;
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = state.search;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = e.target.value;
        render();
      }, 200);
    });
  }
  
  const tagFilters = document.getElementById('tag-filters');
  if (tagFilters) {
    tagFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-pill');
      if (!btn) return;
      const tag = btn.getAttribute('data-tag');
      if (tag === 'all') {
        state.filters = [];
      } else {
        const normTag = tag.replace(/^#/, '').toLowerCase();
        const existingIndex = state.filters.findIndex(f => f.toLowerCase() === normTag);
        if (existingIndex >= 0) {
          state.filters.splice(existingIndex, 1);
        } else {
          state.filters.push(normTag);
        }
      }
      render();
    });
  }
  
  const achievedToggle = document.getElementById('achieved-toggle');
  if (achievedToggle) {
    achievedToggle.addEventListener('click', () => {
      state.achievedOpen = !state.achievedOpen;
      render();
    });
  }
  
  const addBtn = document.getElementById('add-item-btn');
  const mobileAddBtn = document.getElementById('mobile-add-btn');
  const emptyAddBtn = document.getElementById('empty-add-btn');
  const openAddModal = () => openModal(null);
  if (addBtn) addBtn.addEventListener('click', openAddModal);
  if (mobileAddBtn) mobileAddBtn.addEventListener('click', openAddModal);
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', openAddModal);
  
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);
  
  document.querySelectorAll('.progress-close').forEach(btn => {
    btn.addEventListener('click', closeProgressModal);
  });
  
  document.querySelectorAll('.delete-close').forEach(btn => {
    btn.addEventListener('click', closeDeleteModal);
  });
  
  document.getElementById('item-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'item-modal') closeModal();
  });
  document.getElementById('progress-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'progress-modal') closeProgressModal();
  });
  document.getElementById('delete-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeProgressModal();
      closeDeleteModal();
    }
  });
  
  const handleItemActions = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    
    if (action === 'edit') openModal(id);
    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('delete-modal')?.classList.remove('hidden');
    }
    if (action === 'progress') {
      state.progressId = id;
      openProgressModal(id);
    }
  };
  
  document.getElementById('items-container')?.addEventListener('click', handleItemActions);
  document.getElementById('achieved-items')?.addEventListener('click', handleItemActions);
  document.getElementById('app')?.addEventListener('click', handleItemActions);
  
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', () => {
      if (state.deleteId) {
        state.items = state.items.filter(item => item.id !== state.deleteId);
        saveItems();
        render();
        closeDeleteModal();
        showToast('Item removed from catalog');
      }
    });
  }
  
  const quickSaveBtn = document.getElementById('quick-save-btn');
  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', () => {
      const item = state.items.find(i => i.id === state.progressId);
      if (item) {
        const input = document.getElementById('quick-saved');
        const inputSaved = parseFloat(input.value) || 0;
        const newSaved = toBaseIdr(inputSaved);
        const oldSaved = item.saved;
        item.saved = newSaved;
        item.updatedAt = new Date().toISOString();
        
        let achieved = false;
        if (item.saved >= item.price && oldSaved < item.price) {
          item.achieved = true;
          achieved = true;
        }
        
        saveItems();
        render();
        closeProgressModal();
        showToast('Savings record updated');
        if (achieved) triggerConfetti();
      }
    });
  }
  
  const imageUpload = document.getElementById('item-image-upload');
  const imagePreview = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview-img');
  const uploadArea = document.getElementById('upload-area');
  const removePreview = document.getElementById('remove-preview');
  const imageInput = document.getElementById('item-image');
  
  if (imageUpload) {
    imageUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 500 * 1024) {
          showToast('Image file too large (max 500KB)');
          e.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          previewImg.src = evt.target.result;
          imagePreview.style.display = 'block';
          uploadArea.style.display = 'none';
          imageInput.value = '';
          currentImageData = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  if (imageInput) {
    imageInput.addEventListener('input', (e) => {
      if (e.target.value) {
        uploadArea.style.display = 'none';
        imagePreview.style.display = 'block';
        previewImg.src = e.target.value;
        currentImageData = null;
      } else {
        if (!currentImageData) {
          uploadArea.style.display = 'flex';
          imagePreview.style.display = 'none';
        }
      }
    });
  }
  
  if (removePreview) {
    removePreview.addEventListener('click', () => {
      currentImageData = null;
      if (imageInput) imageInput.value = '';
      if (imageUpload) imageUpload.value = '';
      imagePreview.style.display = 'none';
      uploadArea.style.display = 'flex';
    });
  }
  
  const tagInput = document.getElementById('item-tags');
  const selectedTags = document.getElementById('selected-tags');
  const tagSuggestions = document.getElementById('tag-suggestions');
  
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !currentTags.includes(val)) {
          currentTags.push(val);
          renderSelectedTags();
        }
        e.target.value = '';
        if (tagSuggestions) tagSuggestions.style.display = 'none';
      }
    });
    
    tagInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) {
        if (tagSuggestions) tagSuggestions.style.display = 'none';
        return;
      }
      
      const allTags = getAllTags();
      const suggestions = allTags.filter(t => t.toLowerCase().includes(val) && !currentTags.includes(t));
      
      if (suggestions.length > 0 && tagSuggestions) {
        tagSuggestions.innerHTML = suggestions.map(t => `<div class="tag-suggestion">${t}</div>`).join('');
        tagSuggestions.style.display = 'block';
      } else if (tagSuggestions) {
        tagSuggestions.style.display = 'none';
      }
    });
  }
  
  if (tagSuggestions) {
    tagSuggestions.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-suggestion')) {
        const val = e.target.textContent;
        if (!currentTags.includes(val)) {
          currentTags.push(val);
          renderSelectedTags();
        }
        if (tagInput) tagInput.value = '';
        tagSuggestions.style.display = 'none';
      }
    });
  }
  
  if (selectedTags) {
    selectedTags.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-remove') || e.target.closest('.tag-remove')) {
        const pill = e.target.closest('.tag-pill');
        const text = pill.textContent.replace('×', '').trim();
        currentTags = currentTags.filter(t => t !== text);
        renderSelectedTags();
      }
    });
  }
  
  const itemForm = document.getElementById('item-form');
  if (itemForm) {
    itemForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const selectedCurrency = document.getElementById('item-currency')?.value || state.currency;
      const brand = document.getElementById('item-brand')?.value.trim() || '';
      const name = document.getElementById('item-name').value.trim();
      const inputPrice = parseFloat(document.getElementById('item-price').value) || 0;
      const inputSaved = parseFloat(document.getElementById('item-saved').value) || 0;
      
      const basePrice = convertCurrency(inputPrice, selectedCurrency, 'IDR');
      const baseSaved = convertCurrency(inputSaved, selectedCurrency, 'IDR');
      
      const imageUrl = document.getElementById('item-image').value.trim();
      const link = document.getElementById('item-link').value.trim();
      
      if (!name || inputPrice <= 0) {
        showToast('Valid name and target price required');
        return;
      }

      if (link) {
        const duplicate = findDuplicateItemByLink(link, state.editingId);
        if (duplicate) {
          validateCatalogLinkInput();
          showToast(`Link already exists in "${duplicate.title}". Please use a unique link.`);
          document.getElementById('item-link')?.focus();
          return;
        }
      }
      
      const isAchieved = inputSaved >= inputPrice;
      let triggeredAchieved = false;
      
      if (state.editingId) {
        const item = state.items.find(i => i.id === state.editingId);
        if (item) {
          const wasAchieved = getItemDisplaySaved(item) >= getItemDisplayPrice(item);
          item.currency = selectedCurrency;
          item.originalPrice = inputPrice;
          item.originalSaved = inputSaved;
          item.brand = brand;
          item.name = name;
          item.price = basePrice;
          item.saved = baseSaved;
          item.imageUrl = imageUrl;
          item.imageData = currentImageData;
          item.link = link;
          item.tags = [...currentTags];
          item.priority = currentPriority;
          item.achieved = isAchieved;
          item.updatedAt = new Date().toISOString();
          
          if (!wasAchieved && isAchieved) triggeredAchieved = true;
        }
      } else {
        const newItem = {
          id: generateId(),
          currency: selectedCurrency,
          originalPrice: inputPrice,
          originalSaved: inputSaved,
          brand,
          name,
          price: basePrice,
          saved: baseSaved,
          imageUrl,
          imageData: currentImageData,
          link,
          tags: [...currentTags],
          priority: currentPriority,
          achieved: isAchieved,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        state.items.push(newItem);
        if (isAchieved) triggeredAchieved = true;
      }
      
      saveItems();
      render();
      closeModal();
      showToast(state.editingId ? 'Catalog item updated' : 'New wish cataloged');
      
      if (triggeredAchieved) triggerConfetti();
    });
  }

  // Catalog Item Link Input Live Duplicate Checker & Auto-Populate
  const handleAutoPopulateCatalog = async (url) => {
    if (!url) return;
    const nameInput = document.getElementById('item-name');
    const priceInput = document.getElementById('item-price');
    const brandInput = document.getElementById('item-brand');
    const imageInput = document.getElementById('item-image');
    const preview = document.getElementById('image-preview');
    const uploadArea = document.getElementById('upload-area');
    const previewImg = document.getElementById('preview-img');

    const data = await fetchProductMetadata(url);
    if (!data) return;

    let populatedFields = [];
    if (data.title && nameInput && !nameInput.value.trim()) {
      nameInput.value = data.title;
      populatedFields.push('name');
    }
    if (data.price > 0 && priceInput && (!priceInput.value || Number(priceInput.value) === 0)) {
      priceInput.value = data.price;
      populatedFields.push('price');
    }
    if (data.brand && brandInput && !brandInput.value.trim()) {
      brandInput.value = data.brand;
      populatedFields.push('brand');
    }
    if (data.suggestedGroup && !currentTags.includes(data.suggestedGroup)) {
      currentTags.push(data.suggestedGroup);
      renderSelectedTags();
      populatedFields.push('tag');
    }
    if (data.imageUrl && !currentImageData) {
      if (imageInput) imageInput.value = data.imageUrl;
      if (uploadArea) uploadArea.style.display = 'none';
      if (preview) preview.style.display = 'block';
      if (previewImg) previewImg.src = data.imageUrl;
      currentImageData = data.imageUrl;
      populatedFields.push('photo');
    }

    if (populatedFields.length > 0) {
      showToast(`Auto-filled: ${populatedFields.join(', ')}`);
    }
  };

  const itemLinkInput = document.getElementById('item-link');
  if (itemLinkInput) {
    itemLinkInput.addEventListener('input', () => validateCatalogLinkInput());
    itemLinkInput.addEventListener('paste', () => {
      setTimeout(() => {
        const dup = validateCatalogLinkInput();
        if (dup) {
          showToast(`Link already saved in "${dup.title}"`);
        } else {
          const val = itemLinkInput.value.trim();
          if (val) handleAutoPopulateCatalog(val);
        }
      }, 40);
    });
    itemLinkInput.addEventListener('change', () => {
      const val = itemLinkInput.value.trim();
      if (val && !validateCatalogLinkInput()) {
        handleAutoPopulateCatalog(val);
      }
    });
  }
};

const renderSelectedTags = () => {
  const container = document.getElementById('selected-tags');
  if (!container) return;
  container.innerHTML = currentTags.map(t => 
    `<span class="tag-pill">${t} <button type="button" class="tag-remove" style="background:none;border:none;cursor:pointer;margin-left:4px;display:inline-flex;align-items:center;color:inherit;padding:0;"><i data-lucide="x" style="width:12px;height:12px;"></i></button></span>`
  ).join('');
  safeCreateLucideIcons();
};

const openModal = (id) => {
  const modal = document.getElementById('item-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('item-form');
  const preview = document.getElementById('image-preview');
  const uploadArea = document.getElementById('upload-area');
  const previewImg = document.getElementById('preview-img');
  
  if (!modal || !title || !form) return;
  
  state.editingId = id;
  form.reset();
  currentImageData = null;
  currentTags = [];
  currentPriority = 1;
  renderSelectedTags();
  
  if (preview) preview.style.display = 'none';
  if (uploadArea) uploadArea.style.display = 'flex';
  
  const currencySelect = document.getElementById('item-currency');
  
  if (id) {
    title.textContent = 'Edit Item';
    const item = state.items.find(i => i.id === id);
    if (item) {
      const itemCurr = item.currency || 'IDR';
      if (currencySelect) currencySelect.value = itemCurr;
      
      const brandInput = document.getElementById('item-brand');
      if (brandInput) brandInput.value = item.brand || '';
      document.getElementById('item-name').value = item.name;
      
      const srcPrice = item.originalPrice !== undefined ? item.originalPrice : item.price;
      const srcSaved = item.originalSaved !== undefined ? item.originalSaved : item.saved;
      
      document.getElementById('item-price').value = srcPrice;
      document.getElementById('item-saved').value = srcSaved;
      document.getElementById('item-image').value = item.imageUrl || '';
      document.getElementById('item-link').value = item.link || '';
      currentPriority = item.priority || 1;
      
      if (item.tags) {
        currentTags = [...item.tags];
        renderSelectedTags();
      }
      
      if (item.imageData || item.imageUrl) {
        if (uploadArea) uploadArea.style.display = 'none';
        if (preview) preview.style.display = 'block';
        if (previewImg) previewImg.src = item.imageData || item.imageUrl;
        currentImageData = item.imageData || null;
      }
    }
  } else {
    title.textContent = 'Add Wish';
    if (currencySelect) currencySelect.value = state.currency;
  }
  
  updatePriorityUI();
  resetCatalogLinkWarning();
  modal.classList.remove('hidden');
};

const closeModal = () => {
  const modal = document.getElementById('item-modal');
  if (modal) modal.classList.add('hidden');
  state.editingId = null;
  resetCatalogLinkWarning();
};

const openProgressModal = (id) => {
  const modal = document.getElementById('progress-modal');
  const nameEl = document.getElementById('progress-item-name');
  const inputEl = document.getElementById('quick-saved');
  const fillEl = document.getElementById('progress-modal-fill');
  const textEl = document.getElementById('progress-modal-text');
  
  if (!modal || !nameEl || !inputEl) return;
  
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  
  nameEl.textContent = item.name;
  inputEl.value = toDisplayAmount(item.saved);
  
  const p = getProgress(item);
  if (fillEl) fillEl.style.width = `${p}%`;
  if (textEl) textEl.textContent = `${Math.round(p)}%`;
  
  modal.classList.remove('hidden');
  
  const handleInput = (e) => {
    const valInput = parseFloat(e.target.value) || 0;
    const valBase = toBaseIdr(valInput);
    const itemPrice = item.price || 1;
    let newP = (valBase / itemPrice) * 100;
    if (newP > 100) newP = 100;
    if (fillEl) fillEl.style.width = `${newP}%`;
    if (textEl) textEl.textContent = `${Math.round(newP)}%`;
  };
  
  if (inputEl._handleInput) {
    inputEl.removeEventListener('input', inputEl._handleInput);
  }
  inputEl._handleInput = handleInput;
  inputEl.addEventListener('input', handleInput);
};

const closeProgressModal = () => {
  const modal = document.getElementById('progress-modal');
  if (modal) modal.classList.add('hidden');
  state.progressId = null;
};

const closeDeleteModal = () => {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.add('hidden');
  state.deleteId = null;
};

window.resetWishlistCache = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('wishlist_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    window.location.href = window.location.pathname;
  } catch (e) {}
};

const init = async () => {
  try {
    // Self-healing query parameter check (?reset=1 or ?clear=1)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      if (window.location.search.includes('reset=1') || window.location.search.includes('clear=1')) {
        window.resetWishlistCache();
        return;
      }
    }

    const session = getActiveSession();
    const token = getAuthToken();
    if (session && session.id && session.name) {
      state.currentUser = session;
    } else {
      state.currentUser = null;
    }
    loadScopedData();
    
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    if (state.view === 'grid') {
      gridBtn?.classList.add('active');
      listBtn?.classList.remove('active');
    } else {
      listBtn?.classList.add('active');
      gridBtn?.classList.remove('active');
    }
    
    initEventHandlers();
    updateUserProfileUI();
    updateSortUI();
    updateCurrencyUI();
    render();
    fetchLiveExchangeRate();

    // Cross-device sync pull on load (non-blocking)
    if (token) {
      syncDataFromBackend().catch(err => console.warn('Background sync failed:', err));
    }
  } catch (err) {
    console.error('App initialization error:', err);
    try {
      render();
    } catch (e) {}
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
