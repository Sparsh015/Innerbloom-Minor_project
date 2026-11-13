"""Admin-only endpoints. Every route requires role == admin."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import require_admin
from app.db import models
from app.db.database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _days_ago(n: int) -> datetime:
    return _utcnow() - timedelta(days=n)


# ── existing endpoints ────────────────────────────────────────────────────────

@router.get("/reports", response_model=list[schemas.SeverityReportOut],
            summary="Review all concern reports (admin)")
def all_reports(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.SeverityReport).order_by(
        models.SeverityReport.created_at.desc()).limit(200).all()
    return [schemas.SeverityReportOut(id=r.id, concern_level=r.concern_level,
                                      description=r.description, status=r.status,
                                      created_at=r.created_at) for r in rows]


@router.put("/reports/{report_id}", response_model=schemas.SeverityReportOut,
            summary="Update a report status (admin)")
def update_report(report_id: str, new_status: str,
                  admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if new_status not in ("open", "reviewed", "resolved"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    report = db.query(models.SeverityReport).filter_by(id=report_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    report.status = new_status
    db.commit()
    db.refresh(report)
    return schemas.SeverityReportOut(id=report.id, concern_level=report.concern_level,
                                     description=report.description, status=report.status,
                                     created_at=report.created_at)


@router.post("/communities", status_code=status.HTTP_201_CREATED,
             summary="Create a community (admin)")
def admin_create_community(payload: schemas.CommunityCreate,
                           admin: models.User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    if db.query(models.Community).filter_by(name=payload.name.strip()).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Community name already exists")
    community = models.Community(name=payload.name.strip(), description=payload.description,
                                 category=payload.category.strip(), created_by=admin.id)
    db.add(community)
    db.commit()
    db.refresh(community)
    return {"id": community.id, "name": community.name}


@router.put("/communities/{community_id}", summary="Update a community (admin)")
def admin_update_community(community_id: str, payload: schemas.CommunityCreate,
                           admin: models.User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    community.name = payload.name.strip()
    community.description = payload.description
    community.category = payload.category.strip()
    db.commit()
    return {"message": "Community updated"}


@router.delete("/communities/{community_id}", summary="Delete a community (admin)")
def admin_delete_community(community_id: str, admin: models.User = Depends(require_admin),
                           db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    db.delete(community)
    db.commit()
    return {"message": "Community deleted"}


@router.get("/users", response_model=list[schemas.AdminUserOut],
            summary="List users (admin, no private wellness data)")
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return [schemas.AdminUserOut(id=u.id, name=u.name, email=u.email, role=u.role,
                                 age=u.age, created_at=u.created_at)
            for u in db.query(models.User).limit(200).all()]


# ── new endpoints ─────────────────────────────────────────────────────────────

@router.get("/stats", response_model=schemas.AdminStatsOut,
            summary="Overview statistics (admin)")
def admin_stats(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(models.User).count()

    # Active = users with at least one mood record, activity, or post
    mood_users = {r[0] for r in db.query(models.MoodRecord.user_id).distinct()}
    activity_users = {r[0] for r in db.query(models.Activity.user_id).distinct()}
    post_users = {r[0] for r in db.query(models.Post.author_id).distinct()}
    active_users = len(mood_users | activity_users | post_users)

    total_communities = db.query(models.Community).count()
    total_posts = db.query(models.Post).count()
    total_interactions = (db.query(models.PeerConnection).count() +
                          db.query(models.Message).count())
    pending_reports = db.query(models.SeverityReport).filter_by(status="open").count()

    return schemas.AdminStatsOut(
        total_users=total_users,
        active_users=active_users,
        total_communities=total_communities,
        total_posts=total_posts,
        total_interactions=total_interactions,
        pending_reports=pending_reports,
    )


@router.get("/communities/{community_id}/members",
            response_model=list[schemas.AdminCommunityMemberOut],
            summary="List members of a community (admin)")
def community_members(community_id: str, admin: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    memberships = (db.query(models.CommunityMember)
                   .filter_by(community_id=community_id)
                   .order_by(models.CommunityMember.joined_at.desc()).all())
    out = []
    for m in memberships:
        user = db.query(models.User).filter_by(id=m.user_id).first()
        if user:
            out.append(schemas.AdminCommunityMemberOut(
                user_id=user.id, name=user.name, email=user.email,
                joined_at=m.joined_at))
    return out


@router.get("/communities/{community_id}/posts",
            response_model=list[schemas.AdminPostOut],
            summary="List posts in a community (admin)")
def community_posts_admin(community_id: str, limit: int = Query(default=100, ge=1, le=500),
                          admin: models.User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    community = db.query(models.Community).filter_by(id=community_id).first()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    posts = (db.query(models.Post).filter_by(community_id=community_id)
             .order_by(models.Post.created_at.desc()).limit(limit).all())
    out = []
    for p in posts:
        author = db.query(models.User).filter_by(id=p.author_id).first()
        out.append(schemas.AdminPostOut(
            id=p.id, community_id=p.community_id, community_name=community.name,
            author_id=p.author_id, author_name=author.name if author else "",
            content=p.content, created_at=p.created_at))
    return out


@router.delete("/communities/{community_id}/posts/{post_id}",
               summary="Delete a post (admin moderation)")
def admin_delete_post(community_id: str, post_id: str,
                      admin: models.User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    post = db.query(models.Post).filter_by(id=post_id, community_id=community_id).first()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    db.delete(post)
    db.commit()
    return {"message": "Post deleted"}


@router.get("/members/{user_id}", response_model=schemas.AdminMemberProfileOut,
            summary="Detailed member profile (admin, no private journals/messages)")
def member_profile(user_id: str, admin: models.User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(id=user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    profile = db.query(models.UserProfile).filter_by(user_id=user_id).first()
    memberships = db.query(models.CommunityMember).filter_by(user_id=user_id).all()
    community_names = []
    for mem in memberships:
        c = db.query(models.Community).filter_by(id=mem.community_id).first()
        if c:
            community_names.append(c.name)

    total_posts = db.query(models.Post).filter_by(author_id=user_id).count()
    total_moods = db.query(models.MoodRecord).filter_by(user_id=user_id).count()
    total_activities = db.query(models.Activity).filter_by(user_id=user_id).count()

    # Recent moods (consented self-reported data only)
    recent_moods_raw = (db.query(models.MoodRecord).filter_by(user_id=user_id)
                        .order_by(models.MoodRecord.created_at.desc()).limit(14).all())
    recent_moods = [schemas.MoodOut(
        id=m.id, mood=m.mood, energy_level=m.energy_level, note=m.note,
        entry_date=m.entry_date, entry_time=m.entry_time, created_at=m.created_at)
        for m in recent_moods_raw]

    # Recent public posts only
    recent_posts_raw = (db.query(models.Post).filter_by(author_id=user_id)
                        .order_by(models.Post.created_at.desc()).limit(10).all())
    recent_posts = []
    for p in recent_posts_raw:
        c = db.query(models.Community).filter_by(id=p.community_id).first()
        recent_posts.append(schemas.AdminPostOut(
            id=p.id, community_id=p.community_id,
            community_name=c.name if c else "",
            author_id=p.author_id, author_name=user.name,
            content=p.content, created_at=p.created_at))

    moderation_reports = db.query(models.SeverityReport).filter_by(reporter_id=user_id).count()

    return schemas.AdminMemberProfileOut(
        id=user.id, name=user.name, email=user.email, age=user.age,
        role=user.role, created_at=user.created_at,
        bio=profile.bio if profile else "",
        location=profile.location if profile else "",
        interests=profile.interests if profile else "",
        concerns=profile.concerns if profile else "",
        communities=community_names,
        total_posts=total_posts,
        total_mood_entries=total_moods,
        total_activities=total_activities,
        recent_moods=recent_moods,
        recent_posts=recent_posts,
        moderation_reports=moderation_reports,
    )


@router.get("/activity-feed", response_model=list[schemas.ActivityFeedItem],
            summary="Chronological platform activity feed (admin)")
def activity_feed(limit: int = Query(default=50, ge=1, le=200),
                  admin: models.User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    items: list[schemas.ActivityFeedItem] = []

    # New registrations
    for u in db.query(models.User).order_by(models.User.created_at.desc()).limit(50).all():
        items.append(schemas.ActivityFeedItem(
            id=f"reg-{u.id}", event_type="registration",
            actor_name=u.name, actor_id=u.id,
            description=f"{u.name} joined InnerBloom",
            created_at=u.created_at))

    # Community posts
    for p in db.query(models.Post).order_by(models.Post.created_at.desc()).limit(100).all():
        author = db.query(models.User).filter_by(id=p.author_id).first()
        community = db.query(models.Community).filter_by(id=p.community_id).first()
        if author and community:
            items.append(schemas.ActivityFeedItem(
                id=f"post-{p.id}", event_type="post",
                actor_name=author.name, actor_id=author.id,
                description=f"Posted in {community.name}: \"{p.content[:80]}{'...' if len(p.content) > 80 else ''}\"",
                community_name=community.name,
                created_at=p.created_at))

    # Peer connections
    for pc in (db.query(models.PeerConnection)
               .order_by(models.PeerConnection.created_at.desc()).limit(50).all()):
        requester = db.query(models.User).filter_by(id=pc.requester_id).first()
        peer = db.query(models.User).filter_by(id=pc.peer_id).first()
        if requester and peer:
            items.append(schemas.ActivityFeedItem(
                id=f"conn-{pc.id}", event_type="connection",
                actor_name=requester.name, actor_id=requester.id,
                description=f"{requester.name} connected with {peer.name}",
                created_at=pc.created_at))

    # Severity reports
    for r in (db.query(models.SeverityReport)
              .order_by(models.SeverityReport.created_at.desc()).limit(50).all()):
        user = db.query(models.User).filter_by(id=r.reporter_id).first()
        items.append(schemas.ActivityFeedItem(
            id=f"report-{r.id}", event_type="report",
            actor_name=user.name if user else "Anonymous",
            actor_id=user.id if user else "",
            description=f"Support request submitted (level: {r.concern_level})",
            created_at=r.created_at))

    # Sort all by time descending, return top N
    items.sort(key=lambda x: x.created_at, reverse=True)
    return items[:limit]


@router.get("/insights/members", response_model=list[schemas.MemberInsight],
            summary="AI behavioural insights for members (statistical, admin)")
def member_insights(limit: int = Query(default=50, ge=1, le=100),
                    admin: models.User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    """
    Transparent statistical trend analysis on self-reported mood data.
    No diagnosis, no inference from private messages, no facial data.
    Requires >= 4 mood entries before generating a trend.
    """
    MIN_DATA_POINTS = 4
    now = _utcnow()
    cutoff_7d = now - timedelta(days=7)
    cutoff_14d = now - timedelta(days=14)

    users = db.query(models.User).filter_by(role="user").limit(limit).all()
    insights: list[schemas.MemberInsight] = []

    for user in users:
        all_moods = (db.query(models.MoodRecord).filter_by(user_id=user.id)
                     .order_by(models.MoodRecord.created_at.asc()).all())
        data_points = len(all_moods)

        if data_points < MIN_DATA_POINTS:
            insights.append(schemas.MemberInsight(
                user_id=user.id, name=user.name,
                mood_trend="insufficient_data",
                data_points=data_points,
                explanation=f"Only {data_points} mood entr{'y' if data_points == 1 else 'ies'} recorded. At least {MIN_DATA_POINTS} needed for trend analysis.",
                suggested_action="Encourage the member to track their mood regularly."))
            continue
  
        # Energy trend: compare last 7 days vs prior 7 days
        # Supabase returns timezone-aware datetimes; strip tzinfo for safe comparison
        def _naive(dt: datetime) -> datetime:
            return dt.replace(tzinfo=None) if dt.tzinfo else dt

        cutoff_7d_naive = cutoff_7d.replace(tzinfo=None)
        cutoff_14d_naive = cutoff_14d.replace(tzinfo=None)

        recent_moods = [m for m in all_moods if _naive(m.created_at) >= cutoff_7d_naive]
        prior_moods = [m for m in all_moods
                       if cutoff_14d_naive <= _naive(m.created_at) < cutoff_7d_naive]

        recent_energies = [m.energy_level for m in recent_moods if m.energy_level is not None]
        prior_energies = [m.energy_level for m in prior_moods if m.energy_level is not None]
        all_energies = [m.energy_level for m in all_moods if m.energy_level is not None]

        avg_energy = round(sum(all_energies) / len(all_energies), 2) if all_energies else None

        energy_delta: float | None = None
        if recent_energies and prior_energies:
            avg_recent = sum(recent_energies) / len(recent_energies)
            avg_prior = sum(prior_energies) / len(prior_energies)
            energy_delta = round(avg_recent - avg_prior, 2)

        # Determine trend
        if energy_delta is None:
            # Fall back to overall slope across all data
            if len(all_energies) >= MIN_DATA_POINTS:
                n = len(all_energies)
                xs = list(range(n))
                mean_x = sum(xs) / n
                mean_y = sum(all_energies) / n
                numerator = sum((xs[i] - mean_x) * (all_energies[i] - mean_y) for i in range(n))
                denominator = sum((xs[i] - mean_x) ** 2 for i in range(n)) or 1
                slope = numerator / denominator
                if slope > 0.1:
                    mood_trend = "improving"
                    explanation = "Energy levels show a gradual upward trend across all recorded entries."
                    suggested_action = "Continue current support approach."
                elif slope < -0.1:
                    mood_trend = "declining"
                    explanation = "Energy levels show a gradual downward trend across recorded entries."
                    suggested_action = "Consider reaching out to check in with this member."
                else:
                    mood_trend = "stable"
                    explanation = "Energy levels are consistent across recorded entries."
                    suggested_action = "No immediate action required."
            else:
                mood_trend = "insufficient_data"
                explanation = "Insufficient recent data for a 7-day comparison."
                suggested_action = "Encourage regular mood tracking."
        elif energy_delta > 0.5:
            mood_trend = "improving"
            explanation = f"Average energy increased by {energy_delta:.1f} points comparing last 7 days to the prior 7 days."
            suggested_action = "Positive trend observed. No immediate action required."
        elif energy_delta < -0.5:
            mood_trend = "declining"
            explanation = f"Average energy decreased by {abs(energy_delta):.1f} points comparing last 7 days to the prior 7 days."
            suggested_action = "Consider a check-in message or additional support resources."
        else:
            mood_trend = "stable"
            explanation = f"Energy levels are stable (delta: {energy_delta:+.1f}) between the last 7 days and prior 7 days."
            suggested_action = "No immediate action required."

        # Community participation trend
        recent_posts = db.query(models.Post).filter(
            models.Post.author_id == user.id,
            models.Post.created_at >= cutoff_7d_naive).count()

        # Last active
        last_mood = _naive(all_moods[-1].created_at) if all_moods else None
        last_post_row = (db.query(models.Post).filter_by(author_id=user.id)
                         .order_by(models.Post.created_at.desc()).first())
        last_post_time = _naive(last_post_row.created_at) if last_post_row else None
        candidates = [t for t in [last_mood, last_post_time] if t is not None]
        last_active = max(candidates) if candidates else None

        participation_trend = "active" if recent_posts > 0 else "inactive"

        insights.append(schemas.MemberInsight(
            user_id=user.id, name=user.name,
            mood_trend=mood_trend,
            avg_energy=avg_energy,
            energy_delta=energy_delta,
            participation_trend=participation_trend,
            last_active=last_active,
            explanation=explanation,
            suggested_action=suggested_action,
            data_points=data_points,
        ))

    # Prioritize declining trends first
    priority = {"declining": 0, "insufficient_data": 1, "stable": 2, "improving": 3}
    insights.sort(key=lambda x: priority.get(x.mood_trend, 9))
    return insights


@router.get("/insights/communities", response_model=list[schemas.CommunityInsightOut],
            summary="Community engagement insights (admin)")
def community_insights(admin: models.User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    communities = db.query(models.Community).all()
    now = _utcnow()
    cutoff_7d = now - timedelta(days=7)
    cutoff_14d = now - timedelta(days=14)
    results: list[schemas.CommunityInsightOut] = []

    for c in communities:
        member_count = db.query(models.CommunityMember).filter_by(community_id=c.id).count()
        post_count_7d = db.query(models.Post).filter(
            models.Post.community_id == c.id,
            models.Post.created_at >= cutoff_7d.replace(tzinfo=None)).count()
        post_count_prev = db.query(models.Post).filter(
            models.Post.community_id == c.id,
            models.Post.created_at >= cutoff_14d.replace(tzinfo=None),
            models.Post.created_at < cutoff_7d.replace(tzinfo=None)).count()
        pending = db.query(models.SeverityReport).filter_by(status="open").count()

        if post_count_7d == 0 and post_count_prev == 0:
            engagement_trend = "insufficient_data"
            explanation = "No posts recorded in the past 14 days."
        elif post_count_prev == 0:
            engagement_trend = "increasing"
            explanation = f"New activity this week ({post_count_7d} posts) after a quiet prior week."
        else:
            ratio = post_count_7d / post_count_prev
            if ratio >= 1.2:
                engagement_trend = "increasing"
                explanation = f"Post volume increased from {post_count_prev} to {post_count_7d} week-over-week (+{round((ratio-1)*100)}%)."
            elif ratio <= 0.8:
                engagement_trend = "decreasing"
                explanation = f"Post volume decreased from {post_count_prev} to {post_count_7d} week-over-week ({round((1-ratio)*100)}% drop)."
            else:
                engagement_trend = "stable"
                explanation = f"Post volume is consistent: {post_count_prev} → {post_count_7d} posts week-over-week."

        needs_attention = (engagement_trend == "decreasing" and member_count > 0) or pending > 2

        results.append(schemas.CommunityInsightOut(
            community_id=c.id, community_name=c.name,
            member_count=member_count,
            post_count_7d=post_count_7d, post_count_prev_7d=post_count_prev,
            engagement_trend=engagement_trend,
            pending_reports=pending,
            needs_attention=needs_attention,
            explanation=explanation,
        ))

    return results

