/**
 * MODULE: transfer-ui.js
 * PURPOSE: Unified transfer progress UI components
 * 
 * EXPORTS:
 *   - formatFileSize(bytes) - Format bytes to human readable
 *   - createProgressBarHTML(percent, options) - Progress bar component
 *   - createTransferStatsHTML(bytesFormatted, totalFormatted, speedFormatted) - Stats line
 *   - createTransferItemHTML(config) - Full transfer item component
 * 
 * DESIGN PRINCIPLES:
 *   - ONE source of truth for all transfer UI
 *   - Same component used for uploads AND downloads
 *   - Consistent styling and structure
 *   - Easy to update in one place
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
 * Create progress bar HTML
 * @param {number} percent - 0-100, or -1 for indeterminate
 * @param {object} options - { showText: bool, status: 'active'|'complete'|'error' }
 * @returns {string} HTML string
 */
function createProgressBarHTML(percent, options = {}) {
    const { showText = false, status = 'active' } = options;
    
    const isIndeterminate = percent < 0;
    const displayPercent = isIndeterminate ? 100 : Math.min(100, Math.max(0, percent));
    const barClass = isIndeterminate ? 'progress-bar indeterminate' : 'progress-bar';
    const percentText = isIndeterminate ? '...' : `${Math.round(percent)}%`;
    
    return `
        <div class="transfer-progress">
            <div class="${barClass}" style="width: ${displayPercent}%"></div>
            ${showText ? `<span class="progress-text">${percentText}</span>` : ''}
        </div>
    `;
}

/**
 * Create transfer stats line HTML
 * @param {string} bytesFormatted - e.g. "72 MB"
 * @param {string} totalFormatted - e.g. "452 MB"  
 * @param {string} speedFormatted - e.g. "2.4 MB/s"
 * @returns {string} HTML string
 */
function createTransferStatsHTML(bytesFormatted, totalFormatted, speedFormatted) {
    return `
        <div class="transfer-stats">
            <span class="transfer-bytes">${bytesFormatted || '0 B'} / ${totalFormatted || '—'}</span>
            <span class="transfer-percent">${speedFormatted || '—'}</span>
        </div>
    `;
}

/**
 * Create full transfer item HTML
 * @param {object} config
 * @param {string} config.id - Unique identifier (peerId or driveId)
 * @param {string} config.idType - 'peer' or 'drive'
 * @param {string} config.displayName - Name to show
 * @param {string} config.type - 'upload' | 'download' | 'pending-share' | 'pending-download'
 * @param {string} config.status - 'connecting' | 'active' | 'complete' | 'error' | 'cancelled'
 * @param {number} config.percent - Progress 0-100
 * @param {string} config.bytesFormatted - Current bytes transferred
 * @param {string} config.totalFormatted - Total size
 * @param {string} config.speedFormatted - Transfer speed
 * @param {string} config.shareLink - Share link (for pending shares)
 * @param {string} config.error - Error message (for error status)
 * @returns {string} HTML string
 */
function createTransferItemHTML(config) {
    const {
        id,
        idType = 'peer',
        displayName = 'Transfer',
        type = 'download',
        status = 'active',
        percent = 0,
        bytesFormatted = '0 B',
        totalFormatted = '—',
        speedFormatted = '—',
        shareLink = '',
        error = ''
    } = config;
    
    // Determine CSS classes
    const statusClass = status === 'complete' ? 'complete' : 
                        status === 'error' || status === 'cancelled' ? 'error' : '';
    const typeClass = type.startsWith('pending') ? 'pending' : '';
    
    // Indicator class
    const indicatorClass = status === 'connecting' ? 'connecting' :
                          status === 'complete' ? 'complete' :
                          status === 'error' || status === 'cancelled' ? 'error' :
                          type === 'download' ? 'downloading' : '';
    
    // Icon based on type
    const icon = type === 'upload' ? '⬆️' : 
                 type === 'download' || type === 'pending-download' ? '⬇️' : '';
    
    // Truncate long names
    let truncatedName = displayName;
    if (truncatedName.length > 30) {
        truncatedName = truncatedName.slice(0, 27) + '...';
    }
    
    // Data attributes
    const dataAttr = idType === 'peer' ? `data-peer-id="${id}"` : `data-drive-id="${id}"`;
    
    // Build the HTML based on type/status
    let headerActions = '';
    let contentHTML = '';
    
    if (type === 'pending-share') {
        // Pending share: show copy link + stop buttons
        headerActions = `
            <div class="transfer-actions">
                <button class="copy-link-btn" title="Copy link">📋</button>
                <button class="stop-pending-btn" title="Stop sharing">✕</button>
            </div>
        `;
        const shortLink = shareLink.replace('peardrop://', '').slice(0, 12) + '...';
        contentHTML = `
            <div class="transfer-info">
                <span class="transfer-file">${truncatedName}</span>
                <span class="transfer-size">${totalFormatted}</span>
            </div>
            <div class="transfer-link" title="Click to copy: ${shareLink}">${shortLink}</div>
        `;
    } else if (type === 'pending-download' && status === 'connecting') {
        // Connecting download: show cancel + status
        headerActions = `
            <div class="transfer-actions">
                <button class="cancel-download-btn" title="Cancel download">✕</button>
            </div>
        `;
        contentHTML = `
            <div class="transfer-info">
                <span class="transfer-status">Connecting...</span>
            </div>
        `;
    } else if (status === 'error' || status === 'cancelled') {
        // Error state
        headerActions = `
            <div class="transfer-actions">
                <button class="cancel-download-btn" title="Dismiss">✕</button>
            </div>
        `;
        contentHTML = `
            <div class="transfer-info">
                <span class="transfer-status error">${error || status}</span>
            </div>
        `;
    } else {
        // Active transfer: show progress
        headerActions = `
            <div class="transfer-actions">
                <span class="transfer-speed">${speedFormatted}</span>
                ${type.includes('download') ? '<button class="cancel-download-btn" title="Cancel">✕</button>' : ''}
            </div>
        `;
        contentHTML = `
            ${createProgressBarHTML(percent)}
            ${createTransferStatsHTML(bytesFormatted, totalFormatted, `${Math.round(percent)}%`)}
        `;
    }
    
    return `
        <div class="transfer-item ${typeClass} ${statusClass}" ${dataAttr} ${shareLink ? `data-share-link="${shareLink}"` : ''}>
            <div class="transfer-header">
                <div class="transfer-peer">
                    <div class="peer-indicator ${indicatorClass}"></div>
                    <span class="peer-name">${icon} ${truncatedName}</span>
                </div>
                ${headerActions}
            </div>
            ${contentHTML}
        </div>
    `;
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatFileSize,
        createProgressBarHTML,
        createTransferStatsHTML,
        createTransferItemHTML
    };
}

// Also attach to window for browser context
if (typeof window !== 'undefined') {
    window.TransferUI = {
        formatFileSize,
        createProgressBarHTML,
        createTransferStatsHTML,
        createTransferItemHTML
    };
}
