// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — User Info Parser
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';
import { normalizeText, normalizeKey } from '../utils/html.js';
import { deriveAcademicBranch } from '../utils/courses.js';
import { fetchRawAcademicPage, getCourseDynamicUrl, getTimetableUrls } from './fetcher.js';

/**
 * Parses student profile info from the raw pageSanitizer response.
 */
export function parseSrmUserInfo(rawResponse) {
  const match = rawResponse.match(/pageSanitizer\.sanitize\('(.*)'\);/s);
  if (!match || !match[1]) return { error: 'Failed to extract user details', status: 500 };

  const decodedHtml = match[1]
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\\/g, '')
    .replace(/\\'/g, "'");

  const $ = cheerio.load(decodedHtml, { decodeEntities: true, lowerCaseTags: true, xmlMode: false });
  const getText = (sel) => $(sel).text().trim();

  // Robust Name Detection: Look for "Welcome NAME (REG)" pattern
  const welcomeMatch = decodedHtml.match(/Welcome\s+([^(\n<]+)\s+\(/i);
  const detectedName = welcomeMatch ? welcomeMatch[1].trim() : '';

  const infoMap = {};
  $('table').each((_, table) => {
    $(table).find('tr').each((__, row) => {
      const cells = $(row).find('td');
      for (let index = 0; index + 1 < cells.length; index += 2) {
        const key = normalizeKey($(cells[index]).text());
        const value = normalizeText($(cells[index + 1]).text());
        if (key && value && !infoMap[key]) {
          infoMap[key] = value;
        }
      }
    });
  });

  const deptRaw = infoMap.department || getText('td:contains("Department:") + td strong');
  const deptParts = deptRaw.split('-');
  const program = infoMap.program || getText('td:contains("Program:") + td strong');
  const department = deptParts[0]?.trim() || deptRaw;

  const userInfo = {
    regNumber: infoMap['registration number'] || getText('td:contains("Registration Number:") + td strong'),
    name: detectedName || infoMap.name || infoMap['student name'] || infoMap['candidate name'] || getText('td:contains("Name:") + td strong') || getText('td:contains("Student Name:") + td strong'),
    mobile: infoMap.mobile || getText('td:contains("Mobile:") + td strong'),
    program,
    department,
    section: deptParts[1] ? deptParts[1].replace(/[()]/g, '').replace('Section', '').trim() : '',
    semester: infoMap.semester || getText('td:contains("Semester:") + td strong'),
    batch: infoMap.batch || getText('td:contains("Batch:") + td strong'),
    branch: deriveAcademicBranch(program, department),
  };

  return { userInfo, status: 200 };
}

/**
 * Fetches and parses user info from the course/timetable page.
 */
export async function fetchRealUserInfo(authCookie) {
  const urls = getTimetableUrls();
  
  for (const url of urls) {
    try {
      const rawData = await fetchRawAcademicPage(authCookie, url);
      if (rawData && typeof rawData === 'string' && rawData.includes('pageSanitizer.sanitize')) {
        const parsed = parseSrmUserInfo(rawData);
        if (parsed.userInfo && parsed.userInfo.regNumber) {
          console.log('[SRM] Profile loaded from:', url);
          return parsed.userInfo;
        }
      }
    } catch {
      // try next URL
    }
  }

  throw new Error('Could not find SRM profile on any academic year page.');
}
