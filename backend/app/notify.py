"""Telegram notifications sent server-side via the Bot API.

Delivery is best-effort: failures are logged and never break the API flow.
Reminder flags are set regardless of delivery (at-most-once semantics).
"""

from __future__ import annotations

import functools
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import ADMIN_CHAT_ID, BOT_API_BASE, BOT_TOKEN
from app.database import SessionLocal
from app.models import Booking

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=1)
def bot_username() -> str | None:
    """Bot username from getMe, cached for the process lifetime."""
    if not BOT_TOKEN:
        return None
    try:
        response = httpx.get(f"{BOT_API_BASE}/bot{BOT_TOKEN}/getMe", timeout=5)
        return response.json().get("result", {}).get("username")
    except Exception as exc:
        # No exc_info — the URL in the traceback carries the bot token.
        logger.warning("getMe failed (%s) — deep-link buttons unavailable", type(exc).__name__)
        return None


async def send_telegram_message(
    chat_id: int, text: str, reply_markup: dict | None = None
) -> bool:
    """Post a message as the bot; returns True on delivery."""
    if not BOT_TOKEN or not chat_id:
        return False
    body: dict = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        body["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{BOT_API_BASE}/bot{BOT_TOKEN}/sendMessage", json=body
            )
            if response.status_code != 200:
                logger.warning(
                    "Telegram send to %s failed: %s %s",
                    chat_id,
                    response.status_code,
                    response.text[:200],
                )
                return False
            return True
    except Exception as exc:
        # No exc_info: exception text embeds the URL, which has the bot token.
        logger.warning(
            "Could not deliver Telegram message to %s (%s: %s)",
            chat_id,
            type(exc).__name__,
            str(exc)[:120],
        )
        return False


def _booking_text(booking: Booking) -> str:
    return (
        f"{booking.service.title}\n"
        f"📅 {booking.date} at {booking.time_slot}"
    )


async def notify_booking_created(booking_id: int) -> None:
    """Confirmation to the patient + instant alert to the clinic chat."""
    with SessionLocal() as db:
        booking = db.scalar(
            select(Booking)
            .options(selectinload(Booking.service))
            .where(Booking.id == booking_id)
        )
        if booking is None:
            return
        details = _booking_text(booking)

    await send_telegram_message(
        booking.user_telegram_id,
        f"✅ Booking confirmed!\n\n{details}\n\nWe will remind you before the visit.",
    )
    if ADMIN_CHAT_ID:
        await send_telegram_message(
            ADMIN_CHAT_ID,
            f"📥 New booking\n\n👤 {booking.user_name}\n{details}",
        )
