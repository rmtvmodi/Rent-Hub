// js/customer-dashboard.js
// Complete Customer Dashboard: active rentals, timeline tracker, booking history,
// payment flow, return requests, reviews, notifications, and wishlist.
// Integrated with Express / MongoDB API with resilient offline fallback.

import { getCurrentUser, clearCurrentUser, syncNavbarAuth, verifyBackendSession } from "./auth.js";
import {
    getBookings, getWishlists, removeFromWishlist, getProducts, getUsers,
    getReviews, addReview, deleteBooking, updateBooking, genId,
    addNotification, getUserNotifications, markNotificationRead, markAllNotificationsRead,
    hasUserReviewedBooking
} from "./storage.js";
import { api, getStoredToken } from "./api.js";

let liveBookings = null;
let liveWishlist = null;
let liveNotifications = null;

/** Protect route: allow authenticated customer or owner, redirect admins or guests */
function protectRoute() {
    const user = getCurrentUser();
    if (!user || !getStoredToken()) {
        window.location.href = 'login.html';
        return null;
    }
    if (user.role === 'admin') {
        window.location.href = 'admin-dashboard.html';
        return null;
    }
    return user;
}

/** Fetch live customer data from backend APIs */
async function fetchCustomerData(user) {
    if (!getStoredToken()) return;
    try {
        const [bRes, wRes, nRes] = await Promise.allSettled([
            api.get('/bookings/my?role=customer'),
            api.get('/wishlists'),
            api.get('/notifications')
        ]);

        if (bRes.status === 'fulfilled' && bRes.value && bRes.value.success) {
            liveBookings = bRes.value.bookings.map(b => ({
                booking_id: b._id || b.booking_id,
                _id: b._id,
                product_id: b.product ? (b.product._id || b.product.product_id) : b.product_id,
                productTitle: b.product && b.product.title ? b.product.title : 'Product',
                productImage: b.product && b.product.image ? b.product.image : '',
                start_date: b.start_date ? b.start_date.split('T')[0] : '',
                end_date: b.end_date ? b.end_date.split('T')[0] : '',
                total_price: b.total_price,
                late_fee: b.late_fee || 0,
                status: b.status,
                payment_status: b.payment_status || 'Unpaid'
            }));
        }

        if (wRes.status === 'fulfilled' && wRes.value && wRes.value.success) {
            liveWishlist = wRes.value.wishlist.map(w => {
                const prod = w.product || {};
                return {
                    wishlist_id: w._id || w.wishlist_id,
                    product_id: prod._id || prod.product_id,
                    title: prod.title || 'Product',
                    price_per_day: prod.price_per_day || 0,
                    category: prod.category || 'Rental',
                    image: prod.image || ''
                };
            });
        }

        if (nRes.status === 'fulfilled' && nRes.value && nRes.value.success) {
            liveNotifications = nRes.value.notifications.map(n => ({
                notification_id: n._id || n.notification_id,
                message: n.message,
                read: n.is_read !== undefined ? n.is_read : n.read,
                date: n.createdAt || n.date
            }));
        }
    } catch (e) {
        // Retain local storage state
    }
}

