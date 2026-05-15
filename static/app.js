var API_BASE = '/api';
let allProducts = [];
let selectedCategory = 'all';
let searchTimeout = null;
const categoryIcons = {
  Laptops: '💻',
  Phones: '📱',
  Headphones: '🎧',
  Tablets: '🛍️',
  Smartwatches: '⌚',
  General: '🛍️'
};

// Toast Notification System
let toastTimeoutId = null;
function createToastElement() {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast hidden';
        document.body.appendChild(toast);
    }
    return toast;
}

function showToast(message, type = 'info') {
    const toast = createToastElement();
    const text = String(message ?? '').trim();
    const fallbackText = {
        success: 'Success',
        error: 'Something went wrong',
        warning: 'Please check your input',
        info: 'Notice'
    }[type] || 'Notification';

    toast.textContent = text || fallbackText;
    toast.classList.remove('hidden', 'success', 'error', 'warning', 'info');
    toast.classList.add('toast', type);
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.classList.remove('hidden');

    if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
        toastTimeoutId = null;
    }

    toastTimeoutId = setTimeout(() => {
        toast.classList.add('hidden');
        toastTimeoutId = null;
    }, 3000);
}

// Utility function
function $(id) {
    return document.getElementById(id);
}

// ── UI Enhancements ──

function highlightActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('.sidebar-link').forEach(link => {
        const linkPath = link.getAttribute('data-path');
        if (linkPath === path) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function setupMobileMenu() {
    const toggle = $('mobile-toggle');
    const sidebar = $('sidebar');
    const overlay = $('sidebar-overlay');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
    });

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
}

function updateCartBadge() {
    const badge = $('cart-count');
    if (!badge) return;
    
    fetch(`${API_BASE}/cart`)
        .then(r => r.ok ? r.json() : null)
        .then(cart => {
            if (!cart || !cart.items || cart.items.length === 0) {
                badge.classList.add('hidden');
                badge.textContent = '0';
            } else {
                const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
                badge.textContent = count;
                badge.classList.remove('hidden');
            }
        })
        .catch(() => {});
}

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
    highlightActiveNav();
    setupMobileMenu();
    updateCartBadge();

    if ($('category-buttons')) {
        loadCategories();
    }

    if ($('home-page')) {
        loadProducts();
        setupSearch();
    }
});

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        if (!response.ok) throw new Error('Failed to load categories');
        const data = await response.json();
        displayCategories(data.categories);
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function displayCategories(categories) {
    const container = $('category-buttons');
    
    if (!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'filter-btn active';
    allBtn.innerHTML = `<span class="filter-icon">✨</span> All`;
    allBtn.setAttribute('data-category', 'all');
    container.appendChild(allBtn);

    categories.forEach(category => {
        const icon = categoryIcons[category] || '🛍️';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-btn';
        btn.innerHTML = `<span class="filter-icon">${icon}</span> ${category}`;
        btn.setAttribute('data-category', category);
        container.appendChild(btn);
    });
    attachCategoryListeners();
}

function attachCategoryListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            const category = btn.getAttribute('data-category');
            filterByCategory(category || 'all');
        };
    });
}

function filterByCategory(category, page = 'home') {
    selectedCategory = category;
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-category') === category);
    });
    
    if (category === 'all') {
        displayProducts(allProducts);
    } else {
        const filtered = allProducts.filter(p => p.category.toLowerCase() === category.toLowerCase());
        displayProducts(filtered);
    }
}

