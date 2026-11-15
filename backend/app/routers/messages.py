"""Private messaging REST + native WebSocket. Sender always comes from the JWT."""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import require_user
from app.core.security import decode_token
from app.db import models
from app.db.database import SessionLocal, get_db
from app.services.notification_service import create_notification
from app.websocket.manager import manager

router = APIRouter(tags=["messages"])


def _msg_out(m: models.Message) -> schemas.MessageOut:
    return schemas.MessageOut(id=m.id, sender_id=m.sender_id, recipient_id=m.recipient_id,
                              content=m.content, is_read=m.is_read, created_at=m.created_at)


def _authorized(db: Session, me: str, other: str) -> bool:
    """A conversation is authorized if both users exist (open peer-support model)."""
    return db.query(models.User).filter_by(id=other).first() is not None and me != other


@router.post("/api/messages", response_model=schemas.MessageOut,
             status_code=status.HTTP_201_CREATED, summary="Send a private message")
async def send_message(payload: schemas.MessageCreate,
                       current: models.User = Depends(require_user),
                       db: Session = Depends(get_db)):
    if payload.recipient_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="You cannot message yourself")
    if not _authorized(db, current.id, payload.recipient_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Recipient not found")
    msg = models.Message(sender_id=current.id, recipient_id=payload.recipient_id,
                         content=payload.content.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    create_notification(db, payload.recipient_id, "message", "New message",
                        f"{current.name} sent you a message.")
    await manager.send_to(payload.recipient_id, {
        "type": "message", "id": msg.id, "sender_id": current.id,
        "sender_name": current.name, "content": msg.content,
        "created_at": msg.created_at.isoformat(),
    })
    return _msg_out(msg)


@router.get("/api/conversations", response_model=list[schemas.ConversationOut],
            summary="My conversations (real peers, last message, unread count)")
def list_conversations(current: models.User = Depends(require_user),
                       db: Session = Depends(get_db)):
    rows = (db.query(models.Message)
            .filter((models.Message.sender_id == current.id) |
                    (models.Message.recipient_id == current.id))
            .order_by(models.Message.created_at.desc()).limit(500).all())
    by_peer: dict[str, dict] = {}
    for m in rows:
        peer_id = m.recipient_id if m.sender_id == current.id else m.sender_id
        entry = by_peer.setdefault(peer_id, {"message": None, "unread": 0})
        if entry["message"] is None:
            entry["message"] = m
        if m.recipient_id == current.id and not m.is_read:
            entry["unread"] += 1
    out: list[schemas.ConversationOut] = []
    for peer_id, entry in by_peer.items():
        peer = db.query(models.User).filter_by(id=peer_id).first()
        if peer is None:
            continue
        m = entry["message"]
        out.append(schemas.ConversationOut(
            user_id=peer.id, name=peer.name,
            last_message=m.content, last_at=m.created_at,
            unread_count=entry["unread"]))

    # Every connection is a chat, even before the first message, so peers do not
    # vanish from the Chats tab after connecting in Find Peers.
    connections = (db.query(models.PeerConnection)
                   .filter(((models.PeerConnection.requester_id == current.id) |
                            (models.PeerConnection.peer_id == current.id)) &
                           (models.PeerConnection.status == "connected"))
                   .all())
    connected: dict[str, models.PeerConnection] = {}
    for c in connections:
        peer_id = c.peer_id if c.requester_id == current.id else c.requester_id
        if peer_id not in connected or c.created_at > connected[peer_id].created_at:
            connected[peer_id] = c
    existing_ids = {c.user_id for c in out}
    for peer_id, conn in connected.items():
        if peer_id in existing_ids:
            continue
        peer = db.query(models.User).filter_by(id=peer_id).first()
        if peer is None:
            continue
        out.append(schemas.ConversationOut(
            user_id=peer.id, name=peer.name,
            last_message="", last_at=conn.created_at, unread_count=0))
    out.sort(key=lambda c: c.last_at, reverse=True)
    return out


@router.get("/api/messages/{user_id}", response_model=list[schemas.MessageOut],
            summary="My conversation with another user")
def get_conversation(user_id: str, current: models.User = Depends(require_user),
                     db: Session = Depends(get_db)):
    if user_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Use your own activity endpoints for self data")
    other = db.query(models.User).filter_by(id=user_id).first()
    if other is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    rows = (db.query(models.Message)
            .filter(((models.Message.sender_id == current.id) &
                     (models.Message.recipient_id == user_id)) |
                    ((models.Message.sender_id == user_id) &
                     (models.Message.recipient_id == current.id)))
            .order_by(models.Message.created_at.asc()).limit(200).all())
    for m in rows:
        if m.recipient_id == current.id and not m.is_read:
            m.is_read = True
    db.commit()
    return [_msg_out(m) for m in rows]


@router.websocket("/ws/chat")
async def chat_socket(websocket: WebSocket, token: str = ""):
    """WebSocket endpoint: /ws/chat?token=<JWT>. Authenticate -> receive/send live messages."""
    payload = decode_token(token) if token else None
    if payload is None or "sub" not in payload:
        await websocket.close(code=4401)
        return
    user_id: str = payload["sub"]
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
                recipient_id = str(data.get("recipient_id", ""))
                content = str(data.get("content", "")).strip()
                if not recipient_id or not content:
                    await websocket.send_json({"type": "error",
                                               "detail": "recipient_id and content are required"})
                    continue
                if recipient_id == user_id or not _authorized(db, user_id, recipient_id):
                    await websocket.send_json({"type": "error",
                                               "detail": "Unauthorized conversation"})
                    continue
                msg = models.Message(sender_id=user_id, recipient_id=recipient_id, content=content[:5000])
                db.add(msg)
                db.commit()
                db.refresh(msg)
                create_notification(db, recipient_id, "message", "New message",
                                    f"{user.name} sent you a message.")
                delivered = await manager.send_to(recipient_id, {
                    "type": "message", "id": msg.id, "sender_id": user_id,
                    "sender_name": user.name, "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                })
                await websocket.send_json({"type": "sent", "id": msg.id, "delivered": delivered})
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
