/**
 * WISHLIST — Aspirations & Notes Engine
 * Clean, Robust, Modular Architecture (Pristine CSS Aligned)
 */

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
const AUTH_TOKEN_KEY = 'wishlist_auth_token';
const AUTH_USER_KEY = 'wishlist_auth_user';

const state = {
  items: [],
  currentUser: null, // { id, name, email, username }
  viewMode: 'view',  // 'view' | 'edit'
  isSelectMode: false,
  selectedIds: new Set(),
  collapsedGroups: new Set(),
  sortBy: 'priority', // 'priority' | 'price' | 'title' | 'date'
  currency: 'IDR',
  exchangeRate: 16000,
  activeModalItemId: null,
  activePreviewItemId: null
};

const CATEGORY_PRESETS = [
  'Workspace & Setup',
  'Audio & Sound',
  'Electronics & Gadgets',
  'Outfit & Fashion',
  'Gaming & Gear',
  'Photography',
  'Books & Learning',
  'Home & Living',
  'Fitness & Health'
];

// ==========================================
// 2. HELPER UTILITIES
// ==========================================
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
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
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
  let totalEst = 0;
  let checkedEst = 0;

  items.forEach(item => {
    const price = Number(item.price) || 0;
    totalEst += price;
    if (item.checked) {
      checkedEst += price;
    }
  });

  const remainingEst = Math.max(0, totalEst - checkedEst);
  const percentage = totalEst > 0 ? Math.round((checkedEst / totalEst) * 100) : 0;

  const totalEl = document.getElementById('notes-total-value');
  const checkedEl = document.getElementById('notes-checked-value');
  const remainEl = document.getElementById('notes-remaining-value');
  const fillEl = document.getElementById('notes-progress-fill');
  const textEl = document.getElementById('notes-progress-text');
  const countEl = document.getElementById('dropdown-notes-count');

  if (totalEl) totalEl.textContent = formatPrice(totalEst, state.currency);
  if (checkedEl) checkedEl.textContent = formatPrice(checkedEst, state.currency);
  if (remainEl) remainEl.textContent = formatPrice(remainingEst, state.currency);
  if (fillEl) fillEl.style.width = `${percentage}%`;
  if (textEl) textEl.textContent = `${percentage}%`;
  if (countEl) countEl.textContent = items.length;
};

const sortItems = (items) => {
  const list = [...items];
  list.sort((a, b) => {
    if (state.sortBy === 'priority') {
      const pA = Number(a.priority) || 2;
      const pB = Number(b.priority) || 2;
      if (pA !== pB) return pA - pB;
      return (Number(b.price) || 0) - (Number(a.price) || 0);
    }
    if (state.sortBy === 'price') {
      return (Number(b.price) || 0) - (Number(a.price) || 0);
    }
    if (state.sortBy === 'title') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (state.sortBy === 'date') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
    return 0;
  });
  return list;
};

const renderGroupedItemRow = (item) => {
  const isChecked = !!item.checked;
  const isSelected = state.selectedIds.has(item.id);
  const isEditMode = state.viewMode === 'edit';

  return `
    <div class="reader-row reader-grouped-row ${isChecked ? 'checked' : ''} ${isSelected ? 'is-selected' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="reader-row-left" data-action="preview" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">
        ${state.isSelectMode ? `
          <input type="checkbox" class="quick-note-select-checkbox" data-action="toggle-select" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        ` : `
          <span class="reader-grouped-bullet">•</span>
        `}

        <span class="reader-grouped-title">${escapeHtml(item.title || 'Untitled')}</span>
      </div>

      <div class="quick-note-right">
        <span class="reader-grouped-price" data-action="preview" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">${formatPrice(item.price, item.currency || state.currency)}</span>
        ${isEditMode ? `
          <div class="quick-note-actions">
            <button type="button" class="btn-icon-subtle" data-action="edit" data-id="${escapeHtml(item.id)}" title="Edit Item">
              <i data-lucide="edit-2"></i>
            </button>
            <button type="button" class="btn-icon-subtle delete-btn" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete Item">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
};

