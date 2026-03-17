// ═══════════════════════════════════════════════════════════════════════
// Routes — User Info
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/authToken.js';
import { fetchRawAcademicPage, getCourseDynamicUrl } from '../scrapers/fetcher.js';
import { parseSrmUserInfo } from '../scrapers/userinfo.js';

const router = Router();

router.get('/userinfo', requireAuth, async (req, res) => {
  try {
    const url = getCourseDynamicUrl();
    const rawData = await fetchRawAcademicPage(req.authCookie, url);
    if (rawData?.error) return res.status(rawData.status || 401).json({ error: rawData.error });
    const parsed = parseSrmUserInfo(rawData);
    if (parsed.error) return res.status(parsed.status || 500).json({ error: parsed.error });
    res.json(parsed);
  } catch (e) {
    console.error('UserInfo API error:', e.message);
    res.status(502).json({ error: 'Failed to fetch user info', detail: e.message });
  }
});

export default router;
