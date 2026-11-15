"""Notifications: users only ever see their own."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import require_user
from app.db import models
from app.db.database import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _out(n: models.Notification) -> schemas.NotificationOut:
    return schemas.NotificationOut(id=n.id, kind=n.kind, title=n.title, body=n.body,
                                   is_read=n.is_read, created_at=n.created_at)


@router.get("", response_model=list[schemas.NotificationOut], summary="My notifications")
def list_mine(current: models.User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (db.query(models.Notification).filter_by(user_id=current.id)
            .order_by(models.Notification.created_at.desc()).limit(100).all())
    return [_out(n) for n in rows]


@router.put("/{note_id}/read", response_model=schemas.NotificationOut,
            summary="Mark a notification as read")
def mark_read(note_id: str, current: models.User = Depends(require_user),
              db: Session = Depends(get_db)):
    note = db.query(models.Notification).filter_by(id=note_id, user_id=current.id).first()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    note.is_read = True
    db.commit()
    db.refresh(note)
    return _out(note)
