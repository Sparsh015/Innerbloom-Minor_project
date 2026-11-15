"""AI wellness assistant — authenticated, persisted, with crisis guardrails."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.config import get_settings
from app.core.dependencies import require_user
from app.db import models
from app.db.database import get_db
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])
settings = get_settings()


def _message_out(row: models.WellnessChatMessage) -> schemas.WellnessChatMessageOut:
    return schemas.WellnessChatMessageOut(
        id=row.id, role=row.role, content=row.content,
        crisis=row.crisis, created_at=row.created_at,
    )


def _persist(db: Session, user_id: str, role: str, content: str,
             crisis: bool = False) -> models.WellnessChatMessage:
    row = models.WellnessChatMessage(
        user_id=user_id, role=role, content=content, crisis=crisis,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    return row


@router.post("/wellness", response_model=schemas.WellnessChatResponse,
             summary="Talk to the AI wellness assistant")
async def wellness_chat(payload: schemas.WellnessChatRequest,
                        current: models.User = Depends(require_user),
                        db: Session = Depends(get_db)):
    text = payload.message.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message cannot be empty.",
        )

    if ai_service.detect_crisis(text):
        reply = ai_service.crisis_reply()
        _persist(db, current.id, "user", text, crisis=True)
        bot = _persist(db, current.id, "assistant", reply, crisis=True)
        db.commit()
        db.refresh(bot)
        return schemas.WellnessChatResponse(
            message=_message_out(bot), crisis=True,
            resources=ai_service.CRISIS_RESOURCES,
        )

    history_rows = (
        db.query(models.WellnessChatMessage)
        .filter_by(user_id=current.id)
        .order_by(models.WellnessChatMessage.created_at.desc())
        .limit(settings.AI_CONTEXT_MESSAGES)
        .all()
    )
    history = [{"role": row.role, "content": row.content}
               for row in reversed(history_rows)]

    try:
        reply = await ai_service.generate_reply(history, text)
    except ai_service.AIServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    _persist(db, current.id, "user", text)
    bot = _persist(db, current.id, "assistant", reply)
    db.commit()
    db.refresh(bot)
    return schemas.WellnessChatResponse(message=_message_out(bot), crisis=False)


@router.get("/wellness/history", response_model=list[schemas.WellnessChatMessageOut],
            summary="My AI conversation history")
def wellness_history(limit: int = Query(default=50, ge=1, le=200),
                     current: models.User = Depends(require_user),
                     db: Session = Depends(get_db)):
    rows = (
        db.query(models.WellnessChatMessage)
        .filter_by(user_id=current.id)
        .order_by(models.WellnessChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_message_out(row) for row in reversed(rows)]


@router.delete("/wellness/history", status_code=status.HTTP_204_NO_CONTENT,
               summary="Clear my AI conversation history")
def clear_wellness_history(current: models.User = Depends(require_user),
                           db: Session = Depends(get_db)):
    db.query(models.WellnessChatMessage).filter_by(user_id=current.id).delete()
    db.commit()
