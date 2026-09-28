// ═══════════════════════════════════════════════════════════════════════
// Routes — Student Portal Direct Login & Attendance
// Provides a captcha-assisted login flow for sp.srmist.edu.in
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/authToken.js';
import {
  fetchSpLoginPage,
  submitSpLogin,
  fetchAttendanceWithSession,
  fetchMarksWithSession,
} from '../scrapers/studentPortalAuth.js';
import { parseStudentPortalAttendance } from '../scrapers/studentPortalAttendance.js';
import { parseStudentPortalMarks } from '../scrapers/studentPortalMarks.js';
import {
  fetchPlacementBatchWithSession,
  fetchPlacementDetailsWithSession,
  fetchPlacementResourcesWithSession,
} from '../scrapers/studentPortalPlacement.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

// ── GET /api/sp/captcha ───────────────────────────────────────────────
// Fetches the SP login page and returns a captcha image + session token.
// No auth required — this is part of the initial connection flow.
router.get('/sp/captcha', async (req, res) => {
  try {
    const { sessionId, captchaImg } = await fetchSpLoginPage();
    res.json({ sessionId, captchaImg, captchaSvg: captchaImg });
  } catch (err) {
    console.error('[SP Auth] Captcha fetch error:', err.message);
    res.status(502).json({
      error: 'Could not load Student Portal login page',
      detail: err.message,
    });
  }
});