async function loadProducts() {
    try {
        const container = $('product-list');
        if (container) {
            container.innerHTML = Array(6).fill(`
                <div class="product-card">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 80%"></div>
                    <div class="skeleton skeleton-price" style="margin-top: 1rem;"></div>
                    <div class="skeleton skeleton-button" style="margin-top: 1.5rem;"></div>
                </div>
            `).join('');
        }
        
        const response = await fetch(`${API_BASE}/products`);
        if (!response.ok) throw new Error('Failed to load products');
        allProducts = await response.json();
        if (selectedCategory === 'all') {
            displayProducts(allProducts);
        } else {
            filterByCategory(selectedCategory);
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Failed to load products', 'error');
    }
}

function displayProducts(products) {
    const container = $('product-list');
    if (!container) return;
    
    container.innerHTML = '';
    if (products.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">🔍</span><p>No products found</p></div>';
        return;
    }
    
    products.forEach((product, idx) => {
        const div = document.createElement('div');
        div.className = 'product-card stagger-' + Math.min(idx + 1, 6);
        
        const stockToUse = product.total_stock !== undefined ? product.total_stock : (product.display_stock !== undefined ? product.display_stock : product.stock);
        const stockStatus = stockToUse <= 0 ? 'out-of-stock' : stockToUse <= 5 ? 'low-stock' : 'in-stock';
        const stockText = stockToUse <= 0 ? 'Out of Stock' : stockToUse <= 5 ? `Only ${stockToUse} left` : 'In Stock';
        const icon = categoryIcons[product.category] || categoryIcons.General;
        const descSnippet = product.description ? (product.description.length > 60 ? product.description.substring(0, 60) + '...' : product.description) : 'No description available.';
        
        const hasVariants = product.variants && product.variants.length > 0;
        const isVariablePrice = hasVariants && product.variants.some(v => v.price !== product.price);
        const finalDisplayPrice = product.display_price !== undefined ? product.display_price : product.price;
        
        div.innerHTML = `
            <div class="product-badge top-right">
                <span class="rating-star">⭐</span> ${product.rating || '4.5'}
            </div>
            <div class="product-header" style="display: flex; align-items: flex-start; justify-content: space-between;">
                <div>
                    <h3 style="margin-bottom: 0.25rem;">${product.name}</h3>
                    <span class="category-badge">${icon} ${product.category}</span>
                </div>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 1rem 0; min-height: 40px;">
                ${descSnippet.replace(/</g, '&lt;')}
            </p>
            <div class="product-info" style="margin-bottom: 1.5rem;">
                <p class="product-price" style="font-size: 1.5rem;">
                    $${Number(finalDisplayPrice).toFixed(2)}
                    ${isVariablePrice ? '<span style="font-size: 0.75rem; color: var(--accent); margin-left: 0.5rem;">(Variants from $' + Number(product.min_price).toFixed(2) + ')</span>' : ''}
                </p>
                <p class="stock-status ${stockStatus}" style="font-size: 0.8rem;">${stockText}</p>
            </div>
            <div class="product-footer" style="display: block; margin-top: auto;">
                <a href="/product/${product.id}" class="btn btn-primary" style="display: block; text-align: center; text-decoration: none;">View Details</a>
            </div>
        `;
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        container.appendChild(div);
    });
}

function increaseQty(productId, maxStock) {
    const input = $(`qty-${productId}`);
    if (input) {
        let val = parseInt(input.value) || 1;
        if (val < maxStock) {
            input.value = val + 1;
        }
    }
}

function decreaseQty(productId) {
    const input = $(`qty-${productId}`);
    if (input) {
        let val = parseInt(input.value) || 1;
        if (val > 1) {
            input.value = val - 1;
        }
    }
}

async function addToCart(productId) {
    const qtyInput = $(`qty-${productId}`);
    if (!qtyInput) return;
    
    const qty = parseInt(qtyInput.value) || 1;
    if (qty < 1) {
        showToast('Please enter a valid quantity', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/cart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, quantity: qty })
        });
        
        if (response.ok) {
            showToast('Added to cart!', 'success');
            qtyInput.value = '1';
            updateCartBadge();
            setTimeout(() => {
                window.location.href = '/cart';
            }, 600);
        } else {
            const result = await response.json();
            showToast(result.detail || 'Failed to add to cart', 'error');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showToast('Failed to add to cart', 'error');
    }
}

