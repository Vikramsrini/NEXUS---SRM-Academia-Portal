// ═══════════════════════════════════════════════════════════════════════
// NEXUS Content Script — Runs on sp.srmist.edu.in
// Scrapes attendance from the Student Portal DOM (which the user has
// already loaded legitimately) and syncs to NEXUS.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SCAN_INTERVAL = 1500;
  const MAX_SCANS = 40; // ~60s total
  let scanCount = 0;
  let alreadySent = false;

  // ── Attendance Page Detection ─────────────────────────────────────

  /**
   * Returns true if the current page is the attendance section.
   * The SPA loads content into the main area — we check a few signals.
   */
  function isOnAttendancePage() {
    const h = document.body.innerText || '';
    return (
      h.includes('Course Wise Attendance') ||
      h.includes('COURSE WISE ATTENDANCE') ||
      h.includes('Attendance Hours') ||
      h.includes('Hours Present') ||
      h.includes('Hours Absent')
    );
  }

  // ── Table Parser ──────────────────────────────────────────────────

  /**
   * Tries to extract attendance from the rendered DOM table.
   *
   * Student Portal table format (from screenshot):
   *   S.No | Course Code | Description | Max. | Att. | Absent | Total%
   *
   * We detect columns dynamically so minor layout changes don't break it.
   */
  function tryExtractAttendance() {
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length < 2) continue;

      // Find the header row (first row with th or the first tr with enough cells)
      const headerRow = rows[0];
      const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
      const headers = headerCells.map(c => c.textContent.trim().toLowerCase());

      // Require at minimum a 'code' column and one of: max / att / absent / %
      const hasCode = headers.some(h => h.includes('code'));
      const hasData = headers.some(h =>
        h.includes('max') || h.includes('att') || h.includes('absent') || h.includes('%') || h.includes('total')
      );

      if (!hasCode || !hasData) continue;

      // Map columns
      const codeIdx    = headers.findIndex(h => h.includes('code'));
      const descIdx    = headers.findIndex(h => h.includes('desc') || h.includes('title') || h.includes('subject'));
      const maxIdx     = headers.findIndex(h => h.includes('max'));
      const attIdx     = headers.findIndex(h => h.includes('att') && !h.includes('absent'));
      const absentIdx  = headers.findIndex(h => h.includes('absent'));
      const pctIdx     = headers.findIndex(h => h.includes('%') || h.includes('total') || h.includes('percentage'));

      const attendance = [];

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td'));
        if (cells.length < 4) continue;

        const get = idx => (idx >= 0 && idx < cells.length)
          ? cells[idx].textContent.trim()
          : '';

        const code = get(codeIdx);
        // Skip S.No / blank / header-repeat rows
        if (!code || /^(\d+|s\.?no|sl\.?|#)$/i.test(code)) continue;
        if (code.length < 4) continue;

        const title = get(descIdx >= 0 ? descIdx : codeIdx + 1);
        if (!title || title.length < 3) continue;

        const maxHours    = get(maxIdx)    || '0';
        const attHours    = get(attIdx)    || '0';
        const absentHours = get(absentIdx) || '0';
        const percentage  = get(pctIdx)    || '0';

        attendance.push({
          code,
          title,
          maxHours,
          attHours,
          absentHours,
          percentage,
        });
      }

      if (attendance.length > 0) {
        console.log(`[NEXUS] ✓ Parsed ${attendance.length} courses from attendance table`);
        return attendance;
      }
    }

    return null;
  }

  // ── Send to NEXUS Backend ─────────────────────────────────────────

  async function sendToNexus(attendance) {
    const settings = await chrome.storage.sync.get(['nexusUrl', 'nexusToken', 'regNumber']);
    const { nexusUrl = '', nexusToken = '', regNumber = '' } = settings;

    // Notify popup that data was found (whether or not settings are ready)
    chrome.runtime.sendMessage({
      type: 'ATTENDANCE_FOUND',
      count: attendance.length,
      needsSetup: !nexusUrl || !nexusToken,
    });

    if (!nexusUrl || !nexusToken) return;

    try {
      const res = await fetch(`${nexusUrl}/api/attendance/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nexusToken}`,
        },
        body: JSON.stringify({ format: 'json', data: attendance, regNumber }),
      });

      const result = await res.json().catch(() => ({}));

      chrome.runtime.sendMessage({
        type: 'SYNC_RESULT',
        success: res.ok,
        count: result.count || attendance.length,
        error: res.ok ? null : (result.error || `HTTP ${res.status}`),
        timestamp: new Date().toISOString(),
      });

      if (res.ok) {
        chrome.storage.sync.set({ lastSync: new Date().toISOString() });
        chrome.storage.local.set({
          lastSyncedAttendance: attendance,
          lastSyncedAt: new Date().toISOString(),
          lastSyncCount: attendance.length,
        });
      }
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'SYNC_RESULT', success: false, error: err.message });
    }
  }

  // ── Scan Loop ─────────────────────────────────────────────────────

  function scan() {
    if (alreadySent || scanCount >= MAX_SCANS) return;
    scanCount++;

    // Only try to extract if we're on the attendance section
    if (!isOnAttendancePage()) return;

    const attendance = tryExtractAttendance();
    if (!attendance || attendance.length === 0) return;

    alreadySent = true;
    console.log(`[NEXUS] Attendance detected (${attendance.length} courses), syncing…`);

    // Cache locally for the popup
    chrome.storage.local.set({
      lastDetectedAttendance: attendance,
      lastDetectedAt: new Date().toISOString(),
    });

    // Auto-send if configured
    chrome.storage.sync.get(['autoSync'], ({ autoSync }) => {
      if (autoSync) {
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

  // Start polling — the SPA loads content asynchronously
  const timer = setInterval(() => {
    scan();
    if (alreadySent || scanCount >= MAX_SCANS) clearInterval(timer);
  }, SCAN_INTERVAL);

  scan(); // immediate first check

  // ── Message Listener (from popup) ────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'MANUAL_SYNC') {
      const attendance = tryExtractAttendance();
      if (attendance && attendance.length > 0) {
        alreadySent = false; // allow re-sending
        sendToNexus(attendance);
        sendResponse({ found: true, count: attendance.length });
      } else if (!isOnAttendancePage()) {
        sendResponse({ found: false, reason: 'not_on_attendance_page' });
      } else {
        sendResponse({ found: false, reason: 'no_table' });
      }
      return true;
    }

    if (msg.type === 'CHECK_ATTENDANCE') {
      const onPage = isOnAttendancePage();
      const attendance = onPage ? tryExtractAttendance() : null;
      sendResponse({
        onPage,
        found: !!(attendance && attendance.length > 0),
        count: attendance ? attendance.length : 0,
      });
      return true;
    }
  });
})();
