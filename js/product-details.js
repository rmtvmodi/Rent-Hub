// js/product-details.js
// Loads product from backend API (with storage fallback), displays details & verified reviews,
// handles wishlist toggles, and submits booking requests.

import {
    getProducts, getUsers, getWishlists, addToWishlist, removeFromWishlist,
    genId, addBooking, getBookings, addReview, getProductReviews,
    getProductAverageRating, checkBookingOverlap, addNotification, hasUserReviewedBooking
} from "./storage.js";
import { getCurrentUser, syncNavbarAuth } from "./auth.js";
import { api, getStoredToken } from "./api.js";

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

let currentProduct = null;
let currentRatingStats = null;
let currentReviews = [];

/** Render product information */
function renderProduct(product, ratingStats = null, reviews = []) {
    currentProduct = product;
    currentRatingStats = ratingStats;
    currentReviews = reviews;

    const container = document.getElementById('product-detail');
    if (!container) return;

    const pid = product.product_id || product._id;
    let ownerName = 'Verified Lender';
    if (product.owner && typeof product.owner === 'object' && product.owner.name) {
        ownerName = product.owner.name;
    } else {
        const owner = getUsers().find(u => u.user_id === (product.owner_id || product.owner));
        if (owner) ownerName = owner.name;
    }

    let ratingText = 'No reviews yet';
    if (ratingStats && ratingStats.text) {
        ratingText = ratingStats.text;
    } else if (product.numReviews > 0) {
        ratingText = `${product.rating} ★ (${product.numReviews})`;
    } else {
        const r = getProductAverageRating(pid);
        ratingText = r.text;
    }

    const isAvailable = product.availability && product.approval_status !== 'rejected';
    const todayStr = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:2.5rem; align-items:flex-start;">
            <div style="flex:1; min-width:280px; max-width:420px;">
                <img src="${product.image}" alt="${product.title}" style="width:100%; max-height:360px; object-fit:cover; border-radius:var(--radius-lg); border:1px solid var(--color-border); box-shadow:var(--color-card-shadow);" />
                <div id="wishlist-section" style="margin-top:1.25rem;"></div>
            </div>
            
            <div style="flex:2; min-width:280px;">
                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.5rem;">
                    <span class="badge" style="background:rgba(124, 108, 242, 0.15); color:var(--color-primary); border:1px solid rgba(124, 108, 242, 0.3);">${product.category}</span>
                    <span class="badge ${isAvailable ? 'accepted' : 'rejected'}">${isAvailable ? '● Available for Rent' : '○ Currently Unavailable'}</span>
                    <span style="color:var(--color-secondary); font-size:0.9rem; font-weight:600;">${ratingText}</span>
                </div>

                <h1 style="font-size:2rem; margin-bottom:0.75rem;">${product.title}</h1>
                <p style="font-size:1.4rem; color:var(--color-secondary); font-weight:700; margin-bottom:1rem;">₹${product.price_per_day} <span style="font-size:0.95rem; font-weight:400; color:var(--color-text-secondary);">/ day</span></p>
                
                <div style="background:var(--color-surface); padding:1rem 1.25rem; border-radius:var(--radius); border:1px solid var(--color-border); margin-bottom:1.5rem;">
                    <p style="margin:0 0 0.4rem; font-size:0.9rem;"><strong>Lender:</strong> ${ownerName}</p>
                    <p style="margin:0; font-size:0.95rem; color:var(--color-text-secondary); line-height:1.6;">${product.description}</p>
                </div>

                <!-- Booking Box -->
                <div class="card" style="background:var(--color-surface); border:1px solid var(--color-border); padding:1.5rem; margin-bottom:2rem;">
                    <h3 style="margin-bottom:1rem; color:var(--color-secondary);">Reserve This Product</h3>
                    <div id="booking-alert-msg" style="margin-bottom:0.75rem; font-size:0.9rem; font-weight:500;"></div>
                    ${!isAvailable ? `<p style="color:#FB7185; font-weight:500;">This product is currently unavailable for new rental bookings.</p>` : `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <label>Start Date:
                                <input type="date" id="start-date" min="${todayStr}" style="width:100%; margin-top:0.35rem;" />
                            </label>
                            <label>End Date:
                                <input type="date" id="end-date" min="${todayStr}" style="width:100%; margin-top:0.35rem;" />
                            </label>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                            <span id="days-info" style="font-size:0.95rem; color:var(--color-text-secondary);"></span>
                            <span id="total-price" style="font-weight:700; font-size:1.25rem; color:var(--color-secondary);"></span>
                        </div>
                        <button id="book-btn" class="btn primary" style="width:100%;">Submit Booking Request</button>
                    `}
                </div>

                <!-- Reviews Section -->
                <section id="reviews-section" style="margin-top:2.5rem;">
                    <h3 style="margin-bottom:1rem;">Customer Reviews & Ratings</h3>
                    <div id="reviews-list"></div>
                </section>
            </div>
        </div>
    `;

    // Wishlist button
    const wlDiv = document.getElementById('wishlist-section');
    const user = getCurrentUser();
    if (user && user.role === 'customer') {
        const inWishlist = getWishlists().some(w => w.customer_id === user.user_id && w.product_id === pid);
        wlDiv.innerHTML = `<button id="wishlist-btn" class="btn" style="width:100%;">${inWishlist ? '♥ Remove from Wishlist' : '♡ Add to Wishlist'}</button>`;
        document.getElementById('wishlist-btn').addEventListener('click', () => toggleWishlist(pid, inWishlist));
    } else if (!user) {
        wlDiv.innerHTML = '<p style="font-size:0.88rem; text-align:center;"><a href="login.html">Log in</a> to save this to your wishlist.</p>';
    }

    if (isAvailable) {
        const bookBtn = document.getElementById('book-btn');
        if (bookBtn) bookBtn.addEventListener('click', () => attemptBooking(product));

        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');

        if (startDateInput && endDateInput) {
            startDateInput.addEventListener('change', () => {
                endDateInput.min = startDateInput.value;
                updatePrice(product);
            });
            endDateInput.addEventListener('change', () => updatePrice(product));
        }
    }

    renderReviews(product, reviews);
}

async function toggleWishlist(productId, currentlyIn) {
    const user = getCurrentUser();
    if (!user) { alert('Please log in first.'); return; }

    try {
        if (currentlyIn) {
            await api.delete(`/wishlists/${productId}`);
        } else {
            await api.post('/wishlists', { product_id: productId });
        }
    } catch (e) {
        // Fallback
    }

    if (currentlyIn) {
        const wl = getWishlists().find(w => w.customer_id === user.user_id && w.product_id === productId);
        if (wl) removeFromWishlist(wl.wishlist_id);
    } else {
        addToWishlist({ wishlist_id: genId('wishlist'), customer_id: user.user_id, product_id: productId });
    }
    renderProduct(currentProduct, currentRatingStats, currentReviews);
}

function updatePrice(product) {
    const start = document.getElementById('start-date')?.value;
    const end = document.getElementById('end-date')?.value;
    const daysInfo = document.getElementById('days-info');
    const totalPriceEl = document.getElementById('total-price');
    if (!daysInfo || !totalPriceEl) return;

    if (!start || !end) {
        daysInfo.textContent = '';
        totalPriceEl.textContent = '';
        return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) {
        daysInfo.textContent = 'End date cannot precede start date.';
        totalPriceEl.textContent = '';
        return;
    }
    const diffTime = endDate.getTime() - startDate.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    daysInfo.textContent = `Duration: ${days} day${days > 1 ? 's' : ''}`;
    const total = product.price_per_day * days;
    totalPriceEl.textContent = `Estimated Total: ₹${total}`;
}

async function attemptBooking(product) {
    const user = getCurrentUser();
    const alertDiv = document.getElementById('booking-alert-msg');
    const bookBtn = document.getElementById('book-btn');

    if (!user) {
        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = 'Please log in as a Customer to submit a booking.';
        } else {
            alert('Please log in as a Customer to submit a booking.');
        }
        window.location.href = 'login.html';
        return;
    }
    if (user.role !== 'customer') {
        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = 'Only customer accounts can rent products. Please log in with a customer account.';
        } else {
            alert('Only customer accounts can rent products.');
        }
        return;
    }

    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    if (!start || !end) {
        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = 'Please select both rental start and end dates.';
        }
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (start < todayStr) {
        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = 'Rental start date cannot be in the past.';
        }
        return;
    }
    if (end < start) {
        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = 'Rental end date cannot precede the start date.';
        }
        return;
    }

    if (alertDiv) {
        alertDiv.style.color = 'var(--color-text-secondary)';
        alertDiv.textContent = 'Submitting reservation request to backend...';
    }
    if (bookBtn) bookBtn.disabled = true;

    const pid = product._id || product.product_id;

    try {
        const res = await api.post('/bookings', {
            product_id: pid,
            start_date: start,
            end_date: end
        });

        if (res && res.success && res.booking) {
            // Also store locally for offline access
            const newBooking = {
                booking_id: res.booking._id || res.booking.booking_id,
                customer_id: user.user_id,
                product_id: pid,
                start_date: start,
                end_date: end,
                total_price: res.booking.total_price,
                status: 'Requested',
                payment_status: 'Unpaid',
                created_at: new Date().toISOString()
            };
            addBooking(newBooking);

            if (alertDiv) {
                alertDiv.style.color = 'var(--color-secondary)';
                alertDiv.textContent = 'Booking request submitted successfully! Redirecting...';
            }
            setTimeout(() => {
                window.location.href = 'customer-dashboard.html';
            }, 1000);
            return;
        }
    } catch (err) {
        if (bookBtn) bookBtn.disabled = false;

        // If backend is offline, support offline booking fallback
        if (err.isNetworkError) {
            const overlapResult = checkBookingOverlap(pid, start, end);
            if (overlapResult.overlap) {
                if (alertDiv) {
                    alertDiv.style.color = '#FB7185';
                    alertDiv.textContent = `Selected dates conflict with an existing rental (${overlapResult.conflict.start_date} to ${overlapResult.conflict.end_date}). Please select other dates.`;
                }
                return;
            }

            const startDate = new Date(start);
            const endDate = new Date(end);
            const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const total = product.price_per_day * days;

            const booking = {
                booking_id: genId('booking'),
                customer_id: user.user_id,
                product_id: pid,
                start_date: start,
                end_date: end,
                total_price: total,
                status: 'Requested',
                payment_status: 'Unpaid',
                created_at: new Date().toISOString()
            };
            addBooking(booking);

            if (alertDiv) {
                alertDiv.style.color = 'var(--color-secondary)';
                alertDiv.textContent = 'Booking recorded locally (Backend offline). Redirecting...';
            }
            setTimeout(() => {
                window.location.href = 'customer-dashboard.html';
            }, 1000);
            return;
        }

        if (alertDiv) {
            alertDiv.style.color = '#FB7185';
            alertDiv.textContent = err.message || 'Failed to submit booking. Please try again.';
        }
    }
}

function renderReviews(product, reviewsList = []) {
    const container = document.getElementById('reviews-list');
    if (!container) return;

    const pid = product.product_id || product._id;
    let reviews = reviewsList;
    if (!reviews || reviews.length === 0) {
        reviews = getProductReviews(pid);
    }

    let html = '';
    if (!reviews || reviews.length === 0) {
        html = '<p class="empty-state" style="padding:1.5rem;">No reviews yet for this product.</p>';
    } else {
        html = '<div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.5rem;">';
        reviews.forEach(r => {
            let reviewerName = 'Verified Customer';
            if (r.customer && typeof r.customer === 'object' && r.customer.name) {
                reviewerName = r.customer.name;
            } else {
                const reviewer = getUsers().find(u => u.user_id === (r.customer_id || r.customer));
                if (reviewer) reviewerName = reviewer.name;
            }
            const dateStr = (r.createdAt || r.review_date) ? new Date(r.createdAt || r.review_date).toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' }) : '';
            html += `
                <div class="card" style="padding:1rem 1.25rem; background:var(--color-surface); border:1px solid var(--color-border);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                        <strong style="color:var(--color-text-primary); font-size:0.95rem;">${reviewerName}</strong>
                        <span style="color:var(--color-secondary); font-weight:700;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} (${r.rating}/5)</span>
                    </div>
                    <p style="margin:0.25rem 0 0; color:var(--color-text-secondary); font-size:0.9rem;">${r.comment}</p>
                    <span style="font-size:0.75rem; color:var(--color-text-muted);">${dateStr}</span>
                </div>
            `;
        });
        html += '</div>';
    }

    // Check if logged-in customer is eligible to review
    const current = getCurrentUser();
    if (current && current.role === 'customer') {
        const completedBookings = getBookings().filter(b =>
            (b.customer_id === current.user_id || b.customer === current.user_id) &&
            (b.product_id === pid || b.product === pid) &&
            b.status === 'Completed'
        );

        const eligibleBooking = completedBookings.find(b => !hasUserReviewedBooking(b.booking_id || b._id));

        if (eligibleBooking) {
            const bId = eligibleBooking.booking_id || eligibleBooking._id;
            html += `
                <div class="card" style="background:var(--color-surface-card); border:1px solid var(--color-border); padding:1.25rem; margin-top:1.5rem;">
                    <h4 style="margin-bottom:0.75rem; color:var(--color-secondary);">Leave a Review (Verified Renter)</h4>
                    <div id="review-post-msg" style="margin-bottom:0.5rem; font-size:0.85rem;"></div>
                    <p style="font-size:0.85rem; color:var(--color-text-secondary); margin-bottom:0.75rem;">You completed Rental #${bId}. Share your feedback:</p>
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <label style="font-size:0.88rem;">Rating (1 to 5 Stars):
                            <select id="review-rating" style="width:120px; margin-top:0.25rem;">
                                <option value="5">5 ★★★★★</option>
                                <option value="4">4 ★★★★☆</option>
                                <option value="3">3 ★★★☆☆</option>
                                <option value="2">2 ★★☆☆☆</option>
                                <option value="1">1 ★☆☆☆☆</option>
                            </select>
                        </label>
                        <label style="font-size:0.88rem;">Review Feedback:
                            <textarea id="review-comment" rows="3" placeholder="How was the product condition and overall rental experience?" style="width:100%; margin-top:0.25rem;"></textarea>
                        </label>
                        <button id="submit-review-btn" class="btn primary" style="align-self:flex-start;">Post Review</button>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    const submitReviewBtn = document.getElementById('submit-review-btn');
    if (submitReviewBtn) {
        submitReviewBtn.addEventListener('click', async () => {
            const rating = parseInt(document.getElementById('review-rating').value, 10);
            const comment = document.getElementById('review-comment').value.trim();
            const msgEl = document.getElementById('review-post-msg');

            if (!comment) {
                if (msgEl) {
                    msgEl.style.color = '#FB7185';
                    msgEl.textContent = 'Please write a brief comment for your review.';
                }
                return;
            }

            const completedBookings = getBookings().filter(b =>
                (b.customer_id === current.user_id || b.customer === current.user_id) &&
                (b.product_id === pid || b.product === pid) &&
                b.status === 'Completed'
            );
            const eligibleBooking = completedBookings.find(b => !hasUserReviewedBooking(b.booking_id || b._id));
            const bookingId = eligibleBooking ? (eligibleBooking._id || eligibleBooking.booking_id) : null;

            try {
                const res = await api.post('/reviews', {
                    product_id: pid,
                    booking_id: bookingId,
                    rating,
                    comment
                });

                if (res && res.success) {
                    if (msgEl) {
                        msgEl.style.color = 'var(--color-secondary)';
                        msgEl.textContent = 'Thank you! Your verified review has been posted.';
                    }
                    setTimeout(() => init(), 1200);
                    return;
                }
            } catch (err) {
                // local fallback
                addReview({
                    review_id: genId('review'),
                    booking_id: bookingId,
                    product_id: pid,
                    customer_id: current.user_id,
                    rating,
                    comment,
                    review_date: new Date().toISOString()
                });

                if (msgEl) {
                    msgEl.style.color = 'var(--color-secondary)';
                    msgEl.textContent = 'Review posted to local storage (Backend offline).';
                }
                setTimeout(() => init(), 1200);
            }
        });
    }
}

export async function init() {
    const pid = (getQueryParam('pid') || getQueryParam('id'))?.trim();
    const detailContainer = document.getElementById('product-detail');

    syncNavbarAuth();

    if (!pid) {
        if (detailContainer) {
            detailContainer.innerHTML = '<div style="padding:2.5rem; text-align:center;"><p class="empty-state">No product specified.</p><a href="products.html" class="btn primary" style="margin-top:1rem; display:inline-block;">Return to Browse Products</a></div>';
        }
        return;
    }

    // Try live API first
    try {
        const res = await api.get(`/products/${pid}`);
        if (res && res.success && res.product) {
            renderProduct(res.product, res.ratingStats, res.reviews);
            return;
        }
    } catch (e) {
        // Fall back to storage
    }

    const product = getProducts().find(p => p.product_id === pid || p._id === pid);
    if (!product) {
        if (detailContainer) {
            detailContainer.innerHTML = '<div style="padding:2.5rem; text-align:center;"><p class="empty-state">Product not found.</p><a href="products.html" class="btn primary" style="margin-top:1rem; display:inline-block;">Return to Browse Products</a></div>';
        }
        return;
    }

    renderProduct(product);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
}
