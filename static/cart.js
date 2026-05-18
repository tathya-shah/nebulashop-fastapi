var API_BASE = '/api';

function $(id) {
    return document.getElementById(id);
}

function initCartIcons() {
    if (window.lucide) window.lucide.createIcons();
}

function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        return window.showToast(message, type);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('hidden'), 3000);
    setTimeout(() => toast.remove(), 3400);
}

async function fetchCart() {
    try {
        const response = await fetch(`${API_BASE}/cart`);
        if (!response.ok) {
            if (response.status === 401 && window.location.pathname === '/cart') {
                window.location.href = '/login';
                return null;
            }
            return { items: [], total: 0 };
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching cart:', error);
        return { items: [], total: 0 };
    }
}

async function loadCart() {
    const cart = await fetchCart();
    if (cart) await renderCart(cart);
}

async function renderCart(cart) {
    const itemsEl = $('cart-items');
    const totalEl = $('cart-total');
    const emptyEl = $('cart-empty');

    if (!itemsEl || !totalEl) return;

    const items = cart?.items || [];
    itemsEl.innerHTML = '';
    refreshCartBadge(cart);

    if (items.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        totalEl.innerHTML = '<div class="cart-total-amount"><span>Total</span><strong>$0.00</strong></div>';
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    items.forEach((item, idx) => {
        const specsText = Object.entries(item.selected_specs || {}).map(([k, v]) => `${v}`).join(' | ');
        const specHtml = specsText ? `<p class="cart-item-specs">${specsText}</p>` : '';

        const row = document.createElement('div');
        row.className = 'cart-item stagger-' + Math.min(idx + 1, 6);
        row.innerHTML = `
            <div class="cart-item-main">
                <h4>${item.name}</h4>
                ${specHtml}
                <p>$${Number(item.price).toFixed(2)} x ${item.quantity}</p>
            </div>
            <div class="cart-item-controls">
                <button class="qty-btn qty-minus" type="button" data-decrease="${item.item_id}" aria-label="Decrease ${item.name} quantity">-</button>
                <input type="number" class="cart-qty-input" value="${item.quantity}" min="1" readonly aria-label="${item.name} quantity">
                <button class="qty-btn qty-plus" type="button" data-increase="${item.item_id}" aria-label="Increase ${item.name} quantity">+</button>
            </div>
            <div class="cart-item-subtotal">
                $${Number(item.subtotal).toFixed(2)}
            </div>
            <button class="btn btn-secondary btn-small" type="button" data-remove="${item.item_id}"><i data-lucide="trash-2" aria-hidden="true"></i> Remove</button>
        `;

        row.querySelector(`[data-increase]`).addEventListener('click', () => handleIncreaseQty(item.item_id, item.quantity));
        row.querySelector(`[data-decrease]`).addEventListener('click', () => handleDecreaseQty(item.item_id, item.quantity));
        row.querySelector(`[data-remove]`).addEventListener('click', () => handleRemove(item.item_id));

        itemsEl.appendChild(row);
    });

    totalEl.innerHTML = `<div class="cart-total-amount"><span>Total</span><strong>$${Number(cart.total || 0).toFixed(2)}</strong></div>`;
    initCartIcons();
}

async function handleIncreaseQty(itemId, currentQty) {
    await updateCartItem(itemId, currentQty + 1);
}

async function handleDecreaseQty(itemId, currentQty) {
    const newQty = currentQty - 1;
    if (newQty < 1) {
        await handleRemove(itemId);
        return;
    }
    await updateCartItem(itemId, newQty);
}

async function updateCartItem(itemId, quantity) {
    try {
        const response = await fetch(`${API_BASE}/cart/item/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity })
        });

        if (response.ok) {
            const result = await response.json();
            await renderCart(result.cart);
        } else {
            const result = await response.json();
            showToast(result.detail || 'Failed to update cart', 'error');
        }
    } catch (error) {
        console.error('Error updating cart:', error);
        showToast('Failed to update cart', 'error');
    }
}

async function handleRemove(itemId) {
    try {
        const response = await fetch(`${API_BASE}/cart/item/${itemId}`, { method: 'DELETE' });
        
        if (response.ok) {
            showToast('Item removed from cart', 'success');
            const cart = await fetchCart();
            await renderCart(cart);
        } else {
            const result = await response.json();
            showToast(result.detail || 'Failed to remove item', 'error');
        }
    } catch (error) {
        console.error('Error removing cart item:', error);
        showToast('Failed to remove item', 'error');
    }
}

async function clearCart() {
    try {
        const response = await fetch(`${API_BASE}/cart`, { method: 'DELETE' });
        
        if (response.ok) {
            showToast('Cart cleared', 'success');
            await loadCart();
        } else {
            showToast('Failed to clear cart', 'error');
        }
    } catch (error) {
        console.error('Error clearing cart:', error);
        showToast('Failed to clear cart', 'error');
    }
}

async function handleCheckout() {
    window.location.href = '/checkout';
    return true;
}

function bindCartActions() {
    const clearBtn = $('clear-cart-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearCart);

    const checkoutBtn = $('checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
}

function refreshCartBadge(cart) {
    const badge = $('cart-count');
    if (!badge) return;
    
    if (window.IS_ADMIN) {
        badge.classList.add('hidden');
        return;
    }
    
    if (cart && cart.items && cart.items.length > 0) {
        badge.innerText = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCartIcons();
    if (window.location.pathname === '/cart') {
        loadCart();
        bindCartActions();
    } else {
        fetchCart().then(cart => refreshCartBadge(cart));
    }
});
