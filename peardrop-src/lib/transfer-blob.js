/**
 * MODULE: transfer-blob.js
 * PURPOSE: Universal transfer notification component
 * 
 * EXPORTS:
 *   - createTransferBlob(config) - Create a transfer blob HTML
 *   - formatFileSize(bytes) - Format bytes to human readable
 * 
 * DESIGN PRINCIPLES:
 *   - ONE component for ALL transfer states (waiting, connecting, transferring, complete, error)
 *   - Same visual structure everywhere (home tab, shares list, notifications)
 *   - Progress bar always visible (pulses when waiting, fills when transferring)
 *   - Context-aware buttons (home vs shares)
 * 
 * STATES:
 *   - waiting: No peers yet (upload waiting for someone to download)
 *   - connecting: Establishing connection (download connecting to sharer)
 *   - transferring: Active data transfer in progress
 *   - complete: Transfer finished successfully
 *   - error: Transfer failed
 *   - moved: "Moved to Shares" notification (auto-dismiss)
 * 
 * CONTEXTS:
 *   - home: Shows minimize button, copy link, cancel
 *   - shares: Shows remove button, no minimize
 */

/**
 * Format bytes to human readable string
 * @param {number} bytes 
 * @returns {string} e.g. "1.2 MB"
 */
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Create a universal transfer blob
 * @param {object} config
 * @param {string} config.id - Unique identifier
 * @param {string} config.name - Display name (filename or "X files")
 * @param {string} config.type - 'upload' | 'download'
 * @param {string} config.state - 'waiting' | 'connecting' | 'transferring' | 'complete' | 'error' | 'moved'
 * @param {number} config.percent - Progress 0-100
 * @param {number} config.bytesTransferred - Bytes transferred so far
 * @param {number} config.totalBytes - Total size in bytes
 * @param {string} config.speed - Speed string e.g. "2.4 MB/s"
 * @param {string} config.shareLink - Share link (for copy functionality)
 * @param {string} config.context - 'home' | 'shares' (determines buttons)
 * @param {string} config.error - Error message (for error state)
 * @param {string} config.peerId - Peer ID (for uploads to specific peer)
 * @returns {string} HTML string
 */
function createTransferBlob(config) {
    const {
        id = '',
        name = 'Transfer',
        type = 'download',
        state = 'waiting',
        percent = 0,
        bytesTransferred = 0,
        totalBytes = 0,
        speed = '',
        shareLink = '',
        context = 'home',
        error = '',
        peerId = ''
    } = config;
    
    // Truncate long names
    let displayName = name;
    if (displayName.length > 28) {
        displayName = displayName.slice(0, 25) + '...';
    }
    
    // Icon based on type
    const icon = type === 'upload' ? '⬆️' : '⬇️';
    
    // State-specific styling
    const stateClasses = {
        waiting: 'blob-waiting',
        connecting: 'blob-connecting',
        transferring: 'blob-transferring',
        complete: 'blob-complete',
        error: 'blob-error',
        moved: 'blob-moved'
    };
    const stateClass = stateClasses[state] || '';
    
    // Indicator class
    const indicatorClass = state === 'waiting' ? 'waiting' :
                          state === 'connecting' ? 'connecting' :
                          state === 'transferring' ? 'active' :
                          state === 'complete' ? 'complete' :
                          state === 'error' ? 'error' : '';
    
    // Progress bar class (pulse when waiting/connecting)
    const barClass = (state === 'waiting' || state === 'connecting') ? 'blob-bar pulsing' : 'blob-bar';
    const barWidth = (state === 'waiting' || state === 'connecting') ? 100 : Math.min(100, Math.max(0, percent));
    
    // Format bytes
    const bytesFormatted = formatFileSize(bytesTransferred);
    const totalFormatted = formatFileSize(totalBytes);
    
    // Status text based on state
    let statusText = '';
    switch (state) {
        case 'waiting':
            statusText = 'Waiting for peers...';
            break;
        case 'connecting':
            statusText = 'Connecting...';
            break;
        case 'transferring':
            statusText = `${bytesFormatted} / ${totalFormatted}`;
            break;
        case 'complete':
            statusText = `${totalFormatted} — Complete`;
            break;
        case 'error':
            statusText = error || 'Transfer failed';
            break;
        case 'moved':
            statusText = 'Moved to Shares →';
            break;
    }
    
    // Right side info (speed or percent)
    let rightInfo = '';
    if (state === 'transferring') {
        rightInfo = speed ? `${speed} · ${Math.round(percent)}%` : `${Math.round(percent)}%`;
    } else if (state === 'complete') {
        rightInfo = '✓';
    }
    
    // Build action buttons based on context
    let actionsHTML = '';
    if (context === 'home') {
        if (state === 'waiting' && shareLink) {
            // Waiting upload: copy link, view shares, stop
            actionsHTML = `
                <button class="blob-btn copy-link-btn" title="Copy link">📋</button>
                <button class="blob-btn stop-pending-btn" title="Stop sharing">✕</button>
            `;
        } else if (state === 'connecting' || state === 'transferring') {
            // Active transfer: minimize, cancel
            if (type === 'download') {
                actionsHTML = `
                    <button class="blob-btn minimize-download-btn" title="Hide (continues in Shares)">−</button>
                    <button class="blob-btn cancel-download-btn" title="Cancel">✕</button>
                `;
            } else {
                // Upload in progress - just show, no cancel (keep seeding)
                actionsHTML = '';
            }
        } else if (state === 'complete' || state === 'error' || state === 'moved') {
            // Completed/error: dismiss
            actionsHTML = `
                <button class="blob-btn dismiss-btn" title="Dismiss">✕</button>
            `;
        }
    } else if (context === 'shares') {
        // Shares list: different buttons
        actionsHTML = `
            <button class="blob-btn remove-drive-btn" title="Remove">🗑️</button>
        `;
    }
    
    // Data attributes
    const dataAttrs = [
        id ? `data-id="${id}"` : '',
        id ? `data-drive-id="${id}"` : '',
        peerId ? `data-peer-id="${peerId}"` : '',
        shareLink ? `data-share-link="${shareLink}"` : ''
    ].filter(Boolean).join(' ');
    
    // Special case: "moved" notification is clickable
    const clickHandler = state === 'moved' ? `onclick="switchTab('shares')"` : '';
    
    return `
        <div class="transfer-blob ${stateClass}" ${dataAttrs} ${clickHandler}>
            <div class="blob-header">
                <div class="blob-indicator ${indicatorClass}"></div>
                <span class="blob-name">${icon} ${displayName}</span>
                <div class="blob-actions">
                    ${actionsHTML}
                </div>
            </div>
            <div class="blob-progress">
                <div class="${barClass}" style="width: ${barWidth}%"></div>
            </div>
            <div class="blob-stats">
                <span class="blob-status">${statusText}</span>
                <span class="blob-info">${rightInfo}</span>
            </div>
        </div>
    `;
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatFileSize,
        createTransferBlob
    };
}

// Also attach to window for browser context
if (typeof window !== 'undefined') {
    window.TransferBlob = {
        formatFileSize,
        createTransferBlob
    };
}
