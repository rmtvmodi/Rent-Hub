// js/unified-dashboard.js
// Complete Unified Account Hub: Rentals, Equipment Listings, Add Product, Requests, Wishlist & Profile
// Fully integrated with Express REST APIs and MongoDB backend.

import { getCurrentUser, clearCurrentUser, syncNavbarAuth, verifyBackendSession } from "./auth.js";
import { getProducts, getBookings, getWishlists } from "./storage.js";
import { api, getStoredToken } from "./api.js";
import { showToast } from "./toast.js";

// State
let liveCustomerBookings = [];
let liveOwnerProducts = [];
let liveOwnerRequests = [];
let liveWishlistItems = [];

let currentProductImages = [];
let editMode = false;
let editProductId = null;

/** Protect route */
function protectRoute() {
    const user = getCurrentUser();
    if (!user || !getStoredToken()) {
        window.location.href = "login.html";
        return null;
    }
    if (user.role === "admin") {
        window.location.href = "admin-dashboard.html";
        return null;
    }
    return user;
}

/** Tab Switching */
function switchTab(targetTab) {
    document.querySelectorAll('.dashboard-tab-btn').forEach(btn => {
        const isTarget = btn.getAttribute('data-tab') === targetTab;
        btn.classList.toggle('active', isTarget);
        btn.setAttribute('aria-selected', String(isTarget));
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${targetTab}`);
    });

    // Update URL query param without full reload
    const url = new URL(window.location.href);
    url.searchParams.set('tab', targetTab);
    window.history.replaceState({}, '', url.toString());

    // Scroll to top of tab smoothly on mobile
    if (window.innerWidth < 768) {
        const tabEl = document.getElementById(`tab-${targetTab}`);
        if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/** Fetch all data from backend */
async function loadDashboardData(user) {
    if (!getStoredToken()) return;

    try {
        const [custRes, prodRes, reqRes, wishRes] = await Promise.allSettled([
            api.get('/bookings/my?role=customer'),
            api.get('/products/owner/listings'),
            api.get('/bookings/my?role=owner'),
            api.get('/wishlists')
        ]);

        if (custRes.status === 'fulfilled' && custRes.value && custRes.value.success) {
            liveCustomerBookings = custRes.value.bookings || [];
        } else {
            liveCustomerBookings = getBookings().filter(b => b.customer_id === user.user_id || b.customer === user.user_id);
        }

        if (prodRes.status === 'fulfilled' && prodRes.value && prodRes.value.success) {
            liveOwnerProducts = prodRes.value.products || [];
        } else {
            liveOwnerProducts = getProducts().filter(p => p.owner_id === user.user_id || p.owner === user.user_id);
        }

        if (reqRes.status === 'fulfilled' && reqRes.value && reqRes.value.success) {
            liveOwnerRequests = reqRes.value.bookings || [];
        } else {
            liveOwnerRequests = getBookings().filter(b => {
                const prod = getProducts().find(p => (p.product_id === b.product_id || p._id === b.product_id) && (p.owner_id === user.user_id || p.owner === user.user_id));
                return Boolean(prod);
            });
        }

        if (wishRes.status === 'fulfilled' && wishRes.value && wishRes.value.success) {
            liveWishlistItems = wishRes.value.wishlist || [];
        } else {
            liveWishlistItems = getWishlists().filter(w => w.customer_id === user.user_id || w.customer === user.user_id);
        }

        renderMetrics();
        renderRentals();
        renderListings();
        renderRequests();
        renderWishlist();
        renderProfile(user);
    } catch (err) {
        showToast('Could not sync latest data from server.', 'warning');
    }
}

/** Render Header Metrics */
function renderMetrics() {
    const totalRentals = liveCustomerBookings.length;
    const activeRentals = liveCustomerBookings.filter(b => ['Accepted', 'Paid', 'Active Rental', 'Return Requested'].includes(b.status)).length;
    const totalListings = liveOwnerProducts.length;

    // Calculate owner earnings from completed and active bookings
    const earnings = liveOwnerRequests
        .filter(b => ['Paid', 'Active Rental', 'Return Requested', 'Completed'].includes(b.status))
        .reduce((sum, b) => sum + (Number(b.total_price) || 0) + (Number(b.late_fee) || 0), 0);

    const elTotRentals = document.getElementById('stat-total-rentals');
    const elActRentals = document.getElementById('stat-active-rentals');
    const elTotListings = document.getElementById('stat-total-listings');
    const elEarnings = document.getElementById('stat-total-earnings');

    if (elTotRentals) elTotRentals.textContent = totalRentals;
    if (elActRentals) elActRentals.textContent = activeRentals;
    if (elTotListings) elTotListings.textContent = totalListings;
    if (elEarnings) elEarnings.textContent = `₹${earnings.toLocaleString('en-IN')}`;
}

/** TAB 1: Render Rentals */
function renderRentals() {
    const tbody = document.getElementById('rentals-tbody');
    const cardsContainer = document.getElementById('rentals-cards');
    if (!tbody && !cardsContainer) return;

    if (liveCustomerBookings.length === 0) {
        const emptyHtml = `<div class="empty-state-box" style="text-align:center; padding:2.5rem 1rem; color:var(--color-text-muted); background:var(--color-surface-card); border:1px solid var(--color-border); border-radius:var(--radius); width:100%; box-sizing:border-box;">You have no rental bookings yet. <a href="products.html" style="color:var(--color-secondary); font-weight:600;">Browse equipment available to rent</a>.</div>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
        if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
        return;
    }

    const tableRows = [];
    const mobileCards = [];

    liveCustomerBookings.forEach(b => {
        const id = b._id || b.booking_id;
        const prod = b.product || {};
        const title = prod.title || b.productTitle || 'Rental Item';
        const img = prod.image || b.productImage || 'https://via.placeholder.com/80';
        const startDate = b.start_date ? b.start_date.split('T')[0] : '';
        const endDate = b.end_date ? b.end_date.split('T')[0] : '';
        const total = Number(b.total_price) || 0;
        const lateFee = Number(b.late_fee) || 0;
        const status = b.status || 'Pending';
        const paymentStatus = b.payment_status || 'Unpaid';

        let statusBadge = `<span class="badge pending">${status}</span>`;
        if (status === 'Accepted' || status === 'Active Rental') statusBadge = `<span class="badge accepted">${status}</span>`;
        if (status === 'Completed') statusBadge = `<span class="badge" style="background:rgba(45,212,191,0.18); color:var(--color-secondary);">Completed</span>`;
        if (status === 'Cancelled' || status === 'Rejected') statusBadge = `<span class="badge rejected">${status}</span>`;
        if (status === 'Return Requested') statusBadge = `<span class="badge" style="background:rgba(245,158,11,0.18); color:#FBBF24;">Return Pending</span>`;

        let payBadge = paymentStatus === 'Paid'
            ? `<span style="color:var(--color-secondary); font-size:0.85rem; font-weight:600;">● Paid</span>`
            : `<span style="color:#FB7185; font-size:0.85rem; font-weight:600;">○ Unpaid</span>`;

        // Action Buttons
        let actionBtns = '';
        if (status === 'Accepted' && paymentStatus !== 'Paid') {
            actionBtns += `<button class="btn primary pay-now-btn" data-id="${id}" data-total="${total}">Pay ₹${total}</button> `;
        }
        if (status === 'Pending') {
            actionBtns += `<button class="btn cancel-booking-btn" data-id="${id}" style="color:#FB7185; border-color:rgba(251,113,133,0.3);">Cancel</button> `;
        }
        if (status === 'Active Rental') {
            actionBtns += `<button class="btn request-return-btn" data-id="${id}">Request Return</button> `;
        }
        if (status === 'Completed') {
            const prodId = prod._id || b.product_id;
            actionBtns += `<button class="btn leave-review-btn" data-id="${id}" data-pid="${prodId}" data-title="${title}" style="color:var(--color-secondary); border-color:var(--color-secondary);">★ Review</button> `;
        }

        // 1. Desktop Table Row
        tableRows.push(`
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${img}" alt="${title}" style="width:44px; height:44px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--color-border);" />
                        <div>
                            <strong>${title}</strong>
                            <div style="font-size:0.75rem; color:var(--color-text-muted);">Ref: ${id.slice(-6)}</div>
                        </div>
                    </div>
                </td>
                <td style="font-size:0.88rem;">${startDate} to ${endDate}</td>
                <td style="font-weight:700; color:var(--color-secondary);">₹${total}${lateFee > 0 ? ` <span style="font-size:0.75rem; color:#FB7185;">(+₹${lateFee} fee)</span>` : ''}</td>
                <td>${statusBadge}</td>
                <td>${payBadge}</td>
                <td style="text-align:right;">${actionBtns || '<span style="color:var(--color-text-muted); font-size:0.8rem;">None</span>'}</td>
            </tr>
        `);

        // 2. Mobile Responsive Card
        mobileCards.push(`
            <div class="dashboard-mobile-card card">
                <div class="dm-card-header">
                    <img src="${img}" alt="${title}" class="dm-card-img" />
                    <div class="dm-card-title-group">
                        <h4 class="dm-card-title">${title}</h4>
                        <span class="dm-card-id">Ref: ${id.slice(-6)}</span>
                    </div>
                </div>
                <div class="dm-card-grid">
                    <div class="dm-card-field">
                        <span class="dm-card-label">Rental Dates</span>
                        <span class="dm-card-val">${startDate} to ${endDate}</span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Total Amount</span>
                        <span class="dm-card-val dm-card-price">₹${total}${lateFee > 0 ? ` <small style="color:#FB7185;">(+₹${lateFee})</small>` : ''}</span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Booking Status</span>
                        <div class="dm-card-val">${statusBadge}</div>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Payment</span>
                        <div class="dm-card-val">${payBadge}</div>
                    </div>
                </div>
                ${actionBtns ? `<div class="dm-card-actions">${actionBtns}</div>` : ''}
            </div>
        `);
    });

    if (tbody) tbody.innerHTML = tableRows.join('');
    if (cardsContainer) cardsContainer.innerHTML = mobileCards.join('');
}

/** TAB 2: Render Equipment Listings */
function renderListings() {
    const tbody = document.getElementById('listings-tbody');
    const cardsContainer = document.getElementById('listings-cards');
    if (!tbody && !cardsContainer) return;

    if (liveOwnerProducts.length === 0) {
        const emptyHtml = `<div class="empty-state-box" style="text-align:center; padding:2.5rem 1rem; color:var(--color-text-muted); background:var(--color-surface-card); border:1px solid var(--color-border); border-radius:var(--radius); width:100%; box-sizing:border-box;">You have not listed any equipment yet. <button class="btn primary" onclick="document.querySelector('[data-tab=add-product]').click()" style="margin-left:0.5rem; font-size:0.85rem;">+ List an Item</button></div>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
        if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
        return;
    }

    const tableRows = [];
    const mobileCards = [];

    liveOwnerProducts.forEach(p => {
        const id = p._id || p.product_id;
        const img = p.image || 'https://via.placeholder.com/80';
        const title = p.title || 'Product';
        const price = p.price_per_day || 0;
        const category = p.category || 'Gear';
        const avail = p.availability;
        const approval = p.approval_status || 'approved';

        // Listing status: active/available or paused, with suspension indication if moderated by admin
        let statusBadge = avail
            ? `<span class="badge accepted">● Active & Available</span>`
            : `<span class="badge" style="background:rgba(255,255,255,0.08); color:var(--color-text-muted);">○ Paused</span>`;
        if (p.approval_status === 'rejected') {
            statusBadge = `<span class="badge rejected">Suspended by Admin</span>`;
        }

        // Calculate performance from incoming requests
        const rentals = liveOwnerRequests.filter(b => (b.product_id === id || (b.product && (b.product._id === id || b.product.product_id === id))) && ['Paid', 'Active Rental', 'Completed'].includes(b.status));
        const timesRented = rentals.length;
        const rev = rentals.reduce((sum, b) => sum + (Number(b.total_price) || 0) + (Number(b.late_fee) || 0), 0);

        // 1. Desktop Table Row
        tableRows.push(`
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${img}" alt="${title}" style="width:44px; height:44px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--color-border);" />
                        <div>
                            <strong>${title}</strong>
                            <div style="font-size:0.75rem; color:var(--color-text-muted);">${id.slice(-6)}</div>
                        </div>
                    </div>
                </td>
                <td style="font-size:0.88rem;">${category}</td>
                <td style="font-weight:700; color:var(--color-secondary);">₹${price} /day</td>
                <td style="font-size:0.85rem;">${timesRented} rental${timesRented === 1 ? '' : 's'} (₹${rev.toLocaleString('en-IN')})</td>
                <td>
                    ${statusBadge}
                </td>
                <td style="text-align:right;">
                    <div style="display:inline-flex; gap:0.4rem;">
                        <button class="btn toggle-avail-btn" data-id="${id}" style="font-size:0.8rem; padding:0.35rem 0.55rem;">
                            ${avail ? 'Set Unavailable' : 'Set Available'}
                        </button>
                        <button class="btn edit-prod-btn" data-id="${id}" style="font-size:0.8rem; padding:0.35rem 0.55rem;">Edit</button>
                        <button class="btn delete-prod-btn" data-id="${id}" style="font-size:0.8rem; padding:0.35rem 0.55rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                    </div>
                </td>
            </tr>
        `);

        // 2. Mobile Responsive Card
        mobileCards.push(`
            <div class="dashboard-mobile-card card">
                <div class="dm-card-header">
                    <img src="${img}" alt="${title}" class="dm-card-img" />
                    <div class="dm-card-title-group">
                        <h4 class="dm-card-title">${title}</h4>
                        <span class="dm-card-id">Ref: ${id.slice(-6)}</span>
                    </div>
                </div>
                <div class="dm-card-grid">
                    <div class="dm-card-field">
                        <span class="dm-card-label">Category</span>
                        <span class="dm-card-val">${category}</span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Daily Rate</span>
                        <span class="dm-card-val dm-card-price">₹${price} <small>/day</small></span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Performance</span>
                        <span class="dm-card-val">${timesRented} rental${timesRented === 1 ? '' : 's'} (₹${rev.toLocaleString('en-IN')})</span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Status</span>
                        <div class="dm-card-val">${statusBadge}</div>
                    </div>
                </div>
                <div class="dm-card-actions">
                    <button class="btn toggle-avail-btn" data-id="${id}">
                        ${avail ? 'Set Unavailable' : 'Set Available'}
                    </button>
                    <button class="btn primary edit-prod-btn" data-id="${id}">Edit</button>
                    <button class="btn delete-prod-btn" data-id="${id}" style="color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                </div>
            </div>
        `);
    });

    if (tbody) tbody.innerHTML = tableRows.join('');
    if (cardsContainer) cardsContainer.innerHTML = mobileCards.join('');
}

/** TAB 4: Render Incoming Booking Requests */
function renderRequests() {
    const tbody = document.getElementById('requests-tbody');
    const cardsContainer = document.getElementById('requests-cards');
    if (!tbody && !cardsContainer) return;

    if (liveOwnerRequests.length === 0) {
        const emptyHtml = `<div class="empty-state-box" style="text-align:center; padding:2.5rem 1rem; color:var(--color-text-muted); background:var(--color-surface-card); border:1px solid var(--color-border); border-radius:var(--radius); width:100%; box-sizing:border-box;">No booking requests received yet. Customer requests on your listings will appear here.</div>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
        if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
        return;
    }

    const tableRows = [];
    const mobileCards = [];

    liveOwnerRequests.forEach(b => {
        const id = b._id || b.booking_id;
        const prod = b.product || {};
        const title = prod.title || b.productTitle || 'Equipment';
        const renter = b.customer && b.customer.name ? b.customer.name : 'Customer';
        const startDate = b.start_date ? b.start_date.split('T')[0] : '';
        const endDate = b.end_date ? b.end_date.split('T')[0] : '';
        const total = Number(b.total_price) || 0;
        const status = b.status || 'Pending';

        let statusBadge = `<span class="badge pending">${status}</span>`;
        if (status === 'Accepted') statusBadge = `<span class="badge accepted">Accepted (Awaiting Payment)</span>`;
        if (status === 'Paid') statusBadge = `<span class="badge" style="background:rgba(45,212,191,0.2); color:var(--color-secondary);">Paid (Ready for Handover)</span>`;
        if (status === 'Active Rental') statusBadge = `<span class="badge accepted">Active Rental</span>`;
        if (status === 'Return Requested') statusBadge = `<span class="badge" style="background:rgba(245,158,11,0.2); color:#FBBF24;">Return Requested</span>`;
        if (status === 'Completed') statusBadge = `<span class="badge" style="background:rgba(45,212,191,0.15); color:var(--color-secondary);">Completed</span>`;
        if (status === 'Rejected' || status === 'Cancelled') statusBadge = `<span class="badge rejected">${status}</span>`;

        let actionBtns = '';
        if (status === 'Pending') {
            actionBtns += `<button class="btn primary accept-req-btn" data-id="${id}">Accept</button> `;
            actionBtns += `<button class="btn reject-req-btn" data-id="${id}" style="color:#FB7185; border-color:rgba(251,113,133,0.3);">Reject</button> `;
        }
        if (status === 'Paid') {
            actionBtns += `<button class="btn primary handover-req-btn" data-id="${id}">Handover Gear</button> `;
        }
        if (status === 'Active Rental' || status === 'Return Requested') {
            actionBtns += `<button class="btn confirm-return-btn" data-id="${id}" style="color:var(--color-secondary); border-color:var(--color-secondary);">Confirm Return</button> `;
        }

        // 1. Desktop Table Row
        tableRows.push(`
            <tr>
                <td><strong>${title}</strong></td>
                <td style="font-size:0.88rem;">${renter}</td>
                <td style="font-size:0.85rem;">${startDate} to ${endDate}</td>
                <td style="font-weight:700; color:var(--color-secondary);">₹${total}</td>
                <td>${statusBadge}</td>
                <td style="text-align:right;">${actionBtns || '<span style="color:var(--color-text-muted); font-size:0.8rem;">None</span>'}</td>
            </tr>
        `);

        // 2. Mobile Responsive Card
        mobileCards.push(`
            <div class="dashboard-mobile-card card">
                <div class="dm-card-header">
                    <div class="dm-card-title-group">
                        <h4 class="dm-card-title">${title}</h4>
                        <span class="dm-card-id">Renter: <strong>${renter}</strong></span>
                    </div>
                </div>
                <div class="dm-card-grid">
                    <div class="dm-card-field">
                        <span class="dm-card-label">Dates</span>
                        <span class="dm-card-val">${startDate} to ${endDate}</span>
                    </div>
                    <div class="dm-card-field">
                        <span class="dm-card-label">Total Rental</span>
                        <span class="dm-card-val dm-card-price">₹${total}</span>
                    </div>
                    <div class="dm-card-field dm-card-field-full">
                        <span class="dm-card-label">Request Status</span>
                        <div class="dm-card-val">${statusBadge}</div>
                    </div>
                </div>
                ${actionBtns ? `<div class="dm-card-actions">${actionBtns}</div>` : ''}
            </div>
        `);
    });

    if (tbody) tbody.innerHTML = tableRows.join('');
    if (cardsContainer) cardsContainer.innerHTML = mobileCards.join('');
}

