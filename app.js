/**
 * WISHLIST — Aspirations & Notes Engine
 * Clean, Robust, Modular Architecture (Pristine CSS Aligned)
 */

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
const AUTH_TOKEN_KEY = 'wishlist_auth_token';
const AUTH_USER_KEY = 'wishlist_auth_user';

let savedGroupIcons = {};
try {
  savedGroupIcons = JSON.parse(localStorage.getItem('wishlist_group_icons') || '{}');
} catch (e) {}

const state = {
  items: [],
  currentUser: null, // { id, name, email, username }
  viewMode: 'view',  // 'view' | 'edit'
  isSelectMode: false,
  selectedIds: new Set(),
  collapsedGroups: new Set(),
  sortBy: 'priority', // 'priority' | 'price' | 'title' | 'date'
  sortOrder: 'asc',   // 'asc' | 'desc'
  currency: 'IDR',
  exchangeRate: 16000,
  activeModalItemId: null,
  activePreviewItemId: null,
  activeRenamingGroup: null,
  activeGroupIcon: null,
  groupIcons: savedGroupIcons
};

const GROUP_MONO_ICONS = [
  { id: 'shirt', label: 'Outfit' },
  { id: 'laptop', label: 'Gadgets' },
  { id: 'gamepad-2', label: 'Gaming' },
  { id: 'headphones', label: 'Audio' },
  { id: 'camera', label: 'Camera' },
  { id: 'home', label: 'Home' },
  { id: 'book-open', label: 'Books' },
  { id: 'coffee', label: 'Cafe' },
  { id: 'plane', label: 'Travel' },
  { id: 'dumbbell', label: 'Fitness' },
  { id: 'briefcase', label: 'Work' },
  { id: 'palette', label: 'Art' },
  { id: 'car', label: 'Auto' },
  { id: 'gift', label: 'Gifts' },
  { id: 'package', label: 'General' },
  { id: 'folder', label: 'Folder' }
];

const GROUP_ICON_MAP = {
  'outfit': 'shirt',
  'fashion': 'shirt',
  'apparel': 'shirt',
  'cloth': 'shirt',
  'gadget': 'laptop',
  'electronic': 'laptop',
  'tech': 'laptop',
  'pc': 'laptop',
  'computer': 'laptop',
  'setup': 'briefcase',
  'workspace': 'briefcase',
  'desk': 'briefcase',
  'gaming': 'gamepad-2',
  'game': 'gamepad-2',
  'audio': 'headphones',
  'sound': 'headphones',
  'music': 'headphones',
  'photo': 'camera',
  'camera': 'camera',
  'home': 'home',
  'living': 'home',
  'room': 'home',
  'book': 'book-open',
  'study': 'book-open',
  'learn': 'book-open',
  'coffee': 'coffee',
  'lifestyle': 'coffee',
  'travel': 'plane',
  'trip': 'plane',
  'fitness': 'dumbbell',
  'gym': 'dumbbell',
  'health': 'dumbbell',
  'art': 'palette',
  'design': 'palette',
  'car': 'car',
  'auto': 'car',
  'vehicle': 'car',
  'gift': 'gift',
  'gear': 'package'
};

const CATEGORY_PRESETS = [
  { name: 'Outfit & Fashion', icon: 'shirt' },
  { name: 'Electronics & Gadgets', icon: 'laptop' },
  { name: 'Gaming & Gear', icon: 'gamepad-2' },
  { name: 'Audio & Sound', icon: 'headphones' },
  { name: 'Home & Living', icon: 'home' },
  { name: 'Books & Study', icon: 'book-open' },
  { name: 'Travel & Explore', icon: 'plane' },
  { name: 'Fitness & Health', icon: 'dumbbell' },
  { name: 'Daily Lifestyle', icon: 'coffee' },
  { name: 'Workspace & Desk', icon: 'briefcase' }
];

const getGroupIcon = (groupName) => {
  if (!groupName) return 'folder';
  if (state.groupIcons && state.groupIcons[groupName]) {
    return state.groupIcons[groupName];
  }
  const lower = groupName.toLowerCase();
  for (const [key, icon] of Object.entries(GROUP_ICON_MAP)) {
    if (lower.includes(key)) return icon;
  }
  return 'folder';
};

// ==========================================
// 2. HELPER UTILITIES
// ==========================================
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

const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatPrice = (amount, currency = 'IDR') => {
  const num = Number(amount) || 0;
  if (currency === 'USD') {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return 'Rp\u00A0' + Math.round(num).toLocaleString('id-ID');
};

let _lucideRaf = false;
const safeCreateLucideIcons = () => {
  if (_lucideRaf) return;
  _lucideRaf = true;
  requestAnimationFrame(() => {
    _lucideRaf = false;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (e) {}
  });
};

const showToast = (message, duration = 3000) => {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, duration);
};

// ==========================================
// 3. API CLIENT LAYER
// ==========================================
const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch (e) {
    return null;
  }
};

const setAuthToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch (e) {}
};

const apiRequest = async (endpoint, options = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(state.currentUser ? { 'x-user-id': state.currentUser.id } : { 'x-user-id': 'guest' }),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  } catch (err) {
    console.warn(`API Error [${endpoint}]:`, err.message);
    throw err;
  }
};

const api = {
  // Auth
  register: (name, emailOrUsername, password) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, emailOrUsername, password })
  }),
  login: (emailOrUsername, password) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password })
  }),
  getMe: () => apiRequest('/api/auth/me'),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),

  // Items
  getItems: () => apiRequest('/api/items'),
  createItem: (item) => apiRequest('/api/items', {
    method: 'POST',
    body: JSON.stringify(item)
  }),
  updateItem: (id, updates) => apiRequest(`/api/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }),
  deleteItem: (id) => apiRequest(`/api/items/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),
  bulkOperation: (payload) => apiRequest('/api/items/bulk', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  scrapeProduct: (url) => apiRequest('/api/scrape-product', {
    method: 'POST',
    body: JSON.stringify({ url })
  })
};

// ==========================================
// 4. RENDERING ENGINE (ALIGNED WITH STYLES.CSS)
// ==========================================
const renderSummaryBar = () => {
  const items = state.items;
  const totalEst = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const remainingNeeded = items.filter(i => !i.checked).reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const acquiredAmount = totalEst - remainingNeeded;
  const percentage = totalEst > 0 ? Math.round((acquiredAmount / totalEst) * 100) : 0;

  const totalEl = document.getElementById('notes-total-value');
  const remainingEl = document.getElementById('notes-remaining-value');
  const countEl = document.getElementById('notes-items-count');
  const dropdownCountEl = document.getElementById('dropdown-notes-count');
  const progressFill = document.getElementById('notes-progress-fill');
  const progressText = document.getElementById('notes-progress-text');

  if (totalEl) totalEl.textContent = formatPrice(totalEst, state.currency);
  if (remainingEl) remainingEl.textContent = formatPrice(remainingNeeded, state.currency);
  if (countEl) countEl.textContent = items.length;
  if (dropdownCountEl) dropdownCountEl.textContent = items.length;
  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressText) progressText.textContent = `${percentage}%`;
};

const sortItems = (items) => {
  const list = [...items];
  const isAsc = state.sortOrder === 'asc';

  list.sort((a, b) => {
    if (state.sortBy === 'priority') {
      const pA = Number(a.priority) || 2;
      const pB = Number(b.priority) || 2;
      if (pA !== pB) return isAsc ? pA - pB : pB - pA;
      return (Number(b.price) || 0) - (Number(a.price) || 0);
    }
    if (state.sortBy === 'price') {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      return isAsc ? priceA - priceB : priceB - priceA;
    }
    if (state.sortBy === 'title') {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      return isAsc ? titleA.localeCompare(titleB) : titleB.localeCompare(titleA);
    }
    if (state.sortBy === 'date') {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return isAsc ? dateA - dateB : dateB - dateA;
    }
    return 0;
  });
  return list;
};

