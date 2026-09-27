// ═══════════════════════════════════════════════════════════════════════
// NEXUS Background Service Worker
// Handles badge updates and message relay
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ATTENDANCE_FOUND') {
    // Show badge on extension icon
    chrome.action.setBadgeText({ text: String(msg.count) });
    chrome.action.setBadgeBackgroundColor({ color: msg.needsSetup ? '#f59e0b' : '#22c55e' });
  }

  if (msg.type === 'SYNC_RESULT') {
    if (msg.success) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      // Clear badge after 5 seconds
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);
    } else {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }
  }
});
