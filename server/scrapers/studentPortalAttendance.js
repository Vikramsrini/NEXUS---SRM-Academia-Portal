// ═══════════════════════════════════════════════════════════════════════
// SRM Student Portal — Attendance Parser
// Parses attendance data from sp.srmist.edu.in HTML table format
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';
import { cleanCourseCode, cleanCourseTitle, detectSlotType, looksLikeCourseCode } from '../utils/courses.js';

/**
 * Parses attendance HTML from the Student Portal (sp.srmist.edu.in).
 *
 * Expected table format:
 *   S.No | Code | Description | Max. hours | Att. hours | Absent hours | Total Percentage
 *
 * This is simpler than the old Academia format — no slot column.
 * SlotType is inferred from course code and title.
 */
export function parseStudentPortalAttendance(html) {
  if (!html || typeof html !== 'string') {
    return { attendance: [], source: 'student_portal' };
  }

  const $ = cheerio.load(html, { decodeEntities: true });
  const attendance = [];

  // Strategy 1: Find table with attendance-like headers
  $('table').each((_, table) => {
    if (attendance.length > 0) return; // Already found data

    const rows = $(table).find('tr');
    if (rows.length < 2) return;

    // Check headers
    const headerRow = rows.first();
    const headers = headerRow.find('th, td').map((__, cell) => $(cell).text().trim().toLowerCase()).get();

    const hasCode = headers.some(h => h.includes('code'));
    const hasDesc = headers.some(h => h.includes('description') || h.includes('title') || h.includes('subject'));
    const hasMax = headers.some(h => h.includes('max'));
    const hasAtt = headers.some(h => h.includes('att') && !h.includes('absent'));
    const hasAbsent = headers.some(h => h.includes('absent'));
    const hasPct = headers.some(h => h.includes('percentage') || h.includes('percent') || h.includes('%'));

    if (!hasCode || !(hasMax || hasAtt || hasPct)) return;

    // Find column indices
    const codeIdx = headers.findIndex(h => h.includes('code'));
    const descIdx = headers.findIndex(h => h.includes('description') || h.includes('title') || h.includes('subject'));
    const maxIdx = headers.findIndex(h => h.includes('max'));
    const attIdx = headers.findIndex(h => h.includes('att') && !h.includes('absent'));
    const absentIdx = headers.findIndex(h => h.includes('absent'));
    const pctIdx = headers.findIndex(h => h.includes('percentage') || h.includes('percent') || h.includes('%'));

    // Parse data rows
    rows.slice(1).each((__, row) => {
      const cols = $(row).find('td');
      if (cols.length < 4) return;

      const get = (idx) => idx >= 0 && idx < cols.length ? $(cols[idx]).text().trim() : '';

      const courseCodeRaw = get(codeIdx);
      const courseCode = cleanCourseCode(courseCodeRaw);
      const rawTitle = get(descIdx >= 0 ? descIdx : codeIdx + 1);
      const courseTitle = cleanCourseTitle(rawTitle);

      if (!courseCode || !looksLikeCourseCode(courseCode)) return;
      if (!courseTitle || courseTitle.toLowerCase() === 'null' || courseTitle.length < 3) return;

      const maxHours = parseInt(get(maxIdx)) || 0;
      const attHours = parseInt(get(attIdx)) || 0;
      const absentHours = parseInt(get(absentIdx)) || 0;

      let percentage = 0;
      if (pctIdx >= 0) {
        const pctText = get(pctIdx);
        const pctMatch = pctText.match(/([\d.]+)/);
        percentage = pctMatch ? parseFloat(pctMatch[1]) : 0;
      } else if (maxHours > 0) {
        percentage = ((maxHours - absentHours) / maxHours) * 100;
      }

      // Determine conducted and absent hours
      // Student Portal uses "Max. hours" (total conducted) and "Absent hours"
      const conductedNum = maxHours > 0 ? maxHours : (attHours + absentHours);
      const absentNum = absentHours > 0 ? absentHours : (conductedNum - attHours);

      // Infer slot type from course code and title (no slot column in new portal)
      const slotType = detectSlotType([], courseCode, rawTitle);

      attendance.push({
        courseCode,
        courseTitle,
        slot: 'N/A', // Student Portal doesn't provide slot info
        slotType,
        hoursConducted: String(conductedNum),
        hoursAbsent: String(Math.max(0, absentNum)),
        attendancePercentage: percentage.toFixed(2),
      });
    });
  });

  // Strategy 2: If no table found, try parsing raw text rows
  // (some Student Portal pages render plain text tables)
  if (attendance.length === 0) {
    const lines = html.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Try to match tab/pipe-separated values: Code | Title | Max | Att | Absent | Pct
      const parts = line.split(/[|\t]+/).map(p => p.trim());
      if (parts.length < 5) continue;

      const courseCode = cleanCourseCode(parts[0]) || cleanCourseCode(parts[1]);
      if (!looksLikeCourseCode(courseCode)) continue;

      const titleIdx = parts[0] === courseCode ? 1 : 2;
      const courseTitle = cleanCourseTitle(parts[titleIdx] || '');
      if (!courseTitle || courseTitle.length < 3) continue;

      // Try to extract numbers from remaining parts
      const nums = parts.slice(titleIdx + 1).map(p => parseFloat(p.replace(/[^\d.]/g, '')));
      const validNums = nums.filter(n => !isNaN(n));
      if (validNums.length < 2) continue;

      const maxHours = validNums[0] || 0;
      const absentHours = validNums.length >= 3 ? validNums[2] : 0;
      const percentage = validNums[validNums.length - 1] || 0;

      const slotType = detectSlotType([], courseCode, courseTitle);

      attendance.push({
        courseCode,
        courseTitle,
        slot: 'N/A',
        slotType,
        hoursConducted: String(maxHours),
        hoursAbsent: String(Math.max(0, absentHours)),
        attendancePercentage: percentage.toFixed(2),
      });
    }
  }

  return { attendance, source: 'student_portal' };
}

