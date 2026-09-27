import * as cheerio from 'cheerio';
import { cleanCourseCode, cleanCourseTitle } from '../utils/courses.js';

/**
 * Parses marks HTML from sp.srmist.edu.in/srmiststudentportal/students/report/studentInternalMarkDetails.jsp
 *
 * Supports multiple table formats:
 * 1. Column-based: S.No | Code | Description | Test 1 | Test 2 | Assignment | Total
 * 2. Nested sub-tables: Course Code | Title | [Nested table of test components]
 * 3. Row-based assessment records
 */
export function parseStudentPortalMarks(html, attendanceData = [], componentsMap = {}) {
  if (!html || typeof html !== 'string') {
    return { marks: [], source: 'student_portal' };
  }

  const $ = cheerio.load(html, { decodeEntities: true });
  const marks = [];

  // Map of courseCode -> title from attendance if available
  const codeToTitle = {};
  if (Array.isArray(attendanceData)) {
    attendanceData.forEach(a => {
      if (a.courseCode) codeToTitle[cleanCourseCode(a.courseCode)] = a.courseTitle || a.course;
    });
  }

  // Priority Strategy: Use rich component-wise breakdown (FT-I, FT-II, Assignments) if available
  if (componentsMap && Object.keys(componentsMap).length > 0) {
    $('table tbody tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length < 3) return;

      const rawCode = $(cols[0]).text().trim();
      const courseCode = cleanCourseCode(rawCode);
      if (!courseCode || courseCode.toLowerCase().includes('code')) return;

      const rawTitle = $(cols[1]).text().trim();
      const courseTitle = rawTitle ? cleanCourseTitle(rawTitle) : (codeToTitle[courseCode] || courseCode);
      const components = componentsMap[courseCode] || componentsMap[rawCode] || [];

      if (components.length > 0) {
        let totalScored = 0;
        let totalMax = 0;
        components.forEach(c => {
          totalScored += Number(c.obtained) || 0;
          totalMax += Number(c.maxMark) || 0;
        });

        marks.push({
          course: courseTitle,
          courseCode,
          category: 'Theory',
          marks: components,
          total: {
            obtained: Number(totalScored.toFixed(2)),
            maxMark: Number(totalMax.toFixed(2)),
          },
        });
      } else {
        // Fallback for course without inner components: parse score from 3rd column
        const cellText = $(cols[2]).text().trim();
        const slashMatch = cellText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
        if (slashMatch) {
          const obtained = parseFloat(slashMatch[1]) || 0;
          const maxMark = parseFloat(slashMatch[2]) || 100;
          marks.push({
            course: courseTitle,
            courseCode,
            category: 'Theory',
            marks: [{ exam: 'Internal Assessment', obtained, maxMark }],
            total: {
              obtained: Number(obtained.toFixed(2)),
              maxMark: Number(maxMark.toFixed(2)),
            },
          });
        }
      }
    });

    if (marks.length > 0) {
      return { marks, source: 'student_portal' };
    }
  }

  // Strategy 1: Look for table with nested mark tables (like Academia style)
  $('table').each((_, table) => {
    $(table).find('> tbody > tr, > tr').each((__, row) => {
      const cells = $(row).find('> td');
      if (cells.length < 3) return;

      const nestedTable = $(row).find('table');
      if (nestedTable.length > 0) {
        const rawCode = $(cells[0]).text().trim();
        const courseCode = cleanCourseCode(rawCode);
        if (!courseCode || courseCode.toLowerCase().includes('code')) return;

        const category = $(cells[1]).text().trim() || 'Theory';
        const tests = [];
        let totalScored = 0;
        let totalMax = 0;

        nestedTable.find('td, th').each((___, testCell) => {
          const text = $(testCell).text().trim();
          if (!text) return;
          const match = text.match(/([A-Za-z0-9\s_-]+)\s*[\/:]\s*([\d.]+)/);
          if (match) {
            const examName = match[1].trim();
            const maxVal = parseFloat(match[2]) || 0;
            const obtainedMatch = text.replace(match[0], '').match(/([\d.]+|Abs)/);
            const obtained = obtainedMatch ? (obtainedMatch[1] === 'Abs' ? 0 : parseFloat(obtainedMatch[1])) : 0;
            tests.push({ exam: examName, obtained, maxMark: maxVal });
            totalScored += obtained;
            totalMax += maxVal;
          }
        });

        if (tests.length > 0) {
          marks.push({
            course: codeToTitle[courseCode] || courseCode,
            courseCode,
            category,
            marks: tests,
            total: {
              obtained: Number(totalScored.toFixed(2)),
              maxMark: Number(totalMax.toFixed(2)),
            },
          });
        }
      }
    });
  });

  if (marks.length > 0) {
    return { marks, source: 'student_portal' };
  }

  // Strategy 2: Column-based table (Course Code | Course Title | Test 1 | Test 2 | ... | Total)
  $('table').each((_, table) => {
    if (marks.length > 0) return;

    const rows = $(table).find('tr');
    if (rows.length < 2) return;

    const headers = $(rows[0]).find('th, td').map((___, el) => $(el).text().trim().toLowerCase()).get();
    const codeIdx = headers.findIndex(h => h.includes('code') || h.includes('subject code'));
    if (codeIdx === -1) return;

    const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('title') || h.includes('name') || h.includes('subject'));

    // Find test columns (any header containing 'test', 'cla', 'assignment', 'ct', 'cat', 'internal', etc.)
    const testCols = [];
    headers.forEach((h, idx) => {
      if (idx === codeIdx || idx === descIdx) return;
      if (h.includes('s.no') || h.includes('serial') || h.includes('sl')) return;
      if (h.includes('test') || h.includes('cla') || h.includes('ct') || h.includes('assign') ||
          h.includes('intern') || h.includes('mark') || h.includes('score') || h.includes('total')) {
        testCols.push({ idx, name: $(rows[0]).find('th, td').eq(idx).text().trim() });
      }
    });

    if (testCols.length === 0) return;

    rows.slice(1).each((___, row) => {
      const cols = $(row).find('td');
      if (cols.length <= codeIdx) return;

      const rawCode = $(cols[codeIdx]).text().trim();
      const courseCode = cleanCourseCode(rawCode);
      if (!courseCode || courseCode.toLowerCase().includes('code')) return;

      const courseTitle = descIdx >= 0 ? cleanCourseTitle($(cols[descIdx]).text().trim()) : (codeToTitle[courseCode] || courseCode);

      const tests = [];
      let totalScored = 0;
      let totalMax = 0;

      testCols.forEach(({ idx, name }) => {
        if (idx >= cols.length) return;
        const cellText = $(cols[idx]).text().trim();
        if (!cellText || cellText === '-') return;

        // Try to match "obtained / max" or just "obtained"
        const slashMatch = cellText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
        let obtained = 0;
        let maxMark = 100;

        if (slashMatch) {
          obtained = parseFloat(slashMatch[1]) || 0;
          maxMark = parseFloat(slashMatch[2]) || 100;
        } else {
          const num = parseFloat(cellText);
          if (Number.isFinite(num)) {
            obtained = num;
            // Guess max mark from header if available
            const headMax = name.match(/[\(\/]\s*([\d.]+)\s*[\)]?/);
            maxMark = headMax ? parseFloat(headMax[1]) : (obtained <= 25 ? 25 : (obtained <= 50 ? 50 : 100));
          } else {
            return;
          }
        }

        let examName = name;
        if (examName.toLowerCase().includes('mark / max') || examName.toLowerCase() === 'mark / max. mark' || examName.toLowerCase() === 'mark') {
          examName = 'Internal Assessment';
        }

        tests.push({ exam: examName, obtained, maxMark });
        totalScored += obtained;
        totalMax += maxMark;
      });

      if (tests.length > 0) {
        marks.push({
          course: courseTitle || courseCode,
          courseCode,
          category: 'Theory',
          marks: tests,
          total: {
            obtained: Number(totalScored.toFixed(2)),
            maxMark: Number(totalMax.toFixed(2)),
          },
        });
      }
    });
  });

  return { marks, source: 'student_portal' };
}