const getSortIcon = (sortBy, sortOrder) => {
  const isAsc = sortOrder === 'asc';
  switch (sortBy) {
    case 'title':
      return isAsc ? 'arrow-down-a-z' : 'arrow-down-z-a';
    case 'price':
      return isAsc ? 'arrow-down-0-1' : 'arrow-down-1-0';
    case 'priority':
      return isAsc ? 'arrow-down-narrow-wide' : 'arrow-down-wide-narrow';
    case 'date':
      return isAsc ? 'calendar-arrow-up' : 'calendar-arrow-down';
    default:
      return isAsc ? 'arrow-up' : 'arrow-down';
  }
};

const updateSortUI = () => {
  const sort = state.sortBy;

  document.querySelectorAll('#notes-sort-menu .sort-menu-item').forEach(el => {
    const itemSort = el.getAttribute('data-sort');
    const isActive = itemSort === sort;
    el.classList.toggle('active', isActive);

    const iconEl = el.querySelector('.sort-menu-item-icon');
    if (iconEl) {
      if (isActive) {
        const iconName = getSortIcon(state.sortBy, state.sortOrder);
        iconEl.setAttribute('data-lucide', iconName);
        iconEl.style.opacity = '1';
        iconEl.style.visibility = 'visible';
      } else {
        iconEl.style.opacity = '0';
        iconEl.style.visibility = 'hidden';
      }
    }
  });

  const sortLabel = document.getElementById('notes-sort-label');
  const sortIcon = document.getElementById('notes-sort-icon');
  if (sortLabel) {
    const nameMap = { priority: 'Priority', price: 'Price', title: 'Title', date: 'Date' };
    sortLabel.textContent = nameMap[sort] || 'Sort';
  }
  if (sortIcon) {
    const iconName = getSortIcon(state.sortBy, state.sortOrder);
    sortIcon.setAttribute('data-lucide', iconName);
  }
  safeCreateLucideIcons();
};

const renderGroupedItemRow = (item) => {
  const isSelected = state.selectedIds.has(item.id);
  const isEditMode = state.viewMode === 'edit';
  const rowAction = isEditMode ? 'edit' : 'preview';

  return `
    <div class="reader-row reader-grouped-row ${item.checked ? 'checked' : ''} ${isSelected ? 'is-selected' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="reader-row-left" data-action="${rowAction}" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">
        ${state.isSelectMode ? `
          <input type="checkbox" class="quick-note-select-checkbox" data-action="toggle-select" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        ` : `
          <span class="reader-grouped-bullet">•</span>
        `}

        <span class="reader-grouped-title">${escapeHtml(item.title || 'Untitled')}</span>
      </div>

      <div class="quick-note-right">
        <span class="reader-grouped-price" data-action="${rowAction}" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">${formatPrice(item.price, item.currency || state.currency)}</span>
      </div>
    </div>
  `;
};

const renderStandaloneItemRow = (item) => {
  const isSelected = state.selectedIds.has(item.id);
  const isEditMode = state.viewMode === 'edit';
  const rowAction = isEditMode ? 'edit' : 'preview';

  return `
    <div class="quick-note-row reader-standalone-row ${item.checked ? 'checked' : ''} ${isSelected ? 'is-selected' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="reader-row-left" data-action="${rowAction}" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">
        ${state.isSelectMode ? `
          <input type="checkbox" class="quick-note-select-checkbox" data-action="toggle-select" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        ` : `
          <span class="reader-grouped-bullet">•</span>
        `}

        <span class="quick-note-title">${escapeHtml(item.title || 'Untitled')}</span>
      </div>

      <div class="quick-note-right">
        <span class="quick-note-price" data-action="${rowAction}" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">${formatPrice(item.price, item.currency || state.currency)}</span>
      </div>
    </div>
  `;
};

