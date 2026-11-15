"""Peer matching, communities, posts and peer connections."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import get_current_user, require_user
from app.db import models
from app.db.database import get_db
from app.services import matching_service
from app.services.notification_service import create_notification

router = APIRouter(tags=["social"])


# ---------- Matching ----------
@router.post("/api/matching/find", response_model=list[schemas.MatchResult],
             summary="Find compatible peers (deterministic scoring)")
def find_matches(limit: int = Query(default=20, ge=1, le=50),
                 current: models.User = Depends(require_user),
                 db: Session = Depends(get_db)):
    return [schemas.MatchResult(**m) for m in matching_service.find_matches(db, current, limit)]


@router.post("/api/matching/connect/{peer_id}", status_code=status.HTTP_201_CREATED,
             summary="Connect with a peer")
def connect_peer(peer_id: str, current: models.User = Depends(require_user),
                 db: Session = Depends(get_db)):
    if peer_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="You cannot connect with yourself")
    peer = db.query(models.User).filter_by(id=peer_id).first()
    if peer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    exists = (db.query(models.PeerConnection)
              .filter(((models.PeerConnection.requester_id == current.id) &
                       (models.PeerConnection.peer_id == peer_id)) |
                      ((models.PeerConnection.requester_id == peer_id) &
                       (models.PeerConnection.peer_id == current.id))).first())
    if exists:
        return {"message": "Already connected"}
    db.add(models.PeerConnection(requester_id=current.id, peer_id=peer_id, status="connected"))
    db.commit()
    create_notification(db, peer_id, "peer", "New peer connection",
                        f"{current.name} connected with you.")
    return {"message": "Connected"}


# ---------- Communities ----------
def _community_out(db: Session, c: models.Community, user_id: str) -> schemas.CommunityOut:
    count = db.query(models.CommunityMember).filter_by(community_id=c.id).count()
    joined = db.query(models.CommunityMember).filter_by(community_id=c.id, user_id=user_id).first() is not None
    return schemas.CommunityOut(id=c.id, name=c.name, description=c.description,
                                category=c.category, member_count=count,
                                is_joined=joined, created_at=c.created_at)


@router.get("/api/communities", response_model=list[schemas.CommunityOut], summary="List communities")
def list_communities(current: models.User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    return [_community_out(db, c, current.id) for c in db.query(models.Community).all()]


@router.post("/api/communities", response_model=schemas.CommunityOut,
             status_code=status.HTTP_201_CREATED, summary="Create a community")
def create_community(payload: schemas.CommunityCreate,
                     current: models.User = Depends(require_user),
                     db: Session = Depends(get_db)):
    if db.query(models.Community).filter_by(name=payload.name.strip()).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Community name already exists")
    community = models.Community(name=payload.name.strip(), description=payload.description,
                                 category=payload.category.strip(), created_by=current.id)
    db.add(community)
    db.flush()
    db.add(models.CommunityMember(community_id=community.id, user_id=current.id))
    db.commit()
    db.refresh(community)
    return _community_out(db, community, current.id)


@router.post("/api/communities/{community_id}/join", summary="Join a community")
def join_community(community_id: str, current: models.User = Depends(require_user),
                   db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    if db.query(models.CommunityMember).filter_by(community_id=community_id,
                                                  user_id=current.id).first():
        return {"message": "Already a member"}
    db.add(models.CommunityMember(community_id=community_id, user_id=current.id))
    db.commit()
    return {"message": f"Joined {community.name}"}


def _is_member(db: Session, community_id: str, user_id: str) -> bool:
    return db.query(models.CommunityMember).filter_by(
        community_id=community_id, user_id=user_id).first() is not None


@router.get("/api/communities/{community_id}/posts", response_model=list[schemas.PostOut],
            summary="List community posts (members see posts)")
def list_posts(community_id: str, current: models.User = Depends(require_user),
               db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    posts = (db.query(models.Post).filter_by(community_id=community_id)
             .order_by(models.Post.created_at.desc()).limit(100).all())
    out: list[schemas.PostOut] = []
    for p in posts:
        author = db.query(models.User).filter_by(id=p.author_id).first()
        out.append(schemas.PostOut(id=p.id, community_id=p.community_id, author_id=p.author_id,
                                   author_name=author.name if author else "",
                                   content=p.content, created_at=p.created_at))
    return out


@router.post("/api/communities/{community_id}/posts", response_model=schemas.PostOut,
             status_code=status.HTTP_201_CREATED, summary="Post in a joined community")
def create_post(community_id: str, payload: schemas.PostCreate,
                current: models.User = Depends(require_user),
                db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    if not _is_member(db, community_id, current.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Join the community before posting")
    post = models.Post(community_id=community_id, author_id=current.id,
                       content=payload.content.strip())
    db.add(post)
    db.commit()
    db.refresh(post)
    return schemas.PostOut(id=post.id, community_id=post.community_id, author_id=post.author_id,
                           author_name=current.name, content=post.content,
                           created_at=post.created_at)
