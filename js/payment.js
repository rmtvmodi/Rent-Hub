// js/payment.js
// Handles simulated payment processing for accepted bookings, records transactions,
// updates booking status to Paid/Active Rental, and triggers notifications.
// Integrated with Express / MongoDB API with local storage fallback.

import { getCurrentUser } from "./auth.js";
import { getBookings, getProducts, updateBooking, addPayment, addNotification } from "./storage.js";
import { api, getStoredToken } from "./api.js";

function getQueryParam(param) {
    const params = new URLSearchParams(window.location.search);
    return params.get(param);
}

function renderError(msg) {
    const container = document.getElementById('payment-container');
    if (!container) return;
    container.innerHTML = `
        <div class="card" style="text-align:center; padding:2rem; max-width:550px; margin:auto;">
            <p style="color:#FB7185; font-weight:600; margin-bottom:1rem;">${msg}</p>
            <a href="customer-dashboard.html" class="btn secondary">Back to Customer Dashboard</a>
        </div>
    `;
}

function renderPaymentForm(booking, product) {
    const container = document.getElementById('payment-container');
    if (!container) return;

    const bId = booking.booking_id || booking._id;

    container.innerHTML = `
        <div class="card" style="max-width:580px; margin:1.5rem auto; padding:2rem;">
            <span class="badge accepted" style="margin-bottom:0.75rem;">Verified Booking #${bId}</span>
            <h3 style="margin-bottom:1rem; color:var(--color-secondary);">Complete Rental Payment</h3>
            <div id="payment-msg" style="margin-bottom:0.75rem; font-size:0.9rem;"></div>
            
            <div style="background:var(--color-surface); padding:1rem 1.25rem; border-radius:var(--radius); border:1px solid var(--color-border); margin-bottom:1.5rem;">
                <p style="margin:0 0 0.35rem;"><strong>Product:</strong> ${product.title}</p>
                <p style="margin:0 0 0.35rem;"><strong>Rental Period:</strong> ${booking.start_date} to ${booking.end_date}</p>
                <p style="font-size:1.25rem; margin:0.75rem 0 0; color:var(--color-secondary);">
                    <strong>Total Due:</strong> <span style="font-weight:700;">₹${booking.total_price}</span>
                </p>
            </div>

            <form id="payment-form" style="max-width:100%;">
                <p style="font-weight:600; color:var(--color-text-secondary); margin-bottom:0.5rem;">Select Simulated Payment Channel:</p>
                <div style="display:flex; flex-direction:column; gap:0.6rem; background:var(--color-surface); padding:1rem; border-radius:var(--radius); border:1px solid var(--color-border);">
                    <label style="display:flex; flex-direction:row; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="radio" name="method" value="UPI" checked required> UPI (Google Pay, PhonePe, Paytm, BHIM)
                    </label>
                    <label style="display:flex; flex-direction:row; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="radio" name="method" value="Card"> Credit / Debit Card (Simulated Gateway)
                    </label>
                    <label style="display:flex; flex-direction:row; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="radio" name="method" value="NetBanking"> Net Banking (Instant Bank Transfer)
                    </label>
                    <label style="display:flex; flex-direction:row; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="radio" name="method" value="Cash"> Pay on Delivery / In-person Pickup
                    </label>
                </div>

                <div style="background:rgba(45, 212, 191, 0.08); border:1px solid rgba(45, 212, 191, 0.25); border-radius:var(--radius); padding:0.75rem 1rem; margin-top:1rem; font-size:0.85rem; color:var(--color-text-secondary);">
                    ℹ️ <em>Demo Simulation Note:</em> No real financial transaction will occur. This step confirms the booking in the backend database.
                </div>

                <button type="submit" id="pay-submit-btn" class="btn primary" style="width:100%; margin-top:1.25rem; font-size:1.05rem;">Confirm & Pay ₹${booking.total_price}</button>
            </form>
        </div>
    `;

    const form = document.getElementById('payment-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const method = form.method.value;
        const msgEl = document.getElementById('payment-msg');
        const submitBtn = document.getElementById('pay-submit-btn');

        if (submitBtn) submitBtn.disabled = true;
        if (msgEl) {
            msgEl.style.color = 'var(--color-text-secondary)';
            msgEl.textContent = 'Processing simulated payment with backend...';
        }

        // Map method to backend-accepted method
        let backendMethod = 'UPI';
        if (method === 'Card') backendMethod = 'Credit Card';
        if (method === 'NetBanking') backendMethod = 'Net Banking';
        if (method === 'Cash') backendMethod = 'Wallet';

        let txnId = `PAY-${Date.now()}`;
        let resultingStatus = 'Paid';

        try {
            const res = await api.post('/payments', {
                booking_id: bId,
                amount: booking.total_price,
                payment_method: backendMethod
            });

            if (res && res.success && res.payment) {
                txnId = res.payment.transaction_id || res.payment._id;
                resultingStatus = res.booking ? res.booking.status : 'Paid';
            }
        } catch (err) {
            if (!err.isNetworkError) {
                if (msgEl) {
                    msgEl.style.color = '#FB7185';
                    msgEl.textContent = err.message || 'Payment simulation rejected by server.';
                }
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
            // Offline fallback
            const nowIso = new Date().toISOString();
            const todayStr = nowIso.split('T')[0];
            resultingStatus = (todayStr >= booking.start_date && todayStr <= booking.end_date) ? 'Active Rental' : 'Paid';
        }

        // Sync local storage state
        const localBooking = getBookings().find(b => b.booking_id === bId || b._id === bId);
        if (localBooking) {
            localBooking.payment_status = 'Paid';
            localBooking.payment_method = method;
            localBooking.status = resultingStatus;
            updateBooking(localBooking);
        }

        container.innerHTML = `
            <div class="card" style="text-align:center; padding:2.5rem; max-width:550px; margin:auto;">
                <div style="font-size:3rem; margin-bottom:1rem;">🎉</div>
                <h3 style="color:var(--color-secondary); margin-bottom:0.75rem;">Payment Successful!</h3>
                <p style="color:var(--color-text-secondary); margin-bottom:0.5rem;">
                    Booking #${bId} is now <strong>${resultingStatus}</strong>.
                </p>
                <p style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:1.5rem;">
                    Transaction ID: <code>${txnId}</code> (${method})
                </p>
                <div style="display:flex; justify-content:center; gap:1rem;">
                    <a href="customer-dashboard.html" class="btn primary">View in Dashboard</a>
                    <a href="products.html" class="btn secondary">Browse More Gear</a>
                </div>
            </div>
        `;
    });
}

