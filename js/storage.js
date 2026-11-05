// js/storage.js
// Centralized wrapper around localStorage for the RentHub rental marketplace.
// Manages users, products, bookings, payments, wishlists, reviews, and notifications.

const STORAGE_KEY = 'renthub_data';

/** Initialize the storage structure if it does not exist.
 *  Preloads demo users and sample products on first run.
 */
function initStorage() {
    if (!localStorage.getItem(STORAGE_KEY)) {
        const initialData = {
            users: [
                // Demo Customer
                { user_id: 'user_cust_demo', name: 'Demo Customer', email: 'customer@example.com', phone: '1234567890', password: 'cust123', role: 'customer' },
                // Demo Owner
                { user_id: 'user_owner_demo', name: 'Demo Owner', email: 'owner@example.com', phone: '0987654321', password: 'owner123', role: 'owner' },
                // Demo Admin
                { user_id: 'user_admin_demo', name: 'Demo Admin', email: 'admin@example.com', phone: '5555555555', password: 'admin123', role: 'admin' }
            ],
            products: [
                { product_id: 'prod_dell_01', owner_id: 'user_owner_demo', category: 'Laptops', title: 'Dell Latitude 7420 Laptop', description: 'Intel i7 11th Gen, 16GB RAM, 512GB NVMe SSD, FHD display. Perfect for productivity and coding.', price_per_day: 800, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=600&q=80', rating: 5 },
                { product_id: 'prod_canon_02', owner_id: 'user_owner_demo', category: 'Cameras', title: 'Canon EOS 90D DSLR Camera', description: '32.5 MP APS-C sensor, 4K video, dual pixel AF. Includes 18-135mm lens, battery and bag.', price_per_day: 1200, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80', rating: 5 },
                { product_id: 'prod_bike_03', owner_id: 'user_owner_demo', category: 'Bicycles', title: 'Trek Marlin 7 Mountain Bike', description: 'Lightweight aluminum frame, RockShox Judy fork, Shimano 1x10 drivetrain, hydraulic disc brakes.', price_per_day: 400, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80', rating: 5 },
                { product_id: 'prod_epson_04', owner_id: 'user_owner_demo', category: 'Projectors', title: 'Epson Home Cinema 1080p Projector', description: '3,400 lumens color and white brightness, HDMI inputs, built-in speaker. Ideal for movies and gaming.', price_per_day: 700, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80', rating: 5 },
                { product_id: 'prod_ps5_05', owner_id: 'user_owner_demo', category: 'Gaming', title: 'PlayStation 5 Console (Disc Edition)', description: 'Ultra-high speed SSD, ray tracing, 4K 120Hz support. Includes 2 DualSense wireless controllers.', price_per_day: 1000, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80', rating: 5 },
                { product_id: 'prod_drill_06', owner_id: 'user_owner_demo', category: 'Tools', title: 'Bosch Cordless Hammer Drill Kit', description: '18V brushless motor, 2-speed gearbox, 20+2 clutch settings. Includes 2 Li-ion batteries and charger.', price_per_day: 350, availability: true, approval_status: 'approved', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80', rating: 5 }
            ],
            bookings: [],
            payments: [],
            wishlists: [],
            reviews: [],
            notifications: []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
    } else {
        // Migration for existing storage without newer fields
        try {
            const db = JSON.parse(localStorage.getItem(STORAGE_KEY));
            let modified = false;
            if (!db.notifications) { db.notifications = []; modified = true; }
            if (db.products) {
                db.products.forEach(p => {
                    if (!p.approval_status) {
                        p.approval_status = 'approved';
                        modified = true;
                    }
                });
            }
            if (modified) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
            }
        } catch (e) {
            console.error('Storage migration error:', e);
        }
    }
}

/** Retrieve the whole database object. */
function getDB() {
    initStorage();
    try {
        const db = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!db.notifications) db.notifications = [];
        return db;
    } catch (e) {
        console.error('Failed to parse storage:', e);
        return { users: [], products: [], bookings: [], payments: [], wishlists: [], reviews: [], notifications: [] };
    }
}

/** Persist the whole database object. */
function setDB(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/** Generate a short unique id. */
function genId(prefix = 'id') {
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${Date.now()}_${rand}`;
}

// Generic get/set for backwards compatibility
function storageGet(key, defaultValue) {
    const db = getDB();
    if (key === 'wishlist') return db.wishlists || defaultValue;
    return db.hasOwnProperty(key) ? db[key] : defaultValue;
}

function storageSet(key, value) {
    const db = getDB();
    if (key === 'wishlist') db.wishlists = value;
    else db[key] = value;
    setDB(db);
}

/** ================= USER HELPERS ================= */
function getUsers() { return getDB().users || []; }
function addUser(user) { const db = getDB(); db.users.push(user); setDB(db); }
function updateUser(updated) {
    const db = getDB();
    const idx = db.users.findIndex(u => u.user_id === updated.user_id);
    if (idx !== -1) { db.users[idx] = updated; setDB(db); }
}
function deleteUser(userId) {
    const db = getDB();
    db.users = db.users.filter(u => u.user_id !== userId);
    setDB(db);
}
function findUserByEmail(email) {
    if (!email) return null;
    return (getDB().users || []).find(u => u.email.toLowerCase() === email.toLowerCase());
}
function findUserById(id) {
    return (getDB().users || []).find(u => u.user_id === id);
}

/** ================= PRODUCT HELPERS ================= */
function getProducts() {
    const db = getDB();
    return (db.products || []).map(p => {
        if (!p.approval_status) p.approval_status = 'approved';
        return p;
    });
}
function addProduct(product) {
    const db = getDB();
    if (!product.approval_status) product.approval_status = 'approved';
    db.products.push(product);
    setDB(db);
}
function updateProduct(updated) {
    const db = getDB();
    const idx = db.products.findIndex(p => p.product_id === updated.product_id);
    if (idx !== -1) {
        db.products[idx] = updated;
        setDB(db);
    }
}
function deleteProduct(productId) {
    const db = getDB();
    db.products = db.products.filter(p => p.product_id !== productId);
    setDB(db);
}

/** ================= BOOKING HELPERS & LIFECYCLE ================= */
function getBookings() {
    const db = getDB();
    const bookings = db.bookings || [];
    // Sync lifecycle statuses based on today's date
    const todayStr = new Date().toISOString().split('T')[0];
    let changed = false;

    bookings.forEach(b => {
        // If booking is Paid and today is within rental period, auto-transition to 'Active Rental'
        if (b.status === 'Paid' && b.payment_status === 'Paid') {
            if (todayStr >= b.start_date && todayStr <= b.end_date) {
                b.status = 'Active Rental';
                changed = true;
            }
        }
    });

    if (changed) {
        setDB(db);
    }
    return bookings;
}

function addBooking(booking) {
    const db = getDB();
    if (!booking.created_at) booking.created_at = new Date().toISOString();
    if (!booking.status) booking.status = 'Requested';
    if (!booking.payment_status) booking.payment_status = 'Unpaid';
    db.bookings.push(booking);
    setDB(db);
}

function updateBooking(updated) {
    const db = getDB();
    const idx = db.bookings.findIndex(b => b.booking_id === updated.booking_id);
    if (idx !== -1) {
        db.bookings[idx] = updated;
        setDB(db);
    }
}

function deleteBooking(bookingId) {
    const db = getDB();
    db.bookings = db.bookings.filter(b => b.booking_id !== bookingId);
    setDB(db);
}

/** Check if requested dates overlap with an active/paid booking for the same product */
function checkBookingOverlap(productId, startDateStr, endDateStr, excludeBookingId = null) {
    const bookings = getBookings().filter(b =>
        b.product_id === productId &&
        b.booking_id !== excludeBookingId &&
        b.status !== 'Cancelled' &&
        b.status !== 'Rejected' &&
        b.status !== 'Completed'
    );

    const reqStart = new Date(startDateStr);
    const reqEnd = new Date(endDateStr);

    for (const b of bookings) {
        const bStart = new Date(b.start_date);
        const bEnd = new Date(b.end_date);
        if (reqStart <= bEnd && reqEnd >= bStart) {
            return {
                overlap: true,
                conflict: b
            };
        }
    }
    return { overlap: false };
}

/** Calculate late fee if item is returned after rental end_date */
function calculateLateFee(booking, returnDate = new Date()) {
    if (!booking || !booking.end_date) return { lateDays: 0, lateFee: 0 };
    const dueDate = new Date(booking.end_date);
    dueDate.setHours(23, 59, 59, 999);
    
    if (returnDate <= dueDate) return { lateDays: 0, lateFee: 0 };
    
    const diffTime = returnDate.getTime() - dueDate.getTime();
    const lateDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    const product = getProducts().find(p => p.product_id === booking.product_id);
    const dailyRate = product ? product.price_per_day : (booking.total_price / 1);
    
    // Standard late return fee: daily rate + 20% convenience penalty per late day
    const lateFeePerDay = Math.round(dailyRate * 1.2);
    const lateFee = Math.max(0, lateDays * lateFeePerDay);
    return { lateDays, lateFee };
}

/** ================= PAYMENT HELPERS ================= */
function getPayments() {
    return getDB().payments || [];
}
function addPayment(payment) {
    const db = getDB();
    if (!db.payments) db.payments = [];
    db.payments.push(payment);
    setDB(db);
}

/** ================= WISHLIST HELPERS ================= */
function getWishlists() {
    return getDB().wishlists || [];
}
function addToWishlist(item) {
    const db = getDB();
    if (!db.wishlists) db.wishlists = [];
    const exists = db.wishlists.some(w => w.customer_id === item.customer_id && w.product_id === item.product_id);
    if (!exists) {
        db.wishlists.push(item);
        setDB(db);
    }
}
function removeFromWishlist(wishlistId) {
    const db = getDB();
    db.wishlists = (db.wishlists || []).filter(w => w.wishlist_id !== wishlistId);
    setDB(db);
}

/** ================= REVIEW HELPERS ================= */
function getReviews() {
    return getDB().reviews || [];
}
function getProductReviews(productId) {
    return (getDB().reviews || []).filter(r => r.product_id === productId);
}
function addReview(review) {
    const db = getDB();
    if (!db.reviews) db.reviews = [];
    if (!review.review_date) review.review_date = new Date().toISOString();
    db.reviews.push(review);
    setDB(db);
}
function deleteReview(reviewId) {
    const db = getDB();
    db.reviews = (db.reviews || []).filter(r => r.review_id !== reviewId);
    setDB(db);
}
function hasUserReviewedBooking(bookingId) {
    return (getDB().reviews || []).some(r => r.booking_id === bookingId);
}

/** Compute actual dynamic rating for a product */
function getProductAverageRating(productId) {
    const reviews = getProductReviews(productId);
    if (!reviews.length) return { average: 0, avg: 0, count: 0, text: 'No reviews yet' };
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    const avg = parseFloat((sum / reviews.length).toFixed(1));
    return { average: avg, avg: avg, count: reviews.length, text: `${avg} ★ (${reviews.length})` };
}

/** ================= NOTIFICATION HELPERS ================= */
function getNotifications() {
    return getDB().notifications || [];
}
function getUserNotifications(userId) {
    return (getDB().notifications || [])
        .filter(n => n.user_id === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}
function addNotification({ user_id, message, type = 'info', link = '' }) {
    if (!user_id || !message) return;
    const db = getDB();
    if (!db.notifications) db.notifications = [];
    
    // Prevent immediate duplicate notification within 1 minute
    const recentDuplicate = db.notifications.find(n => 
        n.user_id === user_id && 
        n.message === message && 
        (Date.now() - new Date(n.date).getTime()) < 60000
    );
    if (recentDuplicate) return;

    const notif = {
        notification_id: genId('notif'),
        user_id,
        message,
        type,
        link,
        date: new Date().toISOString(),
        read: false
    };
    db.notifications.push(notif);
    setDB(db);
    return notif;
}
function markNotificationRead(notifId) {
    const db = getDB();
    const notif = (db.notifications || []).find(n => n.notification_id === notifId || n.id === notifId);
    if (notif) {
        notif.read = true;
        setDB(db);
    }
}
function markAllNotificationsRead(userId) {
    const db = getDB();
    if (db.notifications) {
        db.notifications.forEach(n => {
            if (n.user_id === userId) n.read = true;
        });
        setDB(db);
    }
}

/** Export global Storage object for compatibility */
if (typeof window !== 'undefined') {
    window.Storage = {
        get: storageGet,
        set: storageSet,
        genId,
        getUsers, addUser, updateUser, deleteUser, findUserByEmail, findUserById,
        getProducts, addProduct, updateProduct, deleteProduct,
        getBookings, addBooking, updateBooking, deleteBooking,
        getPayments, addPayment,
        getWishlists, addToWishlist, removeFromWishlist,
        getReviews, getProductReviews, addReview, deleteReview,
        getNotifications, getUserNotifications, addNotification, markNotificationRead, markAllNotificationsRead
    };
}

export {
    genId,
    getUsers, addUser, updateUser, deleteUser, findUserByEmail, findUserById,
    getProducts, addProduct, updateProduct, deleteProduct,
    getBookings, addBooking, updateBooking, deleteBooking, checkBookingOverlap, calculateLateFee,
    getPayments, addPayment,
    getWishlists, addToWishlist, removeFromWishlist,
    getReviews, getProductReviews, addReview, deleteReview, hasUserReviewedBooking, getProductAverageRating,
    getNotifications, getUserNotifications, addNotification, markNotificationRead, markAllNotificationsRead
};