/** TAB 5: Render Wishlist */
function renderWishlist() {
    const grid = document.getElementById('wishlist-grid');
    if (!grid) return;

    if (liveWishlistItems.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem 1rem; color:var(--color-text-muted); font-style:italic;">Your wishlist is currently empty. Click the heart icon on any product to save it here!</div>`;
        return;
    }

    grid.innerHTML = liveWishlistItems.map(item => {
        const prod = item.product || item;
        const pid = prod._id || prod.product_id;
        const img = prod.image || 'https://via.placeholder.com/200';
        const title = prod.title || 'Product';
        const price = prod.price_per_day || 0;
        const category = prod.category || 'Gear';

        return `
            <div class="card product-card">
                <div class="product-card-img-wrapper">
                    <img src="${img}" alt="${title}" loading="lazy" />
                    <button class="btn remove-wish-btn" data-id="${pid}" aria-label="Remove from wishlist" style="position:absolute; top:8px; right:8px; background:rgba(15,23,42,0.75); border:1px solid rgba(255,255,255,0.15); border-radius:50%; width:30px; height:30px; padding:0; display:flex; align-items:center; justify-content:center; color:#FB7185; cursor:pointer;">&times;</button>
                </div>
                <div class="product-card-body" style="padding-top:0.6rem; display:flex; flex-direction:column; flex:1;">
                    <span style="font-size:0.72rem; text-transform:uppercase; color:var(--color-primary); font-weight:700;">${category}</span>
                    <h3 class="product-card-title">${title}</h3>
                    <div style="margin-top:auto; padding-top:0.4rem;">
                        <span class="product-card-price">₹${price} <span style="font-size:0.72rem; color:var(--color-text-muted); font-weight:400;">/day</span></span>
                    </div>
                    <div style="margin-top:0.6rem;">
                        <a href="product-details.html?pid=${pid}" class="btn primary" style="display:block; text-align:center; font-size:0.8rem; padding:0.4rem;">Rent Now</a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/** TAB 6: Render Profile Info */
function renderProfile(user) {
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const phoneEl = document.getElementById('profile-phone');
    const dispName = document.getElementById('user-display-name');
    const dispEmail = document.getElementById('user-display-email');

    if (nameEl) nameEl.textContent = user.name || '-';
    if (emailEl) emailEl.textContent = user.email || '-';
    if (phoneEl) phoneEl.textContent = user.phone || 'Not provided';
    if (dispName) dispName.textContent = `Welcome, ${user.name}`;
    if (dispEmail) dispEmail.textContent = `Signed in as ${user.email} (All Rental & Listing Features Enabled)`;
}

/** Form: Render Image Previews */
function renderImagePreviews() {
    const container = document.getElementById('image-previews-container');
    if (!container) return;

    if (currentProductImages.length === 0) {
        container.innerHTML = `<span style="font-size:0.85rem; color:var(--color-text-muted);">No images selected yet. The first photo will be used as the primary cover.</span>`;
        return;
    }

    container.innerHTML = currentProductImages.map((url, idx) => `
        <div style="position:relative; width:88px; height:88px; border-radius:var(--radius-sm); overflow:hidden; border:2px solid ${idx === 0 ? 'var(--color-secondary)' : 'var(--color-border)'}; background:#0A0F1A;">
            <img src="${url}" alt="Preview ${idx + 1}" style="width:100%; height:100%; object-fit:cover; display:block;" />
            ${idx === 0 ? `<span style="position:absolute; top:2px; left:2px; background:var(--color-secondary); color:#0A0F1A; font-size:0.62rem; font-weight:800; padding:1px 4px; border-radius:3px;">COVER</span>` : ''}
            <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(10,15,26,0.85); display:flex; justify-content:space-between; padding:2px 4px;">
                ${idx !== 0 ? `<button type="button" class="set-cover-btn" data-index="${idx}" title="Set as Cover" style="background:none; border:none; color:var(--color-text-secondary); cursor:pointer; font-size:0.7rem; padding:0;">★</button>` : '<span></span>'}
                <button type="button" class="remove-img-btn" data-index="${idx}" title="Remove photo" style="background:none; border:none; color:#FB7185; cursor:pointer; font-size:0.7rem; padding:0;">&times;</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.set-cover-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx) && idx < currentProductImages.length) {
                const item = currentProductImages.splice(idx, 1)[0];
                currentProductImages.unshift(item);
                renderImagePreviews();
            }
        };
    });

    container.querySelectorAll('.remove-img-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx) && idx < currentProductImages.length) {
                currentProductImages.splice(idx, 1);
                renderImagePreviews();
            }
        };
    });
}

