/**
 * ═══════════════════════════════════════════════════════════════════════
 * SYNC SERVICE — Unified Data Orchestration
 * ═══════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import { fetchAcademicPage, fetchTimetablePage, fetchRawAcademicPage } from '../scrapers/fetcher.js';
import { parseAttendance } from '../scrapers/attendance.js';
import { parseMarks } from '../scrapers/marks.js';
import { parseCourses, buildTimetable } from '../scrapers/timetable.js';
import { fetchCurrentDayOrder } from '../scrapers/dayorder.js';
import { fetchRealUserInfo } from '../scrapers/userinfo.js';
import { getCalendarUrls, parseSrmCalendar } from '../scrapers/calendar.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Orchestrates a full academic record sync.
 */
export async function performFullSync(authCookie, sessionId, sendStatus = () => { }) {
  const result = {
    attendance: [],
    marks: [],
    timetable: [],
    calendar: [],
    userInfo: { name: '' },
    currentDayOrder: '',
    timestamp: new Date().toISOString()
  };

  try {
    sendStatus(sessionId, 'discover', 'Synchronizing academic profile...');

    // 1. Profile / User Info
    try {
      result.userInfo = await fetchRealUserInfo(authCookie);
    } catch (e) {
      console.warn('[Sync Service] Profile sync failed:', e.message);
    }

    // 2. Attendance & Marks
    try {
      const attHtml = await fetchAcademicPage(authCookie, 'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
      const attResult = parseAttendance(attHtml);
      result.attendance = attResult.attendance || [];
      result.marks = parseMarks(attHtml, result.attendance);

      if (result.attendance.length > 0) {
        sendStatus(sessionId, 'attendance', `Synced ${result.attendance.length} courses and ${result.marks.length} marks`);
      }
    } catch (e) {
      console.warn('[Sync Service] Attendance/Marks sync from Academia failed:', e.message);
    }

    // Fallback: If Academia has no attendance (SRM moved it to Student Portal), load from Supabase attendance_imports
    if (!result.attendance || result.attendance.length === 0) {
      try {
        const regNumber = result.userInfo?.regNumber || result.userInfo?.registrationNumber || '';
        if (regNumber) {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: imported } = await supabase
              .from('attendance_imports')
              .select('attendance_data, imported_at, source')
              .eq('reg_number', regNumber)
              .single();

            if (imported?.attendance_data?.length > 0) {
              result.attendance = imported.attendance_data;
              result.attendanceSource = imported.source || 'student_portal_direct';
              result.attendanceImportedAt = imported.imported_at;
              sendStatus(sessionId, 'attendance', `Loaded ${result.attendance.length} courses from Student Portal (${new Date(imported.imported_at).toLocaleDateString()})`);
            } else {
              sendStatus(sessionId, 'attendance', 'Attendance unavailable — connect Student Portal to sync');
            }
          }
        }
      } catch (fallbackErr) {
        console.warn('[Sync Service] Imported attendance fallback failed:', fallbackErr.message);
      }
    }

    // Fallback: If Academia has no marks, load saved marks from Supabase marks_user_state
    if (!result.marks || result.marks.length === 0) {
      try {
        const regNumber = result.userInfo?.regNumber || result.userInfo?.registrationNumber || '';
        if (regNumber) {
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const { data: savedMarks } = await supabase
              .from('marks_user_state')
              .select('marks_data')
              .eq('reg_number', regNumber)
              .single();

            if (savedMarks?.marks_data?.length > 0) {
              result.marks = savedMarks.marks_data;
              sendStatus(sessionId, 'marks', `Loaded ${result.marks.length} course marks from saved state`);
            }
          }
        }
      } catch (mErr) {
        console.warn('[Sync Service] Saved marks fallback failed:', mErr.message);
      }
    }

    // 3. Timetable
    try {
      const ttHtml = await fetchTimetablePage(authCookie);
      if (ttHtml) {
        const ttResult = parseCourses(ttHtml);
        result.timetable = buildTimetable(ttResult.courses, ttResult.batch);
        result.userInfo = { ...ttResult, ...result.userInfo, name: result.userInfo.name || ttResult.studentName };
      }
      sendStatus(sessionId, 'timetable', `Synced timetable (${result.timetable.length} classes)`);
    } catch (e) {
      console.warn('[Sync Service] Timetable sync failed:', e.message);
    }

    // 4. Calendar (Multi-URL)
    try {
      const urls = getCalendarUrls();
      for (const url of urls) {
        try {
          const raw = await fetchRawAcademicPage(authCookie, url);
          if (raw) {
            const parsed = parseSrmCalendar(raw);
            if (parsed.calendar?.length > 0) {
              result.calendar = parsed.calendar;
              break;
            }
          }
        } catch { /* skip */ }
      }
    } catch (e) {
      console.warn('[Sync Service] Calendar sync failed:', e.message);
    }

    // 5. Day Order
    try {
      result.currentDayOrder = await fetchCurrentDayOrder(authCookie);
    } catch (e) {
      console.warn('[Sync Service] Day Order sync failed:', e.message);
    }

    // Final Default
    if (!result.userInfo.name || result.userInfo.name.trim().length <= 2) {
      result.userInfo.name = '';
    }

    return result;
  } catch (err) {
    console.error('[Sync Service] Critical failure:', err.message);
    throw err;
  }
}

/**
 * Repairs a missing Academia session if only Zoho Auth is present.
 */
export async function repairAcademiaSession(authCookies) {
  console.log('[Sync Service] Attempting HTTP session repair...');
  const repairUrl = 'https://academia.srmist.edu.in/portal/academia-academic-services/redirectFromLogin';

  try {
    const resp = await axios.get(repairUrl, {
      headers: { cookie: authCookies },
      maxRedirects: 5,
      validateStatus: () => true
    });

    const setCookie = resp.headers['set-cookie'];
    if (setCookie) {
      const newCookies = setCookie.map(c => c.split(';')[0]).join('; ');
      return authCookies + '; ' + newCookies;
    }
    return authCookies;
  } catch (e) {
    console.error('[Sync Service] Repair failed:', e.message);
    return authCookies;
  }
}
