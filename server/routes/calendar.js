// ═══════════════════════════════════════════════════════════════════════
// Routes — Academic Calendar
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/authToken.js';
import { getCalendarUrls, parseSrmCalendar } from '../scrapers/calendar.js';

const router = Router();

/**
 * Fetch calendar with multiple strategies:
 * 1. Authenticated fetch (with user's session cookie)
 * 2. Authenticated fetch with different Accept header
 * 3. Direct POST-based fetch (Zoho Creator embed style)
 */
async function fetchCalendarPage(authCookie, url) {
  // Strategy 1: Standard authenticated GET
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-requested-with': 'XMLHttpRequest',
        'cookie': authCookie,
        'Referer': 'https://academia.srmist.edu.in/',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    // Check if we got the actual page (not login page)
    if (data.includes('Academic_Planner') || data.includes('zmlvalue') || data.includes('pageSanitizer')
        || data.includes('#FAFCFE') || data.includes('FAFCFE')
        || (data.includes('table') && !data.includes('Academic Web Services Login'))) {
      return data;
    }
  } catch (e) {
    console.log('[Calendar] Strategy 1 failed:', e.message);
  }

  // Strategy 2: Fetch as HTML document (not XHR)
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': authCookie,
        'Referer': 'https://academia.srmist.edu.in/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (!data.includes('Academic Web Services Login')) {
      return data;
    }
  } catch (e) {
    console.log('[Calendar] Strategy 2 failed:', e.message);
  }

  return null;
}

router.get('/calendar', requireAuth, async (req, res) => {
  const urls = getCalendarUrls();

  for (const url of urls) {
    try {
      console.log('[Calendar] Trying:', url);
      const rawData = await fetchCalendarPage(req.authCookie, url);

      if (!rawData) {
        console.log('[Calendar] No valid data from:', url);
        continue;
      }

      const parsed = parseSrmCalendar(rawData);
      if (parsed.error) {
        console.log('[Calendar] Parse failed for', url, ':', parsed.error);
        continue;
      }

      if (parsed.calendar?.length > 0) {
        console.log('[Calendar] Success from:', url);
        return res.json(parsed);
      }
    } catch (e) {
      console.log('[Calendar] Error for', url, '-', e.message);
    }
  }

  // If all fetch attempts fail, return a helpful error with context
  res.status(502).json({
    error: 'Calendar data unavailable',
    detail: 'Session may have expired. Please re-login and try again.',
    triedUrls: urls,
  });
});

export default router;
