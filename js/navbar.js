// js/navbar.js
// Handles responsive navigation toggle, desktop menu sync, and mobile bottom navigation bar

import { syncNavbarAuth, getCurrentUser } from "./auth.js";

/** Render mobile bottom navigation bar if not already present */
export function renderMobileBottomNav() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('mobile-bottom-nav')) return;

    const pathname = (window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';
    const isHome = pathname === 'index.html' || pathname === '';
    const isBrowse = pathname === 'products.html' || pathname === 'product-details.html';
    const isDashboard = pathname.includes('dashboard.html');
    const urlParams = new URLSearchParams(window.location ? window.location.search : '');
    const tab = urlParams.get('tab');

    const isList = isDashboard && tab === 'add-product';
    const isWishlist = isDashboard && tab === 'wishlist';
    const isAccount = isDashboard && !isList && !isWishlist;

    const user = getCurrentUser();
    const accountUrl = user ? 'dashboard.html' : 'login.html';
    const listUrl = user ? 'dashboard.html?tab=add-product' : 'login.html?redirect=dashboard.html%3Ftab%3Dadd-product';
    const wishUrl = user ? 'dashboard.html?tab=wishlist' : 'login.html?redirect=dashboard.html%3Ftab%3Dwishlist';

    const nav = document.createElement('nav');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile Bottom Navigation');
    nav.innerHTML = `
        <a href="index.html" class="mobile-bottom-nav-item ${isHome ? 'active' : ''}">
            <span class="mobile-bottom-nav-icon">🏠</span>
            <span>Home</span>
        </a>
        <a href="products.html" class="mobile-bottom-nav-item ${isBrowse ? 'active' : ''}">
            <span class="mobile-bottom-nav-icon">🔍</span>
            <span>Browse</span>
        </a>
        <a href="${listUrl}" class="mobile-bottom-nav-item ${isList ? 'active' : ''}">
            <span class="mobile-bottom-nav-icon" style="color:var(--color-primary); font-weight:bold;">➕</span>
            <span>List</span>
        </a>
        <a href="${wishUrl}" class="mobile-bottom-nav-item ${isWishlist ? 'active' : ''}">
            <span class="mobile-bottom-nav-icon">🤍</span>
            <span>Wishlist</span>
        </a>
        <a href="${accountUrl}" class="mobile-bottom-nav-item ${isAccount ? 'active' : ''}">
            <span class="mobile-bottom-nav-icon">👤</span>
            <span>Account</span>
        </a>
    `;
    document.body.appendChild(nav);
}

export function setupNavbarToggle() {
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    if (!toggle || !navLinks) return;

    // Synchronize navbar authentication links
    syncNavbarAuth();
    renderMobileBottomNav();

    // Initialize aria attributes
    toggle.setAttribute('aria-controls', 'nav-links');
    if (!toggle.hasAttribute('aria-expanded')) {
        toggle.setAttribute('aria-expanded', 'false');
    }

    // Remove existing event listener if attached previously
    if (toggle._navbarHandler) {
        toggle.removeEventListener('click', toggle._navbarHandler);
    }

    toggle._navbarHandler = (e) => {
        e.stopPropagation();
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isExpanded));
        navLinks.classList.toggle('active');
    };
    toggle.addEventListener('click', toggle._navbarHandler);

    // Close menu when a link inside is clicked
    if (!navLinks._linkClickHandler) {
        navLinks._linkClickHandler = (e) => {
            if (e.target.closest('a') || e.target.closest('button:not(#nav-toggle)')) {
                navLinks.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            }
        };
        navLinks.addEventListener('click', navLinks._linkClickHandler);
    }

    // Close menu on Escape key
    if (!document._navbarEscapeHandler) {
        document._navbarEscapeHandler = (e) => {
            if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        };
        document.addEventListener('keydown', document._navbarEscapeHandler);
    }

    // Close menu when clicking outside navbar
    if (!document._navbarOutsideHandler) {
        document._navbarOutsideHandler = (e) => {
            if (!navLinks.contains(e.target) && !toggle.contains(e.target) && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            }
        };
        document.addEventListener('click', document._navbarOutsideHandler);
    }
}

// Auto-initialize on ready
if (document.readyState !== 'loading') {
    setupNavbarToggle();
} else {
    document.addEventListener('DOMContentLoaded', setupNavbarToggle);
}
