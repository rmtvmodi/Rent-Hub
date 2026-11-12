// js/admin.js
// Admin dashboard logic: metrics, user management, inventory approval moderation,
// booking oversight, and customer review moderation.
// Integrated with Express / MongoDB API with resilient offline fallback.

import { getCurrentUser, syncNavbarAuth, verifyBackendSession } from "./auth.js";
import {
    genId,
    getUsers,
    deleteUser,
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    getBookings,
    updateBooking,
    getReviews,
    deleteReview,
    addNotification
} from "./storage.js";
import { api, getStoredToken } from "./api.js";

let liveAdminMetrics = null;
let liveAdminUsers = null;
let liveAdminProducts = null;
let liveAdminBookings = null;

/*** Route protection ***/
function protectRoute() {
    const user = getCurrentUser();
    if (!user || !getStoredToken() || user.role !== "admin") {
        window.location.href = "login.html";
        return null;
    }
    return user;
}

/*** Form State ***/
let productEditMode = false;
let editingProductId = null;

function clearProductForm() {
    const form = document.getElementById('add-product-form');
    if (form) form.reset();
    const msg = document.getElementById('add-product-message');
    if (msg) msg.textContent = '';

    productEditMode = false;
    editingProductId = null;

    const btn = document.getElementById('admin-prod-submit-btn');
    if (btn) btn.textContent = 'Save Product';

    const heading = document.getElementById('admin-prod-form-heading');
    if (heading) heading.textContent = 'Add / Edit Product (Admin Mode)';

    const cancelBtn = document.getElementById('admin-cancel-edit-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
}

/*** Fetch live admin data ***/
async function fetchAdminData() {
    if (!getStoredToken()) return;
    try {
        const [mRes, uRes, pRes, bRes] = await Promise.allSettled([
            api.get('/admin/metrics'),
            api.get('/admin/users'),
            api.get('/admin/products'),
            api.get('/admin/bookings')
        ]);

        if (mRes.status === 'fulfilled' && mRes.value && mRes.value.success) {
            liveAdminMetrics = mRes.value.metrics;
        }

        if (uRes.status === 'fulfilled' && uRes.value && uRes.value.success) {
            liveAdminUsers = uRes.value.users.map(u => ({
                user_id: u._id || u.user_id,
                _id: u._id,
                name: u.name,
                email: u.email,
                role: u.role,
                isActive: u.isActive !== undefined ? u.isActive : true
            }));
        }

        if (pRes.status === 'fulfilled' && pRes.value && pRes.value.success) {
            liveAdminProducts = pRes.value.products.map(p => ({
                product_id: p._id || p.product_id,
                _id: p._id,
                title: p.title,
                category: p.category,
                price_per_day: p.price_per_day,
                image: p.image,
                availability: p.availability,
                approval_status: p.approval_status || 'approved',
                owner_id: p.owner ? (p.owner._id || p.owner) : '',
                ownerName: p.owner && p.owner.name ? p.owner.name : '—'
            }));
        }

        if (bRes.status === 'fulfilled' && bRes.value && bRes.value.success) {
            liveAdminBookings = bRes.value.bookings.map(b => ({
                booking_id: b._id || b.booking_id,
                _id: b._id,
                customer_id: b.customer ? (b.customer._id || b.customer) : '',
                customerName: b.customer && b.customer.name ? b.customer.name : '—',
                customerEmail: b.customer && b.customer.email ? b.customer.email : '',
                product_id: b.product ? (b.product._id || b.product) : '',
                productTitle: b.product && b.product.title ? b.product.title : '—',
                start_date: b.start_date ? b.start_date.split('T')[0] : '',
                end_date: b.end_date ? b.end_date.split('T')[0] : '',
                total_price: b.total_price,
                late_fee: b.late_fee || 0,
                status: b.status,
                payment_status: b.payment_status || 'Unpaid'
            }));
        }
    } catch (e) {
        // Fall back to storage
    }
}

/*** Summary cards ***/
function renderSummary() {
    if (liveAdminMetrics) {
        const m = liveAdminMetrics;
        const elUsers = document.getElementById("total-users");
        const elProducts = document.getElementById("total-products");
        const elApproved = document.getElementById("total-approved");
        const elBookings = document.getElementById("total-bookings");
        const elReviews = document.getElementById("total-reviews");
        const elVolume = document.getElementById("total-platform-volume");

        if (elUsers) elUsers.textContent = m.totalUsers;
        if (elProducts) elProducts.textContent = m.totalListings;
        if (elApproved) elApproved.textContent = (m.totalListings - (m.pendingApproval || 0));
        if (elBookings) elBookings.textContent = m.totalBookings;
        if (elReviews) elReviews.textContent = getReviews().length;
        if (elVolume) elVolume.textContent = `₹${(m.platformVolume || 0).toLocaleString('en-IN')}`;
        return;
    }

    const users = getUsers();
    const products = getProducts();
    const bookings = getBookings();
    const reviews = getReviews();

    const approvedCount = products.filter(p => (p.approval_status || 'approved') === 'approved').length;

    const platformVolume = bookings.reduce((sum, b) => {
        if (["Paid", "Active Rental", "Return Requested", "Completed"].includes(b.status)) {
            return sum + (Number(b.total_price) || 0) + (Number(b.late_fee) || 0);
        }
        return sum;
    }, 0);

    const elUsers = document.getElementById("total-users");
    const elProducts = document.getElementById("total-products");
    const elApproved = document.getElementById("total-approved");
    const elBookings = document.getElementById("total-bookings");
    const elReviews = document.getElementById("total-reviews");
    const elVolume = document.getElementById("total-platform-volume");

    if (elUsers) elUsers.textContent = users.length;
    if (elProducts) elProducts.textContent = products.length;
    if (elApproved) elApproved.textContent = approvedCount;
    if (elBookings) elBookings.textContent = bookings.length;
    if (elReviews) elReviews.textContent = reviews.length;
    if (elVolume) elVolume.textContent = `₹${platformVolume.toLocaleString('en-IN')}`;
}

/*** User Management ***/
function renderUsers() {
    const container = document.getElementById("admin-users");
    if (!container) return;

    let users = liveAdminUsers || getUsers();
    const current = getCurrentUser();

    const searchVal = document.getElementById("user-search")?.value.trim().toLowerCase() || "";
    const roleVal = document.getElementById("user-role-filter")?.value || "";

    if (searchVal) {
        users = users.filter(u => u.name.toLowerCase().includes(searchVal) || u.email.toLowerCase().includes(searchVal));
    }
    if (roleVal) {
        users = users.filter(u => u.role === roleVal);
    }

    if (users.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">No users found matching search criteria.</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:650px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">User ID</th>
                    <th style="padding:0.75rem 0.5rem;">Full Name</th>
                    <th style="padding:0.75rem 0.5rem;">Email Address</th>
                    <th style="padding:0.75rem 0.5rem;">Role</th>
                    <th style="padding:0.75rem 0.5rem;">Status</th>
                    <th style="padding:0.75rem 0.5rem; text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(u => {
        const uId = u.user_id || u._id;
        const isSelf = current && (current.user_id === uId || current._id === uId);
        const roleColor = u.role === 'admin' ? 'var(--color-primary)' : u.role === 'owner' ? 'var(--color-secondary)' : '#F1F5F9';
        const isActive = u.isActive !== undefined ? u.isActive : true;

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem; font-family:monospace; font-size:0.85rem;">${uId}</td>
                <td style="padding:0.75rem 0.5rem;"><strong>${u.name}</strong> ${isSelf ? '<span style="font-size:0.75rem; color:var(--color-secondary);">(You)</span>' : ''}</td>
                <td style="padding:0.75rem 0.5rem; color:var(--color-text-secondary);">${u.email}</td>
                <td style="padding:0.75rem 0.5rem;">
                    <span class="badge" style="background:rgba(255,255,255,0.07); color:${roleColor}; font-weight:600; text-transform:capitalize;">${u.role}</span>
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <span class="badge ${isActive ? 'accepted' : 'rejected'}" style="font-size:0.75rem;">${isActive ? 'Active' : 'Disabled'}</span>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right;">
                    ${isSelf ? '<span style="font-size:0.8rem; color:var(--color-text-muted);">Current Session</span>' : `
                        <button class="btn toggle-status-btn" data-id="${uId}" style="font-size:0.8rem; padding:0.35rem 0.6rem; margin-right:0.35rem;">
                            ${isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button class="btn delete-user-btn" data-id="${uId}" style="font-size:0.8rem; padding:0.35rem 0.65rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                    `}
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/*** Product Management & Moderation ***/
function populateOwnerSelect() {
    const select = document.getElementById('prod-owner');
    if (!select) return;
    const owners = (liveAdminUsers || getUsers()).filter(u => u.role === 'owner' || u.role === 'admin');
    select.innerHTML = '';
    owners.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.user_id || o._id;
        opt.textContent = `${o.name} (${o.role})`;
        select.appendChild(opt);
    });
}

function renderProducts() {
    const container = document.getElementById('admin-products');
    if (!container) return;

    let prods = liveAdminProducts || getProducts();

    const searchVal = document.getElementById("product-search")?.value.trim().toLowerCase() || "";
    const approvalVal = document.getElementById("product-approval-filter")?.value || "";

    if (searchVal) {
        prods = prods.filter(p => p.title.toLowerCase().includes(searchVal) || p.category.toLowerCase().includes(searchVal));
    }
    if (approvalVal) {
        prods = prods.filter(p => (p.approval_status || 'approved') === approvalVal);
    }

    if (prods.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">No products match the criteria.</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:750px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">Product</th>
                    <th style="padding:0.75rem 0.5rem;">Owner</th>
                    <th style="padding:0.75rem 0.5rem;">Category</th>
                    <th style="padding:0.75rem 0.5rem;">Daily Rate</th>
                    <th style="padding:0.75rem 0.5rem;">Available</th>
                    <th style="padding:0.75rem 0.5rem;">Approval Status</th>
                    <th style="padding:0.75rem 0.5rem; text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    prods.forEach(p => {
        const pid = p.product_id || p._id;
        const currentApproval = p.approval_status || 'approved';
        const ownerName = p.ownerName || 'Lender';

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${p.image}" alt="${p.title}" style="width:40px; height:40px; object-fit:cover; border-radius:0.3rem;" />
                        <div>
                            <strong>${p.title}</strong>
                            <div style="font-size:0.75rem; color:var(--color-text-muted); font-family:monospace;">${pid}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:0.75rem 0.5rem;">${ownerName}</td>
                <td style="padding:0.75rem 0.5rem;">${p.category}</td>
                <td style="padding:0.75rem 0.5rem; font-weight:600; color:var(--color-secondary);">₹${p.price_per_day}</td>
                <td style="padding:0.75rem 0.5rem;">
                    ${p.availability ? '<span style="color:var(--color-secondary); font-weight:600;">Yes</span>' : '<span style="color:#FB7185; font-weight:600;">No</span>'}
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <select class="approval-select" data-id="${pid}" style="padding:0.3rem 0.5rem; font-size:0.8rem; border-radius:var(--radius-sm); background:var(--color-surface); color:var(--color-text-primary); border:1px solid var(--color-border);">
                        <option value="approved" ${currentApproval === 'approved' ? 'selected' : ''}>Approved</option>
                        <option value="pending" ${currentApproval === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="rejected" ${currentApproval === 'rejected' ? 'selected' : ''}>Rejected</option>
                    </select>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right;">
                    <div style="display:inline-flex; gap:0.4rem;">
                        <button class="btn primary edit-prod-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.35rem 0.65rem;">Edit</button>
                        <button class="btn delete-prod-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.35rem 0.65rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

async function handleProductForm(e) {
    e.preventDefault();
    const title = document.getElementById('prod-title').value.trim();
    const desc = document.getElementById('prod-desc').value.trim();
    const category = document.getElementById('prod-category').value.trim();
    const price = Number(document.getElementById('prod-price').value);
    const availability = document.getElementById('prod-availability').checked;
    const image = document.getElementById('prod-image').value.trim();
    const ownerId = document.getElementById('prod-owner').value;
    const approval = document.getElementById('prod-approval').value;
    const msg = document.getElementById('add-product-message');

    if (!title || !desc || !category || !image || !ownerId || isNaN(price) || price <= 0) {
        msg.textContent = 'Please fill all fields with valid information.';
        msg.style.color = '#FB7185';
        return;
    }

    if (productEditMode && editingProductId) {
        try {
            await api.put(`/products/${editingProductId}`, {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image
            });
            await api.patch(`/products/${editingProductId}/approval`, { approval_status: approval });
            msg.textContent = `Product "${title}" updated.`;
            msg.style.color = 'var(--color-secondary)';
        } catch (err) {
            updateProduct({
                product_id: editingProductId,
                owner_id: ownerId,
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image,
                rating: 0,
                approval_status: approval
            });
            msg.textContent = `Product "${title}" updated in local storage.`;
            msg.style.color = 'var(--color-secondary)';
        }
    } else {
        try {
            await api.post('/products', {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image,
                approval_status: approval
            });
            msg.textContent = `Product "${title}" added.`;
            msg.style.color = 'var(--color-secondary)';
        } catch (err) {
            addProduct({
                product_id: genId('product'),
                owner_id: ownerId,
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image,
                rating: 0,
                approval_status: approval
            });
            msg.textContent = `Product "${title}" added to local storage.`;
            msg.style.color = 'var(--color-secondary)';
        }
    }

    clearProductForm();
    await refreshAllAdmin();
}

/*** Booking Management ***/
function renderBookings() {
    const container = document.getElementById('admin-bookings');
    if (!container) return;

    let bookings = liveAdminBookings || getBookings();

    const searchVal = document.getElementById("booking-search")?.value.trim().toLowerCase() || "";
    const statusVal = document.getElementById("booking-status-filter")?.value || "";

    if (searchVal) {
        bookings = bookings.filter(b => {
            const cName = b.customerName || '';
            const pTitle = b.productTitle || '';
            const bid = b.booking_id || b._id || '';
            return bid.toLowerCase().includes(searchVal) ||
                   cName.toLowerCase().includes(searchVal) ||
                   pTitle.toLowerCase().includes(searchVal);
        });
    }
    if (statusVal) {
        bookings = bookings.filter(b => b.status === statusVal);
    }

    if (bookings.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">No platform bookings found matching filter criteria.</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:800px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">Booking ID</th>
                    <th style="padding:0.75rem 0.5rem;">Customer</th>
                    <th style="padding:0.75rem 0.5rem;">Product</th>
                    <th style="padding:0.75rem 0.5rem;">Rental Dates</th>
                    <th style="padding:0.75rem 0.5rem;">Total</th>
                    <th style="padding:0.75rem 0.5rem;">Late Fee</th>
                    <th style="padding:0.75rem 0.5rem;">Status</th>
                    <th style="padding:0.75rem 0.5rem;">Admin Override</th>
                </tr>
            </thead>
            <tbody>
    `;

    bookings.forEach(b => {
        const bId = b.booking_id || b._id;
        const custName = b.customerName || 'Customer';
        const custEmail = b.customerEmail || '';
        const prodTitle = b.productTitle || 'Product';
        const statusClass = b.status.toLowerCase().replace(/\s+/g, '-');
        const statusOptions = ['Requested', 'Accepted', 'Paid', 'Active Rental', 'Return Requested', 'Completed', 'Cancelled', 'Rejected'];
        const selectHtml = statusOptions.map(opt => `<option value="${opt}" ${b.status === opt ? 'selected' : ''}>${opt}</option>`).join('');

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem; font-family:monospace; font-size:0.85rem;">#${bId}</td>
                <td style="padding:0.75rem 0.5rem;">
                    <strong>${custName}</strong>
                    <div style="font-size:0.75rem; color:var(--color-text-muted);">${custEmail}</div>
                </td>
                <td style="padding:0.75rem 0.5rem;">${prodTitle}</td>
                <td style="padding:0.75rem 0.5rem; font-size:0.85rem;">${b.start_date} <span style="color:var(--color-text-muted);">to</span> ${b.end_date}</td>
                <td style="padding:0.75rem 0.5rem; font-weight:600;">₹${b.total_price}</td>
                <td style="padding:0.75rem 0.5rem; color:${b.late_fee > 0 ? '#FB7185' : 'var(--color-text-muted)'}; font-weight:600;">
                    ${b.late_fee > 0 ? `+₹${b.late_fee}` : '—'}
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <span class="badge ${statusClass}">${b.status}</span>
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <select class="booking-status-select" data-id="${bId}" style="padding:0.3rem 0.5rem; font-size:0.8rem; border-radius:var(--radius-sm); background:var(--color-surface); color:var(--color-text-primary); border:1px solid var(--color-border);">
                        ${selectHtml}
                    </select>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/*** Review Moderation ***/
function renderReviews() {
    const container = document.getElementById('admin-reviews');
    if (!container) return;

    let reviews = getReviews();
    const usersMap = new Map(getUsers().map(u => [u.user_id, u]));
    const prodsMap = new Map(getProducts().map(p => [p.product_id, p]));

    const searchVal = document.getElementById("review-search")?.value.trim().toLowerCase() || "";

    if (searchVal) {
        reviews = reviews.filter(r => {
            const cust = usersMap.get(r.customer_id);
            const prod = prodsMap.get(r.product_id);
            return (r.comment && r.comment.toLowerCase().includes(searchVal)) ||
                   (cust && cust.name.toLowerCase().includes(searchVal)) ||
                   (prod && prod.title.toLowerCase().includes(searchVal));
        });
    }

    if (reviews.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">No reviews found.</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:700px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">Review ID</th>
                    <th style="padding:0.75rem 0.5rem;">Customer</th>
                    <th style="padding:0.75rem 0.5rem;">Product</th>
                    <th style="padding:0.75rem 0.5rem;">Rating</th>
                    <th style="padding:0.75rem 0.5rem;">Comment</th>
                    <th style="padding:0.75rem 0.5rem; text-align:right;">Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    reviews.forEach(r => {
        const cust = usersMap.get(r.customer_id);
        const prod = prodsMap.get(r.product_id);
        const stars = '★'.repeat(Math.max(1, Math.min(5, r.rating || 5)));

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem; font-family:monospace; font-size:0.85rem;">#${r.review_id}</td>
                <td style="padding:0.75rem 0.5rem;"><strong>${cust ? cust.name : '—'}</strong></td>
                <td style="padding:0.75rem 0.5rem;">${prod ? prod.title : '—'}</td>
                <td style="padding:0.75rem 0.5rem; color:var(--color-secondary); font-size:1rem; letter-spacing:1px;">${stars}</td>
                <td style="padding:0.75rem 0.5rem; color:var(--color-text-secondary); max-width:280px; line-height:1.4;">${r.comment || '—'}</td>
                <td style="padding:0.75rem 0.5rem; text-align:right;">
                    <button class="btn delete-review-btn" data-id="${r.review_id}" style="font-size:0.8rem; padding:0.35rem 0.65rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/*** Action Listeners ***/
function setupEventListeners() {
    // 1. User Delete & Status Toggle
    document.getElementById('admin-users')?.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.delete-user-btn');
        const statusBtn = e.target.closest('.toggle-status-btn');

        if (delBtn) {
            const uid = delBtn.dataset.id;
            if (confirm(`Are you sure you want to delete user #${uid}? This action is irreversible.`)) {
                try {
                    await api.delete(`/admin/users/${uid}`);
                } catch (err) {
                    deleteUser(uid);
                }
                await refreshAllAdmin();
            }
        } else if (statusBtn) {
            const uid = statusBtn.dataset.id;
            try {
                await api.patch(`/admin/users/${uid}/status`);
            } catch (err) {
                // local fallback
            }
            await refreshAllAdmin();
        }
    });

    // 2. Product Approval Select Change
    document.getElementById('admin-products')?.addEventListener('change', async (e) => {
        const select = e.target.closest('.approval-select');
        if (!select) return;
        const pid = select.dataset.id;
        const newStatus = select.value;

        try {
            await api.patch(`/products/${pid}/approval`, { approval_status: newStatus });
        } catch (err) {
            const product = getProducts().find(p => p.product_id === pid);
            if (product) {
                product.approval_status = newStatus;
                updateProduct(product);
            }
        }
        await refreshAllAdmin();
    });

    // 3. Product Edit & Delete
    document.getElementById('admin-products')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-prod-btn');
        const deleteBtn = e.target.closest('.delete-prod-btn');

        if (editBtn) {
            const pid = editBtn.dataset.id;
            let prod = (liveAdminProducts || []).find(p => p.product_id === pid || p._id === pid);
            if (!prod) prod = getProducts().find(p => p.product_id === pid);
            if (!prod) return;

            document.getElementById('prod-title').value = prod.title;
            document.getElementById('prod-desc').value = prod.description || '';
            document.getElementById('prod-category').value = prod.category;
            document.getElementById('prod-price').value = prod.price_per_day;
            document.getElementById('prod-availability').checked = prod.availability;
            document.getElementById('prod-image').value = prod.image;
            document.getElementById('prod-owner').value = prod.owner_id;
            document.getElementById('prod-approval').value = prod.approval_status || 'approved';

            productEditMode = true;
            editingProductId = pid;

            const submitBtn = document.getElementById('admin-prod-submit-btn');
            if (submitBtn) submitBtn.textContent = 'Save Product Changes';

            const heading = document.getElementById('admin-prod-form-heading');
            if (heading) heading.textContent = `Edit Product: ${prod.title}`;

            const cancelBtn = document.getElementById('admin-cancel-edit-btn');
            if (cancelBtn) cancelBtn.style.display = 'inline-block';

            document.getElementById('add-product-section')?.scrollIntoView({ behavior: 'smooth' });
        } else if (deleteBtn) {
            const pid = deleteBtn.dataset.id;
            if (confirm(`Permanently delete product #${pid} from marketplace?`)) {
                try {
                    await api.delete(`/products/${pid}`);
                } catch (err) {
                    deleteProduct(pid);
                }
                await refreshAllAdmin();
            }
        }
    });

    // 4. Booking Status Select Change
    document.getElementById('admin-bookings')?.addEventListener('change', async (e) => {
        const select = e.target.closest('.booking-status-select');
        if (!select) return;
        const id = select.dataset.id;
        const newStatus = select.value;

        try {
            await api.patch(`/admin/bookings/${id}/status`, { status: newStatus });
        } catch (err) {
            const booking = getBookings().find(b => b.booking_id === id);
            if (booking) {
                booking.status = newStatus;
                updateBooking(booking);
            }
        }
        await refreshAllAdmin();
    });

    // 5. Review Delete
    document.getElementById('admin-reviews')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.delete-review-btn');
        if (!btn) return;
        const rid = btn.dataset.id;
        if (confirm(`Delete review #${rid}?`)) {
            try {
                await api.delete(`/reviews/${rid}`);
            } catch (err) {
                deleteReview(rid);
            }
            await refreshAllAdmin();
        }
    });

    // 6. Form submissions and search inputs
    document.getElementById('add-product-form')?.addEventListener('submit', handleProductForm);
    document.getElementById('admin-cancel-edit-btn')?.addEventListener('click', clearProductForm);

    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('user-role-filter')?.addEventListener('change', renderUsers);

    document.getElementById('product-search')?.addEventListener('input', renderProducts);
    document.getElementById('product-approval-filter')?.addEventListener('change', renderProducts);

    document.getElementById('booking-search')?.addEventListener('input', renderBookings);
    document.getElementById('booking-status-filter')?.addEventListener('change', renderBookings);

    document.getElementById('review-search')?.addEventListener('input', renderReviews);
}

async function refreshAllAdmin() {
    await fetchAdminData();
    renderSummary();
    populateOwnerSelect();
    renderUsers();
    renderProducts();
    renderBookings();
    renderReviews();
}

/*** Initialization ***/
export async function init() {
    const user = protectRoute();
    if (!user) return;

    syncNavbarAuth();

    const span = document.getElementById("admin-name");
    if (span) span.textContent = user.name;

    await refreshAllAdmin();
    setupEventListeners();
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
}
