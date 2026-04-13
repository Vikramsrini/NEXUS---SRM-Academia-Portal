import { Router } from 'express';
import { requireAuth } from '../middleware/authToken.js';
import { getRecentUpdates } from '../services/snapshots.js';

const router = Router();

router.get('/recent-updates', requireAuth, async (req, res) => {
  const regNumber = String(req.query.regNumber || '').trim().toUpperCase();
  const daysRaw = parseInt(String(req.query.days || '7'), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 60 ? daysRaw : 7;

  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber query parameter is required' });
  }

  try {
    const data = await getRecentUpdates(regNumber, days);
    return res.json(data);
  } catch (e) {
    console.error('Recent updates API error:', e.message);
    return res.status(502).json({ error: 'Failed to fetch recent updates', detail: e.message });
  }
});

export default router;
