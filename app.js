// app.js — WISHLIST Application Engine

const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

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

let state = {
  items: [],
  view: 'grid',
  sort: 'priority',
  currency: 'IDR',
  activeTab: 'catalog',
  notesMode: 'list',
  notesItems: [],
  rawNotepadText: '',
  filters: [],
  search: '',
  editingId: null,
  deleteId: null,
  progressId: null,
  achievedOpen: false,
  activeFolderId: null
};

const defaultNotesItems = [
  { id: 'group-sample-1', title: 'Desk Setup Gear', isGroup: true, expanded: true },
  { id: 'note-1', title: 'Keychron Q1 Max Keyboard', price: 3200000, currency: 'IDR', checked: false, parentId: 'group-sample-1' },
  { id: 'note-2', title: 'BenQ Monitor Light Bar', price: 650000, currency: 'IDR', checked: true, parentId: 'group-sample-1' },
  { id: 'note-3', title: 'Ergonomic Mesh Chair', price: 4500000, currency: 'IDR', checked: false }
];

const loadNotes = () => {
  try {
    const storedItems = localStorage.getItem('wishlist_notes_items');
    if (storedItems !== null) {
      state.notesItems = JSON.parse(storedItems);
    } else {
      state.notesItems = defaultNotesItems;
    }
    const storedText = localStorage.getItem('wishlist_raw_notepad');
    if (storedText !== null) {
      state.rawNotepadText = storedText;
    } else {
      state.rawNotepadText = "Keychron Keyboard - 3200000\nMonitor Light Bar - 650000 [x]\nErgonomic Chair - 4500000";
    }
  } catch (e) {
    state.notesItems = defaultNotesItems;
    state.rawNotepadText = '';
  }
};

const saveNotes = () => {
  localStorage.setItem('wishlist_notes_items', JSON.stringify(state.notesItems));
  localStorage.setItem('wishlist_raw_notepad', state.rawNotepadText);
};

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

const loadItems = () => {
  try {
    const stored = localStorage.getItem('wishlist_items');
    if (stored === null) return defaultItems;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : defaultItems;
  } catch {
    return defaultItems;
  }
};

const saveItems = () => {
  localStorage.setItem('wishlist_items', JSON.stringify(state.items));
};

const loadPreferences = () => {
  try {
    const stored = localStorage.getItem('wishlist_state');
    if (stored) {
      const prefs = JSON.parse(stored);
      state.view = prefs.view || 'grid';
      state.sort = prefs.sort || 'priority';
      state.currency = prefs.currency || 'IDR';
      state.activeTab = prefs.activeTab || 'catalog';
      state.notesMode = prefs.notesMode || 'list';
    }
  } catch (e) {
    // Ignore
  }
};

