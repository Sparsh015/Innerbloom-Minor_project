"""
Admin-initiated video call signaling.

Architecture:
- REST: initiate, update status, list call history.
- WebSocket /ws/call?token=JWT: relay WebRTC signaling messages
  (offer, answer, ice-candidate) between caller and callee.
  The backend never touches audio/video content — it only forwards
  JSON signaling envelopes between the two authenticated participants.

Privacy guarantees:
- Only admins can initiate calls.
- Backend validates both participants on every signaling message.
- No audio, video, or recording is ever stored.
- Only call metadata (status, timestamps) is persisted.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import get_current_user, require_admin
from app.core.security import decode_token
from app.db import models
from app.db.database import SessionLocal, get_db
from app.services.notification_service import create_notification
from app.websocket.manager import manager

router = APIRouter(tags=["calls"])

RING_TIMEOUT_SECONDS = 30  # configurable default


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _call_out(call: models.VideoCall, db: Session) -> schemas.VideoCallOut:
    caller = db.query(models.User).filter_by(id=call.caller_id).first()
    callee = db.query(models.User).filter_by(id=call.callee_id).first()
    return schemas.VideoCallOut(
        id=call.id,
        caller_id=call.caller_id,
        caller_name=caller.name if caller else "",
        callee_id=call.callee_id,
        callee_name=callee.name if callee else "",
        status=call.status,
        started_at=call.started_at,
        answered_at=call.answered_at,
        ended_at=call.ended_at,
    )


# ── REST endpoints ────────────────────────────────────────────────────────

@router.post("/api/calls/initiate", response_model=schemas.VideoCallOut,
             status_code=status.HTTP_201_CREATED,
             summary="Admin initiates a video call to a member")
async def initiate_call(
    payload: schemas.VideoCallInitiate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Only admins can call. Creates a call record and pushes an incoming_call
    signal to the callee's live WebSocket (if online)."""
    if payload.callee_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot call yourself")

    callee = db.query(models.User).filter_by(id=payload.callee_id).first()
    if callee is None:
        raise HTTPException(status_code=404, detail="Member not found")

    # Prevent duplicate active calls to the same person
    active = (db.query(models.VideoCall)
              .filter(models.VideoCall.caller_id == admin.id,
                      models.VideoCall.callee_id == payload.callee_id,
                      models.VideoCall.status.in_(["initiated", "ringing"]))
              .first())
    if active:
        return _call_out(active, db)

    call = models.VideoCall(caller_id=admin.id, callee_id=payload.callee_id, status="ringing")
    db.add(call)
    db.commit()
    db.refresh(call)

    # Push real-time incoming call signal to callee if online
    delivered = await manager.send_to(payload.callee_id, {
        "type": "incoming_call",
        "call_id": call.id,
        "caller_id": admin.id,
        "caller_name": admin.name,
        "ring_timeout": RING_TIMEOUT_SECONDS,
    })

    if not delivered:
        # Callee is offline — immediately create a missed call notification
        call.status = "missed"
        call.ended_at = _utcnow()
        db.commit()
        create_notification(
            db,
            payload.callee_id,
            "call_missed",
            "Missed Video Call",
            f"You missed a video call from {admin.name}. "
            "Contact your community administrator if you need assistance.",
        )

    db.refresh(call)
    return _call_out(call, db)


@router.put("/api/calls/{call_id}/status", response_model=schemas.VideoCallOut,
            summary="Update call status (accept, decline, end, etc.)")
