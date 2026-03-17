// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Marks Parser
// Multi-strategy parser for marks from the My_Attendance page
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';

/**
 * Parses marks from the My_Attendance page HTML using 3 strategies:
 *   1. table[border='1'][align='center'] with nested mark tables
 *   2. table:nth-child(7)
 *   3. Any table with nested mark sub-tables
 *
 * @param {string} decodedHtml  Decoded HTML string
 * @param {Array}  attendanceData  Attendance array (for courseCode→title mapping)
 */
export function parseMarks(decodedHtml, attendanceData = []) {
  const $ = cheerio.load(decodedHtml);
  let marksDetails = [];

  // Build courseCode → title name map from attendance
  const nameMap = {};
  attendanceData.forEach(a => {
    nameMap[a.courseCode] = a.courseTitle;
  });

  // ── Strategy 1: table[border='1'][align='center'] ─────────────────
  $("table[border='1'][align='center']").each((i, table) => {
    if ($(table).attr('bgcolor')?.toUpperCase() === '#FAFAD2') return;

    $(table).find('tr').each((j, row) => {
      const cells = $(row).find('> td');
      if (cells.length < 3) return;

      const courseCode = cells.eq(0).text().trim();
      const courseType = cells.eq(1).text().trim();
      const marksTable = cells.eq(2).find('table');

      if (!courseCode || !courseType || marksTable.length === 0) return;
      if (courseCode.toLowerCase().includes('course code')) return;

      const testPerformance = [];
      let overallScored = 0;
      let overallTotal = 0;

      marksTable.find('td').each((k, testCell) => {
        const $cell = $(testCell);
        const strongText = $cell.find('strong').text().trim();
        if (!strongText || !strongText.includes('/')) return;

        const [examName, maxStr] = strongText.split('/');
        const maxMark = parseFloat(maxStr) || 0;
        const obtained = $cell.text().replace(strongText, '').trim().replace(/^\n+|\n+$/g, '');
        const obtainedNum = obtained === 'Abs' ? 0 : (parseFloat(obtained) || 0);

        testPerformance.push({
          exam: examName.trim(),
          obtained: obtainedNum,
          maxMark,
        });
        overallScored += obtainedNum;
        overallTotal += maxMark;
      });

      if (testPerformance.length > 0) {
        marksDetails.push({
          course: nameMap[courseCode] || courseCode,
          courseCode,
          category: courseType,
          marks: testPerformance,
          total: {
            obtained: Number(overallScored.toFixed(2)),
            maxMark: Number(overallTotal.toFixed(2)),
          },
        });
      }
    });
  });

  // ── Strategy 2: table:nth-child(7) ────────────────────────────────
  if (marksDetails.length === 0) {
    const table = $('table:nth-child(7)');
    table.find('tr').each((i, row) => {
      if (i === 0) return;
      const cols = $(row).find('td');
      const course = $(cols[0]).text().trim();
      const category = $(cols[1]).text().trim();
      const marksTable = $(cols[2]).find('table');

      if (!course || !category || marksTable.length === 0) return;

      const marks = [];
      let total = { obtained: 0, maxMark: 0 };

      marksTable.find('td').each((j, markTd) => {
        const strongText = $(markTd).find('strong').text().trim();
        const [type, max] = strongText.split('/');
        const obtained = $(markTd).text().replace(strongText, '').trim().replace(/^\n+|\n+$/g, '');

        if (type && max) {
          const obtainedNum = obtained === 'Abs' ? 0 : (parseFloat(obtained) || 0);
          const maxNum = parseFloat(max) || 0;
          marks.push({ exam: type.trim(), obtained: obtainedNum, maxMark: maxNum });
          total.obtained += obtainedNum;
          total.maxMark += maxNum;
        }
      });

      if (marks.length > 0) {
        marksDetails.push({
          course: nameMap[course] || course,
          courseCode: course,
          category,
          marks,
          total: {
            obtained: Number(total.obtained.toFixed(2)),
            maxMark: Number(total.maxMark.toFixed(2)),
          },
        });
      }
    });
  }

  // ── Strategy 3: Any nested table with marks data ──────────────────
  if (marksDetails.length === 0) {
    $('table').each((_, outerTable) => {
      $(outerTable).find('tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 2) return;

        cells.each((_, cell) => {
          const nestedTable = $(cell).find('table');
          if (nestedTable.length === 0) return;

          const marks = [];
          let total = { obtained: 0, maxMark: 0 };

          nestedTable.find('td').each((_, td) => {
            const text = $(td).text().trim();
            const match = text.match(/([A-Za-z0-9\s]+)\/([\d.]+)\s*([\d.]+|Abs)?/);
            if (match) {
              const exam = match[1].trim();
              const maxMark = parseFloat(match[2]) || 0;
              const obtained = match[3] === 'Abs' ? 0 : (parseFloat(match[3]) || 0);
              marks.push({ exam, obtained, maxMark });
              total.obtained += obtained;
              total.maxMark += maxMark;
            }
          });

          if (marks.length > 0) {
            const courseCode = $(cells[0]).text().trim() || 'Unknown';
            const category = $(cells[1]).text().trim() || 'N/A';
            marksDetails.push({
              course: nameMap[courseCode] || courseCode,
              courseCode,
              category,
              marks,
              total: {
                obtained: Number(total.obtained.toFixed(2)),
                maxMark: Number(total.maxMark.toFixed(2)),
              },
            });
          }
        });
      });
    });
  }

  return marksDetails;
}
