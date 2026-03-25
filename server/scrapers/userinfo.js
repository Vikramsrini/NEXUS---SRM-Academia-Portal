// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — User Info Parser
// ═══════════════════════════════════════════════════════════════════════

import * as cheerio from 'cheerio';
import { normalizeText, normalizeKey, decodeAcademicPayload } from '../utils/html.js';
import { deriveAcademicBranch } from '../utils/courses.js';
import { fetchAcademicPage, getCourseDynamicUrl, getTimetableUrls } from './fetcher.js';

/**
 * Parses student profile info from the decoded HTML.
 */
export function parseSrmUserInfo(decodedHtml) {
  if (!decodedHtml || decodedHtml.length < 100) return { error: 'Invalid HTML payload', status: 500 };

  // HTML is already decoded by the fetcher

  // HTML is already decoded by the fetcher

  const $ = cheerio.load(decodedHtml, { decodeEntities: true, lowerCaseTags: true, xmlMode: false });
  const getText = (sel) => $(sel).text().trim();

  // Robust Name Detection: Look for "Welcome NAME (REG)" pattern
  const welcomeMatch = decodedHtml.match(/Welcome\s+([^(<]+)\s+\(/i);
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
  console.log('[SRM] Fetching user profile from URLs:', urls.length);
  
  let fallback = null;
  for (const url of urls) {
    try {
      const decodedHtml = await fetchAcademicPage(authCookie, url);
      if (decodedHtml && decodedHtml.length > 500) {
        const parsed = parseSrmUserInfo(decodedHtml);
        const hasCourses = decodedHtml.includes('course_tbl') || decodedHtml.includes('Course Code');
        if (parsed.userInfo && parsed.userInfo.regNumber) {
          if (hasCourses) {
            console.log('[SRM] Profile successfully loaded from:', url);
            return parsed.userInfo;
          } else if (!fallback) {
            fallback = parsed.userInfo;
          }
        }
      }
    } catch { /* skip */ }
  }

  if (fallback) return fallback;
  throw new Error('Could not find SRM profile on any academic year page.');
}
