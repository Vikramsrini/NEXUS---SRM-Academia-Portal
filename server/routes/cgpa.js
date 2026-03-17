import { Router } from 'express';
import { fetchCgpaReference } from '../scrapers/cgpa.js';
import { requireAuth } from '../middleware/authToken.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();
const TABLE = 'cgpa_user_state';

function normalizeRegNumber(regNumber) {
  return String(regNumber || '').trim().toUpperCase();
}

function isMissingTableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return msg.includes('could not find the table')
    || details.includes('could not find the table')
    || error?.code === 'PGRST205';
}

function isMissingConflictConstraintError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return msg.includes('no unique or exclusion constraint matching the on conflict specification')
    || details.includes('no unique or exclusion constraint matching the on conflict specification')
    || error?.code === '42P10';
}

function ensureClient(res) {
  const supabase = getSupabaseAdmin();
  if (supabase) return supabase;

  return res.json({
    syncEnabled: false,
    warning: 'Set SUPABASE_URL and a valid SUPABASE_SERVICE_ROLE_KEY (server secret, not publishable key).',
  });
}

router.get('/cgpa/reference', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const data = await fetchCgpaReference({ forceRefresh });
    res.json(data);
  } catch (e) {
    console.error('CGPA reference API error:', e.message);
    res.status(502).json({
      error: 'Failed to scrape CGPA reference data',
      detail: e.message,
    });
  }
});

router.get('/cgpa/state', requireAuth, async (req, res) => {
  const regNumber = normalizeRegNumber(req.query.regNumber);
  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber query parameter is required' });
  }

  const maybeClientResponse = ensureClient(res);
  if (!maybeClientResponse?.from) {
    return maybeClientResponse;
  }
  const supabase = maybeClientResponse;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('selected_regulation,selected_course,semester_inputs,updated_at')
      .eq('reg_number', regNumber)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return res.json({
          regNumber,
          selectedRegulation: '',
          selectedCourse: '',
          semesterInputs: {},
          updatedAt: null,
          source: 'default',
          syncEnabled: false,
          warning: 'Create public.cgpa_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      throw error;
    }

    return res.json({
      regNumber,
      selectedRegulation: data?.selected_regulation || '',
      selectedCourse: data?.selected_course || '',
      semesterInputs: data?.semester_inputs && typeof data.semester_inputs === 'object' ? data.semester_inputs : {},
      updatedAt: data?.updated_at || null,
      source: data ? 'supabase' : 'default',
      syncEnabled: true,
    });
  } catch (e) {
    console.error('CGPA state fetch error:', e.message);
    return res.status(502).json({ error: 'Failed to fetch CGPA state', detail: e.message });
  }
});

router.put('/cgpa/state', requireAuth, async (req, res) => {
  const regNumber = normalizeRegNumber(req.body.regNumber);
  const selectedRegulation = String(req.body.selectedRegulation || '').trim();
  const selectedCourse = String(req.body.selectedCourse || '').trim();
  const semesterInputs = req.body.semesterInputs;

  if (!regNumber) {
    return res.status(400).json({ error: 'regNumber is required' });
  }
  if (!semesterInputs || typeof semesterInputs !== 'object' || Array.isArray(semesterInputs)) {
    return res.status(400).json({ error: 'semesterInputs must be an object' });
  }

  const maybeClientResponse = ensureClient(res);
  if (!maybeClientResponse?.from) {
    return maybeClientResponse;
  }
  const supabase = maybeClientResponse;

  try {
    const payload = {
      reg_number: regNumber,
      selected_regulation: selectedRegulation,
      selected_course: selectedCourse,
      semester_inputs: semesterInputs,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'reg_number' });

    if (error) {
      if (isMissingTableError(error)) {
        return res.json({
          ok: false,
          syncEnabled: false,
          warning: 'Create public.cgpa_user_state by running server/supabase/schema.sql in Supabase SQL Editor.',
        });
      }
      if (isMissingConflictConstraintError(error)) {
        return res.json({
          ok: false,
          syncEnabled: false,
          warning: 'Run the latest server/supabase/schema.sql migration to make reg_number a primary key/unique key for cgpa_user_state.',
        });
      }
      throw error;
    }

    return res.json({ ok: true, updatedAt: payload.updated_at, syncEnabled: true });
  } catch (e) {
    console.error('CGPA state save error:', e.message);
    return res.status(502).json({ error: 'Failed to save CGPA state', detail: e.message });
  }
});

export default router;