async def update_call_status(
    call_id: str,
    new_status: str = Query(..., pattern="^(accepted|declined|ended|missed|failed)$"),
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    call = db.query(models.VideoCall).filter_by(id=call_id).first()
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")

    # Only participants can update their own call
    if current.id not in (call.caller_id, call.callee_id):
        raise HTTPException(status_code=403, detail="Not a participant in this call")

    now = _utcnow()

    if new_status == "accepted":
        call.status = "accepted"
        call.answered_at = now
        # Notify caller that call was accepted
        await manager.send_to(call.caller_id, {
            "type": "call_accepted",
            "call_id": call_id,
            "callee_id": call.callee_id,
        })

    elif new_status == "declined":
        call.status = "declined"
        call.ended_at = now
        await manager.send_to(call.caller_id, {
            "type": "call_declined",
            "call_id": call_id,
        })

    elif new_status == "ended":
        call.status = "ended"
        call.ended_at = now
        # Notify the other participant
        other_id = call.callee_id if current.id == call.caller_id else call.caller_id
        await manager.send_to(other_id, {
            "type": "call_ended",
            "call_id": call_id,
        })

    elif new_status == "missed":
        call.status = "missed"
        call.ended_at = now
        caller = db.query(models.User).filter_by(id=call.caller_id).first()
        # Create persistent missed call notification
        existing = (db.query(models.Notification)
                    .filter_by(user_id=call.callee_id, kind="call_missed")
                    .filter(models.Notification.body.contains(call_id))
                    .first())
        if existing is None:
            create_notification(
                db,
                call.callee_id,
                "call_missed",
                "Missed Video Call",
                f"You missed a video call from {caller.name if caller else 'your administrator'}. "
                "Contact your community administrator if you need assistance.",
            )

    elif new_status == "failed":
        call.status = "failed"
        call.ended_at = now

    db.commit()
    db.refresh(call)
    return _call_out(call, db)


@router.get("/api/calls/history", response_model=list[schemas.VideoCallOut],
            summary="Call history for the current user")
def call_history(
    limit: int = Query(default=50, ge=1, le=200),
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (db.query(models.VideoCall)
            .filter(
                (models.VideoCall.caller_id == current.id) |
                (models.VideoCall.callee_id == current.id)
            )
            .order_by(models.VideoCall.started_at.desc())
            .limit(limit).all())
    return [_call_out(r, db) for r in rows]


@router.get("/api/admin/calls/history", response_model=list[schemas.VideoCallOut],
            summary="Admin call history (admin only)")
def admin_call_history(
    limit: int = Query(default=100, ge=1, le=500),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (db.query(models.VideoCall)
            .filter(models.VideoCall.caller_id == admin.id)
            .order_by(models.VideoCall.started_at.desc())
            .limit(limit).all())
    return [_call_out(r, db) for r in rows]


# ── WebRTC signaling WebSocket ────────────────────────────────────────────

@router.websocket("/ws/call")
async def call_signal_socket(websocket: WebSocket, token: str = ""):
    """
    WebRTC signaling relay: /ws/call?token=<JWT>

    Accepts JSON messages with the shape:
        { "type": "offer"|"answer"|"ice-candidate", "call_id": "...", "payload": {...} }

    The backend authenticates both participants, validates the call record,
    and forwards the signaling payload to the other participant.
    It never inspects or stores the WebRTC payload content.
    """
    payload_jwt = decode_token(token) if token else None
    if payload_jwt is None or "sub" not in payload_jwt:
        await websocket.close(code=4401)
        return

    user_id: str = payload_jwt["sub"]
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(id=user_id).first()
        if user is None:
            await websocket.close(code=4401)
            return

        await manager.connect(user_id, websocket)
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = str(data.get("type", ""))
                call_id = str(data.get("call_id", ""))

                if msg_type not in ("offer", "answer", "ice-candidate", "ping"):
                    await websocket.send_json({"type": "error", "detail": "Unknown message type"})
                    continue

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                # Validate call and participant
                call = db.query(models.VideoCall).filter_by(id=call_id).first()
                if call is None or user_id not in (call.caller_id, call.callee_id):
                    await websocket.send_json({"type": "error", "detail": "Unauthorized call"})
                    continue

                if call.status not in ("ringing", "accepted"):
                    await websocket.send_json({"type": "error", "detail": "Call is not active"})
                    continue

                # Determine the other participant
                other_id = call.callee_id if user_id == call.caller_id else call.caller_id

                # Forward the signaling message — never store WebRTC payload
                delivered = await manager.send_to(other_id, {
                    "type": msg_type,
                    "call_id": call_id,
                    "from_id": user_id,
                    "payload": data.get("payload"),
                })

                await websocket.send_json({
                    "type": "ack",
                    "call_id": call_id,
                    "msg_type": msg_type,
                    "delivered": delivered,
                })

        except WebSocketDisconnect:
            pass
        except Exception:
            try:
                await websocket.close()
            except Exception:
                pass
        finally:
            manager.disconnect(user_id, websocket)
    finally:
        db.close()
