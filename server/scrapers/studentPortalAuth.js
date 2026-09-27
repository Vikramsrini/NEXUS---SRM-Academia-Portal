import axios from 'axios';
import crypto from 'crypto';
import * as cheerio from 'cheerio';

const SP_BASE = 'https://sp.srmist.edu.in/srmiststudentportal';
const LOGIN_URL = `${SP_BASE}/students/loginManager/youLogin.jsp`;
const LOGIN_SERVLET_URL = `${SP_BASE}/LoginServlet`;
const ATTENDANCE_URL = `${SP_BASE}/students/report/studentAttendanceDetails.jsp`;
const MARKS_URL = `${SP_BASE}/students/report/studentInternalMarkDetails.jsp`;
const MARKS_INNER_URL = `${SP_BASE}/students/report/studentInternalMarkDetailsInner.jsp`;
const HRD_URL = `${SP_BASE}/students/template/HRDSystem.jsp`;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

// In-memory store for pending login sessions
const pendingSessions = new Map();

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, session] of pendingSessions.entries()) {
    if (session.startedAt < cutoff) pendingSessions.delete(id);
  }
}, 5 * 60 * 1000);

/**
 * Step 1: Fetches the SP login page and the real captcha image from SCaptchaServlet.
 * Returns { sessionId, captchaImg } where captchaImg is a base64 Data URL.
 */
