// js/owner.js
// Owner dashboard logic: real-time metrics, product performance tracking,
// booking lifecycle management, return confirmation with late fee calculation.
// Integrated with Express / MongoDB API with resilient offline fallback.

import { getCurrentUser, syncNavbarAuth, verifyBackendSession } from "./auth.js";
import {
    getProducts, addProduct, updateProduct, deleteProduct,
    getBookings, updateBooking, getUsers, genId,
    calculateLateFee, addNotification, getProductReviews
} from "./storage.js";
import { api, getStoredToken } from "./api.js";

let liveOwnerProducts = null;
let liveOwnerBookings = null;

/*** Route protection ***/
function protectRoute() {
    const user = getCurrentUser();
    if (!user || !getStoredToken() || user.role !== "owner") {
        window.location.href = "login.html";
        return null;
    }
    return user;
}

/*** Form State ***/
let editMode = false;
let editProductId = null;

function resetForm() {
    const form = document.getElementById("add-product-form");
    if (form) form.reset();
    document.getElementById("add-product-message").textContent = "";
    editMode = false;
    editProductId = null;

    const submitBtn = document.getElementById("submit-prod-btn");
    if (submitBtn) submitBtn.textContent = "Add Product to Marketplace";

    const heading = document.getElementById("form-heading");
    if (heading) heading.textContent = "Add New Product";

    const cancelBtn = document.getElementById("cancel-edit-btn");
    if (cancelBtn) cancelBtn.style.display = "none";
}

/*** Fetch live owner data ***/
async function fetchOwnerData(user) {
    if (!getStoredToken()) return;
    try {
        const [pRes, bRes] = await Promise.allSettled([
            api.get('/products/owner/listings'),
            api.get('/bookings/my')
        ]);

        if (pRes.status === 'fulfilled' && pRes.value && pRes.value.success) {
            liveOwnerProducts = pRes.value.products.map(p => ({
                product_id: p._id || p.product_id,
                _id: p._id,
                title: p.title,
                description: p.description,
                category: p.category,
                price_per_day: p.price_per_day,
                image: p.image,
                availability: p.availability,
                approval_status: p.approval_status || 'pending',
                rating: p.rating || 0
            }));
        }

        if (bRes.status === 'fulfilled' && bRes.value && bRes.value.success) {
            liveOwnerBookings = bRes.value.bookings.map(b => ({
                booking_id: b._id || b.booking_id,
                _id: b._id,
                customer_id: b.customer ? (b.customer._id || b.customer) : '',
                customerName: b.customer && b.customer.name ? b.customer.name : 'Customer',
                customerEmail: b.customer && b.customer.email ? b.customer.email : '',
                product_id: b.product ? (b.product._id || b.product) : '',
                productTitle: b.product && b.product.title ? b.product.title : 'Product',
                start_date: b.start_date ? b.start_date.split('T')[0] : '',
                end_date: b.end_date ? b.end_date.split('T')[0] : '',
                total_price: b.total_price,
                late_fee: b.late_fee || 0,
                status: b.status,
                payment_status: b.payment_status || 'Unpaid',
                created_at: b.createdAt
            }));
        }
    } catch (e) {
        // Fall back to storage
    }
}

