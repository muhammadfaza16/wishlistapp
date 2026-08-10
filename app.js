// app.js — WISHLIST Application Engine

const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

const EXCHANGE_RATE = 16000;

const toDisplayAmount = (amountIdr) => {
  const num = Number(amountIdr) || 0;
  if (state.currency === 'USD') {
    return Math.round(num / EXCHANGE_RATE);
  }
  return Math.round(num);
};

const toBaseIdr = (amountInput) => {
  const num = Number(amountInput) || 0;
  if (state.currency === 'USD') {
    return Math.round(num * EXCHANGE_RATE);
  }
  return Math.round(num);
};

const formatCurrency = (amountIdr) => {
  const numIdr = Number(amountIdr) || 0;
  if (state.currency === 'USD') {
    const amountUsd = numIdr / EXCHANGE_RATE;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountUsd);
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(numIdr);
};

const getProgress = (item) => {
  if (!item || !item.price || item.price <= 0) return 0;
  const p = (item.saved / item.price) * 100;
  return p > 100 ? 100 : p;
};

let state = {
  items: [],
  view: 'grid',
  sort: 'priority',
  currency: 'IDR',
  filters: [],
  search: '',
  editingId: null,
  deleteId: null,
  progressId: null,
  achievedOpen: false,
};

const defaultItems = [
  {
    id: 'sample-3',
    brand: 'Daisy',
    name: 'Daisy One Headphones',
    price: 6400000,
    saved: 4200000,
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
    price: 32500000,
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
    }
  } catch (e) {
    // Ignore
  }
};

const savePreferences = () => {
  localStorage.setItem('wishlist_state', JSON.stringify({
    view: state.view,
    sort: state.sort,
    currency: state.currency
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
    tValue += Number(item.price) || 0;
    tSaved += Number(item.saved) || 0;
  });
  
  const tRemaining = Math.max(0, tValue - tSaved);
  const p = tValue > 0 ? (tSaved / tValue) * 100 : 0;
  const clampedP = Math.min(100, p);
  
  if (itemCount) {
    itemCount.innerHTML = `<i data-lucide="layers"></i><span>${activeItems.length} ${activeItems.length === 1 ? 'Item' : 'Items'}</span>`;
    if (window.lucide) lucide.createIcons();
  }
  if (totalValue) totalValue.textContent = formatCurrency(tValue);
  if (totalSaved) totalSaved.textContent = formatCurrency(tSaved);
  if (totalRemaining) totalRemaining.textContent = formatCurrency(tRemaining);
  
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
      <div class="card-price mono-text">${formatCurrency(item.price)}</div>
    </div>

    <!-- Ultra-Subtle Minimalist Progress Bar -->
    ${!item.achieved ? `
    <div class="card-progress">
      <div class="progress-bar"><div class="progress-fill" style="width:${getProgress(item)}%"></div></div>
      <div class="progress-info">
        <div class="progress-saved-group">
          <span class="progress-saved">${formatCurrency(item.saved)} saved</span>
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

const render = () => {
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
      
      const brand = document.getElementById('item-brand')?.value.trim() || '';
      const name = document.getElementById('item-name').value.trim();
      const inputPrice = parseFloat(document.getElementById('item-price').value) || 0;
      const inputSaved = parseFloat(document.getElementById('item-saved').value) || 0;
      const price = toBaseIdr(inputPrice);
      const saved = toBaseIdr(inputSaved);
      const imageUrl = document.getElementById('item-image').value.trim();
      const link = document.getElementById('item-link').value.trim();
      
      if (!name || price <= 0) {
        showToast('Valid name and target price required');
        return;
      }
      
      const isAchieved = saved >= price;
      let triggeredAchieved = false;
      
      if (state.editingId) {
        const item = state.items.find(i => i.id === state.editingId);
        if (item) {
          const wasAchieved = item.saved >= item.price;
          item.brand = brand;
          item.name = name;
          item.price = price;
          item.saved = saved;
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
          brand,
          name,
          price,
          saved,
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
  
  if (id) {
    title.textContent = 'Edit Item';
    const item = state.items.find(i => i.id === id);
    if (item) {
      const brandInput = document.getElementById('item-brand');
      if (brandInput) brandInput.value = item.brand || '';
      document.getElementById('item-name').value = item.name;
      document.getElementById('item-price').value = toDisplayAmount(item.price);
      document.getElementById('item-saved').value = toDisplayAmount(item.saved);
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
};

document.addEventListener('DOMContentLoaded', init);