const renderStandaloneItemRow = (item) => {
  const isChecked = !!item.checked;
  const isSelected = state.selectedIds.has(item.id);
  const isEditMode = state.viewMode === 'edit';

  return `
    <div class="quick-note-row reader-standalone-row ${isChecked ? 'checked' : ''} ${isSelected ? 'is-selected' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="reader-row-left" data-action="preview" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">
        ${state.isSelectMode ? `
          <input type="checkbox" class="quick-note-select-checkbox" data-action="toggle-select" data-id="${escapeHtml(item.id)}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
        ` : `
          <span class="reader-grouped-bullet">•</span>
        `}

        <span class="quick-note-title">${escapeHtml(item.title || 'Untitled')}</span>
      </div>

      <div class="quick-note-right">
        <span class="quick-note-price" data-action="preview" data-id="${escapeHtml(item.id)}" style="cursor: pointer;">${formatPrice(item.price, item.currency || state.currency)}</span>
        ${isEditMode ? `
          <div class="quick-note-actions">
            <button type="button" class="btn-icon-subtle" data-action="edit" data-id="${escapeHtml(item.id)}" title="Edit Item">
              <i data-lucide="edit-2"></i>
            </button>
            <button type="button" class="btn-icon-subtle delete-btn" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete Item">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        ` : ''}
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
          <i data-lucide="sparkles"></i>
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
    const checkedCount = groupItems.filter(i => i.checked).length;
    const isEditMode = state.viewMode === 'edit';

    html += `
      <div class="reader-group-block ${isCollapsed ? 'collapsed' : ''}" data-group="${escapeHtml(groupName)}">
        <div class="reader-group-header" data-action="toggle-group" data-group="${escapeHtml(groupName)}">
          <div class="group-header-left">
            <i data-lucide="chevron-down" class="group-chevron-icon"></i>
            <i data-lucide="folder" class="group-folder-icon"></i>
            <span class="group-header-title">${escapeHtml(groupName)}</span>
            <span class="group-badge-pill">${checkedCount}/${groupItems.length}</span>
          </div>
          <div class="group-header-right">
            <span class="group-header-total">${formatPrice(totalGroupPrice, state.currency)}</span>
            ${isEditMode ? `
              <div class="group-header-actions">
                <button type="button" class="group-action-btn" data-action="rename-group" data-group="${escapeHtml(groupName)}" title="Rename Group" onclick="event.stopPropagation()">
                  <i data-lucide="edit-3"></i>
                </button>
              </div>
            ` : ''}
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
  const groupBtn = document.getElementById('notes-group-selected-btn');
  const ungroupBtn = document.getElementById('notes-ungroup-selected-btn');
  const deleteBtn = document.getElementById('notes-delete-selected-btn');

  if (!selectionBar) return;

  if (state.isSelectMode) {
    selectionBar.classList.remove('hidden');
    const count = state.selectedIds.size;
    if (selectedCountEl) selectedCountEl.textContent = `${count} selected`;
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

const render = () => {
  renderSummaryBar();
  renderItemsList();
  updateSelectionBar();
  updateAuthUI();
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
      imageData: formData.imageData !== undefined ? formData.imageData : item.imageData,
      updatedAt: now
    });
    render();
    closeQuickNoteModal();

    try {
      await api.updateItem(item.id, formData);
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
      checked: false,
      link: formData.link,
      imageData: formData.imageData || null,
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

  // Populate Category Preset Datalist
  const datalist = document.getElementById('group-options-list');
  if (datalist) {
    const existingGroups = Array.from(new Set(state.items.map(i => i.group).filter(Boolean)));
    const allGroups = Array.from(new Set([...CATEGORY_PRESETS, ...existingGroups]));
    datalist.innerHTML = allGroups.map(g => `<option value="${escapeHtml(g)}">`).join('');
  }

  if (itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    if (titleEl) titleEl.textContent = 'Edit Item';
    if (titleInput) titleInput.value = item.title || '';
    if (priceInput) priceInput.value = item.price || '';
    if (groupInput) groupInput.value = item.group || '';
    if (linkInput) linkInput.value = item.link || '';
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    if (ungroupBtn) {
      if (item.group) ungroupBtn.classList.remove('hidden');
      else ungroupBtn.classList.add('hidden');
    }

    setModalPriority(item.priority || 2);

    if (item.imageData || item.imageUrl) {
      currentUploadedImage = item.imageData || item.imageUrl;
      if (previewImg) previewImg.src = currentUploadedImage;
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
    if (linkInput) linkInput.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (ungroupBtn) ungroupBtn.classList.add('hidden');
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

const setModalPriority = (priority) => {
  const btns = document.querySelectorAll('#quick-note-priority-options .priority-btn');
  btns.forEach(btn => {
    const p = Number(btn.getAttribute('data-priority'));
    if (p === priority) btn.classList.add('active');
    else btn.classList.remove('active');
  });
};

const openPreviewModal = (itemId) => {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  state.activePreviewItemId = itemId;
  const modal = document.getElementById('quick-note-preview-modal');
  const nameEl = document.getElementById('quick-note-preview-name');
  const priceEl = document.getElementById('quick-note-preview-price');
  const groupEl = document.getElementById('quick-note-preview-group');
  const priorityEl = document.getElementById('quick-note-preview-priority');
  const linkRow = document.getElementById('quick-note-preview-link-row');
  const linkVal = document.getElementById('quick-note-preview-link-val');
  const imgBox = document.getElementById('quick-note-preview-image-container');
  const modalImg = document.getElementById('quick-note-preview-modal-img');

  if (!modal) return;

  if (nameEl) nameEl.textContent = item.title || 'Untitled';
  if (priceEl) priceEl.textContent = formatPrice(item.price, item.currency || state.currency);
  if (groupEl) groupEl.textContent = item.group || 'General (None)';
  if (priorityEl) {
    const p = Number(item.priority) || 2;
    priorityEl.textContent = p === 1 ? 'P1 — High Priority' : (p === 3 ? 'P3 — Low Priority' : 'P2 — Medium Priority');
  }

  if (item.link) {
    if (linkRow) linkRow.classList.remove('hidden');
    if (linkVal) linkVal.innerHTML = `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.link)}</a>`;
  } else {
    if (linkRow) linkRow.classList.add('hidden');
  }

  if (item.imageData || item.imageUrl) {
    if (modalImg) modalImg.src = item.imageData || item.imageUrl;
    if (imgBox) imgBox.classList.remove('hidden');
  } else {
    if (imgBox) imgBox.classList.add('hidden');
  }

  // Update Status Toggle Button
  const toggleBtn = document.getElementById('quick-note-preview-toggle-check-btn');
  const toggleText = document.getElementById('preview-toggle-check-text');
  if (toggleBtn && toggleText) {
    if (item.checked) {
      toggleText.textContent = 'Mark as Wishlist';
      toggleBtn.className = 'btn-preview-secondary';
      toggleBtn.innerHTML = '<i data-lucide="rotate-ccw"></i> <span id="preview-toggle-check-text">Mark as Wishlist</span>';
    } else {
      toggleText.textContent = 'Mark as Acquired';
      toggleBtn.className = 'btn-preview-primary';
      toggleBtn.innerHTML = '<i data-lucide="check-circle"></i> <span id="preview-toggle-check-text">Mark as Acquired</span>';
    }
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
  const presetContainer = document.getElementById('group-modal-presets');

  if (!modal) return;
  if (groupInput) groupInput.value = presetGroup;

  if (presetContainer) {
    presetContainer.innerHTML = CATEGORY_PRESETS.map(cat => `
      <button type="button" class="category-chip" data-preset="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
    `).join('');
  }

  modal.classList.remove('hidden');
  safeCreateLucideIcons();
  if (groupInput) groupInput.focus();
};

const closeGroupModal = () => {
  const modal = document.getElementById('group-modal');
  if (modal) modal.classList.add('hidden');
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
        state.sortBy = sort;
        document.querySelectorAll('#notes-sort-menu .sort-menu-item').forEach(el => {
          if (el.getAttribute('data-sort') === sort) el.classList.add('active');
          else el.classList.remove('active');
        });
        document.getElementById('notes-sort-label').textContent = item.querySelector('span').textContent;
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
    document.getElementById('notes-view-actions')?.classList.add('hidden');
    document.getElementById('notes-edit-actions')?.classList.remove('hidden');
    document.getElementById('notes-back-to-view-btn')?.classList.remove('hidden');
  });

  document.getElementById('notes-back-to-view-btn')?.addEventListener('click', () => {
    state.viewMode = 'view';
    state.isSelectMode = false;
    document.getElementById('notes-view-actions')?.classList.remove('hidden');
    document.getElementById('notes-edit-actions')?.classList.add('hidden');
    document.getElementById('notes-back-to-view-btn')?.classList.add('hidden');
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
    const title = document.getElementById('quick-note-title-input')?.value.trim();
    const price = parseFloat(document.getElementById('quick-note-price-input')?.value) || 0;
    const group = document.getElementById('quick-note-group-input')?.value.trim() || null;
    const link = document.getElementById('quick-note-link-input')?.value.trim() || null;
    const activePriorityBtn = document.querySelector('#quick-note-priority-options .priority-btn.active');
    const priority = activePriorityBtn ? Number(activePriorityBtn.getAttribute('data-priority')) : 2;

    if (!title) return;

    saveItemFromModal({
      title,
      price,
      group,
      link,
      priority,
      imageData: currentUploadedImage
    });
  });

  // Priority Options in Modal
  document.querySelectorAll('#quick-note-priority-options .priority-btn')?.forEach(btn => {
    btn.addEventListener('click', () => {
      setModalPriority(Number(btn.getAttribute('data-priority')));
    });
  });

  // Ungroup button in Quick Note Modal
  document.getElementById('quick-note-ungroup-btn')?.addEventListener('click', () => {
    const groupInput = document.getElementById('quick-note-group-input');
    if (groupInput) groupInput.value = '';
    document.getElementById('quick-note-ungroup-btn')?.classList.add('hidden');
  });

  // Delete button in Quick Note Modal
  document.getElementById('quick-note-delete-btn')?.addEventListener('click', () => {
    if (state.activeModalItemId) {
      const id = state.activeModalItemId;
      closeQuickNoteModal();
      openConfirmModal('Are you sure you want to delete this item?', () => deleteSingleItem(id));
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
    document.getElementById('quick-note-image-preview')?.classList.add('hidden');
    document.getElementById('quick-note-upload-area')?.classList.remove('hidden');
    if (imageUploadInput) imageUploadInput.value = '';
  });

  // URL Auto-Scraping on Link Blur
  document.getElementById('quick-note-link-input')?.addEventListener('blur', async (e) => {
    const url = e.target.value.trim();
    if (url && (url.includes('shopee.') || url.includes('tokopedia.'))) {
      const titleInput = document.getElementById('quick-note-title-input');
      const priceInput = document.getElementById('quick-note-price-input');
      const groupInput = document.getElementById('quick-note-group-input');

      if (titleInput && !titleInput.value) {
        showToast('Fetching product details...');
        try {
          const data = await api.scrapeProduct(url);
          if (data && data.success) {
            if (data.title && !titleInput.value) titleInput.value = data.title;
            if (data.price && (!priceInput.value || priceInput.value === '0')) priceInput.value = data.price;
            if (data.suggestedGroup && (!groupInput.value)) groupInput.value = data.suggestedGroup;
            if (data.imageUrl && !currentUploadedImage) {
              currentUploadedImage = data.imageUrl;
              const previewImg = document.getElementById('quick-note-preview-img');
              const previewBox = document.getElementById('quick-note-image-preview');
              const uploadArea = document.getElementById('quick-note-upload-area');
              if (previewImg) previewImg.src = currentUploadedImage;
              if (previewBox) previewBox.classList.remove('hidden');
              if (uploadArea) uploadArea.classList.add('hidden');
            }
            showToast('Product details loaded!');
          }
        } catch (err) {}
      }
    }
  });

  // Group Form Submit
  document.getElementById('group-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const groupName = document.getElementById('group-name-input')?.value.trim();
    if (!groupName) return;

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

  // Group Preset Chips in Group Modal
  document.getElementById('group-modal-presets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-preset]');
    if (chip) {
      const preset = chip.getAttribute('data-preset');
      const input = document.getElementById('group-name-input');
      if (input) input.value = preset;
    }
  });

  // Preview Toggle Acquired Button
  document.getElementById('quick-note-preview-toggle-check-btn')?.addEventListener('click', async () => {
    const id = state.activePreviewItemId;
    if (id) {
      await toggleItemCheck(id);
      openPreviewModal(id); // Refresh preview modal state
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