/*** Summary Metrics ***/
function renderSummaryMetrics(user) {
    const ownerProducts = liveOwnerProducts || getProducts().filter(p => p.owner_id === user.user_id || p.owner === user.user_id);
    const ownerProductIds = new Set(ownerProducts.map(p => p.product_id || p._id));

    const ownerBookings = liveOwnerBookings || getBookings().filter(b => ownerProductIds.has(b.product_id || b.product));

    const totalListed = ownerProducts.length;
    const pendingRequests = ownerBookings.filter(b => b.status === "Requested" || b.status === "Pending").length;
    const activeRentals = ownerBookings.filter(b => b.status === "Active Rental" || b.status === "Return Requested").length;
    const completedRentals = ownerBookings.filter(b => b.status === "Completed").length;

    const totalEarnings = ownerBookings.reduce((sum, b) => {
        if (["Paid", "Active Rental", "Return Requested", "Completed"].includes(b.status)) {
            return sum + (Number(b.total_price) || 0) + (Number(b.late_fee) || 0);
        }
        return sum;
    }, 0);

    const elTotal = document.getElementById("owner-total-products");
    const elPending = document.getElementById("owner-pending-requests");
    const elActive = document.getElementById("owner-active-rentals");
    const elCompleted = document.getElementById("owner-completed-rentals");
    const elEarnings = document.getElementById("owner-total-earnings");

    if (elTotal) elTotal.textContent = totalListed;
    if (elPending) elPending.textContent = pendingRequests;
    if (elActive) elActive.textContent = activeRentals;
    if (elCompleted) elCompleted.textContent = completedRentals;
    if (elEarnings) elEarnings.textContent = `₹${totalEarnings.toLocaleString('en-IN')}`;

    const countLabel = document.getElementById("owner-prod-count");
    if (countLabel) countLabel.textContent = `${totalListed} item${totalListed === 1 ? '' : 's'} listed`;
}

