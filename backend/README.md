# InnerBloom — Peer-Support & Mental-Wellness Platform

Full-stack app: **React + TypeScript + Vite** frontend and **Python + FastAPI**
backend with **PostgreSQL (Supabase)** as the database.

> Auth architecture (single source of truth): **FastAPI-managed JWT**.
> The frontend previously used simulated local state for login/signup; it now
> calls the FastAPI backend (`src/lib/api.ts`) and stores the JWT in
> `localStorage` (`innerbloom_token`). There is no Supabase Auth client in the
> frontend — Supabase is used as **hosted PostgreSQL only**.

## Tech stack

| Layer    | Technology                                                              |
| -------- | ----------------------------------------------------------------------- |
| Backend  | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Uvicorn                |
| Database | PostgreSQL via Supabase (`DATABASE_URL`); SQLite file for local dev     |
| Auth     | JWT (python-jose) + bcrypt hashing (passlib)                            |
| Realtime | Native FastAPI WebSocket (`/ws/chat`), no Socket.IO                     |
| Frontend | React 19, TypeScript, Vite, Tailwind, shadcn-ui                         |
| Tests    | pytest + FastAPI TestClient (15 tests, all passing)                     |

## Folder structure

```
backend/
  app/
    main.py            # app factory, CORS, startup seed (admin + communities)
    core/              # config.py, security.py (JWT/bcrypt), dependencies.py
    db/                # database.py (engine/session), models.py (12 tables)
    schemas.py         # Pydantic request/response models
    routers/           # auth, users, wellness, social, messages, notifications,
                       # reports, admin, ai
    services/          # matching_service.py, notification_service.py, ai_service.py
    websocket/         # manager.py (native WebSocket connections)
  tests/test_api.py    # 15 end-to-end API tests
  migrations/001_initial_schema.sql   # run in Supabase SQL editor
  requirements.txt  .env.example  .gitignore
src/lib/api.ts         # minimal frontend API layer (JWT in localStorage)
```

## Requirements

- Python 3.12+ (Windows: `winget install -e --id Python.Python.3.12`)
- Node.js 20+ for the frontend
- A Supabase project (for hosted PostgreSQL) — optional for local dev

## Backend setup & run

```bat
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
REM edit .env: set DATABASE_URL (Supabase postgres) + JWT_SECRET_KEY
py -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs (Swagger) · /redoc · /health

## Environment variables (backend `.env`)

| Variable               | Example                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres` (local default: `sqlite:///./innerbloom.db`) |
| `JWT_SECRET_KEY`       | long random string                                             |
| `JWT_ALGORITHM`        | `HS256`                                                        |
| `JWT_EXPIRATION_MINUTES` | `10080`                                                      |
| `CORS_ORIGINS`         | `http://localhost:5173,http://localhost:8080`                  |
| `ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME` | bootstrap admin (created on startup)              |

Frontend: `VITE_API_BASE_URL=http://localhost:8000` (see root `.env.example`).

## Supabase PostgreSQL setup

1. Create a project at supabase.com → Project Settings → Database → copy the
   **connection string** (port 5432).
2. Open the **SQL editor** and run `backend/migrations/001_initial_schema.sql`
   (creates all 12 tables, FKs, unique constraints, indexes).
3. Set `DATABASE_URL` in `backend/.env` to the Supabase string and start the API.
   (Tables are also auto-created by SQLAlchemy on startup; the SQL file is the
   canonical schema for Supabase deployment.)

## Database tables

`users`, `user_profiles` (1:1), `mood_records`, `activities`, `journal_entries`,
`communities`, `community_members`, `posts`, `peer_connections`, `messages`,
`notifications`, `severity_reports`, `wellness_resources`.

## Running tests

```bat
cd backend
py -m pytest backend/tests -q
REM 15 passed — auth, profile, mood, activities, journal privacy, dashboard,
REM matching, communities, messaging, notifications, reports, admin, websocket, AI stub
```

## Authentication flow

Register (`POST /api/auth/register`) or login (`POST /api/auth/login`) with
email + password (min 8 chars, letters + digits) → receive
`{access_token, user}` → frontend stores JWT in `localStorage` →
every protected call sends `Authorization: Bearer <token>` → backend resolves
the user from the token. **Sender/owner IDs always come from the JWT, never
from request bodies.** Roles: `user`, `admin` (enforced server-side).

