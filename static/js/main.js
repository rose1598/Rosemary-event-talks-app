// Global App State
let appState = {
    releases: [],
    activeTypes: [],
    searchQuery: '',
    lastUpdated: null
};

// DOM Elements
const elements = {
    notesContainer: document.getElementById('notes-container'),
    searchInput: document.getElementById('search-input'),
    typeFilters: document.getElementById('type-filters'),
    refreshBtn: document.getElementById('refresh-btn'),
    retryBtn: document.getElementById('retry-btn'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    resultsCount: document.getElementById('results-count'),
    lastSyncTime: document.getElementById('last-sync-time'),
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalTweetBtn: document.getElementById('modal-tweet-btn'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    progressCircle: document.getElementById('progress-ring-circle'),
    
    // Preview
    tweetPreviewDate: document.getElementById('tweet-preview-date'),
    tweetPreviewType: document.getElementById('tweet-preview-type'),
    tweetPreviewText: document.getElementById('tweet-preview-text'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

// Event Listeners Configuration
function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', refreshFeed);
    elements.retryBtn.addEventListener('click', fetchReleases);
    
    elements.searchInput.addEventListener('input', (e) => {
        appState.searchQuery = e.target.value.trim().toLowerCase();
        renderReleases();
    });
    
    // Modal Close
    elements.modalCloseBtn.addEventListener('click', closeModal);
    elements.modalCancelBtn.addEventListener('click', closeModal);
    
    // Close modal on click outside
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeModal();
    });
    
    // Tweet Textarea Input Handler
    elements.tweetTextarea.addEventListener('input', handleTweetTextareaInput);
    
    // Launch Twitter Intent
    elements.modalTweetBtn.addEventListener('click', publishTweet);
}

// Fetch Release Notes from API
async function fetchReleases() {
    showState('loading');
    try {
        const response = await fetch('/api/releases');
        const result = await response.json();
        
        if (result.success) {
            processData(result.data);
            showState('content');
            showToast('Release notes loaded successfully');
        } else {
            showError(result.error || 'Server failed to return release data.');
        }
    } catch (err) {
        showError(err.message || 'Failed to fetch release notes from API.');
    }
}

// Force Refetch of Feed
async function refreshFeed() {
    elements.refreshBtn.classList.add('syncing');
    elements.refreshBtn.disabled = true;
    
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
        indicator.className = 'status-indicator syncing';
    }
    
    try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            processData(result.data);
            showState('content');
            showToast('Feed refreshed from Google Cloud!');
        } else {
            showToast('Failed to refresh: ' + (result.error || 'Unknown error'), true);
        }
    } catch (err) {
        showToast('Network error refreshing feed: ' + err.message, true);
    } finally {
        elements.refreshBtn.classList.remove('syncing');
        elements.refreshBtn.disabled = false;
        if (indicator) {
            indicator.className = 'status-indicator online';
        }
    }
}

// Process and Cache API Data
function processData(data) {
    appState.releases = data.releases || [];
    appState.lastUpdated = data.last_updated;
    
    // Set status time
    if (appState.lastUpdated) {
        const date = new Date(appState.lastUpdated * 1000);
        elements.lastSyncTime.textContent = `Synced: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Calculate Analytics
    const totalCount = appState.releases.length;
    const featureCount = appState.releases.filter(r => r.type.toLowerCase() === 'feature').length;
    
    elements.statTotal.textContent = totalCount;
    elements.statFeatures.textContent = featureCount;
    
    // Rebuild Type Filter list
    buildTypeFilters();
    
    // Render
    renderReleases();
}

// Dynamically generate the categories filter checklist
function buildTypeFilters() {
    const types = {};
    appState.releases.forEach(r => {
        types[r.type] = (types[r.type] || 0) + 1;
    });
    
    // Sort types alphabetically
    const sortedTypes = Object.keys(types).sort();
    
    elements.typeFilters.innerHTML = '';
    
    sortedTypes.forEach(type => {
        const isActive = appState.activeTypes.includes(type);
        const colorClass = getStatusColorHex(type);
        
        const filterItem = document.createElement('div');
        filterItem.className = `filter-item ${isActive ? 'active' : ''}`;
        filterItem.dataset.type = type;
        
        filterItem.innerHTML = `
            <div class="filter-label-group">
                <div class="filter-checkbox"></div>
                <span class="filter-dot" style="background-color: ${colorClass}"></span>
                <span>${type}</span>
            </div>
            <span class="filter-count">${types[type]}</span>
        `;
        
        filterItem.addEventListener('click', () => toggleTypeFilter(type));
        elements.typeFilters.appendChild(filterItem);
    });
}

// Toggle a category filter
function toggleTypeFilter(type) {
    const index = appState.activeTypes.indexOf(type);
    if (index > -1) {
        appState.activeTypes.splice(index, 1);
    } else {
        appState.activeTypes.push(type);
    }
    
    // Update visual state of filter buttons
    document.querySelectorAll('.filter-item').forEach(item => {
        const itemType = item.dataset.type;
        if (appState.activeTypes.includes(itemType)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    renderReleases();
}

// Render filtered Release Note cards
function renderReleases() {
    elements.notesContainer.innerHTML = '';
    
    // Filter
    const filtered = appState.releases.filter(r => {
        // Type filter check
        if (appState.activeTypes.length > 0 && !appState.activeTypes.includes(r.type)) {
            return false;
        }
        
        // Search query check
        if (appState.searchQuery) {
            const dateStr = r.date.toLowerCase();
            const textStr = r.text.toLowerCase();
            const typeStr = r.type.toLowerCase();
            if (!dateStr.includes(appState.searchQuery) && 
                !textStr.includes(appState.searchQuery) && 
                !typeStr.includes(appState.searchQuery)) {
                return false;
            }
        }
        
        return true;
    });
    
    // Update Count Labels
    elements.resultsCount.textContent = `Showing ${filtered.length} of ${appState.releases.length} updates`;
    
    if (filtered.length === 0) {
        elements.notesContainer.innerHTML = `
            <div class="error-state">
                <div class="error-icon" style="background: rgba(99,102,241,0.08); color: var(--color-indigo);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </div>
                <h3>No updates found</h3>
                <p>Try adjusting your search criteria or type filters.</p>
            </div>
        `;
        return;
    }
    
    // Render Cards
    filtered.forEach(release => {
        const typeLower = release.type.toLowerCase();
        const card = document.createElement('article');
        card.className = `note-card type-${typeLower}`;
        
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    <span class="card-date">${release.date}</span>
                    <span class="badge badge-${typeLower}">${release.type}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-icon copy-btn-card" title="Copy text to clipboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="btn-icon tweet-btn-card" title="Draft a tweet about this update">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${release.html}
            </div>
        `;
        
        // Copy Event
        card.querySelector('.copy-btn-card').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(release.text);
            showToast('Content copied to clipboard!');
        });
        
        // Tweet Dialog Event
        card.querySelector('.tweet-btn-card').addEventListener('click', (e) => {
            e.stopPropagation();
            openTweetModal(release);
        });
        
        elements.notesContainer.appendChild(card);
    });
}