// ── POST /api/sp/login ────────────────────────────────────────────────
// Completes the login using user-provided credentials + captcha.
// On success, fetches attendance, stores session + data, returns attendance.
router.post('/sp/login', requireAuth, async (req, res) => {
  const { sessionId, username, password, captcha, regNumber } = req.body;

  if (!sessionId || !username || !password || !captcha) {
    return res.status(400).json({ error: 'sessionId, username, password and captcha are required' });
  }

  try {
    // 1. Complete the login
    const cleanUsername = username.trim().replace(/@srmist\.edu\.in$/i, '').split('@')[0];
    const { jsessionid, workerCookie, allCookies } = await submitSpLogin(
      sessionId, cleanUsername, password, captcha
    );

    // 2. Fetch attendance using the new session
    let attendanceHtml;
    try {
      attendanceHtml = await fetchAttendanceWithSession(jsessionid, allCookies, regNumber || cleanUsername);
    } catch (attErr) {
      if (attErr.message === 'SESSION_EXPIRED') {
        return res.status(401).json({ error: 'Session established but attendance fetch failed. Try again.' });
      }
      throw attErr;
    }

    // 3. Parse attendance
    const { attendance } = parseStudentPortalAttendance(attendanceHtml);
    if (!attendance || attendance.length === 0) {
      return res.status(422).json({
        error: 'Login succeeded but no attendance data was found.',
        hint: 'Make sure you navigate to the Attendance Details page after connecting.',
      });
    }

    // 4. Fetch and parse internal marks
    let marks = [];
    try {
      const marksResult = await fetchMarksWithSession(jsessionid, allCookies, regNumber || username.split('@')[0]);
      const marksHtml = typeof marksResult === 'string' ? marksResult : marksResult?.html || '';
      const componentsMap = typeof marksResult === 'object' ? marksResult?.componentsMap || {} : {};
      if (marksHtml) {
        const parsedMarks = parseStudentPortalMarks(marksHtml, attendance, componentsMap);
        marks = parsedMarks.marks || [];
      }
    } catch (mErr) {
      console.warn('[SP Auth] Marks fetch failed:', mErr.message);
    }

    // 5. Persist to Supabase
    const supabase = getSupabaseAdmin();
    const reg = regNumber || '';

    if (supabase && reg) {
      // Store session for future refreshes
      try {
        await supabase.from('student_portal_sessions').upsert({
          reg_number: reg,
          jsessionid,
          worker_cookie: allCookies || workerCookie || '',
          stored_at: new Date().toISOString(),
        }, { onConflict: 'reg_number' });
      } catch (e) { console.warn('[SP Auth] Session store failed:', e.message); }

      // Store attendance data
      try {
        await supabase.from('attendance_imports').upsert({
          reg_number: reg,
          attendance_data: attendance,
          source: 'student_portal_direct',
          imported_at: new Date().toISOString(),
        }, { onConflict: 'reg_number' });
      } catch (e) { console.warn('[SP Auth] Attendance store failed:', e.message); }

      // Store marks data
      if (marks.length > 0) {
        try {
          await supabase.from('marks_user_state').upsert({
            reg_number: reg,
            marks_data: marks,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'reg_number' });
        } catch (e) { console.warn('[SP Auth] Marks store failed:', e.message); }
      }
    }

    res.json({
      success: true,
      attendance,
      marks,
      count: attendance.length,
      marksCount: marks.length,
      source: 'student_portal_direct',
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[SP Auth] Login error:', err.message);

    // Distinguish between wrong credentials and server errors
    const isCredentialError = err.message.includes('credentials') ||
      err.message.includes('captcha') ||
      err.message.includes('Invalid') ||
      err.message.includes('expired');

    res.status(isCredentialError ? 401 : 502).json({
      error: err.message,
    });
  }
});

// ── POST /api/sp/refresh ──────────────────────────────────────────────
// Refreshes attendance using a stored JSESSIONID (no re-login needed).
// Returns 401 if the session has expired (triggers re-login on frontend).
router.post('/sp/refresh', requireAuth, async (req, res) => {
  const { regNumber } = req.body;
  if (!regNumber) return res.status(400).json({ error: 'regNumber required' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  // Load stored session
  const { data: sessionData, error } = await supabase
    .from('student_portal_sessions')
    .select('jsessionid, worker_cookie, stored_at')
    .eq('reg_number', regNumber)
    .single();

  if (error || !sessionData?.jsessionid) {
    return res.status(401).json({
      error: 'No stored session found. Please log in to the Student Portal.',
      needsLogin: true,
    });
  }

  try {
    const html = await fetchAttendanceWithSession(
      sessionData.jsessionid,
      sessionData.worker_cookie || '',
      regNumber
    );

    const { attendance } = parseStudentPortalAttendance(html);

    if (!attendance || attendance.length === 0) {
      return res.status(422).json({ error: 'No attendance data returned', needsLogin: false });
    }

    // Fetch marks on refresh too
    let marks = [];
    try {
      const marksResult = await fetchMarksWithSession(
        sessionData.jsessionid,
        sessionData.worker_cookie || '',
        regNumber
      );
      const marksHtml = typeof marksResult === 'string' ? marksResult : marksResult?.html || '';
      const componentsMap = typeof marksResult === 'object' ? marksResult?.componentsMap || {} : {};
      if (marksHtml) {
        const parsedMarks = parseStudentPortalMarks(marksHtml, attendance, componentsMap);
        marks = parsedMarks.marks || [];
      }
    } catch (mErr) {
      console.warn('[SP Auth] Refresh marks failed:', mErr.message);
    }

    // Update stored attendance
    await supabase.from('attendance_imports').upsert({
      reg_number: regNumber,
      attendance_data: attendance,
      source: 'student_portal_direct',
      imported_at: new Date().toISOString(),
    }, { onConflict: 'reg_number' });

    // Update stored marks
    if (marks.length > 0) {
      try {
        await supabase.from('marks_user_state').upsert({
          reg_number: regNumber,
          marks_data: marks,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'reg_number' });
      } catch (e) { console.warn('[SP Auth] Refresh marks store failed:', e.message); }
    }

    res.json({
      success: true,
      attendance,
      marks,
      count: attendance.length,
      marksCount: marks.length,
      source: 'student_portal_direct',
      refreshedAt: new Date().toISOString(),
    });

  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      // Clear stale session
      await supabase.from('student_portal_sessions').delete().eq('reg_number', regNumber);
      return res.status(401).json({
        error: 'Student Portal session expired. Please connect again.',
        needsLogin: true,
      });
    }
    res.status(502).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Placement Insights Dashboard Endpoints
// Restores full access to SRM's hidden Placement Insight Dashboard
// ═══════════════════════════════════════════════════════════════════════

async function getAnyActiveSession(supabase, preferredReg) {
  if (preferredReg) {
    const { data } = await supabase
      .from('student_portal_sessions')
      .select('jsessionid, worker_cookie, stored_at, reg_number')
      .eq('reg_number', preferredReg)
      .maybeSingle();
    if (data?.jsessionid) return data;
  }
  const { data } = await supabase
    .from('student_portal_sessions')
    .select('jsessionid, worker_cookie, stored_at, reg_number')
    .order('stored_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ── GET /api/sp/placement/batches ─────────────────────────────────────
router.get('/sp/placement/batches', (req, res) => {
  res.json({
    batches: [
      { id: '26', label: 'Batch 2027', year: '2027' },
      { id: '25', label: 'Batch 2026', year: '2026' },
      { id: '24', label: 'Batch 2025', year: '2025' },
      { id: '23', label: 'Batch 2024', year: '2024' },
    ],
  });
});

// ── GET /api/sp/placement/companies ───────────────────────────────────
// Fetches the list of visiting companies with roles, CTC, eligibility
router.get('/sp/placement/companies', async (req, res) => {
  const year = req.query.year || '25';
  const force = req.query.force === 'true' || req.query.refresh === '1';
  const regNumber = req.query.regNumber || '';
  const cacheKey = `batch_${year}`;

  const supabase = getSupabaseAdmin();

  // 1. Check cache if not forcing refresh
  if (supabase && !force) {
    try {
      const { data: cached } = await supabase
        .from('placement_insights_cache')
        .select('data, updated_at')
        .eq('key', cacheKey)
        .maybeSingle();

      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        return res.json({
          success: true,
          companies: cached.data,
          count: cached.data.length,
          batchYear: year,
          cached: true,
          updatedAt: cached.updated_at,
        });
      }
    } catch (cErr) {
      console.warn('[SP Placement] Cache read notice:', cErr.message);
    }
  }

  // 2. Fetch fresh from SRM Student Portal
  try {
    const session = await getAnyActiveSession(supabase, regNumber);
    if (!session?.jsessionid) {
      // If we don't have a session, try one last check on cache even if expired
      if (supabase) {
        const { data: fallback } = await supabase
          .from('placement_insights_cache')
          .select('data, updated_at')
          .eq('key', cacheKey)
          .maybeSingle();
        if (fallback?.data) {
          return res.json({
            success: true,
            companies: fallback.data,
            count: fallback.data.length,
            batchYear: year,
            cached: true,
            updatedAt: fallback.updated_at,
          });
        }
      }
      return res.status(401).json({
        error: 'Active Student Portal session required to fetch placement data. Please connect your Student Portal account.',
        needsLogin: true,
      });
    }

    const companies = await fetchPlacementBatchWithSession(
      session.jsessionid,
      session.worker_cookie || '',
      year
    );

    // Save to cache
    if (supabase && companies.length > 0) {
      try {
        await supabase.from('placement_insights_cache').upsert({
          key: cacheKey,
          data: companies,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      } catch (saveErr) {
        console.warn('[SP Placement] Cache save failed:', saveErr.message);
      }
    }

    res.json({
      success: true,
      companies,
      count: companies.length,
      batchYear: year,
      cached: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[SP Placement] Companies fetch failed:', err.message);
    res.status(502).json({
      error: 'Failed to retrieve placement insight companies',
      detail: err.message,
    });
  }
});

// ── GET /api/sp/placement/company/:id ─────────────────────────────────
// Fetches detailed Stagewise Question Matrix (SQM) and Feedback links
router.get('/sp/placement/company/:id', async (req, res) => {
  const companyId = req.params.id;
  const regNumber = req.query.regNumber || '';
  const cacheKey = `company_${companyId}`;
  const supabase = getSupabaseAdmin();

  if (supabase) {
    try {
      const { data: cached } = await supabase
        .from('placement_insights_cache')
        .select('data, updated_at')
        .eq('key', cacheKey)
        .maybeSingle();

      if (cached?.data) {
        return res.json({
          success: true,
          companyId,
          ...cached.data,
          cached: true,
        });
      }
    } catch (cErr) {
      console.warn('[SP Placement] Company cache notice:', cErr.message);
    }
  }

  try {
    const session = await getAnyActiveSession(supabase, regNumber);
    if (!session?.jsessionid) {
      return res.status(401).json({
        error: 'Active Student Portal session required to fetch company details.',
        needsLogin: true,
      });
    }

    const details = await fetchPlacementDetailsWithSession(
      session.jsessionid,
      session.worker_cookie || '',
      companyId
    );

    if (supabase && (details.sqmLink || details.feedbackLink || details.links?.length > 0)) {
      try {
        await supabase.from('placement_insights_cache').upsert({
          key: cacheKey,
          data: details,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      } catch (saveErr) {
        console.warn('[SP Placement] Company cache save failed:', saveErr.message);
      }
    }

    res.json({
      success: true,
      companyId,
      ...details,
      cached: false,
    });
  } catch (err) {
    console.error(`[SP Placement] Detail fetch error for company ${companyId}:`, err.message);
    res.status(502).json({
      error: 'Failed to fetch company placement details',
      detail: err.message,
    });
  }
});

// ── GET /api/sp/placement/resources ───────────────────────────────────
// Fetches learning prep resources, resumes of placed students, aptitude sheets
router.get('/sp/placement/resources', async (req, res) => {
  const regNumber = req.query.regNumber || '';
  const force = req.query.force === 'true' || req.query.refresh === '1';
  const cacheKey = 'resources';
  const supabase = getSupabaseAdmin();

  if (supabase && !force) {
    try {
      const { data: cached } = await supabase
        .from('placement_insights_cache')
        .select('data, updated_at')
        .eq('key', cacheKey)
        .maybeSingle();

      if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
        return res.json({
          success: true,
          resources: cached.data,
          cached: true,
          updatedAt: cached.updated_at,
        });
      }
    } catch (cErr) {
      console.warn('[SP Placement] Resources cache notice:', cErr.message);
    }
  }

  try {
    const session = await getAnyActiveSession(supabase, regNumber);
    if (!session?.jsessionid) {
      // Check fallback cache
      if (supabase) {
        const { data: fallback } = await supabase
          .from('placement_insights_cache')
          .select('data, updated_at')
          .eq('key', cacheKey)
          .maybeSingle();
        if (fallback?.data) {
          return res.json({
            success: true,
            resources: fallback.data,
            cached: true,
            updatedAt: fallback.updated_at,
          });
        }
      }
      return res.status(401).json({
        error: 'Active Student Portal session required to fetch placement resources.',
        needsLogin: true,
      });
    }

    const resources = await fetchPlacementResourcesWithSession(
      session.jsessionid,
      session.worker_cookie || ''
    );

    if (supabase && resources.length > 0) {
      try {
        await supabase.from('placement_insights_cache').upsert({
          key: cacheKey,
          data: resources,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      } catch (saveErr) {
        console.warn('[SP Placement] Resources cache save failed:', saveErr.message);
      }
    }

    res.json({
      success: true,
      resources,
      cached: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[SP Placement] Resources fetch failed:', err.message);
    res.status(502).json({
      error: 'Failed to retrieve placement resources',
      detail: err.message,
    });
  }
});

export default router;

