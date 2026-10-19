import axios from 'axios';
import * as cheerio from 'cheerio';
import { spProxyConfig } from './spProxy.js';

const SP_BASE = 'https://sp.srmist.edu.in/srmiststudentportal';
const LOGIN_URL = `${SP_BASE}/students/loginManager/youLogin.jsp`;
const LOGIN_SERVLET_URL = `${SP_BASE}/LoginServlet`;
const ATTENDANCE_URL = `${SP_BASE}/students/report/studentAttendanceDetails.jsp`;
const MARKS_URL = `${SP_BASE}/students/report/studentInternalMarkDetails.jsp`;
const MARKS_INNER_URL = `${SP_BASE}/students/report/studentInternalMarkDetailsInner.jsp`;
const HRD_URL = `${SP_BASE}/students/template/HRDSystem.jsp`;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Connection': 'keep-alive',
};

// Every SRM request goes through this instance so a configured residential
// proxy is applied consistently (login page, captcha, LoginServlet, reports).
const spHttp = axios.create();
spHttp.interceptors.request.use((config) => {
  const proxy = spProxyConfig();
  if (proxy.httpsAgent) {
    config.httpAgent = proxy.httpAgent;
    config.httpsAgent = proxy.httpsAgent;
    config.proxy = false;
  }
  return config;
});

// In-memory store for pending login sessions
const pendingSessions = new Map();

// Cleanup stale sessions every 5 minutes
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, session] of pendingSessions.entries()) {
    if (session.startedAt < cutoff) pendingSessions.delete(id);
  }
}, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Step 1: Fetches the SP login page and the real captcha image from SCaptchaServlet.
 * Returns { sessionId, captchaImg } where captchaImg is a base64 Data URL.
 */
