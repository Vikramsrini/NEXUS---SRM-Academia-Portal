// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Authentication Flow
// Handles login, password verification, captcha, session management
// ═══════════════════════════════════════════════════════════════════════

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');

/**
 * Persists updated session details back to the .env file.
 */
async function updateEnvFile(cookies, csrfToken) {
  try {
    let content = await fs.readFile(ENV_PATH, 'utf8');
    
    // Update or add SRM_CSRF_TOKEN
    if (content.includes('SRM_CSRF_TOKEN=')) {
      content = content.replace(/^SRM_CSRF_TOKEN=.*$/m, `SRM_CSRF_TOKEN=${csrfToken}`);
    } else {
      content += `\nSRM_CSRF_TOKEN=${csrfToken}`;
    }

    // Update or add SRM_SESSION_COOKIES
    if (content.includes('SRM_SESSION_COOKIES=')) {
      content = content.replace(/^SRM_SESSION_COOKIES=.*$/m, `SRM_SESSION_COOKIES=${cookies}`);
    } else {
      content += `\nSRM_SESSION_COOKIES=${cookies}`;
    }

    await fs.writeFile(ENV_PATH, content, 'utf8');
    
    // Also update process.env for the current session
    process.env.SRM_CSRF_TOKEN = csrfToken;
    process.env.SRM_SESSION_COOKIES = cookies;

    console.log('[SRM] .env file updated with fresh session tokens');
  } catch (err) {
    console.error('[SRM] Failed to update .env file:', err.message);
  }
}

const SRM_LOGIN_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'Referer': 'https://academia.srmist.edu.in/accounts/p/10002227248/signin?hide_fp=true&servicename=ZohoCreator&service_language=en&css_url=/49910842/academia-academic-services/downloadPortalCustomCss/login&dcc=true&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Fetches fresh session cookies and CSRF token from SRM login page.
 */
export async function getFreshSrmSession() {
  const resp = await fetch(
    'https://academia.srmist.edu.in/accounts/p/10002227248/signin?servicename=ZohoCreator&service_language=en&serviceurl=https%3A%2F%2Facademia.srmist.edu.in',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }, redirect: 'manual' }
  );

  const cookies = resp.headers.getSetCookie()
    .filter(c => !c.includes('Max-Age=0'))
    .map(c => c.split(';')[0]);

  const cookieStr = cookies.join('; ');
  const iamcsrMatch = cookieStr.match(/iamcsr=([^;]+)/);
  const csrfToken = iamcsrMatch ? `iamcsrcoo=${iamcsrMatch[1]}` : SRM_CSRF_TOKEN;

  console.log('[SRM] Fresh session cookies obtained, CSRF:', csrfToken.substring(0, 30) + '...');
  
  // Persist to .env automatically
  await updateEnvFile(cookieStr, csrfToken);

  return { cookies: cookieStr, csrfToken };
}

/**
 * Step 1: Verify username against SRM login API.
 */
export async function srmVerifyUser(username) {
  if (!username.includes('@')) {
    username = `${username}@srmist.edu.in`;
  }
  const session = await getFreshSrmSession();
  const response = await axios(
    `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/lookup/${encodeURIComponent(username)}`,
    {
      method: 'POST',
      headers: {
        ...SRM_LOGIN_HEADERS,
        'x-zcsrf-token': session.csrfToken,
        'cookie': session.cookies,
      },
      data: `mode=primary&cli_time=${Date.now()}&servicename=ZohoCreator&service_language=en&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin`,
    }
  );
  const data = response.data;
  return {
    identity: data.lookup?.identifier,
    statusCode: data.status_code,
    message: data.message,
    digest: data.lookup?.digest,
    _session: session,
  };
}

/**
 * Step 2: Verify password, handle pre-announcement (concurrent sessions),
 * and establish Creator session (JSESSIONID).
 */
