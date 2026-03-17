// ═══════════════════════════════════════════════════════════════════════
// Middleware — Auth Token Extraction
// Extracts Bearer token or raw token header from requests.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Middleware that extracts the auth cookie from:
 *   - Authorization: Bearer <token>
 *   - token header
 * Sets req.authCookie or returns 401.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const authCookie = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers.token || null);

  if (!authCookie) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  req.authCookie = authCookie;
  next();
}
