// ═══════════════════════════════════════════════════════════════════════
// Routes — Attendance Import (from Student Portal via extension/paste)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/authToken.js';
import {
  parseStudentPortalAttendance,
  parseStudentPortalAttendanceJson,
} from '../scrapers/studentPortalAttendance.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

/**
 * POST /api/attendance/import
 *
 * Accepts attendance data from the browser extension or manual paste.
 * Body can be:
 *   { format: 'json', data: [ { code, title, maxHours, ... } ] }
 *   { format: 'html', data: '<table>...</table>' }
 *   { format: 'text', data: 'tab-separated rows' }
 *
 * Stores in Supabase and updates localStorage-compatible response.
 */
router.post('/attendance/import', requireAuth, async (req, res) => {
  try {
    const { format, data, regNumber } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'No attendance data provided' });
    }

    let result;

    switch (format) {
      case 'json':
        result = parseStudentPortalAttendanceJson(data);
        break;
      case 'html':
      case 'text':
      default:
        result = parseStudentPortalAttendance(typeof data === 'string' ? data : JSON.stringify(data));
        break;
    }

    if (!result.attendance || result.attendance.length === 0) {
      return res.status(400).json({
        error: 'Could not parse any attendance data from the provided input',
        hint: 'Make sure you\'re sending the attendance table data from the Student Portal',
      });
    }

    // Try to persist to Supabase as a snapshot
    const userId = regNumber || 'unknown';
    const supabase = getSupabaseAdmin();

    if (supabase) {
      try {
        await supabase
          .from('attendance_imports')
          .upsert({
            reg_number: userId,
            attendance_data: result.attendance,
            source: 'student_portal',
            imported_at: new Date().toISOString(),
          }, { onConflict: 'reg_number' });
      } catch (dbErr) {
        // Non-fatal — table might not exist yet
        console.warn('[Import] DB save failed (non-fatal):', dbErr.message);
      }
    }

    res.json({
      success: true,
      attendance: result.attendance,
      count: result.attendance.length,
      source: 'student_portal',
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Import] Error:', err.message);
    res.status(500).json({ error: 'Failed to process attendance import', detail: err.message });
  }
});

/**
 * GET /api/attendance/imported
 *
 * Returns the last imported attendance data for the current user.
 */
router.get('/attendance/imported', requireAuth, async (req, res) => {
  try {
    const regNumber = req.query.regNumber;
    if (!regNumber) {
      return res.status(400).json({ error: 'regNumber query param required' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ attendance: [], source: 'none', message: 'Database not configured' });
    }

    const { data, error } = await supabase
      .from('attendance_imports')
      .select('attendance_data, imported_at, source')
      .eq('reg_number', regNumber)
      .single();

    if (error || !data) {
      return res.json({ attendance: [], source: 'none' });
    }

    res.json({
      attendance: data.attendance_data || [],
      source: data.source || 'student_portal',
      importedAt: data.imported_at,
    });

  } catch (err) {
    console.error('[Import] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch imported attendance' });
  }
});

export default router;
