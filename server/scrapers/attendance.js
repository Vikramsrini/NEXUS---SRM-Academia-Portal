// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Attendance Parser
// Multi-strategy parser for the My_Attendance page
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';
import { normalizeKey } from '../utils/html.js';
import { extractSlotCodes } from '../utils/slots.js';
import { cleanCourseCode, cleanCourseTitle, detectSlotType, looksLikeCourseCode } from '../utils/courses.js';

/**
 * Parses attendance from the My_Attendance page HTML using 3 strategies:
 *   1. Styled table with font-size:16px and bgcolor=#FAFAD2
 *   2. Cells with bgcolor=#E6E6FA
 *   3. Generic table with attendance-like headers
 */
export function parseAttendance(decodedHtml) {
  const regNumberMatch = decodedHtml.match(/RA2\d{12}/);
  const regNumber = regNumberMatch ? regNumberMatch[0] : '';

  const cleanHtml = decodedHtml.replace(/<td {2}bgcolor='#E6E6FA' style='text-align:center'> - <\/td>/g, '');
  const $ = cheerio.load(cleanHtml);
  let attendance = [];

  // ── Strategy 1: Styled table ──────────────────────────────────────
  const styledTable = $('table[style*="font-size"]').filter((_, el) => {
    const style = $(el).attr('style') || '';
    const bgcolor = $(el).attr('bgcolor') || '';
    return style.includes('16px') && bgcolor.toUpperCase() === '#FAFAD2';
  });

  if (styledTable.length > 0) {
    styledTable.find('tr').slice(1).each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length < 6) return;

      const get = (idx) => cols[idx] ? $(cols[idx]).text().trim() : '';
      const courseCodeRaw = cols[0] ? $(cols[0]).contents().first().text().trim() : '';
      const courseCode = cleanCourseCode(courseCodeRaw);
      const rawTitle = get(1);
      const courseTitle = cleanCourseTitle(rawTitle);

      let slot, conductedNum, absentNum, percentage;

      if (cols.length >= 9) {
        slot = get(4);
        conductedNum = parseInt(get(6)) || 0;
        absentNum = parseInt(get(7)) || 0;
        const attStr = cols[8] ? $(cols[8]).find('strong').text().trim() : get(8);
        percentage = parseFloat(attStr) || 0;
      } else {
        slot = get(4);
        const attendanceStr = cols[5] ? $(cols[5]).find('strong').text().trim() : get(5);
        const percentMatch = attendanceStr.match(/([\d.]+)/);
        percentage = percentMatch ? parseFloat(percentMatch[1]) : 0;
        const conductedMatch = attendanceStr.match(/(\d+)\s*\/\s*(\d+)/);
        if (conductedMatch) {
          const present = parseInt(conductedMatch[1]) || 0;
          conductedNum = parseInt(conductedMatch[2]) || 0;
          absentNum = conductedNum - present;
        } else {
          conductedNum = 0;
          absentNum = 0;
        }
      }

      const slotCodes = extractSlotCodes(slot);
      const slotType = detectSlotType(slotCodes, courseCode, rawTitle);

      if (courseCode && looksLikeCourseCode(courseCode) && courseTitle && courseTitle.toLowerCase() !== 'null') {
        attendance.push({
          courseCode,
          courseTitle,
          slot,
          slotType,
          hoursConducted: String(conductedNum),
          hoursAbsent: String(absentNum),
          attendancePercentage: percentage.toFixed(2),
        });
      }
    });
  }

  // ── Strategy 2: bgcolor='#E6E6FA' cells (Stricter Row-based) ──────────
  if (attendance.length === 0) {
    const processedRows = new Set();
    
    $("td[bgcolor='#E6E6FA']").each((i, el) => {
      const cell = $(el);
      const row = cell.closest('tr');
      if (processedRows.has(row[0])) return;
      processedRows.add(row[0]);

      const text = cell.text().trim();
      const courseCode = cleanCourseCode(text);

      // Only proceed if the first cell looks like a Course Code
      if (looksLikeCourseCode(courseCode)) {
        const cells = cell.nextAll();
        if (cells.length < 6) return; // Not enough columns

        const rawTitle = cells.eq(0).text().trim();
        const courseTitle = cleanCourseTitle(rawTitle);
        const slot = cells.eq(3).text().trim();
        const conducted = cells.eq(5).text().trim();
        const absent = cells.eq(6).text().trim();

        const conductedNum = parseFloat(conducted) || 0;
        const absentNum = parseFloat(absent) || 0;
        
        // Safety: If conducted < absent, something is misaligned
        if (conductedNum < absentNum && conductedNum > 0) return;

        const percentage = conductedNum > 0 ? (((conductedNum - absentNum) / conductedNum) * 100) : 0;
        const slotCodes = extractSlotCodes(slot);
        const slotType = detectSlotType(slotCodes, courseCode, rawTitle);

        if (courseCode && courseTitle && courseTitle.toLowerCase() !== 'null') {
          // Additional check for sensible data
          if (conductedNum === 0 && absentNum === 0 && (text.includes('(') || text.length > 15)) return;

          attendance.push({
            courseCode,
            courseTitle,
            slot,
            slotType,
            hoursConducted: String(conductedNum),
            hoursAbsent: String(absentNum),
            attendancePercentage: percentage.toFixed(2),
          });
        }
      }
    });
  }

  // ── Strategy 3: Generic table headers ─────────────────────────────
  if (attendance.length === 0) {
    $('table').each((_, table) => {
      const rows = $(table).find('tr');
      const headerRow = rows.first();
      const headers = headerRow.find('th, td').map((_, cell) => normalizeKey($(cell).text())).get();

      const hasCode = headers.some(h => h.includes('code') || h.includes('course'));
      const hasAttendance = headers.some(h => h.includes('attendance') || h.includes('percent'));

      if (hasCode && hasAttendance && attendance.length === 0) {
        rows.slice(1).each((_, row) => {
          const cols = $(row).find('td');
          if (cols.length < 4) return;

          const values = cols.map((_, cell) => $(cell).text().trim()).get();
          const courseCode = cleanCourseCode(values[0] || values[1] || '');
          const courseTitle = cleanCourseTitle(values[1] || values[2] || '');

          let percentage = 0;
          for (const val of values) {
            const match = val.match(/([\d.]+)\s*%/);
            if (match) {
              percentage = parseFloat(match[1]);
              break;
            }
          }

          if (courseCode && courseTitle && percentage > 0) {
            const rawTitle = values[1] || values[2] || '';
            const slotType = detectSlotType([], courseCode, rawTitle);
            attendance.push({
              courseCode,
              courseTitle,
              slot: 'N/A',
              slotType,
              hoursConducted: '0',
              hoursAbsent: '0',
              attendancePercentage: percentage.toFixed(2),
            });
          }
        });
      }
    });
  }

  return { regNumber, attendance };
}