/** Upload Files via /api/products/upload */
async function uploadFiles(files) {
    if (!files || files.length === 0) return;

    const statusEl = document.getElementById('image-upload-status');
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (currentProductImages.length + files.length > 5) {
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(251,113,133,0.15)';
            statusEl.style.color = '#FB7185';
            statusEl.textContent = 'Maximum 5 photos allowed per product listing.';
        }
        return;
    }

    const formData = new FormData();
    for (const file of files) {
        if (!allowed.includes(file.type.toLowerCase())) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(251,113,133,0.15)';
                statusEl.style.color = '#FB7185';
                statusEl.textContent = `Unsupported format: "${file.name}". Please upload JPG, PNG, or WebP.`;
            }
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(251,113,133,0.15)';
                statusEl.style.color = '#FB7185';
                statusEl.textContent = `File "${file.name}" exceeds 5MB size limit.`;
            }
            return;
        }
        formData.append('images', file);
    }

    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(124,108,242,0.15)';
        statusEl.style.color = 'var(--color-primary)';
        statusEl.textContent = 'Uploading photo(s) to cloud storage...';
    }

    try {
        const res = await api.post('/products/upload', formData, { timeoutMs: 60000 });
        if (res && res.success && Array.isArray(res.urls)) {
            currentProductImages.push(...res.urls);
            renderImagePreviews();
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(45,212,191,0.15)';
                statusEl.style.color = 'var(--color-secondary)';
                statusEl.textContent = `${res.urls.length} photo(s) uploaded successfully!`;
                setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(251,113,133,0.15)';
            statusEl.style.color = '#FB7185';
            statusEl.textContent = err.message || 'Image upload failed. You may also enter a direct photo URL below.';
        }
    }
}

