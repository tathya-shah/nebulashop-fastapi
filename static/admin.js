// Admin Panel Logic

function $(id) {
  return document.getElementById(id);
}

// --- Spec Builder UI Helpers ---
function addSpecRow(containerId, label = '', values = []) {
    const container = $(containerId);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'spec-row';
    const valuesStr = Array.isArray(values) ? values.join(', ') : values;

    row.innerHTML = `
        <input type="text" class="spec-label-input" placeholder="e.g. Size" value="${label.replace(/"/g, '&quot;')}" />
        <input type="text" class="spec-values-input" placeholder="e.g. Small, Medium, Large" value="${valuesStr.replace(/"/g, '&quot;')}" />
        <button type="button" class="btn-remove-spec" onclick="this.parentElement.remove()" title="Remove Specification">×</button>
    `;
    container.appendChild(row);
}

function initSpecBuilder(containerId, data = {}) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = ''; 
    const keys = Object.keys(data);
    if (keys.length > 0) {
        keys.forEach(key => addSpecRow(containerId, key, data[key]));
    } else {
        addSpecRow(containerId);
    }
}

function getSpecsFromBuilder(containerId) {
    const container = $(containerId);
    if (!container) return {};
    const specs = {};
    const rows = container.querySelectorAll('.spec-row');
    rows.forEach(row => {
        const label = row.querySelector('.spec-label-input').value.trim();
        const valuesRaw = row.querySelector('.spec-values-input').value.trim();
        if (label && valuesRaw) {
            const values = valuesRaw.split(',').map(v => v.trim()).filter(v => v !== '');
            if (values.length > 0) specs[label] = values;
        }
    });
    return specs;
}

// --- State ---
let currentEditorVariants = [];
let revenueChartInstance = null;
let categoryChartInstance = null;

// --- Utilities ---
function formatValue(val) {
    if (val === null || val === undefined) return '0';
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return Number(val).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
}

function cartesianProduct(arr) {
  return arr.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())), [[]]);
}

function adminToast(message, type = 'info') {
  if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    console[type === 'error' ? 'error' : 'log'](message);
  }
}

// --- Product Management ---
async function loadAdminProducts() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    const products = await response.json();
    displayAdminProducts(products);
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