const savePreferences = () => {
  localStorage.setItem('wishlist_state', JSON.stringify({
    view: state.view,
    sort: state.sort,
    currency: state.currency,
    activeTab: state.activeTab,
    notesMode: state.notesMode
  }));
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

const openGroupModal = () => {
  const modal = document.getElementById('group-modal');
  const input = document.getElementById('group-name-input');
  if (!modal || !input) return;
  input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
};

const closeGroupModal = () => {
  const modal = document.getElementById('group-modal');
  if (modal) modal.classList.add('hidden');
};

const openQuickNoteModal = (noteId = null, preselectGroupId = null) => {
  const modal = document.getElementById('quick-note-modal');
  const titleEl = document.getElementById('quick-note-modal-title');
  const titleInput = document.getElementById('quick-note-title-input');
  const priceInput = document.getElementById('quick-note-price-input');
  const groupSelect = document.getElementById('quick-note-group-select');
  const checkedInput = document.getElementById('quick-note-checked-input');
  const convertContainer = document.getElementById('quick-note-convert-container');
  const submitBtnSpan = document.querySelector('#quick-note-submit-btn span');
  
  if (!modal) return;
  
  state.editingNoteId = noteId;
  
  if (noteId) {
    const item = state.notesItems.find(n => n.id === noteId);
    if (item) {
      if (titleEl) titleEl.textContent = item.isGroup ? 'Edit Group' : 'Edit Note Item';
      if (titleInput) titleInput.value = item.title;
      if (priceInput) {
        priceInput.value = item.isGroup ? '' : (item.price || '');
        priceInput.disabled = !!item.isGroup;
      }
      populateGroupSelect(item.parentId || '');
      if (groupSelect) {
        groupSelect.value = item.parentId || '';
        groupSelect.disabled = !!item.isGroup;
      }
      if (checkedInput) {
        checkedInput.checked = !!item.checked;
        checkedInput.disabled = !!item.isGroup;
      }
      if (submitBtnSpan) submitBtnSpan.textContent = 'Save Changes';
      if (convertContainer) {
        if (item.isGroup) convertContainer.classList.add('hidden');
        else convertContainer.classList.remove('hidden');
      }
    }
  } else {
    if (titleEl) titleEl.textContent = preselectGroupId ? 'Add Item to Group' : 'Add Note Item';
    if (titleInput) titleInput.value = '';
    if (priceInput) {
      priceInput.value = '';
      priceInput.disabled = false;
    }
    populateGroupSelect(preselectGroupId || '');
    if (groupSelect) {
      groupSelect.value = preselectGroupId || '';
      groupSelect.disabled = false;
    }
    if (checkedInput) {
      checkedInput.checked = false;
      checkedInput.disabled = false;
    }
    if (submitBtnSpan) submitBtnSpan.textContent = 'Add Item';
    if (convertContainer) convertContainer.classList.add('hidden');
  }
  
  modal.classList.remove('hidden');
  setTimeout(() => titleInput?.focus(), 100);
};

const closeQuickNoteModal = () => {
  const modal = document.getElementById('quick-note-modal');
  if (modal) modal.classList.add('hidden');
  state.editingNoteId = null;
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
    if (window.lucide) lucide.createIcons();
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
  if (window.lucide) lucide.createIcons();
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

const getGroupChildren = (groupId) => {
  return state.notesItems.filter(item => item.parentId === groupId);
};

const getGroupTotalPrice = (groupId) => {
  const children = getGroupChildren(groupId);
  return children.reduce((sum, item) => {
    const displayPrice = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
    return sum + displayPrice;
  }, 0);
};

const isGroupChecked = (groupId) => {
  const children = getGroupChildren(groupId);
  if (children.length === 0) return false;
  return children.every(item => item.checked);
};

const populateGroupSelect = (selectedParentId = '') => {
  const select = document.getElementById('quick-note-group-select');
  if (!select) return;
  const groups = state.notesItems.filter(item => item.isGroup);
  let html = `<option value="">None (Standalone)</option>`;
  groups.forEach(g => {
    html += `<option value="${g.id}">📁 ${g.title}</option>`;
  });
  select.innerHTML = html;
  select.value = selectedParentId || '';
};

const calculateNotesAccumulator = () => {
  let totalCost = 0;
  let checkedCost = 0;
  
  if (state.notesMode === 'list') {
    state.notesItems.forEach(item => {
      if (!item.isGroup) {
        const val = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
        totalCost += val;
        if (item.checked) checkedCost += val;
      }
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
        let numStr = match[0].replace(/[^\d.]/g, '');
        let val = parseFloat(numStr) || 0;
        let itemCurr = /[\$]/.test(match[0]) ? 'USD' : 'IDR';
        let displayVal = convertCurrency(val, itemCurr, state.currency);
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

const renderQuickNotesList = () => {
  const container = document.getElementById('quick-notes-list');
  if (!container) return;
  
  if (!state.notesItems || state.notesItems.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:28px 14px;color:var(--text-tertiary);font-size:13px;">No wishlist items yet. Switch to <b>Add / Manage Items</b> tab above to add items!</div>`;
    return;
  }
  
  let html = '';
  
  if (state.activeFolderId) {
    const activeFolder = state.notesItems.find(n => n.id === state.activeFolderId);
    if (!activeFolder) {
      state.activeFolderId = null;
      renderQuickNotesList();
      return;
    }
    
    const children = getGroupChildren(state.activeFolderId);
    const groupPrice = getGroupTotalPrice(state.activeFolderId);
    const formattedGroupPrice = formatCurrencyValue(groupPrice, state.currency);
    
    html += `
      <div class="folder-navigation-header" data-action="exit-folder" title="Back to All Notes" style="cursor: pointer;">
        <div class="folder-title-display">
          <i data-lucide="arrow-left" class="folder-back-arrow-icon"></i>
          <i data-lucide="folder-open" class="folder-open-icon"></i>
          <span class="folder-title-text">${activeFolder.title}</span>
          <span class="group-badge-pill">${children.length} items</span>
        </div>
      </div>
    `;
    
    if (children.length === 0) {
      html += `<div style="text-align:center;padding:24px 12px;color:var(--text-tertiary);font-size:12.5px;">This folder is empty.</div>`;
    } else {
      let idx = 0;
      html += children.map(child => {
        idx++;
        const childPrice = convertCurrency(child.price || 0, child.currency || 'IDR', state.currency);
        const formattedChildPrice = formatCurrencyValue(childPrice, state.currency);
        const num = String(idx).padStart(2, '0');
        return `
          <div class="quick-note-row ${child.checked ? 'checked' : ''}" data-id="${child.id}">
            <div class="quick-note-left">
              <span class="quick-note-index">${num}</span>
              <span class="quick-note-title">${child.title}</span>
            </div>
            <div class="quick-note-right">
              <span class="quick-note-price">${formattedChildPrice}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    // Root View
    const rootItems = state.notesItems.filter(item => !item.parentId);
    let globalIndex = 0;
    
    html = rootItems.map(item => {
      if (item.isGroup) {
        const children = getGroupChildren(item.id);
        const groupPrice = getGroupTotalPrice(item.id);
        const formattedPrice = formatCurrencyValue(groupPrice, state.currency);
        
        return `
          <div class="quick-note-row group-row-folder" data-action="open-folder" data-id="${item.id}" title="Open ${item.title} folder" style="cursor: pointer;">
            <div class="quick-note-left">
              <i data-lucide="folder" class="group-folder-icon"></i>
              <span class="quick-note-title">${item.title}</span>
              <span class="group-badge-pill">${children.length} items</span>
            </div>
            <div class="quick-note-right">
              <i data-lucide="chevron-right" style="width: 14px; height: 14px; color: var(--text-tertiary); margin-left: 4px;"></i>
            </div>
          </div>
        `;
      } else {
        globalIndex++;
        const displayPrice = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
        const formattedPrice = formatCurrencyValue(displayPrice, state.currency);
        const itemNum = String(globalIndex).padStart(2, '0');
        
        return `
          <div class="quick-note-row ${item.checked ? 'checked' : ''}" data-id="${item.id}">
            <div class="quick-note-left">
              <span class="quick-note-index">${itemNum}</span>
              <span class="quick-note-title">${item.title}</span>
            </div>
            <div class="quick-note-right">
              <span class="quick-note-price">${formattedPrice}</span>
            </div>
          </div>
        `;
      }
    }).join('');
  }
  
  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
};

const renderQuickNotesManageList = () => {
  const container = document.getElementById('quick-notes-manage-list');
  if (!container) return;
  
  populateGroupSelect();
  
  if (!state.notesItems || state.notesItems.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:12.5px;">No items in your wishlist list.</div>`;
    return;
  }
  
  let html = '';
  
  if (state.activeFolderId) {
    const activeFolder = state.notesItems.find(n => n.id === state.activeFolderId);
    if (!activeFolder) {
      state.activeFolderId = null;
      renderQuickNotesManageList();
      return;
    }
    
    const children = getGroupChildren(state.activeFolderId);
    
    html += `
      <div class="folder-navigation-header">
        <div class="folder-title-display" data-action="exit-folder" title="Back to All Notes" style="cursor: pointer;">
          <i data-lucide="arrow-left" class="folder-back-arrow-icon"></i>
          <i data-lucide="folder-open" class="folder-open-icon"></i>
          <span class="folder-title-text">${activeFolder.title}</span>
          <span class="group-badge-pill">${children.length} items</span>
        </div>
        <button type="button" class="btn-icon-subtle edit-btn" data-action="edit-note" data-id="${activeFolder.id}" title="Edit folder title">
          <i data-lucide="edit-2"></i>
        </button>
      </div>
    `;
    
    if (children.length === 0) {
      html += `
        <div style="text-align:center;padding:24px 12px;color:var(--text-tertiary);font-size:12.5px;">
          Folder is empty. Click <b>+ Add Item</b> above to add an item into this folder.
        </div>
      `;
    } else {
      html += children.map(child => {
        const childPrice = convertCurrency(child.price || 0, child.currency || 'IDR', state.currency);
        const formattedChildPrice = formatCurrencyValue(childPrice, state.currency);
        const isChildEditing = state.editingNoteId === child.id;
        
        return `
          <div class="quick-note-row ${child.checked ? 'checked' : ''} ${isChildEditing ? 'editing-row' : ''}" data-id="${child.id}">
            <div class="quick-note-left">
              <input type="checkbox" class="quick-note-checkbox" data-action="toggle-note-checked" data-id="${child.id}" ${child.checked ? 'checked' : ''} title="Mark completed">
              <span class="quick-note-title">${child.title}</span>
            </div>
            <div class="quick-note-right">
              <span class="quick-note-price">${formattedChildPrice}</span>
              <div class="quick-note-actions-always">
                <button type="button" class="btn-icon-subtle edit-btn" data-action="edit-note" data-id="${child.id}" title="Edit item">
                  <i data-lucide="edit-2"></i>
                </button>
                <button type="button" class="btn-icon-subtle ungroup-btn" data-action="ungroup-note" data-id="${child.id}" title="Remove from folder">
                  <i data-lucide="corner-up-left"></i>
                </button>
                <button type="button" class="btn-icon-subtle delete-btn" data-action="delete-note" data-id="${child.id}" title="Delete item">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    // Root Manage View
    const rootItems = state.notesItems.filter(item => !item.parentId);
    
    html = rootItems.map(item => {
      if (item.isGroup) {
        const children = getGroupChildren(item.id);
        const isEditing = state.editingNoteId === item.id;
        
        return `
          <div class="quick-note-row group-row-folder ${isEditing ? 'editing-row' : ''}" data-action="open-folder" data-id="${item.id}" style="cursor: pointer;">
            <div class="quick-note-left">
              <i data-lucide="folder" class="group-folder-icon"></i>
              <span class="quick-note-title">${item.title}</span>
              <span class="group-badge-pill">${children.length} items</span>
            </div>
            <div class="quick-note-right">
              <div class="quick-note-actions-always">
                <button type="button" class="btn-icon-subtle add-child-btn" data-action="add-child-note" data-group-id="${item.id}" title="Add item to this folder">
                  <i data-lucide="plus"></i>
                </button>
                <button type="button" class="btn-icon-subtle edit-btn" data-action="edit-note" data-id="${item.id}" title="Edit folder name">
                  <i data-lucide="edit-2"></i>
                </button>
                <button type="button" class="btn-icon-subtle delete-btn" data-action="delete-note" data-id="${item.id}" title="Delete folder">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      } else {
        const displayPrice = convertCurrency(item.price || 0, item.currency || 'IDR', state.currency);
        const formattedPrice = formatCurrencyValue(displayPrice, state.currency);
        const isEditing = state.editingNoteId === item.id;
        
        return `
          <div class="quick-note-row ${item.checked ? 'checked' : ''} ${isEditing ? 'editing-row' : ''}" data-id="${item.id}">
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
                <button type="button" class="btn-icon-subtle delete-btn" data-action="delete-note" data-id="${item.id}" title="Delete item">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }
  
  container.innerHTML = html;
  if (window.lucide) lucide.createIcons();
};

const renderNotesView = () => {
  const subTabBtns = document.querySelectorAll('#notes-sub-tabs .sub-tab-btn');
  const viewSubView = document.getElementById('notes-subview-view');
  const manageSubView = document.getElementById('notes-subview-manage');
  
  const currentSubTab = state.notesSubTab || 'view';
  
  subTabBtns.forEach(btn => {
    const subtab = btn.getAttribute('data-subtab');
    if (subtab === currentSubTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (currentSubTab === 'view') {
    if (viewSubView) viewSubView.classList.remove('hidden');
    if (manageSubView) manageSubView.classList.add('hidden');
    renderQuickNotesList();
  } else {
    if (viewSubView) viewSubView.classList.add('hidden');
    if (manageSubView) manageSubView.classList.remove('hidden');
    renderQuickNotesManageList();
  }
  
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
    imageUrl: '',
    imageData: null,
    link: '',
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
  
  if (window.lucide) {
    lucide.createIcons();
  }
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

  // Notes Sub Tabs Handler (Wishlist View vs Manage / Add)
  const notesSubTabs = document.getElementById('notes-sub-tabs');
  if (notesSubTabs) {
    notesSubTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.sub-tab-btn');
      if (!btn) return;
      const subtab = btn.getAttribute('data-subtab');
      if (subtab && subtab !== state.notesSubTab) {
        state.notesSubTab = subtab;
        savePreferences();
        renderNotesView();
      }
    });
  }

  // Toggle Add Form Button (Opens Centered Modal)
  const toggleAddFormBtn = document.getElementById('toggle-add-form-btn');
  if (toggleAddFormBtn) {
    toggleAddFormBtn.addEventListener('click', () => {
      openQuickNoteModal(null, state.activeFolderId);
    });
  }

  // Create New Group Button & Modal Handler
  const createGroupBtn = document.getElementById('create-group-btn');
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', () => {
      openGroupModal();
    });
  }

  const groupForm = document.getElementById('group-form');
  if (groupForm) {
    groupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('group-name-input');
      const groupName = input?.value.trim();
      if (!groupName) return;
      
      const newGroup = {
        id: generateId(),
        title: groupName,
        isGroup: true,
        expanded: true
      };
      state.notesItems.unshift(newGroup);
      saveNotes();
      closeGroupModal();
      showToast(`Group '${groupName}' created`);
      renderNotesView();
    });
  }

  document.querySelectorAll('.group-modal-close').forEach(btn => {
    btn.addEventListener('click', closeGroupModal);
  });

  document.querySelectorAll('.quick-note-modal-close').forEach(btn => {
    btn.addEventListener('click', closeQuickNoteModal);
  });

  // Universal Click Outside Modal to Close Handler
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        if (overlay.id === 'quick-note-modal') {
          state.editingNoteId = null;
        }
      }
    });
  });

  // Quick Note Form Submit Handler Inside Centered Modal
  const quickNoteForm = document.getElementById('quick-note-form');
  if (quickNoteForm) {
    quickNoteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('quick-note-title-input');
      const priceInput = document.getElementById('quick-note-price-input');
      const groupSelect = document.getElementById('quick-note-group-select');
      const checkedInput = document.getElementById('quick-note-checked-input');
      const title = titleInput?.value.trim();
      const price = parseFloat(priceInput?.value) || 0;
      const parentId = groupSelect?.value || null;
      const checked = !!checkedInput?.checked;
      
      if (!title) return;
      
      if (state.editingNoteId) {
        const item = state.notesItems.find(n => n.id === state.editingNoteId);
        if (item) {
          item.title = title;
          if (!item.isGroup) {
            item.price = price;
            item.parentId = parentId;
            item.checked = checked;
          }
        }
        showToast('Item updated');
      } else {
        const newNote = {
          id: generateId(),
          title: title,
          price: price,
          currency: state.currency,
          checked: checked,
          parentId: parentId
        };
        state.notesItems.unshift(newNote);
        showToast('Added to Wishlist');
      }
      
      saveNotes();
      closeQuickNoteModal();
      renderNotesView();
    });
  }

  // Quick Note Convert Button Inside Modal Handler
  const quickNoteConvertBtn = document.getElementById('quick-note-convert-btn');
  if (quickNoteConvertBtn) {
    quickNoteConvertBtn.addEventListener('click', () => {
      if (state.editingNoteId) {
        convertNoteToCatalog(state.editingNoteId);
        closeQuickNoteModal();
        renderNotesView();
      }
    });
  }

  // Quick Notes List Delegation (Wishlist View Tab)
  const quickNotesList = document.getElementById('quick-notes-list');
  if (quickNotesList) {
    quickNotesList.addEventListener('click', (e) => {
      const openFolderBtn = e.target.closest('[data-action="open-folder"]');
      if (openFolderBtn) {
        const id = openFolderBtn.getAttribute('data-id');
        state.activeFolderId = id;
        renderNotesView();
        return;
      }

      const exitFolderBtn = e.target.closest('[data-action="exit-folder"]');
      if (exitFolderBtn) {
        state.activeFolderId = null;
        renderNotesView();
        return;
      }
    });
  }

  // Quick Notes Manage List Delegation (Manage Tab - Edit, Delete, Folder Nav)
  const quickNotesManageList = document.getElementById('quick-notes-manage-list');
  if (quickNotesManageList) {
    quickNotesManageList.addEventListener('click', (e) => {
      // Open Folder
      const openFolderBtn = e.target.closest('[data-action="open-folder"]');
      if (openFolderBtn && !e.target.closest('.btn-icon-subtle')) {
        const id = openFolderBtn.getAttribute('data-id');
        state.activeFolderId = id;
        renderNotesView();
        return;
      }

      // Exit Folder
      const exitFolderBtn = e.target.closest('[data-action="exit-folder"]');
      if (exitFolderBtn) {
        state.activeFolderId = null;
        renderNotesView();
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

      // Add Child Note directly into Group / Folder
      const addChildBtn = e.target.closest('[data-action="add-child-note"]');
      if (addChildBtn) {
        const groupId = addChildBtn.getAttribute('data-group-id');
        openQuickNoteModal(null, groupId);
        renderNotesView();
        return;
      }

      // Ungroup Note
      const ungroupBtn = e.target.closest('[data-action="ungroup-note"]');
      if (ungroupBtn) {
        const id = ungroupBtn.getAttribute('data-id');
        const item = state.notesItems.find(n => n.id === id);
        if (item) {
          item.parentId = null;
          saveNotes();
          showToast('Removed from folder');
          renderNotesView();
        }
        return;
      }

      // Edit Note or Group
      const editBtn = e.target.closest('[data-action="edit-note"]');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        const item = state.notesItems.find(n => n.id === id);
        if (item) {
          openQuickNoteModal(id);
          renderNotesView();
        }
        return;
      }

      // Delete Note or Group
      const deleteBtn = e.target.closest('[data-action="delete-note"]');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        const item = state.notesItems.find(n => n.id === id);
        if (item) {
          if (state.editingNoteId === id) state.editingNoteId = null;
          if (item.isGroup) {
            showConfirmDialog({
              title: 'Delete Group',
              message: `Are you sure you want to delete group '${item.title}' and all its items?`,
              confirmText: 'Delete Group',
              onConfirm: () => {
                state.notesItems = state.notesItems.filter(n => n.id !== id && n.parentId !== id);
                saveNotes();
                showToast('Group deleted');
                renderNotesView();
              }
            });
          } else {
            state.notesItems = state.notesItems.filter(n => n.id !== id);
            saveNotes();
            showToast('Item deleted');
            renderNotesView();
          }
        }
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
};

const renderSelectedTags = () => {
  const container = document.getElementById('selected-tags');
  if (!container) return;
  container.innerHTML = currentTags.map(t => 
    `<span class="tag-pill">${t} <button type="button" class="tag-remove" style="background:none;border:none;cursor:pointer;margin-left:4px;display:inline-flex;align-items:center;color:inherit;padding:0;"><i data-lucide="x" style="width:12px;height:12px;"></i></button></span>`
  ).join('');
  if (window.lucide) lucide.createIcons();
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
  modal.classList.remove('hidden');
};

const closeModal = () => {
  const modal = document.getElementById('item-modal');
  if (modal) modal.classList.add('hidden');
  state.editingId = null;
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

const init = () => {
  state.items = loadItems();
  loadNotes();
  loadPreferences();
  
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
  updateSortUI();
  updateCurrencyUI();
  render();
  fetchLiveExchangeRate();
};

document.addEventListener('DOMContentLoaded', init);
