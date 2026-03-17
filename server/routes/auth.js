// ═══════════════════════════════════════════════════════════════════════
// Routes — Authentication (Login, Sync, Logout, SSE Status)
// ═══════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import axios from 'axios';
import {
  srmVerifyUser, srmVerifyPassword,
  srmGetCaptchaImage, srmVerifyWithCaptcha,
} from '../scrapers/auth.js';
import { fetchAcademicPage, fetchTimetablePage, fetchRawAcademicPage } from '../scrapers/fetcher.js';
import { parseAttendance } from '../scrapers/attendance.js';
import { parseMarks } from '../scrapers/marks.js';
import { parseCourses, buildTimetable } from '../scrapers/timetable.js';
import { fetchCurrentDayOrder } from '../scrapers/dayorder.js';
import { fetchRealUserInfo } from '../scrapers/userinfo.js';
import { deriveAcademicBranch } from '../utils/courses.js';
import { getCalendarUrls, parseSrmCalendar } from '../scrapers/calendar.js';

const router = Router();

// ── SSE for real-time login progress ──────────────────────────────────
const activeStreams = new Map();

function sendStatus(sessionId, step, message) {
  const stream = activeStreams.get(sessionId);
  if (stream) stream.write(`data: ${JSON.stringify({ step, message })}\n\n`);
  console.log(`[${step}] ${message}`);
}

router.get('/auth/login/status/:sessionId', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: {"step":"connected","message":"Connected to server..."}\n\n');
  activeStreams.set(req.params.sessionId, res);
  req.on('close', () => activeStreams.delete(req.params.sessionId));
});

