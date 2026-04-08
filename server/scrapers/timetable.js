// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Timetable Parser & Builder
// Parses courses from HTML + maps to flat timetable via batch schedules
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';
import { normalizeText, normalizeKey } from '../utils/html.js';
import { extractSlotCodes, SLOT_TIMES, DAY_NAMES, BATCH_SCHEDULES } from '../utils/slots.js';
import {
  deriveAcademicBranch,
  getDirectRows, getDirectCells,
  findTableByHeaders, getColumnIndex,
  cleanCourseCode, cleanCourseTitle,
  detectSlotType,
  looksLikeCourseCode,
  findCourseCodeCandidate, findCourseTitleCandidate,
  normalizeRoom,
} from '../utils/courses.js';

/**
 * Parses courses + student info from the timetable page HTML.
 */
export function parseCourses(html) {
  const $ = cheerio.load(html);

  const regNumberMatch = html.match(/RA2\d{12}/);
  const regNumber = regNumberMatch ? regNumberMatch[0] : '';

  let batch = '1';
  let studentName = '';
  const infoMap = {};

  $('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('td');
      for (let j = 0; j + 1 < cells.length; j += 2) {
        const key = normalizeKey($(cells[j]).text());
        const value = normalizeText($(cells[j + 1]).text());
        if (key && value && !infoMap[key]) {
          infoMap[key] = value;
        }
      }
    });
  });

  batch = infoMap.batch || batch;
  studentName = infoMap.name || studentName;
  const program = infoMap.program || '';
  const deptRaw = infoMap.department || '';
  const deptParts = deptRaw.split('-');
  const department = deptParts[0]?.trim() || deptRaw;
  const section = deptParts[1]
    ? deptParts[1].replace(/[()]/g, '').replace('Section', '').trim()
    : '';
  const semester = infoMap.semester || '';
  const branch = deriveAcademicBranch(program, department);

  const courses = [];
  const courseTable = $('.course_tbl').first()[0] || findTableByHeaders($, [
    ['course code', 'code'],
    ['course title', 'title', 'subject'],
    ['slot'],
    ['course type', 'type'],
    ['credit', 'credits', 'cr'],
    ['room', 'venue'],
  ]);

  if (!courseTable) {
    return { regNumber, batch, studentName, program, department, section, semester, branch, courses };
  }

  const rows = getDirectRows($, courseTable).toArray();
  if (!rows.length) {
    return { regNumber, batch, studentName, program, department, section, semester, branch, courses };
  }

  const headers = getDirectCells($, rows[0])
    .map((_, cell) => normalizeKey($(cell).text()))
    .get();

  const codeIdx = getColumnIndex(headers, ['course code', 'code'], 1);
  const titleIdx = getColumnIndex(headers, ['course title', 'title', 'subject'], 2);
  const courseTypeIdx = getColumnIndex(headers, ['course type', 'type'], 6);
  const creditIdx = getColumnIndex(headers, ['credit', 'credits', 'cr'], -1);
  const slotIdx = getColumnIndex(headers, ['slot'], 8);
  const roomIdx = getColumnIndex(headers, ['room no', 'room', 'venue'], 10);
  const altRoomIdx = roomIdx === 10 ? 9 : Math.max(roomIdx - 1, 0);

  rows.slice(1).forEach(row => {
    const cells = getDirectCells($, row);
    if (!cells.length) return;

    const values = cells.map((_, cell) => normalizeText($(cell).text())).get();
    const getText = (idx) => (idx >= 0 && idx < values.length ? values[idx] : '');

    const code = cleanCourseCode(getText(codeIdx) || findCourseCodeCandidate(values));
    const title = cleanCourseTitle(getText(titleIdx) || findCourseTitleCandidate(values, [code]));
    const courseType = getText(courseTypeIdx) || 'N/A';
    const credit = getText(creditIdx);
    const slotCodes = extractSlotCodes(getText(slotIdx));
    const slot = slotCodes.join('+');

    let room = getText(roomIdx);
    if (!room || room.toUpperCase().startsWith('AY')) {
      room = getText(altRoomIdx);
    }

    const slotType = detectSlotType(slotCodes, code, title);

    if (looksLikeCourseCode(code) && title && slotCodes.length > 0) {
      courses.push({ code, title, slot, room: normalizeRoom(room), slotType, courseType, credit });
    }
  });

  return { regNumber, batch, studentName, program, department, section, semester, branch, courses };
}

/**
 * Maps parsed courses + batch to a flat timetable array
 * with merged consecutive same-course periods.
 */
export function buildTimetable(courses, batch) {
  const schedule = BATCH_SCHEDULES[batch] || BATCH_SCHEDULES['1'];

  // Build slot → course mapping
  const slotMap = {};
  for (const course of courses) {
    const slots = extractSlotCodes(course.slot);
    for (const s of slots) {
      if (!slotMap[s]) slotMap[s] = course;
    }
  }

  const timetable = [];

  for (let dayIdx = 0; dayIdx < schedule.length; dayIdx++) {
    const daySlots = schedule[dayIdx];
    const day = DAY_NAMES[dayIdx];
    const dayOrder = `DO${dayIdx + 1}`;
    let lastCode = null;
    let lastSlotType = null;

    for (let pIdx = 0; pIdx < daySlots.length; pIdx++) {
      const slotCode = daySlots[pIdx];
      const course = slotMap[slotCode];

      if (course) {
        const currentSlotType = /^P\d+$/i.test(slotCode) ? 'Practical' : 'Theory';

        if (lastCode === course.code && lastSlotType === currentSlotType && timetable.length > 0) {
          const last = timetable[timetable.length - 1];
          if (last.day === day) {
            last.time = last.time.split(' - ')[0] + ' - ' + SLOT_TIMES[pIdx].split(' - ')[1];
            continue;
          }
        }
        timetable.push({
          day,
          dayOrder,
          time: SLOT_TIMES[pIdx],
          subject: course.title,
          room: course.room,
          courseCode: course.code,
          slotType: currentSlotType,
          courseType: course.courseType,
        });
        lastCode = course.code;
        lastSlotType = currentSlotType;
      } else {
        lastCode = null;
        lastSlotType = null;
      }
    }
  }

  return timetable;
}