export async function srmVerifyPassword(digest, identifier, password, session) {
  const url = `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/primary/${encodeURIComponent(identifier)}/password?digest=${digest}&cli_time=${Date.now()}&servicename=ZohoCreator&service_language=en&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin`;

  const loginCookies = session?.cookies || process.env.SRM_SESSION_COOKIES || '';
  const loginCsrf = session?.csrfToken || process.env.SRM_CSRF_TOKEN || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...SRM_LOGIN_HEADERS,
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-zcsrf-token': loginCsrf,
      'cookie': loginCookies,
    },
    body: JSON.stringify({ passwordauth: { password } }),
    redirect: 'manual',
  });

  const data = await response.json();

  if (data.status_code === 201) {
    const iamttCookies = response.headers.getSetCookie()
      .filter(c => !c.includes('Max-Age=0'))
      .map(c => c.split(';')[0]);
    let allCookies = loginCookies + '; ' + iamttCookies.join('; ');

    // Handle pre-announcement (concurrent session limit)
    const redirectUri = data.passwordauth?.redirect_uri || '';
    if (redirectUri.includes('preannouncement') || redirectUri.includes('block-sessions')) {
      console.log('[SRM] Pre-announcement detected, terminating existing sessions...');
      const termResp = await fetch(
        'https://academia.srmist.edu.in/accounts/p/40-10002227248/webclient/v1/announcement/pre/blocksessions',
        {
          method: 'DELETE',
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'x-zcsrf-token': loginCsrf,
            'cookie': allCookies,
          },
        }
      );
      const termData = await termResp.json().catch(() => ({}));
      console.log('[SRM] Terminate sessions result:', termData.message || termData.status_code);

      const nextResp = await fetch(
        'https://academia.srmist.edu.in/accounts/p/40-10002227248/preannouncement/block-sessions/next',
        {
          headers: { 'cookie': allCookies },
          redirect: 'manual',
        }
      );
      const nextCookies = nextResp.headers.getSetCookie()
        .filter(c => !c.includes('Max-Age=0'))
        .map(c => c.split(';')[0]);
      if (nextCookies.length) {
        allCookies = nextCookies.join('; ');
        console.log('[SRM] Got', nextCookies.length, 'session cookies after termination');
      }
    }

    // Follow redirectFromLogin to establish Creator session
    console.log('[SRM] Establishing Creator session...');
    const creatorResp = await fetch(
      'https://academia.srmist.edu.in/portal/academia-academic-services/redirectFromLogin',
      {
        headers: { 'cookie': allCookies },
        redirect: 'manual',
      }
    );
    const creatorCookies = creatorResp.headers.getSetCookie()
      .filter(c => !c.includes('Max-Age=0'))
      .map(c => c.split(';')[0]);

    const creatorLocation = creatorResp.headers.get('location');
    if (creatorLocation) {
      const loginResp = await fetch(
        creatorLocation.startsWith('http') ? creatorLocation : `https://academia.srmist.edu.in${creatorLocation}`,
        {
          headers: { 'cookie': allCookies + '; ' + creatorCookies.join('; ') },
          redirect: 'manual',
        }
      );
      const loginRespCookies = loginResp.headers.getSetCookie()
        .filter(c => !c.includes('Max-Age=0'))
        .map(c => c.split(';')[0]);
      if (loginRespCookies.length) {
        creatorCookies.push(...loginRespCookies);
      }
    }

    if (creatorCookies.length) {
      allCookies += '; ' + creatorCookies.join('; ');
    }

    const hasSession = allCookies.includes('JSESSIONID');
    console.log('[SRM] Creator session established:', hasSession, '| Cookie count:', allCookies.split(';').length);

    return { isAuthenticated: true, cookies: allCookies };
  }

  const authMessage = String(data.localized_message || data.message || '').toLowerCase();
  const captchaRequired =
    authMessage.includes('captcha') ||
    authMessage.includes('hip required') ||
    authMessage.includes('hip') ||
    Boolean(data.cdigest);
  return {
    isAuthenticated: false,
    statusCode: data.status_code,
    message: data.localized_message || data.message,
    captcha: captchaRequired
      ? { required: true, digest: data.cdigest }
      : { required: false, digest: null },
  };
}

/**
 * Fetches captcha image for a given digest.
 */
export async function srmGetCaptchaImage(captchaDigest) {
  const response = await fetch(
    `https://academia.srmist.edu.in/accounts/p/40-10002227248/webclient/v1/captcha/${captchaDigest}?darkmode=false`,
    {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'cookie': process.env.SRM_SESSION_COOKIES || '',
      },
    }
  );
  const data = await response.json();
  return data.captcha;
}

/**
 * Verifies password with captcha included.
 */
export async function srmVerifyWithCaptcha(identifier, digest, captcha, cdigest, password) {
  const url = `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/primary/${encodeURIComponent(identifier)}/password?digest=${digest}&cli_time=${Date.now()}&servicename=ZohoCreator&service_language=en&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2Fportal%2Facademia-academic-services%2FredirectFromLogin&captcha=${encodeURIComponent(captcha)}&cdigest=${encodeURIComponent(cdigest)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...SRM_LOGIN_HEADERS,
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-zcsrf-token': process.env.SRM_CSRF_TOKEN || '',
      'cookie': process.env.SRM_SESSION_COOKIES || '',
    },
    body: JSON.stringify({ passwordauth: { password } }),
  });

  const data = await response.json();

  if (data.status_code === 201) {
    const cookies = response.headers.getSetCookie()
      .filter(cookie => !cookie.includes('Max-Age=0'))
      .map(cookie => cookie.split(';')[0])
      .join('; ');
    return { isAuthenticated: true, cookies };
  }

  return {
    isAuthenticated: false,
    statusCode: data.status_code,
    message: data.localized_message || data.message,
  };
}
