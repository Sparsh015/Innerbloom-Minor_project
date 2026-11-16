"""InnerBloom FastAPI backend — main application."""
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db import models  # noqa: F401  (register models)
from app.db.database import Base, SessionLocal, engine
from app.core import security
from app.routers import admin, ai, auth, calls, messages, notifications, reports, social, users, wellness

settings = get_settings()

app = FastAPI(
    title="InnerBloom API",
    description="Peer-support and mental-wellness platform backend.",
    version="1.0.0",
)

_cors_origins = settings.cors_origin_list or ["http://localhost:5173"]
_cors_origin_regex = settings.cors_origin_regex
_cors_origin_regex_compiled = re.compile(_cors_origin_regex) if _cors_origin_regex else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers_for_origin(origin: str | None) -> dict[str, str]:
    if not origin:
        return {}
    allowed = origin in _cors_origins or (
        _cors_origin_regex_compiled.fullmatch(origin) is not None
        if _cors_origin_regex_compiled
        else False
    )
    if not allowed:
        return {}
    # Echo the specific allowed origin (never "*") so credentials/JWT auth remain valid.
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, _exc):
    # Never leak stack traces or DB errors to clients. Include CORS headers so
    # browsers can surface the real 500 instead of masking it as a CORS failure.
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=_cors_headers_for_origin(request.headers.get("origin")),
    )


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(wellness.router)
app.include_router(social.router)
app.include_router(messages.router)
app.include_router(notifications.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(ai.router)
app.include_router(calls.router)


@app.on_event("startup")
def on_startup() -> None:
    # Startup DB work runs sequentially and all sessions/connections are closed
    # before serving traffic to avoid exhausting Supabase session-mode limits.
    Base.metadata.create_all(bind=engine)
    _ensure_report_columns()
    _ensure_admin()
    _ensure_seed_communities()


@app.on_event("shutdown")
def on_shutdown() -> None:
    # Release pooled connections cleanly on process shutdown/restart.
    engine.dispose()


# Columns added to the original severity_reports table after its first release.
# create_all() never alters existing tables, so add them in place for both
# SQLite (local dev) and PostgreSQL (Supabase) while keeping existing rows.
_REPORT_COLUMNS = {
    "request_type": "VARCHAR(20) NOT NULL DEFAULT 'support'",
    "title": "VARCHAR(200) NOT NULL DEFAULT ''",
    "category": "VARCHAR(60) NOT NULL DEFAULT 'general'",
    "preferred_date": "VARCHAR(10) NOT NULL DEFAULT ''",
    "preferred_time": "VARCHAR(5) NOT NULL DEFAULT ''",
    "duration_minutes": "INTEGER",
    "location_pref": "VARCHAR(120) NOT NULL DEFAULT ''",
    "notes": "TEXT NOT NULL DEFAULT ''",
    "admin_response": "TEXT NOT NULL DEFAULT ''",
    "updated_at": "TIMESTAMP WITH TIME ZONE" if "postgres" in engine.dialect.name else "DATETIME",
}


def _ensure_report_columns() -> None:
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "severity_reports" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("severity_reports")}
    missing = [(name, ddl) for name, ddl in _REPORT_COLUMNS.items() if name not in existing]
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing:
            conn.execute(text(f"ALTER TABLE severity_reports ADD COLUMN {name} {ddl}"))


def _ensure_admin() -> None:
    db = SessionLocal()
    try:
        if db.query(models.User).filter_by(email=settings.ADMIN_EMAIL.lower()).first():
            db.rollback()
            return
        admin = models.User(
            name=settings.ADMIN_NAME, email=settings.ADMIN_EMAIL.lower(),
            password_hash=security.hash_password(settings.ADMIN_PASSWORD), role="admin",
        )
        db.add(admin)
        db.flush()
        db.add(models.UserProfile(user_id=admin.id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _ensure_seed_communities() -> None:
    defaults = [
        ("Anxiety Support Circle", "A safe space to share experiences with anxiety.", "health"),
        ("Mindful Living", "Meditation, breathing and daily mindfulness practices.", "wellness"),
        ("Stress & Burnout", "Coping strategies for work, study and life stress.", "health"),
        ("Loneliness & Connection", "Find connection and understanding peers.", "support"),
        ("Self-Care Daily", "Small daily habits for a healthier mind.", "wellness"),
    ]
    db = SessionLocal()
    try:
        if db.query(models.Community).first():
            db.rollback()
            return
        for name, desc, cat in defaults:
            db.add(models.Community(name=name, description=desc, category=cat))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/health", tags=["meta"], summary="Health check")
def health():
    return {"status": "ok"}


@app.get("/", tags=["meta"], summary="API root")
def root():
    return {"message": "InnerBloom API — see /docs for documentation"}
