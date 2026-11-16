# Deploying InnerBloom (Vercel + Render + Supabase)

This project has two deployable parts:
- **Frontend**: Vite React SPA in the repo root (`npm run build` → `dist/`)
- **Backend**: FastAPI app in `backend/` (REST + WebSocket `/ws/chat`)

## 1) Supabase (PostgreSQL)

1. Create a project at https://supabase.com.
2. In **Project Settings → Database**, copy the Postgres connection string (URI, port `5432`). Use the direct connection string for Render.
   - Format: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres` or `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`
3. Open **SQL Editor** and run `backend/migrations/001_initial_schema.sql` to create tables/indexes.
4. Keep the connection string for Render as `DATABASE_URL`.

> Supabase is used here as hosted PostgreSQL only (the app uses FastAPI JWT auth, not Supabase Auth).

## 2) Backend on Render

### Option A: Blueprint (recommended)
1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, connect the repo. Render will read `render.yaml`.
3. Set the prompted env vars (at minimum):
   - `DATABASE_URL` = Supabase Postgres URI
   - `CORS_ORIGINS` = your Vercel frontend URL, e.g. `https://your-app.vercel.app` (comma-separate if multiple)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (bootstrap admin)
   - `GROQ_API_KEY` if you want the AI wellness chatbot
4. Deploy. Health check: `https://<your-render-service>.onrender.com/health`

### Option B: Manual Web Service
- **Root Directory:** `backend`
- **Runtime:** Python
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Env vars:** same as above (`DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM=HS256`, `JWT_EXPIRATION_MINUTES=10080`, `CORS_ORIGINS`, admin vars, optional `GROQ_*`).

Notes:
- Use the Render service URL as your API base (HTTPS). WebSocket chat will be available at `wss://<service>.onrender.com/ws/chat?token=...` (the frontend derives this from `VITE_API_BASE_URL`).
- Render free instances may sleep on inactivity; first request/WebSocket connect can take ~30–60s to wake.
- Tables are auto-created on startup, but running `backend/migrations/001_initial_schema.sql` in Supabase is recommended as the canonical schema.

## 3) Frontend on Vercel

1. In Vercel: **Add New → Project**, import the same GitHub repo (root directory = repo root).
2. Vercel will use `vercel.json` in this repo:
   - Install: `npm install --legacy-peer-deps`
   - Build: `npm run build`
   - Output: `dist`
   - SPA rewrite to `index.html` for client-side routes
3. Set **Environment Variable**:
   - `VITE_API_BASE_URL` = `https://<your-render-service>.onrender.com` (no trailing slash)
4. Deploy.

If configuring manually in Vercel UI instead of `vercel.json`, use the same install/build/output values above.

## 4) Post-deploy checks

- Open the Vercel URL, register/login, and confirm API calls succeed (browser Network tab).
- Verify CORS: `CORS_ORIGINS` on Render must include the exact Vercel origin.
- Test realtime chat (WebSocket) between two users; ensure the backend URL is HTTPS so the app uses WSS.
- Optional: `GET https://<render>/health` and `https://<render>/docs`.

## Local development

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate  # or Windows equivalent
pip install -r requirements.txt
cp .env.example .env  # set DATABASE_URL, JWT_SECRET_KEY, CORS_ORIGINS, etc.
uvicorn app.main:app --reload --port 8000

# frontend (repo root)
npm install --legacy-peer-deps
cp .env.example .env  # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```
