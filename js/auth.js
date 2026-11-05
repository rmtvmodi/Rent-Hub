// js/auth.js
// Handles registration, login, logout, session persistence, and navbar state synchronization.
// Integrates with Express JWT backend with offline-resilient localStorage caching.

import {
    genId, addUser, findUserByEmail, findUserById,
    getUserNotifications, markNotificationRead, markAllNotificationsRead
} from "./storage.js";
import { api, setStoredToken, getStoredToken, clearStoredAuth } from "./api.js";

const SESSION_KEY = "renthub_current_user";

/** Save the logged-in user object (without password) to session storage */
export function setCurrentUser(user, token = null) {
    if (!user) {
        clearStoredAuth();
        syncNavbarAuth();
        return;
    }
    const safeUser = { ...user };
    delete safeUser.password;
    if (token) {
        safeUser.token = token;
        setStoredToken(token);
    }
    // Normalize user_id
    if (!safeUser.user_id && safeUser._id) {
        safeUser.user_id = safeUser._id;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    syncNavbarAuth();
}

/** Retrieve the current logged-in user, or null */
export function getCurrentUser() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (user && !user.user_id && user._id) {
            user.user_id = user._id;
        }
        return user;
    } catch (e) {
        return null;
    }
}

/** Clear the session (logout) */
export function clearCurrentUser(redirect = true) {
    clearStoredAuth();
    syncNavbarAuth();
    if (redirect && typeof window !== 'undefined') {
        window.location.href = "index.html";
    }
}

/** Verify session integrity against backend API */
export async function verifyBackendSession() {
    const token = getStoredToken();
    if (!token) return null;

    try {
        const res = await api.get('/auth/me');
        if (res && res.success && res.user) {
            const freshUser = res.user;
            if (!freshUser.isActive && freshUser.isActive !== undefined) {
                alert('Your account has been deactivated by an administrator.');
                clearCurrentUser(true);
                return null;
            }
            setCurrentUser(freshUser, token);
            return freshUser;
        }
    } catch (err) {
        if (err.status === 401) {
            console.warn('[RentHub Auth] Token verification failed: unauthorized or expired.');
            clearCurrentUser(true);
            return null;
        }
        // Network/offline: retain cached user without clearing session
    }
    return getCurrentUser();
}

/** Render and handle notification dropdown popover */
export async function setupNotificationUI(user) {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    let dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'notif-dropdown';
        dropdown.className = 'notif-dropdown';
        navbar.appendChild(dropdown);
    }

    let notifs = [];
    let unreadCount = 0;

    // Try fetching live notifications from backend first
    try {
        const res = await api.get('/notifications');
        if (res && res.success && Array.isArray(res.notifications)) {
            notifs = res.notifications.map(n => ({
                notification_id: n._id || n.notification_id,
                message: n.message,
                read: n.is_read !== undefined ? n.is_read : n.read,
                date: n.createdAt || n.date
            }));
            unreadCount = res.unreadCount !== undefined ? res.unreadCount : notifs.filter(n => !n.read).length;
        }
    } catch (e) {
        // Fallback to local storage
        notifs = getUserNotifications(user.user_id) || [];
        unreadCount = notifs.filter(n => !n.read).length;
    }

    dropdown.innerHTML = `
        <div class="notif-header">
            <h4>Notifications (${unreadCount} unread)</h4>
            ${unreadCount > 0 ? `<button id="notif-mark-all-btn">Mark all read</button>` : ''}
        </div>
        <div class="notif-list">
            ${notifs.length === 0 ? `<p style="padding:0.75rem; text-align:center; font-size:0.85rem; color:var(--color-text-muted); margin:0;">No notifications yet.</p>` :
                notifs.slice(0, 10).map(n => `
                    <div class="notif-item ${n.read ? 'read' : 'unread'}" data-nid="${n.notification_id}">
                        <div>${n.message}</div>
                        <div class="notif-time">${new Date(n.date).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
                    </div>
                `).join('')
            }
        </div>
    `;

    const markAllBtn = document.getElementById('notif-mark-all-btn');
    if (markAllBtn) {
        markAllBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                await api.patch('/notifications/read-all');
            } catch (err) {
                // local fallback
                markAllNotificationsRead(user.user_id);
            }
            syncNavbarAuth();
        };
    }

    dropdown.querySelectorAll('.notif-item').forEach(item => {
        item.onclick = async (e) => {
            const nid = item.dataset.nid;
            try {
                await api.patch(`/notifications/${nid}/read`);
            } catch (err) {
                markNotificationRead(nid);
            }
            syncNavbarAuth();
        };
    });

    const notifBtn = document.getElementById('notif-toggle-btn');
    if (notifBtn) {
        notifBtn.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        };
    }

    if (!document._notifOutsideClickListener) {
        document._notifOutsideClickListener = (e) => {
            const d = document.getElementById('notif-dropdown');
            const b = document.getElementById('notif-toggle-btn');
            if (d && !d.contains(e.target) && b && !b.contains(e.target)) {
                d.classList.remove('show');
            }
        };
        document.addEventListener('click', document._notifOutsideClickListener);
    }
}

