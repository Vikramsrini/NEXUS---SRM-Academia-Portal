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
import recentUpdatesRoutes from './routes/recent-updates.js';
import wordleRoutes from './routes/wordle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from various possible locations
dotenv.config({ path: path.resolve(__dirname, '.env'), silent: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), silent: true });
dotenv.config({ silent: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────
app.use(cors());
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
app.use('/api', recentUpdatesRoutes);
app.use('/api/wordle', wordleRoutes);


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
  });
}

export default app;
