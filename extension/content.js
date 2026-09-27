// ═══════════════════════════════════════════════════════════════════════
// NEXUS Content Script — Runs on sp.srmist.edu.in
// Detects attendance data in the Student Portal and sends it to NEXUS
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SCAN_INTERVAL = 2000;   // Re-check every 2s for dynamically loaded tables
  const MAX_SCANS = 30;         // Stop after 60s
  let scanCount = 0;
  let alreadySent = false;

  /**
   * Tries to find and parse the attendance table on the current page.
   * The Student Portal loads attendance via AJAX into a div, so we
   * watch for the table to appear.
   */
  function tryExtractAttendance() {
    // Look for tables with attendance-like headers
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) continue;

      // Check if headers match attendance pattern
      const headerCells = rows[0].querySelectorAll('th, td');
      const headers = Array.from(headerCells).map(c => c.textContent.trim().toLowerCase());

      const hasCode = headers.some(h => h.includes('code'));
      const hasMaxOrAtt = headers.some(h => h.includes('max') || (h.includes('att') && !h.includes('absent')));
      const hasPctOrAbsent = headers.some(h =>
        h.includes('percentage') || h.includes('percent') || h.includes('%') || h.includes('absent')
      );

      if (!hasCode || !hasMaxOrAtt) continue;

      // Found the attendance table — parse it
      const attendance = parseAttendanceTable(table, headers);
      if (attendance.length > 0) {
        return attendance;
      }
    }
    return null;
  }

  /**
   * Parse attendance data from the table element.
   */
  function parseAttendanceTable(table, headers) {
    const rows = table.querySelectorAll('tr');
    const attendance = [];

    // Find column indices
    const codeIdx = headers.findIndex(h => h.includes('code'));
    const descIdx = headers.findIndex(h =>
      h.includes('description') || h.includes('title') || h.includes('subject')
    );
    const maxIdx = headers.findIndex(h => h.includes('max'));
    const attIdx = headers.findIndex(h => h.includes('att') && !h.includes('absent'));
    const absentIdx = headers.findIndex(h => h.includes('absent'));
    const pctIdx = headers.findIndex(h =>
      h.includes('percentage') || h.includes('percent') || h.includes('%')
    );

    // Parse data rows (skip header)
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 4) continue;

      const get = (idx) => idx >= 0 && idx < cells.length ? cells[idx].textContent.trim() : '';

      const code = get(codeIdx);
      const title = get(descIdx >= 0 ? descIdx : codeIdx + 1);

      // Basic validation — skip non-course rows
      if (!code || code.length < 4 || /^(s\.?no|sl|#|\d+)$/i.test(code)) continue;
      if (!title || title.length < 3) continue;

      const maxHours = get(maxIdx);
      const attHours = get(attIdx);
      const absentHours = get(absentIdx);
      const percentage = get(pctIdx);

      attendance.push({
        code,
        title,
        maxHours: maxHours || '0',
        attHours: attHours || '0',
        absentHours: absentHours || '0',
        percentage: percentage || '0',
      });
    }

    return attendance;
  }

  /**
   * Send extracted attendance data to the NEXUS backend.
   */
  async function sendToNexus(attendance) {
    // Get saved settings from extension storage
    const settings = await chrome.storage.sync.get(['nexusUrl', 'nexusToken', 'regNumber']);

    const nexusUrl = settings.nexusUrl || '';
    const token = settings.nexusToken || '';
    const regNumber = settings.regNumber || '';

    if (!nexusUrl || !token) {
      // Notify the popup that data was found but settings are missing
      chrome.runtime.sendMessage({
        type: 'ATTENDANCE_FOUND',
        count: attendance.length,
        needsSetup: true,
      });
      return;
    }

    try {
      const res = await fetch(`${nexusUrl}/api/attendance/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          format: 'json',
          data: attendance,
          regNumber,
        }),
      });

      const result = await res.json();

      chrome.runtime.sendMessage({
        type: 'SYNC_RESULT',
        success: res.ok,
        count: result.count || attendance.length,
        error: res.ok ? null : (result.error || 'Unknown error'),
        timestamp: new Date().toISOString(),
      });

      if (res.ok) {
        // Save last sync time
        chrome.storage.sync.set({ lastSync: new Date().toISOString() });
      }
    } catch (err) {
      chrome.runtime.sendMessage({
        type: 'SYNC_RESULT',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Main scan loop — watches for the attendance table to appear.
   */
  function scan() {
    if (alreadySent || scanCount >= MAX_SCANS) return;
    scanCount++;

    const attendance = tryExtractAttendance();
    if (attendance && attendance.length > 0) {
      alreadySent = true;
      console.log(`[NEXUS] Found ${attendance.length} attendance records`);

      // Store locally for the popup to show
      chrome.storage.local.set({
        lastDetectedAttendance: attendance,
        lastDetectedAt: new Date().toISOString(),
      });

      // Auto-send if configured
      chrome.storage.sync.get(['autoSync'], (settings) => {
        if (settings.autoSync) {
          sendToNexus(attendance);
        } else {
          chrome.runtime.sendMessage({
            type: 'ATTENDANCE_FOUND',
            count: attendance.length,
            needsSetup: false,
          });
        }
      });
    }
  }

  // Start scanning after the page loads
  const timer = setInterval(() => {
    scan();
    if (alreadySent || scanCount >= MAX_SCANS) {
      clearInterval(timer);
    }
  }, SCAN_INTERVAL);

  // Also scan immediately
  scan();

  // Listen for manual sync requests from the popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'MANUAL_SYNC') {
      const attendance = tryExtractAttendance();
      if (attendance && attendance.length > 0) {
        sendToNexus(attendance);
        sendResponse({ found: true, count: attendance.length });
      } else {
        sendResponse({ found: false });
      }
      return true; // keep channel open for async
    }

    if (msg.type === 'CHECK_ATTENDANCE') {
      const attendance = tryExtractAttendance();
      sendResponse({
        found: !!(attendance && attendance.length > 0),
        count: attendance ? attendance.length : 0,
      });
      return true;
    }
  });
})();
