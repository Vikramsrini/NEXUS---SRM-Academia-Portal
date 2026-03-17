// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Day Order Fetcher
// ═══════════════════════════════════════════════════════════════════════

import { fetchAcademicPage } from './fetcher.js';

/**
 * Fetches the current day order (DO1–DO5) from the Academia homepage.
 * Returns null if not found.
 */
export async function fetchCurrentDayOrder(authCookie) {
  try {
    const homeUrl = 'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance';
    const html = await fetchAcademicPage(authCookie, homeUrl);

    if (!html) return null;

    // "Day Order: DO1"
    const dayOrderMatch = html.match(/Day\s*Order\s*[:-]?\s*(DO\d)/i);
    if (dayOrderMatch) return dayOrderMatch[1];

    // Standalone "DO1"
    const altMatch = html.match(/\b(DO\s*\d)\b/i);
    if (altMatch) return altMatch[1].replace(/\s+/, '');

    return null;
  } catch (error) {
    console.error('Failed to fetch day order:', error.message);
    return null;
  }
}
