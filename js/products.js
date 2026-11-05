// js/products.js
// Handles product browsing: querying backend REST API with fallback to storage,
// rendering cards, implementing search, filters, sorting, wishlist toggling, and navigation.

import {
    getProducts, getUsers, getWishlists, addToWishlist,
    removeFromWishlist, genId, getProductAverageRating
} from "./storage.js";
import { getCurrentUser, syncNavbarAuth } from "./auth.js";
import { api, getStoredToken } from "./api.js";

let liveWishlistSet = new Set();

/** Check if current user has this product in wishlist */
function isInWishlist(productId) {
    const user = getCurrentUser();
    if (!user) return false;
    if (liveWishlistSet.has(productId)) return true;
    return getWishlists().some(w => w.customer_id === user.user_id && w.product_id === productId);
}

/** Render a single product card */
function createCard(product) {
    const card = document.createElement('div');
    card.classList.add('card', 'product-card');

    const pid = product.product_id || product._id;
    const inWishlist = isInWishlist(pid);
    const ratingText = product.ratingText || (product.numReviews > 0 ? `${product.rating} ★ (${product.numReviews})` : 'No reviews yet');
    const isAvailable = product.availability && product.approval_status !== 'rejected';

    card.innerHTML = `
        <div style="position:relative;">
            <img src="${product.image}" alt="${product.title}" style="width:100%; height:180px; object-fit:cover; border-radius:var(--radius-sm);" />
            <span class="badge ${isAvailable ? 'accepted' : 'rejected'}" style="position:absolute; top:8px; right:8px; box-shadow:0 2px 8px rgba(0,0,0,0.5);">
                ${isAvailable ? '● Available' : '○ Rented'}
            </span>
        </div>
        <div style="padding-top:0.75rem; display:flex; flex-direction:column; flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-primary); font-weight:700;">${product.category}</span>
                <span style="font-size:0.8rem; color:var(--color-secondary); font-weight:600;">${ratingText}</span>
            </div>
            <h3 style="margin:0.2rem 0 0.4rem; font-size:1.15rem; color:var(--color-text-primary);">${product.title}</h3>
            <p style="margin:0 0 0.5rem; color:var(--color-text-secondary); font-size:0.85rem; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                ${product.description}
            </p>
            <div style="margin-top:auto; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:baseline;">
                <span style="font-size:0.8rem; color:var(--color-text-muted);">Daily Rate</span>
                <span style="color:var(--color-secondary); font-weight:700; font-size:1.15rem;">₹${product.price_per_day} <span style="font-size:0.75rem; font-weight:400; color:var(--color-text-muted);">/day</span></span>
            </div>
            <div style="display:flex; gap:0.4rem; margin-top:0.75rem;">
                <button class="btn wishlist-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.4rem 0.6rem; flex:1;">
                    ${inWishlist ? '♥ Saved' : '♡ Wishlist'}
                </button>
                <button class="btn primary rent-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.4rem 0.75rem; flex:1.2;">
                    Rent Now
                </button>
            </div>
        </div>
    `;
    return card;
}