// Open Tweet Composer Modal
function openTweetModal(release) {
    elements.tweetPreviewDate.textContent = release.date;
    elements.tweetPreviewType.textContent = release.type;
    elements.tweetPreviewType.className = `badge badge-${release.type.toLowerCase()}`;
    elements.tweetPreviewText.textContent = release.text;
    
    // Construct tweet content
    const tweetText = buildTweetDraft(release);
    elements.tweetTextarea.value = tweetText;
    
    handleTweetTextareaInput();
    
    elements.tweetModal.classList.remove('hidden');
}

// Close Tweet Composer Modal
function closeModal() {
    elements.tweetModal.classList.add('hidden');
}

// Build Tweet Draft adhering to 280 limit
function buildTweetDraft(release) {
    const emojis = {
        'Feature': '🚀',
        'Announcement': '📢',
        'Changed': '🔄',
        'Deprecated': '⚠️',
        'Issue': '🐛',
        'General': '💡'
    };
    const emoji = emojis[release.type] || '📢';
    
    const header = `${emoji} BigQuery Update (${release.date}):\n`;
    const hashtags = `\n\n#BigQuery #GoogleCloud #GCP`;
    
    // Max characters available for the description body
    const maxBodyLength = 280 - header.length - hashtags.length - 4; // safety margins
    
    let textBody = release.text;
    if (textBody.length > maxBodyLength) {
        textBody = textBody.substring(0, maxBodyLength - 3) + '...';
    }
    
    return `${header}${textBody}${hashtags}`;
}

// Handle Character counter and Progress Circle
function handleTweetTextareaInput() {
    const length = elements.tweetTextarea.value.length;
    elements.charCounter.textContent = `${length} / 280`;
    
    // Update progress circle (radius = 8, circumference = 50.26)
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const percentage = Math.min(length / 280, 1);
    const offset = circumference - (percentage * circumference);
    
    elements.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    elements.progressCircle.style.strokeDashoffset = offset;
    
    // Color thresholds
    if (length > 280) {
        elements.charCounter.className = 'char-counter over-limit';
        elements.progressCircle.style.stroke = '#ef4444'; // Red
        elements.modalTweetBtn.disabled = true;
    } else if (length >= 240) {
        elements.charCounter.className = 'char-counter near-limit';
        elements.progressCircle.style.stroke = '#f59e0b'; // Amber
        elements.modalTweetBtn.disabled = false;
    } else {
        elements.charCounter.className = 'char-counter';
        elements.progressCircle.style.stroke = '#3b82f6'; // Blue
        elements.modalTweetBtn.disabled = false;
    }
}

// Launch Twitter intent
function publishTweet() {
    const tweetText = elements.tweetTextarea.value;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    
    closeModal();
    showToast('Opening Twitter composer tab...');
}

// Render status color codes matching CSS
function getStatusColorHex(type) {
    const colors = {
        'Feature': '#10b981',
        'Announcement': '#3b82f6',
        'Changed': '#f59e0b',
        'Deprecated': '#ef4444',
        'Issue': '#f43f5e',
        'General': '#8b5cf6'
    };
    return colors[type] || '#8b5cf6';
}

// View manager states
function showState(state) {
    if (state === 'loading') {
        elements.loadingState.classList.remove('hidden');
        elements.errorState.classList.add('hidden');
        elements.notesContainer.classList.add('hidden');
    } else if (state === 'error') {
        elements.loadingState.classList.add('hidden');
        elements.errorState.classList.remove('hidden');
        elements.notesContainer.classList.add('hidden');
    } else {
        elements.loadingState.classList.add('hidden');
        elements.errorState.classList.add('hidden');
        elements.notesContainer.classList.remove('hidden');
    }
}

// Handle Error display
function showError(msg) {
    elements.errorMessage.textContent = msg;
    showState('error');
}

// Show Toast messages
let toastTimeout;
function showToast(message, isError = false) {
    elements.toastMessage.textContent = message;
    
    if (isError) {
        elements.toast.style.backgroundColor = 'var(--color-issue)';
        elements.toast.style.boxShadow = '0 10px 15px -3px rgba(244, 63, 94, 0.3)';
    } else {
        elements.toast.style.backgroundColor = '#10b981';
        elements.toast.style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.3)';
    }
    
    elements.toast.classList.remove('hidden');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 3500);
}
