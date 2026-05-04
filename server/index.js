// ═══════════════════════════════════════════════════════════════════════
// Academia Portal — Backend Entry Point
// ═══════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import academicsRoutes from './routes/academics.js';
import calendarRoutes from './routes/calendar.js';
import userinfoRoutes from './routes/userinfo.js';
import thoughtRoutes from './routes/thought.js';
import cgpaRoutes from './routes/cgpa.js';
import odRoutes from './routes/od.js';
import timetableStateRoutes from './routes/timetable-state.js';
import wordleRoutes from './routes/wordle.js';
import pushRoutes from './routes/push.js';
import cronRoutes from './routes/cron.js';
import { initNotificationCrons } from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from various possible locations
dotenv.config({ path: path.resolve(__dirname, '.env'), silent: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), silent: true });
dotenv.config({ silent: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://nexus-srm-academia-portal.vercel.app',
  'https://nexus-srm-academia-portal-pi.vercel.app',
  'https://nexus-vikramsrinis-projects.vercel.app',
  'https://nexus-git-main-vikramsrinis-projects.vercel.app',
  ...configuredOrigins,
]);

function isAllowedVercelOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:') return false;

    return (
      hostname === 'nexus-srm-academia-portal.vercel.app' ||
      hostname === 'nexus-srm-academia-portal-pi.vercel.app' ||
      hostname === 'nexus-vikramsrinis-projects.vercel.app' ||
      /^nexus-srm-academia-portal(?:-[a-z0-9-]+)?\.vercel\.app$/.test(hostname) ||
      /^nexus-[a-z0-9-]+-vikramsrinis-projects\.vercel\.app$/.test(hostname)
    );
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || isAllowedVercelOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', academicsRoutes);
app.use('/api', calendarRoutes);
app.use('/api', userinfoRoutes);
app.use('/api', thoughtRoutes);
app.use('/api', cgpaRoutes);
app.use('/api', odRoutes);
app.use('/api', timetableStateRoutes);
app.use('/api', pushRoutes);
app.use('/api/wordle', wordleRoutes);
app.use('/api/cron', cronRoutes);


// ── Health Check ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('<h1>Academia API is Running</h1><p>Frontend should be deployed separately.</p>');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error Handling ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.stack);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'An unexpected backend error occurred'
  });
});

// ── Start Server ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' && import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`✨ Academia Backend running on http://localhost:${PORT}`);
    initNotificationCrons();
  });
}

export default app;