/** Reset Add Product Form */
function resetForm() {
    const form = document.getElementById('add-product-form');
    if (form) form.reset();
    currentProductImages = [];
    editMode = false;
    editProductId = null;

    const heading = document.getElementById('form-heading');
    if (heading) heading.textContent = 'List an Item for Rent';

    const submitBtn = document.getElementById('submit-prod-btn');
    if (submitBtn) submitBtn.textContent = 'Submit Listing';

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';

    const msg = document.getElementById('add-product-message');
    if (msg) msg.textContent = '';

    renderImagePreviews();
}

/** Form Submission */
async function handleFormSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('prod-title').value.trim();
    const desc = document.getElementById('prod-desc').value.trim();
    const category = document.getElementById('prod-category').value.trim();
    const price = Number(document.getElementById('prod-price').value);
    const availability = document.getElementById('prod-availability').checked;
    const msgDiv = document.getElementById('add-product-message');

    // Auto-append URL input if filled
    const urlInput = document.getElementById('prod-image-url');
    if (urlInput && urlInput.value.trim()) {
        const val = urlInput.value.trim();
        if (!currentProductImages.includes(val)) {
            currentProductImages.push(val);
            urlInput.value = '';
            renderImagePreviews();
        }
    }

    // Auto-upload pending files from input if any
    const fileInput = document.getElementById('prod-file-input');
    const cameraInput = document.getElementById('prod-camera-input');
    const pendingFiles = [];
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        pendingFiles.push(...Array.from(fileInput.files));
    }
    if (cameraInput && cameraInput.files && cameraInput.files.length > 0) {
        pendingFiles.push(...Array.from(cameraInput.files));
    }

    if (pendingFiles.length > 0 && currentProductImages.length === 0) {
        msgDiv.style.color = 'var(--color-primary)';
        msgDiv.textContent = 'Uploading photos before saving...';
        await uploadFiles(pendingFiles);
        if (fileInput) fileInput.value = '';
        if (cameraInput) cameraInput.value = '';
    }

    if (!title || !desc || !category || currentProductImages.length === 0 || isNaN(price) || price <= 0) {
        msgDiv.textContent = 'Please fill all required fields and provide at least one product photo.';
        msgDiv.style.color = '#FB7185';
        return;
    }

    const primaryImage = currentProductImages[0];
    const user = getCurrentUser();
    if (!user) return;

    const submitBtn = document.getElementById('submit-prod-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = editMode ? 'Saving Changes...' : 'Publishing Listing...';
    }

    msgDiv.style.color = 'var(--color-text-secondary)';
    msgDiv.textContent = editMode ? 'Updating product changes...' : 'Publishing product to marketplace...';

    try {
        if (editMode && editProductId) {
            await api.put(`/products/${editProductId}`, {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image: primaryImage,
                images: currentProductImages
            });
            showToast(`Product "${title}" updated successfully!`, 'success');
            resetForm();
            await loadDashboardData(user);
            switchTab('listings');
        } else {
            await api.post('/products', {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image: primaryImage,
                images: currentProductImages
            });
            showToast(`Listing created! Your item is now live in the marketplace.`, 'success');
            resetForm();
            await loadDashboardData(user);
            switchTab('listings');
        }
    } catch (err) {
        msgDiv.textContent = err.message || (editMode ? 'Failed to update product.' : 'Failed to publish product listing.');
        msgDiv.style.color = '#FB7185';
        showToast(err.message || 'Operation failed', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = editMode ? 'Save Changes' : 'Submit Listing';
        }
    }
}

