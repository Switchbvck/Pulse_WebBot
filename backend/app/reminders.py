"""Scheduled reminder job: notifies patients 24h and 2h before their visit."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models import Booking, BookingStatus
from app.notify import bot_username, send_telegram_message

logger = logging.getLogger(__name__)

# (window before the visit, Booking flag, message template).
# A reminder fires while the remaining time is inside [offset-30min, offset].
REMINDER_OFFSETS = (
    (
        timedelta(hours=24),
        "reminder_24h_sent",
        "⏰ Reminder: your {title} session at Pulse is tomorrow at {time}. See you soon!",
    ),
    (
        timedelta(hours=2),
        "reminder_2h_sent",
        "⏰ Your {title} session at Pulse starts in about 2 hours ({time}).",
    ),
)
FIRE_WINDOW = timedelta(minutes=30)


async def send_due_reminders() -> int:
    """Deliver due reminders; flags are set regardless of delivery (at-most-once)."""
    now = datetime.now()
    due: list[tuple[int, int, str, str]] = []
    with SessionLocal() as db:
        bookings = db.scalars(
            select(Booking)
            .options(selectinload(Booking.service))
            .where(Booking.status == BookingStatus.CONFIRMED.value)
        ).all()
        for booking in bookings:
            appointment = datetime.fromisoformat(f"{booking.date}T{booking.time_slot}")
            remaining = appointment - now
            for offset, flag, template in REMINDER_OFFSETS:
                if getattr(booking, flag):
                    continue
                if offset - FIRE_WINDOW <= remaining <= offset:
                    text = template.format(
                        title=booking.service.title if booking.service else "Pulse",
                        time=booking.time_slot,
                    )
                    due.append((booking.id, booking.user_telegram_id, flag, text))

    sent = 0
    for booking_id, chat_id, flag, text in due:
        delivered = await send_telegram_message(
            chat_id, text, reply_markup=_reminder_keyboard(booking_id)
        )
        with SessionLocal() as db:
            booking = db.get(Booking, booking_id)
            if booking is not None:
                setattr(booking, flag, True)
                db.commit()
        sent += 1
        logger.info("Reminder for booking %s %s", booking_id, "delivered" if delivered else "not delivered")
    return sent


def _reminder_keyboard(booking_id: int) -> dict | None:
    """Inline Confirm / Reschedule buttons under a reminder message."""
    buttons: list[dict] = [{"text": "✅ Confirm", "callback_data": f"confirm:{booking_id}"}]
    username = bot_username()
    if username:
        buttons.append(
            {"text": "📅 Reschedule", "url": f"https://t.me/{username}?startapp=apt:{booking_id}"}
        )
    return {"inline_keyboard": [buttons]}