// ── Multi-step login endpoints ────────────────────────────────────────
router.post('/login/user', async (req, res) => {
  let { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  username = username.includes('@') ? username : `${username}@srmist.edu.in`;

  try {
    const result = await srmVerifyUser(username);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('User verification error:', e.message);
    res.status(500).json({ error: 'Failed to verify user: ' + e.message });
  }
});

router.post('/login/password', async (req, res) => {
  const { digest, identifier, password } = req.body;
  if (!digest || !identifier || !password) {
    return res.status(400).json({ error: 'Digest, identifier, and password are required' });
  }

  try {
    const result = await srmVerifyPassword(digest, identifier, password);
    if (result.error) return res.status(500).json({ error: result.error });

    if (!result.isAuthenticated && result.captcha?.required) {
      const captchaData = await srmGetCaptchaImage(result.captcha.digest);
      if (captchaData?.error) return res.status(500).json({ error: captchaData.error });
      return res.json({
        isAuthenticated: false,
        statusCode: result.statusCode,
        message: result.message,
        captcha: {
          required: true,
          digest: result.captcha.digest,
          image: captchaData?.image_bytes || null,
        },
      });
    }
    res.json(result);
  } catch (e) {
    console.error('Password verification error:', e.message);
    res.status(500).json({ error: 'Failed to verify password: ' + e.message });
  }
});

// ── Unified login ─────────────────────────────────────────────────────

/**
 * Shared logic to sync student data after successful authentication
 */
async function syncStudentData(authCookie, sessionId) {
  let timetable = [];
  let attendance = [];
  let marks = [];
  let calendar = [];
  let regNumber = '';
  let batch = '';
  let studentName = 'SRM Student';
  let userInfo = {};

  try {
    sendStatus(sessionId, 'discover', 'Syncing your academic records...');

    try {
      userInfo = await fetchRealUserInfo(authCookie);
    } catch (userInfoError) {
      console.error('User info sync error:', userInfoError.message);
    }

    const attHtml = await fetchAcademicPage(authCookie,
      'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
    const attResult = parseAttendance(attHtml);
    attendance = attResult.attendance;
    regNumber = attResult.regNumber;
    marks = parseMarks(attHtml, attendance);
    sendStatus(sessionId, 'attendance', `Synced ${attendance.length} courses and ${marks.length} marks`);

    const ttHtml = await fetchTimetablePage(authCookie);
    if (ttHtml) {
      const ttResult = parseCourses(ttHtml);
      batch = ttResult.batch;
      timetable = buildTimetable(ttResult.courses, batch);
      if (ttResult.studentName && ttResult.studentName.length > 2) studentName = ttResult.studentName;

      userInfo = {
        ...ttResult,
        ...userInfo,
        name: userInfo.name || ttResult.studentName || studentName,
        program: userInfo.program || ttResult.program || '',
        department: userInfo.department || ttResult.department || '',
        section: userInfo.section || ttResult.section || '',
        semester: userInfo.semester || ttResult.semester || '',
        branch: userInfo.branch || ttResult.branch || deriveAcademicBranch(userInfo.program || ttResult.program, userInfo.department || ttResult.department),
      };
    }
    sendStatus(sessionId, 'timetable', `Synced timetable with ${timetable.length} classes`);

    // Fetch calendar while session is still fresh
    try {
      const calUrls = getCalendarUrls();
      for (const calUrl of calUrls) {
        try {
          const rawCal = await fetchRawAcademicPage(authCookie, calUrl);
          if (rawCal) {
            const calParsed = parseSrmCalendar(rawCal);
            if (calParsed.calendar?.length > 0) {
              calendar = calParsed.calendar;
              console.log(`[Calendar] Success during sync from: ${calUrl}`);
              break;
            }
          }
        } catch (calErr) {
          console.log(`[Calendar] Failed ${calUrl}: ${calErr.message}`);
        }
      }
    } catch (calError) {
      console.error('Calendar sync error:', calError.message);
    }
  } catch (dataErr) {
    console.error('Data sync error:', dataErr.message);
    sendStatus(sessionId, 'error', 'Data sync partially failed, but login succeeded.');
  }

  const currentDayOrder = await fetchCurrentDayOrder(authCookie);
  
  return {
    name: userInfo.name || studentName,
    regNumber,
    batch,
    branch: userInfo.branch || deriveAcademicBranch(userInfo.program, userInfo.department),
    program: userInfo.program || '',
    department: userInfo.department || '',
    section: userInfo.section || '',
    semester: userInfo.semester || '',
    timetable,
    attendance,
    marks,
    calendar,
    currentDayOrder,
    data_source: 'live'
  };
}

router.post('/login/captcha', async (req, res) => {
  const { cdigest, password, digest, identifier, captcha, sessionId, sessionCookies, sessionCsrf } = req.body;
  if (!cdigest || !password || !digest || !identifier || !captcha) {
    return res.status(400).json({ error: 'All captcha fields are required' });
  }

  try {
    sendStatus(sessionId, 'password', 'Verifying captcha & credentials...');
    const result = await srmVerifyWithCaptcha(identifier, digest, captcha, cdigest, password, sessionCookies, sessionCsrf);
    
    if (!result.isAuthenticated) {
      return res.status(401).json({ error: result.message || 'Captcha verification failed' });
    }

    const authCookie = result.cookies;
    sendStatus(sessionId, 'loggedin', 'Login successful!');

    const studentData = await syncStudentData(authCookie, sessionId);
    sendStatus(sessionId, 'done', 'All set!');

    res.json({
      token: authCookie,
      message: `Welcome ${studentData.name}! Logged in successfully.`,
      student_data: studentData,
    });
  } catch (e) {
    console.error('Captcha verification error:', e.message);
    sendStatus(sessionId, 'error', `Error: ${e.message}`);
    res.status(500).json({ error: 'Failed to verify captcha: ' + e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { username, password, sessionId } = req.body;
  if (!username || !password) {
    return res.status(400).json({ detail: 'Missing credentials' });
  }

  try {
    sendStatus(sessionId, 'email', 'Verifying username...');
    const userResult = await srmVerifyUser(username);
    
    // Check if captcha is required during username check
    if (!userResult.identity && userResult.captcha?.required) {
      let captchaImage = null;
      try {
        const captchaData = await srmGetCaptchaImage(userResult.captcha.digest, userResult._session?.cookies);
        captchaImage = (typeof captchaData === 'string') ? captchaData : (captchaData?.image_bytes || captchaData?.captcha || null);
      } catch (e) { console.error('Captcha fetch error (lookup):', e.message); }

      return res.status(200).json({
        requiresCaptcha: true,
        captchaImage,
        captchaDigest: userResult.captcha.digest,
        digest: userResult.digest || '',
        identifier: username,
        sessionCookies: userResult._session?.cookies,
        sessionCsrf: userResult._session?.csrfToken,
        message: userResult.message || 'Security verification required',
      });
    }

    if (!userResult.identity || (!userResult.digest && !userResult.captcha?.required)) {
      throw new Error(userResult.message || 'Username verification failed. Check your NetID.');
    }

    sendStatus(sessionId, 'password', 'Verifying password...');
    const passResult = await srmVerifyPassword(userResult.digest, userResult.identity, password, userResult._session);

    if (!passResult.isAuthenticated) {
      if (passResult.captcha?.required) {
        let captchaImage = null;
        try {
          const captchaData = await srmGetCaptchaImage(passResult.captcha.digest, userResult._session?.cookies);
          captchaImage = (typeof captchaData === 'string') ? captchaData : (captchaData?.image_bytes || captchaData?.captcha || null);
        } catch (e) { console.error('Captcha fetch error (password):', e.message); }

        return res.status(200).json({
          requiresCaptcha: true,
          captchaImage,
          captchaDigest: passResult.captcha.digest,
          digest: userResult.digest,
          identifier: userResult.identity,
          sessionCookies: userResult._session?.cookies,
          sessionCsrf: userResult._session?.csrfToken,
          message: passResult.message || 'Captcha required',
        });
      }

      throw new Error(passResult.message || 'Login failed. Check your credentials.');
    }



    const authCookie = passResult.cookies;
    sendStatus(sessionId, 'loggedin', 'Login successful!');

    const studentData = await syncStudentData(authCookie, sessionId);
    sendStatus(sessionId, 'done', 'All set!');

    res.json({
      token: authCookie,
      message: `Welcome ${studentData.name}! Logged in successfully.`,
      data_source: 'live',
      student_data: studentData
    });
  } catch (error) {
    console.error('Login error:', error.message);
    sendStatus(sessionId, 'error', `Error: ${error.message}`);
    res.status(401).json({ detail: `Login failed: ${error.message}` });
  }
});


// ── Sync ──────────────────────────────────────────────────────────────
router.post('/auth/sync', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Credentials needed for sync' });

  try {
    const userResult = await srmVerifyUser(username);
    if (!userResult.identity || !userResult.digest) {
      throw new Error(userResult.message || 'Username verification failed');
    }

    const passResult = await srmVerifyPassword(userResult.digest, userResult.identity, password, userResult._session);
    if (!passResult.isAuthenticated) {
      throw new Error(passResult.message || 'Password verification failed');
    }

    const authCookie = passResult.cookies;

    let userInfo = {};
    try {
      userInfo = await fetchRealUserInfo(authCookie);
    } catch (e) {
      console.error('Sync user info error:', e.message);
    }

    const attHtml = await fetchAcademicPage(authCookie,
      'https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance');
    const attResult = parseAttendance(attHtml);
    const marks = parseMarks(attHtml, attResult.attendance);

    const ttHtml = await fetchTimetablePage(authCookie);
    const ttResult = ttHtml
      ? parseCourses(ttHtml)
      : { courses: [], batch: '1', studentName: '', regNumber: '', program: '', department: '', section: '', semester: '', branch: '' };

    userInfo = {
      ...ttResult,
      ...userInfo,
      name: userInfo.name || ttResult.studentName || '',
      program: userInfo.program || ttResult.program || '',
      department: userInfo.department || ttResult.department || '',
      section: userInfo.section || ttResult.section || '',
      semester: userInfo.semester || ttResult.semester || '',
      branch: userInfo.branch || ttResult.branch || deriveAcademicBranch(userInfo.program || ttResult.program, userInfo.department || ttResult.department),
    };

    const currentDayOrder = await fetchCurrentDayOrder(authCookie);

    // Fetch calendar during sync too
    let calendar = [];
    try {
      const calUrls = getCalendarUrls();
      for (const calUrl of calUrls) {
        try {
          const rawCal = await fetchRawAcademicPage(authCookie, calUrl);
          if (rawCal) {
            const calParsed = parseSrmCalendar(rawCal);
            if (calParsed.calendar?.length > 0) {
              calendar = calParsed.calendar;
              break;
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    res.json({
      token: authCookie,
      student_data: {
        timetable: buildTimetable(ttResult.courses, ttResult.batch),
        attendance: attResult.attendance,
        marks,
        calendar,
        regNumber: attResult.regNumber || ttResult.regNumber,
        batch: ttResult.batch,
        name: userInfo.name || ttResult.studentName,
        branch: userInfo.branch || ttResult.branch,
        program: userInfo.program || '',
        department: userInfo.department || '',
        section: userInfo.section || '',
        semester: userInfo.semester || '',
        currentDayOrder,
      },
    });
  } catch (error) {
    console.error('Sync error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Logout ────────────────────────────────────────────────────────────
router.get('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const authCookie = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : (req.headers.token || null);
  if (!authCookie) return res.status(400).json({ error: 'Token is required' });

  try {
    await axios({
      method: 'GET',
      url: 'https://academia.srmist.edu.in/accounts/p/10002227248/logout?servicename=ZohoCreator&serviceurl=https://academia.srmist.edu.in',
      headers: { 'Accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded', 'cookie': authCookie },
    });
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.json({ message: 'Logged out successfully' });
  }
});

export default router;
