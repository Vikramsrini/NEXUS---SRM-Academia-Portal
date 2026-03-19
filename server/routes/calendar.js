import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/authToken.js';
import { getCalendarUrls, parseSrmCalendar } from '../scrapers/calendar.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();
const SYNC_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7; // Weekly refresh

/**
 * Fetch calendar with multiple strategies
 */
async function fetchCalendarPage(authCookie, url) {
  // Strategy 1: Standard XHR
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'accept': '*/*',
        'cookie': authCookie,
        'Referer': 'https://academia.srmist.edu.in/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (data.includes('Academic_Planner') || data.includes('zmlvalue')) return data;
  } catch (e) {}

  // Strategy 2: HTML document
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'cookie': authCookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (data.includes('Academic_Planner') || data.includes('zmlvalue')) return data;
  } catch (e) {}

  return null;
}

router.get('/calendar', requireAuth, async (req, res) => {
  const supabase = getSupabaseAdmin();
  const forceRefresh = req.query.refresh === '1';

  // 1. Try Shared Cache (Supabase)
  if (!forceRefresh && supabase) {
    try {
      const { data, error } = await supabase
        .from('global_calendar')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (data && data.data) {
        const age = Date.now() - new Date(data.updated_at).getTime();
        if (age < SYNC_THRESHOLD_MS) {
          console.log('[Calendar] Returning shared global cache');
          return res.json(data.data);
        }
        console.log('[Calendar] Global cache expired, attempting background sync...');
      }
    } catch (dbErr) {
      console.error('[Calendar DB Error]', dbErr.message);
    }
  }

  // 2. Fetch Fresh Data (Scraper)
  const urls = getCalendarUrls();
  let freshParsed = null;

  for (const url of urls) {
    try {
      const rawData = await fetchCalendarPage(req.authCookie, url);
      if (!rawData) continue;

      const parsed = parseSrmCalendar(rawData);
      if (parsed.calendar?.length > 0) {
        freshParsed = parsed;
        break;
      }
    } catch (e) {
      console.log('[Calendar Scraper Error]', url, e.message);
    }
  }

  // 3. Sync to Shared Cache and Return
  if (freshParsed) {
    if (supabase) {
      try {
        await supabase.from('global_calendar').upsert({
          id: 1,
          data: freshParsed,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
        console.log('[Calendar] Shared global cache updated');
      } catch (saveErr) {
        console.error('[Calendar DB Sync Error]', saveErr.message);
      }
    }
    return res.json(freshParsed);
  }

  // 4. Fallback to stale cache if scraper failed
  if (supabase) {
    try {
       const { data } = await supabase.from('global_calendar').select('*').eq('id', 1).maybeSingle();
       if (data && data.data) {
         console.log('[Calendar] Scraper failed, serving stale global data');
         return res.json({ ...data.data, stale: true, fetchedAt: data.updated_at });
       }
    } catch (e) {}
  }

  res.status(502).json({
    error: 'Calendar data unavailable',
    detail: 'Failed to fetch current academic calendar and no valid cache found.'
  });
});

export default router;
