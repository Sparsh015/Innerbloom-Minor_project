"""InnerBloom FastAPI backend — main application."""
from fastapi import FastAPI
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, _exc):
    # Never leak stack traces or DB errors to clients.
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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
    Base.metadata.create_all(bind=engine)
    _ensure_admin()
    _ensure_seed_communities()


def _ensure_admin() -> None:
    db = SessionLocal()
    try:
        if db.query(models.User).filter_by(email=settings.ADMIN_EMAIL.lower()).first():
            return
        admin = models.User(
            name=settings.ADMIN_NAME, email=settings.ADMIN_EMAIL.lower(),
            password_hash=security.hash_password(settings.ADMIN_PASSWORD), role="admin",
        )
        db.add(admin)
        db.flush()
        db.add(models.UserProfile(user_id=admin.id))
        db.commit()
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
            return
        for name, desc, cat in defaults:
            db.add(models.Community(name=name, description=desc, category=cat))
        db.commit()
    finally:
        db.close()


@app.get("/health", tags=["meta"], summary="Health check")
def health():
    return {"status": "ok"}


@app.get("/", tags=["meta"], summary="API root")
def root():
    return {"message": "InnerBloom API — see /docs for documentation"}