export async function fetchSpLoginPage() {
  const loginRes = await axios.get(LOGIN_URL, {
    headers: BROWSER_HEADERS,
    timeout: 15000,
    validateStatus: () => true,
  });

  const rawCookies = loginRes.headers['set-cookie'] || [];
  const cookies = rawCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
  const html = typeof loginRes.data === 'string' ? loginRes.data : '';

  // Extract security parameters
  const nonce = (html.match(/nonce:\s*['"]([^'"]+)['"]/) || [])[1];
  const domainFieldName = (html.match(/domainFieldName\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  const captchaFieldName = (html.match(/captchaFieldName\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  const randomDelimiter = (html.match(/randomDelimiter\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  const honeypotMatch = html.match(/name=['"](ph_[a-f0-9]+)['"]/);
  const honeypotName = honeypotMatch ? honeypotMatch[1] : '';
  const captchaSrcMatch = html.match(/id=['"]secure_captcha['"][^>]*data-src=['"]([^'"]+)['"]/);
  const captchaSrc = captchaSrcMatch ? captchaSrcMatch[1] : '';

  if (!captchaSrc || !nonce) {
    throw new Error('Could not find captcha parameters on Student Portal login page');
  }

  // Fetch the genuine PNG/JPEG captcha from SCaptchaServlet
  const captchaUrl = captchaSrc.startsWith('http') ? captchaSrc : `https://sp.srmist.edu.in${captchaSrc}`;
  const proof = Buffer.from(`${nonce}:sp.srmist.edu.in`).toString('base64');

  const imgRes = await axios.get(captchaUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': cookies,
      'X-Domain-Proof': proof,
      'Referer': LOGIN_URL,
      'Accept': 'image/png, image/jpeg, image/svg+xml, image/*;q=0.8',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
    validateStatus: () => true,
  });

  if (imgRes.status !== 200 || !imgRes.data || imgRes.data.length === 0) {
    throw new Error(`Failed to load captcha image: HTTP ${imgRes.status}`);
  }

  // Check for any additional cookies set by SCaptchaServlet
  const imgCookies = (imgRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).filter(Boolean);
  const allCookies = [...cookies.split('; ').filter(Boolean), ...imgCookies].join('; ');

  const mimeType = imgRes.headers['content-type'] || 'image/png';
  const captchaImg = `data:${mimeType};base64,${Buffer.from(imgRes.data).toString('base64')}`;

  const sessionId = crypto.randomUUID();
  pendingSessions.set(sessionId, {
    cookies: allCookies,
    domainFieldName,
    captchaFieldName,
    randomDelimiter,
    honeypotName,
    startedAt: Date.now(),
  });

  return { sessionId, captchaImg };
}

/**
 * Step 2: Submits login to LoginServlet with authentic telemetry and tokens.
 */
export async function submitSpLogin(sessionId, username, password, userCaptcha) {
  const session = pendingSessions.get(sessionId);
  if (!session) {
    throw new Error('Login session expired. Please refresh the captcha.');
  }

  const {
    cookies,
    domainFieldName,
    captchaFieldName,
    randomDelimiter,
    honeypotName,
    startedAt,
  } = session;
  pendingSessions.delete(sessionId);

  // Compute tokens matching guardlogin.js and secure2.js
  const dtokenValue = Buffer.from('sp.srmist.edu.in'.split('').reverse().join('')).toString('base64');
  const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  const interactCount = Math.floor(Math.random() * 10) + 12;
  const cptokenValue = Buffer.from(`${elapsed}${randomDelimiter || '6b86'}${interactCount}`).toString('base64');

  // Synthetic telemetry payload replicating secure2.js
  const now = Date.now();
  const telemetry = {
    startTime: startedAt,
    currentDomain: 'sp.srmist.edu.in',
    timezoneOffset: -330, // Indian Standard Time
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24,
    devicePixelRatio: 2,
    platform: 'MacIntel',
    userAgent: BROWSER_HEADERS['User-Agent'],
    language: 'en-US',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    touchSupport: false,
    webdriver: false,
    mouseClicks: Math.floor(Math.random() * 3) + 2,
    mouseMovements: interactCount,
    keystrokeCount: username.length + password.length + userCaptcha.length,
    typingSpeedMs: elapsed * 400,
    canvasHash: '2647c21f',
    submitTime: now,
    timeOnPageMs: now - startedAt,
  };
  const telemetryPayload = Buffer.from(JSON.stringify(telemetry)).toString('base64');

  // Build form payload
  const params = new URLSearchParams();
  params.append('username', username.trim());
  params.append('password', password);
  if (honeypotName) {
    params.append(honeypotName, '');
  }
  params.append('captcha', userCaptcha.trim());
  params.append('fpPayload', '');
  params.append('fpToken', '');
  params.append('telemetryPayload', telemetryPayload);
  if (domainFieldName) {
    params.append(domainFieldName, dtokenValue);
  }
  if (captchaFieldName) {
    params.append(captchaFieldName, cptokenValue);
  }

  // POST to LoginServlet
  const loginRes = await axios.post(LOGIN_SERVLET_URL, params.toString(), {
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': LOGIN_URL,
      'Origin': 'https://sp.srmist.edu.in',
    },
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 20000,
  });

  // Capture response cookies
  const postCookies = (loginRes.headers['set-cookie'] || [])
    .map(c => c.split(';')[0])
    .filter(c => !c.includes('Max-Age=0'));

  let activeCookies = mergeCookies(cookies, postCookies);

  // Success is indicated by HTTP 302 redirect to HRDSystem.jsp
  const location = loginRes.headers['location'] || '';
  const isRedirectToApp = loginRes.status === 302 && (location.includes('HRDSystem') || !location.includes('youLogin'));

  if (!isRedirectToApp) {
    const body = typeof loginRes.data === 'string' ? loginRes.data : '';
    if (body.includes('Invalid Captcha') || body.includes('Enter valid Captcha')) {
      throw new Error('Invalid captcha entered. Please try again.');
    }
    if (body.includes('Invalid') || body.includes('incorrect') || body.includes('youLogin')) {
      throw new Error('Invalid username or password. Please verify your Student Portal credentials.');
    }
    throw new Error('Student Portal login failed. Please verify your credentials and captcha.');
  }

  // Follow redirect to HRDSystem.jsp to initialize student session
  const targetUrl = location.startsWith('http') ? location : `https://sp.srmist.edu.in${location}`;
  try {
    const hrdRes = await axios.get(targetUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': activeCookies,
        'Referer': LOGIN_URL,
      },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 15000,
    });
    const hrdCookies = (hrdRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).filter(Boolean);
    activeCookies = mergeCookies(activeCookies, hrdCookies);
  } catch (hrdErr) {
    console.warn('[SP Auth] HRD redirect follow notice:', hrdErr.message);
  }

  // Extract JSESSIONID
  const jsessionMatch = activeCookies.match(/JSESSIONID=([^;]+)/);
  const jsessionid = jsessionMatch ? jsessionMatch[1] : '';
  const workerCookie = activeCookies.split('; ').find(c => c.startsWith('worker')) || '';

  return { jsessionid, workerCookie, allCookies: activeCookies };
}

/**
 * Step 3: Fetches attendance HTML using the authenticated cookies.
 */
export async function fetchAttendanceWithSession(jsessionid, workerCookieOrAllCookies, regNumber) {
  let cookieHeader = workerCookieOrAllCookies;
  if (!cookieHeader || !cookieHeader.includes('JSESSIONID')) {
    cookieHeader = [`JSESSIONID=${jsessionid}`, workerCookieOrAllCookies].filter(Boolean).join('; ');
  }

  // Attempt 1: GET studentAttendanceDetails.jsp
  let response = await axios.get(ATTENDANCE_URL, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': cookieHeader,
      'Referer': HRD_URL,
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  let html = typeof response.data === 'string' ? response.data : '';

  // Attempt 2: If GET returned session loader or no table, try POST with studentid
  if (!html.includes('<table') && !html.includes('.theGR8LoginLoader')) {
    const postRes = await axios.post(
      ATTENDANCE_URL,
      new URLSearchParams({ studentid: regNumber }).toString(),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieHeader,
          'Referer': HRD_URL,
          'Origin': 'https://sp.srmist.edu.in',
        },
        timeout: 20000,
        validateStatus: () => true,
      }
    );
    if (typeof postRes.data === 'string' && postRes.data.includes('<table')) {
      html = postRes.data;
    }
  }

  // Check for expired session or login loader
  if (response.status === 302 || html.includes('.theGR8LoginLoader') || html.includes('youLogin')) {
    throw new Error('SESSION_EXPIRED');
  }

  if (!html.includes('<table')) {
    throw new Error('Attendance table not found on Student Portal page.');
  }

  return html;
}

/**
 * Step 4: Fetches internal marks HTML using the authenticated cookies.
 */
export async function fetchMarksWithSession(jsessionid, workerCookieOrAllCookies, regNumber) {
  let cookieHeader = workerCookieOrAllCookies;
  if (!cookieHeader || !cookieHeader.includes('JSESSIONID')) {
    cookieHeader = [`JSESSIONID=${jsessionid}`, workerCookieOrAllCookies].filter(Boolean).join('; ');
  }

  try {
    // Attempt 1: GET studentInternalMarkDetails.jsp
    let response = await axios.get(MARKS_URL, {
      headers: {
        ...BROWSER_HEADERS,
        'Cookie': cookieHeader,
        'Referer': HRD_URL,
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    let html = typeof response.data === 'string' ? response.data : '';

    // Attempt 2: If GET returned session loader or no table, try POST with studentid
    if (!html.includes('<table') && !html.includes('.theGR8LoginLoader')) {
      const postRes = await axios.post(
        MARKS_URL,
        new URLSearchParams({ studentid: regNumber }).toString(),
        {
          headers: {
            ...BROWSER_HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookieHeader,
            'Referer': HRD_URL,
            'Origin': 'https://sp.srmist.edu.in',
          },
          timeout: 20000,
          validateStatus: () => true,
        }
      );
      if (typeof postRes.data === 'string' && postRes.data.includes('<table')) {
        html = postRes.data;
      }
    }

    if (response.status === 302 || html.includes('.theGR8LoginLoader') || html.includes('youLogin')) {
      return { html: '', componentsMap: {} };
    }

    // Extract subjects and fetch component-wise breakdown (FT-I, FT-II, Assignments, etc.)
    let componentsMap = {};
    try {
      const $ = cheerio.load(html);
      const subjects = [];
      $('table tbody tr').each((_, el) => {
        const btn = $(el).find('button[onclick*="funViewComponentWiseMarks"]');
        if (btn.length) {
          const onclick = btn.attr('onclick') || '';
          const match = onclick.match(/funViewComponentWiseMarks\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([^)]+)\)/);
          if (match) {
            subjects.push({
              subjectId: match[1],
              code: match[2].trim(),
              title: match[3].trim(),
              status: match[4].trim(),
            });
          }
        }
      });

      if (subjects.length > 0) {
        await Promise.allSettled(
          subjects.map(async (s) => {
            try {
              const res = await axios.post(
                MARKS_INNER_URL,
                `iden=1&hdnSubjectId=${encodeURIComponent(s.subjectId)}&status=${encodeURIComponent(s.status || 2)}`,
                {
                  headers: {
                    ...BROWSER_HEADERS,
                    'Cookie': cookieHeader,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': MARKS_URL,
                  },
                  timeout: 10000,
                  validateStatus: () => true,
                }
              );

              const innerHtml = typeof res.data === 'string' ? res.data : '';
              if (!innerHtml.includes('<table')) return;

              const inner$ = cheerio.load(innerHtml);
              const components = [];
              inner$('table tbody tr').each((_, row) => {
                const tds = inner$(row).find('td');
                if (tds.length >= 3) {
                  const date = inner$(tds[0]).text().trim();
                  const component = inner$(tds[1]).text().trim();
                  const markText = inner$(tds[2]).text().trim();
                  const parts = markText.split('/').map(p => parseFloat(p.trim()));
                  components.push({
                    exam: component || 'Assessment',
                    obtained: Number.isFinite(parts[0]) ? parts[0] : 0,
                    maxMark: Number.isFinite(parts[1]) ? parts[1] : 100,
                    date,
                  });
                }
              });

              if (components.length > 0) {
                componentsMap[s.code] = components;
              }
            } catch (innerErr) {
              console.warn(`[SP Auth] Inner marks fetch failed for ${s.code}:`, innerErr.message);
            }
          })
        );
      }
    } catch (parseErr) {
      console.warn('[SP Auth] Failed extracting inner components:', parseErr.message);
    }

    return { html, componentsMap };
  } catch (err) {
    console.warn('[SP Auth] Marks fetch failed:', err.message);
    return { html: '', componentsMap: {} };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function mergeCookies(existing, newCookies = []) {
  const map = new Map();
  if (existing) {
    existing.split('; ').forEach(c => {
      const idx = c.indexOf('=');
      if (idx > 0) map.set(c.slice(0, idx).trim(), c.slice(idx + 1).trim());
    });
  }
  newCookies.forEach(c => {
    const idx = c.indexOf('=');
    if (idx > 0) map.set(c.slice(0, idx).trim(), c.slice(idx + 1).trim());
  });
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}