function displayAdminProducts(products) {
  const container = $('admin-products');
  if (!container) return;
  if (!products.length) {
    container.innerHTML = '<p class="empty-state">No products found.</p>';
    return;
  }
  container.innerHTML = products.map((product, idx) => `
    <div class="admin-product-row stagger-${Math.min(idx + 1, 6)}">
      <div class="admin-product-name"><label>Name</label><div>${product.name}</div></div>
      <div class="admin-product-meta"><label>Category</label><div>${product.category}</div></div>
      <div class="admin-product-meta"><label>Base Price</label><div style="color:var(--accent); font-weight:700;">$${product.price.toFixed(2)}</div></div>
      <div class="admin-product-meta"><label>Inventory</label><div>${(product.variants && product.variants.length) || product.stock} units</div></div>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button class="btn btn-secondary btn-small" onclick="openProductModal(${product.id})">⚙️ Edit</button>
        <button class="btn btn-danger btn-small" onclick="handleDeleteProduct(${product.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

async function handleDeleteProduct(productId) {
  if (!confirm('Delete this product?')) return;
  try {
    const response = await fetch(`${API_BASE}/products/${productId}`, { method: 'DELETE' });
    if (response.ok) {
      adminToast('Deleted.', 'success');
      loadAdminProducts();
    }
  } catch (error) { adminToast('Delete failed.', 'error'); }
}

// --- Product Editor Modal ---
async function openProductModal(productId = null) {
  const modal = $('product-editor-modal');
  const form = $('product-editor-form');
  form.reset();
  $('editor-product-id').value = productId || '';
  currentEditorVariants = [];
  $('editor-variant-container').style.display = 'none';
  
  if (productId) {
    $('modal-title').innerText = '📦 Edit Product';
    const response = await fetch(`${API_BASE}/products/${productId}`);
    const product = await response.json();
    $('editor-name').value = product.name;
    $('editor-price').value = product.price;
    $('editor-stock').value = product.stock;
    $('editor-category').value = product.category;
    $('editor-description').value = product.description || '';
    initSpecBuilder('editor-spec-builder', product.specs_config || {});
    if (product.variants && product.variants.length > 0) {
      currentEditorVariants = product.variants;
      renderEditorVariantList();
      $('editor-variant-container').style.display = 'block';
    }
  } else {
    $('modal-title').innerText = '➕ Add New Product';
    initSpecBuilder('editor-spec-builder');
  }
  modal.style.display = 'flex';
}

function closeProductModal() { $('product-editor-modal').style.display = 'none'; }

function generateEditorVariants() {
  const specsConfig = getSpecsFromBuilder('editor-spec-builder');
  const keys = Object.keys(specsConfig);
  if (!keys.length) { adminToast('Add specs first.', 'warning'); return; }
  const basePrice = parseFloat($('editor-price').value) || 0;
  const combinations = cartesianProduct(Object.values(specsConfig));
  currentEditorVariants = combinations.map(combo => {
    const specs = {};
    keys.forEach((k, i) => specs[k] = combo[i]);
    return { specs, price: basePrice, stock: 0 };
  });
  renderEditorVariantList();
  $('editor-variant-container').style.display = 'block';
}

function renderEditorVariantList() {
  $('editor-variant-list').innerHTML = currentEditorVariants.map((v, idx) => {
    const specs = typeof v.specs === 'string' ? JSON.parse(v.specs) : v.specs;
    const specStr = Object.entries(specs).map(([k, val]) => `<b>${k}:</b> ${val}`).join(' | ');
    return `
      <div class="variant-card">
        <div class="variant-card-header">${specStr}</div>
        <div class="variant-card-inputs">
          <div class="form-group"><label>Price ($)</label><input type="number" step="0.01" class="stock-input" value="${v.price}" oninput="currentEditorVariants[${idx}].price=parseFloat(this.value)||0"/></div>
          <div class="form-group"><label>Stock</label><input type="number" class="stock-input" value="${v.stock}" oninput="currentEditorVariants[${idx}].stock=parseInt(this.value,10)||0"/></div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveProduct() {
  const id = $('editor-product-id').value;
  const payload = {
    name: $('editor-name').value.trim(),
    price: parseFloat($('editor-price').value) || 0,
    stock: parseInt($('editor-stock').value, 10) || 0,
    category: $('editor-category').value.trim(),
    description: $('editor-description').value.trim(),
    specs_config: getSpecsFromBuilder('editor-spec-builder'),
    variants: currentEditorVariants
  };
  const url = id ? `${API_BASE}/products/${id}` : `${API_BASE}/products`;
  const response = await fetch(url, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (response.ok) {
    adminToast('Saved.', 'success');
    closeProductModal();
    loadAdminProducts();
  }
}

// --- Analytics ---
async function loadAnalytics() {
  try {
    const response = await fetch(`${API_BASE}/analytics/summary`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed');
    displayAnalytics(data);
  } catch (e) { adminToast(`Error: ${e.message}`, 'error'); }
}

function displayAnalytics(data) {
  // KPIs
  const kpiGrid = $('analytics-kpis');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(99,102,241,0.1);color:#6366f1;">💰</div>
        <div class="kpi-info"><label>Revenue</label><div class="kpi-value">$${formatValue(data.total_revenue)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(16,185,129,0.1);color:#10b981;">🛒</div>
        <div class="kpi-info"><label>Orders</label><div class="kpi-value">${formatValue(data.total_orders)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b;">👥</div>
        <div class="kpi-info"><label>Customers</label><div class="kpi-value">${formatValue(data.total_customers)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(139,92,246,0.1);color:#8b5cf6;">🧩</div>
        <div class="kpi-info"><label>Variants</label><div class="kpi-value">${formatValue(data.total_variants)}</div></div>
      </div>
    `;
  }

  // Out of Stock
  const oosList = $('out-of-stock-list');
  if (oosList) {
    oosList.innerHTML = (data.out_of_stock_products && data.out_of_stock_products.length) ?
      data.out_of_stock_products.map(p => `
        <div class="recent-order-item" style="grid-template-columns: 1.5fr 1fr 0.5fr;">
          <div class="order-id">${p.name}</div>
          <div class="order-date">${p.category}</div>
          <div class="order-status-pill cancelled">OUT</div>
        </div>
      `).join('') : '<p class="muted">All in stock! 🎉</p>';
  }

  // Low Stock
  const lowStockList = $('low-stock-list');
  if (lowStockList) {
    lowStockList.innerHTML = (data.low_stock_products && data.low_stock_products.length) ?
      data.low_stock_products.map(p => `
        <div class="recent-order-item" style="grid-template-columns: 1.5fr 1fr 0.5fr;">
          <div class="order-id">${p.name}</div>
          <div class="order-date">${p.category}</div>
          <div class="order-status-pill pending">${p.stock} LEFT</div>
        </div>
      `).join('') : '<p class="muted">No low stock items. 👍</p>';
  }

  // Recent Activity
  const activityList = $('recent-orders-list');
  if (activityList) {
    activityList.innerHTML = data.recent_orders.map(o => `
      <div class="recent-order-item">
        <div class="order-id">#${o.id}</div>
        <div class="order-date">${o.created_at}</div>
        <div class="order-total">$${o.total.toFixed(2)}</div>
        <div class="order-status-pill ${(o.status||'Completed').toLowerCase()}">${o.status||'Completed'}</div>
      </div>
    `).join('');
  }

  // Charts
  setTimeout(() => {
    initCharts(data);
  }, 200);
}

function initCharts(data) {
  if (typeof Chart === 'undefined') return;
  
  // Revenue Chart
  const revCtx = $('revenue-chart');
  if (revCtx) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    const dates = Object.keys(data.daily_revenue || {}).sort();
    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: dates.map(d => new Date(d).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
        datasets: [{ label: 'Revenue', data: dates.map(d => data.daily_revenue[d]), borderColor: '#6366f1', fill: true, tension: 0.4 }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Category Chart
  const catCtx = $('category-chart');
  if (catCtx) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    const labels = Object.keys(data.category_distribution || {});
    categoryChartInstance = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: labels.map(l => data.category_distribution[l]), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'] }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if ($('admin-page')) {
    loadAdminProducts();
    loadAnalytics();
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        $(`${tab}-tab`).style.display = 'block';
        
        const actionHeader = document.querySelector('.admin-header-actions');
        if (actionHeader) {
          actionHeader.style.display = (tab === 'analytics') ? 'none' : 'flex';
        }

        if (tab === 'analytics') loadAnalytics();
        if (tab === 'products') loadAdminProducts();
      };
    });
  }
});
