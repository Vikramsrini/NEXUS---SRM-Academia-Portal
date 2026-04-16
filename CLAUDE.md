# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Academia Portal is a full-stack application for SRM University students to view their academic data (attendance, marks, timetable, CGPA calculator) scraped from the SRM Academia portal. It consists of a React frontend and Express.js backend with Supabase for persistence.

## Architecture

**Frontend (React + Vite)**
- Entry: `src/main.jsx` with `ThemeProvider` context
- Routing: `src/App.jsx` uses React Router with protected routes (`ProtectedRoute` checks `localStorage.getItem('academia_token')`)
- Layout: Dashboard component with nested sub-pages (attendance, marks, timetable, etc.)
- API client: `src/lib/api.js` exports functions like `fetchAcademics()`, `fetchTimetable()`
- All API calls use `Authorization: Bearer ${localStorage.getItem('academia_token')}` header

**Backend (Express.js, ES modules)**
- Entry: `server/index.js` mounts all routes under `/api`
- Routes in `server/routes/`: auth, academics, calendar, userinfo, thought, cgpa, od, timetable-state, recent-updates, wordle, push
- Scrapers in `server/scrapers/`: Cheerio-based scrapers for SRM portal (auth, attendance, marks, timetable, calendar, cgpa)
- Services in `server/services/`: notificationService.js (push + cron), syncService.js, snapshots.js
- Lib in `server/lib/`: supabase.js (client), srmSession.js (session management)

**Database (Supabase PostgreSQL)**
- Schema: `server/supabase/schema.sql`
- Key tables: od_user_state, cgpa_user_state, timetable_user_state, attendance_snapshots, marks_snapshots, push_subscriptions, daily_thoughts, global_calendar
- Connection via `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars

**PWA Features**
- Service Worker: `public/sw.js` handles caching and push notifications
- Manifest: `public/manifest.json`
- Push notifications use web-push library with VAPID keys

## Common Commands

**Frontend Development:**
```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

**Backend Development:**
```bash
cd server
npm install          # Install backend dependencies
npm run dev          # Start with --watch for auto-restart
npm run start        # Start without watch
```

**Full Stack (concurrent):**
```bash
npm run dev          # Frontend (port 5173 default)
npm run server       # Backend (port 3000 default)
```

## Environment Variables

**Frontend (`VITE_API_BASE` in `.env` or build args):**
```
VITE_API_BASE=http://localhost:3000/api
```

**Backend (`server/.env` from `.env.example`):**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MISTRAL_API_KEY=                    # For "Thought of the Day" generation
VAPID_PUBLIC_KEY=                   # For push notifications
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:your@email.com
PORT=3000
```

## Key Development Notes

**Authentication Flow:**
- Login at `/` → `authRoutes` handles SRM portal captcha-based login
- Token stored in `localStorage` as `academia_token`
- All protected API routes require `Authorization: Bearer <token>` header
- `server/middleware/authToken.js` validates tokens

**Scraping Architecture:**
- Scrapers use Cheerio to parse SRM Academia HTML responses
- Session management via `srmSession.js` stores CSRF tokens and cookies in Supabase
- `syncService.js` performs full data sync from SRM portal

**State Persistence:**
- OD dates, manual attendance adjustments: `od_user_state` table
- CGPA calculator state: `cgpa_user_state` table
- Timetable hidden classes: `timetable_user_state` table
- Push subscriptions: `push_subscriptions` table

**Adding a New Route:**
1. Create `server/routes/myfeature.js` exporting Express Router
2. Import and mount in `server/index.js`: `app.use('/api', myRoutes)`
3. Add corresponding API client function in `src/lib/api.js`
4. Create page component in `src/pages/MyFeaturePage.jsx`
5. Add route in `src/App.jsx` under Dashboard layout

**Node Version:**
- Requires Node.js ^20.0.0 (specified in both package.json engines)

## Deployment

- **Frontend**: Configured for Vercel (`vercel.json` with API rewrites)
- **Backend**: Configured for Railway (`railway.json` with Nixpacks builder)
- **Database**: Supabase (run `server/supabase/schema.sql` to initialize)
