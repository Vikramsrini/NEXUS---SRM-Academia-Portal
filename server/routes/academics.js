// ═══════════════════════════════════════════════════════════════════════
// Routes — Academics (Timetable, Attendance, Marks, Courses)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/authToken.js';
import { fetchAcademicPage, fetchRawAcademicPage, fetchTimetablePage, getCourseDynamicUrl } from '../scrapers/fetcher.js';
import { parseAttendance } from '../scrapers/attendance.js';
import { parseMarks } from '../scrapers/marks.js';
import { parseCourses, buildTimetable } from '../scrapers/timetable.js';
import { fetchCurrentDayOrder } from '../scrapers/dayorder.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import * as cheerio from 'cheerio';

/**
 * Helper: Try to load imported attendance from Student Portal as fallback.
 */
async function getImportedAttendanceFallback(regNumber) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase || !regNumber) return null;

    const { data } = await supabase
      .from('attendance_imports')
      .select('attendance_data, imported_at, source')
      .eq('reg_number', regNumber)
      .single();

    if (data?.attendance_data?.length > 0) {
      return {
        attendance: data.attendance_data,
        source: 'student_portal_import',
        importedAt: data.imported_at,
      };
    }
  } catch { /* fallback failed silently */ }
  return null;
}

const router = Router();

// ── Timetable ─────────────────────────────────────────────────────────
router.get('/timetable', requireAuth, async (req, res) => {
  try {
    const html = await fetchTimetablePage(req.authCookie);
    if (!html) {
      return res.json({ timetable: [], source: 'live' });
    }

    const { regNumber, batch, studentName, program, department, section, semester, branch, courses } = parseCourses(html);
    const timetable = buildTimetable(courses, batch);
    const currentDayOrder = await fetchCurrentDayOrder(req.authCookie);

    res.json({
      timetable,
      coursesMetadata: courses,
      regNumber,
      batch,
      name: studentName,
      program,
      department,
      section,
      semester,
      branch,
      currentDayOrder,
      source: 'live',
    });
  } catch (e) {
    console.error('Timetable API error:', e.message);
    res.status(502).json({ error: 'Failed to fetch timetable from Academia', detail: e.message });
  }
});

// ── Attendance ────────────────────────────────────────────────────────
router.get('/attendance', requireAuth, async (req, res) => {
  try {
    const html = await fetchAcademicPage(req.authCookie,
      'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
    const result = parseAttendance(html);
    if (result.attendance?.length > 0) {
      return res.json({ attendance: result.attendance, regNumber: result.regNumber, source: 'live' });
    }
    throw new Error('No attendance data parsed from Academia');
  } catch (e) {
    console.warn('Attendance from Academia failed:', e.message);

    // Fallback to imported Student Portal data
    const regNumber = req.query.regNumber || '';
    const fallback = await getImportedAttendanceFallback(regNumber);
    if (fallback) {
      return res.json({
        attendance: fallback.attendance,
        source: fallback.source,
        importedAt: fallback.importedAt,
      });
    }

    res.json({
      attendance: [],
      source: 'unavailable',
      message: 'Attendance has moved to the Student Portal. Use the NEXUS extension to sync.',
    });
  }
});

// ── Marks ─────────────────────────────────────────────────────────────
router.get('/marks', requireAuth, async (req, res) => {
  try {
    const html = await fetchAcademicPage(req.authCookie,
      'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
    const attResult = parseAttendance(html);
    const marks = parseMarks(html, attResult.attendance);
    res.json({ marks, source: 'live' });
  } catch (e) {
    console.error('Marks API error:', e.message);
    res.status(502).json({ error: 'Failed to fetch marks from Academia', detail: e.message });
  }
});

// ── Combined Academics ────────────────────────────────────────────────
router.get('/academics', requireAuth, async (req, res) => {
  let attendance = [];
  let marks = [];
  let source = 'live';
  let importedAt = null;
  let regNumber = '';

  try {
    const html = await fetchAcademicPage(req.authCookie,
      'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
    const attResult = parseAttendance(html);
    if (attResult.attendance?.length > 0) {
      attendance = attResult.attendance;
      marks = parseMarks(html, attResult.attendance);
      regNumber = attResult.regNumber;
    } else {
      throw new Error('No attendance data from Academia');
    }
  } catch (e) {
    console.warn('Academics from Academia failed:', e.message);

    // Fallback to imported Student Portal data
    const reqRegNumber = req.query.regNumber || '';
    const fallback = await getImportedAttendanceFallback(reqRegNumber);
    if (fallback) {
      attendance = fallback.attendance;
      source = fallback.source;
      importedAt = fallback.importedAt;
    } else {
      source = 'unavailable';
    }
  }

  res.json({
    attendance,
    marks,
    regNumber,
    source,
    importedAt,
    ...(source === 'unavailable' ? { message: 'Attendance has moved to the Student Portal. Use the NEXUS extension to sync.' } : {}),
  });
});

// ── Course Details ────────────────────────────────────────────────────
router.get('/course', requireAuth, async (req, res) => {
  try {
    const url = getCourseDynamicUrl();
    const rawData = await fetchRawAcademicPage(req.authCookie, url);
    if (rawData?.error) return res.status(rawData.status || 401).json({ error: rawData.error });

    // Parse course details from raw response
    const match = rawData.match(/pageSanitizer\.sanitize\('(.*)'\);/s);
    if (!match || !match[1]) return res.status(500).json({ error: 'Failed to extract course details' });

    const decodedHtml = match[1]
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\\/g, '')
      .replace(/\\'/g, "'");

    const $ = cheerio.load(decodedHtml, { decodeEntities: true, lowerCaseTags: true, xmlMode: false });

    let batch = '';
    try { batch = $("td:contains('Batch:')").next('td').find('font').text().trim(); } catch { /* ignore */ }

    const courseList = Array.from($('.course_tbl tr').slice(1)).map(row => {
      const columns = $(row).find('td');
      const get = (idx) => columns[idx] ? $(columns[idx]).text().trim() : '';
      const slotRaw = get(8);
      const courseSlot = slotRaw ? slotRaw.split('-').map(s => s.trim()).filter(Boolean) : [];
      return {
        courseCode: get(1),
        courseTitle: get(2),
        courseCredit: get(3),
        courseCategory: get(4),
        courseType: get(5),
        courseFaculty: get(7),
        courseSlot,
        courseRoomNo: get(9),
      };
    });

    res.json({ courseList, batch, status: 200 });
  } catch (e) {
    console.error('Course API error:', e.message);
    res.status(502).json({ error: 'Failed to fetch course details', detail: e.message });
  }
});

export default router;
