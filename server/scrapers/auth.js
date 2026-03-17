// ═══════════════════════════════════════════════════════════════════════
// SRM Academia — Authentication Flow (FIXED VERSION)
// Stable for production (Render/Vercel compatible)
// ═══════════════════════════════════════════════════════════════════════

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

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
  'Referer': 'https://academia.srmist.edu.in/accounts/p/10002227248/signin',
};

/**
 * Fetch fresh session cookies + CSRF
 */
export async function getFreshSrmSession() {
  const resp = await fetch(
    'https://academia.srmist.edu.in/accounts/p/10002227248/signin?servicename=ZohoCreator&service_language=en',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'manual',
    }
  );

  const setCookie = resp.headers.getSetCookie?.() || [];

  const cookies = setCookie
    .filter(c => !c.includes('Max-Age=0'))
    .map(c => c.split(';')[0]);

  const cookieStr = cookies.join('; ');

  const iamcsrMatch = cookieStr.match(/iamcsr=([^;]+)/);

  const csrfToken = iamcsrMatch
    ? `iamcsrcoo=${iamcsrMatch[1]}`
    : process.env.SRM_CSRF_TOKEN || '';

  // Store in memory (NOT .env)
  process.env.SRM_CSRF_TOKEN = csrfToken;
  process.env.SRM_SESSION_COOKIES = cookieStr;

  console.log('[SRM] Session initialized');

  return { cookies: cookieStr, csrfToken };
}

/**
 * Step 1: Verify username
 */
export async function srmVerifyUser(username) {
  if (!username.includes('@')) {
    username = `${username}@srmist.edu.in`;
  }

  const session = await getFreshSrmSession();

  const response = await axios.post(
    `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/lookup/${encodeURIComponent(
      username
    )}`,
    `mode=primary&cli_time=${Date.now()}`,
    {
      headers: {
        ...SRM_LOGIN_HEADERS,
        'x-zcsrf-token': session.csrfToken,
        cookie: session.cookies,
      },
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
 * Step 2: Verify password
 */
export async function srmVerifyPassword(
  digest,
  identifier,
  password,
  session
) {
  const url = `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/primary/${encodeURIComponent(
    identifier
  )}/password?digest=${digest}&cli_time=${Date.now()}`;

  const cookies = session?.cookies || process.env.SRM_SESSION_COOKIES || '';
  const csrf = session?.csrfToken || process.env.SRM_CSRF_TOKEN || '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...SRM_LOGIN_HEADERS,
      'x-zcsrf-token': csrf,
      cookie: cookies,
    },
    body: new URLSearchParams({
      'passwordauth.password': password,
    }),
    redirect: 'manual',
  });

  const data = await response.json().catch(() => ({}));

  // ✅ SUCCESS
  if (data.status_code === 201) {
    const setCookie = response.headers.getSetCookie?.() || [];

    const newCookies = setCookie
      .filter(c => !c.includes('Max-Age=0'))
      .map(c => c.split(';')[0]);

    const allCookies = cookies + '; ' + newCookies.join('; ');

    console.log('[SRM] Login success');

    return {
      isAuthenticated: true,
      cookies: allCookies,
    };
  }

  // ❌ FAILURE (captcha / wrong pass)
  const authMessage = String(
    data.localized_message || data.message || ''
  ).toLowerCase();

  const captchaRequired =
    Boolean(data.cdigest) ||
    authMessage.includes('captcha') ||
    authMessage.includes('hip');

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
 * Get captcha image
 */
export async function srmGetCaptchaImage(captchaDigest) {
  const response = await fetch(
    `https://academia.srmist.edu.in/accounts/p/40-10002227248/webclient/v1/captcha/${captchaDigest}`,
    {
      headers: {
        cookie: process.env.SRM_SESSION_COOKIES || '',
      },
    }
  );

  const data = await response.json();
  return data.captcha;
}

/**
 * Verify password WITH captcha
 */
export async function srmVerifyWithCaptcha(
  identifier,
  digest,
  captcha,
  cdigest,
  password
) {
  const url = `https://academia.srmist.edu.in/accounts/p/40-10002227248/signin/v2/primary/${encodeURIComponent(
    identifier
  )}/password?digest=${digest}&captcha=${captcha}&cdigest=${cdigest}&cli_time=${Date.now()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...SRM_LOGIN_HEADERS,
      'x-zcsrf-token': process.env.SRM_CSRF_TOKEN || '',
      cookie: process.env.SRM_SESSION_COOKIES || '',
    },
    body: new URLSearchParams({
      'passwordauth.password': password,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (data.status_code === 201) {
    const setCookie = response.headers.getSetCookie?.() || [];

    const cookies = setCookie
      .filter(c => !c.includes('Max-Age=0'))
      .map(c => c.split(';')[0])
      .join('; ');

    return { isAuthenticated: true, cookies };
  }

  return {
    isAuthenticated: false,
    statusCode: data.status_code,
    message: data.localized_message || data.message,
  };
}