/**
 * Parses attendance from raw JSON data (browser extension format).
 * Expects: [{ code, title, maxHours, attHours, absentHours, percentage }]
 */
export function parseStudentPortalAttendanceJson(data) {
  if (!Array.isArray(data)) {
    return { attendance: [], source: 'student_portal' };
  }

  const attendance = data
    .filter(row => {
      const code = cleanCourseCode(row.code || row.courseCode || '');
      return code && looksLikeCourseCode(code);
    })
    .map(row => {
      const courseCode = cleanCourseCode(row.code || row.courseCode || '');
      const courseTitle = cleanCourseTitle(row.title || row.courseTitle || row.description || '');
      const maxHours = parseInt(row.maxHours || row.hoursConducted || row.max || 0) || 0;
      const attHours = parseInt(row.attHours || row.hoursPresent || row.att || 0) || 0;
      const absentHours = parseInt(row.absentHours || row.hoursAbsent || row.absent || 0) || 0;
      const percentage = parseFloat(row.percentage || row.attendancePercentage || row.pct || 0) || 0;

      const conductedNum = maxHours > 0 ? maxHours : (attHours + absentHours);
      const absentNum = absentHours > 0 ? absentHours : Math.max(0, conductedNum - attHours);

      const slotType = detectSlotType([], courseCode, courseTitle);

      return {
        courseCode,
        courseTitle,
        slot: 'N/A',
        slotType,
        hoursConducted: String(conductedNum),
        hoursAbsent: String(absentNum),
        attendancePercentage: percentage.toFixed(2),
      };
    })
    .filter(a => a.courseTitle && a.courseTitle.toLowerCase() !== 'null' && a.courseTitle.length >= 3);

  return { attendance, source: 'student_portal' };
}
