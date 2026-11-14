// js/api.js
// Centralized API integration client for RentHub full-stack architecture

import { FRONTEND_CONFIG } from './config.js';

function resolveApiBaseUrl() {
    if (typeof window === 'undefined') {
        return FRONTEND_CONFIG.devApiUrl || 'http://localhost:5000/api';
    }

    // 1. Explicit runtime global override (e.g. injected by hosting config)
    if (window.RENTHUB_API_URL && typeof window.RENTHUB_API_URL === 'string') {
        return window.RENTHUB_API_URL.trim().replace(/\/+$/, '');
    }

    // 2. HTML <meta name="renthub-api-url" content="https://api.example.com/api">
    if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="renthub-api-url"]');
        const metaUrl = meta && meta.getAttribute('content') ? meta.getAttribute('content').trim() : '';
        if (metaUrl) {
            return metaUrl.replace(/\/+$/, '');
        }
    }

    // 3. Local-only developer override via localStorage (never honored on non-localhost production hosts)
    const { protocol, hostname, port } = window.location || {};
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalHost) {
        try {
            const devOverride = localStorage.getItem('renthub_api_url');
            if (devOverride && devOverride.trim()) {
                return devOverride.trim().replace(/\/+$/, '');
            }
        } catch (e) {
            // Ignore storage access errors
        }
    }

    // 4. Local static dev server (Live Server / Python http.server / file://) targets local backend
    const devPorts = (FRONTEND_CONFIG && Array.isArray(FRONTEND_CONFIG.devStaticPorts))
        ? FRONTEND_CONFIG.devStaticPorts
        : ['5500', '8000', '3000', '5173', '4173'];

    if (protocol === 'file:' || (isLocalHost && devPorts.includes(port))) {
        return (FRONTEND_CONFIG && FRONTEND_CONFIG.devApiUrl) || 'http://localhost:5000/api';
    }

    // 5. Configured production API URL (from js/config.js or Express /js/config.js PUBLIC_API_URL)
    if (!isLocalHost && FRONTEND_CONFIG && FRONTEND_CONFIG.apiUrl) {
        return FRONTEND_CONFIG.apiUrl.trim().replace(/\/+$/, '');
    }

    // 6. Default: same-origin /api for Express-served local development and monolith deployments
    return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = 'renthub_token';
const USER_KEY = 'renthub_current_user';

/**
 * Retrieve current JWT auth token
 */
export function getStoredToken() {
    try {
        const directToken = localStorage.getItem(TOKEN_KEY);
        if (directToken) return directToken;
        const userRaw = localStorage.getItem(USER_KEY);
        if (userRaw) {
            const user = JSON.parse(userRaw);
            return user.token || null;
        }
    } catch (e) {
        // Safe access
    }
    return null;
}

/**
 * Save JWT auth token to localStorage
 */
export function setStoredToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

/**
 * Clear all auth session credentials
 */
export function clearStoredAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

/**
 * Centralized fetch helper for all REST endpoints with configurable per-request timeouts
 */
export async function apiRequest(endpoint, {
    method = 'GET',
    body = null,
    params = null,
    headers = {},
    requiresAuth = false,
    timeoutMs = 15000 // Configurable per-request timeout (e.g. 60000ms for uploads, 0 for unlimited)
} = {}) {
    let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (params && typeof params === 'object') {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                queryParams.append(key, val);
            }
        });
        const qs = queryParams.toString();
        if (qs) {
            url += (url.includes('?') ? '&' : '?') + qs;
        }
    }

    const defaultHeaders = {
        'Accept': 'application/json'
    };

    if (body && !(body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }

    const token = getStoredToken();
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;

    const fetchConfig = {
        method,
        headers: {
            ...defaultHeaders,
            ...headers
        },
        signal: controller ? controller.signal : undefined
    };

    if (body) {
        fetchConfig.body = (body instanceof FormData) ? body : JSON.stringify(body);
    }

    if (controller && timeoutMs > 0) {
        timer = setTimeout(() => {
            controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    }

    try {
        const res = await fetch(url, fetchConfig);
        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = { raw: text };
            }
        }

        if (!res.ok) {
            // Handle Expired or Invalid Token (401)
            if (res.status === 401 && token) {
                console.warn('[RentHub API] Authentication expired or invalid. Clearing session.');
                clearStoredAuth();
                if (typeof window !== 'undefined') {
                    const isProtected = ['customer-dashboard', 'owner-dashboard', 'admin-dashboard'].some(p =>
                        window.location.pathname.includes(p)
                    );
                    if (isProtected) {
                        window.location.href = 'login.html?expired=1';
                    }
                }
            }

            const err = new Error(data && data.message ? data.message : `API request failed with status ${res.status}`);
            err.status = res.status;
            err.data = data;

            // Extract retry window on HTTP 429
            if (res.status === 429) {
                const headerRetry = parseInt(res.headers.get('Retry-After'), 10);
                err.retryAfter = (data && typeof data.retryAfter === 'number') ? data.retryAfter : (!isNaN(headerRetry) ? headerRetry : null);
            }

            throw err;
        }

        return data;
    } catch (err) {
        // If it was already our formatted error, rethrow
        if (err.status) throw err;

        // Check if aborted due to timeout
        if (err.name === 'AbortError' || err.message?.includes('timed out')) {
            const timeoutError = new Error('The request timed out. Please try again.');
            timeoutError.status = 408;
            timeoutError.isTimeout = true;
            throw timeoutError;
        }

        // Otherwise handle network failure or server unreachable
        const networkError = new Error('Could not connect to the RentHub server. Please check your connection and try again.');
        networkError.status = 0;
        networkError.isNetworkError = true;
        throw networkError;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Convenient HTTP verb shortcuts
 */
export const api = {
    get: (endpoint, params, options = {}) => apiRequest(endpoint, { method: 'GET', params, ...options }),
    post: (endpoint, body, options = {}) => apiRequest(endpoint, { method: 'POST', body, ...options }),
    put: (endpoint, body, options = {}) => apiRequest(endpoint, { method: 'PUT', body, ...options }),
    patch: (endpoint, body, options = {}) => apiRequest(endpoint, { method: 'PATCH', body, ...options }),
    delete: (endpoint, options = {}) => apiRequest(endpoint, { method: 'DELETE', ...options }),

    /**
     * Check backend health and DB readiness
     */
    async checkHealth() {
        try {
            const res = await apiRequest('/health');
            return {
                online: true,
                database: res.database ? res.database.status : 'unknown',
                dbReady: res.database && (res.database.status === 'connected' || res.database.readyState === 1),
                data: res
            };
        } catch (e) {
            return {
                online: false,
                database: 'offline',
                dbReady: false,
                error: e.message
            };
        }
    }
};

/**
 * Render standard alert message inside an element
 */
export function showBannerMessage(containerId, message, type = 'error') {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = message;
    if (type === 'error') {
        el.style.color = '#FB7185';
    } else if (type === 'success') {
        el.style.color = 'var(--color-secondary, #2DD4BF)';
    } else {
        el.style.color = 'var(--color-text-secondary, #94A3B8)';
    }
}
