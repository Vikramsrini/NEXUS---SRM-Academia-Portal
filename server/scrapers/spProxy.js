// ═══════════════════════════════════════════════════════════════════════
// SRM Student Portal — outbound proxy support
//
// SRM's F5 ASM rejects login requests coming from datacenter ranges. Local
// residential IPs work, while Vercel (even in Mumbai) gets "Invalid
// Credentials". Setting SP_PROXY_URL to a *sticky residential* proxy routes
// every SRM request through an IP that the portal accepts.
//
// Supported URL schemes:
//   http://user:pass@host:port
//   https://user:pass@host:port
//   socks5://user:pass@host:port
//
// IMPORTANT: the proxy must keep the same exit IP for the whole flow
// (login page → captcha → LoginServlet → attendance/marks). Use your
// provider's "sticky session" endpoint, not a rotating one.
// ═══════════════════════════════════════════════════════════════════════

import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

let cachedAgent = null;
let cachedUrl = '';
let loggedEnabled = false;

export function getSpProxyUrl() {
  return (process.env.SP_PROXY_URL || '').trim();
}

export function isSpProxyEnabled() {
  return Boolean(getSpProxyUrl());
}

export function getSpProxyAgent() {
  const url = getSpProxyUrl();
  if (!url) return null;

  if (cachedAgent && cachedUrl === url) return cachedAgent;

  const Agent = /^socks/i.test(url) ? SocksProxyAgent : HttpsProxyAgent;
  try {
    cachedAgent = new Agent(url);
    cachedUrl = url;
  } catch (err) {
    // Never echo credentials back in an error message/log.
    const safeMessage = String(err?.message || err).replace(/\/\/[^@\s/]+@/g, '//***:***@');
    throw new Error(`Invalid SP_PROXY_URL: ${safeMessage}`);
  }

  if (!loggedEnabled) {
    loggedEnabled = true;
    // Never log the URL: it usually contains proxy credentials.
    console.log('[SP Proxy] Residential proxy enabled for SRM requests');
  }

  return cachedAgent;
}

/**
 * Axios config fragment for a proxied request.
 * `proxy: false` prevents axios from also applying HTTP(S)_PROXY env vars.
 */
export function spProxyConfig() {
  const agent = getSpProxyAgent();
  if (!agent) return {};
  return {
    httpAgent: agent,
    httpsAgent: agent,
    proxy: false,
  };
}
