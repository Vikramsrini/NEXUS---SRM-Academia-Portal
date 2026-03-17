import { Router } from 'express';
import { createHash } from 'crypto';
import { requireAuth } from '../middleware/authToken.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();
const TABLE = 'od_user_state';

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

router.get('/od-state', requireAuth, async (req, res) => {
  const regNumber = String(req.query.regNumber || '').trim();
  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber query parameter is required' });
  }

  const supabase = ensureClient(res);
  if (!supabase) return;

  const normalizedRegNumber = normalizeRegNumber(regNumber);
  const userKey = getUserKey(normalizedRegNumber);

  try {
    const { data: stableData, error } = await supabase
      .from(TABLE)
      .select('od_dates,manual_adjs,updated_at')
      .eq('user_key', userKey)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return res.json({
          regNumber,
          odDates: [],
          manualAdjs: {},
          updatedAt: null,
          source: 'default',
          syncEnabled: false,
          warning: 'Create public.od_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      throw error;
    }

    let data = stableData;

    // Backward compatibility: older builds keyed by reg+session token.
    // If stable row is missing, fetch latest by reg_number and migrate in-place.
    if (!data) {
      const { data: legacyRows, error: legacyError } = await supabase
        .from(TABLE)
        .select('od_dates,manual_adjs,updated_at')
        .eq('reg_number', normalizedRegNumber)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (legacyError) {
        throw legacyError;
      }

      if (Array.isArray(legacyRows) && legacyRows.length > 0) {
        data = legacyRows[0];
        const migratePayload = {
          user_key: userKey,
          reg_number: normalizedRegNumber,
          od_dates: Array.isArray(data.od_dates) ? data.od_dates : [],
          manual_adjs: data.manual_adjs && typeof data.manual_adjs === 'object' ? data.manual_adjs : {},
          updated_at: data.updated_at || new Date().toISOString(),
        };

        const { error: migrateError } = await supabase
          .from(TABLE)
          .upsert(migratePayload, { onConflict: 'user_key' });

        if (migrateError) {
          throw migrateError;
        }
      }
    }

    return res.json({
      regNumber: normalizedRegNumber,
      odDates: Array.isArray(data?.od_dates) ? data.od_dates : [],
      manualAdjs: data?.manual_adjs && typeof data.manual_adjs === 'object' ? data.manual_adjs : {},
      updatedAt: data?.updated_at || null,
      source: data ? 'supabase' : 'default',
      syncEnabled: true,
    });
  } catch (e) {
    console.error('OD state fetch error:', e.message);
    return res.status(502).json({ error: 'Failed to fetch OD state', detail: e.message });
  }
});

router.put('/od-state', requireAuth, async (req, res) => {
  const regNumber = String(req.body.regNumber || '').trim();
  const odDates = Array.isArray(req.body.odDates) ? req.body.odDates : null;
  const manualAdjs = req.body.manualAdjs;

  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber is required' });
  }
  if (!odDates) {
    return res.status(400).json({ error: 'odDates must be an array' });
  }
  if (!manualAdjs || typeof manualAdjs !== 'object' || Array.isArray(manualAdjs)) {
    return res.status(400).json({ error: 'manualAdjs must be an object' });
  }

  const supabase = ensureClient(res);
  if (!supabase) return;

  const normalizedRegNumber = normalizeRegNumber(regNumber);
  const userKey = getUserKey(normalizedRegNumber);

  try {
    const payload = {
      user_key: userKey,
      reg_number: normalizedRegNumber,
      od_dates: odDates,
      manual_adjs: manualAdjs,
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
          warning: 'Create public.od_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      throw error;
    }

    return res.json({ ok: true, updatedAt: payload.updated_at });
  } catch (e) {
    console.error('OD state save error:', e.message);
    return res.status(502).json({ error: 'Failed to save OD state', detail: e.message });
  }
});

export default router;