export async function fetchSpLoginPage() {
  const loginRes = await spHttp.get(LOGIN_URL, {
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

  if (!captchaSrc || !nonce || !domainFieldName || !captchaFieldName) {
    throw new Error('Could not find captcha or security tokens on Student Portal login page');
  }

  // Fetch the genuine PNG/JPEG captcha from SCaptchaServlet
  const captchaUrl = captchaSrc.startsWith('http') ? captchaSrc : `https://sp.srmist.edu.in${captchaSrc}`;
  const proof = Buffer.from(`${nonce}:sp.srmist.edu.in`).toString('base64');

  const imgRes = await spHttp.get(captchaUrl, {
    headers: {
      'User-Agent': BROWSER_HEADERS['User-Agent'],
      'Cookie': cookies,
      'X-Domain-Proof': proof,
      'Referer': LOGIN_URL,
      'Accept': 'image/png, image/jpeg, image/svg+xml, image/*',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
    validateStatus: () => true,
  });

  const mimeType = imgRes.headers['content-type'] || 'image/png';
  if (imgRes.status !== 200 || !imgRes.data || imgRes.data.length === 0 || mimeType.includes('text/html')) {
    throw new Error(`Failed to load captcha image: HTTP ${imgRes.status} (${mimeType})`);
  }

  // Check for any additional cookies set by SCaptchaServlet
  const imgCookies = (imgRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).filter(Boolean);
  const allCookies = mergeCookies(cookies, imgCookies);

  const captchaImg = `data:${mimeType};base64,${Buffer.from(imgRes.data).toString('base64')}`;

  const sessionPayload = {
    cookies: allCookies,
    domainFieldName,
    captchaFieldName,
    randomDelimiter,
    honeypotName,
    startedAt: Date.now(),
  };

  // Base64url encoded token so serverless instances never lose session state
  const sessionId = Buffer.from(JSON.stringify(sessionPayload)).toString('base64url');
  pendingSessions.set(sessionId, sessionPayload);

  return { sessionId, captchaImg };
}

/**
 * Step 2: Submits login to LoginServlet with authentic telemetry and tokens.
 */
export async function submitSpLogin(sessionId, username, password, userCaptcha) {
  let session = pendingSessions.get(sessionId);
  if (!session && sessionId) {
    try {
      session = JSON.parse(Buffer.from(sessionId, 'base64url').toString('utf8'));
    } catch { /* fallback */ }
  }
  if (!session || !session.cookies) {
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
    canvasHash: '-7761ace2',
    submitTime: now,
    timeOnPageMs: now - startedAt,
  };
  const telemetryPayload = Buffer.from(JSON.stringify(telemetry)).toString('base64');

  // Build form payload
  const cleanUsername = username.trim().toLowerCase().replace(/@srmist\.edu\.in$/i, '').split('@')[0].trim();
  const params = new URLSearchParams();
  params.append('username', cleanUsername);
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

  // guardloginbottom.js appends the domain token exactly once on the real
  // domain (the second append in guardlogin.js only runs on a phishing host).
  // Sending it twice is not what the browser does.

  // Drop the IP-bound F5 ASM cookies for the login POST. JSESSIONID carries the
  // server-side login session; the TS* cookie is what makes a login submitted
  // from a different serverless egress IP look like a security violation.
  const loginCookies = onlyJSessionCookie(cookies) || stripF5Cookies(cookies) || cookies;

  // POST to LoginServlet
  const loginRes = await spHttp.post(LOGIN_SERVLET_URL, params.toString(), {
    headers: {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': loginCookies,
      'Referer': LOGIN_URL,
      'Origin': 'https://sp.srmist.edu.in',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 20000,
  });

  // Capture response cookies. Start from the non-IP-bound cookies and layer on
  // whatever the login response issued for *this* invocation's IP.
  const postCookies = (loginRes.headers['set-cookie'] || [])
    .map(c => c.split(';')[0])
    .filter(c => !c.includes('Max-Age=0'));

  let activeCookies = mergeCookies(stripF5Cookies(cookies), postCookies);

  // Success is indicated by HTTP 302 redirect to HRDSystem.jsp
  const location = loginRes.headers['location'] || '';
  const isRedirectToApp = loginRes.status === 302 && (location.includes('HRDSystem') || !location.includes('youLogin'));

  if (!isRedirectToApp) {
    const body = typeof loginRes.data === 'string' ? loginRes.data : '';
    const $ = cheerio.load(body);
    $('.alert-heading').remove();
    const alertText = $('.alert-danger, .alert').text().trim().replace(/\s+/g, ' ');
    const classified = classifySpLoginAlert(alertText);
    console.log('[SP Login Debug]', {
      status: loginRes.status,
      location,
      alertText: alertText || '(no alert found)',
      code: classified?.code || null,
    });

    if (classified) {
      throw spLoginError(classified.message, classified.status, classified.code);
    }
    if (/invalid captcha\./i.test(body)) {
      throw spLoginError('Invalid captcha entered. Please try again.', 401, 'INVALID_CAPTCHA');
    }
    if (body.includes('youLogin') || location.includes('youLogin')) {
      throw spLoginError(
        'Invalid NetID or password. Student Portal requires your official SRM E-mail (Microsoft 365) password, not your Academia portal password.',
        401,
        'INVALID_CREDENTIALS'
      );
    }
    throw spLoginError('Student Portal login failed. Please verify your credentials and captcha.', 401, 'LOGIN_REJECTED');
  }

  // Follow redirect to HRDSystem.jsp to initialize student session
  const targetUrl = location.startsWith('http') ? location : `https://sp.srmist.edu.in${location}`;
  try {
    const hrdRes = await spHttp.get(targetUrl, {
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

  // Persist only IP-independent cookies. The TS* cookie from this invocation
  // must not be replayed later from a different serverless egress IP.
  const persistedCookies = stripF5Cookies(activeCookies);
  const workerCookie = persistedCookies.split('; ').find(c => c.startsWith('worker')) || '';

  return { jsessionid, workerCookie, allCookies: activeCookies, persistedCookies };
}

/**
 * Step 3: Fetches attendance HTML using the authenticated cookies.
 */
export async function fetchAttendanceWithSession(jsessionid, workerCookieOrAllCookies, regNumber, options = {}) {
  const cookieHeader = buildSessionCookieHeader(jsessionid, workerCookieOrAllCookies, {
    stripF5: options.stripF5 !== false,
  });

  // Attempt 1: GET studentAttendanceDetails.jsp
  let response = await spHttp.get(ATTENDANCE_URL, {
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
    const postRes = await spHttp.post(
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
export async function fetchMarksWithSession(jsessionid, workerCookieOrAllCookies, regNumber, options = {}) {
  const cookieHeader = buildSessionCookieHeader(jsessionid, workerCookieOrAllCookies, {
    stripF5: options.stripF5 !== false,
  });

  try {
    // Attempt 1: GET studentInternalMarkDetails.jsp
    let response = await spHttp.get(MARKS_URL, {
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
      const postRes = await spHttp.post(
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
              const res = await spHttp.post(
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

function parseCookieHeader(header = '') {
  const map = new Map();
  if (!header) return map;
  header.split(';').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
    }
  });
  return map;
}

/**
 * F5 BIG-IP ASM issues TS* / BIGipServer* cookies that are bound to the source
 * IP address. On Vercel (and any load-balanced/serverless host) the captcha is
 * fetched by one invocation and the login is submitted by another, often with a
 * different outbound IP. Replaying the IP-bound cookie makes F5 reject an
 * otherwise perfectly valid login with the generic "Invalid credentials" page.
 */
function isF5Cookie(name = '') {
  return /^TS[0-9a-f]+(?:[_-][0-9a-f]+)?$/i.test(name) || /^BIGipServer/i.test(name);
}

function stripF5Cookies(header = '') {
  const map = parseCookieHeader(header);
  for (const name of map.keys()) {
    if (isF5Cookie(name)) map.delete(name);
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function onlyJSessionCookie(header = '') {
  const map = parseCookieHeader(header);
  const value = map.get('JSESSIONID');
  return value ? `JSESSIONID=${value}` : '';
}

function mergeCookies(existing, newCookies = []) {
  const map = parseCookieHeader(existing);
  newCookies.forEach(c => {
    // Set-Cookie values may carry attributes (Path, Secure, HttpOnly, ...).
    // Only the leading name=value pair belongs in a Cookie request header.
    const parsed = parseCookieHeader(String(c).split(';')[0]);
    for (const [name, value] of parsed) map.set(name, value);
  });
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * SRM returns two very different messages that look almost identical:
 *
 *   "Invalid login credentials. The user ID or password entered is invalid."
 *     -> the credentials really are wrong
 *
 *   "Invalid credentials"
 *     -> F5 ASM / telemetry / anti-bot check rejected the request. The password
 *        may be entirely correct.
 *
 * Conflating them is what told users with valid passwords that their password
 * was invalid. Keep the classification separate and let the UI explain it.
 */
export function classifySpLoginAlert(alertText = '') {
  const text = String(alertText || '').trim();
  if (!text) return null;

  if (/invalid captcha/i.test(text)) {
    return {
      code: 'INVALID_CAPTCHA',
      status: 401,
      message: 'Invalid captcha entered. Please try again.',
    };
  }

  if (/temporarily locked|locked due to multiple|too many (?:login )?attempts/i.test(text)) {
    return {
      code: 'ACCOUNT_LOCKED',
      status: 429,
      message: text,
    };
  }

  if (/invalid login credentials|user ID or password entered is invalid/i.test(text)) {
    return {
      code: 'INVALID_CREDENTIALS',
      status: 401,
      message: 'Invalid NetID or password. Student Portal requires your official SRM Microsoft 365 student email password (which may differ from your Academia Zoho password). If you forgot it, reset it at ssp.srmist.edu.in.',
    };
  }

  // Generic "Invalid credentials" is SRM's anti-bot/security rejection, not a
  // password mismatch. Do not tell the user their password is wrong.
  if (/invalid credentials/i.test(text)) {
    return {
      code: 'SECURITY_CHECK',
      status: 401,
      message: 'SRM rejected the login at its security check (this is not necessarily your password). Refresh the captcha and try again. If you are on a VPN, proxy, or mobile hotspot, turn it off and retry.',
    };
  }

  return {
    code: 'LOGIN_REJECTED',
    status: 401,
    message: text,
  };
}

function spLoginError(message, status = 401, code = 'LOGIN_FAILED') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function buildSessionCookieHeader(jsessionid, cookieString, { stripF5 = true } = {}) {
  let header = cookieString || '';
  if (!header.includes('JSESSIONID') && jsessionid) {
    header = [`JSESSIONID=${jsessionid}`, header].filter(Boolean).join('; ');
  }
  return stripF5 ? stripF5Cookies(header) : header;
}
