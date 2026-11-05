"""Waiting list: patients subscribe to a day and get pinged when slots open."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import CurrentUser, get_current_user
from app.models import Slot, WaitlistEntry
from app.notify import bot_username, send_telegram_message
from app.schemas import WaitlistJoin, WaitlistOut

router = APIRouter(tags=["waitlist"])
logger = logging.getLogger(__name__)


@router.post("/waitlist", response_model=WaitlistOut, status_code=status.HTTP_201_CREATED)
def join_waitlist(
    payload: WaitlistJoin,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> WaitlistEntry:
    """Subscribe to slot-opening notifications for one day."""
    if user.id is not None:
        payload = payload.model_copy(
            update={"user_telegram_id": user.id, "user_name": user.name}
        )
    if payload.user_telegram_id is None or not payload.user_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User identity is required")

    if payload.date < date.today().isoformat():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot join the waitlist for a past day")

    duplicate = db.scalar(
        select(WaitlistEntry.id).where(
            WaitlistEntry.user_telegram_id == payload.user_telegram_id,
            WaitlistEntry.date == payload.date,
        )
    )
    if duplicate is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already on the waitlist for this day")

    entry = WaitlistEntry(
        user_telegram_id=payload.user_telegram_id,
        user_name=payload.user_name,
        date=payload.date,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info("Waitlist join: user=%s date=%s", entry.user_telegram_id, entry.date)
    return entry


@router.get("/waitlist", response_model=list[WaitlistOut])
def my_waitlist(
    user_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[WaitlistOut]:
    """Waitlist entries, scoped like bookings (own by default, all for admins)."""
    if user_id is None and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required")
    if not user.anonymous and not user.is_admin and user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own waitlist")

    statement = select(WaitlistEntry).order_by(WaitlistEntry.date)
    if user_id is not None:
        statement = statement.where(WaitlistEntry.user_telegram_id == user_id)
    return list(db.scalars(statement).all())


@router.delete("/waitlist/{entry_id}")
def leave_waitlist(
    entry_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    entry = db.get(WaitlistEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Waitlist entry not found")
    if not user.anonymous and not user.is_admin and entry.user_telegram_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only remove your own entries")
    db.delete(entry)
    db.commit()
    return {"ok": True}


async def notify_waitlist_openings(date_iso: str) -> None:
    """Ping the day's subscribers once, then remove the entries (no spam)."""
    with SessionLocal() as db:
        entries = db.scalars(
            select(WaitlistEntry).where(WaitlistEntry.date == date_iso)
        ).all()
        if not entries:
            return
        open_slots = db.scalars(
            select(Slot.time_slot).where(
                Slot.date == date_iso, Slot.is_available.is_(True)
            )
        ).all()

    if not open_slots:
        return

    shown = ", ".join(sorted(open_slots)[:3])
    extra = f" (+{len(open_slots) - 3} more)" if len(open_slots) > 3 else ""
    username = bot_username()
    keyboard = None
    if username:
        keyboard = {
            "inline_keyboard": [
                [{"text": "📅 Book now", "url": f"https://t.me/{username}?startapp=day:{date_iso}"}]
            ]
        }

    text = (
        f"🎉 Good news! New slots just opened on {date_iso}: {shown}{extra}."
    )
    for entry in entries:
        delivered = await send_telegram_message(entry.user_telegram_id, text, reply_markup=keyboard)
        logger.info(
            "Waitlist ping: user=%s date=%s (%s)",
            entry.user_telegram_id,
            date_iso,
            "delivered" if delivered else "not delivered",
        )

    with SessionLocal() as db:
        db.execute(
            delete(WaitlistEntry).where(
                WaitlistEntry.user_telegram_id.in_([entry.user_telegram_id for entry in entries]),
                WaitlistEntry.date == date_iso,
            )
        )
        db.commit()
