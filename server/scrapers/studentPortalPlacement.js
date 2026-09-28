import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

const SP_BASE = 'https://sp.srmist.edu.in/srmiststudentportal';
const DASHBOARD_URL = `${SP_BASE}/students/report/studentPlacementInsightDashboard.jsp`;
const INNER_URL = `${SP_BASE}/students/report/studentPlacementInsightDashboardInner.jsp`;

const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

async function postWithRetry(url, data, config, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.post(url, data, {
        ...config,
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true,
      });
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

/**
 * Parse Batch HTML table into structured company objects
 */
export function parsePlacementBatchHtml(html) {
  const $ = cheerio.load(html);
  const companies = [];

  $('table tbody tr').each((_, el) => {
    const $row = $(el);
    const onclick = $row.attr('onclick') || '';
    const match = onclick.match(/funViewinSightDashboardDetails\((\d+)/);
    
    // Skip sub-rows or empty rows
    if (!match) return;

    const companyId = match[1];
    const tds = $row.find('td');
    if (tds.length < 5) return;

    const name = $(tds[0]).text().trim();
    const dateOfVisit = $(tds[1]).text().trim();
    const role = $(tds[2]).text().trim();
    const category = $(tds[3]).text().trim();
    const ctc = $(tds[4]).text().trim();
    const eligibility = $(tds[5]).text().trim();

    companies.push({
      companyId,
      name,
      dateOfVisit,
      role,
      category,
      ctc,
      eligibility,
    });
  });

  return companies;
}

/**
 * Parse Modal Details (SQM, Feedback, etc.)
 */
export function parsePlacementDetailsHtml(html) {
  const $ = cheerio.load(html);
  const links = [];
  let sqmLink = null;
  let feedbackLink = null;

  $('table tbody tr').each((_, row) => {
    const title = $(row).find('td').first().text().trim();
    const anchor = $(row).find('a').first();
    const url = anchor.attr('href') || null;

    if (title && url) {
      links.push({ title, url });
      const lower = title.toLowerCase();
      if (lower.includes('stagewise') || lower.includes('sqm')) {
        sqmLink = url;
      } else if (lower.includes('feedback')) {
        feedbackLink = url;
      }
    }
  });

  return { sqmLink, feedbackLink, links };
}

/**
 * Parse Additional Learning Resources (iden=4)
 */
export function parsePlacementResourcesHtml(html) {
  const $ = cheerio.load(html);
  const resources = [];

  $('table tbody tr').each((_, row) => {
    const anchor = $(row).find('a').first();
    if (!anchor.length) return;
    const title = anchor.text().trim() || $(row).find('td').text().trim();
    const url = anchor.attr('href') || '';
    if (title && url) {
      resources.push({ title, url });
    }
  });

  return resources;
}

/**
 * Fetch a batch list from Student Portal
 */
export async function fetchPlacementBatchWithSession(jsessionid, cookies, yearId = '25') {
  let cookieHeader = cookies;
  if (!cookieHeader || !cookieHeader.includes('JSESSIONID')) {
    cookieHeader = [`JSESSIONID=${jsessionid}`, cookies].filter(Boolean).join('; ');
  }

  const payload = `iden=3&hdnAcademicYear=${encodeURIComponent(yearId)}&hdnAcademicYearId=${encodeURIComponent(yearId)}`;
  const res = await postWithRetry(
    INNER_URL,
    payload,
    {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': DASHBOARD_URL,
      },
    }
  );

  const html = typeof res.data === 'string' ? res.data : '';
  return parsePlacementBatchHtml(html);
}

/**
 * Fetch detailed modal breakdown for a company (SQM & Feedback)
 */
export async function fetchPlacementDetailsWithSession(jsessionid, cookies, companyId) {
  let cookieHeader = cookies;
  if (!cookieHeader || !cookieHeader.includes('JSESSIONID')) {
    cookieHeader = [`JSESSIONID=${jsessionid}`, cookies].filter(Boolean).join('; ');
  }

  const payload = `iden=1&hdnPlacementInsightDashboardId=${encodeURIComponent(companyId)}`;
  const res = await postWithRetry(
    INNER_URL,
    payload,
    {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': DASHBOARD_URL,
      },
    }
  );

  const html = typeof res.data === 'string' ? res.data : '';
  return parsePlacementDetailsHtml(html);
}

/**
 * Fetch learning resources (iden=4)
 */
export async function fetchPlacementResourcesWithSession(jsessionid, cookies) {
  let cookieHeader = cookies;
  if (!cookieHeader || !cookieHeader.includes('JSESSIONID')) {
    cookieHeader = [`JSESSIONID=${jsessionid}`, cookies].filter(Boolean).join('; ');
  }

  const payload = 'iden=4';
  const res = await postWithRetry(
    INNER_URL,
    payload,
    {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': DASHBOARD_URL,
      },
    }
  );

  const html = typeof res.data === 'string' ? res.data : '';
  return parsePlacementResourcesHtml(html);
}
