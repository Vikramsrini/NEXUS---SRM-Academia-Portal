// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Day Order Fetcher
// Reads today's day order from the Academic Planner calendar data
// ═══════════════════════════════════════════════════════════════════════

import { fetchRawAcademicPage } from './fetcher.js';
import { getCalendarUrls, parseSrmCalendar } from './calendar.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Fetches the current day order (DO1–DO5) from the Academic Planner.
 * Falls back to null if not found.
 */
export async function fetchCurrentDayOrder(authCookie) {
  try {
    const now = new Date();
    const todayDate = String(now.getDate());
    const todayMonth = MONTH_NAMES[now.getMonth()];
    const todayYear = String(now.getFullYear());

    const urls = getCalendarUrls();

    for (const url of urls) {
      try {
        const raw = await fetchRawAcademicPage(authCookie, url);
        if (!raw) continue;

        const parsed = parseSrmCalendar(raw);
        if (!parsed.calendar?.length) continue;

        // Find today's month in the calendar
        for (const calMonth of parsed.calendar) {
          // calMonth.month is like "September 2026"
          const monthParts = calMonth.month.split(' ');
          const monthName = monthParts[0];
          const monthYear = monthParts[1] || todayYear;

          if (monthName !== todayMonth || monthYear !== todayYear) continue;

          // Find today's date entry
          for (const day of calMonth.days) {
            if (String(parseInt(day.date)) === todayDate && day.dayOrder) {
              let order = day.dayOrder.trim();
              // Normalize: "1" → "DO1", "DO1" stays
              if (/^\d+$/.test(order)) order = `DO${order}`;
              if (/^DO\d+$/i.test(order)) {
                console.log(`[SRM] Day order from Academic Planner: ${order}`);
                return order.toUpperCase();
              }
            }
          }
        }
      } catch { /* try next URL */ }
    }

    console.log('[SRM] No day order found in Academic Planner for today');
    return null;
  } catch (error) {
    console.error('Failed to fetch day order:', error.message);
    return null;
  }
}