/** Action Click Handlers */
async function handleActionClicks(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const user = getCurrentUser();
    if (!user) return;

    // --- Rentals Actions ---
    if (btn.classList.contains('pay-now-btn')) {
        const total = Number(btn.dataset.total) || 0;
        if (confirm(`Proceed with payment of ₹${total} for this rental?`)) {
            try {
                const res = await api.post('/payments', {
                    booking_id: id,
                    method: 'Card',
                    amount: total
                });
                if (res && res.success) {
                    showToast(`Payment of ₹${total} successful! Owner notified for handover.`, 'success');
                    await loadDashboardData(user);
                } else {
                    showToast(res?.message || 'Payment could not be processed.', 'error');
                }
            } catch (err) {
                showToast(err.message || 'Payment failed. Please try again.', 'error');
            }
        }
    }
    else if (btn.classList.contains('cancel-booking-btn')) {
        if (confirm('Are you sure you want to cancel this booking?')) {
            try {
                await api.patch(`/bookings/${id}/cancel`);
                showToast('Booking cancelled.', 'info');
            } catch (err) {
                showToast(err.message || 'Failed to cancel booking.', 'error');
            }
            await loadDashboardData(user);
        }
    }
    else if (btn.classList.contains('request-return-btn')) {
        if (confirm('Ready to return this equipment? The owner will confirm return.')) {
            try {
                await api.patch(`/bookings/${id}/request-return`);
                showToast('Return requested! Owner has been notified.', 'success');
            } catch (err) {
                showToast(err.message || 'Failed to request return.', 'error');
            }
            await loadDashboardData(user);
        }
    }
    else if (btn.classList.contains('leave-review-btn')) {
        const prodId = btn.dataset.pid;
        const title = btn.dataset.title;
        openReviewModal(id, prodId, title);
    }

    // --- Listings Actions ---
    else if (btn.classList.contains('toggle-avail-btn')) {
        const prod = liveOwnerProducts.find(p => (p._id === id || p.product_id === id));
        if (!prod) return;
        const newAvail = !prod.availability;
        try {
            await api.patch(`/products/${id}/availability`, { availability: newAvail });
            showToast(`Equipment availability set to ${newAvail ? 'Available' : 'Unavailable'}.`, 'success');
        } catch (err) {
            showToast(err.message || 'Failed to toggle availability.', 'error');
        }
        await loadDashboardData(user);
    }
    else if (btn.classList.contains('delete-prod-btn')) {
        const prod = liveOwnerProducts.find(p => (p._id === id || p.product_id === id));
        const title = prod ? prod.title : 'this product';
        if (confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
            try {
                await api.delete(`/products/${id}`);
                showToast(`Product "${title}" deleted successfully.`, 'success');
            } catch (err) {
                showToast(err.message || 'Failed to delete product.', 'error');
            }
            await loadDashboardData(user);
        }
    }
    else if (btn.classList.contains('edit-prod-btn')) {
        const prod = liveOwnerProducts.find(p => (p._id === id || p.product_id === id));
        if (!prod) return;

        document.getElementById('prod-title').value = prod.title;
        document.getElementById('prod-desc').value = prod.description;
        document.getElementById('prod-category').value = prod.category;
        document.getElementById('prod-price').value = prod.price_per_day;
        document.getElementById('prod-availability').checked = prod.availability;

        currentProductImages = Array.isArray(prod.images) && prod.images.length > 0
            ? [...prod.images]
            : (prod.image ? [prod.image] : []);
        renderImagePreviews();

        editMode = true;
        editProductId = id;

        const heading = document.getElementById('form-heading');
        if (heading) heading.textContent = `Edit Equipment: ${prod.title}`;

        const submitBtn = document.getElementById('submit-prod-btn');
        if (submitBtn) submitBtn.textContent = 'Save Changes';

        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        switchTab('add-product');
    }

    // --- Requests Actions ---
    else if (btn.classList.contains('accept-req-btn')) {
        try {
            await api.patch(`/bookings/${id}/accept`);
            showToast('Booking request accepted! Customer notified to pay.', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to accept booking.', 'error');
        }
        await loadDashboardData(user);
    }
    else if (btn.classList.contains('reject-req-btn')) {
        if (confirm('Reject this booking request?')) {
            try {
                await api.patch(`/bookings/${id}/reject`);
                showToast('Booking request rejected.', 'info');
            } catch (err) {
                showToast(err.message || 'Failed to reject booking.', 'error');
            }
            await loadDashboardData(user);
        }
    }
    else if (btn.classList.contains('handover-req-btn')) {
        try {
            await api.patch(`/bookings/${id}/handover`);
            showToast('Equipment handed over! Rental is now Active.', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to confirm handover.', 'error');
        }
        await loadDashboardData(user);
    }
    else if (btn.classList.contains('confirm-return-btn')) {
        if (confirm('Confirm return of this equipment?')) {
            try {
                const res = await api.patch(`/bookings/${id}/return`);
                const fee = res.booking ? res.booking.late_fee : 0;
                showToast(`Return confirmed!${fee > 0 ? ` Late fee of ₹${fee} assessed.` : ' Rental completed.'}`, 'success');
            } catch (err) {
                showToast(err.message || 'Failed to confirm return.', 'error');
            }
            await loadDashboardData(user);
        }
    }

    // --- Wishlist Actions ---
    else if (btn.classList.contains('remove-wish-btn')) {
        try {
            await api.delete(`/wishlists/${id}`);
            showToast('Removed from wishlist.', 'info');
        } catch (err) {
            showToast(err.message || 'Failed to remove from wishlist.', 'error');
        }
        await loadDashboardData(user);
    }
}

/** Review Modal */
function openReviewModal(bookingId, productId, title) {
    const modal = document.getElementById('review-modal');
    if (!modal) return;
    document.getElementById('review-booking-id').value = bookingId;
    document.getElementById('review-product-id').value = productId;
    document.getElementById('review-prod-title').textContent = `Reviewing: ${title}`;
    modal.style.display = 'flex';
}

function closeReviewModal() {
    const modal = document.getElementById('review-modal');
    if (modal) modal.style.display = 'none';
}

/** Password Change Handler */
async function handleChangePassword(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    const msg = document.getElementById('change-pwd-msg');

    if (newPassword !== confirmPassword) {
        msg.textContent = 'New passwords do not match.';
        msg.style.color = '#FB7185';
        return;
    }

    // Password complexity check
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!pwdRegex.test(newPassword)) {
        msg.textContent = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
        msg.style.color = '#FB7185';
        return;
    }

    msg.textContent = 'Updating password...';
    msg.style.color = 'var(--color-primary)';

    try {
        await api.put('/auth/password', { currentPassword: oldPassword, newPassword });
        msg.textContent = 'Password updated successfully!';
        msg.style.color = 'var(--color-secondary)';
        showToast('Password updated successfully!', 'success');
        document.getElementById('change-password-form').reset();
    } catch (err) {
        msg.textContent = err.message || 'Failed to update password. Check current password.';
        msg.style.color = '#FB7185';
    }
}

/** Initialize Unified Dashboard */
export async function init() {
    const user = protectRoute();
    if (!user) return;

    syncNavbarAuth();
    verifyBackendSession();

    // Wire Tabs
    document.querySelectorAll('.dashboard-tab-btn').forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // Check initial tab from URL param or hash
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '') || 'rentals';
    switchTab(initialTab);

    // Quick add button
    const quickAddBtn = document.getElementById('quick-add-btn');
    if (quickAddBtn) quickAddBtn.onclick = () => switchTab('add-product');

    // Add Product Form
    const addForm = document.getElementById('add-product-form');
    if (addForm) addForm.onsubmit = handleFormSubmit;

    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    if (cancelEditBtn) cancelEditBtn.onclick = resetForm;

    // File input listeners
    const fileInput = document.getElementById('prod-file-input');
    if (fileInput) {
        fileInput.onchange = (e) => {
            if (e.target.files && e.target.files.length > 0) {
                uploadFiles(Array.from(e.target.files));
                e.target.value = '';
            }
        };
    }

    const cameraInput = document.getElementById('prod-camera-input');
    if (cameraInput) {
        cameraInput.onchange = (e) => {
            if (e.target.files && e.target.files.length > 0) {
                uploadFiles(Array.from(e.target.files));
                e.target.value = '';
            }
        };
    }

    const addUrlBtn = document.getElementById('add-url-btn');
    if (addUrlBtn) {
        addUrlBtn.onclick = () => {
            const urlInput = document.getElementById('prod-image-url');
            if (urlInput && urlInput.value.trim()) {
                const val = urlInput.value.trim();
                if (currentProductImages.length >= 5) {
                    showToast('Maximum 5 images allowed per product.', 'warning');
                    return;
                }
                if (!currentProductImages.includes(val)) {
                    currentProductImages.push(val);
                    urlInput.value = '';
                    renderImagePreviews();
                }
            }
        };
    }

    // Action clicks on main container
    document.querySelector('main.dashboard')?.addEventListener('click', handleActionClicks);

    // Review Modal
    const closeRevBtn = document.getElementById('close-review-modal');
    if (closeRevBtn) closeRevBtn.onclick = closeReviewModal;

    const revForm = document.getElementById('submit-review-form');
    if (revForm) {
        revForm.onsubmit = async (e) => {
            e.preventDefault();
            const bookingId = document.getElementById('review-booking-id').value;
            const productId = document.getElementById('review-product-id').value;
            const rating = Number(document.getElementById('review-rating').value);
            const comment = document.getElementById('review-comment').value.trim();
            const msg = document.getElementById('review-msg');

            msg.textContent = 'Submitting review...';
            msg.style.color = 'var(--color-primary)';

            try {
                await api.post('/reviews', { product_id: productId, booking_id: bookingId, rating, comment });
                showToast('Review submitted successfully!', 'success');
                closeReviewModal();
                await loadDashboardData(user);
            } catch (err) {
                msg.textContent = err.message || 'Failed to submit review.';
                msg.style.color = '#FB7185';
            }
        };
    }

    // Change Password Form
    const pwdForm = document.getElementById('change-password-form');
    if (pwdForm) pwdForm.onsubmit = handleChangePassword;

    // Load initial data
    await loadDashboardData(user);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
}
