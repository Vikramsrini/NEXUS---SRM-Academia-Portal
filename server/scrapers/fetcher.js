// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Page Fetcher
// Generic HTTP fetchers for Academia pages (decoded + raw)
// ═══════════════════════════════════════════════════════════════════════

import axios from 'axios';
import { decodeAcademicPayload } from '../utils/html.js';

const ACADEMIA_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
  'Referer': 'https://academia.srmist.edu.in/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Fetches an SRM Academia page and returns decoded HTML
 * (strips the pageSanitizer wrapper and hex-decodes).
 */
export async function fetchAcademicPage(authCookie, url) {
  const response = await axios({
    method: 'GET',
    url,
    headers: { ...ACADEMIA_HEADERS, cookie: authCookie },
    timeout: 30000,
  });
  const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const decodedHtml = decodeAcademicPayload(rawData);
  if (!decodedHtml) {
    throw new Error('Invalid Academia page response — could not decode HTML');
  }
  return decodedHtml;
}

/**
 * Fetches raw (undecoded) page data from SRM Academia.
 */
export async function fetchRawAcademicPage(authCookie, url) {
  const response = await axios({
    method: 'GET',
    url,
    headers: { ...ACADEMIA_HEADERS, cookie: authCookie },
    timeout: 30000,
  });
  return response.data;
}

/**
 * Returns an array of possible timetable page URLs for the current academic year,
 * with fallbacks for the previous 3 years.
 */
export function getTimetableUrls() {
  const base = 'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Time_Table_';
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const urls = [];

  if (month >= 7) {
    urls.push(`${base}${year}_${String(year + 1).slice(-2)}`);
  } else {
    urls.push(`${base}${year - 1}_${String(year).slice(-2)}`);
  }
  for (let y = year - 1; y >= year - 3; y--) {
    const url = `${base}${y}_${String(y + 1).slice(-2)}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Returns the dynamic URL for the current academic year's timetable/course page.
 */
export function getCourseDynamicUrl() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yearString = month >= 7
    ? `${year}_${String(year + 1).slice(-2)}`
    : `${year - 1}_${String(year).slice(-2)}`;
  return `https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Time_Table_${yearString}`;
}

/**
 * Fetches timetable page HTML, trying multiple academic year URLs.
 */
export async function fetchTimetablePage(authCookie) {
  const urls = getTimetableUrls();
  for (const url of urls) {
    try {
      const html = await fetchAcademicPage(authCookie, url);
      if (html && html.length > 500 && !html.includes('Page not found')) {
        console.log('[SRM] Timetable loaded from:', url);
        return html;
      }
    } catch {
      // try next URL
    }
  }
  console.log('[SRM] No timetable page found');
  return null;
}