Email verification: the backend validates email **format** (Pydantic EmailStr)
and rejects duplicates (409). There is **no SMTP mailbox verification** —
accounts become active immediately. Configure an email service later if
mailbox proof is required; this is intentionally not faked.

## WebSocket usage

Endpoint: `ws://localhost:8000/ws/chat?token=<JWT>`

- Connect with a valid JWT (else closed with code 4401).
- Send JSON: `{"recipient_id": "<uuid>", "content": "..."}` → server validates,
  persists to PostgreSQL, forwards `{"type":"message",...}` to the recipient if
  online, creates a notification, replies `{"type":"sent","delivered":bool}`.
- Frontend helper: `chatWebSocketUrl()` in `src/lib/api.ts`.

## Frontend integration

Only additive/minimal changes: new `src/lib/api.ts`; login/signup modals call
`loginUser`/`registerUser` (with offline fallback so the demo UI never breaks);
root `.env.example` documents `VITE_API_BASE_URL`. Run with:

```bat
npm install --legacy-peer-deps
npm run build     # verified: builds cleanly
npm run dev       # then open the Vite URL
```

## API endpoint table

| Method | Endpoint                              | Auth  | Description                    |
| ------ | ------------------------------------- | ----- | ------------------------------ |
| POST   | /api/auth/register                    | no    | Register (201, duplicate → 409) |
| POST   | /api/auth/login                       | no    | Login (bad creds → 401)        |
| GET/PUT| /api/users/me                         | user  | Own profile                    |
| POST   | /api/mood                             | user  | Record mood + energy 1–10      |
| GET    | /api/mood/history                     | user  | Own mood history               |
| POST/GET | /api/activities                     | user  | Log/list wellness activities   |
| POST/GET | /api/journal (+/{id}, DELETE)       | user  | Private journal (owner only)   |
| GET    | /api/dashboard                        | user  | Trends, stats, unread count    |
| POST   | /api/matching/find                    | user  | Deterministic peer matches     |
| POST   | /api/matching/connect/{peer_id}       | user  | Connect with a peer            |
| GET/POST | /api/communities                    | user  | List/create communities        |
| POST   | /api/communities/{id}/join            | user  | Join (posting requires it)     |
| GET/POST | /api/communities/{id}/posts         | user  | List/create posts (403 if not member) |
| POST   | /api/messages                         | user  | Send private message           |
| GET    | /api/messages/{user_id}               | user  | Conversation with a user       |
| GET    | /api/conversations                    | user  | Chat list: real peers + unread |
| WS     | /ws/chat?token=JWT                    | JWT   | Realtime chat                  |
| GET/PUT| /api/notifications[//{id}/read]       | user  | Own notifications              |
| POST/GET | /api/reports/severity + /mine       | user  | Submit/view own concern reports|
| GET/PUT| /api/admin/reports[/{id}]             | admin | Review/update reports          |
| POST/PUT/DELETE | /api/admin/communities...   | admin | Manage communities             |
| GET    | /api/admin/users                      | admin | List users (no wellness data)  |
| POST   | /api/ai/wellness                      | user  | Groq wellness chat (persisted) |
| GET    | /api/ai/wellness/history              | user  | Own AI chat history            |
| DELETE | /api/ai/wellness/history              | user  | Clear own AI chat history      |

## Troubleshooting

- `401 Invalid or expired token` → log in again; token expiry is
  `JWT_EXPIRATION_MINUTES`.
- `403 Join the community before posting` → call the join endpoint first.
- `409 Email already registered` → use login instead.
- `.local` emails are rejected by the email validator — use real-style domains.
- On Windows Git Bash, use `py` (py launcher) instead of `python`.
- `npm install` needs `--legacy-peer-deps` (peer conflict in template deps).

## AI wellness chatbot

`POST /api/ai/wellness` calls the Groq Chat Completions API through
`backend/app/services/ai_service.py`. Set `GROQ_API_KEY` (and optionally
`GROQ_MODEL`) in `backend/.env`. Conversations are persisted per user in
`wellness_chat_messages`; history is available at
`GET /api/ai/wellness/history` and can be cleared with `DELETE`.

Safety: self-harm/crisis phrases trigger a deterministic response with India
helplines (Tele-MANAS 14416, KIRAN 1800-599-0019) and emergency 112, without
calling the LLM. The assistant is supportive only — never diagnostic.

RAG over `wellness_resources` is still **not implemented**. To add it later,
implement retrieval inside `ai_service.py`. Do not add journal/mood-note
content to prompts without explicit user consent.