/** Synchronize navbar authentication links and state across all pages */
export function syncNavbarAuth() {
    const user = getCurrentUser();
    const navAuth = document.getElementById("nav-auth");
    const navLinks = document.getElementById("nav-links");

    const pathname = (typeof window !== "undefined" && window.location && window.location.pathname) ? window.location.pathname : "";
    const currentFile = (pathname.split("/").pop() || "index.html").split("?")[0];

    if (user && user.role) {
        const dashboardUrl = `${user.role}-dashboard.html`;
        const isDashboard = currentFile === dashboardUrl;

        let unreadCount = 0;
        try {
            const notifs = getUserNotifications(user.user_id) || [];
            unreadCount = notifs.filter(n => !n.read).length;
        } catch (e) {
            unreadCount = 0;
        }

        const notifButtonHtml = `
            <button id="notif-toggle-btn" class="nav-notif-btn" aria-label="Notifications (${unreadCount} unread)" title="Notifications" style="background:none; border:none; color:var(--color-text-primary); cursor:pointer; position:relative; font-size:1.15rem; margin-left:0.5rem; margin-right:0.5rem; padding:0.2rem 0.4rem; display:inline-flex; align-items:center;">
                🔔${unreadCount > 0 ? `<span class="notif-badge" style="position:absolute; top:-3px; right:-6px; background:#F43F5E; color:#fff; font-size:0.68rem; font-weight:700; border-radius:9999px; padding:0.1rem 0.35rem; line-height:1;">${unreadCount}</span>` : ''}
            </button>
        `;

        if (navAuth) {
            navAuth.innerHTML = `<a href="${dashboardUrl}" id="nav-dashboard-link"${isDashboard ? ' class="active"' : ''}>Dashboard</a>${notifButtonHtml}<a href="#" id="logout-btn" style="margin-left:0.5rem;">Logout</a>`;
        } else if (navLinks && (navLinks.classList.contains("nav-right") || navLinks.tagName === "DIV")) {
            navLinks.innerHTML = `
                <a href="index.html"${currentFile === 'index.html' ? ' class="active"' : ''}>Home</a>
                <a href="products.html"${currentFile === 'products.html' ? ' class="active"' : ''}>Browse Products</a>
                <a href="about.html"${currentFile === 'about.html' ? ' class="active"' : ''}>About</a>
                <a href="${dashboardUrl}" id="nav-dashboard-link"${isDashboard ? ' class="active"' : ''}>Dashboard</a>
                ${notifButtonHtml}
                <a href="#" id="logout-btn" style="margin-left:0.5rem;">Logout</a>
            `;
        }

        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                clearCurrentUser();
            };
        }

        setupNotificationUI(user);
    } else {
        const isLogin = currentFile === "login.html" || currentFile === "register.html";
        if (navAuth) {
            navAuth.innerHTML = `<a href="login.html" id="login-link"${isLogin ? ' class="active"' : ''}>Login / Register</a>`;
        } else if (navLinks && (navLinks.classList.contains("nav-right") || navLinks.tagName === "DIV")) {
            navLinks.innerHTML = `
                <a href="index.html"${currentFile === 'index.html' ? ' class="active"' : ''}>Home</a>
                <a href="products.html"${currentFile === 'products.html' ? ' class="active"' : ''}>Browse Products</a>
                <a href="about.html"${currentFile === 'about.html' ? ' class="active"' : ''}>About</a>
                <a href="login.html" id="login-link"${isLogin ? ' class="active"' : ''}>Login / Register</a>
            `;
        }

        const dropdown = document.getElementById('notif-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    }
}

/** Register form submit handler */
export async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const phone = document.getElementById("reg-phone").value.trim();
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-confirm").value;
    const role = document.querySelector("input[name='role']:checked")?.value;

    const messageDiv = document.getElementById("reg-message");
    messageDiv.textContent = "";

    // Client-side pre-validation
    if (!name || !email || !phone || !password || !confirm || !role) {
        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = "All fields are required.";
        return;
    }
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(email)) {
        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = "Please enter a valid email address.";
        return;
    }
    if (password.length < 6) {
        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = "Password must be at least 6 characters long.";
        return;
    }
    if (password !== confirm) {
        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = "Passwords do not match.";
        return;
    }

    messageDiv.style.color = "var(--color-text-secondary)";
    messageDiv.textContent = "Creating account...";

    try {
        const res = await api.post('/auth/register', {
            name,
            email,
            phone,
            password,
            role // 'customer' or 'owner' (backend blocks 'admin')
        });

        // Backup to localStorage for hybrid offline demo support
        const newUser = {
            user_id: res.user ? (res.user.user_id || res.user._id) : genId("user"),
            name,
            email,
            phone,
            password,
            role
        };
        addUser(newUser);

        messageDiv.style.color = "var(--color-secondary)";
        messageDiv.textContent = "Registration successful! You may now log in.";
        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);
    } catch (err) {
        // If backend is offline, support offline mode with warning
        if (err.isNetworkError) {
            if (findUserByEmail(email)) {
                messageDiv.style.color = "#FB7185";
                messageDiv.textContent = "An account with this email already exists.";
                return;
            }
            const newUser = {
                user_id: genId("user"),
                name,
                email,
                phone,
                password,
                role
            };
            addUser(newUser);
            messageDiv.style.color = "var(--color-secondary)";
            messageDiv.textContent = "Registered in local offline storage (Backend offline). You may now log in.";
            setTimeout(() => {
                window.location.href = "login.html";
            }, 1200);
            return;
        }

        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = err.message || "Registration failed. Please check your details.";
    }
}

