"""Mood, activities, journal and dashboard — all strictly scoped to the JWT user."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import require_user
from app.db import models
from app.db.database import get_db

router = APIRouter(tags=["wellness"])


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _now_time() -> str:
    return datetime.now().strftime("%H:%M")


# ---------- Mood ----------
@router.post("/api/mood", response_model=schemas.MoodOut, status_code=status.HTTP_201_CREATED,
             summary="Record a mood entry")
def create_mood(payload: schemas.MoodCreate, current: models.User = Depends(require_user),
                db: Session = Depends(get_db)):
    record = models.MoodRecord(
        user_id=current.id, mood=payload.mood.strip(), energy_level=payload.energy_level,
        note=payload.note, entry_date=payload.entry_date or _today(),
        entry_time=payload.entry_time or _now_time(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _mood_out(record)


def _mood_out(r: models.MoodRecord) -> schemas.MoodOut:
    return schemas.MoodOut(id=r.id, mood=r.mood, energy_level=r.energy_level, note=r.note,
                           entry_date=r.entry_date, entry_time=r.entry_time, created_at=r.created_at)


@router.get("/api/mood/history", response_model=list[schemas.MoodOut], summary="My mood history")
def mood_history(limit: int = Query(default=100, ge=1, le=500),
                 current: models.User = Depends(require_user),
                 db: Session = Depends(get_db)):
    rows = (db.query(models.MoodRecord).filter_by(user_id=current.id)
            .order_by(models.MoodRecord.created_at.desc()).limit(limit).all())
    return [_mood_out(r) for r in rows]


# ---------- Facial check-ins ----------
_FACIAL_MAPPING: dict[str, tuple[str, str, int]] = {
    "neutral": ("Neutral", "Neutral", 2),
    "happiness": ("Happy", "Happy", 1),
    "surprise": ("Surprised", "Surprised", 3),
    "sadness": ("Sad", "Sad", 4),
    "anger": ("Angry", "Angry", 5),
    "disgust": ("Disgusted", "Disgusted", 4),
    "fear": ("Fearful", "Anxious", 5),
    "contempt": ("Contemptuous", "Frustrated", 3),
}


def _facial_out(r: models.FacialCheckIn) -> schemas.FacialCheckInOut:
    return schemas.FacialCheckInOut(
        id=r.id, expression=r.expression, expression_label=r.expression_label,
        confidence=r.confidence, stress_level=r.stress_level, mood=r.mood,
        source=r.source, created_at=r.created_at,
    )


@router.post("/api/facial-check-ins", response_model=schemas.FacialCheckInOut,
             status_code=status.HTTP_201_CREATED,
             summary="Save a consented facial check-in")
def create_facial_check_in(payload: schemas.FacialCheckInCreate,
                           current: models.User = Depends(require_user),
                           db: Session = Depends(get_db)):
    expression_label, mood, stress_level = _FACIAL_MAPPING[payload.expression]
    record = models.FacialCheckIn(
        user_id=current.id, expression=payload.expression,
        expression_label=expression_label, confidence=payload.confidence,
        stress_level=stress_level, mood=mood, source=payload.source,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _facial_out(record)


@router.get("/api/facial-check-ins", response_model=list[schemas.FacialCheckInOut],
            summary="My facial check-in history")
def facial_check_in_history(limit: int = Query(default=100, ge=1, le=500),
                            current: models.User = Depends(require_user),
                            db: Session = Depends(get_db)):
    rows = (db.query(models.FacialCheckIn).filter_by(user_id=current.id)
            .order_by(models.FacialCheckIn.created_at.desc()).limit(limit).all())
    return [_facial_out(r) for r in rows]


@router.delete("/api/facial-check-ins", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete all of my facial check-ins")
def clear_facial_check_ins(current: models.User = Depends(require_user),
                           db: Session = Depends(get_db)):
    db.query(models.FacialCheckIn).filter_by(user_id=current.id).delete()
    db.commit()


def _auto_check_setting(current: models.User, db: Session) -> models.FacialAutoCheckSetting:
    setting = db.query(models.FacialAutoCheckSetting).filter_by(user_id=current.id).first()
    if setting is None:
        setting = models.FacialAutoCheckSetting(user_id=current.id, enabled=False)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


@router.get("/api/facial-check-ins/settings", response_model=schemas.FacialAutoCheckSettings,
            summary="My automatic facial check-in setting")
def get_auto_check_settings(current: models.User = Depends(require_user),
                            db: Session = Depends(get_db)):
    setting = _auto_check_setting(current, db)
    return schemas.FacialAutoCheckSettings(enabled=setting.enabled)


@router.put("/api/facial-check-ins/settings", response_model=schemas.FacialAutoCheckSettings,
            summary="Enable or disable automatic facial check-ins")
def update_auto_check_settings(payload: schemas.FacialAutoCheckSettings,
                               current: models.User = Depends(require_user),
                               db: Session = Depends(get_db)):
    setting = _auto_check_setting(current, db)
    setting.enabled = payload.enabled
    db.commit()
    db.refresh(setting)
    return schemas.FacialAutoCheckSettings(enabled=setting.enabled)


# ---------- Activities ----------
def _activity_out(a: models.Activity) -> schemas.ActivityOut:
    return schemas.ActivityOut(id=a.id, title=a.title, activity_type=a.activity_type,
                               description=a.description, activity_date=a.activity_date,
                               activity_time=a.activity_time,
                               duration_minutes=a.duration_minutes, created_at=a.created_at)


@router.post("/api/activities", response_model=schemas.ActivityOut,
             status_code=status.HTTP_201_CREATED, summary="Log a wellness activity")
def create_activity(payload: schemas.ActivityCreate,
                    current: models.User = Depends(require_user),
                    db: Session = Depends(get_db)):
    activity = models.Activity(
        user_id=current.id, title=payload.title.strip(),
        activity_type=payload.activity_type.strip(), description=payload.description,
        activity_date=payload.activity_date, activity_time=payload.activity_time,
        duration_minutes=payload.duration_minutes,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return _activity_out(activity)


@router.get("/api/activities", response_model=list[schemas.ActivityOut], summary="My activity history")
def list_activities(limit: int = Query(default=100, ge=1, le=500),
                    current: models.User = Depends(require_user),
                    db: Session = Depends(get_db)):
    rows = (db.query(models.Activity).filter_by(user_id=current.id)
            .order_by(models.Activity.created_at.desc()).limit(limit).all())
    return [_activity_out(a) for a in rows]


# ---------- Journal (private) ----------
def _journal_out(j: models.JournalEntry) -> schemas.JournalOut:
    return schemas.JournalOut(id=j.id, title=j.title, content=j.content,
                              created_at=j.created_at, updated_at=j.updated_at)


@router.post("/api/journal", response_model=schemas.JournalOut,
             status_code=status.HTTP_201_CREATED, summary="Create a private journal entry")
def create_journal(payload: schemas.JournalCreate,
                   current: models.User = Depends(require_user),
                   db: Session = Depends(get_db)):
    entry = models.JournalEntry(user_id=current.id, title=payload.title.strip(),
                                content=payload.content)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _journal_out(entry)


@router.get("/api/journal", response_model=list[schemas.JournalOut], summary="My journal entries")
def list_journal(limit: int = Query(default=100, ge=1, le=500),
                 current: models.User = Depends(require_user),
                 db: Session = Depends(get_db)):
    rows = (db.query(models.JournalEntry).filter_by(user_id=current.id)
            .order_by(models.JournalEntry.created_at.desc()).limit(limit).all())
    return [_journal_out(j) for j in rows]


@router.get("/api/journal/{entry_id}", response_model=schemas.JournalOut, summary="Get one journal entry")
def get_journal(entry_id: str, current: models.User = Depends(require_user),
                db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).filter_by(id=entry_id, user_id=current.id).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")
    return _journal_out(entry)


@router.delete("/api/journal/{entry_id}", status_code=status.HTTP_200_OK, summary="Delete a journal entry")
def delete_journal(entry_id: str, current: models.User = Depends(require_user),
                   db: Session = Depends(get_db)):
    entry = db.query(models.JournalEntry).filter_by(id=entry_id, user_id=current.id).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")
    db.delete(entry)
    db.commit()
    return {"message": "Journal entry deleted"}


# ---------- Dashboard ----------
@router.get("/api/dashboard", response_model=schemas.DashboardResponse, summary="My wellness dashboard")
def dashboard(current: models.User = Depends(require_user), db: Session = Depends(get_db)):
    moods = (db.query(models.MoodRecord).filter_by(user_id=current.id)
             .order_by(models.MoodRecord.created_at.desc()).limit(30).all())
    activities = (db.query(models.Activity).filter_by(user_id=current.id)
                  .order_by(models.Activity.created_at.desc()).limit(10).all())
    total_journal = db.query(models.JournalEntry).filter_by(user_id=current.id).count()
    total_communities = db.query(models.CommunityMember).filter_by(user_id=current.id).count()
    unread = db.query(models.Notification).filter_by(user_id=current.id, is_read=False).count()
    energies = [m.energy_level for m in moods if m.energy_level is not None]
    avg_energy = round(sum(energies) / len(energies), 2) if energies else None
    return schemas.DashboardResponse(
        mood_trend=[_mood_out(m) for m in moods],
        recent_activities=[_activity_out(a) for a in activities],
        total_moods=db.query(models.MoodRecord).filter_by(user_id=current.id).count(),
        total_activities=db.query(models.Activity).filter_by(user_id=current.id).count(),
        total_journal_entries=total_journal,
        total_communities=total_communities,
        unread_notifications=unread,
        avg_energy=avg_energy,
    )
