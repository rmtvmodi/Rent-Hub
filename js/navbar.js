// js/navbar.js
// Handles responsive navigation toggle and ensures authentication links synchronization

import { syncNavbarAuth } from "./auth.js";

export function setupNavbarToggle() {
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    if (!toggle || !navLinks) return;

    // Synchronize navbar authentication links
    syncNavbarAuth();

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
