import { Router } from 'express';
import { createHash } from 'crypto';
import { requireAuth } from '../middleware/authToken.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();
const TABLE = 'timetable_user_state';

function isMissingTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return msg.includes('could not find the table')
    || details.includes('could not find the table')
    || error?.code === 'PGRST205';
}

function normalizeRegNumber(regNumber) {
  return String(regNumber || '').trim().toUpperCase();
}

function getUserKey(regNumber) {
  const normalizedReg = normalizeRegNumber(regNumber);
  return createHash('sha256')
    .update(normalizedReg)
    .digest('hex');
}

function ensureClient(res) {
  const supabase = getSupabaseAdmin();
  if (supabase) return supabase;

  res.status(503).json({
    error: 'Supabase is not configured',
    detail: 'Set SUPABASE_URL and a valid SUPABASE_SERVICE_ROLE_KEY (server secret, not publishable key).',
  });
  return null;
}

router.get('/timetable-state', requireAuth, async (req, res) => {
  const regNumber = String(req.query.regNumber || '').trim();
  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber query parameter is required' });
  }

  const supabase = ensureClient(res);
  if (!supabase) return;

  const normalizedRegNumber = normalizeRegNumber(regNumber);
  const userKey = getUserKey(normalizedRegNumber);

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('hidden_classes,updated_at')
      .eq('user_key', userKey)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return res.json({
          regNumber,
          hiddenClasses: [],
          updatedAt: null,
          syncEnabled: false,
          warning: 'Create public.timetable_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      throw error;
    }

    return res.json({
      regNumber: normalizedRegNumber,
      hiddenClasses: Array.isArray(data?.hidden_classes) ? data.hidden_classes : [],
      updatedAt: data?.updated_at || null,
      source: data ? 'supabase' : 'default',
      syncEnabled: true,
    });
  } catch (e) {
    console.error('Timetable state fetch error:', e.message);
    return res.status(502).json({ error: 'Failed to fetch timetable state', detail: e.message });
  }
});

router.put('/timetable-state', requireAuth, async (req, res) => {
  const regNumber = String(req.body.regNumber || '').trim();
  const hiddenClasses = Array.isArray(req.body.hiddenClasses) ? req.body.hiddenClasses : null;

  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber is required' });
  }
  if (!hiddenClasses) {
    return res.status(400).json({ error: 'hiddenClasses must be an array' });
  }

  const supabase = ensureClient(res);
  if (!supabase) return;

  const normalizedRegNumber = normalizeRegNumber(regNumber);
  const userKey = getUserKey(normalizedRegNumber);

  try {
    const payload = {
      user_key: userKey,
      reg_number: normalizedRegNumber,
      hidden_classes: hiddenClasses,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_key' });

    if (error) {
      if (isMissingTableError(error)) {
        return res.json({
          ok: false,
          syncEnabled: false,
          warning: 'Create public.timetable_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      throw error;
    }

    return res.json({ ok: true, updatedAt: payload.updated_at });
  } catch (e) {
    console.error('Timetable state save error:', e.message);
    return res.status(502).json({ error: 'Failed to save timetable state', detail: e.message });
  }
});

export default router;
