// js/config.js
// Static fallback frontend configuration (when served by Express, /js/config.js is served
// dynamically from environment variables; for decoupled static hosting, set apiUrl below).

export const FRONTEND_CONFIG = Object.freeze({
    apiUrl: 'https://rent-hub-hhoz.onrender.com/api',
    devApiUrl: 'http://localhost:5000/api',
    devStaticPorts: ['5500', '8000', '3000', '5173', '4173']
});