/*** Product Performance Table ***/
function renderProductPerformance(user) {
    const container = document.getElementById("product-performance-container");
    if (!container) return;

    const ownerProducts = liveOwnerProducts || getProducts().filter(p => p.owner_id === user.user_id || p.owner === user.user_id);
    const allBookings = liveOwnerBookings || getBookings();

    if (ownerProducts.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">You have not listed any products yet. Use the form below to add your first item!</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:680px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">Product</th>
                    <th style="padding:0.75rem 0.5rem;">Category</th>
                    <th style="padding:0.75rem 0.5rem;">Daily Rate</th>
                    <th style="padding:0.75rem 0.5rem;">Times Rented</th>
                    <th style="padding:0.75rem 0.5rem;">Total Revenue</th>
                    <th style="padding:0.75rem 0.5rem;">Marketplace Status</th>
                    <th style="padding:0.75rem 0.5rem; text-align:right;">Quick Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    ownerProducts.forEach(p => {
        const pid = p.product_id || p._id;
        const prodBookings = allBookings.filter(b => (b.product_id === pid || b.product === pid) && !["Cancelled", "Rejected"].includes(b.status));
        const timesRented = prodBookings.length;
        const revenue = prodBookings.reduce((sum, b) => {
            if (["Paid", "Active Rental", "Return Requested", "Completed"].includes(b.status)) {
                return sum + (Number(b.total_price) || 0) + (Number(b.late_fee) || 0);
            }
            return sum;
        }, 0);

        const approvalBadge = p.approval_status === "rejected"
            ? `<span class="badge rejected" style="font-size:0.75rem;">Rejected by Admin</span>`
            : p.approval_status === "pending"
            ? `<span class="badge" style="background:rgba(251,191,36,0.15); color:#FBBF24; font-size:0.75rem;">Pending Approval</span>`
            : `<span class="badge approved" style="font-size:0.75rem;">Approved</span>`;

        const availBadge = p.availability
            ? `<span style="color:var(--color-secondary); font-size:0.85rem; font-weight:600;">● Available</span>`
            : `<span style="color:#FB7185; font-size:0.85rem; font-weight:600;">○ Unavailable</span>`;

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${p.image}" alt="${p.title}" style="width:40px; height:40px; object-fit:cover; border-radius:0.3rem;" />
                        <div>
                            <strong>${p.title}</strong>
                            <div style="font-size:0.75rem; color:var(--color-text-muted);">${pid}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:0.75rem 0.5rem;">${p.category}</td>
                <td style="padding:0.75rem 0.5rem; font-weight:600; color:var(--color-secondary);">₹${p.price_per_day}</td>
                <td style="padding:0.75rem 0.5rem;">${timesRented} rental${timesRented === 1 ? '' : 's'}</td>
                <td style="padding:0.75rem 0.5rem; font-weight:600;">₹${revenue.toLocaleString('en-IN')}</td>
                <td style="padding:0.75rem 0.5rem;">
                    <div style="display:flex; flex-direction:column; gap:0.25rem;">
                        <div>${approvalBadge}</div>
                        <div>${availBadge}</div>
                    </div>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right;">
                    <div style="display:inline-flex; gap:0.4rem;">
                        <button class="btn toggle-avail-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.35rem 0.6rem;">
                            ${p.availability ? 'Set Unavailable' : 'Set Available'}
                        </button>
                        <button class="btn primary edit-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.35rem 0.6rem;">Edit</button>
                        <button class="btn delete-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.35rem 0.6rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/*** Render Booking Requests & Active Rentals ***/
function renderBookingRequests(user) {
    const container = document.getElementById("booking-requests");
    if (!container) return;

    const requests = liveOwnerBookings || getBookings().filter(b => {
        const prod = getProducts().find(p => p.product_id === b.product_id && (p.owner_id === user.user_id || p.owner === user.user_id));
        return Boolean(prod);
    });

    if (requests.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding:1.5rem; text-align:center;">No booking requests received yet. Customer bookings will appear here.</p>`;
        return;
    }

    let html = `
        <table style="width:100%; border-collapse:collapse; min-width:750px;">
            <thead>
                <tr style="border-bottom:1px solid var(--color-border); text-align:left; font-size:0.85rem; color:var(--color-text-muted);">
                    <th style="padding:0.75rem 0.5rem;">Booking ID</th>
                    <th style="padding:0.75rem 0.5rem;">Customer</th>
                    <th style="padding:0.75rem 0.5rem;">Product</th>
                    <th style="padding:0.75rem 0.5rem;">Rental Dates</th>
                    <th style="padding:0.75rem 0.5rem;">Base Price</th>
                    <th style="padding:0.75rem 0.5rem;">Late Fee</th>
                    <th style="padding:0.75rem 0.5rem;">Status</th>
                    <th style="padding:0.75rem 0.5rem; text-align:right;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    requests.forEach(b => {
        const bId = b.booking_id || b._id;
        const customerName = b.customerName || 'Customer';
        const customerEmail = b.customerEmail || '';
        const productTitle = b.productTitle || 'Product';
        const statusClass = b.status.toLowerCase().replace(/\s+/g, '-');

        // Late fee calculation preview
        const feeInfo = calculateLateFee(b);
        let lateFeeDisplay = `—`;
        if (b.late_fee && b.late_fee > 0) {
            lateFeeDisplay = `<span style="color:#FB7185; font-weight:600;">+₹${b.late_fee}</span>`;
        } else if (["Active Rental", "Return Requested"].includes(b.status) && feeInfo.lateDays > 0) {
            lateFeeDisplay = `<span style="color:#FB7185; font-size:0.8rem; font-weight:600;">Est. +₹${feeInfo.lateFee} (${feeInfo.lateDays}d late)</span>`;
        }

        // Action buttons
        let actionsHtml = ``;
        if (b.status === "Requested" || b.status === "Pending") {
            actionsHtml = `
                <button class="btn primary accept-btn" data-id="${bId}" style="font-size:0.8rem; padding:0.35rem 0.65rem;">Accept</button>
                <button class="btn reject-btn" data-id="${bId}" style="font-size:0.8rem; padding:0.35rem 0.65rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Reject</button>
            `;
        } else if (b.status === "Accepted") {
            actionsHtml = `<span style="font-size:0.8rem; color:var(--color-text-muted);">Awaiting Payment</span>`;
        } else if (b.status === "Paid") {
            actionsHtml = `
                <div style="display:flex; flex-direction:column; gap:0.35rem; align-items:flex-end;">
                    <span style="font-size:0.8rem; color:var(--color-secondary); font-weight:600;">✔ Payment Confirmed</span>
                    <button class="btn secondary handover-btn" data-id="${bId}" style="font-size:0.78rem; padding:0.25rem 0.55rem;">
                        Handover Gear
                    </button>
                </div>
            `;
        } else if (b.status === "Active Rental" || b.status === "Return Requested") {
            actionsHtml = `
                <button class="btn primary confirm-return-btn" data-id="${bId}" style="font-size:0.8rem; padding:0.35rem 0.75rem; background:linear-gradient(135deg, #10B981, #059669);">
                    Confirm Return
                </button>
            `;
        } else if (b.status === "Completed") {
            actionsHtml = `<span style="font-size:0.8rem; color:var(--color-secondary);">✔ Successfully Returned</span>`;
        } else {
            actionsHtml = `<span style="font-size:0.8rem; color:var(--color-text-muted);">${b.status}</span>`;
        }

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem;">
                <td style="padding:0.75rem 0.5rem; font-family:monospace; font-size:0.85rem;">#${bId}</td>
                <td style="padding:0.75rem 0.5rem;">
                    <strong>${customerName}</strong>
                    <div style="font-size:0.75rem; color:var(--color-text-muted);">${customerEmail}</div>
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <strong>${productTitle}</strong>
                </td>
                <td style="padding:0.75rem 0.5rem;">
                    <div>${b.start_date}</div>
                    <div style="font-size:0.75rem; color:var(--color-text-muted);">to ${b.end_date}</div>
                </td>
                <td style="padding:0.75rem 0.5rem; font-weight:600;">₹${b.total_price}</td>
                <td style="padding:0.75rem 0.5rem;">${lateFeeDisplay}</td>
                <td style="padding:0.75rem 0.5rem;">
                    <span class="badge ${statusClass}">${b.status}</span>
                </td>
                <td style="padding:0.75rem 0.5rem; text-align:right;">
                    <div style="display:inline-flex; gap:0.4rem; justify-content:flex-end;">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

/*** Product Cards Grid ***/
function renderOwnerProducts(user) {
    const container = document.getElementById("owner-products");
    if (!container) return;

    const products = liveOwnerProducts || getProducts().filter(p => p.owner_id === user.user_id || p.owner === user.user_id);
    container.innerHTML = "";

    if (products.length === 0) {
        container.innerHTML = `<p class="empty-state" style="grid-column:1/-1;">No products listed yet.</p>`;
        return;
    }

    products.forEach(p => {
        const pid = p.product_id || p._id;
        const card = document.createElement("div");
        card.className = "product-card card";
        card.innerHTML = `
            <img src="${p.image}" alt="${p.title}" style="width:100%; height:160px; object-fit:cover; border-radius:0.4rem;" />
            <div style="margin-top:0.75rem; display:flex; justify-content:space-between; align-items:flex-start;">
                <h4 style="margin:0; font-size:1.1rem; color:var(--color-text-primary);">${p.title}</h4>
                <span class="badge ${p.approval_status === 'rejected' ? 'rejected' : (p.approval_status === 'pending' ? 'due-soon' : 'approved')}" style="font-size:0.75rem;">${p.approval_status || 'approved'}</span>
            </div>
            <p style="margin:0.25rem 0; font-size:0.85rem; color:var(--color-text-secondary); line-height:1.4;">${p.description}</p>
            <p style="margin:0.25rem 0; font-size:0.85rem; color:var(--color-text-muted);">Category: <strong>${p.category}</strong></p>
            <p style="margin:0.4rem 0; font-weight:700; color:var(--color-secondary); font-size:1.05rem;">₹${p.price_per_day} <span style="font-size:0.8rem; font-weight:400; color:var(--color-text-muted);">/ day</span></p>
            <p style="margin:0.25rem 0; font-size:0.85rem; font-weight:600; color:${p.availability ? 'var(--color-secondary)' : '#FB7185'};">
                ${p.availability ? "● Available for Rent" : "○ Currently Unavailable"}
            </p>
            <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                <button class="btn toggle-avail-btn" data-id="${pid}" style="flex:1; font-size:0.8rem; padding:0.4rem 0.5rem;">
                    ${p.availability ? 'Set Unavailable' : 'Set Available'}
                </button>
                <button class="btn primary edit-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.4rem 0.75rem;">Edit</button>
                <button class="btn delete-btn" data-id="${pid}" style="font-size:0.8rem; padding:0.4rem 0.75rem; color:#FB7185; border-color:rgba(251,113,133,0.3);">Delete</button>
            </div>
        `;
        container.appendChild(card);
    });
}

/*** Form Submit Handler ***/
async function handleFormSubmit(event) {
    event.preventDefault();
    const title = document.getElementById("prod-title").value.trim();
    const desc = document.getElementById("prod-desc").value.trim();
    const category = document.getElementById("prod-category").value.trim();
    const price = Number(document.getElementById("prod-price").value);
    const availability = document.getElementById("prod-availability").checked;
    const image = document.getElementById("prod-image").value.trim();
    const msgDiv = document.getElementById("add-product-message");

    if (!title || !desc || !category || !image || isNaN(price) || price <= 0) {
        msgDiv.textContent = "Please fill all fields with valid information.";
        msgDiv.style.color = "#FB7185";
        return;
    }

    const user = getCurrentUser();
    if (!user) return;

    msgDiv.style.color = "var(--color-text-secondary)";
    msgDiv.textContent = "Saving product to backend...";

    if (editMode && editProductId) {
        try {
            await api.put(`/products/${editProductId}`, {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image
            });
            msgDiv.textContent = `Product "${title}" updated successfully!`;
            msgDiv.style.color = "var(--color-secondary)";
        } catch (err) {
            // fallback
            const existing = getProducts().find(p => p.product_id === editProductId);
            updateProduct({
                product_id: editProductId,
                owner_id: user.user_id,
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image,
                rating: existing ? existing.rating : 0,
                approval_status: existing && existing.approval_status ? existing.approval_status : 'approved'
            });
            msgDiv.textContent = `Product "${title}" updated in local storage.`;
            msgDiv.style.color = "var(--color-secondary)";
        }
    } else {
        try {
            const res = await api.post('/products', {
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image
            });
            msgDiv.textContent = `Product "${title}" submitted! It is now pending administrative approval.`;
            msgDiv.style.color = "var(--color-secondary)";
        } catch (err) {
            // fallback
            addProduct({
                product_id: genId('product'),
                owner_id: user.user_id,
                title,
                description: desc,
                category,
                price_per_day: price,
                availability,
                image,
                rating: 0,
                approval_status: 'pending'
            });
            msgDiv.textContent = `Product "${title}" added to local storage.`;
            msgDiv.style.color = "var(--color-secondary)";
        }
    }

    resetForm();
    await refreshAll(user);
}

/*** Action Listeners ***/
async function handleActionClicks(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const pid = btn.dataset.id;
    const user = getCurrentUser();
    if (!user) return;

    // 1. Edit Product
    if (btn.classList.contains('edit-btn')) {
        let product = (liveOwnerProducts || []).find(p => p.product_id === pid || p._id === pid);
        if (!product) product = getProducts().find(p => p.product_id === pid);
        if (!product) return;

        document.getElementById('prod-title').value = product.title;
        document.getElementById('prod-desc').value = product.description;
        document.getElementById('prod-category').value = product.category;
        document.getElementById('prod-price').value = product.price_per_day;
        document.getElementById('prod-availability').checked = product.availability;
        document.getElementById('prod-image').value = product.image;

        editMode = true;
        editProductId = pid;

        const heading = document.getElementById('form-heading');
        if (heading) heading.textContent = `Edit Product: ${product.title}`;

        const submitBtn = document.getElementById('submit-prod-btn');
        if (submitBtn) submitBtn.textContent = 'Save Product Changes';

        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        const section = document.getElementById('add-product-section');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
    }

    // 2. Delete Product
    else if (btn.classList.contains('delete-btn')) {
        let product = (liveOwnerProducts || []).find(p => p.product_id === pid || p._id === pid);
        if (!product) product = getProducts().find(p => p.product_id === pid);
        const title = product ? product.title : 'this product';

        if (confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
            try {
                await api.delete(`/products/${pid}`);
            } catch (err) {
                deleteProduct(pid);
            }
            await refreshAll(user);
        }
    }

    // 3. Quick Toggle Availability
    else if (btn.classList.contains('toggle-avail-btn')) {
        let product = (liveOwnerProducts || []).find(p => p.product_id === pid || p._id === pid);
        if (!product) product = getProducts().find(p => p.product_id === pid);
        if (!product) return;

        const newAvail = !product.availability;
        try {
            await api.put(`/products/${pid}`, { availability: newAvail });
        } catch (err) {
            product.availability = newAvail;
            updateProduct(product);
        }
        await refreshAll(user);
    }

    // 4. Accept Booking Request
    else if (btn.classList.contains('accept-btn')) {
        try {
            await api.patch(`/bookings/${pid}/accept`);
            alert(`Booking accepted! Customer has been notified to proceed with payment.`);
        } catch (err) {
            const booking = getBookings().find(b => b.booking_id === pid);
            if (booking) {
                booking.status = 'Accepted';
                updateBooking(booking);
            }
            alert(`Booking accepted in local storage.`);
        }
        await refreshAll(user);
    }

    // 5. Reject Booking Request
    else if (btn.classList.contains('reject-btn')) {
        if (!confirm(`Reject this booking request?`)) return;
        try {
            await api.patch(`/bookings/${pid}/reject`);
        } catch (err) {
            const booking = getBookings().find(b => b.booking_id === pid);
            if (booking) {
                booking.status = 'Rejected';
                updateBooking(booking);
            }
        }
        await refreshAll(user);
    }

    // 5b. Equipment Handover (Paid -> Active Rental)
    else if (btn.classList.contains('handover-btn')) {
        try {
            await api.patch(`/bookings/${pid}/handover`);
            alert(`Equipment handover confirmed! Rental is now Active.`);
        } catch (err) {
            const booking = getBookings().find(b => b.booking_id === pid);
            if (booking) {
                booking.status = 'Active Rental';
                updateBooking(booking);
            }
            alert(`Equipment marked as handed over in local storage.`);
        }
        await refreshAll(user);
    }

    // 6. Confirm Return & Late Fee Calculation
    else if (btn.classList.contains('confirm-return-btn')) {
        if (!confirm(`Confirm product return upon receipt?`)) return;
        try {
            const res = await api.patch(`/bookings/${pid}/return`);
            const fee = res.booking ? res.booking.late_fee : 0;
            alert(`Return confirmed!${fee > 0 ? ` Late fee of ₹${fee} recorded.` : ' No late fee assessed.'}`);
        } catch (err) {
            const booking = getBookings().find(b => b.booking_id === pid);
            if (booking) {
                const feeInfo = calculateLateFee(booking);
                booking.status = 'Completed';
                booking.late_fee = feeInfo.lateFee;
                booking.return_date = new Date().toISOString();
                updateBooking(booking);
            }
            alert(`Return recorded in local storage.`);
        }
        await refreshAll(user);
    }
}

async function refreshAll(user) {
    await fetchOwnerData(user);
    renderSummaryMetrics(user);
    renderProductPerformance(user);
    renderBookingRequests(user);
    renderOwnerProducts(user);
}

/*** Initialization ***/
export async function init() {
    const user = protectRoute();
    if (!user) return;

    syncNavbarAuth();

    const nameSpan = document.getElementById("owner-name");
    if (nameSpan) nameSpan.textContent = user.name;

    await refreshAll(user);

    const form = document.getElementById("add-product-form");
    if (form) form.addEventListener("submit", handleFormSubmit);

    const cancelBtn = document.getElementById("cancel-edit-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", resetForm);

    document.addEventListener("click", handleActionClicks);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
}
