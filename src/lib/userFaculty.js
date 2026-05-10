function normalizeCourseCode(c) {
  return (c || '').trim().toUpperCase().replace(/^21/, '');
}

function normalizeSlot(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('lab') || t.includes('prac') || t.includes('work') || t.includes('practical')) {
    return { label: 'Lab', css: 'practical' };
  }
  return { label: 'Theory', css: 'theory' };
}

function isNAType(type) {
  const t = (type || '').trim().toLowerCase();
  return t === 'n/a' || t === 'na';
}

function isNASlot(slot) {
  const raw = (slot || '').trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  if (s === 'n/a' || s === 'na' || s === '-') return true;
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const isTheorySlot = /^[A-G](?:\d+)?$/.test(compact);
  const isLabSlot = /^(?:L\d+|P\d+|LAB(?:\d+)?)$/.test(compact);
  return !(isTheorySlot || isLabSlot);
}

function isNoise(str) {
  const s = String(str || '').toLowerCase();
  return (
    s.includes('llj') ||
    s.includes('ft-') ||
    s.startsWith('ft') ||
    s.includes('fj-') ||
    s.includes('total') ||
    s.includes('faculty') ||
    s.startsWith('ct-') ||
    s.startsWith('cat-') ||
    s.includes('pbl') ||
    s === 'r i' ||
    s === 'r ii' ||
    s.startsWith('21r i/') ||
    /\d+\/\d+/.test(s) ||
    s === 'theory' ||
    s === 'practical' ||
    s === 'lab' ||
    s === 'clinical'
  );
}

