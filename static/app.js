var API_BASE = '/api';
let allProducts = [];
let selectedCategory = 'all';
let searchTimeout = null;
let toastTimeoutId = null;

const categoryTokens = {
    Laptops: 'LP',
    Phones: 'PH',
    Headphones: 'HP',
    Tablets: 'TB',
    Smartwatches: 'SW',
    General: 'NS'
};

function $(id) {
    return document.getElementById(id);
}

function initIcons() {
    if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createToastElement() {
    let toast = $('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast hidden';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
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
    toast.className = `toast ${type}`;

    if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
    }

    toastTimeoutId = setTimeout(() => {
        toast.classList.add('hidden');
        toastTimeoutId = null;
    }, 3000);
}

function highlightActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
        const linkPath = link.getAttribute('data-path');
        const isActive = linkPath === path || (linkPath !== '/' && path.startsWith(linkPath + '/'));
        link.classList.toggle('active', isActive);
    });
}

function setupMobileMenu() {
    const toggle = $('mobile-toggle');
    const sidebar = $('sidebar');
    const overlay = $('sidebar-overlay');
    const close = $('mobile-close');
    if (!toggle || !sidebar) return;

    const openMenu = () => {
        sidebar.classList.add('open');
        overlay?.classList.add('active');
        document.body.classList.add('menu-open');
        toggle.setAttribute('aria-expanded', 'true');
    };

    const closeMenu = () => {
        sidebar.classList.remove('open');
        overlay?.classList.remove('active');
        document.body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    overlay?.addEventListener('click', closeMenu);
    close?.addEventListener('click', closeMenu);
    document.querySelectorAll('.mobile-nav-link').forEach(link => link.addEventListener('click', closeMenu));
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

document.addEventListener('DOMContentLoaded', () => {
    highlightActiveNav();
    setupMobileMenu();
    updateCartBadge();
    initIcons();

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
        displayCategories(data.categories || []);
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
    allBtn.innerHTML = '<i data-lucide="sparkles" aria-hidden="true"></i> All';
    allBtn.setAttribute('data-category', 'all');
    container.appendChild(allBtn);

    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-btn';
        btn.innerHTML = `<i data-lucide="${categoryIconName(category)}" aria-hidden="true"></i> ${escapeHtml(category)}`;
        btn.setAttribute('data-category', category);
        container.appendChild(btn);
    });

    attachCategoryListeners();
    initIcons();
}

function categoryIconName(category) {
    const map = {
        Laptops: 'laptop',
        Phones: 'smartphone',
        Headphones: 'headphones',
        Tablets: 'tablet',
        Smartwatches: 'watch',
        General: 'package'
    };
    return map[category] || 'tag';
}

function attachCategoryListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = () => {
            const category = btn.getAttribute('data-category');
            filterByCategory(category || 'all');
        };
    });
}

function filterByCategory(category) {
    selectedCategory = category;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-category') === category);
    });
    
    if (category === 'all') {
        displayProducts(allProducts);
    } else {
        const filtered = allProducts.filter(p => String(p.category).toLowerCase() === category.toLowerCase());
        displayProducts(filtered);
    }
}

async function loadProducts() {
    const container = $('product-list');
    try {
        if (container) {
            container.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div class="skeleton skeleton-media"></div>
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-price"></div>
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
        if (container) {
            container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">!</span><p>Failed to load products.</p></div>';
        }
        showToast('Failed to load products', 'error');
    }
}

function displayProducts(products) {
    const container = $('product-list');
    if (!container) return;
    
    container.innerHTML = '';
    if (!products.length) {
        container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">0</span><p>No products found.</p></div>';
        return;
    }
    
    products.forEach((product, idx) => {
        const div = document.createElement('article');
        div.className = 'product-card stagger-' + Math.min(idx + 1, 6);
        
        const stockToUse = product.total_stock !== undefined ? product.total_stock : (product.display_stock !== undefined ? product.display_stock : product.stock);
        const stockStatus = stockToUse <= 0 ? 'out-of-stock' : stockToUse <= 5 ? 'low-stock' : 'in-stock';
        const stockText = stockToUse <= 0 ? 'Out of stock' : stockToUse <= 5 ? `Only ${stockToUse} left` : 'In stock';
        const token = categoryTokens[product.category] || String(product.name || 'NS').slice(0, 2).toUpperCase();
        const descSnippet = product.description ? (product.description.length > 72 ? product.description.substring(0, 72) + '...' : product.description) : 'A curated NebulaShop item with fast checkout support.';
        
        const hasVariants = product.variants && product.variants.length > 0;
        const isVariablePrice = hasVariants && product.variants.some(v => v.price !== product.price);
        const finalDisplayPrice = product.display_price !== undefined ? product.display_price : product.price;
        const rating = Number(product.rating || 4.5).toFixed(1);
        
        div.innerHTML = `
            <div class="product-media">
                <span class="product-media-token"><i data-lucide="${categoryIconName(product.category)}" aria-hidden="true"></i></span>
            </div>
            <span class="status-pill product-badge top-right"><i data-lucide="star" aria-hidden="true"></i>${rating}</span>
            <div class="product-body">
                <div class="product-header">
                    <span class="category-badge">${escapeHtml(product.category || 'General')}</span>
                    <h3>${escapeHtml(product.name)}</h3>
                </div>
                <p class="product-description">${escapeHtml(descSnippet)}</p>
                <div class="product-info">
                    <div>
                        <p class="product-price">$${Number(finalDisplayPrice || 0).toFixed(2)}</p>
                        ${isVariablePrice ? `<span class="price-note">Variants from $${Number(product.min_price).toFixed(2)}</span>` : ''}
                    </div>
                    <p class="stock-status ${stockStatus}">${stockText}</p>
                </div>
                <div class="product-footer">
                    <a href="/product/${product.id}" class="btn btn-primary">View details <i data-lucide="arrow-right" aria-hidden="true"></i></a>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
    initIcons();
}

function increaseQty(productId, maxStock) {
    const input = $(`qty-${productId}`);
    if (input) {
        let val = parseInt(input.value) || 1;
        if (val < maxStock) input.value = val + 1;
    }
}

function decreaseQty(productId) {
    const input = $(`qty-${productId}`);
    if (input) {
        let val = parseInt(input.value) || 1;
        if (val > 1) input.value = val - 1;
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
            showToast('Added to cart', 'success');
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
        }, 180);
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
    if (box) box.classList.add('hidden');
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

    if (!name) return showToast('Please enter a product name', 'warning');
    if (isNaN(price) || price < 0) return showToast('Please enter a valid price', 'warning');
    if (isNaN(stock) || stock < 0) return showToast('Please enter a valid stock quantity', 'warning');

    try {
        const response = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, stock, category })
        });

        if (response.ok) {
            showToast('Product added successfully', 'success');
            nameInput.value = '';
            priceInput.value = '';
            stockInput.value = '';
            if (categoryInput) categoryInput.value = '';
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
            showToast(`Order placed successfully. Order ID: ${result.order_id || result.order?.id}`, 'success');
            if (typeof loadCart === 'function') loadCart();
            loadProducts();
        } else {
            showToast(result.detail || 'Failed to checkout', 'error');
        }
    } catch (error) {
        console.error('Error during checkout:', error);
        showToast('Failed to checkout', 'error');
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
        const list = $('orders-list');
        if (list) list.innerHTML = '<div class="empty-state"><span class="empty-state-icon">!</span><p>Failed to load orders.</p></div>';
    }
}