/** Render the whole product grid according to current filters */
export async function renderProducts() {
    const grid = document.getElementById('product-grid');
    const resultsCountEl = document.getElementById('results-count');
    const clearBtn = document.getElementById('clear-filters-btn');
    if (!grid) return;

    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const priceFilter = document.getElementById('price-filter');
    const availabilityFilter = document.getElementById('availability-filter');
    const sortSelect = document.getElementById('sort-select');

    const searchTerm = searchInput ? searchInput.value.trim() : "";
    const cat = categoryFilter ? categoryFilter.value : "";
    const priceRange = priceFilter ? priceFilter.value : "";
    const availVal = availabilityFilter ? availabilityFilter.value : "";
    const sortVal = sortSelect ? sortSelect.value : "";

    const hasActiveFilters = Boolean(searchTerm || cat || priceRange || availVal || sortVal);
    if (clearBtn) clearBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';

    // Parse price bounds
    let minPrice = undefined;
    let maxPrice = undefined;
    if (priceRange) {
        const parts = priceRange.split('-').map(Number);
        minPrice = parts[0];
        maxPrice = parts[1];
    }

    let availabilityParam = undefined;
    if (availVal === 'available') availabilityParam = 'true';
    if (availVal === 'unavailable') availabilityParam = 'false';

    let sortParam = undefined;
    if (sortVal === 'price-asc') sortParam = 'price-asc';
    if (sortVal === 'price-desc') sortParam = 'price-desc';
    if (sortVal === 'rating-desc') sortParam = 'rating';
    if (sortVal === 'name-asc') sortParam = 'name-asc';

    let products = [];
    let isLiveBackend = false;

    // Refresh live wishlist if token available and user is a customer
    const user = getCurrentUser();
    if (user && user.role === 'customer' && getStoredToken()) {
        try {
            const wlRes = await api.get('/wishlists');
            if (wlRes && wlRes.success && Array.isArray(wlRes.wishlist)) {
                liveWishlistSet = new Set(wlRes.wishlist.map(w => (w.product ? (w.product._id || w.product.product_id) : (w._id || w.product_id))));
            }
        } catch (e) {
            // Keep existing set
        }
    }

    // Attempt live API query
    try {
        const queryParams = {
            search: searchTerm || undefined,
            category: cat || undefined,
            minPrice,
            maxPrice,
            availability: availabilityParam,
            sort: sortParam,
            limit: 50
        };

        const res = await api.get('/products', queryParams);
        if (res && res.success && Array.isArray(res.products)) {
            products = res.products.map(p => ({
                product_id: p._id || p.product_id,
                title: p.title,
                description: p.description,
                category: p.category,
                price_per_day: p.price_per_day,
                image: p.image,
                availability: p.availability,
                rating: p.rating || 0,
                numReviews: p.numReviews || 0,
                ratingText: p.numReviews > 0 ? `${p.rating} ★ (${p.numReviews})` : 'No reviews yet'
            }));
            isLiveBackend = true;
        }
    } catch (err) {
        // Fallback to local storage query
    }

    if (!isLiveBackend) {
        const allProducts = getProducts().filter(p => (p.approval_status || 'approved') === 'approved');
        let filtered = allProducts.slice();

        if (searchTerm) {
            const lowTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                p.title.toLowerCase().includes(lowTerm) ||
                p.category.toLowerCase().includes(lowTerm) ||
                (p.description && p.description.toLowerCase().includes(lowTerm))
            );
        }

        if (cat) {
            filtered = filtered.filter(p => p.category.toLowerCase() === cat.toLowerCase());
        }

        if (priceRange) {
            const [min, max] = priceRange.split('-').map(Number);
            filtered = filtered.filter(p => p.price_per_day >= min && p.price_per_day <= max);
        }

        if (availVal === 'available') {
            filtered = filtered.filter(p => Boolean(p.availability));
        } else if (availVal === 'unavailable') {
            filtered = filtered.filter(p => !p.availability);
        }

        if (sortVal === 'price-asc') {
            filtered.sort((a, b) => a.price_per_day - b.price_per_day);
        } else if (sortVal === 'price-desc') {
            filtered.sort((a, b) => b.price_per_day - a.price_per_day);
        } else if (sortVal === 'rating-desc') {
            filtered.sort((a, b) => {
                const rA = getProductAverageRating(a.product_id).avg || 0;
                const rB = getProductAverageRating(b.product_id).avg || 0;
                return rB - rA;
            });
        } else if (sortVal === 'name-asc') {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        }

        products = filtered.map(p => {
            const r = getProductAverageRating(p.product_id);
            return {
                ...p,
                ratingText: r.text
            };
        });
    }

    if (resultsCountEl) {
        resultsCountEl.textContent = `Showing ${products.length} product${products.length === 1 ? '' : 's'}${hasActiveFilters ? ' (filtered)' : ' in marketplace'}`;
    }

    grid.innerHTML = '';
    if (products.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem 1rem;">
                <p class="empty-state" style="font-size:1.1rem; margin-bottom:1rem;">No rental products found matching your search criteria.</p>
                <button class="btn primary" id="empty-clear-btn">Reset All Filters</button>
            </div>
        `;
        document.getElementById('empty-clear-btn')?.addEventListener('click', clearAllFilters);
        return;
    }

    products.forEach(p => {
        grid.appendChild(createCard(p));
    });
}

function clearAllFilters() {
    const s = document.getElementById('search-input');
    const c = document.getElementById('category-filter');
    const p = document.getElementById('price-filter');
    const a = document.getElementById('availability-filter');
    const sort = document.getElementById('sort-select');

    if (s) s.value = '';
    if (c) c.value = '';
    if (p) p.value = '';
    if (a) a.value = '';
    if (sort) sort.value = '';

    renderProducts();
}

/** Wishlist button handler */
async function toggleWishlist(productId) {
    const user = getCurrentUser();
    if (!user) {
        alert('Please log in as a Customer to save items to your wishlist.');
        return;
    }

    // Try backend wishlist API
    try {
        if (liveWishlistSet.has(productId)) {
            await api.delete(`/wishlists/${productId}`);
            liveWishlistSet.delete(productId);
        } else {
            await api.post('/wishlists', { product_id: productId });
            liveWishlistSet.add(productId);
        }
    } catch (err) {
        // Fall back to local storage
        const existing = getWishlists().find(w => w.customer_id === user.user_id && w.product_id === productId);
        if (existing) {
            removeFromWishlist(existing.wishlist_id);
            liveWishlistSet.delete(productId);
        } else {
            const wishlistItem = {
                wishlist_id: genId('wishlist'),
                customer_id: user.user_id,
                product_id: productId
            };
            addToWishlist(wishlistItem);
            liveWishlistSet.add(productId);
        }
    }
    renderProducts();
}

/** Set up event listeners and handle URL query parameters */
export function init() {
    syncNavbarAuth();

    const urlParams = new URLSearchParams(window.location.search);
    const qCategory = urlParams.get('category');
    const qSearch = urlParams.get('search');

    if (qCategory) {
        const catSelect = document.getElementById('category-filter');
        if (catSelect) catSelect.value = qCategory;
    }
    if (qSearch) {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = qSearch;
    }

    let debounceTimer;
    document.getElementById('search-input')?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(renderProducts, 300);
    });
    document.getElementById('category-filter')?.addEventListener('change', renderProducts);
    document.getElementById('price-filter')?.addEventListener('change', renderProducts);
    document.getElementById('availability-filter')?.addEventListener('change', renderProducts);
    document.getElementById('sort-select')?.addEventListener('change', renderProducts);
    document.getElementById('clear-filters-btn')?.addEventListener('click', clearAllFilters);

    document.getElementById('product-grid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const pid = btn.dataset.id;
        if (!pid) return;

        if (btn.classList.contains('wishlist-btn')) {
            toggleWishlist(pid);
        } else if (btn.classList.contains('view-btn') || btn.classList.contains('rent-btn')) {
            window.location.href = `product-details.html?pid=${pid}`;
        }
    });

    renderProducts();
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
}
