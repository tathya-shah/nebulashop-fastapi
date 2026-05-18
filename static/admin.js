function $(id) {
  return document.getElementById(id);
}

function initAdminIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function adminEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function addSpecRow(containerId, label = '', values = []) {
    const container = $(containerId);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'spec-row';
    const valuesStr = Array.isArray(values) ? values.join(', ') : values;

    row.innerHTML = `
        <input type="text" class="spec-label-input" placeholder="Example: Size" value="${adminEscape(label)}" />
        <input type="text" class="spec-values-input" placeholder="Small, Medium, Large" value="${adminEscape(valuesStr)}" />
        <button type="button" class="btn-remove-spec" onclick="this.parentElement.remove()" title="Remove specification" aria-label="Remove specification">×</button>
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

let currentEditorVariants = [];
let revenueChartInstance = null;
let categoryChartInstance = null;

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

async function loadAdminProducts() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    const products = await response.json();
    displayAdminProducts(products);
  } catch (error) {
    console.error('Error loading products:', error);
    const container = $('admin-products');
    if (container) container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">!</span><p>Failed to load products.</p></div>';
  }
}

function displayAdminProducts(products) {
  const container = $('admin-products');
  if (!container) return;
  if (!products.length) {
    container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">0</span><p>No products found.</p></div>';
    return;
  }
  container.innerHTML = products.map((product, idx) => {
    const inventory = product.variants && product.variants.length ? product.variants.reduce((sum, v) => sum + Number(v.stock || 0), 0) : product.stock;
    const inventoryClass = inventory <= 0 ? 'out-of-stock' : inventory <= 5 ? 'low-stock' : 'in-stock';
    return `
      <div class="admin-product-row stagger-${Math.min(idx + 1, 6)}">
        <div class="admin-product-name"><label>Name</label><div>${adminEscape(product.name)}</div></div>
        <div class="admin-product-meta"><label>Category</label><div>${adminEscape(product.category)}</div></div>
        <div class="admin-product-meta"><label>Base price</label><div>$${Number(product.price).toFixed(2)}</div></div>
        <div class="admin-product-meta"><label>Inventory</label><div><span class="stock-status ${inventoryClass}">${inventory} units</span></div></div>
        <div class="admin-row-actions">
          <button class="btn btn-secondary btn-small" onclick="openProductModal(${product.id})" type="button"><i data-lucide="pencil" aria-hidden="true"></i> Edit</button>
          <button class="btn btn-danger btn-small" onclick="handleDeleteProduct(${product.id})" type="button" aria-label="Delete ${adminEscape(product.name)}"><i data-lucide="trash-2" aria-hidden="true"></i> Delete</button>
        </div>
      </div>
    `;
  }).join('');
  initAdminIcons();
}

async function handleDeleteProduct(productId) {
  if (!confirm('Delete this product?')) return;
  try {
    const response = await fetch(`${API_BASE}/products/${productId}`, { method: 'DELETE' });
    if (response.ok) {
      adminToast('Product deleted', 'success');
      loadAdminProducts();
      loadAnalytics();
    } else {
      adminToast('Delete failed', 'error');
    }
  } catch (error) {
    console.error(error);
    adminToast('Delete failed', 'error');
  }
}

async function openProductModal(productId = null) {
  const modal = $('product-editor-modal');
  const form = $('product-editor-form');
  if (!modal || !form) return;

  form.reset();
  $('editor-product-id').value = productId || '';
  currentEditorVariants = [];
  $('editor-variant-container').style.display = 'none';
  
  if (productId) {
    $('modal-title').innerText = 'Edit product';
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
      $('editor-variant-container').style.display = 'grid';
    }
  } else {
    $('modal-title').innerText = 'Add product';
    initSpecBuilder('editor-spec-builder');
  }
  modal.style.display = 'flex';
}

function closeProductModal() {
  const modal = $('product-editor-modal');
  if (modal) modal.style.display = 'none';
}

function generateEditorVariants() {
  const specsConfig = getSpecsFromBuilder('editor-spec-builder');
  const keys = Object.keys(specsConfig);
  if (!keys.length) {
    adminToast('Add specs first', 'warning');
    return;
  }
  const basePrice = parseFloat($('editor-price').value) || 0;
  const combinations = cartesianProduct(Object.values(specsConfig));
  currentEditorVariants = combinations.map(combo => {
    const specs = {};
    keys.forEach((k, i) => specs[k] = combo[i]);
    return { specs, price: basePrice, stock: 0 };
  });
  renderEditorVariantList();
  $('editor-variant-container').style.display = 'grid';
}

function renderEditorVariantList() {
  const list = $('editor-variant-list');
  if (!list) return;

  list.innerHTML = currentEditorVariants.map((v, idx) => {
    const specs = typeof v.specs === 'string' ? JSON.parse(v.specs) : v.specs;
    const specStr = Object.entries(specs).map(([k, val]) => `<strong>${adminEscape(k)}:</strong> ${adminEscape(val)}`).join(' | ');
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
    category: $('editor-category').value.trim() || 'General',
    description: $('editor-description').value.trim(),
    specs_config: getSpecsFromBuilder('editor-spec-builder'),
    variants: currentEditorVariants
  };

  if (!payload.name) {
    adminToast('Product name is required', 'warning');
    return;
  }

  const url = id ? `${API_BASE}/products/${id}` : `${API_BASE}/products`;
  try {
    const response = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      adminToast('Product saved', 'success');
      closeProductModal();
      loadAdminProducts();
      loadAnalytics();
    } else {
      const result = await response.json();
      adminToast(result.detail || 'Save failed', 'error');
    }
  } catch (error) {
    console.error(error);
    adminToast('Save failed', 'error');
  }
}

async function loadAnalytics() {
  if (!$('analytics-kpis')) return;
  try {
    const response = await fetch(`${API_BASE}/analytics/summary`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed');
    displayAnalytics(data);
  } catch (e) {
    adminToast(`Error: ${e.message}`, 'error');
  }
}

function displayAnalytics(data) {
  const kpiGrid = $('analytics-kpis');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="badge-dollar-sign" aria-hidden="true"></i></div>
        <div class="kpi-info"><label>Revenue</label><div class="kpi-value">$${formatValue(data.total_revenue)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="shopping-bag" aria-hidden="true"></i></div>
        <div class="kpi-info"><label>Orders</label><div class="kpi-value">${formatValue(data.total_orders)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="users-round" aria-hidden="true"></i></div>
        <div class="kpi-info"><label>Customers</label><div class="kpi-value">${formatValue(data.total_customers)}</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i data-lucide="boxes" aria-hidden="true"></i></div>
        <div class="kpi-info"><label>Variants</label><div class="kpi-value">${formatValue(data.total_variants)}</div></div>
      </div>
    `;
  }

  const oosList = $('out-of-stock-list');
  if (oosList) {
    oosList.innerHTML = (data.out_of_stock_products && data.out_of_stock_products.length) ?
      data.out_of_stock_products.map(p => `
        <div class="recent-order-item">
          <div class="order-id">${adminEscape(p.name)}</div>
          <div class="order-date">${adminEscape(p.category)}</div>
          <div></div>
          <div class="order-status-pill cancelled">Out</div>
        </div>
      `).join('') : '<p class="muted">All products have stock.</p>';
  }

  const lowStockList = $('low-stock-list');
  if (lowStockList) {
    lowStockList.innerHTML = (data.low_stock_products && data.low_stock_products.length) ?
      data.low_stock_products.map(p => `
        <div class="recent-order-item">
          <div class="order-id">${adminEscape(p.name)}</div>
          <div class="order-date">${adminEscape(p.category)}</div>
          <div></div>
          <div class="order-status-pill pending">${p.stock} left</div>
        </div>
      `).join('') : '<p class="muted">No low stock items.</p>';
  }

  const activityList = $('recent-orders-list');
  if (activityList) {
    activityList.innerHTML = data.recent_orders && data.recent_orders.length ? data.recent_orders.map(o => `
      <div class="recent-order-item">
        <div class="order-id">#${o.id}</div>
        <div class="order-date">${o.created_at}</div>
        <div class="order-total">$${Number(o.total).toFixed(2)}</div>
        <div class="order-status-pill ${(o.status || 'Completed').toLowerCase()}">${o.status || 'Completed'}</div>
      </div>
    `).join('') : '<p class="muted">No orders yet.</p>';
  }

  setTimeout(() => initCharts(data), 120);
  initAdminIcons();
}

function initCharts(data) {
  if (typeof Chart === 'undefined') return;
  
  const revCtx = $('revenue-chart');
  if (revCtx) {
    if (revenueChartInstance) revenueChartInstance.destroy();
    const dates = Object.keys(data.daily_revenue || {}).sort();
    revenueChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: dates.map(d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: [{
          label: 'Revenue',
          data: dates.map(d => data.daily_revenue[d]),
          borderColor: '#62c7dd',
          backgroundColor: 'rgba(98,199,221,0.18)',
          fill: true,
          tension: 0.38
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.08)' } },
          y: { grid: { color: 'rgba(255,255,255,0.08)' } }
        }
      }
    });
  }

  const catCtx = $('category-chart');
  if (catCtx) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    const labels = Object.keys(data.category_distribution || {});
    categoryChartInstance = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: labels.map(l => data.category_distribution[l]),
          backgroundColor: ['#62c7dd', '#d8a63c', '#72c28f', '#de6f67', '#b59cff']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if ($('admin-page')) {
    initAdminIcons();
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
