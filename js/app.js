// js/app.js - Handles home page dynamic sections (categories, featured products, search, FAQ)

import { getProducts, getProductAverageRating } from "./storage.js";
import { getCurrentUser, syncNavbarAuth } from "./auth.js";
import { api } from "./api.js";

function setupNavAuth() {
    syncNavbarAuth();
}

async function loadFeatured() {
    const grid = document.getElementById('featured-grid');
    if (!grid) return;

    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Loading featured products...</p>';

    let products = [];

    // Try live backend API first
    try {
        const res = await api.get('/products', { limit: 4 });
        if (res && res.success && Array.isArray(res.products) && res.products.length > 0) {
            products = res.products.map(p => ({
                product_id: p._id || p.product_id,
                title: p.title,
                description: p.description,
                category: p.category,
                price_per_day: p.price_per_day,
                image: p.image,
                availability: p.availability,
                ratingText: p.numReviews > 0 ? `${p.rating} ★ (${p.numReviews})` : 'No reviews yet'
            }));
        }
    } catch (e) {
        // Fall back to storage if backend is unreachable or empty
    }

    if (products.length === 0) {
        // Fallback to local storage
        const local = getProducts().filter(p => (p.approval_status || 'approved') === 'approved');
        products = local.slice(0, 4).map(p => {
            const r = getProductAverageRating(p.product_id);
            return {
                ...p,
                ratingText: r.text
            };
        });
    }

    grid.innerHTML = '';

    if (!products || products.length === 0) {
        grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">No products available at the moment.</p>';
        return;
    }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card product-card';
        card.innerHTML = `
            <div style="position:relative;">
                <img src="${p.image}" alt="${p.title}" style="width:100%; height:180px; object-fit:cover; border-radius:var(--radius-sm);" />
                <span class="badge ${p.availability ? 'accepted' : 'rejected'}" style="position:absolute; top:8px; right:8px;">
                    ${p.availability ? '● Available' : '○ Rented'}
                </span>
            </div>
            <div style="padding-top:0.75rem; display:flex; flex-direction:column; flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-primary); font-weight:700;">${p.category}</span>
                    <span style="font-size:0.8rem; color:var(--color-secondary); font-weight:600;">${p.ratingText}</span>
                </div>
                <h3 style="margin:0.2rem 0 0.4rem; font-size:1.15rem; color:var(--color-text-primary);">${p.title}</h3>
                <p style="margin:0 0 0.5rem; color:var(--color-text-secondary); font-size:0.85rem; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${p.description}
                </p>
                <div style="margin-top:auto; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:baseline;">
                    <span style="font-size:0.8rem; color:var(--color-text-muted);">Daily Rate</span>
                    <span style="color:var(--color-secondary); font-weight:700; font-size:1.15rem;">₹${p.price_per_day} <span style="font-size:0.75rem; font-weight:400; color:var(--color-text-muted);">/day</span></span>
                </div>
                <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                    <a href="product-details.html?pid=${p.product_id}" class="btn primary" style="width:100%; text-align:center;">Rent This Item</a>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function setupHomeSearch() {
    const searchInput = document.getElementById('home-search') || document.getElementById('hero-search');
    if (!searchInput) return;

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const term = searchInput.value.trim();
            if (term) {
                window.location.href = `products.html?search=${encodeURIComponent(term)}`;
            }
        }
    });
}

function setupFAQAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (!question) return;

        question.addEventListener('click', () => {
            const isOpen = item.classList.contains('active');
            faqItems.forEach(other => other.classList.remove('active'));
            if (!isOpen) {
                item.classList.add('active');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupNavAuth();
    loadFeatured();
    setupHomeSearch();
    setupFAQAccordion();
});