function normSlotText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandSlotRange(token) {
  const normalized = normSlotText(token).toUpperCase().replace(/[–—]/g, '-');
  const numericRange = normalized.match(/^P(\d+)\s*-\s*P?(\d+)$/i);
  if (!numericRange) return [normalized];
  const start = Number.parseInt(numericRange[1], 10);
  const end = Number.parseInt(numericRange[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [normalized];
  }
  return Array.from({ length: end - start + 1 }, (_, index) => `P${start + index}`);
}

function extractSlotCodes(rawSlot = '') {
  const normalized = normSlotText(rawSlot).replace(/[–—]/g, '-').toUpperCase();
  if (!normalized) return [];
  const parts = normalized
    .split('+')
    .flatMap((part) => part.split(','))
    .flatMap((part) => part.split('/'))
    .flatMap((part) => {
      const trimmed = normSlotText(part);
      if (!trimmed) return [];
      if (/^P\d+\s*-\s*P?\d+$/i.test(trimmed)) return expandSlotRange(trimmed);
      if (trimmed.includes('-')) return trimmed.split(/\s*-\s*/).filter(Boolean);
      return [trimmed];
    })
    .map((p) => normSlotText(p))
    .filter(Boolean);
  return [...new Set(parts)];
}

function findRoomFromCourses(courses, codeNorm, attendanceSlotRaw) {
  const attSet = new Set(extractSlotCodes(attendanceSlotRaw).map((x) => x.toUpperCase()));
  if (attSet.size === 0) return null;
  for (const c of courses || []) {
    if (normalizeCourseCode(c.code) !== codeNorm) continue;
    const courseSlots = extractSlotCodes(c.slot || '');
    if (courseSlots.some((slot) => attSet.has(slot.toUpperCase()))) {
      const r = normSlotText(c.room);
      return r || null;
    }
  }
  return null;
}

function findRoomFromTimetable(timetable, codeNorm, typeLabel) {
  const wantPractical = typeLabel === 'Lab';
  for (const cls of timetable || []) {
    if (normalizeCourseCode(cls.courseCode) !== codeNorm) continue;
    const isPrac = String(cls.slotType || '')
      .toLowerCase()
      .includes('prac');
    if (wantPractical !== isPrac) continue;
    const r = normSlotText(cls.room);
    if (r) return r;
  }
  for (const cls of timetable || []) {
    if (normalizeCourseCode(cls.courseCode) !== codeNorm) continue;
    const r = normSlotText(cls.room);
    if (r) return r;
  }
  return null;
}

function buildTimetableMapping(student) {
  const map = {};
  const timetable = student.timetable || [];
  const coursesMetadata = student.courses || [];

  coursesMetadata.forEach((course) => {
    const code = normalizeCourseCode(course.code);
    if (!map[code]) {
      map[code] = { types: new Set(), credit: course.credit, faculty: course.faculty };
    }
    if (!isNAType(course.slotType) && course.slotType) {
      map[code].types.add(course.slotType);
    }
  });

  timetable.forEach((cls) => {
    const code = normalizeCourseCode(cls.courseCode);
    if (!map[code]) {
      map[code] = { types: new Set(), credit: cls.credit, faculty: cls.faculty };
    }
    if (!isNAType(cls.slotType) && cls.slotType) {
      map[code].types.add(cls.slotType);
    }
  });
  return map;
}

function resolveType(a, timetableMapping) {
  const code = normalizeCourseCode(a.courseCode);
  const data = timetableMapping[code];
  const s = (a.slot || '').toUpperCase();
  if (s && (s.includes('P') || s.includes('L'))) return 'Practical';
  if (s && /^[A-G](?:\d+)?$/.test(s)) return 'Theory';
  if (a.slotType && !isNAType(a.slotType)) return a.slotType;
  if (isNAType(a.slotType)) return null;
  if (data && data.types.size === 1) return Array.from(data.types)[0];
  return 'Theory';
}

function filterAttendanceRows(attendance) {
  return attendance.filter((a) => {
    const title = (a.courseTitle || '').trim();
    const code = (a.courseCode || '').trim().toLowerCase();
    if (!title || title.length <= 2) return false;
    if (isNoise(title) || isNoise(code)) return false;
    return true;
  });
}

/**
 * Enrolled courses with faculty and room from the last Academia sync.
 */
function getMyFacultyEnrollments(student) {
  const attendance = student.attendance || [];
  const timetableMapping = buildTimetableMapping(student);
  const filtered = filterAttendanceRows(attendance);
  const courses = student.courses || [];
  const timetable = student.timetable || [];

  return filtered
    .map((a) => {
      if (isNASlot(a.slot)) return null;
      const type = resolveType(a, timetableMapping);
      if (!type) return null;
      const norm = normalizeSlot(type);
      const code = normalizeCourseCode(a.courseCode);
      const data = timetableMapping[code];
      const facultyRaw = data?.faculty || 'N/A';
      const room =
        findRoomFromCourses(courses, code, a.slot) ??
        findRoomFromTimetable(timetable, code, norm.label) ??
        '';

      return {
        title: a.courseTitle,
        code: (a.courseCode || '').startsWith('21') ? a.courseCode : `21${a.courseCode}`,
        slot: a.slot,
        typeLabel: norm.label,
        facultyRaw,
        room,
      };
    })
    .filter(Boolean);
}

function extractFacultyIdFromPortal(raw) {
  const m = /\((\d{4,})\)\s*$/.exec(String(raw || '').trim());
  return m ? m[1] : null;
}

function stripForNameMatch(s) {
  return String(s || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:dr|mr|mrs|ms|prof|professor)\b\.?/gi, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

/** Match bundled GradeX directory row to portal faculty string (id or fuzzy name). */
function gradexStaffMatchesFacultyRaw(facultyRaw, gradexStaff) {
  const raw = String(facultyRaw || '').trim();
  if (!raw || raw === 'N/A') return false;

  const portalId = extractFacultyIdFromPortal(raw);
  if (portalId && String(gradexStaff.id) === portalId) return true;

  const normRaw = stripForNameMatch(raw);
  const normName = stripForNameMatch(gradexStaff.name);
  if (normRaw.length < 4 || normName.length < 4) return false;
  if (normRaw === normName) return true;
  return normRaw.includes(normName) || normName.includes(normRaw);
}

function gradexStaffIsMine(gradexStaff, enrollments) {
  if (!enrollments?.length) return false;
  return enrollments.some((row) => gradexStaffMatchesFacultyRaw(row.facultyRaw, gradexStaff));
}

/** First bundled directory row that matches a portal faculty string, or null. */
function findGradexStaffForEnrollment(facultyRaw, staffList) {
  if (!staffList?.length) return null;
  for (const s of staffList) {
    if (gradexStaffMatchesFacultyRaw(facultyRaw, s)) return s;
  }
  return null;
}

export {
  getMyFacultyEnrollments,
  extractFacultyIdFromPortal,
  gradexStaffMatchesFacultyRaw,
  gradexStaffIsMine,
  findGradexStaffForEnrollment,
};
