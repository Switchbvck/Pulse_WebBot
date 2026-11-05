"""Service catalog and public slot availability."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SLOT_STEP_MINUTES
from app.database import get_db
from app.deps import get_current_user
from app.models import Booking, Review, Service, Slot
from app.schedule import covered_times, get_holidays, get_rules
from app.schemas import ServiceOut, ServiceReviewOut

router = APIRouter(tags=["services"])


@router.get("/me")
def me(user=Depends(get_current_user)) -> dict:
    """Who the server thinks the caller is (drives the admin tab honestly)."""
    return {
        "id": user.id,
        "name": user.name,
        "is_admin": user.is_admin,
        "anonymous": user.anonymous,
    }


@router.get("/services", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)) -> list[ServiceOut]:
    """All active bookable Pulse services."""
    return list(db.scalars(select(Service).where(Service.is_active.is_(True))).all())


@router.get("/schedule")
def public_schedule(db: Session = Depends(get_db)) -> dict:
    """Working hours and holidays, for disabling day chips in the UI."""
    weekdays = [
        {
            "weekday": rule.weekday,
            "is_open": rule.is_open,
            "start_time": rule.start_time,
            "end_time": rule.end_time,
        }
        for _, rule in sorted(get_rules(db).items())
    ]
    holidays = [
        {"date": day, "note": note} for day, note in sorted(get_holidays(db).items())
    ]
    return {"weekdays": weekdays, "holidays": holidays}


@router.get("/slots", response_model=list[str])
def list_available_slots(
    booking_date: str = Query(alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    service_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[str]:
    """Bookable "HH:MM" starts for a day (past times hidden for today).

    With `service_id` a start is listed only when the whole appointment
    range fits into free grid time; otherwise the 30-minute step is assumed.
    """
    duration = SLOT_STEP_MINUTES
    if service_id is not None:
        service = db.get(Service, service_id)
        if service is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
        duration = service.duration

    availability = {
        slot.time_slot: slot.is_available
        for slot in db.scalars(select(Slot).where(Slot.date == booking_date)).all()
    }
    now_hm = datetime.now().strftime("%H:%M") if booking_date == date.today().isoformat() else None
    return [
        start
        for start in sorted(availability)
        if availability[start]
        and (now_hm is None or start > now_hm)
        and all(availability.get(c, False) for c in covered_times(start, duration))
    ]


def _public_name(full_name: str | None) -> str | None:
    """First name + last initial — reviews are public, full names are not."""
    if not full_name:
        return None
    parts = full_name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


@router.get("/services/{service_id}/reviews", response_model=list[ServiceReviewOut])
def service_reviews(
    service_id: int,
    db: Session = Depends(get_db),
) -> list[ServiceReviewOut]:
    """Latest public reviews for one service."""
    rows = db.execute(
        select(Review, Booking.user_name)
        .join(Booking, Review.booking_id == Booking.id)
        .where(Booking.service_id == service_id)
        .order_by(Review.created_at.desc())
        .limit(5)
    ).all()
    return [
        ServiceReviewOut(
            rating=review.rating,
            comment=review.comment,
            user_name=_public_name(name),
            created_at=review.created_at,
        )
        for review, name in rows
    ]