function setupSearch() {
    const searchInput = $('search');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        searchTimeout = setTimeout(() => {
            if (query.length === 0) {
                hideSuggestions();
                filterByCategory(selectedCategory);
            } else {
                liveSearch(query);
            }
        }, 200);
    });

    document.addEventListener('click', event => {
        const suggestionBox = $('suggestion-box');
        if (suggestionBox && !suggestionBox.contains(event.target) && event.target.id !== 'search') {
            suggestionBox.classList.add('hidden');
        }
    });
}

async function liveSearch(query) {
    try {
        const response = await fetch(`${API_BASE}/products/search/${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Failed to search');
        const products = await response.json();
        displayProducts(products);
        displaySuggestions(products);
    } catch (error) {
        console.error('Error searching:', error);
    }
}

function displaySuggestions(products) {
    const box = $('suggestion-box');
    if (!box) return;

    if (!products.length) {
        box.classList.add('hidden');
        return;
    }

    box.innerHTML = '';
    products.slice(0, 5).forEach(product => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'suggestion-item';
        item.textContent = product.name;
        item.addEventListener('click', () => {
            $('search').value = product.name;
            box.classList.add('hidden');
            displayProducts([product]);
        });
        box.appendChild(item);
    });

    box.classList.remove('hidden');
}

function hideSuggestions() {
    const box = $('suggestion-box');
    if (box) {
        box.classList.add('hidden');
    }
}

function setupProductForm() {
    const form = $('product-form');
    if (!form) return;
    
    form.addEventListener('submit', async event => {
        event.preventDefault();
        await addProduct();
    });
}

async function addProduct() {
    const nameInput = $('product-name');
    const priceInput = $('product-price');
    const stockInput = $('product-stock');
    const categoryInput = $('product-category');

    if (!nameInput || !priceInput || !stockInput) return;

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);
    const stock = parseInt(stockInput.value, 10);
    const category = categoryInput?.value?.trim() || 'General';

    if (!name) {
        showToast('Please enter a product name', 'warning');
        return;
    }
    if (isNaN(price) || price < 0) {
        showToast('Please enter a valid price', 'warning');
        return;
    }
    if (isNaN(stock) || stock < 0) {
        showToast('Please enter a valid stock quantity', 'warning');
        return;
    }

    const nextId = allProducts.reduce((max, item) => Math.max(max, item.id), 0) + 1;

    try {
        const response = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: nextId, name, price, stock, category })
        });

        if (response.ok) {
            showToast('Product added successfully!', 'success');
            nameInput.value = '';
            priceInput.value = '';
            stockInput.value = '';
            categoryInput.value = '';
            await loadProducts();
            await loadCategories();
        } else {
            const result = await response.json();
            showToast(result.detail || 'Failed to add product', 'error');
        }
    } catch (error) {
        console.error('Error adding product:', error);
        showToast('Failed to add product', 'error');
    }
}


async function checkout() {
    try {
        const response = await fetch(`${API_BASE}/checkout`, { method: 'POST' });
        const result = await response.json();
        if (response.ok) {
            alert(`Order placed successfully! Order ID: ${result.order.id}`);
            loadCart();
            loadProducts();
        } else {
            alert(result.detail || 'Failed to checkout');
        }
    } catch (error) {
        console.error('Error during checkout:', error);
        alert('Failed to checkout.');
    }
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`);
        if (!response.ok) throw new Error('Failed to load orders');
        const orders = await response.json();
        displayOrders(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        const list = document.getElementById('orders-list');
        if (list) list.innerHTML = '<p>Failed to load orders.</p>';
    }
}

function displayOrders(orders) {
    const container = document.getElementById('orders-list');
    if (!container) return;

    container.innerHTML = '';
    if (!orders.length) {
        container.innerHTML = '<p>No orders executed yet.</p>';
        return;
    }

    orders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'order-card';
        const itemsHtml = order.items.map(item => `
            <div class="order-item">
                <span>${item.product_id}</span>
                <span>Qty: ${item.quantity}</span>
            </div>
        `).join('');
        div.innerHTML = `
            <h3>Order #${order.id}</h3>
            <div class="order-items">${itemsHtml}</div>
            <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        `;
        container.appendChild(div);
    });
}
