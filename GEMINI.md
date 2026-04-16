# Academia Portal — Developer Guide

This document provides essential context and instructions for developers working on the Academia Portal project.

## Project Overview

**Academia Portal** is a full-stack student information system designed for SRM University students. It scrapes academic data (attendance, marks, timetable, etc.) from the official SRM portal and provides a modern, responsive dashboard with persistent user state.

### Key Technologies
- **Frontend:** React 19, Vite, React Router, Vanilla CSS.
- **Backend:** Node.js (Express.js), Cheerio (Scraping), Axios.
- **Database:** Supabase (PostgreSQL) for user state and data snapshots.
- **PWA:** Service Workers for caching and Web Push notifications.
- **AI Integration:** Mistral AI for "Thought of the Day" generation.

## Architecture

### 1. Frontend (`src/`)
- **Entry Point:** `src/main.jsx`
- **Routing:** `src/App.jsx` handles core navigation and protected routes.
- **State Management:** React Hooks and Context API (`ThemeContext.jsx`).
- **API Client:** `src/lib/api.js` encapsulates all backend interactions.
- **Styling:** Modular CSS files located alongside components.

### 2. Backend (`server/`)
- **Entry Point:** `server/index.js`
- **Routing:** Modular routes in `server/routes/` (auth, academics, cgpa, etc.).
- **Scrapers:** Cheerio-based parsers in `server/scrapers/` for extracting data from SRM portal HTML.
- **Services:**
  - `syncService.js`: Orchestrates data fetching and persistence.
  - `notificationService.js`: Manages cron jobs and push notifications.
- **Persistence:** Supabase client in `server/lib/supabase.js`.

### 3. Data Flow
1. **Auth:** User logs in with SRM credentials → Backend scrapes portal and generates a session token → Token stored in `localStorage`.
2. **Scraping:** Backend uses `Cheerio` to parse various portal pages (Attendance, Marks, etc.).
3. **Persistence:** User-specific settings (OD dates, CGPA inputs) are stored in Supabase.

## Development Workflow

### Core Commands
| Action | Root Directory | Server Directory |
| :--- | :--- | :--- |
| **Install** | `npm install` | `cd server && npm install` |
| **Dev (Frontend)** | `npm run dev` | - |
| **Dev (Backend)** | `npm run server` | `npm run dev` (with watch) |
| **Build** | `npm run build` | - |
| **Lint** | `npm run lint` | - |

### Environment Setup
Create a `.env` file in the `server/` directory based on `server/.env.example`:
```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
MISTRAL_API_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your@email.com
PORT=3000
```

Frontend Environment (`.env` in root):
```env
VITE_API_BASE=http://localhost:3000/api
```

## Engineering Standards

- **Scraping Integrity:** Scrapers are sensitive to SRM portal UI changes. Always validate parser strategies in `server/scrapers/` if data is missing.
- **Authentication:** All protected API routes require the `Authorization: Bearer <token>` header.
- **Persistence:** Never bypass the backend for database operations; use the provided Express routes to ensure data consistency.
- **Styling:** Follow the existing pattern of component-specific CSS files. Avoid adding utility-first CSS frameworks (like Tailwind) unless explicitly requested.
- **Testing:** Currently, the project lacks a formal JS testing suite. For new features, consider adding manual validation scripts or implementing `vitest`.

## Deployment
- **Frontend:** Vercel (configured via `vercel.json`).
- **Backend:** Railway (configured via `railway.json`).
- **Database:** Supabase (SQL schema in `server/supabase/schema.sql`).