/** Render statistics */
function renderStats(user) {
    const bookings = liveBookings || getBookings().filter(b => (b.customer_id === user.user_id || b.customer === user.user_id));
    const wishlist = liveWishlist || getWishlists().filter(w => w.customer_id === user.user_id);

    const total = bookings.length;
    const active = bookings.filter(b =>
        b.status === 'Requested' || b.status === 'Pending' ||
        b.status === 'Accepted' || b.status === 'Paid' ||
        b.status === 'Active Rental' || b.status === 'Return Requested'
    ).length;
    const completed = bookings.filter(b => b.status === 'Completed').length;

    const welcomeMsg = document.getElementById('welcome-msg');
    if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${user.name}`;

    const totalEl = document.getElementById('total-bookings');
    if (totalEl) totalEl.textContent = total;

    const activeEl = document.getElementById('active-rentals');
    if (activeEl) activeEl.textContent = active;

    const completedEl = document.getElementById('completed-rentals');
    if (completedEl) completedEl.textContent = completed;

    const wishEl = document.getElementById('wishlist-count');
    if (wishEl) wishEl.textContent = wishlist.length;
}

/** Generate visual status timeline */
export function buildStatusTimeline(status) {
    const steps = ['Requested', 'Accepted', 'Paid', 'Active Rental', 'Return Requested', 'Completed'];
    const currentStatus = (status === 'Pending') ? 'Requested' : status;
    const currentIndex = steps.indexOf(currentStatus);

    if (currentStatus === 'Cancelled') {
        return `<span class="badge rejected" style="margin-top:0.5rem;">✕ Booking Cancelled</span>`;
    }
    if (currentStatus === 'Rejected') {
        return `<span class="badge rejected" style="margin-top:0.5rem;">✕ Booking Declined</span>`;
    }

    let stepsHtml = '';
    steps.forEach((step, idx) => {
        let stateClass = '';
        if (idx < currentIndex) stateClass = 'completed';
        else if (idx === currentIndex) stateClass = 'current';

        stepsHtml += `
            <div class="timeline-step ${stateClass}">
                <div class="timeline-dot">${idx < currentIndex ? '✓' : idx + 1}</div>
                <div class="timeline-label">${step}</div>
            </div>
        `;
    });

    return `
        <div class="timeline-container">
            <div class="timeline-steps">
                ${stepsHtml}
            </div>
        </div>
    `;
}

/** Compute rental remaining time / overdue badge */
function getDueBadge(booking) {
    if (booking.status === 'Completed' || booking.status === 'Cancelled' || booking.status === 'Rejected') {
        return '';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(booking.end_date);
    dueDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return `<span class="badge due-soon" title="Due in ${diffDays} day(s)">⏱ Due in ${diffDays}d</span>`;
    } else if (diffDays === 0) {
        return `<span class="badge due-soon" style="background:#F59E0B; color:#000;">⚠️ Due Today</span>`;
    } else {
        const overdueDays = Math.abs(diffDays);
        return `<span class="badge overdue" title="Late by ${overdueDays} day(s)">🚨 Overdue (${overdueDays}d)</span>`;
    }
}

/** Render active & upcoming bookings */
function renderActiveBookings(user) {
    const container = document.getElementById('active-bookings-list');
    if (!container) return;

    const allBookings = liveBookings || getBookings().filter(b => (b.customer_id === user.user_id || b.customer === user.user_id));
    const activeBookings = allBookings.filter(b =>
        b.status === 'Requested' || b.status === 'Pending' ||
        b.status === 'Accepted' || b.status === 'Paid' ||
        b.status === 'Active Rental' || b.status === 'Return Requested'
    );

    if (activeBookings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>You have no active or upcoming rentals right now.</p>
                <a href="products.html" class="btn primary" style="margin-top:0.75rem;">Browse Products to Rent</a>
            </div>
        `;
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:1.25rem;">';
    activeBookings.forEach(b => {
        let product = null;
        if (b.productTitle && b.productTitle !== 'Product') {
            product = { title: b.productTitle, image: b.productImage };
        } else {
            product = getProducts().find(p => p.product_id === b.product_id || p._id === b.product_id);
        }

        const days = Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24)) + 1;
        const dueBadge = getDueBadge(b);

        let actionButtons = '';
        if (b.status === 'Accepted' && b.payment_status === 'Unpaid') {
            actionButtons += `<a href="payment.html?bid=${b.booking_id}" class="btn primary" style="font-size:0.9rem;">💳 Pay Now (₹${b.total_price})</a>`;
            actionButtons += `<button class="btn cancel-btn" data-id="${b.booking_id}" style="margin-left:0.5rem;">Cancel</button>`;
        } else if (b.status === 'Requested' || b.status === 'Pending') {
            actionButtons += `<span style="font-size:0.85rem; color:var(--color-text-secondary); margin-right:0.75rem;">Awaiting Owner Approval</span>`;
            actionButtons += `<button class="btn cancel-btn" data-id="${b.booking_id}">Cancel Request</button>`;
        } else if (b.status === 'Active Rental' || b.status === 'Paid') {
            actionButtons += `<button class="btn secondary return-req-btn" data-id="${b.booking_id}">📦 Request Product Return</button>`;
        } else if (b.status === 'Return Requested') {
            actionButtons += `<span class="badge return-requested">Return Pending Owner Confirmation</span>`;
        }

        html += `
            <div class="card" style="padding:1.5rem; background:var(--color-surface-card); border:1px solid var(--color-border);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div style="display:flex; gap:1.25rem; align-items:center;">
                        <img src="${product ? product.image : ''}" alt="${product ? product.title : ''}" style="width:80px; height:80px; object-fit:cover; border-radius:var(--radius); border:1px solid var(--color-border);" />
                        <div>
                            <h4 style="margin:0 0 0.25rem; font-size:1.15rem; color:var(--color-text-primary);">${product ? product.title : 'Product'}</h4>
                            <p style="margin:0; font-size:0.88rem; color:var(--color-text-secondary);">
                                Booking #${b.booking_id} • <strong>${days} day(s)</strong> (${b.start_date} → ${b.end_date})
                            </p>
                            <p style="margin:0.25rem 0 0; font-size:0.95rem; color:var(--color-secondary); font-weight:700;">
                                Total: ₹${b.total_price} • Payment: <span class="badge ${b.payment_status === 'Paid' ? 'paid' : 'pending'}">${b.payment_status || 'Unpaid'}</span>
                            </p>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                        <span class="badge ${b.status.toLowerCase().replace(/\s+/g, '-')}">${b.status}</span>
                        ${dueBadge}
                    </div>
                </div>

                <!-- Status Timeline -->
                ${buildStatusTimeline(b.status)}

                <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:1rem; border-top:1px solid var(--color-border); padding-top:1rem;">
                    ${actionButtons}
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/** Render past/completed booking history */
function renderBookingHistory(user) {
    const container = document.getElementById('booking-history-list');
    if (!container) return;

    const allBookings = liveBookings || getBookings().filter(b => (b.customer_id === user.user_id || b.customer === user.user_id));
    const historyBookings = allBookings.filter(b =>
        b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'Rejected'
    );

    if (historyBookings.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:1.5rem;">No past rental history yet.</p>';
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr>
                    <th>Booking ID</th>
                    <th>Product</th>
                    <th>Dates</th>
                    <th>Total</th>
                    <th>Late Fee</th>
                    <th>Status</th>
                    <th>Review</th>
                </tr>
            </thead>
            <tbody>
    `;

    historyBookings.forEach(b => {
        let product = null;
        if (b.productTitle && b.productTitle !== 'Product') {
            product = { title: b.productTitle };
        } else {
            product = getProducts().find(p => p.product_id === b.product_id || p._id === b.product_id);
        }

        const reviewed = hasUserReviewedBooking(b.booking_id);

        let reviewAction = '-';
        if (b.status === 'Completed') {
            if (reviewed) {
                reviewAction = `<span class="badge accepted">Reviewed ✓</span>`;
            } else {
                reviewAction = `<button class="btn primary write-review-btn" data-bid="${b.booking_id}" data-pid="${b.product_id}" style="font-size:0.8rem; padding:0.3rem 0.65rem;">★ Write Review</button>`;
            }
        }

        html += `
            <tr>
                <td style="font-size:0.85rem;">${b.booking_id}</td>
                <td><strong>${product ? product.title : '—'}</strong></td>
                <td style="font-size:0.88rem;">${b.start_date} → ${b.end_date}</td>
                <td style="color:var(--color-secondary); font-weight:700;">₹${b.total_price}</td>
                <td style="color:${b.late_fee > 0 ? '#FB7185' : 'var(--color-text-muted)'}; font-weight:600;">${b.late_fee > 0 ? `₹${b.late_fee}` : '₹0'}</td>
                <td><span class="badge ${b.status.toLowerCase()}">${b.status}</span></td>
                <td>${reviewAction}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

/** Render wishlist items */
function renderWishlist(user) {
    const container = document.getElementById('wishlist-list');
    if (!container) return;

    if (liveWishlist) {
        if (liveWishlist.length === 0) {
            container.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Your wishlist is currently empty.</p>';
            return;
        }
        container.innerHTML = '';
        liveWishlist.forEach(w => {
            const card = document.createElement('div');
            card.className = 'product-card card';
            card.innerHTML = `
                <img src="${w.image}" alt="${w.title}" style="width:100%; height:160px; object-fit:cover; border-radius:0.4rem;" />
                <h4 style="margin:0.75rem 0 0.35rem; color:var(--color-text-primary); font-size:1.1rem;">${w.title}</h4>
                <p style="margin:0.25rem 0; color:var(--color-secondary); font-weight:700;">₹${w.price_per_day}/day <span style="color:var(--color-text-secondary); font-weight:400;">• ${w.category}</span></p>
                <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <a href="product-details.html?id=${w.product_id}" class="btn primary" style="flex:1; text-align:center;">View Details</a>
                    <button class="btn remove-wish-btn" data-pid="${w.product_id}" data-wid="${w.wishlist_id}">Remove</button>
                </div>
            `;
            container.appendChild(card);
        });
        return;
    }

    const wishes = getWishlists().filter(w => w.customer_id === user.user_id);
    if (wishes.length === 0) {
        container.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Your wishlist is currently empty.</p>';
        return;
    }

    container.innerHTML = '';
    wishes.forEach(w => {
        const product = getProducts().find(p => p.product_id === w.product_id);
        if (!product) return;
        const card = document.createElement('div');
        card.className = 'product-card card';
        card.innerHTML = `
            <img src="${product.image}" alt="${product.title}" style="width:100%; height:160px; object-fit:cover; border-radius:0.4rem;" />
            <h4 style="margin:0.75rem 0 0.35rem; color:var(--color-text-primary); font-size:1.1rem;">${product.title}</h4>
            <p style="margin:0.25rem 0; color:var(--color-secondary); font-weight:700;">₹${product.price_per_day}/day <span style="color:var(--color-text-secondary); font-weight:400;">• ${product.category}</span></p>
            <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                <a href="product-details.html?id=${product.product_id}" class="btn primary" style="flex:1; text-align:center;">View Details</a>
                <button class="btn remove-wish-btn" data-pid="${product.product_id}" data-wid="${w.wishlist_id}">Remove</button>
            </div>
        `;
        container.appendChild(card);
    });
}

/** Render notifications center list in Customer Dashboard */
function renderCustomerNotifications(user) {
    const container = document.getElementById('cust-notifications-list');
    if (!container) return;

    const notifs = liveNotifications || getUserNotifications(user.user_id);
    if (notifs.length === 0) {
        container.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.9rem; margin:0;">No notifications received yet.</p>';
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:0.5rem;">';
    notifs.forEach(n => {
        html += `
            <div class="notif-item ${n.read ? 'read' : 'unread'}" data-nid="${n.notification_id}" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div>${n.message}</div>
                    <div class="notif-time">${new Date(n.date).toLocaleString()}</div>
                </div>
                ${!n.read ? `<span class="badge" style="background:var(--color-primary); color:#fff; font-size:0.65rem;">NEW</span>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/** Show Write Review Modal */
function openReviewModal(bookingId, productId, user) {
    const modalContainer = document.getElementById('customer-modal-container');
    const product = getProducts().find(p => p.product_id === productId || p._id === productId);
    const title = product ? product.title : 'Product';
    if (!modalContainer) return;

    modalContainer.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-box">
                <button class="modal-close-btn" id="modal-close-btn">&times;</button>
                <h3 style="margin-bottom:0.5rem; color:var(--color-secondary);">Rate & Review Product</h3>
                <div id="modal-error-msg" style="margin-bottom:0.5rem; font-size:0.85rem;"></div>
                <p style="color:var(--color-text-secondary); font-size:0.9rem; margin-bottom:1.25rem;">
                    ${title} (Booking #${bookingId})
                </p>

                <form id="dashboard-review-form" class="auth-form" style="max-width:100%;">
                    <label>Rating (1-5 Stars):
                        <select id="modal-review-rating" style="width:100%; margin-top:0.35rem;" required>
                            <option value="5">5 ★★★★★ (Excellent)</option>
                            <option value="4">4 ★★★★☆ (Good)</option>
                            <option value="3">3 ★★★☆☆ (Average)</option>
                            <option value="2">2 ★★☆☆☆ (Below Average)</option>
                            <option value="1">1 ★☆☆☆☆ (Poor)</option>
                        </select>
                    </label>

                    <label style="margin-top:0.75rem;">Your Feedback:
                        <textarea id="modal-review-comment" rows="4" placeholder="How did the product perform during your rental?" style="width:100%; margin-top:0.35rem;" required></textarea>
                    </label>

                    <div style="display:flex; gap:0.75rem; margin-top:1.25rem; justify-content:flex-end;">
                        <button type="button" class="btn" id="modal-cancel-btn">Cancel</button>
                        <button type="submit" class="btn primary">Submit Review</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('modal-close-btn').onclick = () => { modalContainer.innerHTML = ''; };
    document.getElementById('modal-cancel-btn').onclick = () => { modalContainer.innerHTML = ''; };

    document.getElementById('dashboard-review-form').onsubmit = async (e) => {
        e.preventDefault();
        const rating = parseInt(document.getElementById('modal-review-rating').value, 10);
        const comment = document.getElementById('modal-review-comment').value.trim();
        const errEl = document.getElementById('modal-error-msg');

        try {
            await api.post('/reviews', {
                product_id: productId,
                booking_id: bookingId,
                rating,
                comment
            });
            modalContainer.innerHTML = '';
            alert('Review submitted successfully!');
            await initDashboard();
        } catch (err) {
            // local fallback
            addReview({
                review_id: genId('review'),
                booking_id: bookingId,
                product_id: productId,
                customer_id: user.user_id,
                rating,
                comment,
                review_date: new Date().toISOString()
            });
            modalContainer.innerHTML = '';
            alert('Review recorded.');
            await initDashboard();
        }
    };
}

/** Setup event delegation */
function setupEventListeners(user) {
    const activeList = document.getElementById('active-bookings-list');
    if (activeList) {
        activeList.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const bid = btn.dataset.id;

            if (btn.classList.contains('cancel-btn')) {
                if (confirm('Are you sure you want to cancel this booking request?')) {
                    try {
                        await api.patch(`/bookings/${bid}/cancel`);
                    } catch (err) {
                        // local fallback
                        const booking = getBookings().find(b => b.booking_id === bid);
                        if (booking) {
                            booking.status = 'Cancelled';
                            updateBooking(booking);
                        }
                    }
                    await initDashboard();
                }
            } else if (btn.classList.contains('return-req-btn')) {
                if (confirm('Confirm product return request? The owner will verify and confirm return.')) {
                    try {
                        await api.patch(`/bookings/${bid}/request-return`);
                    } catch (err) {
                        // local fallback
                        const booking = getBookings().find(b => b.booking_id === bid);
                        if (booking) {
                            booking.status = 'Return Requested';
                            updateBooking(booking);
                        }
                    }
                    await initDashboard();
                }
            }
        });
    }

    const historyList = document.getElementById('booking-history-list');
    if (historyList) {
        historyList.addEventListener('click', (e) => {
            const btn = e.target.closest('.write-review-btn');
            if (!btn) return;
            const bid = btn.dataset.bid;
            const pid = btn.dataset.pid;
            openReviewModal(bid, pid, user);
        });
    }

    const wishlistList = document.getElementById('wishlist-list');
    if (wishlistList) {
        wishlistList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.remove-wish-btn');
            if (!btn) return;
            const pid = btn.dataset.pid;
            const wid = btn.dataset.wid;
            if (confirm('Remove item from wishlist?')) {
                try {
                    if (pid) await api.delete(`/wishlists/${pid}`);
                } catch (e) {
                    // local fallback
                }
                if (wid) removeFromWishlist(wid);
                await initDashboard();
            }
        });
    }

    const notifsContainer = document.getElementById('cust-notifications-list');
    if (notifsContainer) {
        notifsContainer.addEventListener('click', async (e) => {
            const item = e.target.closest('.notif-item');
            if (!item) return;
            const nid = item.dataset.nid;
            try {
                await api.patch(`/notifications/${nid}/read`);
            } catch (e) {
                markNotificationRead(nid);
            }
            await initDashboard();
            syncNavbarAuth();
        });
    }

    const markAllBtn = document.getElementById('cust-mark-all-read');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                await api.patch('/notifications/read-all');
            } catch (e) {
                markAllNotificationsRead(user.user_id);
            }
            await initDashboard();
            syncNavbarAuth();
        });
    }
}

/** Initialise Dashboard */
export async function initDashboard() {
    const user = protectRoute();
    if (!user) return;

    syncNavbarAuth();
    await fetchCustomerData(user);
    renderStats(user);
    renderActiveBookings(user);
    renderBookingHistory(user);
    renderWishlist(user);
    renderCustomerNotifications(user);
    setupEventListeners(user);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        initDashboard();
    } else {
        document.addEventListener('DOMContentLoaded', initDashboard);
    }
}
