# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Supabase Database Setup (OD/ML Persistence)

This project now supports persistent OD/ML data per user using Supabase.

1. Create a Supabase project.
2. Open SQL Editor and run [server/supabase/schema.sql](server/supabase/schema.sql).
3. In [server/.env](server/.env), add:

```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Install backend dependencies in the server folder:

```bash
cd server
npm install
```

5. Start backend and frontend as usual.

Notes:
- OD state endpoints are `GET /api/od-state?regNumber=...` and `PUT /api/od-state`.
- Frontend now auto-syncs OD date ranges and manual attendance adjustments through the backend.