const renderItemsList = () => {
  const container = document.getElementById('quick-notes-manage-list');
  if (!container) return;

  if (state.items.length === 0) {
    container.innerHTML = `
      <div id="empty-state">
        <div class="empty-icon-badge">
          <i data-lucide="inbox"></i>
        </div>
        <h2>No wishlist items yet</h2>
        <p>Start tracking your aspirations, gear, and wishlist items by clicking Add below.</p>
        <button type="button" class="btn-empty-add" onclick="openQuickNoteModal()">
          <i data-lucide="plus"></i>
          <span>Add First Item</span>
        </button>
      </div>
    `;
    safeCreateLucideIcons();
    return;
  }

  // Group items by group name
  const groupsMap = new Map();
  const ungrouped = [];

  state.items.forEach(item => {
    const group = (item.group || '').trim();
    if (group) {
      if (!groupsMap.has(group)) groupsMap.set(group, []);
      groupsMap.get(group).push(item);
    } else {
      ungrouped.push(item);
    }
  });

  let html = '<div class="quick-notes-list">';

  // Render Groups (Reader Group Blocks)
  groupsMap.forEach((groupItems, groupName) => {
    const sortedGroupItems = sortItems(groupItems);
    const isCollapsed = state.collapsedGroups.has(groupName);
    const totalGroupPrice = groupItems.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
    const isEditMode = state.viewMode === 'edit';
    const groupAction = isEditMode ? 'rename-group' : 'toggle-group';

    html += `
      <div class="reader-group-block ${isCollapsed ? 'collapsed' : ''}" data-group="${escapeHtml(groupName)}">
        <div class="reader-group-header" data-action="${isEditMode ? 'rename-group' : 'toggle-group'}" data-group="${escapeHtml(groupName)}" style="cursor: pointer;">
          <div class="group-header-left">
            <span class="group-chevron-btn" data-action="toggle-group" data-group="${escapeHtml(groupName)}" title="Expand/Collapse">
              <i data-lucide="chevron-down" class="group-chevron-icon"></i>
            </span>
            <i data-lucide="${escapeHtml(getGroupIcon(groupName))}" class="group-folder-icon"></i>
            <span class="group-header-title">${escapeHtml(groupName)}</span>
            <span class="group-badge-pill">${groupItems.length}</span>
          </div>
          <div class="group-header-right">
            <span class="group-header-total">${formatPrice(totalGroupPrice, state.currency)}</span>
          </div>
        </div>
        <div class="reader-group-items ${isCollapsed ? 'hidden' : ''}">
          ${sortedGroupItems.map(renderGroupedItemRow).join('')}
        </div>
      </div>
    `;
  });

  // Render Ungrouped / Standalone Items
  if (ungrouped.length > 0) {
    const sortedUngrouped = sortItems(ungrouped);
    if (groupsMap.size > 0) {
      html += `
        <div class="reader-standalone-header">
          <span class="standalone-header-title">General Items</span>
        </div>
      `;
    }
    html += `
      <div class="standalone-items-container">
        ${sortedUngrouped.map(renderStandaloneItemRow).join('')}
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
  safeCreateLucideIcons();
};

const updateSelectionBar = () => {
  const selectionBar = document.getElementById('notes-selection-bar');
  const selectedCountEl = document.getElementById('notes-selected-count');
  const completeBtn = document.getElementById('notes-complete-selected-btn');
  const groupBtn = document.getElementById('notes-group-selected-btn');
  const ungroupBtn = document.getElementById('notes-ungroup-selected-btn');
  const deleteBtn = document.getElementById('notes-delete-selected-btn');

  if (!selectionBar) return;

  if (state.isSelectMode) {
    selectionBar.classList.remove('hidden');
    const count = state.selectedIds.size;
    if (selectedCountEl) selectedCountEl.textContent = `${count} selected`;
    if (completeBtn) completeBtn.disabled = count === 0;
    if (groupBtn) groupBtn.disabled = count === 0;
    if (ungroupBtn) ungroupBtn.disabled = count === 0;
    if (deleteBtn) deleteBtn.disabled = count === 0;
  } else {
    selectionBar.classList.add('hidden');
    state.selectedIds.clear();
  }
};

const updateAuthUI = () => {
  const u = state.currentUser;
  const displayNameEl = document.getElementById('user-display-name');
  const avatarBadgeEl = document.getElementById('user-avatar-badge');
  const dropdownAvatarEl = document.getElementById('dropdown-user-avatar');
  const dropdownNameEl = document.getElementById('dropdown-user-name');
  const dropdownEmailEl = document.getElementById('dropdown-user-email');
  const logoutBtn = document.getElementById('dropdown-logout-btn');
  const switchBtn = document.getElementById('dropdown-switch-user-btn');

  if (u && !u.isGuest) {
    const initials = (u.name || u.username || 'U').charAt(0).toUpperCase();
    if (displayNameEl) displayNameEl.textContent = u.name || u.username;
    if (avatarBadgeEl) avatarBadgeEl.textContent = initials;
    if (dropdownAvatarEl) dropdownAvatarEl.textContent = initials;
    if (dropdownNameEl) dropdownNameEl.textContent = u.name || u.username;
    if (dropdownEmailEl) dropdownEmailEl.textContent = u.email || '';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (switchBtn) switchBtn.querySelector('span').textContent = 'Switch Account';
  } else {
    if (displayNameEl) displayNameEl.textContent = 'Sign In';
    if (avatarBadgeEl) avatarBadgeEl.innerHTML = '<i data-lucide="user" class="avatar-icon"></i>';
    if (dropdownAvatarEl) dropdownAvatarEl.innerHTML = '<i data-lucide="user"></i>';
    if (dropdownNameEl) dropdownNameEl.textContent = 'Guest User';
    if (dropdownEmailEl) dropdownEmailEl.textContent = 'Local Mode';
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (switchBtn) switchBtn.querySelector('span').textContent = 'Sign In / Register';
  }
  safeCreateLucideIcons();
};

const updateFloatingBar = () => {
  const floatingBar = document.getElementById('mobile-floating-bar');
  if (!floatingBar) return;
  if (state.viewMode === 'edit') {
    floatingBar.classList.remove('hidden');
  } else {
    floatingBar.classList.add('hidden');
  }
};

const render = () => {
  renderSummaryBar();
  renderItemsList();
  updateSelectionBar();
  updateAuthUI();
  updateFloatingBar();
  updateSortUI();
};

// ==========================================
// 5. CRUD ACTION HANDLERS (OPTIMISTIC UI)
// ==========================================
const toggleItemCheck = async (itemId) => {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  // Optimistic update
  item.checked = !item.checked;
  item.updatedAt = new Date().toISOString();
  render();

  try {
    await api.updateItem(itemId, { checked: item.checked });
  } catch (err) {
    // Rollback on error
    item.checked = !item.checked;
    render();
    showToast('Failed to update status');
  }
};

const deleteSingleItem = async (itemId) => {
  const idx = state.items.findIndex(i => i.id === itemId);
  if (idx === -1) return;

  const [removedItem] = state.items.splice(idx, 1);
  state.selectedIds.delete(itemId);
  render();

  try {
    await api.deleteItem(itemId);
    showToast('Item deleted');
  } catch (err) {
    // Rollback
    state.items.splice(idx, 0, removedItem);
    render();
    showToast('Failed to delete item');
  }
};

const deleteSelectedItems = async () => {
  const idsToDelete = Array.from(state.selectedIds);
  if (idsToDelete.length === 0) return;

  const previousItems = [...state.items];
  state.items = state.items.filter(i => !state.selectedIds.has(i.id));
  state.selectedIds.clear();
  render();

  try {
    await api.bulkOperation({ action: 'delete_multiple', ids: idsToDelete });
    showToast(`Deleted ${idsToDelete.length} items`);
  } catch (err) {
    state.items = previousItems;
    render();
    showToast('Failed to delete selected items');
  }
};

const ungroupSelectedItems = async () => {
  const idsToUngroup = Array.from(state.selectedIds);
  if (idsToUngroup.length === 0) return;

  state.items.forEach(i => {
    if (state.selectedIds.has(i.id)) i.group = null;
  });
  render();

  try {
    await api.bulkOperation({ action: 'ungroup_multiple', ids: idsToUngroup });
    showToast(`Removed ${idsToUngroup.length} items from groups`);
  } catch (err) {
    showToast('Failed to ungroup items');
  }
};

const completeSelectedItems = async () => {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  const selectedItems = state.items.filter(i => state.selectedIds.has(i.id));
  const allChecked = selectedItems.every(i => i.checked);
  const newCheckedState = !allChecked;

  state.items.forEach(i => {
    if (state.selectedIds.has(i.id)) {
      i.checked = newCheckedState;
    }
  });

  render();
  showToast(newCheckedState ? `Completed ${ids.length} items` : `Marked ${ids.length} items as active`);

  try {
    await api.bulkOperation({
      action: 'save_all',
      items: state.items
    });
  } catch (err) {
    console.warn('Failed to sync complete state', err);
  }
};

const renameGroup = async (oldGroup, newGroup) => {
  const cleanNew = (newGroup || '').trim() || null;
  state.items.forEach(i => {
    if (i.group === oldGroup) i.group = cleanNew;
  });
  render();

  try {
    await api.bulkOperation({ action: 'rename_group', oldGroup, newGroup: cleanNew });
    showToast(`Group renamed to "${cleanNew || 'General'}"`);
  } catch (err) {
    showToast('Failed to rename group');
  }
};

const saveItemFromModal = async (formData) => {
  const isEditing = !!state.activeModalItemId;
  const now = new Date().toISOString();
  const serializedImageData = currentUploadedImage ? serializeImageData(currentUploadedImage, currentImagePan, currentImageFit) : null;

  if (isEditing) {
    const item = state.items.find(i => i.id === state.activeModalItemId);
    if (!item) return;
    const previous = { ...item };

    Object.assign(item, {
      title: formData.title,
      price: formData.price,
      group: formData.group,
      link: formData.link,
      priority: formData.priority,
      checked: !!formData.checked,
      imageData: serializedImageData,
      imagePan: currentImagePan,
      imageFit: currentImageFit,
      updatedAt: now
    });
    render();
    closeQuickNoteModal();

    try {
      await api.updateItem(item.id, {
        ...formData,
        imageData: serializedImageData
      });
      showToast('Item updated');
    } catch (err) {
      Object.assign(item, previous);
      render();
      showToast('Failed to save changes');
    }
  } else {
    const tempId = 'item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const newItem = {
      id: tempId,
      title: formData.title,
      price: formData.price,
      currency: state.currency,
      group: formData.group,
      priority: formData.priority,
      checked: !!formData.checked,
      link: formData.link,
      imageData: serializedImageData,
      imagePan: currentImagePan,
      imageFit: currentImageFit,
      createdAt: now,
      updatedAt: now
    };

    state.items.unshift(newItem);
    render();
    closeQuickNoteModal();

    try {
      const res = await api.createItem(newItem);
      if (res && res.item && res.item.id) {
        newItem.id = res.item.id;
      }
      showToast('Item added to wishlist');
    } catch (err) {
      state.items = state.items.filter(i => i.id !== tempId);
      render();
      showToast('Failed to add item');
    }
  }
};

// ==========================================
// 6. MODALS & DIALOGS
// ==========================================
let currentUploadedImage = null;
let currentImagePan = { x: 50, y: 50 };
let currentImageFit = 'cover';

const getImageSrc = (item) => {
  if (!item) return '';
  const raw = item.imageData || item.imageUrl;
  if (!raw) return '';
  if (typeof raw === 'string') {
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.src || parsed.url || '';
      } catch (e) {}
    }
    return raw;
  }
  if (typeof raw === 'object') {
    return raw.src || raw.url || '';
  }
  return '';
};

const getImagePan = (item) => {
  if (!item) return { x: 50, y: 50 };
  if (item.imagePan && typeof item.imagePan === 'object') return item.imagePan;
  const raw = item.imageData || item.imageUrl;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.pan) return parsed.pan;
    } catch (e) {}
  }
  if (typeof raw === 'object' && raw.pan) return raw.pan;
  return { x: 50, y: 50 };
};

const getImageFit = (item) => {
  if (!item) return 'cover';
  if (item.imageFit) return item.imageFit;
  const raw = item.imageData || item.imageUrl;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.fit) return parsed.fit;
    } catch (e) {}
  }
  if (typeof raw === 'object' && raw.fit) return raw.fit;
  return 'cover';
};

const serializeImageData = (src, pan = { x: 50, y: 50 }, fit = 'cover') => {
  if (!src) return null;
  return JSON.stringify({ src, pan, fit });
};

// Full-Resolution Lightbox Modal
const openLightboxModal = (imgSrc) => {
  if (!imgSrc) return;
  const modal = document.getElementById('image-lightbox-modal');
  const fullImg = document.getElementById('lightbox-full-img');
  if (fullImg) fullImg.src = imgSrc;
  if (modal) modal.classList.remove('hidden');
  safeCreateLucideIcons();
};

const closeLightboxModal = () => {
  const modal = document.getElementById('image-lightbox-modal');
  if (modal) modal.classList.add('hidden');
};

// Reusable Image Pan / Drag Reposition Controller
const makePannable = (wrapperId, imgId, getPan, onPanChange) => {
  const wrapper = document.getElementById(wrapperId);
  const img = document.getElementById(imgId);
  if (!wrapper || !img) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialPanX = 50;
  let initialPanY = 50;

  const onPointerDown = (e) => {
    // If clicked on action buttons, do not trigger pan
    if (e.target.closest('.img-controls-bar') || e.target.closest('button')) return;
    if (img.classList.contains('fit-contain')) return;

    isDragging = true;
    wrapper.classList.add('is-panning');
    const pan = getPan ? getPan() : { x: 50, y: 50 };
    initialPanX = pan.x !== undefined ? pan.x : 50;
    initialPanY = pan.y !== undefined ? pan.y : 50;

    startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    if (e.type === 'mousedown') e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const percentX = (deltaX / rect.width) * 100;
    const percentY = (deltaY / rect.height) * 100;

    const newPanX = Math.max(0, Math.min(100, initialPanX - percentX));
    const newPanY = Math.max(0, Math.min(100, initialPanY - percentY));

    img.style.objectPosition = `${newPanX}% ${newPanY}%`;

    if (onPanChange) {
      onPanChange({ x: newPanX, y: newPanY });
    }
  };

  const onPointerUp = () => {
    if (isDragging) {
      isDragging = false;
      wrapper.classList.remove('is-panning');
    }
  };

  wrapper.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  wrapper.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);
};

const populateModalGroupPills = (selectedGroup = '', show = null) => {
  const container = document.getElementById('quick-note-group-pills-list');
  if (!container) return;

  const existingGroups = Array.from(new Set(state.items.map(i => i.group).filter(Boolean)));
  const presetNames = (CATEGORY_PRESETS || []).map(p => (typeof p === 'object' ? p.name : p)).filter(Boolean);
  const otherPresets = presetNames.filter(p => !existingGroups.includes(p));
  const allGroups = [...existingGroups, ...otherPresets.slice(0, 5)];

  if (allGroups.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  const currentVal = (selectedGroup || '').trim().toLowerCase();
  container.innerHTML = allGroups.map(g => {
    const str = String(g);
    const isActive = str.toLowerCase() === currentVal;
    return `<button type="button" class="group-pill-opt ${isActive ? 'active' : ''}" data-group="${escapeHtml(str)}">${escapeHtml(str)}</button>`;
  }).join('');

  if (show === true) {
    container.classList.remove('hidden');
  } else if (show === false) {
    container.classList.add('hidden');
  }
};

const openQuickNoteModal = (itemId = null) => {
  const modal = document.getElementById('quick-note-modal');
  const titleEl = document.getElementById('quick-note-modal-title');
  const titleInput = document.getElementById('quick-note-title-input');
  const priceInput = document.getElementById('quick-note-price-input');
  const groupInput = document.getElementById('quick-note-group-input');
  const linkInput = document.getElementById('quick-note-link-input');
  const deleteBtn = document.getElementById('quick-note-delete-btn');
  const ungroupBtn = document.getElementById('quick-note-ungroup-btn');
  const previewBox = document.getElementById('quick-note-image-preview');
  const previewImg = document.getElementById('quick-note-preview-img');
  const uploadArea = document.getElementById('quick-note-upload-area');

  if (!modal) return;

  state.activeModalItemId = itemId;
  currentUploadedImage = null;
  currentImagePan = { x: 50, y: 50 };
  currentImageFit = 'cover';

  const groupPopover = document.getElementById('quick-note-group-popover');
  if (groupPopover) groupPopover.classList.add('hidden');

  if (itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    if (titleEl) titleEl.textContent = 'Edit Item';
    if (titleInput) titleInput.value = item.title || '';
    if (priceInput) priceInput.value = (item.price !== undefined && item.price !== null && item.price !== 0) ? item.price : (item.price === 0 ? '0' : '');
    const currentGroup = item.group || '';
    if (groupInput) groupInput.value = currentGroup;
    populateModalGroupPills(currentGroup, false);
    if (linkInput) linkInput.value = item.link || '';

    setModalPriority(item.priority || 2);

    const checkedInput = document.getElementById('quick-note-checked-input');
    if (checkedInput) checkedInput.checked = !!item.checked;

    const src = getImageSrc(item);
    if (src) {
      currentUploadedImage = src;
      currentImagePan = getImagePan(item);
      currentImageFit = getImageFit(item);

      if (previewImg) {
        previewImg.src = currentUploadedImage;
        previewImg.style.objectPosition = `${currentImagePan.x}% ${currentImagePan.y}%`;
      }
      if (previewBox) previewBox.classList.remove('hidden');
      if (uploadArea) uploadArea.classList.add('hidden');
    } else {
      if (previewBox) previewBox.classList.add('hidden');
      if (uploadArea) uploadArea.classList.remove('hidden');
    }
  } else {
    if (titleEl) titleEl.textContent = 'Add Item';
    if (titleInput) titleInput.value = '';
    if (priceInput) priceInput.value = '';
    if (groupInput) groupInput.value = '';
    populateModalGroupPills('', false);
    if (linkInput) linkInput.value = '';
    const checkedInput = document.getElementById('quick-note-checked-input');
    if (checkedInput) checkedInput.checked = false;
    if (previewBox) previewBox.classList.add('hidden');
    if (uploadArea) uploadArea.classList.remove('hidden');
    setModalPriority(2);
  }

  modal.classList.remove('hidden');
  safeCreateLucideIcons();
  if (titleInput) titleInput.focus();
};

const closeQuickNoteModal = () => {
  const modal = document.getElementById('quick-note-modal');
  if (modal) modal.classList.add('hidden');
  state.activeModalItemId = null;
  currentUploadedImage = null;
};

window.openQuickNoteModal = openQuickNoteModal;
window.closeQuickNoteModal = closeQuickNoteModal;

const setModalPriority = (priority) => {
  const p = Number(priority) || 2;
  const input = document.getElementById('quick-note-priority-input');
  if (input) input.value = String(p);

  const badge = document.getElementById('quick-note-priority-badge');
  if (badge) {
    badge.className = 'prio-text';
    badge.textContent = p === 1 ? 'High' : (p === 3 ? 'Low' : 'Medium');
  }

  const items = document.querySelectorAll('#quick-note-priority-menu .custom-dropdown-item');
  items.forEach(item => {
    const itemP = Number(item.getAttribute('data-priority'));
    if (itemP === p) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  const menu = document.getElementById('quick-note-priority-menu');
  const trigger = document.getElementById('quick-note-priority-trigger');
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.classList.remove('active');
};

const openPreviewModal = (itemId) => {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  state.activePreviewItemId = itemId;
  const modal = document.getElementById('quick-note-preview-modal');
  const nameEl = document.getElementById('quick-note-preview-name');
  const priceEl = document.getElementById('quick-note-preview-price');
  const statusPill = document.getElementById('quick-note-preview-status-pill');
  const topBadge = document.getElementById('quick-note-preview-top-badge');
  const groupRow = document.getElementById('quick-note-preview-group-row');
  const groupEl = document.getElementById('quick-note-preview-group');
  const priorityEl = document.getElementById('quick-note-preview-priority');
  const linkRow = document.getElementById('quick-note-preview-link-row');
  const linkVal = document.getElementById('quick-note-preview-link-val');
  const visitBtn = document.getElementById('quick-note-preview-visit-btn');
  const imgBox = document.getElementById('quick-note-preview-image-container');
  const modalImg = document.getElementById('quick-note-preview-modal-img');

  if (!modal) return;

  const isChecked = item.checked === true || item.checked === 1;

  // 1. Top Bar Group Indicator
  if (topBadge) {
    topBadge.textContent = item.group ? item.group.trim() : 'Wishlist Item';
  }

  // 2. Title & Price
  if (nameEl) nameEl.textContent = item.title || 'Untitled';
  if (priceEl) priceEl.textContent = formatPrice(item.price, item.currency || state.currency);

  // 3. Status Tag (only shown when Acquired)
  if (statusPill) {
    if (isChecked) {
      statusPill.textContent = 'Acquired';
      statusPill.className = 'preview-status-tag is-acquired';
      statusPill.classList.remove('hidden');
    } else {
      statusPill.classList.add('hidden');
    }
  }

  // 4. Group (Clean Text)
  if (groupEl) {
    const gName = item.group ? item.group.trim() : 'General';
    groupEl.textContent = gName;
  }

  // 5. Priority (Clean Text)
  if (priorityEl) {
    const p = Number(item.priority) || 2;
    if (p === 1) {
      priorityEl.textContent = 'High (P1)';
      priorityEl.className = 'preview-detail-value priority-p1';
    } else if (p === 3) {
      priorityEl.textContent = 'Low (P3)';
      priorityEl.className = 'preview-detail-value priority-p3';
    } else {
      priorityEl.textContent = 'Medium (P2)';
      priorityEl.className = 'preview-detail-value priority-p2';
    }
  }

  // 6. Source Link (Clean neutral link with ↗)
  if (item.link && item.link.trim().length > 0) {
    let domain = 'Store Link';
    try {
      const parsed = new URL(item.link);
      domain = parsed.hostname.replace(/^www\./, '');
    } catch (e) {}

    if (linkRow) linkRow.classList.remove('hidden');
    if (linkVal) {
      linkVal.innerHTML = `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="preview-text-link">${escapeHtml(domain)}<span class="ext-arrow">↗</span></a>`;
    }
    if (visitBtn) {
      visitBtn.href = item.link;
      visitBtn.classList.remove('hidden');
    }
  } else {
    if (linkRow) linkRow.classList.add('hidden');
    if (visitBtn) visitBtn.classList.add('hidden');
  }

  // 7. Image & Panning
  const src = getImageSrc(item);
  const pan = getImagePan(item);
  const fit = getImageFit(item);

  if (src) {
    if (modalImg) {
      modalImg.src = src;
      modalImg.style.objectPosition = `${pan.x}% ${pan.y}%`;
      const fitText = document.getElementById('preview-img-fit-text');
      const dragHint = document.getElementById('quick-note-preview-drag-hint');
      if (fit === 'contain') {
        modalImg.classList.add('fit-contain');
        if (fitText) fitText.textContent = 'Contain';
        if (dragHint) dragHint.classList.add('hidden');
      } else {
        modalImg.classList.remove('fit-contain');
        if (fitText) fitText.textContent = 'Cover';
        if (dragHint) dragHint.classList.remove('hidden');
      }
    }
    if (imgBox) imgBox.classList.remove('hidden');
  } else {
    if (imgBox) imgBox.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  safeCreateLucideIcons();
};

const closePreviewModal = () => {
  const modal = document.getElementById('quick-note-preview-modal');
  if (modal) modal.classList.add('hidden');
  state.activePreviewItemId = null;
};

const openGroupModal = (presetGroup = '') => {
  const modal = document.getElementById('group-modal');
  const groupInput = document.getElementById('group-name-input');
  const emojiPicker = document.getElementById('group-emoji-picker');
  const presetContainer = document.getElementById('group-modal-presets');
  const modalTitle = document.getElementById('group-modal-title');

  if (!modal) return;
  state.activeRenamingGroup = presetGroup || null;
  state.activeGroupIcon = getGroupIcon(presetGroup);

  if (modalTitle) {
    modalTitle.textContent = presetGroup ? 'Rename Group' : 'Group Items';
  }
  if (groupInput) groupInput.value = presetGroup;

  // Render Monochrome Icon Picker Grid
  if (emojiPicker) {
    emojiPicker.innerHTML = GROUP_MONO_ICONS.map(ic => `
      <button type="button" class="group-emoji-btn ${state.activeGroupIcon === ic.id ? 'active' : ''}" data-icon="${ic.id}" title="${ic.label}">
        <i data-lucide="${ic.id}"></i>
      </button>
    `).join('');
  }

  // Render Preset Chips
  if (presetContainer) {
    presetContainer.innerHTML = CATEGORY_PRESETS.map(cat => `
      <button type="button" class="category-chip ${presetGroup === cat.name ? 'active' : ''}" data-preset="${escapeHtml(cat.name)}" data-icon="${cat.icon}">
        <i data-lucide="${cat.icon}" style="width: 12px; height: 12px;"></i>
        <span>${escapeHtml(cat.name)}</span>
      </button>
    `).join('');
  }

  modal.classList.remove('hidden');
  safeCreateLucideIcons();
  if (groupInput) groupInput.focus();
};

const closeGroupModal = () => {
  const modal = document.getElementById('group-modal');
  if (modal) modal.classList.add('hidden');
  state.activeRenamingGroup = null;
};

const openConfirmModal = (message, onConfirm) => {
  const modal = document.getElementById('confirm-modal');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-action-btn');

  if (!modal) return;
  if (msgEl) msgEl.textContent = message;

  confirmBtn.onclick = () => {
    modal.classList.add('hidden');
    if (typeof onConfirm === 'function') onConfirm();
  };

  modal.classList.remove('hidden');
};

const closeConfirmModal = () => {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
};

const openAuthModal = (mode = 'signin') => {
  const modal = document.getElementById('auth-modal');
  const form = document.getElementById('auth-form');
  const errorBox = document.getElementById('auth-error-box');

  if (!modal) return;
  if (form) form.reset();
  if (errorBox) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  setAuthMode(mode);
  modal.classList.remove('hidden');
  safeCreateLucideIcons();
};

const closeAuthModal = () => {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
};

const setAuthMode = (mode) => {
  const signinTab = document.getElementById('auth-tab-signin');
  const signupTab = document.getElementById('auth-tab-signup');
  const nameGroup = document.getElementById('auth-name-group');
  const submitText = document.getElementById('auth-submit-text');

  if (mode === 'signup') {
    if (signupTab) signupTab.classList.add('active');
    if (signinTab) signinTab.classList.remove('active');
    if (nameGroup) nameGroup.classList.remove('hidden');
    if (submitText) submitText.textContent = 'Create Account';
  } else {
    if (signinTab) signinTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
    if (nameGroup) nameGroup.classList.add('hidden');
    if (submitText) submitText.textContent = 'Sign In';
  }
};

// ==========================================
// 7. EVENT LISTENERS & INITIALIZATION
// ==========================================
const initEventHandlers = () => {
  // Global Click Delegate
  document.addEventListener('click', (e) => {
    // 1. Checkbox Toggle
    const checkBtn = e.target.closest('[data-action="toggle-check"]');
    if (checkBtn) {
      e.stopPropagation();
      toggleItemCheck(checkBtn.getAttribute('data-id'));
      return;
    }

    // 2. Select Toggle
    const selectBtn = e.target.closest('[data-action="toggle-select"]');
    if (selectBtn) {
      e.stopPropagation();
      const id = selectBtn.getAttribute('data-id');
      if (state.selectedIds.has(id)) state.selectedIds.delete(id);
      else state.selectedIds.add(id);
      render();
      return;
    }

    // 3. Edit Item
    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
      e.stopPropagation();
      openQuickNoteModal(editBtn.getAttribute('data-id'));
      return;
    }

    // 4. Delete Item
    const deleteBtn = e.target.closest('[data-action="delete"]');
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.getAttribute('data-id');
      openConfirmModal('Are you sure you want to delete this item?', () => deleteSingleItem(id));
      return;
    }

    // 5. Preview Item
    const previewTarget = e.target.closest('[data-action="preview"]');
    if (previewTarget && !state.isSelectMode) {
      openPreviewModal(previewTarget.getAttribute('data-id'));
      return;
    }

    // 6. Group Toggle (Accordion)
    const groupToggle = e.target.closest('[data-action="toggle-group"]');
    if (groupToggle) {
      e.stopPropagation();
      const groupName = groupToggle.getAttribute('data-group');
      if (state.collapsedGroups.has(groupName)) state.collapsedGroups.delete(groupName);
      else state.collapsedGroups.add(groupName);
      renderItemsList();
      return;
    }

    // 7. Rename Group
    const renameBtn = e.target.closest('[data-action="rename-group"]');
    if (renameBtn) {
      e.stopPropagation();
      const groupName = renameBtn.getAttribute('data-group');
      openGroupModal(groupName);
      return;
    }

    // 8. Close dropdown when clicking outside
    const userWrapper = document.getElementById('user-profile-wrapper');
    const sortDropdown = document.getElementById('notes-sort-dropdown');
    if (userWrapper && !userWrapper.contains(e.target)) {
      document.getElementById('user-profile-dropdown')?.classList.add('hidden');
    }
    if (sortDropdown && !sortDropdown.contains(e.target)) {
      document.getElementById('notes-sort-menu')?.classList.add('hidden');
    }
  });

  // User Profile Dropdown Toggle
  document.getElementById('user-profile-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-profile-dropdown')?.classList.toggle('hidden');
  });

  // Sort Dropdown Trigger & Menu
  document.getElementById('notes-sort-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notes-sort-menu')?.classList.toggle('hidden');
  });

  document.querySelectorAll('#notes-sort-menu .sort-menu-item')?.forEach(item => {
    item.addEventListener('click', (e) => {
      const sort = item.getAttribute('data-sort');
      if (sort) {
        if (state.sortBy === sort) {
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortBy = sort;
          state.sortOrder = (sort === 'title' || sort === 'priority') ? 'asc' : 'desc';
        }
        updateSortUI();
        document.getElementById('notes-sort-menu')?.classList.add('hidden');
        renderItemsList();
      }
    });
  });

  // Add Item Buttons
  document.getElementById('main-add-note-btn')?.addEventListener('click', () => openQuickNoteModal(null));
  document.getElementById('mobile-add-btn')?.addEventListener('click', () => openQuickNoteModal(null));

  // Edit Mode Toggle
  document.getElementById('notes-edit-mode-btn')?.addEventListener('click', () => {
    state.viewMode = 'edit';
    document.getElementById('notes-view-title')?.classList.add('hidden');
    document.getElementById('notes-back-to-view-btn')?.classList.remove('hidden');
    document.getElementById('notes-view-actions')?.classList.add('hidden');
    document.getElementById('notes-edit-actions')?.classList.remove('hidden');
    render();
  });

  document.getElementById('notes-back-to-view-btn')?.addEventListener('click', () => {
    state.viewMode = 'view';
    state.isSelectMode = false;
    document.getElementById('notes-view-title')?.classList.remove('hidden');
    document.getElementById('notes-back-to-view-btn')?.classList.add('hidden');
    document.getElementById('notes-view-actions')?.classList.remove('hidden');
    document.getElementById('notes-edit-actions')?.classList.add('hidden');
    render();
  });

  // Select Mode Toggle
  document.getElementById('notes-select-toggle-btn')?.addEventListener('click', () => {
    state.isSelectMode = !state.isSelectMode;
    render();
  });

  // Select All
  document.getElementById('notes-select-all-btn')?.addEventListener('click', () => {
    if (state.selectedIds.size === state.items.length) {
      state.selectedIds.clear();
    } else {
      state.items.forEach(i => state.selectedIds.add(i.id));
    }
    render();
  });

  // Complete Selected
  document.getElementById('notes-complete-selected-btn')?.addEventListener('click', () => {
    if (state.selectedIds.size > 0) completeSelectedItems();
  });

  // Group Selected
  document.getElementById('notes-group-selected-btn')?.addEventListener('click', () => {
    if (state.selectedIds.size > 0) openGroupModal();
  });

  // Ungroup Selected
  document.getElementById('notes-ungroup-selected-btn')?.addEventListener('click', () => {
    if (state.selectedIds.size > 0) {
      openConfirmModal(`Remove ${state.selectedIds.size} items from their groups?`, ungroupSelectedItems);
    }
  });

  // Delete Selected
  document.getElementById('notes-delete-selected-btn')?.addEventListener('click', () => {
    if (state.selectedIds.size > 0) {
      openConfirmModal(`Delete ${state.selectedIds.size} selected items?`, deleteSelectedItems);
    }
  });

  // Quick Note Form Submit
  document.getElementById('quick-note-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = cleanProductTitle(document.getElementById('quick-note-title-input')?.value || '');
    const price = parseFloat(document.getElementById('quick-note-price-input')?.value) || 0;
    const group = document.getElementById('quick-note-group-input')?.value.trim() || null;
    const link = document.getElementById('quick-note-link-input')?.value.trim() || null;
    const priorityInput = document.getElementById('quick-note-priority-input');
    const priority = priorityInput ? (Number(priorityInput.value) || 2) : 2;
    const checked = !!document.getElementById('quick-note-checked-input')?.checked;

    if (!title) return;

    saveItemFromModal({
      title,
      price,
      group,
      link,
      priority,
      checked,
      imageData: currentUploadedImage
    });
  });

  // Custom Priority Dropdown Interactions
  const prioTrigger = document.getElementById('quick-note-priority-trigger');
  const prioMenu = document.getElementById('quick-note-priority-menu');

  prioTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = prioMenu?.classList.contains('hidden');
    if (isHidden) {
      prioMenu?.classList.remove('hidden');
      prioTrigger?.classList.add('active');
    } else {
      prioMenu?.classList.add('hidden');
      prioTrigger?.classList.remove('active');
    }
  });

  document.querySelectorAll('#quick-note-priority-menu .custom-dropdown-item')?.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = Number(btn.getAttribute('data-priority')) || 2;
      setModalPriority(p);
    });
  });

  // Group Input & Floating Pills Tray Interaction
  const groupInput = document.getElementById('quick-note-group-input');
  const groupTray = document.getElementById('quick-note-group-pills-list');

  groupInput?.addEventListener('focus', () => {
    populateModalGroupPills(groupInput.value, true);
  });

  groupInput?.addEventListener('click', (e) => {
    e.stopPropagation();
    populateModalGroupPills(groupInput.value, true);
  });

  groupInput?.addEventListener('input', (e) => {
    populateModalGroupPills(e.target.value, true);
  });

  // Select pill in floating tray
  groupTray?.addEventListener('click', (e) => {
    const pill = e.target.closest('.group-pill-opt');
    if (!pill) return;
    e.preventDefault();
    e.stopPropagation();
    const g = pill.getAttribute('data-group');
    if (groupInput && g) {
      if (groupInput.value.trim().toLowerCase() === g.toLowerCase()) {
        groupInput.value = '';
        populateModalGroupPills('', false);
      } else {
        groupInput.value = g;
        populateModalGroupPills(g, false);
      }
    }
  });

  // Close floating dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#quick-note-group-container')) {
      groupTray?.classList.add('hidden');
    }
    if (!e.target.closest('#quick-note-priority-container')) {
      prioMenu?.classList.add('hidden');
      prioTrigger?.classList.remove('active');
    }
  });

  // Image Upload in Modal
  const imageUploadInput = document.getElementById('quick-note-image-upload');
  document.getElementById('quick-note-upload-area')?.addEventListener('click', () => {
    imageUploadInput?.click();
  });

  imageUploadInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        currentUploadedImage = re.target.result;
        const previewImg = document.getElementById('quick-note-preview-img');
        const previewBox = document.getElementById('quick-note-image-preview');
        const uploadArea = document.getElementById('quick-note-upload-area');
        if (previewImg) previewImg.src = currentUploadedImage;
        if (previewBox) previewBox.classList.remove('hidden');
        if (uploadArea) uploadArea.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  // Paste image button
  document.getElementById('quick-note-paste-btn')?.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (re) => {
            currentUploadedImage = re.target.result;
            const previewImg = document.getElementById('quick-note-preview-img');
            const previewBox = document.getElementById('quick-note-image-preview');
            const uploadArea = document.getElementById('quick-note-upload-area');
            if (previewImg) previewImg.src = currentUploadedImage;
            if (previewBox) previewBox.classList.remove('hidden');
            if (uploadArea) uploadArea.classList.add('hidden');
            showToast('Photo pasted from clipboard');
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      showToast('No image in clipboard');
    } catch (e) {
      showToast('Clipboard access denied or unavailable');
    }
  });

  // Remove image button
  document.getElementById('quick-note-remove-image-btn')?.addEventListener('click', () => {
    currentUploadedImage = null;
    currentImagePan = { x: 50, y: 50 };
    currentImageFit = 'cover';
    document.getElementById('quick-note-image-preview')?.classList.add('hidden');
    document.getElementById('quick-note-upload-area')?.classList.remove('hidden');
    if (imageUploadInput) imageUploadInput.value = '';
  });

  // Toggle Image Fit Mode in Edit Modal (Cover vs Contain)
  document.getElementById('quick-note-img-fit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const previewImg = document.getElementById('quick-note-preview-img');
    const fitText = document.getElementById('quick-note-img-fit-text');
    const dragHint = document.getElementById('quick-note-edit-drag-hint');
    if (!previewImg) return;

    if (currentImageFit === 'cover') {
      currentImageFit = 'contain';
      previewImg.classList.add('fit-contain');
      if (fitText) fitText.textContent = 'Contain';
      if (dragHint) dragHint.classList.add('hidden');
    } else {
      currentImageFit = 'cover';
      previewImg.classList.remove('fit-contain');
      if (fitText) fitText.textContent = 'Cover';
      if (dragHint) dragHint.classList.remove('hidden');
    }
  });

  // Toggle Image Fit Mode in Preview Modal
  document.getElementById('preview-img-fit-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const item = state.items.find(i => i.id === state.activePreviewItemId);
    if (!item) return;

    const modalImg = document.getElementById('quick-note-preview-modal-img');
    const fitText = document.getElementById('preview-img-fit-text');
    const dragHint = document.getElementById('quick-note-preview-drag-hint');
    const currentFit = getImageFit(item);
    const newFit = currentFit === 'cover' ? 'contain' : 'cover';

    item.imageFit = newFit;
    if (modalImg) {
      if (newFit === 'contain') {
        modalImg.classList.add('fit-contain');
        if (fitText) fitText.textContent = 'Contain';
        if (dragHint) dragHint.classList.add('hidden');
      } else {
        modalImg.classList.remove('fit-contain');
        if (fitText) fitText.textContent = 'Cover';
        if (dragHint) dragHint.classList.remove('hidden');
      }
    }

    try {
      const serialized = serializeImageData(getImageSrc(item), getImagePan(item), newFit);
      await api.updateItem(item.id, { imageData: serialized });
    } catch (err) {}
  });

  // Open Full-Resolution Lightbox from Preview Modal
  document.getElementById('preview-img-fullscreen-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = state.items.find(i => i.id === state.activePreviewItemId);
    if (item) {
      openLightboxModal(getImageSrc(item));
    }
  });

  // Lightbox Close Handlers
  document.getElementById('lightbox-close-btn')?.addEventListener('click', closeLightboxModal);
  document.getElementById('image-lightbox-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'image-lightbox-modal' || e.target.closest('#lightbox-close-btn')) {
      closeLightboxModal();
    }
  });

  // Initialize Pannable Image Reposition Controllers
  makePannable('quick-note-edit-pan-wrapper', 'quick-note-preview-img', () => currentImagePan, (pan) => {
    currentImagePan = pan;
  });

  makePannable('quick-note-preview-pan-wrapper', 'quick-note-preview-modal-img', () => {
    const item = state.items.find(i => i.id === state.activePreviewItemId);
    return getImagePan(item);
  }, (pan) => {
    const item = state.items.find(i => i.id === state.activePreviewItemId);
    if (item) {
      item.imagePan = pan;
      const serialized = serializeImageData(getImageSrc(item), pan, getImageFit(item));
      api.updateItem(item.id, { imageData: serialized }).catch(() => {});
    }
  });

  // URL Auto-Scraping / Link Autofill Handler
  let isFetchingLink = false;
  const triggerLinkScrape = async (url, isManual = false) => {
    if (!url || isFetchingLink) return;
    const cleanUrl = url.trim();
    if (!cleanUrl || cleanUrl.length < 5) return;

    isFetchingLink = true;
    const fetchBtn = document.getElementById('quick-note-fetch-link-btn');
    const fetchText = document.getElementById('quick-note-fetch-text');
    const titleInput = document.getElementById('quick-note-title-input');
    const priceInput = document.getElementById('quick-note-price-input');
    const groupInput = document.getElementById('quick-note-group-input');

    if (fetchBtn) {
      fetchBtn.style.opacity = '0.6';
      fetchBtn.style.pointerEvents = 'none';
    }
    if (fetchText) fetchText.textContent = 'Fetching...';

    showToast('Fetching product details...');

    try {
      const data = await api.scrapeProduct(cleanUrl);
      if (data && data.success) {
        if (data.title && (!titleInput?.value || isManual)) {
          if (titleInput) titleInput.value = cleanProductTitle(data.title);
        }
        if (data.price && (Number(data.price) > 0) && (!priceInput?.value || priceInput.value === '0' || isManual)) {
          if (priceInput) priceInput.value = data.price;
        }
        if (data.suggestedGroup && (!groupInput?.value || isManual)) {
          if (groupInput) groupInput.value = data.suggestedGroup;
        }
        if (data.imageUrl && (!currentUploadedImage || isManual)) {
          currentUploadedImage = data.imageUrl;
          const previewImg = document.getElementById('quick-note-preview-img');
          const previewBox = document.getElementById('quick-note-image-preview');
          const uploadArea = document.getElementById('quick-note-upload-area');
          if (previewImg) previewImg.src = currentUploadedImage;
          if (previewBox) previewBox.classList.remove('hidden');
          if (uploadArea) uploadArea.classList.add('hidden');
        }
        showToast('Product details loaded!');
      } else if (isManual) {
        showToast('Could not auto-detect details. You can enter them manually.');
      }
    } catch (err) {
      if (isManual) {
        showToast('Failed to fetch link details');
      }
    } finally {
      isFetchingLink = false;
      if (fetchBtn) {
        fetchBtn.style.opacity = '1';
        fetchBtn.style.pointerEvents = 'auto';
      }
      if (fetchText) fetchText.textContent = 'Auto-fill Details';
    }
  };

  // Trigger on manual button click
  document.getElementById('quick-note-fetch-link-btn')?.addEventListener('click', () => {
    const url = document.getElementById('quick-note-link-input')?.value.trim();
    if (!url) {
      showToast('Please enter a link / URL first');
      return;
    }
    triggerLinkScrape(url, true);
  });

  // Trigger automatically on paste
  document.getElementById('quick-note-link-input')?.addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
    if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://') || pasted.includes('.com') || pasted.includes('.id') || pasted.includes('.link') || pasted.includes('.co'))) {
      setTimeout(() => triggerLinkScrape(pasted, false), 60);
    }
  });

  // Trigger automatically on blur
  document.getElementById('quick-note-link-input')?.addEventListener('blur', (e) => {
    const url = e.target.value.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.includes('.com') || url.includes('.id') || url.includes('.link') || url.includes('.co'))) {
      const titleInput = document.getElementById('quick-note-title-input');
      if (titleInput && !titleInput.value) {
        triggerLinkScrape(url, false);
      }
    }
  });

  // Group Form Submit
  document.getElementById('group-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const groupName = document.getElementById('group-name-input')?.value.trim();
    if (!groupName) return;

    if (groupName && state.activeGroupIcon) {
      state.groupIcons[groupName] = state.activeGroupIcon;
      try {
        localStorage.setItem('wishlist_group_icons', JSON.stringify(state.groupIcons));
      } catch (err) {}
    }

    if (state.activeRenamingGroup) {
      const oldGroup = state.activeRenamingGroup;
      if (state.groupIcons[oldGroup] && oldGroup !== groupName) {
        state.groupIcons[groupName] = state.groupIcons[oldGroup];
        delete state.groupIcons[oldGroup];
        try {
          localStorage.setItem('wishlist_group_icons', JSON.stringify(state.groupIcons));
        } catch (err) {}
      }

      state.items.forEach(i => {
        if (i.group === oldGroup) i.group = groupName;
      });
      state.activeRenamingGroup = null;
      render();
      closeGroupModal();
      try {
        await api.bulkOperation({
          action: 'rename_group',
          oldGroup,
          newGroup: groupName
        });
        showToast(`Group renamed to "${groupName}"`);
      } catch (err) {
        showToast('Failed to rename group');
      }
      return;
    }

    if (state.isSelectMode && state.selectedIds.size > 0) {
      state.items.forEach(i => {
        if (state.selectedIds.has(i.id)) i.group = groupName;
      });
      render();
      closeGroupModal();
      api.bulkOperation({
        action: 'save_all',
        items: state.items
      }).then(() => showToast(`Grouped ${state.selectedIds.size} items as "${groupName}"`));
    } else {
      closeGroupModal();
      openQuickNoteModal();
      const groupInput = document.getElementById('quick-note-group-input');
      if (groupInput) groupInput.value = groupName;
    }
  });

  // Group Monochrome Icon Picker
  document.getElementById('group-emoji-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    const selectedIcon = btn.getAttribute('data-icon');
    state.activeGroupIcon = selectedIcon;

    document.querySelectorAll('#group-emoji-picker .group-emoji-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  // Group Preset Chips in Group Modal
  document.getElementById('group-modal-presets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-preset]');
    if (chip) {
      const preset = chip.getAttribute('data-preset');
      const icon = chip.getAttribute('data-icon');
      const input = document.getElementById('group-name-input');
      if (input) {
        input.value = preset;
        input.focus();
      }
      if (icon) {
        state.activeGroupIcon = icon;
        document.querySelectorAll('#group-emoji-picker .group-emoji-btn').forEach(b => {
          if (b.getAttribute('data-icon') === icon) b.classList.add('active');
          else b.classList.remove('active');
        });
      }
      document.querySelectorAll('#group-modal-presets .category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
  });

  // Preview Edit Button
  document.getElementById('quick-note-preview-edit-btn')?.addEventListener('click', () => {
    const id = state.activePreviewItemId;
    closePreviewModal();
    if (id) openQuickNoteModal(id);
  });

  // Modal Close Buttons
  document.querySelectorAll('.modal-close, .modal-overlay')?.forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.modal-close')) {
        closeQuickNoteModal();
        closePreviewModal();
        closeGroupModal();
        closeConfirmModal();
        closeAuthModal();
        closeLightboxModal();
      }
    });
  });

  // Prevent closing when clicking modal content
  document.querySelectorAll('.modal')?.forEach(m => {
    m.addEventListener('click', e => e.stopPropagation());
  });

  // Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeQuickNoteModal();
      closePreviewModal();
      closeGroupModal();
      closeConfirmModal();
      closeAuthModal();
      closeLightboxModal();
    }
  });

  // Auth Form Submit (Login / Register)
  let currentAuthMode = 'signin';
  document.getElementById('auth-tab-signin')?.addEventListener('click', () => {
    currentAuthMode = 'signin';
    setAuthMode('signin');
  });
  document.getElementById('auth-tab-signup')?.addEventListener('click', () => {
    currentAuthMode = 'signup';
    setAuthMode('signup');
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('auth-error-box');
    const nameInput = document.getElementById('auth-name-input');
    const emailInput = document.getElementById('auth-email-input');
    const pwdInput = document.getElementById('auth-password-input');

    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = pwdInput?.value || '';

    if (errorBox) {
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
    }

    try {
      let res;
      if (currentAuthMode === 'signup') {
        res = await api.register(name, email, password);
      } else {
        res = await api.login(email, password);
      }

      if (res && res.token && res.user) {
        setAuthToken(res.token);
        state.currentUser = res.user;
        closeAuthModal();
        showToast(`Welcome, ${res.user.name || res.user.username}!`);
        await loadUserData();
      }
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || 'Authentication failed';
        errorBox.classList.remove('hidden');
      }
    }
  });

  // Continue as Guest Button
  document.getElementById('auth-guest-btn')?.addEventListener('click', () => {
    setAuthToken(null);
    state.currentUser = { id: 'guest', name: 'Guest User', isGuest: true };
    closeAuthModal();
    showToast('Continuing as Guest');
    loadUserData();
  });

  // Toggle password visibility
  document.getElementById('auth-toggle-pwd')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('auth-password-input');
    if (pwdInput) {
      pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
    }
  });

  // User dropdown actions
  document.getElementById('dropdown-sync-btn')?.addEventListener('click', async () => {
    const icon = document.querySelector('#dropdown-sync-btn i, #dropdown-sync-btn svg');
    if (icon) icon.classList.add('spin-slow');
    await loadUserData();
    if (icon) icon.classList.remove('spin-slow');
    showToast('Data refreshed from server ✓');
    document.getElementById('user-profile-dropdown')?.classList.add('hidden');
  });

  document.getElementById('dropdown-logout-btn')?.addEventListener('click', async () => {
    try { await api.logout(); } catch (e) {}
    setAuthToken(null);
    state.currentUser = null;
    document.getElementById('user-profile-dropdown')?.classList.add('hidden');
    showToast('Signed out');
    await loadUserData();
  });

  document.getElementById('dropdown-switch-user-btn')?.addEventListener('click', () => {
    document.getElementById('user-profile-dropdown')?.classList.add('hidden');
    openAuthModal('signin');
  });

  // Export JSON Backup
  document.getElementById('dropdown-export-btn')?.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.items, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `wishlist_backup_${new Date().toISOString().split('T')[0]}.json`);
    dlAnchor.click();
    document.getElementById('user-profile-dropdown')?.classList.add('hidden');
    showToast('Backup downloaded');
  });

  // Import JSON Backup
  const importInput = document.getElementById('import-json-input');
  document.getElementById('dropdown-import-btn')?.addEventListener('click', () => {
    importInput?.click();
  });

  importInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (re) => {
        try {
          const imported = JSON.parse(re.target.result);
          if (Array.isArray(imported)) {
            await api.bulkOperation({ action: 'save_all', items: imported });
            await loadUserData();
            showToast(`Imported ${imported.length} items successfully!`);
          } else {
            showToast('Invalid backup file');
          }
        } catch (err) {
          showToast('Failed to parse JSON backup');
        }
      };
      reader.readAsText(file);
    }
  });
};

// ==========================================
// 8. DATA LOADING & BOOTSTRAP
// ==========================================
const loadUserData = async () => {
  try {
    const res = await api.getItems();
    if (res && Array.isArray(res.items)) {
      state.items = res.items;
    }
  } catch (err) {
    console.warn('Could not fetch items:', err.message);
  }
  render();
};

const init = async () => {
  initEventHandlers();

  // Check existing session
  const token = getAuthToken();
  if (token) {
    try {
      const meRes = await api.getMe();
      if (meRes && meRes.user) {
        state.currentUser = meRes.user;
      }
    } catch (e) {
      setAuthToken(null);
      state.currentUser = null;
    }
  }

  // Load items from database
  await loadUserData();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// --- DEV AUTO-DETECT LIVE RELOAD ---
(() => {
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname) || location.port === '3000';
  if (!isLocal || typeof EventSource === 'undefined') return;

  let es = null;
  let reconnectTimer = null;

  function connect() {
    es = new EventSource('/api/dev/live-reload');

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'css-reload') {
          const links = document.querySelectorAll('link[rel="stylesheet"]');
          links.forEach(link => {
            if (link.href && link.href.includes('styles.css')) {
              const url = new URL(link.href);
              url.searchParams.set('t', Date.now());
              link.href = url.toString();
            }
          });
        } else if (data.type === 'reload') {
          location.reload();
        }
      } catch (e) {}
    };

    es.onerror = () => {
      es.close();
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1000);
      }
    };
  }

  connect();
})();