/** Login form submit handler */
export async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const messageDiv = document.getElementById("login-message");
    messageDiv.textContent = "";

    if (!email || !password) {
        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = "Please enter both email and password.";
        return;
    }

    messageDiv.style.color = "var(--color-text-secondary)";
    messageDiv.textContent = "Authenticating with server...";

    try {
        const res = await api.post('/auth/login', { email, password });

        if (res && res.success && res.user) {
            const user = res.user;
            const token = res.token;
            setCurrentUser(user, token);

            messageDiv.style.color = "var(--color-secondary)";
            messageDiv.textContent = "Login successful! Redirecting...";

            setTimeout(() => {
                switch (user.role) {
                    case "customer":
                        window.location.href = "customer-dashboard.html";
                        break;
                    case "owner":
                        window.location.href = "owner-dashboard.html";
                        break;
                    case "admin":
                        window.location.href = "admin-dashboard.html";
                        break;
                    default:
                        window.location.href = "index.html";
                }
            }, 500);
            return;
        }
    } catch (err) {
        // If network error, check local storage fallback
        if (err.isNetworkError) {
            const localUser = findUserByEmail(email);
            if (localUser && localUser.password === password) {
                setCurrentUser(localUser);
                messageDiv.style.color = "var(--color-secondary)";
                messageDiv.textContent = "Logged in using local offline credentials (Backend offline).";
                setTimeout(() => {
                    switch (localUser.role) {
                        case "customer":
                            window.location.href = "customer-dashboard.html";
                            break;
                        case "owner":
                            window.location.href = "owner-dashboard.html";
                            break;
                        case "admin":
                            window.location.href = "admin-dashboard.html";
                            break;
                        default:
                            window.location.href = "index.html";
                    }
                }, 500);
                return;
            }
        }

        messageDiv.style.color = "#FB7185";
        messageDiv.textContent = err.message || "Invalid email or password.";
    }
}

/** Attach handlers and sync navbar when DOM is ready */
export function initAuth() {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }
    const regForm = document.getElementById("register-form");
    if (regForm) {
        regForm.addEventListener("submit", handleRegister);
    }
    syncNavbarAuth();
    verifyBackendSession();
}

// Run when script loads
if (typeof document !== "undefined") {
    if (document.readyState !== "loading") {
        initAuth();
    } else {
        document.addEventListener("DOMContentLoaded", initAuth);
    }
}
