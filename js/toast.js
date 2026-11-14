// js/toast.js
// Non-intrusive, lightweight Toast Notification System for RentHub

export function showToast(message, type = 'info', duration = 3500) {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('renthub-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'renthub-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';
    if (type === 'warning') icon = '⚠';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
        toast.classList.add('toast-hiding');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    };

    if (closeBtn) closeBtn.onclick = dismiss;

    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(dismiss, duration);
}

export default showToast;
