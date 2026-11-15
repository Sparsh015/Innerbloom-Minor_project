"""Severity/concern reports: users submit; admins review. Neutral, non-diagnostic."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import schemas
from app.core.dependencies import require_user
from app.db import models
from app.db.database import get_db

router = APIRouter(tags=["reports"])


def report_out(report: models.SeverityReport, user: models.User | None = None):
    """Serialise a request, optionally attaching the submitting member's identity."""
    return schemas.SeverityReportOut(
        id=report.id,
        request_type=report.request_type,
        concern_level=report.concern_level,
        title=report.title,
        category=report.category,
        description=report.description,
        preferred_date=report.preferred_date,
        preferred_time=report.preferred_time,
        duration_minutes=report.duration_minutes,
        location_pref=report.location_pref,
        notes=report.notes,
        admin_response=report.admin_response,
        status=report.status,
        created_at=report.created_at,
        updated_at=report.updated_at,
        reporter_name=user.name if user else None,
        reporter_email=user.email if user else None,
    )


@router.post("/api/reports/severity", response_model=schemas.SeverityReportOut,
             status_code=status.HTTP_201_CREATED,
             summary="Submit a support, activity or technical request")
def submit_report(payload: schemas.SeverityReportCreate,
                  current: models.User = Depends(require_user),
                  db: Session = Depends(get_db)):
    report = models.SeverityReport(
        reporter_id=current.id,
        request_type=payload.request_type,
        concern_level=payload.concern_level,
        title=payload.title.strip(),
        category=payload.category.strip() or "other",
        description=payload.description.strip(),
        preferred_date=payload.preferred_date.strip(),
        preferred_time=payload.preferred_time.strip(),
        duration_minutes=payload.duration_minutes,
        location_pref=payload.location_pref.strip(),
        notes=payload.notes.strip(),
        status="open",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report_out(report)


@router.get("/api/reports/mine", response_model=list[schemas.SeverityReportOut],
            summary="My submitted requests")
def my_reports(current: models.User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (db.query(models.SeverityReport).filter_by(reporter_id=current.id)
            .order_by(models.SeverityReport.created_at.desc()).all())
    return [report_out(r) for r in rows]
