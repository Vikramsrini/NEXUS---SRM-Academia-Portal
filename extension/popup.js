// ═══════════════════════════════════════════════════════════════════════
// NEXUS Popup Script
// Manages settings and manual sync triggers
// ═══════════════════════════════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);

// Elements
const statusDot = $('#status-dot');
const statusLabel = $('#status-label');
const lastSyncCard = $('#last-sync-card');
const lastSyncText = $('#last-sync-text');
const nexusUrl = $('#nexus-url');
const nexusToken = $('#nexus-token');
const regNumber = $('#reg-number');
const autoSync = $('#auto-sync');
const saveBtn = $('#save-btn');
const syncBtn = $('#sync-btn');
const messageArea = $('#message-area');

// ── Load saved settings ──────────────────────────────────────────────

chrome.storage.sync.get(
  ['nexusUrl', 'nexusToken', 'regNumber', 'autoSync', 'lastSync'],
  (items) => {
    nexusUrl.value = items.nexusUrl || '';
    nexusToken.value = items.nexusToken || '';
    regNumber.value = items.regNumber || '';
    autoSync.checked = !!items.autoSync;

    if (items.lastSync) {
      lastSyncCard.style.display = 'block';
      lastSyncText.textContent = formatTime(items.lastSync);
    }

    updateStatus(items);
  }
);

// ── Save settings ────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  const url = nexusUrl.value.trim().replace(/\/+$/, ''); // strip trailing slash
  const token = nexusToken.value.trim();
  const reg = regNumber.value.trim();

  if (!url) {
    showMessage('Please enter your NEXUS server URL', 'error');
    return;
  }

  if (!token) {
    showMessage('Please enter your auth token (from NEXUS settings)', 'error');
    return;
  }

  chrome.storage.sync.set({
    nexusUrl: url,
    nexusToken: token,
    regNumber: reg,
    autoSync: autoSync.checked,
  }, () => {
    showMessage('Settings saved!', 'success');
    syncBtn.disabled = false;
    updateStatus({ nexusUrl: url, nexusToken: token });
  });
});

// ── Sync Now ─────────────────────────────────────────────────────────

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';

  try {
    // Try to get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url?.includes('sp.srmist.edu.in')) {
      showMessage('Please open sp.srmist.edu.in first and navigate to your attendance', 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
      return;
    }

    // Ask content script to sync
    chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_SYNC' }, (response) => {
      if (chrome.runtime.lastError) {
        showMessage('Extension not active on this page. Refresh the Student Portal page.', 'error');
      } else if (response?.found) {
        showMessage(`Syncing ${response.count} courses...`, 'info');
      } else {
        showMessage('No attendance table found. Navigate to your attendance page first.', 'error');
      }
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
    });
  } catch (err) {
    showMessage('Error: ' + err.message, 'error');
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Now';
  }
});

// ── Listen for results from content script ───────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SYNC_RESULT') {
    if (msg.success) {
      showMessage(`Synced ${msg.count} courses to NEXUS!`, 'success');
      lastSyncCard.style.display = 'block';
      lastSyncText.textContent = formatTime(msg.timestamp || new Date().toISOString());
    } else {
      showMessage('Sync failed: ' + (msg.error || 'Unknown error'), 'error');
    }
  }

  if (msg.type === 'ATTENDANCE_FOUND') {
    if (msg.needsSetup) {
      showMessage(`Found ${msg.count} courses! Configure your settings above to sync.`, 'info');
    } else {
      showMessage(`Detected ${msg.count} courses on Student Portal`, 'info');
    }
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

function updateStatus(settings) {
  if (settings.nexusUrl && settings.nexusToken) {
    statusDot.className = 'status-dot green';
    statusLabel.textContent = 'Connected to NEXUS';
    syncBtn.disabled = false;
  } else {
    statusDot.className = 'status-dot yellow';
    statusLabel.textContent = 'Setup required';
    syncBtn.disabled = true;
  }
}

function showMessage(text, type) {
  messageArea.innerHTML = `<div class="message ${type}">${text}</div>`;
  if (type === 'success') {
    setTimeout(() => { messageArea.innerHTML = ''; }, 4000);
  }
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;

    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
