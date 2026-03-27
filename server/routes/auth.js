// ═══════════════════════════════════════════════════════════════════════
// Routes — Authentication (Unified Login & Sync)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import axios from 'axios';
import {
  srmVerifyUser, srmVerifyPassword,
  srmGetCaptchaImage, srmVerifyWithCaptcha,
} from '../scrapers/auth.js';
import { performFullSync, repairAcademiaSession } from '../services/syncService.js';
import { setSrmSession } from '../lib/srmSession.js';
import { saveAttendanceSnapshot } from '../services/attendanceService.js';

const router = Router();

// ── SSE Storage ──────────────────────────────────────────────────────
const activeStreams = new Map();

function sendStatus(sessionId, step, message) {
  if (!sessionId) return;
  const stream = activeStreams.get(sessionId);
  if (stream) {
    stream.write(`data: ${JSON.stringify({ step, message })}\n\n`);
  }
}

router.get('/auth/login/status/:sessionId', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const { sessionId } = req.params;
  res.write(`data: {"step":"connected","message":"Connected to portal feedback..."}\n\n`);

  activeStreams.set(sessionId, res);
  req.on('close', () => activeStreams.delete(sessionId));
});

// ── Multi-step login endpoints ────────────────────────────────────────
router.post('/login/user', async (req, res) => {
  let { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  username = username.includes('@') ? username : `${username}@srmist.edu.in`;

  try {
    const result = await srmVerifyUser(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login/password', async (req, res) => {
  const { digest, identifier, password } = req.body;
  if (!digest || !identifier || !password) {
    return res.status(400).json({ error: 'Digest, identifier, and password are required' });
  }

  try {
    const result = await srmVerifyPassword(digest, identifier, password);

    if (!result.isAuthenticated && result.captcha?.required) {
      const captchaData = await srmGetCaptchaImage(result.captcha.digest);
      return res.json({
        ...result,
        captcha: {
          ...result.captcha,
          image: captchaData?.image_bytes || null,
        },
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login/captcha', async (req, res) => {
  const { cdigest, password, digest, identifier, captcha } = req.body;
  if (!cdigest || !password || !digest || !identifier || !captcha) {
    return res.status(400).json({ error: 'All captcha fields are required' });
  }

  try {
    const result = await srmVerifyWithCaptcha(identifier, digest, captcha, cdigest, password);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Unified Login Logic
 */
router.post('/auth/login', async (req, res) => {
  const { username, password, sessionId } = req.body;
  const safeSessionId = sessionId || `anon-${Date.now()}`;

  if (!username || !password) {
    return res.status(400).json({ detail: 'Username and password are required' });
  }

  try {
    sendStatus(safeSessionId, 'email', 'Validating username...');
    const userResult = await srmVerifyUser(username);
    if (!userResult.identity || !userResult.digest) {
      throw new Error(userResult.message || 'Username validation failed.');
    }

    sendStatus(safeSessionId, 'password', 'Establishing session...');
    let passResult = await srmVerifyPassword(userResult.digest, userResult.identity, password, userResult._session);

    if (!passResult.isAuthenticated) {
      if (passResult.captcha?.required) {
        const captchaData = await srmGetCaptchaImage(passResult.captcha.digest);
        return res.status(200).json({
          requiresCaptcha: true,
          captchaImage: captchaData?.image_bytes || null,
          captchaDigest: passResult.captcha.digest,
          digest: userResult.digest,
          identifier: userResult.identity,
          message: 'Captcha required for login',
        });
      }
      throw new Error(passResult.message || 'Login failed. Verify credentials.');
    }

    let authCookie = passResult.cookies;

    // ── Session Repair ──
    if (passResult.needsRepair) {
      sendStatus(safeSessionId, 'repairing', 'Completing portal landing handshake...');
      authCookie = await repairAcademiaSession(authCookie);
    }

    if (!authCookie.includes('JSESSIONID')) {
      throw new Error('Authentication partially failed: JSESSIONID missing. Try again.');
    }

    // ── PERSIST SESSION ──
    const userId = username.split('@')[0].toLowerCase();
    const iamcsrMatch = authCookie.match(/iamcsr=([^;]+)/);
    const csrfToken = iamcsrMatch ? `iamcsrcoo=${iamcsrMatch[1]}` : '';
    
    try {
      await setSrmSession(csrfToken, authCookie, userId);
      console.log(`[Auth] Session persisted for user: ${userId}`);
    } catch (saveErr) {
      console.warn(`[Auth] Failed to persist session for ${userId}:`, saveErr.message);
      // Don't fail the entire login if DB save fails
    }

    // ── SYNC ──
    sendStatus(safeSessionId, 'loggedin', 'Finalizing sync...');
    const syncData = await performFullSync(authCookie, safeSessionId, (sid, step, msg) => {
      sendStatus(sid, step, msg);
    });

    sendStatus(safeSessionId, 'done', 'All set!');

    res.json({
      token: authCookie,
      message: `Welcome ${syncData.userInfo.name.split(' ')[0]}! Logged in successfully.`,
      student_data: {
        ...syncData.userInfo,
        timetable: syncData.timetable,
        attendance: syncData.attendance,
        marks: syncData.marks,
        calendar: syncData.calendar,
        currentDayOrder: syncData.currentDayOrder,
        timestamp: syncData.timestamp,
        data_source: 'live',
      },
    });

    // Save initial snapshot
    if (syncData.userInfo?.regNumber && syncData.attendance) {
      console.log(`[Auth] Triggering snapshot for ${syncData.userInfo.regNumber} (length: ${syncData.attendance.length})`);
      saveAttendanceSnapshot(syncData.userInfo.regNumber, syncData.attendance).catch(err => {
        console.error('[Auth] Snapshot error:', err.message);
      });
    }

  } catch (err) {
    console.error('[Auth Route] Login Error:', err.message);
    sendStatus(safeSessionId, 'error', err.message);
    res.status(401).json({ detail: err.message });
  }
});

/**
 * Fast Sync: Uses existing session cookies (no re-login)
 */
router.post('/auth/sync-fast', async (req, res) => {
  const authHeader = req.headers.authorization;
  const authCookie = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers.token || null);

  if (!authCookie) return res.status(401).json({ error: 'No session token found' });

  try {
    // Perform sync using the existing cookies
    const syncResult = await performFullSync(authCookie, null);

    res.json({
      token: authCookie,
      student_data: {
        ...syncResult.userInfo,
        timetable: syncResult.timetable,
        attendance: syncResult.attendance,
        marks: syncResult.marks,
        calendar: syncResult.calendar,
        currentDayOrder: syncResult.currentDayOrder,
        timestamp: syncResult.timestamp,
      },
    });

    // Save snapshot on fast sync
    if (syncResult.userInfo?.regNumber && syncResult.attendance) {
      console.log(`[Auth Fast] Triggering snapshot for ${syncResult.userInfo.regNumber}`);
      saveAttendanceSnapshot(syncResult.userInfo.regNumber, syncResult.attendance).catch(err => {
        console.error('[Auth Fast] Snapshot error:', err.message);
      });
    }
  } catch (err) {
    console.error('[Auth Route] Fast sync failed:', err.message);
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
});

/**
 * Combined Sync endpoint (Slow/Full re-auth)
 */
router.post('/auth/sync', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Sync needs credentials' });

  try {
    const userResult = await srmVerifyUser(username);
    const passResult = await srmVerifyPassword(userResult.digest, userResult.identity, password, userResult._session);

    const authCookie = passResult.cookies;
    const syncResult = await performFullSync(authCookie, null);

    res.json({
      token: authCookie,
      student_data: {
        ...syncResult.userInfo,
        timetable: syncResult.timetable,
        attendance: syncResult.attendance,
        marks: syncResult.marks,
        calendar: syncResult.calendar,
        currentDayOrder: syncResult.currentDayOrder,
        timestamp: syncResult.timestamp,
      },
    });

    // Save snapshot on full sync
    if (syncResult.userInfo?.regNumber && syncResult.attendance) {
      saveAttendanceSnapshot(syncResult.userInfo.regNumber, syncResult.attendance).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Logout
 */
router.get('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const authCookie = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers.token || null);

  if (!authCookie) return res.json({ message: 'Logged out local' });

  try {
    await axios.get('https://academia.srmist.edu.in/accounts/logout', {
      headers: { cookie: authCookie }
    });
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.json({ message: 'Logged out successfully' });
  }
});

export default router;
