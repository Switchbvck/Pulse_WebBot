"""Booking CRUD: create, list, cancel, reschedule."""

from __future__ import annotations

import logging
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import CurrentUser, get_current_user
from app.models import Booking, BookingStatus, Review, Service, Slot
from app.ratelimit import limit_booking
from app.schedule import covered_times
from app.schemas import BookingCreate, BookingOut, RescheduleRequest, ReviewCreate, ReviewOut

router = APIRouter(tags=["bookings"])
logger = logging.getLogger(__name__)


def _ensure_not_past(date_str: str, time_slot: str) -> None:
    today_iso = date.today().isoformat()
    if date_str < today_iso:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot book a date in the past")
    if date_str == today_iso and time_slot <= datetime.now().strftime("%H:%M"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot book a slot in the past")


def _get_slot_or_404(db: Session, date_str: str, time_slot: str) -> Slot:
    slot = db.scalar(select(Slot).where(Slot.date == date_str, Slot.time_slot == time_slot))
    if slot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Slot not found for this date and time")
    return slot


def _covered_slots_or_409(
    db: Session, date_str: str, start: str, duration_minutes: int
) -> list[Slot]:
    """Every grid slot the appointment spans; 409 when the grid ends early."""
    times = covered_times(start, duration_minutes)
    slots = db.scalars(
        select(Slot).where(Slot.date == date_str, Slot.time_slot.in_(times))
    ).all()
    if len(slots) != len(times):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This appointment would run past the clinic's opening hours — pick an earlier slot",
        )
    return list(slots)


def _claim_slots(db: Session, slots: list[Slot]) -> None:
    """Atomically claim the whole range: 409 (with rollback) if any is taken."""
    slot_ids = [slot.id for slot in slots]
    result = db.execute(
        update(Slot)
        .where(Slot.id.in_(slot_ids), Slot.is_available.is_(True))
        .values(is_available=False)
    )
    if result.rowcount != len(slot_ids):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This slot is no longer available")


def _release_slots(db: Session, date_str: str, start: str, duration_minutes: int) -> None:
    """Re-open the range's slots (past times stay closed)."""
    today_iso = date.today().isoformat()
    if date_str < today_iso or (
        date_str == today_iso and start <= datetime.now().strftime("%H:%M")
    ):
        return
    db.execute(
        update(Slot)
        .where(Slot.date == date_str, Slot.time_slot.in_(covered_times(start, duration_minutes)))
        .values(is_available=True)
    )


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(
    user_id: int | None = Query(default=None, ge=1),
    booking_date: str | None = Query(default=None, alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[BookingOut]:
    """Bookings; omitting `user_id` (full schedule) requires an admin."""
    if user_id is None and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    if not user.anonymous and not user.is_admin and user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own bookings")

    statement = (
        select(Booking)
        .options(selectinload(Booking.service))
        .order_by(Booking.date, Booking.time_slot)
    )
    if user_id is not None:
        statement = statement.where(Booking.user_telegram_id == user_id)
    if booking_date is not None:
        statement = statement.where(Booking.date == booking_date)
    return list(db.scalars(statement).all())


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(limit_booking)])
def create_booking(
    payload: BookingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Booking:
    """Create a booking and atomically claim its slot range."""
    if user.id is not None:
        # Signed callers book under their own identity (anti-spoofing).
        payload = payload.model_copy(update={"user_telegram_id": user.id, "user_name": user.name})

    service = db.get(Service, payload.service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    _ensure_not_past(payload.date, payload.time_slot)

    _get_slot_or_404(db, payload.date, payload.time_slot)  # 404 when the start slot is missing
    covered = _covered_slots_or_409(db, payload.date, payload.time_slot, service.duration)
    _claim_slots(db, covered)

    booking = Booking(
        user_telegram_id=payload.user_telegram_id,
        user_name=payload.user_name,
        service_id=payload.service_id,
        date=payload.date,
        time_slot=payload.time_slot,
        duration=service.duration,
        status=BookingStatus.CONFIRMED.value,
    )
    db.add(booking)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race at uq_active_booking_slot; rollback also undoes the claim.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This slot is no longer available"
        ) from None
    db.refresh(booking)
    logger.info("Booking created: id=%s user=%s slot=%s %s", booking.id, booking.user_telegram_id, booking.date, booking.time_slot)

    from app.notify import notify_booking_created

    background_tasks.add_task(notify_booking_created, booking.id)
    return booking


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Booking:
    """Cancel a booking and release its slot."""
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if not user.anonymous and not user.is_admin and booking.user_telegram_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only cancel your own bookings")
    if booking.status == BookingStatus.COMPLETED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Completed bookings cannot be cancelled")

    if booking.status != BookingStatus.CANCELLED.value:
        booking.status = BookingStatus.CANCELLED.value
        _release_slots(db, booking.date, booking.time_slot, booking.duration)
        db.commit()
        db.refresh(booking)
        logger.info("Booking cancelled: id=%s", booking.id)
        from app.routers.waitlist import notify_waitlist_openings

        background_tasks.add_task(notify_waitlist_openings, booking.date)
    return booking


@router.post("/bookings/{booking_id}/review", response_model=ReviewOut,
             status_code=status.HTTP_201_CREATED)
def create_review(
    booking_id: int,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Review:
    """Rate a completed visit (one review per booking, after it happened)."""
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if not user.anonymous and not user.is_admin and booking.user_telegram_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only rate your own visits")
    appointment = datetime.fromisoformat(f"{booking.date}T{booking.time_slot}")
    if booking.status != BookingStatus.COMPLETED.value and appointment > datetime.now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can rate a visit after it happens")
    if booking.review is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This visit has already been rated")

    review = Review(
        booking_id=booking.id,
        user_telegram_id=booking.user_telegram_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    logger.info("Review added: booking=%s rating=%s", booking_id, payload.rating)
    return review


@router.post("/bookings/{booking_id}/reschedule", response_model=BookingOut)
def reschedule_booking(
    booking_id: int,
    payload: RescheduleRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Booking:
    """Move a booking to another date/time slot."""
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if not user.anonymous and not user.is_admin and booking.user_telegram_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only reschedule your own bookings")
    if booking.status == BookingStatus.COMPLETED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Completed bookings cannot be rescheduled")
    if booking.status == BookingStatus.CANCELLED.value:
        # Rescheduling would reset status to Confirmed (resurrection).
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Cancelled bookings cannot be rescheduled — book a new visit"
        )
    _ensure_not_past(payload.date, payload.time_slot)

    _get_slot_or_404(db, payload.date, payload.time_slot)
    same_slot = payload.date == booking.date and payload.time_slot == booking.time_slot
    freed_old_date = None
    if not same_slot:
        # Use the duration snapshot, not the service's current length.
        covered = _covered_slots_or_409(db, payload.date, payload.time_slot, booking.duration)
        _claim_slots(db, covered)
        old_date = booking.date
        _release_slots(db, old_date, booking.time_slot, booking.duration)
        freed_old_date = old_date

    booking.date = payload.date
    booking.time_slot = payload.time_slot
    booking.status = BookingStatus.CONFIRMED.value
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This slot is no longer available"
        ) from None
    db.refresh(booking)
    logger.info("Booking rescheduled: id=%s -> %s %s", booking.id, booking.date, booking.time_slot)
    if freed_old_date is not None:
        from app.routers.waitlist import notify_waitlist_openings

        background_tasks.add_task(notify_waitlist_openings, freed_old_date)
    return booking
