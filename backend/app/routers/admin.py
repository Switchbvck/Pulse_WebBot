"""Admin endpoints: overview metrics, analytics, reviews, CSV, slots."""

from __future__ import annotations

import csv
import io
import logging
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import REVENUE_WINDOW_DAYS
from app.database import get_db
from app.deps import require_admin
from app.models import Booking, BookingStatus, Review, Service, Slot
from app.schemas import AdminOverview, ReviewAdminOut, SlotOut, SlotToggle

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


@router.get("/overview", response_model=AdminOverview)
def overview(db: Session = Depends(get_db)) -> AdminOverview:
    """Headline metrics: bookings today, revenue, clients, average rating."""
    today_iso = date.today().isoformat()
    window_end = (date.today() + timedelta(days=REVENUE_WINDOW_DAYS)).isoformat()

    total_bookings_today = db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.date == today_iso, Booking.status != BookingStatus.CANCELLED.value)
    )

    revenue_rows = db.execute(
        select(Service.price)
        .join(Booking, Booking.service_id == Service.id)
        .where(
            Booking.status == BookingStatus.CONFIRMED.value,
            Booking.date >= today_iso,
            Booking.date <= window_end,
        )
    ).all()
    estimated_revenue = float(sum(price for (price,) in revenue_rows))

    active_clients = db.scalar(
        select(func.count(func.distinct(Booking.user_telegram_id))).where(
            Booking.status != BookingStatus.CANCELLED.value
        )
    )

    average_rating = db.scalar(select(func.avg(Review.rating)))

    return AdminOverview(
        total_bookings_today=int(total_bookings_today or 0),
        estimated_revenue=estimated_revenue,
        active_clients=int(active_clients or 0),
        average_rating=round(float(average_rating), 2) if average_rating is not None else None,
    )


@router.get("/analytics")
def analytics(
    days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
) -> dict:
    """Bookings per day around today (past and upcoming) and top services."""
    today = date.today()
    start = today - timedelta(days=days - 1)
    end = today + timedelta(days=days - 1)
    counts: dict[str, int] = {
        (start + timedelta(days=offset)).isoformat(): 0 for offset in range(2 * days - 1)
    }
    rows = db.execute(
        select(Booking.date, func.count())
        .where(
            Booking.status != BookingStatus.CANCELLED.value,
            Booking.date >= start.isoformat(),
            Booking.date <= end.isoformat(),
        )
        .group_by(Booking.date)
    ).all()
    for booking_date, count in rows:
        if booking_date in counts:
            counts[booking_date] = int(count)

    top_rows = db.execute(
        select(Service.title, func.count(Booking.id))
        .join(Booking, Booking.service_id == Service.id)
        .where(Booking.status != BookingStatus.CANCELLED.value)
        .group_by(Service.title)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
    ).all()

    return {
        "bookings_per_day": [{"date": day, "count": count} for day, count in counts.items()],
        "top_services": [{"title": title, "count": int(count)} for title, count in top_rows],
    }


@router.get("/reviews", response_model=list[ReviewAdminOut])
def list_reviews(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[ReviewAdminOut]:
    """Latest reviews with patient and service context."""
    rows = db.execute(
        select(Review, Booking)
        .join(Booking, Review.booking_id == Booking.id, isouter=True)
        .order_by(Review.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ReviewAdminOut(
            id=review.id,
            booking_id=review.booking_id,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
            user_name=booking.user_name if booking else None,
            service_title=booking.service_title if booking else None,
        )
        for review, booking in rows
    ]


def _csv_safe(value: str | None) -> str | None:
    """Neutralize Excel formula injection via =, +, -, @ leading characters."""
    if value and value[0] in {"=", "+", "-", "@"}:
        return f"'{value}"
    return value


@router.get("/bookings.csv")
def bookings_csv(db: Session = Depends(get_db)) -> Response:
    """Every booking as a CSV download."""
    bookings = db.scalars(
        select(Booking)
        .options(selectinload(Booking.service))
        .order_by(Booking.created_at.desc())
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["id", "user_telegram_id", "user_name", "service", "date", "time_slot", "status", "created_at"]
    )
    for booking in bookings:
        writer.writerow(
            [
                booking.id,
                booking.user_telegram_id,
                _csv_safe(booking.user_name),
                _csv_safe(booking.service_title),
                booking.date,
                booking.time_slot,
                booking.status,
                booking.created_at.isoformat(),
            ]
        )
    logger.info("Bookings CSV exported (%s rows)", len(bookings))
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pulse-bookings.csv"},
    )


@router.get("/slots", response_model=list[SlotOut])
def list_slots(
    booking_date: str = Query(alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
) -> list[SlotOut]:
    """The full slot grid for a day, including disabled slots."""
    statement = (
        select(Slot).where(Slot.date == booking_date).order_by(Slot.time_slot)
    )
    return list(db.scalars(statement).all())


@router.patch("/slots/{slot_id}", response_model=SlotOut)
def toggle_slot(
    slot_id: int,
    payload: SlotToggle,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Slot:
    """Enable or disable a single time slot."""
    slot = db.get(Slot, slot_id)
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slot not found")

    was_available = slot.is_available
    if payload.is_available:
        occupied = db.scalar(
            select(Booking.id).where(
                Booking.date == slot.date,
                Booking.time_slot == slot.time_slot,
                Booking.status == BookingStatus.CONFIRMED.value,
            )
        )
        if occupied is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Slot is occupied by an active booking and cannot be re-opened",
            )

    slot.is_available = payload.is_available
    db.commit()
    db.refresh(slot)
    if payload.is_available and not was_available:
        from app.routers.waitlist import notify_waitlist_openings

        background_tasks.add_task(notify_waitlist_openings, slot.date)
    return slot