export async function initPaymentPage() {
    const user = getCurrentUser();
    if (!user || user.role !== 'customer') {
        renderError('You must be logged in as a customer to process a payment.');
        return;
    }
    const bid = getQueryParam('bid');
    if (!bid) {
        renderError('No booking ID specified in URL.');
        return;
    }

    let booking = null;
    let product = null;

    // Try fetching from live backend
    try {
        const res = await api.get('/bookings/my');
        if (res && res.success && Array.isArray(res.bookings)) {
            const match = res.bookings.find(b => (b._id === bid || b.booking_id === bid));
            if (match) {
                booking = {
                    booking_id: match._id || match.booking_id,
                    start_date: match.start_date ? match.start_date.split('T')[0] : '',
                    end_date: match.end_date ? match.end_date.split('T')[0] : '',
                    total_price: match.total_price,
                    status: match.status,
                    payment_status: match.payment_status
                };
                if (match.product) {
                    product = {
                        product_id: match.product._id || match.product.product_id,
                        title: match.product.title
                    };
                }
            }
        }
    } catch (e) {
        // Fall back to storage
    }

    if (!booking) {
        booking = getBookings().find(b => (b.booking_id === bid || b._id === bid) && (b.customer_id === user.user_id || b.customer === user.user_id));
    }

    if (!booking) {
        renderError('Booking not found or does not belong to your account.');
        return;
    }

    if (booking.payment_status === 'Paid') {
        renderError(`This booking has already been paid for. Status: ${booking.status}`);
        return;
    }

    if (booking.status !== 'Accepted') {
        renderError(`This booking is currently "${booking.status}". Payment is only available for Accepted bookings.`);
        return;
    }

    if (!product) {
        product = getProducts().find(p => p.product_id === booking.product_id || p._id === booking.product_id) || { title: 'Rental Product' };
    }

    renderPaymentForm(booking, product);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        initPaymentPage();
    } else {
        document.addEventListener('DOMContentLoaded', initPaymentPage);
    }
}
